/* ============================================================
 * GARGANTUA — GLSL 着色器集合
 * 黑洞主渲染：史瓦西时空零测地线积分（引力透镜）
 *   运动方程（直角坐标形式）: a = -3/2 · rₛ · h² · r⃗ / |r|⁵
 *   其中 h = |r⃗ × v⃗| 为守恒比角动量
 * 吸积盘：赤道面多次穿越采样（自然产生上下包裹的透镜像）
 *   开普勒差速旋转 + 无缝 fBm 湍流 + 黑体辐射色
 *   相对论多普勒束流 (δ³) + 引力红移 √(1-rₛ/r)
 * 背景：三维哈希星场（三层）+ fBm 银河星云带
 * 后期：软阈值亮通提取 → 三级高斯泛光 → ACES 调色合成
 * ============================================================ */
(function () {
  'use strict';

  /* 所有片元着色器共用的噪声 / 色彩工具 */
  var COMMON = [
    'float hash13(vec3 p3){',
    '  p3 = fract(p3 * 0.1031);',
    '  p3 += dot(p3, p3.zyx + 31.32);',
    '  return fract((p3.x + p3.y) * p3.z);',
    '}',
    'vec3 hash33(vec3 p3){',
    '  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));',
    '  p3 += dot(p3, p3.yxz + 33.33);',
    '  return fract((p3.xxy + p3.yxx) * p3.zyx);',
    '}',
    'float vnoise(vec3 p){',
    '  vec3 i = floor(p);',
    '  vec3 f = fract(p);',
    '  f = f * f * (3.0 - 2.0 * f);',
    '  float n000 = hash13(i);',
    '  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));',
    '  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));',
    '  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));',
    '  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));',
    '  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));',
    '  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));',
    '  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));',
    '  return mix(',
    '    mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),',
    '    mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),',
    '    f.z);',
    '}',
    'float fbm(vec3 p){',
    '  float s = 0.0;',
    '  float a = 0.5;',
    '  for(int i = 0; i < 4; i++){',
    '    s += a * vnoise(p);',
    '    p = p * 2.03 + vec3(17.31, 9.17, 23.71);',
    '    a *= 0.5;',
    '  }',
    '  return s;',
    '}',
    /* 黑体辐射近似色（Tanner Helland 拟合），输入开尔文 */
    'vec3 blackbody(float kelvin){',
    '  float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;',
    '  float r, g, b;',
    '  if(t <= 66.0){ r = 1.0; }',
    '  else { r = 1.2929 * pow(t - 60.0, -0.1332); }',
    '  if(t <= 66.0){ g = 0.3901 * log(t) - 0.6318; }',
    '  else { g = 1.1299 * pow(t - 60.0, -0.0755); }',
    '  if(t >= 66.0){ b = 1.0; }',
    '  else if(t <= 19.0){ b = 0.0; }',
    '  else { b = 0.5432 * log(t - 10.0) - 1.1962; }',
    '  return clamp(vec3(r, g, b), 0.0, 1.0);',
    '}'
  ].join('\n');

  /* 全屏三角形/四边形顶点着色器：直接输出 NDC */
  var VERT = [
    'varying vec2 vUv;',
    'void main(){',
    '  vUv = uv;',
    '  gl_Position = vec4(position.xy, 0.0, 1.0);',
    '}'
  ].join('\n');

  /* ---------------- 黑洞主着色器 ---------------- */
  var BLACKHOLE_FRAG = COMMON + '\n' + [
    'varying vec2 vUv;',
    'uniform vec2  uResolution;',
    'uniform float uTime;',      // 真实时间（星光闪烁）
    'uniform float uPhase;',     // 吸积盘累积相位（速度改变不跳变）
    'uniform mat4  uCamWorld;',
    'uniform vec3  uCamPos;',   // 轨道相机位置（内建 cameraPosition 属于全屏正交相机，不可用）
    'uniform float uTanHalfFov;',
    'uniform float uRs;',        // 史瓦西半径（场景单位）
    'uniform float uLens;',      // 透镜强度（0 = 平直时空对照）
    'uniform int   uSteps;',
    'uniform float uStepScale;',
    'uniform float uDiskIn;',    // 以下半径均以 rₛ 为单位
    'uniform float uDiskOut;',
    'uniform float uDiskTemp;',
    'uniform float uDiskBright;',
    'uniform float uTurb;',
    'uniform float uDoppler;',
    'uniform float uRedshift;',
    'uniform float uDiskDensity;',
    'uniform float uStarDensity;',
    'uniform float uStarBright;',
    'uniform float uNebula;',
    'uniform float uBgBright;',
    '',
    '#define MAX_STEPS 320',
    '',
    /* 三层哈希星场：方向空间三维网格，无 UV 接缝 */
    'vec3 starField(vec3 d){',
    '  vec3 col = vec3(0.0);',
    '  for(int i = 0; i < 3; i++){',
    '    float fi = float(i);',
    '    float scale = 22.0 * pow(2.3, fi);',
    '    vec3 p = d * scale;',
    '    vec3 id = floor(p);',
    '    vec3 f = fract(p) - 0.5;',
    '    vec3 rnd = hash33(id + fi * 19.19 + 5.7);',
    '    float density = uStarDensity * (0.30 - fi * 0.055);',
    '    if(rnd.x < density){',
    '      vec3 rnd2 = hash33(id + fi * 3.31 + 11.7);',
    '      vec3 off = (rnd2 - 0.5) * 0.7;',
    '      float dist = length(f - off);',
    '      float mag = pow(hash13(id + fi * 7.71 + 3.1), 6.0);',
    '      float radius = mix(0.035, 0.105, mag) * (1.0 - fi * 0.18);',
    '      float glow = exp(-dist * dist / (radius * radius) * 3.0);',
    '      float tw = 0.82 + 0.18 * sin(uTime * (0.6 + rnd.z * 2.4) + rnd.y * 40.0);',
    '      vec3 tint = mix(vec3(0.62, 0.74, 1.0), vec3(1.0, 0.83, 0.58), rnd.z);',
    '      tint = mix(vec3(1.0), tint, 0.55);',
    '      col += glow * tw * tint * (0.10 + mag * 1.7) * (1.0 - fi * 0.25);',
    '    }',
    '  }',
    '  return col;',
    '}',
    '',
    /* 银河星云带：倾斜银道面 + 双色 fBm 尘埃 */
    'vec3 nebula(vec3 d){',
    '  vec3 bn = normalize(vec3(0.35, 1.0, 0.22));',
    '  float band = exp(-pow(dot(d, bn) * 2.6, 2.0));',
    '  float n1 = fbm(d * 3.1 + vec3(0.0, 0.0, uTime * 0.004));',
    '  float n2 = fbm(d * 6.7 + vec3(31.7, 11.3, 7.1) + n1 * 0.8);',
    '  float dust = smoothstep(0.34, 0.86, n1 * 0.65 + n2 * 0.45);',
    '  vec3 c1 = vec3(0.10, 0.16, 0.30);',
    '  vec3 c2 = vec3(0.30, 0.16, 0.08);',
    '  vec3 col = mix(c1, c2, smoothstep(0.30, 0.80, n2)) * dust * band;',
    '  col += vec3(0.02, 0.03, 0.05) * band * n1;',
    '  return col;',
    '}',
    '',
    /* 吸积盘采样：emit 为发光，alpha 为遮挡 */
    'void diskSample(vec3 hit, vec3 vdir, out vec3 emit, out float alpha){',
    '  emit = vec3(0.0); alpha = 0.0;',
    '  float r = length(hit.xz);',
    '  float rr = r / uRs;',
    '  if(rr < uDiskIn || rr > uDiskOut) return;',
    '  float phi = atan(hit.z, hit.x);',
    '  float omega = 1.6 * pow(rr, -1.5);',          // 开普勒差速
    '  float ang = phi - uPhase * omega;',
    /* cos/sin 嵌入保证角向无缝；log(r) 让内缘细节更密 */
    '  float stretch = 1.4 + uTurb * 1.8;',
    '  vec3 np = vec3(cos(ang), sin(ang), 0.0) * stretch',
    '          + vec3(0.0, 0.0, log(rr) * (2.6 + uTurb * 3.4));',
    '  float n1 = fbm(np);',
    '  float n2 = fbm(np * 2.6 + vec3(13.1, 7.7, 3.3));',
    '  float fil = vnoise(vec3(cos(ang), sin(ang), 0.0) * rr * 2.2',
    '                   + vec3(0.0, 0.0, rr * 9.0 + uPhase * 0.02));',
    '  float density = (0.35 + 1.30 * n1) * (0.55 + 0.70 * n2) * (0.70 + 0.60 * fil);',
    '  density = mix(1.0, density, clamp(uTurb * 1.2, 0.0, 1.0));',
    '  float inner = smoothstep(uDiskIn, uDiskIn + 0.4, rr);',
    '  float outer = 1.0 - smoothstep(uDiskOut * 0.60, uDiskOut, rr);',
    '  float env = inner * outer;',
    '  env *= 1.0 + 1.6 * exp(-(rr - uDiskIn) * 2.0);',  // 内缘炽热亮边
    /* 引力红移因子 g = √(1 - rₛ/r) */
    '  float g = sqrt(max(1.0 - 1.0 / rr, 0.04));',
    '  float grav = mix(1.0, g, uRedshift);',
    /* 相对论多普勒：δ = 1 / (γ(1 - β·cosθ)) */
    '  vec3 tangent = normalize(vec3(-hit.z, 0.0, hit.x));',
    '  float beta = min(clamp(sqrt(0.5 / rr), 0.0, 0.85) * uDoppler, 0.9);',
    '  float gamma = inversesqrt(max(1.0 - beta * beta, 1e-3));',
    '  float cosT = dot(tangent, -vdir);',
    '  float dopp = 1.0 / (gamma * (1.0 - beta * cosT));',
    '  float shift = clamp(dopp * grav, 0.25, 4.0);',
    '  float T = uDiskTemp * pow(rr / uDiskIn, -0.75) * shift;',
    '  vec3 bb = blackbody(T);',
    '  float beaming = pow(dopp, 3.0);',
    '  float energy = uDiskBright * env * density * beaming * pow(grav, 2.0)',
    '               * pow(clamp(T / uDiskTemp, 0.05, 8.0), 1.6);',
    '  emit = bb * energy * 2.2;',
    '  alpha = clamp(density * env * uDiskDensity, 0.0, 1.0);',
    '}',
    '',
    'void main(){',
    '  vec2 p = vUv * 2.0 - 1.0;',
    '  float aspect = uResolution.x / uResolution.y;',
    '  vec3 rd = normalize(mat3(uCamWorld) *',
    '            normalize(vec3(p.x * uTanHalfFov * aspect, p.y * uTanHalfFov, -1.0)));',
    '  vec3 pos = uCamPos;',
    '  vec3 dir = rd;',
    '  vec3 acc = vec3(0.0);',
    '  float trans = 1.0;',
    '  bool captured = false;',
    '  float escapeR = max(70.0 * uRs, length(uCamPos) * 1.6);',
    '',
    '  for(int i = 0; i < MAX_STEPS; i++){',
    '    if(i >= uSteps) break;',
    '    float r2 = dot(pos, pos);',
    '    float r = sqrt(r2);',
    '    if(r < uRs * 1.001){ captured = true; break; }',       // 落入视界
    '    if(r > escapeR && dot(pos, dir) > 0.0) break;',        // 逃逸至深空
    /* 自适应步长：光子球附近加密 */
    '    float dt = uStepScale * clamp(r * 0.11, 0.028, 1.8);',
    '    if(r < 3.2 * uRs) dt *= 0.55;',
    '    vec3 h = cross(pos, dir);',
    '    float h2 = dot(h, h);',
    '    vec3 accel = -1.5 * uLens * uRs * h2 * pos / (r2 * r2 * r);',
    '    vec3 ndir = dir + accel * dt;',
    '    vec3 npos = pos + ndir * dt;',
    /* 赤道面穿越 → 吸积盘采样（允许多次穿越，形成上下透镜像） */
    '    if(pos.y * npos.y < 0.0){',
    '      float t = pos.y / (pos.y - npos.y);',
    '      vec3 hit = mix(pos, npos, t);',
    '      vec3 e; float a;',
    '      diskSample(hit, normalize(ndir), e, a);',
    '      acc += trans * e;',
    '      trans *= 1.0 - a;',
    '      if(trans < 0.02){ trans = 0.0; break; }',
    '    }',
    '    pos = npos;',
    '    dir = normalize(ndir);',
    '  }',
    '',
    '  vec3 col = acc;',
    '  if(!captured && trans > 0.001){',
    '    vec3 bg = starField(dir) * uStarBright',
    '            + nebula(dir) * uNebula',
    '            + vec3(0.004, 0.005, 0.009);',
    '    col += trans * bg * uBgBright;',
    '  }',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  /* ---------------- 亮通提取（软阈值） ---------------- */
  var BRIGHT_FRAG = [
    'varying vec2 vUv;',
    'uniform sampler2D tInput;',
    'uniform float uThreshold;',
    'void main(){',
    '  vec3 c = texture2D(tInput, vUv).rgb;',
    '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
    '  float knee = 0.4;',
    '  float soft = clamp(l - uThreshold + knee, 0.0, 2.0 * knee);',
    '  soft = soft * soft / (4.0 * knee);',
    '  float contrib = max(soft, l - uThreshold) / max(l, 1e-4);',
    '  gl_FragColor = vec4(c * contrib, 1.0);',
    '}'
  ].join('\n');

  /* ---------------- 可分离高斯模糊（线性采样 5 抽头） ---------------- */
  var BLUR_FRAG = [
    'varying vec2 vUv;',
    'uniform sampler2D tInput;',
    'uniform vec2 uDir;',
    'void main(){',
    '  vec3 sum = texture2D(tInput, vUv).rgb * 0.227027;',
    '  sum += (texture2D(tInput, vUv + uDir * 1.3846).rgb',
    '        + texture2D(tInput, vUv - uDir * 1.3846).rgb) * 0.316216;',
    '  sum += (texture2D(tInput, vUv + uDir * 3.2308).rgb',
    '        + texture2D(tInput, vUv - uDir * 3.2308).rgb) * 0.070270;',
    '  gl_FragColor = vec4(sum, 1.0);',
    '}'
  ].join('\n');

  /* ---------------- 降采样（4 抽头盒式） ---------------- */
  var COPY_FRAG = [
    'varying vec2 vUv;',
    'uniform sampler2D tInput;',
    'uniform vec2 uTexel;',
    'void main(){',
    '  vec3 c = texture2D(tInput, vUv + uTexel * vec2(-0.5, -0.5)).rgb',
    '         + texture2D(tInput, vUv + uTexel * vec2( 0.5, -0.5)).rgb',
    '         + texture2D(tInput, vUv + uTexel * vec2(-0.5,  0.5)).rgb',
    '         + texture2D(tInput, vUv + uTexel * vec2( 0.5,  0.5)).rgb;',
    '  gl_FragColor = vec4(c * 0.25, 1.0);',
    '}'
  ].join('\n');

  /* ---------------- 最终合成：泛光 + 曝光 + 暗角 + 色散 + ACES + 颗粒 ---------------- */
  var COMPOSITE_FRAG = COMMON + '\n' + [
    'varying vec2 vUv;',
    'uniform sampler2D tScene;',
    'uniform sampler2D tB0;',
    'uniform sampler2D tB1;',
    'uniform sampler2D tB2;',
    'uniform float uBloom;',
    'uniform float uExposure;',
    'uniform float uTime;',
    'uniform float uGrain;',
    'uniform vec2 uResolution;',
    'vec3 aces(vec3 x){',
    '  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);',
    '}',
    'void main(){',
    '  vec2 uv = vUv;',
    '  vec2 c = uv - 0.5;',
    '  float r2 = dot(c, c);',
    /* 边缘轻微色散，模拟电影镜头 */
    '  float ca = 0.0022 * r2;',
    '  vec3 scene;',
    '  scene.r = texture2D(tScene, uv + c * ca).r;',
    '  scene.g = texture2D(tScene, uv).g;',
    '  scene.b = texture2D(tScene, uv - c * ca).b;',
    '  vec3 bloom = texture2D(tB0, uv).rgb * 0.45',
    '             + texture2D(tB1, uv).rgb * 0.35',
    '             + texture2D(tB2, uv).rgb * 0.30;',
    '  vec3 col = scene + bloom * uBloom;',
    '  col *= uExposure;',
    '  col *= 1.0 - 0.34 * smoothstep(0.12, 0.78, r2);',   // 暗角
    '  col = aces(col);',
    '  col = pow(col, vec3(1.0 / 2.2));',
    '  float g = hash13(vec3(uv * uResolution, fract(uTime * 0.61) * 100.0));',
    '  col += (g - 0.5) * uGrain;',
    '  gl_FragColor = vec4(col, 1.0);',
    '}'
  ].join('\n');

  window.BH_SHADERS = {
    vert: VERT,
    blackholeFrag: BLACKHOLE_FRAG,
    brightFrag: BRIGHT_FRAG,
    blurFrag: BLUR_FRAG,
    copyFrag: COPY_FRAG,
    compositeFrag: COMPOSITE_FRAG
  };
})();