/* 卡冈图雅 — 测地线实时预览
   打开 index.html 即可。光线在笛卡尔坐标里沿史瓦西零测地线积分，
   吸积盘上下光弧来自赤道面的多次穿越。自旋改变内缘、多普勒和红移。长度单位 M = GM/c²。 */

const VERT = `#version 300 es
layout(location=0) in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const RAY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform vec2 uRes;
uniform float uTime;
uniform float uA;
uniform float uOmegaSign;
uniform float uIncl;
uniform float uDist;
uniform float uFov;
uniform float uAzimuth;
uniform float uRin;
uniform float uRout;
uniform float uIsco;
uniform float uHorizon;
uniform float uThick;
uniform float uBright;
uniform float uTemp;
uniform float uDoppler;
uniform float uGrav;
uniform float uTurb;
uniform float uFlow;
uniform float uPlunge;
uniform float uGrade;
uniform float uStarDens;
uniform float uStarBright;
uniform float uGalaxy;
uniform float uExposure;
uniform float uHScale;
uniform float uBias;
uniform int uMaxSteps;

const float PI = 3.141592653589793;

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash13(vec3(i, 2.1));
  float b = hash13(vec3(i + vec2(1.0, 0.0), 2.1));
  float c = hash13(vec3(i + vec2(0.0, 1.0), 2.1));
  float d = hash13(vec3(i + vec2(1.0, 1.0), 2.1));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    v += a * vnoise(p);
    p = p * 2.07 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return v;
}

vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 1000.0, 14000.0) / 100.0;
  float r = t <= 66.0 ? 255.0 : 329.698727446 * pow(t - 60.0, -0.1332047592);
  float g = t <= 66.0 ? 99.4708025861 * log(t) - 161.1195681661 : 288.1221695283 * pow(t - 60.0, -0.0755148492);
  float b = t >= 66.0 ? 255.0 : (t <= 19.0 ? 0.0 : 138.5177312231 * log(max(t - 10.0, 0.5)) - 305.0447927307);
  return clamp(vec3(r, g, b) / 255.0, 0.0, 1.0);
}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

float wrapPi(float ph) {
  return atan(sin(ph), cos(ph));
}

vec3 schAcc(vec3 p, vec3 v) {
  float r = max(length(p), 2.02);
  float r2 = r * r;
  vec3 L = cross(p, v);
  return -3.0 * dot(L, L) * p / (r2 * r2 * r);
}

float redshift(float r, float xiRay) {
  float xiPh = -xiRay;
  float rOrb = max(r, max(uIsco, 1.8));
  float aa = abs(uA);
  float Omega = uOmegaSign / (pow(rOrb, 1.5) + aa);
  float Sigma = rOrb * rOrb;
  float Delta = rOrb * rOrb - 2.0 * rOrb + uA * uA;
  float A = pow(rOrb * rOrb + uA * uA, 2.0) - uA * uA * Delta;
  float gtt = -(1.0 - 2.0 * rOrb / Sigma);
  float gtph = -2.0 * uA * rOrb / Sigma;
  float gphph = A / Sigma;
  float inv = -(gtt + 2.0 * gtph * Omega + gphph * Omega * Omega);
  inv = max(inv, 1e-4);
  float grav = clamp(sqrt(inv), 0.03, 1.4);
  float dop = 1.0 / max(1.0 - Omega * xiPh, 0.07);
  dop = clamp(dop, 0.05, 7.0);
  grav = mix(1.0, grav, uGrav);
  dop = mix(1.0, dop, uDoppler);
  float plungeDim = r < uIsco ? mix(0.55, 1.0, smoothstep(uHorizon + 0.3, uIsco, r)) : 1.0;
  return grav * dop * plungeDim;
}

vec3 diskRadiance(float r, float phi, float xiRay) {
  float innerCut = mix(uRin, max(uHorizon + 0.42, 1.45), clamp(uPlunge, 0.0, 1.0));
  innerCut = min(innerCut, uRin);
  float fade = smoothstep(innerCut, innerCut + 0.18, r) * smoothstep(uRout, uRout - 1.35, r);
  if (r < uRin) fade *= 0.42 + 0.58 * smoothstep(innerCut, uRin, r);
  float g = redshift(r, xiRay);
  float T = 4600.0 * uTemp * pow(max(uRin, 1.5) / max(r, 1.5), 0.7);
  T *= pow(max(1.0 - sqrt(max(uRin, 1.5) / max(r, uRin)), 0.12), 0.18);
  float Tobs = clamp(T * mix(1.0, g, 0.92), 1200.0, 14000.0);
  vec3 bb = blackbody(Tobs);
  vec3 cine = bb * vec3(1.22, 0.52, 0.16);
  cine += vec3(1.0, 0.9, 0.62) * smoothstep(4800.0, 11000.0, Tobs) * 0.7;
  vec3 base = mix(cine, bb, clamp(uGrade, 0.0, 1.0));
  float hot = smoothstep(1.05, 2.6, g);
  float cold = smoothstep(0.78, 0.22, g);
  base = mix(base, vec3(1.0, 0.95, 0.82), hot * 0.72);
  base = mix(base, vec3(0.42, 0.07, 0.015), cold * 0.7);
  float aa = abs(uA);
  float om = uOmegaSign / (pow(max(r, uIsco), 1.5) + aa);
  float shear = uTime * om * uFlow * 0.42;
  float ph = wrapPi(phi - radians(uAzimuth));
  float n1 = fbm(vec2(0.7 * ph + 0.2 * shear, log(max(r, 1.2)) * 1.8 - shear));
  float n2 = fbm(vec2(1.15 * ph - shear, log(max(r, 1.2)) * 2.6 + n1));
  float lanes = 0.7 + 0.3 * n2;
  lanes *= 0.86 + 0.14 * sin(ph * 2.0 + n1 * 2.2 - shear);
  float tex = mix(1.0, lanes, clamp(uTurb, 0.0, 1.0) * 0.8 * smoothstep(innerCut + 0.15, innerCut + 2.4, r));
  float rim = exp(-max(r - innerCut, 0.0) * 0.85);
  base += vec3(1.0, 0.94, 0.78) * rim * 0.85;
  float flux = pow(max(uRin, 1.4) / max(r, 1.4), 1.45) * (1.0 + rim * 1.35);
  float beam = pow(max(g, 0.02), 3.0);
  return base * flux * tex * fade * beam * uBright * 1.55;
}

vec3 spinZ(vec3 p, float ang) {
  float c = cos(ang);
  float s = sin(ang);
  return vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
}

vec3 starfield(vec3 rd) {
  vec3 col = vec3(0.035, 0.04, 0.055);
  vec3 galN = normalize(vec3(0.35, 0.28, 0.89));
  float lat = dot(rd, galN);
  vec3 t1 = normalize(cross(galN, vec3(0.0, 1.0, 0.0)));
  vec3 t2 = cross(galN, t1);
  float dust = fbm(vec2(dot(rd, t1), dot(rd, t2)) * 2.4);
  float band = exp(-pow(lat * 5.2, 2.0));
  col += vec3(0.11, 0.12, 0.16) * band * (0.35 + 0.65 * dust) * uGalaxy;

  for (int layer = 0; layer < 3; layer++) {
    float scale = (layer == 0 ? 14.0 : layer == 1 ? 32.0 : 70.0) * mix(0.75, 1.45, uStarDens);
    vec3 ip = floor(rd * scale + 3.0);
    float h = hash13(ip + float(layer) * 9.0);
    float thresh = layer == 0 ? mix(0.78, 0.62, uStarDens) : mix(0.93, 0.84, uStarDens);
    if (h < thresh) continue;
    vec3 j = vec3(hash13(ip + 0.7), hash13(ip + 1.3), hash13(ip + 2.1));
    vec3 sp = normalize(ip + 0.5 + (j - 0.5) * 0.8);
    float ang = length(rd - sp);
    float mag = hash13(ip + 4.2);
    float size = (layer == 0 ? 0.022 : 0.009) * (0.45 + mag);
    float s = smoothstep(size, 0.0, ang);
    float core = smoothstep(size * 0.28, 0.0, ang);
    vec3 tint = mix(vec3(1.0, 0.72, 0.42), vec3(0.72, 0.84, 1.0), hash13(ip + 5.5));
    float tw = 0.86 + 0.14 * sin(uTime * (0.4 + mag * 2.0) + h * 30.0);
    col += tint * (s * 0.65 + core) * (layer == 0 ? 2.4 : 1.1) * (0.55 + mag) * tw;
  }

  for (int i = 0; i < 14; i++) {
    float fi = float(i);
    vec3 sp = normalize(vec3(
      sin(fi * 2.399 + 0.4),
      cos(fi * 1.67) * 0.85,
      sin(fi * 0.91 + 1.2)
    ));
    float ang = length(rd - sp);
    float s = smoothstep(0.016, 0.0, ang);
    vec3 tint = mix(vec3(1.0, 0.82, 0.55), vec3(0.75, 0.86, 1.0), hash13(vec3(fi, 2.0, 4.0)));
    col += tint * s * 3.2;
  }
  return col * uStarBright;
}

vec4 present(vec3 hdr) {
  hdr *= uExposure;
  float luma = dot(max(hdr, 0.0), vec3(0.2126, 0.7152, 0.0722));
  return vec4(aces(max(hdr, 0.0)), luma / (1.0 + luma));
}

void main() {
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x -= uBias;
  float aspect = uRes.x / max(uRes.y, 1.0);
  float tanHalf = tan(radians(uFov) * 0.5);

  float incl = radians(clamp(uIncl, 2.0, 89.5));
  float az = radians(uAzimuth);
  vec3 camPos = uDist * vec3(sin(incl), 0.0, cos(incl));
  float caz = cos(az);
  float saz = sin(az);
  camPos = vec3(caz * camPos.x - saz * camPos.y, saz * camPos.x + caz * camPos.y, camPos.z);
  vec3 forward = normalize(-camPos);
  vec3 pole = vec3(0.0, 0.0, 1.0);
  vec3 right = cross(forward, pole);
  if (dot(right, right) < 1e-6) right = vec3(0.0, 1.0, 0.0);
  right = normalize(right);
  vec3 up = normalize(cross(right, forward));
  vec3 dir = normalize(forward + right * (uv.x * aspect * tanHalf) + up * (uv.y * tanHalf));
  float b = length(cross(camPos, dir));
  float xi = camPos.x * dir.y - camPos.y * dir.x;

  if (b > max(uRout + 16.0, 32.0)) {
    vec3 bent = normalize(dir - normalize(camPos) * (1.6 / max(b, 1.0)));
    fragColor = present(starfield(bent));
    return;
  }

  vec3 p = camPos;
  vec3 v = dir;
  vec3 prev = p;
  vec3 glow = vec3(0.0);
  bool hit = false;
  vec3 hitCol = vec3(0.0);
  float innerCut = mix(uRin, max(2.25, uHorizon + 0.35), clamp(uPlunge, 0.0, 1.0));
  innerCut = min(innerCut, uRin);

  for (int i = 0; i < 520; i++) {
    if (i >= uMaxSteps) break;
    float r = length(p);
    float h = uHScale * (0.42 + 0.58 * smoothstep(4.0, 18.0, r));
    if (r < 6.5) h *= 0.55;
    if (abs(p.z) < 1.6 && length(p.xy) < uRout + 3.0) h *= 0.62;
    h = clamp(h, 0.015, 0.32);

    vec3 k1v = schAcc(p, v);
    vec3 k1p = v;
    vec3 k2v = schAcc(p + 0.5 * h * k1p, v + 0.5 * h * k1v);
    vec3 k2p = v + 0.5 * h * k1v;
    vec3 k3v = schAcc(p + 0.5 * h * k2p, v + 0.5 * h * k2v);
    vec3 k3p = v + 0.5 * h * k2v;
    vec3 k4v = schAcc(p + h * k3p, v + h * k3v);
    vec3 k4p = v + h * k3v;
    vec3 np = p + (h / 6.0) * (k1p + 2.0 * k2p + 2.0 * k3p + k4p);
    vec3 nv = v + (h / 6.0) * (k1v + 2.0 * k2v + 2.0 * k3v + k4v);
    if (np.x != np.x) break;

    if (uBright > 0.001) {
      float cyl = length(p.xy);
      float H = max(uThick, 0.0) * max(cyl, 1.0);
      if (H > 0.004 && abs(p.z) < H * 2.0 && cyl > innerCut && cyl < uRout) {
        float dens = exp(-pow(p.z / H, 2.0));
        glow += diskRadiance(cyl, atan(p.y, p.x), xi) * dens * h * 0.12;
      }
      if (prev.z * np.z < 0.0) {
        float t = prev.z / (prev.z - np.z);
        vec3 hp = mix(prev, np, clamp(t, 0.0, 1.0));
        float rh = length(hp.xy);
        if (rh >= innerCut && rh <= uRout && rh > 2.2) {
          hit = true;
          hitCol = diskRadiance(rh, atan(hp.y, hp.x), xi);
          break;
        }
      }
    }

    prev = p;
    p = np;
    v = nv;
    float nr = length(p);
    if (nr < 2.08) {
      fragColor = vec4(0.0);
      return;
    }
    if (nr > uDist * 1.15 && dot(v, p) > 0.0 && i > 2) {
      fragColor = present(starfield(normalize(v)) + glow);
      return;
    }
  }

  if (hit) {
    fragColor = present(hitCol + glow);
    return;
  }
  if (dot(v, p) > 0.0 && length(p) > 4.0) {
    fragColor = present(starfield(normalize(v)) + glow);
    return;
  }
  fragColor = vec4(0.0);
}
`;

const EXTRACT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
void main() {
  vec4 s = texture(uTex, vUv);
  float hot = smoothstep(0.32, 0.82, s.a);
  vec3 c = s.rgb * hot * (0.55 + s.a * 2.1);
  fragColor = vec4(c, 1.0);
}
`;

const BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uDir;
void main() {
  vec3 c = texture(uTex, vUv).rgb * 0.227027;
  c += texture(uTex, vUv + uDir * 1.384615).rgb * 0.316216;
  c += texture(uTex, vUv - uDir * 1.384615).rgb * 0.316216;
  c += texture(uTex, vUv + uDir * 3.230769).rgb * 0.070270;
  c += texture(uTex, vUv - uDir * 3.230769).rgb * 0.070270;
  fragColor = vec4(c, 1.0);
}
`;

const COMP = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2 uSceneRes;
uniform float uBloomStr;
uniform float uGrain;
uniform float uVignette;
uniform float uLetterbox;
uniform float uTime;
uniform vec2 uRes;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 px = 1.0 / uSceneRes;
  vec3 s = texture(uScene, vUv).rgb;
  vec3 blur = (
    texture(uScene, vUv + vec2(px.x, 0.0)).rgb +
    texture(uScene, vUv - vec2(px.x, 0.0)).rgb +
    texture(uScene, vUv + vec2(0.0, px.y)).rgb +
    texture(uScene, vUv - vec2(0.0, px.y)).rgb
  ) * 0.25;
  s = max(s * 1.03 - blur * 0.03, 0.0);
  vec3 glow = texture(uBloom, vUv).rgb;
  s += glow * uBloomStr * vec3(1.05, 0.72, 0.38);
  float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
  float g = hash(vUv * uRes + fract(uTime * 0.13) * 80.0) - 0.5;
  s += g * uGrain * 0.055 * (0.2 + l);
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= uRes.x / max(uRes.y, 1.0);
  float vig = smoothstep(1.42, 0.28, length(p));
  s *= mix(1.0, vig, uVignette);
  if (uLetterbox > 0.5 && (vUv.y < 0.105 || vUv.y > 0.895)) s = vec3(0.0);
  s *= vec3(1.03, 0.985, 0.94);
  fragColor = vec4(clamp(s, 0.0, 1.0), 1.0);
}
`;

const QUALITY = [
  { id: "perf", label: "性能", scale: 0.46, steps: 150, h: 0.52, maxPx: 280000 },
  { id: "bal", label: "均衡", scale: 0.66, steps: 460, h: 0.38, maxPx: 620000 },
  { id: "cine", label: "电影", scale: 0.8, steps: 500, h: 0.3, maxPx: 900000 },
  { id: "ultra", label: "极致", scale: 1, steps: 520, h: 0.22, maxPx: 1400000 },
];

const PRESETS = [
  { id: "film", name: "星际穿越", spin: 0.6, incl: 74, dist: 40, fov: 46, rout: 18, thick: 0.035, bright: 1.65, temp: 1.2, doppler: 1, grav: 1, turb: 0.55, flow: 1, plunge: 0.35, grade: 0, exposure: 1.15, bloom: 0.85, galaxy: 0.32, starBright: 1.35, starDens: 0.72 },
  { id: "schw", name: "史瓦西", spin: 0, incl: 72, dist: 34, fov: 50, rout: 16, thick: 0.04, bright: 1.3, temp: 1.05, doppler: 0.65, grav: 1, turb: 0.6, flow: 0.8, plunge: 0.15, grade: 1, exposure: 1.15, bloom: 0.5, galaxy: 0.6, starBright: 1, starDens: 0.6 },
  { id: "fast", name: "高速自旋", spin: 0.92, incl: 74, dist: 30, fov: 48, rout: 14, thick: 0.04, bright: 1.55, temp: 1.28, doppler: 1, grav: 1, turb: 0.78, flow: 1.25, plunge: 0.75, grade: 0, exposure: 1.2, bloom: 0.82, galaxy: 0.4, starBright: 0.95, starDens: 0.55 },
  { id: "face", name: "俯视盘面", spin: 0.5, incl: 16, dist: 27, fov: 46, rout: 16, thick: 0.03, bright: 1.25, temp: 1.1, doppler: 0.55, grav: 1, turb: 0.82, flow: 1, plunge: 0.3, grade: 0, exposure: 1.12, bloom: 0.55, galaxy: 0.45, starBright: 1, starDens: 0.55 },
  { id: "stars", name: "星光透镜", spin: 0.7, incl: 68, dist: 24, fov: 40, rout: 12, thick: 0, bright: 0, temp: 1, doppler: 0, grav: 1, turb: 0, flow: 0, plunge: 0, grade: 0, exposure: 1.45, bloom: 0.2, galaxy: 0.85, starBright: 1.7, starDens: 0.85 },
  { id: "retro", name: "逆行自旋", spin: -0.8, incl: 76, dist: 32, fov: 50, rout: 16, thick: 0.045, bright: 1.4, temp: 1.1, doppler: 0.9, grav: 1, turb: 0.65, flow: 1, plunge: 0.2, grade: 0, exposure: 1.22, bloom: 0.68, galaxy: 0.5, starBright: 1, starDens: 0.6 },
];

const state = {
  spin: 0.6,
  incl: 74,
  dist: 40,
  fov: 46,
  azimuth: 0,
  lockIsco: true,
  rin: 3.83,
  rout: 18,
  thick: 0.035,
  bright: 1.65,
  temp: 1.2,
  doppler: 1,
  grav: 1,
  turb: 0.55,
  flow: 1,
  plunge: 0.35,
  grade: 0,
  starDens: 0.72,
  starBright: 1.35,
  galaxy: 0.32,
  exposure: 1.15,
  bloom: 0.85,
  grain: 0.22,
  vignette: 0.42,
  letterbox: 0,
  quality: 1,
  auto: true,
  paused: false,
};

const cam = { incl: state.incl, dist: state.dist, fov: state.fov, azimuth: state.azimuth };
const goal = { ...cam };

function iscoRadius(a) {
  const aa = Math.abs(a);
  const z1 = 1 + Math.cbrt(1 - aa * aa) * (Math.cbrt(1 + aa) + Math.cbrt(1 - aa));
  const z2 = Math.sqrt(3 * aa * aa + z1 * z1);
  return 3 + z2 - Math.sqrt(Math.max(0, (3 - z1) * (3 + z1 + 2 * z2)));
}

function horizonRadius(a) {
  return 1 + Math.sqrt(Math.max(0, 1 - a * a));
}

const canvas = document.getElementById("view");
const errBox = document.getElementById("err");
const hint = document.getElementById("hint");
let activePreset = "film";
let resMul = 1;
let simTime = 0;
let lastTs = performance.now();
let fpsSmoothed = 60;
let frameBudget = [];

function showError(text) {
  errBox.hidden = false;
  errBox.textContent = text;
}

function glsl(type, src, gl) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh) || "shader compile failed";
    gl.deleteShader(sh);
    throw new Error(log);
  }
  return sh;
}

function program(gl, frag) {
  const p = gl.createProgram();
  const vs = glsl(gl.VERTEX_SHADER, VERT, gl);
  const fs = glsl(gl.FRAGMENT_SHADER, frag, gl);
  gl.attachShader(p, vs);
  gl.attachShader(p, fs);
  gl.linkProgram(p);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(p) || "link failed";
    gl.deleteProgram(p);
    throw new Error(log);
  }
  return p;
}

const gl = canvas.getContext("webgl2", {
  alpha: false,
  antialias: false,
  depth: false,
  stencil: false,
  powerPreference: "high-performance",
  preserveDrawingBuffer: true,
});

if (!gl) {
  showError("这个浏览器没有 WebGL2，无法积分测地线。请用 Edge 或 Chrome 打开。");
  throw new Error("no webgl2");
}

let rayProg;
let extractProg;
let blurProg;
let compProg;
try {
  rayProg = program(gl, RAY);
  extractProg = program(gl, EXTRACT);
  blurProg = program(gl, BLUR);
  compProg = program(gl, COMP);
} catch (e) {
  showError(String(e.message || e));
  throw e;
}

const quad = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quad);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
gl.disable(gl.DEPTH_TEST);
gl.disable(gl.BLEND);

function makeTarget(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  return { tex, fb, w, h };
}

function destroyTarget(t) {
  if (!t) return;
  gl.deleteFramebuffer(t.fb);
  gl.deleteTexture(t.tex);
}

let scene = null;
let bloomA = null;
let bloomB = null;
let rw = 0;
let rh = 0;

function viewBias() {
  const closed = document.body.classList.contains("panel-closed");
  const panel = closed ? 0 : 348;
  const w = window.innerWidth || 1;
  const visibleCenter = (w - panel) * 0.5;
  return (visibleCenter / w) * 2 - 1;
}

function ensureSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 1.15);
  const cw = Math.max(2, Math.floor(window.innerWidth * dpr));
  const ch = Math.max(2, Math.floor(window.innerHeight * dpr));
  if (canvas.width !== cw || canvas.height !== ch) {
    canvas.width = cw;
    canvas.height = ch;
  }
  const q = QUALITY[state.quality];
  let scale = q.scale * resMul;
  const pixels = cw * ch * scale * scale;
  if (pixels > q.maxPx) scale *= Math.sqrt(q.maxPx / pixels);
  const tw = Math.max(2, Math.floor(cw * scale));
  const th = Math.max(2, Math.floor(ch * scale));
  if (!scene || tw !== rw || th !== rh) {
    destroyTarget(scene);
    destroyTarget(bloomA);
    destroyTarget(bloomB);
    rw = tw;
    rh = th;
    scene = makeTarget(tw, th);
    const bw = Math.max(2, tw >> 1);
    const bh = Math.max(2, th >> 1);
    bloomA = makeTarget(bw, bh);
    bloomB = makeTarget(bw, bh);
  }
}

function loc(p, name) {
  return gl.getUniformLocation(p, name);
}

function draw(p, fb, w, h) {
  gl.useProgram(p);
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.viewport(0, 0, w, h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function render() {
  ensureSize();
  const q = QUALITY[state.quality];
  const a = Math.max(-0.95, Math.min(0.95, state.spin));
  const isco = iscoRadius(a);
  const hor = horizonRadius(a);
  if (state.lockIsco) state.rin = isco;

  gl.useProgram(rayProg);
  gl.bindFramebuffer(gl.FRAMEBUFFER, scene.fb);
  gl.viewport(0, 0, rw, rh);
  const u = (n) => loc(rayProg, n);
  gl.uniform2f(u("uRes"), rw, rh);
  gl.uniform1f(u("uTime"), simTime);
  gl.uniform1f(u("uA"), a);
  gl.uniform1f(u("uOmegaSign"), a < 0 ? -1 : 1);
  gl.uniform1f(u("uIncl"), cam.incl);
  gl.uniform1f(u("uDist"), cam.dist);
  gl.uniform1f(u("uFov"), cam.fov);
  gl.uniform1f(u("uAzimuth"), cam.azimuth);
  gl.uniform1f(u("uRin"), Math.max(state.rin, hor + 0.15));
  gl.uniform1f(u("uRout"), Math.max(state.rout, state.rin + 0.8));
  gl.uniform1f(u("uIsco"), isco);
  gl.uniform1f(u("uHorizon"), hor);
  gl.uniform1f(u("uThick"), state.thick);
  gl.uniform1f(u("uBright"), state.bright);
  gl.uniform1f(u("uTemp"), state.temp);
  gl.uniform1f(u("uDoppler"), state.doppler);
  gl.uniform1f(u("uGrav"), state.grav);
  gl.uniform1f(u("uTurb"), state.turb);
  gl.uniform1f(u("uFlow"), state.flow);
  gl.uniform1f(u("uPlunge"), state.plunge);
  gl.uniform1f(u("uGrade"), state.grade);
  gl.uniform1f(u("uStarDens"), state.starDens);
  gl.uniform1f(u("uStarBright"), state.starBright);
  gl.uniform1f(u("uGalaxy"), state.galaxy);
  gl.uniform1f(u("uExposure"), state.exposure);
  gl.uniform1f(u("uHScale"), q.h);
  gl.uniform1f(u("uBias"), viewBias());
  gl.uniform1i(u("uMaxSteps"), q.steps);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, scene.tex);
  gl.useProgram(extractProg);
  gl.uniform1i(loc(extractProg, "uTex"), 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fb);
  gl.viewport(0, 0, bloomA.w, bloomA.h);
  gl.drawArrays(gl.TRIANGLES, 0, 3);

  const blurPass = (src, dst, dx, dy) => {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.tex);
    gl.useProgram(blurProg);
    gl.uniform1i(loc(blurProg, "uTex"), 0);
    gl.uniform2f(loc(blurProg, "uDir"), dx, dy);
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };
  blurPass(bloomA, bloomB, 6 / bloomA.w, 0);
  blurPass(bloomB, bloomA, 0, 6 / bloomA.h);
  blurPass(bloomA, bloomB, 14 / bloomA.w, 0);
  blurPass(bloomB, bloomA, 0, 14 / bloomA.h);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, scene.tex);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
  gl.useProgram(compProg);
  gl.uniform1i(loc(compProg, "uScene"), 0);
  gl.uniform1i(loc(compProg, "uBloom"), 1);
  gl.uniform2f(loc(compProg, "uSceneRes"), rw, rh);
  gl.uniform1f(loc(compProg, "uBloomStr"), state.bloom);
  gl.uniform1f(loc(compProg, "uGrain"), state.grain);
  gl.uniform1f(loc(compProg, "uVignette"), state.vignette);
  gl.uniform1f(loc(compProg, "uLetterbox"), state.letterbox);
  gl.uniform1f(loc(compProg, "uTime"), simTime);
  gl.uniform2f(loc(compProg, "uRes"), canvas.width, canvas.height);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function updateReadout() {
  const a = state.spin;
  const isco = iscoRadius(a);
  const hor = horizonRadius(a);
  document.getElementById("rSpin").textContent = (a >= 0 ? "+" : "") + a.toFixed(2);
  document.getElementById("rIncl").textContent = cam.incl.toFixed(1) + "°";
  document.getElementById("rDist").textContent = cam.dist.toFixed(1) + " M";
  document.getElementById("rIsco").textContent = isco.toFixed(2) + " M";
  document.getElementById("rHor").textContent = hor.toFixed(2) + " M";
  document.getElementById("rSide").textContent = a >= 0 ? "左侧" : "右侧";
  document.getElementById("rFps").textContent = `${Math.round(fpsSmoothed)} · ${rw}×${rh}`;
}

const panelBody = document.getElementById("panelBody");
const sliderEls = {};

function addSection(title) {
  const sec = document.createElement("section");
  sec.className = "section";
  const h = document.createElement("h3");
  h.textContent = title;
  sec.appendChild(h);
  panelBody.appendChild(sec);
  return sec;
}

function addSlider(parent, id, label, min, max, step, fmt) {
  const field = document.createElement("label");
  field.className = "field";
  const top = document.createElement("div");
  top.className = "field-top";
  const name = document.createElement("span");
  name.textContent = label;
  const value = document.createElement("b");
  top.append(name, value);
  const input = document.createElement("input");
  input.type = "range";
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(state[id]);
  input.addEventListener("input", () => {
    state[id] = Number(input.value);
    if (id === "incl" || id === "dist" || id === "fov" || id === "azimuth") {
      goal[id] = state[id];
      cam[id] = state[id];
    }
    if (id === "spin" && state.lockIsco) {
      state.rin = iscoRadius(state.spin);
      if (sliderEls.rin) sliderEls.rin.input.value = String(state.rin);
    }
    activePreset = "";
    document.querySelectorAll(".presets button").forEach((b) => b.classList.remove("active"));
    refreshSliderLabels();
  });
  field.append(top, input);
  parent.appendChild(field);
  sliderEls[id] = { input, value, fmt, id };
  return input;
}

function refreshSliderLabels() {
  if (state.lockIsco) state.rin = iscoRadius(state.spin);
  for (const key of Object.keys(sliderEls)) {
    const item = sliderEls[key];
    const v = key === "rin" ? state.rin : state[key];
    if (document.activeElement !== item.input && key !== "azimuth") {
      if (Math.abs(Number(item.input.value) - v) > 1e-4) item.input.value = String(v);
    }
    item.value.textContent = item.fmt(Number(key === "azimuth" ? state.azimuth : v));
  }
  const rin = sliderEls.rin && sliderEls.rin.input;
  if (rin) rin.disabled = state.lockIsco;
}

const presetSec = addSection("预设");
const presetGrid = document.createElement("div");
presetGrid.className = "presets";
for (const preset of PRESETS) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = preset.name;
  btn.dataset.id = preset.id;
  if (preset.id === activePreset) btn.classList.add("active");
  btn.addEventListener("click", () => applyPreset(preset.id));
  presetGrid.appendChild(btn);
}
presetSec.appendChild(presetGrid);

function applyPreset(id) {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return;
  activePreset = id;
  for (const key of Object.keys(preset)) {
    if (key === "id" || key === "name") continue;
    state[key] = preset[key];
    if (key in goal) {
      goal[key] = preset[key];
      cam[key] = preset[key];
    }
  }
  state.lockIsco = true;
  state.rin = iscoRadius(state.spin);
  const lock = document.getElementById("lockIsco");
  if (lock) lock.checked = true;
  document.querySelectorAll(".presets button").forEach((b) => {
    b.classList.toggle("active", b.dataset.id === id);
  });
  refreshSliderLabels();
}

const hole = addSection("黑洞");
addSlider(hole, "spin", "自旋 a/M", -0.95, 0.95, 0.01, (v) => (v >= 0 ? "+" : "") + v.toFixed(2));
addSlider(hole, "incl", "倾角（0° 俯视）", 5, 89, 0.1, (v) => v.toFixed(1) + "°");
addSlider(hole, "dist", "相机距离", 14, 68, 0.1, (v) => v.toFixed(1) + " M");
addSlider(hole, "fov", "视场角", 28, 72, 0.5, (v) => v.toFixed(0) + "°");
addSlider(hole, "azimuth", "方位角", -180, 180, 0.5, (v) => v.toFixed(0) + "°");

const disk = addSection("吸积盘");
const lockLabel = document.createElement("label");
lockLabel.className = "check";
lockLabel.innerHTML = `<input id="lockIsco" type="checkbox" checked> 内缘锁定在 ISCO`;
disk.appendChild(lockLabel);
document.getElementById("lockIsco").addEventListener("change", (e) => {
  state.lockIsco = e.target.checked;
  if (state.lockIsco) state.rin = iscoRadius(state.spin);
  refreshSliderLabels();
});
addSlider(disk, "rin", "内半径", 1.6, 10, 0.05, (v) => v.toFixed(2) + " M");
addSlider(disk, "rout", "外半径", 8, 32, 0.1, (v) => v.toFixed(1) + " M");
addSlider(disk, "thick", "盘厚度", 0, 0.12, 0.002, (v) => v.toFixed(3));
addSlider(disk, "bright", "亮度", 0, 3, 0.01, (v) => v.toFixed(2));
addSlider(disk, "temp", "温度", 0.45, 2.2, 0.01, (v) => v.toFixed(2));
addSlider(disk, "doppler", "多普勒聚束", 0, 1.4, 0.01, (v) => v.toFixed(2));
addSlider(disk, "grav", "引力红移", 0, 1, 0.01, (v) => v.toFixed(2));
addSlider(disk, "plunge", "内缘辉光", 0, 1, 0.01, (v) => v.toFixed(2));
addSlider(disk, "turb", "湍流", 0, 1, 0.01, (v) => v.toFixed(2));
addSlider(disk, "flow", "流动速度", 0, 2.5, 0.01, (v) => v.toFixed(2));

const gradeField = document.createElement("label");
gradeField.className = "field";
gradeField.innerHTML = `<div class="field-top"><span>色调</span></div>`;
const grade = document.createElement("select");
grade.innerHTML = `<option value="0">电影 · 琥珀金</option><option value="1">物理 · 黑体</option>`;
grade.addEventListener("change", () => {
  state.grade = Number(grade.value);
  activePreset = "";
});
gradeField.appendChild(grade);
disk.appendChild(gradeField);

const stars = addSection("星空");
addSlider(stars, "starDens", "恒星密度", 0.15, 1, 0.01, (v) => v.toFixed(2));
addSlider(stars, "starBright", "恒星亮度", 0, 2.5, 0.01, (v) => v.toFixed(2));
addSlider(stars, "galaxy", "银河", 0, 1.4, 0.01, (v) => v.toFixed(2));

const image = addSection("成像");
addSlider(image, "exposure", "曝光", 0.3, 2.6, 0.01, (v) => v.toFixed(2));
addSlider(image, "bloom", "光晕", 0, 1.6, 0.01, (v) => v.toFixed(2));
addSlider(image, "grain", "胶片颗粒", 0, 1, 0.01, (v) => v.toFixed(2));
addSlider(image, "vignette", "暗角", 0, 1, 0.01, (v) => v.toFixed(2));

const letter = document.createElement("label");
letter.className = "check";
letter.innerHTML = `<input id="letterbox" type="checkbox"> 宽银幕遮幅`;
image.appendChild(letter);
document.getElementById("letterbox").addEventListener("change", (e) => {
  state.letterbox = e.target.checked ? 1 : 0;
});

const qField = document.createElement("label");
qField.className = "field";
qField.innerHTML = `<div class="field-top"><span>渲染质量</span></div>`;
const qSelect = document.createElement("select");
qSelect.innerHTML = QUALITY.map((q, i) => `<option value="${i}">${q.label}</option>`).join("");
qSelect.value = String(state.quality);
qSelect.addEventListener("change", () => {
  state.quality = Number(qSelect.value);
  resMul = 1;
});
qField.appendChild(qSelect);
image.appendChild(qField);

const auto = document.createElement("label");
auto.className = "check";
auto.innerHTML = `<input id="autoQ" type="checkbox" checked> 按帧率自动降分辨率`;
image.appendChild(auto);
document.getElementById("autoQ").addEventListener("change", (e) => {
  state.auto = e.target.checked;
  if (!state.auto) resMul = 1;
});

const actions = document.createElement("div");
actions.className = "row-actions";
const saveBtn = document.createElement("button");
saveBtn.type = "button";
saveBtn.textContent = "保存图像";
saveBtn.addEventListener("click", saveImage);
const pauseBtn = document.createElement("button");
pauseBtn.type = "button";
pauseBtn.textContent = "暂停流动";
pauseBtn.addEventListener("click", () => {
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? "继续流动" : "暂停流动";
});
actions.append(saveBtn, pauseBtn);
image.appendChild(actions);

const resetRow = document.createElement("div");
resetRow.className = "row-actions";
const resetView = document.createElement("button");
resetView.type = "button";
resetView.textContent = "重置视角";
resetView.addEventListener("click", () => {
  goal.incl = 74;
  goal.dist = 40;
  goal.fov = 46;
  goal.azimuth = 0;
  Object.assign(cam, goal);
  state.incl = 74;
  state.dist = 40;
  state.fov = 46;
  state.azimuth = 0;
  refreshSliderLabels();
});
const resetAll = document.createElement("button");
resetAll.type = "button";
resetAll.textContent = "恢复电影预设";
resetAll.addEventListener("click", () => applyPreset("film"));
resetRow.append(resetView, resetAll);
image.appendChild(resetRow);

const note = document.createElement("p");
note.className = "note";
note.textContent = "光线沿史瓦西测地线积分，吸积盘的内缘、多普勒和红移按克尔公式随自旋变化。黑洞上下的光弧是盘面被引力弯过来的像；一侧更亮更白，是轨道运动的多普勒聚束。长度单位为 M = GM/c²。";
image.appendChild(note);

refreshSliderLabels();

function saveImage() {
  render();
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = "gargantua.png";
  a.click();
}

function setPanel(open) {
  document.body.classList.toggle("panel-closed", !open);
  const toggle = document.getElementById("panelToggle");
  toggle.setAttribute("aria-expanded", open ? "true" : "false");
  toggle.textContent = open ? "参数" : "参数";
}

document.getElementById("panelToggle").addEventListener("click", () => {
  setPanel(document.body.classList.contains("panel-closed"));
});
document.getElementById("panelClose").addEventListener("click", () => setPanel(false));

let dragging = false;
let dragButton = 0;
let lastX = 0;
let lastY = 0;
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  dragButton = e.button;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.classList.add("dragging");
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  if (dragButton === 2 || e.shiftKey) {
    goal.fov = Math.min(72, Math.max(28, goal.fov + dy * 0.08));
  } else {
    goal.azimuth = Math.max(-180, Math.min(180, goal.azimuth + dx * 0.18));
    goal.incl = Math.min(89, Math.max(5, goal.incl + dy * 0.12));
  }
});
window.addEventListener("pointerup", () => {
  dragging = false;
  canvas.classList.remove("dragging");
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  goal.dist = Math.min(68, Math.max(14, goal.dist * Math.exp(e.deltaY * 0.0011)));
}, { passive: false });
canvas.addEventListener("dblclick", () => {
  goal.incl = 74;
  goal.dist = 40;
  goal.fov = 46;
  goal.azimuth = 0;
});

window.addEventListener("resize", () => {
  rw = 0;
});

function tick(now) {
  const dt = Math.min(0.05, (now - lastTs) / 1000);
  lastTs = now;
  if (!state.paused) simTime += dt;
  const ease = 1 - Math.exp(-dt * 9);
  cam.incl += (goal.incl - cam.incl) * ease;
  cam.dist += (goal.dist - cam.dist) * ease;
  cam.fov += (goal.fov - cam.fov) * ease;
  cam.azimuth += (goal.azimuth - cam.azimuth) * ease;
  state.incl = cam.incl;
  state.dist = cam.dist;
  state.fov = cam.fov;
  state.azimuth = cam.azimuth;

  const t0 = performance.now();
  render();
  const frameMs = performance.now() - t0;
  fpsSmoothed = fpsSmoothed * 0.9 + (dt > 0 ? 1 / dt : 60) * 0.1;
  if (state.auto) {
    frameBudget.push(frameMs);
    if (frameBudget.length > 12) frameBudget.shift();
    const avg = frameBudget.reduce((s, v) => s + v, 0) / frameBudget.length;
    if (avg > 38 && resMul > 0.55) resMul = Math.max(0.55, resMul - 0.06);
    else if (avg < 16 && resMul < 1 && frameBudget.length > 8) resMul = Math.min(1, resMul + 0.03);
  }
  if (document.activeElement === document.body || document.activeElement === canvas) {
    refreshSliderLabels();
  } else if (Math.abs(goal.incl - cam.incl) > 0.05 || Math.abs(goal.dist - cam.dist) > 0.05) {
    refreshSliderLabels();
  }
  updateReadout();
  if (hint.dataset.ready !== "1") {
    hint.dataset.ready = "1";
    hint.textContent = "拖拽环视 · 滚轮缩放 · 右键变焦 · 双击重置视角";
  }
  requestAnimationFrame(tick);
}

hint.textContent = "正在积分光线…";
requestAnimationFrame(tick);
