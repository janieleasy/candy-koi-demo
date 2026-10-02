import {
  AddEquation, CustomBlending, Mesh, NoBlending, NormalBlending, OneFactor, OneMinusSrcAlphaFactor, OrthographicCamera, Scene, ShaderMaterial, Vector2, Vector3, Vector4,
  WebGLRenderer, ZeroFactor, LinearSRGBColorSpace, Texture, CanvasTexture, LinearFilter, type IUniform, type BufferGeometry, type InstancedBufferGeometry, type Object3D,
} from 'three';
import type { ShowcaseContext } from '@spec/client';
import {
  TIER_SPECS, timelineFor, phaseAt, eventSchedule, shakeAt, flashAt, zoomAt, energy, easeOutBack, easeOutCubic, smoothstep, clamp01, LAYOUT, SKIP_FINALE_MS, isTier,
  type Tier, type ShowEvent,
} from '../timeline';
import { QUALITY_ORDER, FrameGovernor, adjustForFirstFrame, downgrade, paramsFor, type Choice, type Quality, type QualityParams } from '../quality';
import { ShowcaseFallback } from '../errors';
import { showcaseOptions } from '../config';
import * as G from './glsl';
import { loadAssets, FRAME_NAMES, type Assets } from './assets';
import { Tracker, stats } from './tracker';
import { PostFx } from './post';
import { buildKoiBg, buildKoiRing, buildParticles, buildRays, eventSlots, instancedFrom, mulberry32, quadGrid } from './build';
import { makeBadge, makeNumberSheet } from './text';

const W = 1080, H = 1920;
const hex = (c: string) => { const n = parseInt(c.slice(1), 16); return new Vector3(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); };
const NEVER = 1e9;
const HERO_C = new Vector2(0, LAYOUT.hero);

/** 阻止悬空的 renderer 引用:Session 只在 run 内持有 */
export class Session {
  private tr = new Tracker();
  private renderer: WebGLRenderer | null = null;
  private disposed = false;
  private raf = 0;
  private failFn: ((e: unknown) => void) | null = null;
  private cleanup: (() => void)[] = [];
  /** 供外部(测试 / 看门狗)调用的幂等销毁 */
  dispose() {
    if (this.disposed) return; this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const f of this.cleanup.splice(0)) { try { f(); } catch { /* ignore */ } }
    const r = this.renderer; const canvas = r?.domElement;
    if (r) { try { stats.lastInfo = { geometries: 0, textures: 0, programs: 0 }; this.tr.disposeAll(r as unknown as { dispose(): void }); const i = r.info; stats.lastInfo = { geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0 }; } catch { /* ignore */ } }
    else this.tr.disposeAll();
    if (r) { try { r.setRenderTarget(null); r.dispose(); stats.disposed.renderer++; r.forceContextLoss(); } catch { /* ignore */ } this.renderer = null; }
    if (canvas) { try { canvas.remove(); } catch { /* ignore */ } stats.canvasesLive = Math.max(0, stats.canvasesLive - 1); }
    stats.disposedSessions++; stats.lastDispose = performance.now();
  }

  constructor(private ctx: ShowcaseContext, private choice: Choice) { stats.sessions++; }

  async run(): Promise<void> {
    const { ctx, choice } = this; const tier: Tier = isTier(ctx.tier) ? ctx.tier : 'big';
    const spec = TIER_SPECS[tier]; const D = ctx.durationMs; const tl = timelineFor(tier, D);
    const reduced = choice.reducedMotion; const forced = !!showcaseOptions.forcedQuality;
    let quality: Quality = choice.quality; let params: QualityParams = paramsFor(quality, reduced);
    const rng = mulberry32(0x5eed + tier.length * 131 + Math.round(ctx.amount) % 9973);

    // ── 1 素材(按档位分批) ──
    const hiTitle = quality === 'high' && (window.devicePixelRatio || 1) >= 1.5;
    let A: Assets;
    try { A = await loadAssets(this.tr, { art: spec.art, tier, hiTitle, vecScale: quality === 'high' ? 1 : 0.75, titleText: spec.title, timeoutMs: 6000 }); }
    catch (e) { this.dispose(); throw new ShowcaseFallback('assets:' + (e as Error).message); }
    if (ctx.skip.aborted || this.disposed) { this.dispose(); return; }

    // ── 2 renderer / 场景 ──
    const canvas = ctx.canvas;
    stats.canvasesLive++;
    let r: WebGLRenderer;
    try {
      r = new WebGLRenderer({ canvas, antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: showcaseOptions.debug });
    } catch (e) { this.dispose(); throw new ShowcaseFallback('webgl:' + (e as Error).message); }
    this.renderer = r; stats.created.renderer++;
    r.outputColorSpace = LinearSRGBColorSpace; r.setClearColor(0x000000, 0); r.setPixelRatio(1);
    const onLost = (ev: Event) => { ev.preventDefault(); if (this.failFn) this.failFn(new ShowcaseFallback('context-lost')); else this.dispose(); };
    canvas.addEventListener('webglcontextlost', onLost); this.cleanup.push(() => canvas.removeEventListener('webglcontextlost', onLost));

    const scene = new Scene();
    const cam = new OrthographicCamera(-W / 2, W / 2, H / 2, -H / 2, -10, 10);
    cam.position.z = 5;
    const tr = this.tr;
    const events: ShowEvent[] = eventSchedule(tier, D, reduced);
    const slots = eventSlots(events, spec, LAYOUT.hero);

    // 共享 uniform
    const U = {
      uTime: { value: 0 }, uOrigin: { value: HERO_C.clone() },
      uEvT: { value: new Float32Array(8).fill(NEVER) }, uEvP: { value: new Float32Array(8) }, uEvF: { value: new Float32Array(8) }, uEvS: { value: new Float32Array(8) },
      uEvO: { value: Array.from({ length: 8 }, () => new Vector2()) }, uEvC: { value: Array.from({ length: 8 }, () => new Vector2(0.5, 0.5)) },
      uRain: { value: 0 }, uFount: { value: 0 }, uDen: { value: 1 }, uTw: { value: params.twinkle },
    } as Record<string, IUniform>;
    slots.forEach((s, i) => {
      (U.uEvT.value as Float32Array)[i] = s.t; (U.uEvP.value as Float32Array)[i] = s.p; (U.uEvF.value as Float32Array)[i] = s.f; (U.uEvS.value as Float32Array)[i] = s.s;
      (U.uEvO.value as Vector2[])[i].set(s.ox, s.oy); (U.uEvC.value as Vector2[])[i].set(0.5 + s.ox / W, 0.5 + s.oy / H);
    });
    const light = hex(spec.mainLight), light2 = hex(spec.secondLight ?? spec.mainLight), maskC = hex(spec.mask.color);
    const pal = spec.particles.map(hex);

    const blendNormal = { blending: NormalBlending, transparent: true, depthTest: false, depthWrite: false } as const;
    const blendPremult = { blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: OneFactor, blendDstAlpha: OneMinusSrcAlphaFactor, transparent: true, depthTest: false, depthWrite: false } as const;
    const blendAdd = { blending: CustomBlending, blendEquation: AddEquation, blendSrc: OneFactor, blendDst: OneFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor, transparent: true, depthTest: false, depthWrite: false } as const;
    const mat = (vs: string, fs: string, uniforms: Record<string, IUniform>, blend: object, defines?: Record<string, string>) =>
      tr.add('material', new ShaderMaterial({ vertexShader: vs, fragmentShader: fs, uniforms, ...(defines ? { defines } : {}), ...blend }));
    const add = (obj: Object3D, order: number) => { obj.frustumCulled = false; obj.renderOrder = order; scene.add(obj); return obj; };
    const geo = <T extends BufferGeometry>(g: T): T => tr.add('geometry', g);

    // 帧表 uniform
    const uFr = Array.from({ length: 16 }, () => new Vector4()); const uFa = Array.from({ length: 16 }, () => new Vector2(1, 1));
    const uTint = new Float32Array(16), uSq = new Float32Array(16);
    FRAME_NAMES.forEach((n, i) => { const f = A.frames[n]; uFr[i].set(f.u0, f.v0, f.u1, f.v1); const m = Math.max(f.w, f.h); uFa[i].set(f.w / m, f.h / m); });
    [0, 2, 3, 4, 5].forEach(i => { uSq[i] = 1; }); uTint[1] = 1;
    const koiFr = ['mini-koi-gold', 'mini-koi-pink', 'mini-koi-purple'].map(n => { const f = A.frames[n as typeof FRAME_NAMES[number]]; return new Vector4(f.u0, f.v0, f.u1, f.v1); });
    const noiseTex = A.noise ?? this.tr.add('texture', new Texture());

    // 0 背景遮罩 + 水面
    const bd = { uTime: U.uTime, uInt: { value: 0.3 }, uWarm: { value: 0 }, uOct: { value: params.waterOctaves > 0 && A.noise ? 1 : 0 }, uCaust: { value: params.caustics }, uMaskA: { value: spec.mask.alpha },
      uMask: { value: maskC }, uLight: { value: light }, uLight2: { value: light2 }, tNoise: { value: noiseTex } };
    add(new Mesh(geo(quadGrid(1, -900, 900, -1600, 1600)), mat(G.BACKDROP_VS, G.BACKDROP_FS, bd, { blending: NoBlending, transparent: false, depthTest: false, depthWrite: false })), 0);

    // 1 水下锦鲤(程序化 SDF)
    const koiQuad = quadGrid(1, -1, 1, -0.6, 0.6);
    const koiBgN = Math.min(spec.koiBg, params.koiMax);
    let koiBg: InstancedBufferGeometry | null = null;
    if (koiBgN > 0) {
      const d = buildKoiBg(koiBgN, rng);
      koiBg = geo(instancedFrom(koiQuad, koiBgN, { aO: [d.O, 4], aM: [d.M, 4], aV: [d.V, 4] }));
      add(new Mesh(koiBg, mat(G.KOI_VS, G.KOI_FS, { uTime: U.uTime, uGlow: { value: 0 }, uWater: { value: 0.55 }, uWaterTint: { value: new Vector3(0.72, 0.7, 0.95) } }, blendPremult)), 1);
    }

    // 2 光束(ray.png 实例化,加色)
    const rayN = Math.max(4, Math.round(spec.rays * (quality === 'low' ? 0.5 : 1)));
    const rd = buildRays(spec, rayN, !reduced && quality !== 'low', rng);
    const rayU = { uTime: U.uTime, uOrigin: U.uOrigin, tRay: { value: A.ray }, tRamp: { value: A.ramp }, uLight: { value: light }, uLight2: { value: light2 }, uAmp: { value: 0.1 }, uRampMix: { value: spec.art === 'super' ? 0.8 : spec.art === 'mega' ? 0.25 : 0.2 } };
    const rayGeo = geo(instancedFrom(quadGrid(1, -0.5, 0.5, 0, 1), rayN, { aR: [rd.R, 4], aR2: [rd.R2, 2] }));
    add(new Mesh(rayGeo, mat(G.RAY_VS, G.RAY_FS, rayU, blendAdd)), 2);

    // 3 Mega 前景 mini-koi 环
    const koiRingN = Math.min(spec.koiRing, Math.max(0, params.koiMax - koiBgN));
    if (koiRingN > 0) {
      const d = buildKoiRing(koiRingN, LAYOUT.hero, rng);
      add(new Mesh(geo(instancedFrom(koiQuad, koiRingN, { aO: [d.O, 4], aM: [d.M, 4], aV: [d.V, 4] })), mat(G.KOI_VS, G.KOI_SPRITE_FS, { uTime: U.uTime, tAtlas: { value: A.atlas }, uKoiFr: { value: koiFr } }, blendNormal)), 3);
    }

    // 4 Super 主视觉:巨型金锦鲤(可弯曲格栅) —— 先建 plane 工厂
    const planeU = (map: Texture, w: number, h: number, extra: Record<string, IUniform> = {}) => ({
      tMap: { value: map }, uCenter: { value: new Vector2() }, uSize: { value: new Vector2(w, h) }, uScale: { value: 1 }, uRot: { value: 0 }, uBend: { value: 0 }, uTime: U.uTime,
      uAlpha: { value: 0 }, uSweep: { value: 0 }, uPulse: { value: 0 }, uTintAdd: { value: new Vector3(1, 0.9, 0.6) }, ...extra,
    }) as Record<string, IUniform>;
    let heroU: Record<string, IUniform> | null = null;
    if (spec.hero && A.hero) {
      const L = 860; heroU = planeU(A.hero.tex, L, L / A.hero.aspect);
      add(new Mesh(geo(quadGrid(18)), mat(G.PLANE_VS, G.PLANE_FS, heroU, blendNormal)), 4);
    }

    // 5 实体粒子 / 11 发光粒子
    const nSolid = Math.max(8, Math.round(params.solid * spec.particleMul)), nGlow = Math.max(8, Math.round(params.glow * spec.particleMul));
    const pu = { uTime: U.uTime, uRain: U.uRain, uFount: U.uFount, uDen: U.uDen, uFr: { value: uFr }, uFa: { value: uFa }, uTint: { value: uTint }, uSq: { value: uSq }, uPal: { value: pal },
      uEvT: U.uEvT, uEvP: U.uEvP, uEvF: U.uEvF, uEvO: U.uEvO, tAtlas: { value: A.atlas }, uTw: U.uTw, uGain: { value: 1.0 } } as Record<string, IUniform>;
    const pq = quadGrid(1);
    const sd = buildParticles('solid', spec.art, nSolid, slots.length, rng);
    add(new Mesh(geo(instancedFrom(pq, sd.count, { aA: [sd.A, 4], aB: [sd.B, 4], aC: [sd.C, 4] })), mat(G.PARTICLE_VS, G.PARTICLE_SOLID_FS, pu, blendNormal)), 5);
    const gd = buildParticles('glow', spec.art, nGlow, slots.length, rng);
    const glowGeo = geo(instancedFrom(pq, gd.count, { aA: [gd.A, 4], aB: [gd.B, 4], aC: [gd.C, 4] }));
    add(new Mesh(glowGeo, mat(G.PARTICLE_VS, G.PARTICLE_GLOW_FS, pu, blendAdd)), 11);

    // 6 标题 / 皇冠 / 数字 / 倍数徽章
    const titleU = planeU(A.title.tex, A.title.worldW, A.title.worldH); add(new Mesh(geo(quadGrid(1)), mat(G.PLANE_VS, G.PLANE_FS, titleU, blendNormal)), 6);
    let crownU: Record<string, IUniform> | null = null; let haloU: Record<string, IUniform> | null = null;
    if (spec.crown > 0 && A.crown) {
      crownU = planeU(A.crown.tex, 256, 256 / A.crown.aspect);
      if (spec.halo) { haloU = planeU(noiseTex, 620, 620, { tRamp: { value: A.ramp } }); add(new Mesh(geo(quadGrid(1)), mat(G.PLANE_VS, G.HALO_FS, haloU, blendAdd)), 7); }
      add(new Mesh(geo(quadGrid(1)), mat(G.PLANE_VS, G.PLANE_FS, crownU, blendNormal)), 8);
    }
    const numSheet = makeNumberSheet(spec.amountFill);
    const numTex = tr.add('texture', new CanvasTexture(numSheet.canvas)); numTex.minFilter = LinearFilter; numTex.generateMipmaps = false;
    const numU = planeU(numTex, numSheet.worldW, numSheet.worldH); add(new Mesh(geo(quadGrid(1)), mat(G.PLANE_VS, G.PLANE_FS, numU, blendNormal)), 9);
    const badge = makeBadge(ctx.multiple);
    const badgeTex = tr.add('texture', new CanvasTexture(badge.canvas)); badgeTex.minFilter = LinearFilter; badgeTex.generateMipmaps = false;
    const badgeU = planeU(badgeTex, badge.worldW, badge.worldH); add(new Mesh(geo(quadGrid(1)), mat(G.PLANE_VS, G.PLANE_FS, badgeU, blendNormal)), 10);

    // 12 冲击波环 / 13 闪白
    const ringU = { uTime: U.uTime, uEvT: U.uEvT, uEvS: U.uEvS, uEvO: U.uEvO, uLight: { value: light }, uRainbow: { value: spec.art === 'super' ? 0.85 : spec.art === 'mega' ? 0.3 : 0.15 } };
    const wantRings = slots.some(s => s.s > 0) && params.bloomLevels > 0;
    if (wantRings) add(new Mesh(geo(quadGrid(1, -900, 900, -1600, 1600)), mat(G.BACKDROP_VS, G.RING_FS, ringU, blendAdd)), 12);
    const flashU = { uColor: { value: hex(spec.flash.color) }, uA: { value: 0 } } as Record<string, IUniform>;
    add(new Mesh(geo(quadGrid(1, -900, 900, -1600, 1600)), mat(G.BACKDROP_VS, G.FLASH_FS, flashU, blendNormal)), 13);

    // ── 渲染尺寸 / 后处理 ──
    const sizeFor = (q: QualityParams) => {
      const rect = canvas.getBoundingClientRect(); const dpr = Math.min(2, window.devicePixelRatio || 1);
      const phys = rect.width > 8 ? rect.width * dpr : W;
      const w = Math.max(240, Math.round(Math.min(W * q.scale, phys, W))); return [w, Math.round(w * H / W)] as const;
    };
    let [rw, rh] = sizeFor(params);
    r.setSize(rw, rh, false);
    let post: PostFx | null = null;
    try { post = params.bloomLevels > 0 ? new PostFx(r, tr, params.bloomLevels, rw, rh, U) : null; } catch { post = null; }
    let bloomLevels = post ? params.bloomLevels : 0;
    canvas.style.opacity = '0';

    // ── 3 暖机帧(编译全部程序;计入首帧耗时) ──
    const render = () => { if (post && bloomLevels > 0) { post.levels = bloomLevels; post.render(scene, cam); } else { r.setRenderTarget(null); r.render(scene, cam); } };
    const tw0 = performance.now();
    try { render(); r.getContext().finish(); } catch (e) { this.dispose(); throw new ShowcaseFallback('warmup:' + (e as Error).message); }
    const firstFrameMs = performance.now() - tw0;
    if (!forced) {
      const q2 = adjustForFirstFrame(quality, firstFrameMs);
      if (q2 !== quality) { quality = q2; params = paramsFor(q2, reduced); applyQuality(); }
    }
    lastQuality.current = quality;
    if (showcaseOptions.debug) (window as unknown as Record<string, unknown>).__scDbg = { r, scene, cam };
    if (ctx.skip.aborted || this.disposed) { this.dispose(); return; }

    // ── 动态参数应用(降档) ──
    function applyQuality() {
      [rw, rh] = sizeFor(params); r.setSize(rw, rh, false); post?.resize(rw, rh);
      bloomLevels = Math.min(bloomLevels, params.bloomLevels);
      U.uDen.value = quality === 'high' ? 1 : quality === 'medium' ? 0.6 : 0.32;
      U.uTw.value = params.twinkle;
      bd.uOct.value = params.waterOctaves > 0 && A.noise ? 1 : 0; bd.uCaust.value = params.caustics;
      rayGeo.instanceCount = Math.max(3, Math.round(rayN * (quality === 'low' ? 0.5 : 1)));
      if (quality === 'low') glowGeo.instanceCount = Math.round(gd.count * 0.5);
    }
    applyQuality();

    // ── 4 主循环 ──
    const numTick = { shown: 0 };
    ctx.onAmount(v => { numTick.shown = v; stats.shown = v; });
    let skippedAt: number | null = null; let lastNow = performance.now(); const gov = new FrameGovernor();
    const t0 = performance.now(); stats.t0 = t0; let lastShown = -1; let peakDone = false;
    void peakDone;

    return new Promise<void>((resolve, reject) => {
      let settled = false;
      const done = () => { if (settled) return; settled = true; this.dispose(); resolve(); };
      const fail = (e: unknown) => { if (settled) return; settled = true; this.dispose(); reject(e); };
      this.failFn = fail;
      const onSkip = () => {
        if (skippedAt !== null) return;
        const now = performance.now() - t0; skippedAt = now; numTick.shown = ctx.amount;
        // 取消未来事件(停止粒子生成),保留已发生的
        slots.forEach((s, i) => { if (s.t * 1000 > now) { (U.uEvT.value as Float32Array)[i] = NEVER; (U.uEvS.value as Float32Array)[i] = 0; } });
        setTimeout(done, SKIP_FINALE_MS + 120);   // 看门狗:即使 rAF 被节流也会结束
      };
      ctx.skip.addEventListener('abort', onSkip, { once: true });
      if (ctx.skip.aborted) onSkip();
      const hard = setTimeout(done, D + 1500); this.cleanup.push(() => clearTimeout(hard));

      const frame = () => {
        if (settled) return;
        this.raf = requestAnimationFrame(frame);
        try {
          const nowAbs = performance.now(); const dt = nowAbs - lastNow; lastNow = nowAbs;
          const t = nowAbs - t0;
          if (!forced && gov.push(dt)) { const nq = downgrade(quality); if (nq) { quality = nq; params = paramsFor(nq, reduced); lastQuality.current = nq; applyQuality(); } }
          const ph = phaseAt(t, tl, skippedAt);
          if (ph.done) { done(); return; }
          const ts = t / 1000;
          U.uTime.value = ts;
          const E = energy(spec, ph.p, ph.hold, ph.finale);
          const live = skippedAt === null ? 1 : 0;
          // 光效 / 粒子密度随能量
          bd.uInt.value = E;
          U.uRain.value = (0.18 + 0.82 * E) * live * smoothstep(0, 0.25, t / 1000);
          U.uFount.value = spec.tier === 'big' || spec.art !== 'big' ? smoothstep(tl.climax[0] / 1000, tl.climax[1] / 1000, ts) * E * live : 0;
          rayU.uAmp.value = (0.03 + 0.075 * E) * ph.alpha * (spec.art === 'big' ? 0.8 : 1) * smoothstep(0, tl.enter / 1000, ts);
          // 事件脉冲 / 闪白 / 震屏 / 推近
          let pulse = 0;
          for (const e of events) { const a = t - e.tMs; if (a >= 0 && a < 600 && (U.uEvT.value as Float32Array)[events.indexOf(e)] < NEVER) pulse = Math.max(pulse, Math.exp(-a / 180) * e.power); }
          bd.uWarm.value = pulse;
          const [sx, sy] = shakeAt(t, events, spec, params.shake && !reduced && skippedAt === null);
          cam.position.set(sx, sy, 5);
          cam.zoom = zoomAt(spec, ph.p, params.push && !reduced); cam.updateProjectionMatrix();
          flashU.uA.value = (reduced || skippedAt !== null && ph.finale > 0.4) ? 0 : flashAt(t, events, spec) * (skippedAt === null ? 1 : 0.5);
          if (skippedAt !== null && ph.finale < 0.4 && !reduced && skippedAt < tl.climax[0]) flashU.uA.value = Math.max(Number(flashU.uA.value), 0.25 * (1 - ph.finale / 0.4));
          // 数字
          const sh = numTick.shown;
          if (sh !== lastShown) { numSheet.draw(sh); numTex.needsUpdate = true; lastShown = sh; }
          // 标题:easeOutBack 0.4→1.08→1
          const pre = skippedAt !== null ? 1 : clamp01(t / Math.max(1, tl.enter));
          const ts1 = 0.4 + 0.6 * easeOutBack(pre);
          const bump = reduced ? 0 : pulse * 0.07;
          const bob = reduced ? 0 : Math.sin(ts * 3.1) * 4;
          titleU.uCenter.value.set(0, LAYOUT.title + bob); titleU.uScale.value = ts1 * (1 + bump); titleU.uAlpha.value = clamp01(t / 160) * ph.alpha; titleU.uSweep.value = reduced ? 0 : 1;
          titleU.uPulse.value = pulse * 0.25;
          if (crownU) {
            const cp = skippedAt !== null ? 1 : clamp01((t - tl.enter * 0.5) / 520); const cs = spec.crown * (0.2 + 0.8 * easeOutBack(cp, 2.2));
            crownU.uCenter.value.set(0, LAYOUT.crown + (reduced ? 0 : Math.sin(ts * 2.4) * 6)); crownU.uScale.value = cs * (1 + bump * 0.6); crownU.uAlpha.value = clamp01(cp * 3) * ph.alpha; crownU.uRot.value = reduced ? 0 : Math.sin(ts * 1.7) * 0.04;
            crownU.uSweep.value = reduced ? 0 : 1;
            if (haloU) { haloU.uCenter.value.set(0, LAYOUT.crown); haloU.uScale.value = (0.62 + pulse * 0.1) * spec.crown * cp; haloU.uAlpha.value = (0.14 + 0.14 * E) * ph.alpha * cp; }
          }
          const rolling = ph.phase === 'roll' ? 1 : 0;
          const np = skippedAt !== null ? 1 : smoothstep(tl.enter * 0.55, tl.enter, t);
          numU.uCenter.value.set(0, LAYOUT.amount);
          numU.uScale.value = (0.82 + 0.18 * easeOutCubic(np)) * (1 + (reduced ? 0 : rolling * Math.sin(ts * 15) * 0.012 + pulse * 0.08));
          numU.uAlpha.value = np * ph.alpha;
          badgeU.uCenter.value.set(0, LAYOUT.amount - 150); badgeU.uScale.value = 0.8 + 0.2 * easeOutCubic(np); badgeU.uAlpha.value = clamp01((np - 0.3) / 0.7) * ph.alpha * (ph.phase === 'enter' ? 0 : 1);
          // 主视觉锦鲤:自下而上跃出
          if (heroU) {
            const hp = skippedAt !== null ? 1 : clamp01((t - tl.climax[0] + 120) / Math.max(1, tl.climax[1] - tl.climax[0] + 120));
            const rise = easeOutBack(hp, 1.2); const float = reduced ? 0 : Math.sin(ts * 1.6) * 14;
            heroU.uCenter.value.set(Math.sin(ts * 0.9) * (reduced ? 0 : 12), LAYOUT.hero + (1 - rise) * -1100 + float);
            heroU.uRot.value = (-78 * Math.PI) / 180 + (reduced ? 0 : Math.sin(ts * 1.2) * 0.05);
            heroU.uBend.value = 0.045 + (reduced ? 0 : pulse * 0.02); heroU.uScale.value = 1 + bump * 0.7; heroU.uAlpha.value = clamp01(hp * 2.5) * ph.alpha;
            heroU.uSweep.value = 0; heroU.uPulse.value = pulse * 0.18;
          }
          if (post) { post.u.uBloom.value = 0.42 + 0.2 * E + 0.25 * pulse; post.u.uCA.value = reduced ? 0 : pulse * 0.045; }
          // 画布过渡:入场淡入+缩放,出场淡出
          canvas.style.opacity = String(ph.alpha);
          canvas.style.transform = `scale(${1 + 0.04 * (1 - easeOutCubic(skippedAt !== null ? 1 : ph.intro))})`;
          render();
        } catch (e) { fail(new ShowcaseFallback('frame:' + ((e as Error)?.message ?? e))); }
      };
      // 时钟从暖机之后的第一帧开始(此刻也是壳子开始数字滚动的时刻)
      this.raf = requestAnimationFrame(frame);
    });
  }
}
export const lastQuality: { current: Quality | null } = { current: null };
void QUALITY_ORDER;
