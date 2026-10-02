export const COMMON = /* glsl */ `
#define PI 3.14159265
#define TAU 6.2831853
float h11(float p){ p=fract(p*.1031); p*=p+33.33; p*=p+p; return fract(p); }
float h21(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1.,0.)),f.x), mix(h21(i+vec2(0.,1.)),h21(i+vec2(1.,1.)),f.x), f.y); }
float fbm(vec2 p, int oct){ float a=.5, s=0.; for(int i=0;i<5;i++){ if(i>=oct) break; s+=a*vnoise(p); p=p*2.03+vec2(11.7,3.1); a*=.5; } return s; }
vec3 pal(float t){ return .5+.5*cos(TAU*(t+vec3(0.,.33,.67))); }
mat2 rot2(float a){ float c=cos(a), s=sin(a); return mat2(c,s,-s,c); }
float elasticOut(float x){ float c4=TAU/3.2; return x<=0.?0.:(x>=1.?1.:pow(2.,-9.*x)*sin((x*10.-.75)*c4)+1.); }
float sdRoundBox(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.))+min(max(q.x,q.y),0.)-r; }
float sdStar5(vec2 p, float r, float rf){
  const vec2 k1=vec2(0.809016994375,-0.587785252292); const vec2 k2=vec2(-k1.x,k1.y);
  p.x=abs(p.x); p-=2.0*max(dot(k1,p),0.0)*k1; p-=2.0*max(dot(k2,p),0.0)*k2; p.x=abs(p.x); p.y-=r;
  vec2 ba=rf*vec2(-k1.y,k1.x)-vec2(0,1); float h=clamp(dot(p,ba)/dot(ba,ba),0.0,r);
  return length(p-ba*h)*sign(p.y*ba.x-p.x*ba.y);
}
`;

// ───────────── 背景:档位遮罩 + 程序化水面(波纹法线、焦散、彩虹薄膜光泽;输出预乘 RGBA) ─────────────
export const BACKDROP_VS = /* glsl */ `
varying vec2 vW;
void main(){ vW = position.xy; gl_Position = projectionMatrix * viewMatrix * vec4(position.xy, 0., 1.); }`;
export const BACKDROP_FS = COMMON + /* glsl */ `
uniform float uTime, uInt, uWarm, uOct, uCaust, uMaskA;
uniform vec3 uMask, uLight, uLight2;
uniform sampler2D tNoise;
varying vec2 vW;
float wave(vec2 p){
  float t = uTime;
  float h = sin(p.x*2.7 + t*.8 + sin(p.y*1.9 - t*.5)*1.3)*.5 + sin(p.y*3.6 - t*.9 + p.x*1.4)*.35 + sin((p.x+p.y)*5.1 + t*1.3)*.15;
  if (uOct > .5) h += (texture2D(tNoise, p*.20 + vec2(t*.014, -t*.01)).r - .5)*1.8 + (texture2D(tNoise, p*.46 - vec2(t*.022, 0.)).r - .5)*.4;
  return h;
}
float caustic(vec2 uv, float t){
  vec2 p = mod(uv*TAU, TAU) - 250.; vec2 i = p; float c = 1.; float inten = .005;
  for (int n=0; n<4; n++){
    float tt = t*(1.-(3.5/float(n+1)));
    i = p + vec2(cos(tt-i.x)+sin(tt+i.y), sin(tt-i.y)+cos(tt+i.x));
    c += 1./length(vec2(p.x/(sin(i.x+tt)/inten), p.y/(cos(i.y+tt)/inten)));
  }
  c /= 4.; c = 1.17 - pow(c, 1.4); return pow(abs(c), 8.);
}
void main(){
  vec2 p = vW*.0045; float e = .03;
  float h = wave(p), hx = wave(p+vec2(e,0.)), hy = wave(p+vec2(0.,e));
  vec3 n = normalize(vec3((h-hx)/e*.14, (h-hy)/e*.14, 1.));
  float gy = vW.y/1920. + .5;
  // 底色:遮罩色(档位色)明暗渐变,中央暖光
  vec3 base = uMask * mix(1.35, .62, smoothstep(.0,1.,gy));
  float r = length((vW - vec2(0.,40.))/vec2(780.,980.));
  base += uLight * exp(-r*r*2.4) * (.07 + .16*uInt);
  base *= .86 + .28*(n.y*.5 + .5);
  vec3 hl = vec3(0.);
  float spec = pow(max(dot(n, normalize(vec3(-.35,.55,.75))), 0.), 30.);
  hl += mix(uLight, vec3(1.), .5) * spec * (.10 + .20*uInt);
  vec3 irid = pal(h*.30 + n.x*1.7 + n.y*1.1 + uTime*.035 + gy*.4);
  float fres = pow(clamp(1.-n.z, 0., 1.), 1.4);
  hl += irid * fres * (.30 + .70*uInt) * .55;
  if (uCaust > .5){
    float c1 = caustic(vW*.0015 + vec2(h*.012), uTime*.5);
    hl += mix(vec3(.55,.95,1.), uLight, .35) * c1 * (.14 + .26*uInt);
    if (uCaust > 1.5){ float c2 = caustic(vW*.0026 + 7.3 - vec2(h*.01), uTime*.72 + 3.); hl += mix(vec3(1.,.72,.95), uLight2, .4) * c2 * (.08 + .20*uInt); }
  }
  float sh = pow(.5 + .5*sin(vW.x*.0072 + vW.y*.0016 + sin(vW.y*.0013 + uTime*.25)*1.6 + uTime*.12), 3.) * smoothstep(-500.,1000.,vW.y);
  hl += mix(uLight, vec3(.72,.58,1.), .5) * sh * .07 * (.5 + uInt);
  hl += uLight * uWarm * .10;
  float vg = smoothstep(1.35, .35, length(vW/vec2(780.,1280.)));
  base *= .62 + .38*vg;
  float a = clamp(uMaskA + dot(hl, vec3(.333))*.45, 0., 1.);
  gl_FragColor = vec4(base*uMaskA + hl, a);
}`;

// ───────────── 光束:ray.png 实例化(原点在底部中心,绕原点旋转),加色 ─────────────
export const RAY_VS = COMMON + /* glsl */ `
uniform float uTime; uniform vec2 uOrigin;
attribute vec4 aR;   // 初始角, 角速度, 宽(px), 长(px)
attribute vec2 aR2;  // 色相位, 副色开关
varying vec2 vUv; varying float vCT, vSel, vFl;
void main(){
  float a = aR.x + uTime*aR.y;
  vec2 lp = vec2(position.x*aR.z, position.y*aR.w);
  vec2 w = uOrigin + rot2(a)*lp;
  vUv = vec2(position.x + .5, position.y); vCT = aR2.x; vSel = aR2.y;
  vFl = .72 + .28*sin(uTime*(1.6 + aR.z*.004) + aR.x*7.);
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 0., 1.);
}`;
export const RAY_FS = /* glsl */ `
uniform sampler2D tRay, tRamp; uniform vec3 uLight, uLight2; uniform float uAmp, uRampMix, uTime;
varying vec2 vUv; varying float vCT, vSel, vFl;
void main(){
  vec4 t = texture2D(tRay, vec2(vUv.x, 1. - vUv.y));   // ray.png 亮端在图像顶行:取亮端作为原点
  float al = max(t.a, 0.) ;
  vec3 ramp = texture2D(tRamp, vec2(fract(vCT + uTime*.04), .5)).rgb;
  vec3 col = mix(vSel > .5 ? uLight2 : uLight, ramp, uRampMix);
  gl_FragColor = vec4(col * al * uAmp * vFl * smoothstep(0., .3, vUv.y), 1.);
}`;

// ───────────── 冲击波环(加色,场景内) ─────────────
export const FULL_VS = BACKDROP_VS;
export const RING_FS = COMMON + /* glsl */ `
uniform float uTime, uRainbow; uniform vec3 uLight;
uniform float uEvT[8]; uniform float uEvS[8]; uniform vec2 uEvO[8];
varying vec2 vW;
void main(){
  vec3 col = vec3(0.);
  for (int i=0;i<8;i++){
    float s = uEvS[i]; float a = uTime - uEvT[i];
    if (s > 0. && a > 0. && a < 1.5){
      float d = length(vW - uEvO[i]);
      float r = 90. + a*1250.; float w = 22. + a*70.;
      float ring = exp(-pow((d - r)/w, 2.));
      float fade = (1. - a/1.5); fade *= fade;
      vec3 tint = mix(uLight, pal(d*.0035 - a*.9), uRainbow);
      col += tint * ring * fade * s * 1.3 + vec3(1.,.95,.8) * exp(-pow((d - r)/(w*.35), 2.)) * fade * s * .5;
    }
  }
  gl_FragColor = vec4(col, 1.);
}`;

// ───────────── 粒子(GPU 实例化 + 解析式模拟;精灵取自 particles-atlas) ─────────────
export const PARTICLE_VS = COMMON + /* glsl */ `
uniform float uTime, uRain, uFount, uDen;
uniform vec4 uFr[16]; uniform vec2 uFa[16]; uniform float uTint[16]; uniform float uSq[16];
uniform vec3 uPal[6];
uniform float uEvT[8]; uniform float uEvP[8]; uniform float uEvF[8]; uniform vec2 uEvO[8];
attribute vec4 aA; // rank, life, mode(0 雨 1/2 喷泉 3 气泡 4 事件), evIdx
attribute vec4 aB; // r1..r4
attribute vec4 aC; // frame, colorIdx, size(px), spin
varying vec2 vP; varying vec4 vFr; varying vec3 vCol; varying float vTint, vFace, vFade, vSeed, vAge, vU;
void main(){
  float rank=aA.x, life=aA.y, mode=aA.z, ev=aA.w;
  float r1=aB.x, r2=aB.y, r3=aB.z, r4=aB.w;
  vec2 pos=vec2(0.); float u=0., age=0., alive=0.;
  if (mode < .5){                         // 糖果雨
    alive = step(rank, uRain*uDen);
    float ph = fract(uTime/life + r4); age = ph*life; u = ph;
    float sway = sin(age*(1.+r2*2.) + r3*TAU)*38.;
    pos = vec2((r1*2.-1.)*640. + sway, 1120. - 2350.*(.72*ph + .28*ph*ph));
    alive *= smoothstep(0.,.03,ph)*smoothstep(1.,.97,ph);
  } else if (mode < 2.5){                 // 喷泉(左/右,抛物线)
    float side = mode < 1.5 ? -1. : 1.;
    alive = step(rank, uFount*uDen);
    float ph = fract(uTime/life + r4); age = ph*life; u = ph;
    float v0 = 1650. + r1*750.; float vx = (r2-.5)*560. - side*140.;
    pos = vec2(side*300., -1060.) + vec2(vx*age, v0*age - .5*1500.*age*age);
    alive *= step(-1100., pos.y);
  } else if (mode < 3.5){                 // 气泡(上浮)
    alive = step(rank, uRain*uDen);
    float ph = fract(uTime/life + r4); age = ph*life; u = ph;
    pos = vec2((r1*2.-1.)*600. + sin(age*.9 + r3*TAU)*40., -1100. + 2300.*ph);
  } else {                                // 事件爆发(高潮 / 中途 / 峰值 / 终局;烟花 = 多处小爆)
    int e = int(ev + .5);
    float et = uEvT[e]; float pw = uEvP[e]; float nf = uEvF[e]; vec2 org = uEvO[e];
    float stagger = r4*.07; float a = r1*TAU + r3*1.7; float sp = (240. + r2*r2*1250.)*(.55 + .5*pw); float k = 2.3; float g = 820.;
    if (nf > .5){
      float kk = floor(fract(r1*13.7 + r3*5.3)*nf); float ka = kk/nf*TAU + .4;
      org += vec2(cos(ka)*380., sin(ka)*430.); stagger = kk/nf*.5 + r4*.05;
      a = fract(r2*7.7 + r3*3.1)*TAU; sp = 90. + fract(r2*3.3 + r1*9.1)*300.; k = 2.8; g = 420.;
    }
    age = uTime - et - stagger; u = age/life;
    alive = step(0., age)*step(age, life)*step(rank, clamp(pw*.85 + .15, 0., 1.)*uDen);
    float dist = sp*(1. - exp(-k*age))/k;
    pos = org + vec2(cos(a), sin(a)*.9)*dist + vec2(0., -.5*g*age*age);
  }
  bool cont = mode < 3.5;
  float size = aC.z * smoothstep(0., .06, cont ? 1. : u) * (cont ? 1. : 1. - smoothstep(.75, 1., u));
  float clk = age;
  float rotA = r3*TAU + aC.w*clk*.45;
  float flip = clk*aC.w*1.9 + r2*TAU;
  int fi = int(aC.x + .5);
  vec4 fr = uFr[fi]; vec2 fa = uFa[fi];
  vec2 lp = position.xy * fa;
  float cf = cos(flip);
  lp.x *= mix(1., max(.16, abs(cf)), uSq[fi]);
  vFace = (uSq[fi] > .5 && cf < 0.) ? -1. : 1.;
  if (abs(aC.x - 6.) < .5) rotA = r3*.8 - .4 + sin(clk*1.3 + r2*9.)*.12;   // 气泡不转
  lp = rot2(rotA) * lp * size * .5;
  vec2 w = pos + lp;
  vCol = uPal[int(aC.y + .5)];
  vP = position.xy; vFr = fr; vTint = uTint[fi]; vSeed = r3; vAge = clk; vU = u;
  vFade = alive;
  gl_Position = alive > .001 ? projectionMatrix * viewMatrix * vec4(w, 0., 1.) : vec4(2., 2., 2., 1.);
}`;
export const PARTICLE_SOLID_FS = /* glsl */ `
uniform sampler2D tAtlas;
varying vec2 vP; varying vec4 vFr; varying vec3 vCol; varying float vTint, vFace, vFade, vSeed, vAge, vU;
void main(){
  vec2 uv = vec2(mix(vFr.x, vFr.z, vP.x*.5 + .5), mix(vFr.w, vFr.y, vP.y*.5 + .5));
  vec4 c = texture2D(tAtlas, uv);
  c.rgb = mix(c.rgb, c.rgb * vCol * 1.12, vTint);
  if (vFace < 0.) c.rgb *= .78;
  float a = c.a * vFade * (1. - smoothstep(.85, 1., vU));
  if (a < .01) discard;
  gl_FragColor = vec4(c.rgb, a);
}`;
export const PARTICLE_GLOW_FS = /* glsl */ `
uniform sampler2D tAtlas; uniform float uTw, uGain;
varying vec2 vP; varying vec4 vFr; varying vec3 vCol; varying float vTint, vFace, vFade, vSeed, vAge, vU;
void main(){
  vec2 uv = vec2(mix(vFr.x, vFr.z, vP.x*.5 + .5), mix(vFr.w, vFr.y, vP.y*.5 + .5));
  vec4 c = texture2D(tAtlas, uv);
  float tw = mix(1., .55 + .45*sin(vAge*(9. + vSeed*8.) + vSeed*40.), uTw);
  vec3 col = mix(vCol, vec3(1.), .35);
  float fade = vFade * (1. - smoothstep(.7, 1., vU));
  gl_FragColor = vec4(c.rgb * c.a * col * tw * fade * uGain, 1.);
}`;

// ───────────── 锦鲤:程序化 SDF(水下背景) / mini-koi 精灵(Mega 环绕) ─────────────
export const KOI_VS = COMMON + /* glsl */ `
uniform float uTime;
attribute vec4 aO; // cx, cy, rx, ry
attribute vec4 aM; // phase, speed, size(半长), seed
attribute vec4 aV; // variant, alpha, swimRate, depth
varying vec2 vL; varying float vSeed, vVar, vAlpha, vSwim;
void main(){
  float ang = aM.x + uTime*aM.y;
  vec2 c = aO.xy + vec2(cos(ang)*aO.z, sin(ang)*aO.w);
  vec2 tang = vec2(-sin(ang)*aO.z, cos(ang)*aO.w) * sign(aM.y);
  float th = atan(tang.y, tang.x) + sin(uTime*1.3 + aM.w*9.)*.06;
  float dep = 1. + aV.w*sin(ang)*.35;
  vec2 lp = rot2(th) * (position.xy * aM.z * dep);
  gl_Position = projectionMatrix * viewMatrix * vec4(c + lp, 0., 1.);
  vL = position.xy; vSeed = aM.w; vVar = aV.x; vAlpha = aV.y; vSwim = aV.z;
}`;
export const KOI_FS = COMMON + /* glsl */ `
uniform float uTime, uGlow, uWater; uniform vec3 uWaterTint;
varying vec2 vL; varying float vSeed, vVar, vAlpha, vSwim, vHead;
const vec3 OUT = vec3(.227,.106,.361);
void schemeColors(float v, out vec3 a, out vec3 b){
  if (v < .5){ a = vec3(1.,.95,.90); b = vec3(1.,.27,.30); }
  else if (v < 1.5){ a = vec3(1.,.58,.22); b = vec3(1.,.96,.88); }
  else if (v < 2.5){ a = vec3(1.,.86,.38); b = vec3(1.,.97,.80); }
  else if (v < 3.5){ a = vec3(1.,.46,.66); b = vec3(1.,.95,.96); }
  else { a = vec3(.62,.54,1.); b = vec3(1.,.55,.78); }
}
void main(){
  float t = uTime*vSwim + vSeed*20.;
  float x = vL.x;
  float env = smoothstep(.9, -.85, x);
  float bend = sin(x*3.3 - t)*(.018 + .105*env);
  vec2 q = vec2(x, vL.y - bend);
  float aa = .012;
  vec3 ca, cb; schemeColors(vVar, ca, cb);
  vec3 col = vec3(0.); float acc = 0.;
  // —— 尾鳍 ——
  {
    float xf = clamp((-.46 - x)/.52, 0., 1.);
    float sway = sin(x*5.2 - t*1.15 - 1.)*.06*xf;
    vec2 qf = vec2(x, vL.y - bend - sway);
    float wf = mix(.03, .31, pow(xf, .85));
    float xend = -1. + .26*(1. - min(1., abs(qf.y)/.31));
    float d = max(abs(qf.y) - wf, max(xend - x, x + .40));
    float cov = (1. - smoothstep(-aa, aa, d)) * .86;
    vec3 fc = mix(cb, ca, .35) * (.85 + .25*sin(atan(qf.y, -(x+.4))*14.));
    fc = mix(fc, vec3(1.), .18 * xf);
    col = mix(col, fc, cov); acc = max(acc, cov);
  }
  // —— 胸鳍 ——
  for (int i=0;i<2;i++){
    float s = i==0 ? 1. : -1.;
    vec2 c = vec2(.40, s*.15);
    float flap = s*(.62 + .22*sin(t*.9 + s));
    vec2 l = rot2(flap) * (vec2(x, q.y) - c);
    float d = (length(l/vec2(.19,.065)) - 1.)*.07;
    float cov = (1. - smoothstep(-aa, aa, d)) * .8;
    col = mix(col, mix(cb, vec3(1.), .25), cov); acc = max(acc, cov);
  }
  // —— 身体 ——
  float xr = x - .12; float a = x > .12 ? .72 : .78;
  float prof = max(0., 1. - xr*xr/(a*a));
  float w = .185*pow(prof, .62);
  float db = prof > 0. ? abs(q.y) - w : 1.;
  {
    float cov = 1. - smoothstep(-aa, aa, db);
    float n1 = fbm(vec2(x*2.8 + vSeed*13., q.y*6. + vSeed*7.), 3);
    float pt = smoothstep(.47,.56,n1);
    vec3 body = mix(ca, cb, pt);
    float sp = smoothstep(.70,.74, vnoise(vec2(x*8., q.y*16.) + vSeed*5.)) * (1. - pt*.2);
    body = mix(body, vec3(.20,.10,.32), sp*.55*step(.5, fract(vSeed*7.3)));
    float sh = sqrt(max(0., 1. - (q.y*q.y)/max(w*w, 1e-4)));
    body *= .70 + .36*sh;
    body += vec3(1.,.97,.95) * .16 * pow(sh, 5.);
    // 鳞片微纹
    body *= .96 + .06*sin((x*34. + q.y*18.)) * sin(x*34. - q.y*18.);
    float ol = smoothstep(-.026, -.026 + aa*2.2, db);
    body = mix(body, OUT, ol);
    // 眼睛
    for (int i=0;i<2;i++){
      float s = i==0 ? 1. : -1.;
      vec2 e = q - vec2(.66, s*.098);
      float ed = length(e);
      body = mix(body, vec3(.10,.04,.16), 1. - smoothstep(.03,.036, ed));
      body = mix(body, vec3(1.), 1. - smoothstep(.009,.013, length(e - vec2(.01,.012))));
    }
    col = mix(col, body, cov); acc = max(acc, cov);
  }
  if (acc < .01) discard;
  // 发光(前景锦鲤):边缘冷光 + 整体提亮,便于 bloom
  col *= 1. + uGlow*.35;
  // 水下:偏蓝紫、降低对比
  col = mix(col, col*uWaterTint + vec3(.04,.02,.08), uWater);
  float al = acc * vAlpha;
  gl_FragColor = vec4(col*al, al);
}`;

export const KOI_SPRITE_FS = /* glsl */ `
uniform sampler2D tAtlas; uniform vec4 uKoiFr[3]; uniform float uTime;
varying vec2 vL; varying float vSeed, vVar, vAlpha, vSwim;
void main(){
  float t = uTime*vSwim + vSeed*20.;
  float x = vL.x;
  float env = smoothstep(.9, -.85, x);
  float bend = sin(x*3.3 - t)*(.02 + .10*env);
  vec2 q = vec2(x, (vL.y - bend));
  vec2 st = vec2(1. - (q.x*.5 + .5), q.y/1.0 + .5);          // 精灵头朝左,游向 +x → 水平翻转
  if (st.x < 0. || st.x > 1. || st.y < 0. || st.y > 1.) discard;
  vec4 fr = uKoiFr[int(vVar + .5)];
  vec2 uv = vec2(mix(fr.x, fr.z, st.x), mix(fr.y, fr.w, 1. - st.y));
  vec4 c = texture2D(tAtlas, uv);
  float a = c.a * vAlpha;
  if (a < .01) discard;
  gl_FragColor = vec4(c.rgb, a);
}`;

// ───────────── 贴图平面:标题 / 数字 / 倍数徽章 / 皇冠 / 主视觉锦鲤(格栅,可弯曲) ─────────────
export const PLANE_VS = COMMON + /* glsl */ `
uniform vec2 uCenter; uniform vec2 uSize; uniform float uScale, uRot, uBend, uTime;
varying vec2 vUv; varying vec2 vWp;
void main(){
  vUv = position.xy*.5 + .5;
  vec2 lp = position.xy*.5*uSize;
  float tail = smoothstep(-.15, 1., position.x);
  lp.y += uBend*uSize.y*.5*sin(position.x*3.1 - uTime*5.5)*tail;
  vec2 w = uCenter + rot2(uRot)*lp*uScale;
  vWp = w;
  gl_Position = projectionMatrix * viewMatrix * vec4(w, 0., 1.);
}`;
export const PLANE_FS = /* glsl */ `
uniform sampler2D tMap; uniform float uAlpha, uTime, uSweep, uPulse; uniform vec3 uTintAdd;
varying vec2 vUv; varying vec2 vWp;
void main(){
  vec4 c = texture2D(tMap, vUv);
  if (c.a < .003) discard;
  float lum = dot(c.rgb, vec3(.333));
  float f = fract(vWp.x*.0011 + vWp.y*.0007 - uTime*.5);
  float g = exp(-pow((f - .5)/.045, 2.));
  c.rgb += vec3(1.,.96,.82) * g * .28 * smoothstep(.45,.85,lum) * uSweep * c.a;
  c.rgb += uTintAdd * uPulse * c.a;
  gl_FragColor = vec4(c.rgb, c.a*uAlpha);
}`;
export const HALO_FS = COMMON + /* glsl */ `
uniform float uTime, uAlpha; uniform sampler2D tRamp;
varying vec2 vUv; varying vec2 vWp;
void main(){
  vec2 d = vUv*2. - 1.; float r = length(d); float a = atan(d.y, d.x);
  float rays = pow(max(0., sin(a*10. + uTime*.9)), 3.)*.6 + pow(max(0., sin(a*6. - uTime*.5)), 2.)*.4;
  float ring = exp(-pow((r - .78)/.07, 2.))*.8;
  float core = exp(-r*r*3.2);
  float k = (rays*smoothstep(1., .3, r)*.8 + ring*.8 + core*.18)*smoothstep(1.,.85,r);
  vec3 col = texture2D(tRamp, vec2(fract(a/TAU + uTime*.07), .5)).rgb;
  gl_FragColor = vec4(mix(col, vec3(1.,.96,.82), .4) * k * uAlpha, 1.);
}`;
export const FLASH_FS = /* glsl */ `
uniform vec3 uColor; uniform float uA;
void main(){ gl_FragColor = vec4(uColor, uA); }`;

export const FS_VS = /* glsl */ `
varying vec2 vUv;
void main(){ vUv = position.xy*.5 + .5; gl_Position = vec4(position.xy, 0., 1.); }`;
export const EXTRACT_FS = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uTexel; uniform float uThr;
varying vec2 vUv;
void main(){
  vec3 s = (texture2D(tSrc, vUv + uTexel*vec2(-.5,-.5)).rgb + texture2D(tSrc, vUv + uTexel*vec2(.5,-.5)).rgb
          + texture2D(tSrc, vUv + uTexel*vec2(-.5,.5)).rgb + texture2D(tSrc, vUv + uTexel*vec2(.5,.5)).rgb)*.25;
  float l = max(max(s.r, s.g), s.b);
  float k = smoothstep(uThr, uThr + .6, l);
  gl_FragColor = vec4(s*k, 1.);
}`;
export const BLUR_FS = /* glsl */ `
uniform sampler2D tSrc; uniform vec2 uDir;
varying vec2 vUv;
void main(){
  vec3 c = texture2D(tSrc, vUv).rgb * .2270270270;
  c += (texture2D(tSrc, vUv + uDir*1.3846153846).rgb + texture2D(tSrc, vUv - uDir*1.3846153846).rgb) * .3162162162;
  c += (texture2D(tSrc, vUv + uDir*3.2307692308).rgb + texture2D(tSrc, vUv - uDir*3.2307692308).rgb) * .0702702703;
  gl_FragColor = vec4(c, 1.);
}`;

export const COMPOSITE_FS = /* glsl */ `
uniform sampler2D tScene, tB0, tB1, tB2;
uniform float uTime, uBloom, uCA, uAspect, uVig;
uniform vec3 uBW;
uniform float uEvT[8]; uniform float uEvS[8]; uniform vec2 uEvC[8];
varying vec2 vUv;
vec3 shoulder(vec3 c){ vec3 hi = max(c - .8, 0.); return min(c, vec3(.8)) + .2*(1. - exp(-hi/.2)); }
void main(){
  vec2 uv = vUv; vec2 off = vec2(0.);
  for (int i=0;i<8;i++){
    float s = uEvS[i]; float a = uTime - uEvT[i];
    if (s > 0. && a > 0. && a < 1.2){
      vec2 d = (uv - uEvC[i])*vec2(uAspect, 1.);
      float dist = length(d); float r = .06 + a*.95; float w = .05 + .05*a;
      float ring = exp(-pow((dist - r)/w, 2.));
      off += (d/max(dist, 1e-4))/vec2(uAspect, 1.) * ring * .016 * s * (1. - a/1.2);
    }
  }
  uv += off;
  vec2 cd = uv - .5; float ca = uCA * dot(cd, cd) * 2.;
  vec4 sc = texture2D(tScene, uv);
  vec3 c = vec3(texture2D(tScene, uv + cd*ca).r, sc.g, texture2D(tScene, uv - cd*ca).b);
  vec3 bl = texture2D(tB0, uv).rgb*uBW.x + texture2D(tB1, uv).rgb*uBW.y + texture2D(tB2, uv).rgb*uBW.z;
  c += bl * uBloom;
  c = shoulder(c);
  c *= 1. - uVig*smoothstep(.35,.95,length(cd*vec2(1.,.62)));
  float a = max(sc.a, clamp(dot(bl, vec3(.333))*uBloom*1.5, 0., 1.));
  gl_FragColor = vec4(c, a);
}`;
