/* ============================================================
   shaders.js — 全部 GLSL（WebGL2 / GLSL ES 3.00）

   场景着色器原理：
   · 史瓦西时空零测地线的空间形状满足 Binet 方程
       u'' + u = (3/2)·rs·u²   (u = 1/r)
     等价的三维中心力形式为
       d²x/dλ² = -(3/2)·rs·h²·x / r⁵,  h = |x × v|（守恒）
     用 velocity-Verlet 自适应步长积分，即可得到真实的光线弯曲：
     事件视界阴影、光子环、吸积盘上下方的透镜像全部自然涌现。
   · 吸积盘： Shakura–Sunyaev 温度剖面 + 黑体辐射色 + 开普勒差速
     旋转湍流 + 多普勒聚束/引力红移（强度可调，电影默认弱化多普勒）。
   · 背景星空：程序化生成的等距柱状星图（含银河带），被引力透镜
     自然扭曲。
   ============================================================ */
'use strict';

const SHADERS = {};

/* ---------- 全屏三角形 ---------- */
SHADERS.quadVS = `#version 300 es
precision highp float;
out vec2 vUv;
void main() {
  vec2 p = vec2[3](vec2(-1.0,-1.0), vec2(3.0,-1.0), vec2(-1.0,3.0))[gl_VertexID];
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

/* ---------- 主场景：黑洞测地线光线追踪 ---------- */
SHADERS.sceneFS = `#version 300 es
precision highp float;
precision highp int;

uniform vec2  uRes;
uniform vec3  uCamPos;
uniform mat3  uCamBasis;     // 列：right / up / forward
uniform float uTanFov;
uniform float uTime;

uniform float uDiskIn;       // 吸积盘内半径 (rs)
uniform float uDiskOut;      // 吸积盘外半径 (rs)
uniform float uDiskTemp;     // 峰值温度 (K)
uniform float uDiskBright;   // 亮度
uniform float uThickness;    // 盘晕厚度 (rs)
uniform float uTurb;         // 湍流强度
uniform float uSpin;         // 图案旋转速度

uniform float uBeaming;      // 相对论亮度/颜色调制 0..1
uniform float uLensing;      // 引力透镜强度 0..2
uniform float uStarBright;   // 星空亮度

uniform float uStepK;        // 步长系数（画质）
uniform int   uMaxSteps;     // 最大积分步数（画质）
uniform float uEscape;       // 逃逸半径
uniform float uHDR;          // 1 = 浮点目标, 0 = LDR 回退

uniform sampler2D uStars;

out vec4 outColor;

const float PI = 3.14159265358979;

/* ---- 噪声 ---- */
float hash13(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1,0,0));
  float n010 = hash13(i + vec3(0,1,0));
  float n110 = hash13(i + vec3(1,1,0));
  float n001 = hash13(i + vec3(0,0,1));
  float n101 = hash13(i + vec3(1,0,1));
  float n011 = hash13(i + vec3(0,1,1));
  float n111 = hash13(i + vec3(1,1,1));
  return mix(
    mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
    mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec3(1.7, 9.2, 4.1);
    a *= 0.5;
  }
  return s;
}

/* ---- 黑体辐射颜色（Tanner Helland 拟合，转近似线性空间） ---- */
vec3 blackbody(float T) {
  float t = clamp(T, 1000.0, 15000.0) / 100.0;
  vec3 c;
  c.r = t <= 66.0 ? 1.0 : 1.2929 * pow(t - 60.0, -0.1332);
  c.g = t <= 66.0 ? 0.3901 * log(t) - 0.6318 : 1.1299 * pow(t - 60.0, -0.0755);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : 0.5432 * log(t - 10.0) - 1.1962);
  c = clamp(c, 0.0, 1.0);
  return c * c; // sRGB -> 近似线性
}

/* ---- 背景星空（等距柱状投影） ---- */
vec3 starField(vec3 d) {
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
  float v = asin(clamp(d.y, -1.0, 1.0)) / PI + 0.5;
  return texture(uStars, vec2(u, v)).rgb * uStarBright;
}

/* ---- 吸积盘着色（不透明薄盘，命中即终止光线） ---- */
vec3 diskShade(vec3 hit, vec3 rd) {
  float r   = length(hit.xz);
  float rin = uDiskIn;

  // Shakura–Sunyaev 零力矩内边界温度剖面，峰值归一化到 uDiskTemp
  float flux = pow(rin / r, 3.0) * (1.0 - sqrt(rin / r));
  float T = uDiskTemp * pow(max(flux, 0.0) / 0.0567, 0.25);

  // 局部轨道速度（史瓦西圆轨道，局部静止观测者测量）
  vec3 vdir = vec3(-hit.z, 0.0, hit.x) / r;      // 顺行
  float beta  = min(sqrt(0.5 / max(r - 1.0, 0.25)), 0.95);
  float gamma = inversesqrt(1.0 - beta * beta);
  float mu  = dot(vdir, -normalize(rd));          // 发射方向与视线夹角
  float dop = 1.0 / (gamma * (1.0 - beta * mu));  // 多普勒因子
  float ggrav = sqrt(max(1.0 - 1.0 / r, 0.001));  // 引力红移
  float g = clamp(mix(1.0, ggrav * dop, uBeaming), 0.15, 4.5);

  // 无缝湍流：方位角按弧长嵌入圆环坐标（特征尺度不随半径膨胀），
  // 差速旋转产生剪切条纹
  float phi   = atan(hit.z, hit.x);
  float omega = uSpin * 2.2 / (r * sqrt(r));
  float ang   = phi - omega * uTime;
  float arc   = r * 1.15;
  vec3 q = vec3(cos(ang) * arc, sin(ang) * arc, r * 4.5);
  float n   = fbm(q);
  float fil = smoothstep(0.40, 0.90, n);
  float broad = 0.70 + 0.60 * vnoise(q * 0.31 + vec3(0.0, 0.0, uTime * 0.02));
  float turb = max(1.0 + uTurb * ((n - 0.47) * 1.9 + fil * 0.65), 0.12) * broad;

  // 径向亮度与内外边缘软化
  float radial = pow(rin / r, 1.5);
  float edge = smoothstep(rin, rin * 1.10, r)
             * (1.0 - smoothstep(uDiskOut * 0.74, uDiskOut, r));

  float bright = uDiskBright * radial * edge * turb;
  return blackbody(T * g) * bright * pow(g, 3.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / uRes.y;
  vec3 rd = normalize(uCamBasis * vec3(uv * uTanFov, 1.0));

  vec3 p = uCamPos;
  vec3 v = rd;
  vec3 h = cross(p, v);
  float k = 1.5 * uLensing * dot(h, h);   // 中心力系数（透镜强度可调）

  vec3 col  = vec3(0.0);
  vec3 halo = vec3(0.0);
  bool done = false;

  for (int i = 0; i < 512; i++) {
    if (i >= uMaxSteps) break;
    float r2 = dot(p, p);
    float r  = sqrt(r2);

    if (r < 1.0) { done = true; break; }              // 落入事件视界
    if (r > uEscape && dot(p, v) > 0.0) {             // 逃逸至无穷远
      col = halo + starField(normalize(v));
      done = true; break;
    }

    float dt = clamp(r * uStepK, 0.012, 1.4);
    if (r < 2.6) dt *= 0.55;   // 光子球附近加密积分，保证光子环连续锐利
    vec3 a  = -k * p / (r2 * r2 * r);
    vec3 pn = p + v * dt + 0.5 * a * dt * dt;

    // 穿越赤道面：检测吸积盘命中（线性插值求交点）
    if ((p.y > 0.0) != (pn.y > 0.0)) {
      float t = clamp(p.y / (p.y - pn.y), 0.0, 1.0);
      vec3 hit = mix(p, pn, t);
      float hr = length(hit.xz);
      if (hr > uDiskIn && hr < uDiskOut) {
        col = halo + diskShade(hit, v + a * dt);
        done = true; break;
      }
    }

    // 盘晕：薄盘周围的 optically-thin 热气体辉光（增加厚度感）
    if (uThickness > 0.001 && r > uDiskIn * 0.9 && r < uDiskOut) {
      float H  = uThickness * (0.4 + 0.6 * r / uDiskOut);
      float dy = abs(p.y);
      if (dy < H * 4.0) {
        float radial = pow(uDiskIn / r, 1.5);
        float edge = smoothstep(uDiskIn, uDiskIn * 1.10, r)
                   * (1.0 - smoothstep(uDiskOut * 0.74, uDiskOut, r));
        float dens = exp(-dy / H) * radial * edge;
        vec3 tint = mix(vec3(1.0, 0.50, 0.22), vec3(1.0, 0.85, 0.60),
                        clamp((uDiskOut - r) / (uDiskOut - uDiskIn), 0.0, 1.0));
        halo += tint * dens * dt * uDiskBright * 0.12;
      }
    }

    // 光子环：光子球 (r=1.5rs) 附近热等离子体辐射。
    // 绕转光线在此路径极长 → 自然形成阴影边缘的连续亮环。
    if (r > 1.05 && r < 2.4) {
      float ring = exp(-pow((r - 1.5) / 0.30, 2.0));
      halo += vec3(1.0, 0.72, 0.42) * ring * dt * uDiskBright * 0.22;
    }

    float rn2 = dot(pn, pn);
    vec3 an = -k * pn / (rn2 * rn2 * sqrt(rn2));
    v += 0.5 * (a + an) * dt;
    p = pn;
  }

  if (!done) col = halo;                 // 步数耗尽（高阶绕转光线）按暗处理
  if (uHDR < 0.5) col = col / (1.0 + col); // LDR 回退压缩
  outColor = vec4(col, 1.0);
}`;

/* ---------- 泛光：亮度提取（软阈值，4-tap 降采样） ---------- */
SHADERS.brightFS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;      // 源纹理纹素大小
uniform float uThreshold;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 o = uTexel * 0.5;
  vec3 c = (texture(uTex, vUv + vec2(-o.x,-o.y)).rgb
          + texture(uTex, vUv + vec2( o.x,-o.y)).rgb
          + texture(uTex, vUv + vec2(-o.x, o.y)).rgb
          + texture(uTex, vUv + vec2( o.x, o.y)).rgb) * 0.25;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float knee = uThreshold * 0.5;
  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee + 1e-4);
  float w = max(l - uThreshold, soft) / max(l, 1e-4);
  outColor = vec4(c * w, 1.0);
}`;

/* ---------- 泛光：双滤波降采样 ---------- */
SHADERS.downFS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec3 s = texture(uTex, vUv).rgb * 4.0;
  s += texture(uTex, vUv - uTexel).rgb;
  s += texture(uTex, vUv + uTexel).rgb;
  s += texture(uTex, vUv + vec2(uTexel.x, -uTexel.y)).rgb;
  s += texture(uTex, vUv - vec2(uTexel.x, -uTexel.y)).rgb;
  outColor = vec4(s / 8.0, 1.0);
}`;

/* ---------- 泛光：tent 滤波上采样（加性混合） ---------- */
SHADERS.upFS = `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uTexel;
uniform float uRadius;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec2 t = uTexel * uRadius;
  vec3 s = vec3(0.0);
  s += texture(uTex, vUv + vec2(-t.x,  t.y)).rgb;
  s += texture(uTex, vUv + vec2( 0.0,  t.y)).rgb * 2.0;
  s += texture(uTex, vUv + vec2( t.x,  t.y)).rgb;
  s += texture(uTex, vUv + vec2(-t.x,  0.0)).rgb * 2.0;
  s += texture(uTex, vUv + vec2( t.x,  0.0)).rgb * 2.0;
  s += texture(uTex, vUv + vec2(-t.x, -t.y)).rgb;
  s += texture(uTex, vUv + vec2( 0.0, -t.y)).rgb * 2.0;
  s += texture(uTex, vUv + vec2( t.x, -t.y)).rgb;
  outColor = vec4(s / 12.0, 1.0);
}`;

/* ---------- 合成：泛光叠加 + ACES 色调映射 + 暗角/颗粒/色散 ---------- */
SHADERS.compositeFS = `#version 300 es
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
uniform float uExposure;
uniform float uVignette;
uniform float uGrain;
uniform float uCA;
uniform float uTime;
uniform float uLDR;
uniform vec2 uRes;
in vec2 vUv;
out vec4 outColor;

vec3 ACES(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}
float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
}
void main() {
  vec2 d = vUv - 0.5;
  float r2 = dot(d, d);

  // 轻微径向色散（镜头感）
  vec2 off = d * r2 * uCA;
  vec3 hdr;
  hdr.r = texture(uScene, vUv + off).r;
  hdr.g = texture(uScene, vUv).g;
  hdr.b = texture(uScene, vUv - off).b;

  vec3 c = hdr + texture(uBloom, vUv).rgb * uBloomStrength;
  c *= uExposure;

  if (uLDR < 0.5) {
    c = ACES(c);
    c = pow(c, vec3(1.0 / 2.2));
  } else {
    c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));
  }

  // 暗角
  c *= 1.0 - uVignette * smoothstep(0.45, 1.35, length(d) * 1.9);
  // 胶片颗粒
  c += (hash21(gl_FragCoord.xy + fract(uTime) * vec2(137.0, 241.0)) - 0.5) * uGrain;

  outColor = vec4(c, 1.0);
}`;