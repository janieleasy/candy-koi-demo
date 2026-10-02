import { BufferAttribute, BufferGeometry, HalfFloatType, LinearFilter, Mesh, OrthographicCamera, RGBAFormat, Scene, ShaderMaterial, UnsignedByteType, Vector2, WebGLRenderTarget, type Scene as SceneT, type Camera, type WebGLRenderer, type IUniform, type TextureDataType } from 'three';
import { BLUR_FS, COMPOSITE_FS, EXTRACT_FS, FS_VS } from './glsl';
import type { Tracker } from './tracker';

/** 自写轻量后处理(不用 EffectComposer):场景 → RT;亮度提取(1/2) → 3 级降采样 + 可分离高斯(1/4,1/8,1/16) → 合成(bloom + 色差 + 冲击波畸变 + 暗角 + 软肩色调)。 */
export class PostFx {
  private scene = new Scene();
  private cam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private quad: Mesh;
  private ex: ShaderMaterial; private blur: ShaderMaterial; private comp: ShaderMaterial;
  private rtScene!: WebGLRenderTarget; private rtEx!: WebGLRenderTarget; private rtH: WebGLRenderTarget[] = []; private rtV: WebGLRenderTarget[] = [];
  levels: number; private type: TextureDataType; private w = 0; private h = 0;
  readonly u: { uBloom: IUniform<number>; uCA: IUniform<number>; uVig: IUniform<number> };

  constructor(private r: WebGLRenderer, private tr: Tracker, levels: number, w: number, h: number, shared: Record<string, IUniform>) {
    this.levels = levels;
    const half = r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float');
    this.type = half ? HalfFloatType : UnsignedByteType;
    const g = tr.add('geometry', new BufferGeometry());
    g.setAttribute('position', new BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    const mk = (fs: string, uniforms: Record<string, IUniform>) => tr.add('material', new ShaderMaterial({ vertexShader: FS_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false, transparent: false }));
    this.ex = mk(EXTRACT_FS, { tSrc: { value: null }, uTexel: { value: new Vector2() }, uThr: { value: 0.85 } });
    this.blur = mk(BLUR_FS, { tSrc: { value: null }, uDir: { value: new Vector2() } });
    this.u = { uBloom: { value: 1 }, uCA: { value: 0 }, uVig: { value: 0.35 } };
    this.comp = mk(COMPOSITE_FS, {
      tScene: { value: null }, tB0: { value: null }, tB1: { value: null }, tB2: { value: null },
      uTime: shared.uTime, uEvT: shared.uEvT, uEvS: shared.uEvS, uEvC: shared.uEvC,
      uBW: { value: { x: 0.8, y: 0.5, z: 0.3 } }, uAspect: { value: w / h }, ...this.u,
    });
    this.quad = new Mesh(g, this.ex); this.quad.frustumCulled = false; this.scene.add(this.quad);
    this.alloc(w, h);
  }
  private rt(w: number, h: number) {
    return this.tr.add('target', new WebGLRenderTarget(Math.max(2, w | 0), Math.max(2, h | 0), { type: this.type, format: RGBAFormat, minFilter: LinearFilter, magFilter: LinearFilter, depthBuffer: false, stencilBuffer: false, generateMipmaps: false }));
  }
  private alloc(w: number, h: number) {
    this.w = w; this.h = h;
    this.rtScene = this.rt(w, h); this.rtEx = this.rt(w / 2, h / 2);
    for (let i = 0; i < 3; i++) { this.rtH[i] = this.rt(w / (4 << i), h / (4 << i)); this.rtV[i] = this.rt(w / (4 << i), h / (4 << i)); }
    (this.comp.uniforms.uAspect as IUniform<number>).value = w / h;
  }
  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.rtScene.setSize(w, h); this.rtEx.setSize(Math.max(2, w / 2 | 0), Math.max(2, h / 2 | 0));
    for (let i = 0; i < 3; i++) { this.rtH[i].setSize(Math.max(2, w / (4 << i) | 0), Math.max(2, h / (4 << i) | 0)); this.rtV[i].setSize(Math.max(2, w / (4 << i) | 0), Math.max(2, h / (4 << i) | 0)); }
    (this.comp.uniforms.uAspect as IUniform<number>).value = w / h;
  }
  private pass(mat: ShaderMaterial, target: WebGLRenderTarget | null) {
    this.quad.material = mat; this.r.setRenderTarget(target); this.r.render(this.scene, this.cam);
  }
  render(main: SceneT, cam: Camera) {
    const r = this.r;
    r.setRenderTarget(this.rtScene); r.render(main, cam);
    const L = Math.max(0, Math.min(3, this.levels));
    let prev = this.rtScene.texture;
    if (L > 0) {
      this.ex.uniforms.tSrc.value = prev; (this.ex.uniforms.uTexel.value as Vector2).set(1 / this.rtScene.width, 1 / this.rtScene.height);
      this.pass(this.ex, this.rtEx); prev = this.rtEx.texture;
      for (let i = 0; i < L; i++) {
        this.blur.uniforms.tSrc.value = prev; (this.blur.uniforms.uDir.value as Vector2).set(1 / this.rtH[i].width, 0); this.pass(this.blur, this.rtH[i]);
        this.blur.uniforms.tSrc.value = this.rtH[i].texture; (this.blur.uniforms.uDir.value as Vector2).set(0, 1 / this.rtV[i].height); this.pass(this.blur, this.rtV[i]);
        prev = this.rtV[i].texture;
      }
    }
    const u = this.comp.uniforms;
    u.tScene.value = this.rtScene.texture;
    u.tB0.value = L > 0 ? this.rtV[0].texture : this.rtScene.texture;
    u.tB1.value = L > 1 ? this.rtV[1].texture : u.tB0.value;
    u.tB2.value = L > 2 ? this.rtV[2].texture : u.tB0.value;
    const bw = u.uBW.value as { x: number; y: number; z: number };
    bw.x = L === 0 ? 0 : L === 1 ? 0.9 : L === 2 ? 0.62 : 0.52; bw.y = L > 1 ? 0.5 : 0; bw.z = L > 2 ? 0.42 : 0;
    this.pass(this.comp, null);
  }
}
