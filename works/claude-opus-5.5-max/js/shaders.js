(function (BH) {
  'use strict';

  const MAX_STEPS = 800;

  const vert = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}
`;

  const head = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
#define PI 3.14159265359
`;

  const common = `
uniform sampler2D uBBLut;

vec3 blackbody(float T) {
  float u = clamp((log(T) - 6.907755) / 3.688879, 0.0, 1.0);
  return textureLod(uBBLut, vec2(u * (255.0 / 256.0) + 0.5 / 256.0, 0.5), 0.0).rgb;
}

uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z;
  v.y += v.z * v.x;
  v.z += v.x * v.y;
  return v;
}

vec3 hash3(ivec3 i) {
  return vec3(pcg3d(uvec3(i))) * (1.0 / 4294967296.0);
}

float gnoise(vec3 p) {
  vec3 fl = floor(p);
  ivec3 i = ivec3(fl);
  vec3 f = p - fl;
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float n000 = dot(hash3(i) * 2.0 - 1.0, f);
  float n100 = dot(hash3(i + ivec3(1, 0, 0)) * 2.0 - 1.0, f - vec3(1.0, 0.0, 0.0));
  float n010 = dot(hash3(i + ivec3(0, 1, 0)) * 2.0 - 1.0, f - vec3(0.0, 1.0, 0.0));
  float n110 = dot(hash3(i + ivec3(1, 1, 0)) * 2.0 - 1.0, f - vec3(1.0, 1.0, 0.0));
  float n001 = dot(hash3(i + ivec3(0, 0, 1)) * 2.0 - 1.0, f - vec3(0.0, 0.0, 1.0));
  float n101 = dot(hash3(i + ivec3(1, 0, 1)) * 2.0 - 1.0, f - vec3(1.0, 0.0, 1.0));
  float n011 = dot(hash3(i + ivec3(0, 1, 1)) * 2.0 - 1.0, f - vec3(0.0, 1.0, 1.0));
  float n111 = dot(hash3(i + ivec3(1, 1, 1)) * 2.0 - 1.0, f - vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z);
}

// Octaves fade to their mean once they get finer than the pixel footprint fw (noise units).
float fbm4(vec3 p, float fw) {
  float s = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    s += amp * (1.0 - smoothstep(0.3, 0.75, fw)) * gnoise(p);
    p = p * 2.02 + vec3(5.31, -2.17, 3.73);
    fw *= 2.02;
    amp *= 0.5;
  }
  return s / 0.9375;
}
`;

  const trace = head + common + `
uniform vec2 uRes;
uniform vec2 uShift;
uniform float uTanFov;
uniform vec3 uCamPos;
uniform vec3 uE0;
uniform vec3 uE1;
uniform vec3 uE2;
uniform vec3 uE3;
uniform float uInvLapse;
uniform float uSpin;
uniform float uRh;
uniform float uRcap;
uniform float uRph;
uniform float uRin;
uniform float uRout;
uniform float uResc;
uniform float uEps;
uniform int uMaxSteps;
uniform float uPixAngle;
uniform float uStarBright;
uniform float uMilky;
uniform mat3 uGal;

layout(location = 0) out vec4 oBg;
layout(location = 1) out vec4 oHit1;
layout(location = 2) out vec4 oHit2;
layout(location = 3) out vec4 oHit3;

// Rays are integrated forward in time in Kerr(-a). That is the time reverse of tracing the
// camera's photons backwards in Kerr(a), and ingoing Kerr–Schild coordinates let those
// rays cross the horizon instead of piling up in front of it.
float gA;
float gA2;

float ksR(vec3 x) {
  float w = dot(x, x) - gA2;
  return sqrt(0.5 * (w + sqrt(w * w + 4.0 * gA2 * x.z * x.z)));
}

void geo(vec3 x, vec3 p, out vec3 dx, out vec3 dp) {
  float z = x.z;
  float w = dot(x, x) - gA2;
  float r2 = 0.5 * (w + sqrt(w * w + 4.0 * gA2 * z * z));
  float r = sqrt(r2);
  float S = r2 + gA2;
  float D = r2 * r2 + gA2 * z * z;
  float f = 2.0 * r * r2 / D;
  vec3 l = vec3((r * x.x + gA * x.y) / S, (r * x.y - gA * x.x) / S, z / r);
  float L = 1.0 + dot(l, p);
  vec3 gr = vec3(x.x * r * r2, x.y * r * r2, z * r * S) / D;
  vec3 gf = (2.0 * r2 / (D * D)) * ((3.0 * gA2 * z * z - r2 * r2) * gr - vec3(0.0, 0.0, 2.0 * gA2 * r * z));
  float k = (p.x * x.x + p.y * x.y - 2.0 * r * (p.x * l.x + p.y * l.y)) / S - p.z * z / r2;
  vec3 gL = k * gr + vec3((r * p.x - gA * p.y) / S, (gA * p.x + r * p.y) / S, p.z / r);
  dx = p - f * L * l;
  dp = 0.5 * L * L * gf + f * L * gL;
}

void rk4(inout vec3 x, inout vec3 p, float h) {
  vec3 k1x, k1p, k2x, k2p, k3x, k3p, k4x, k4p;
  geo(x, p, k1x, k1p);
  geo(x + 0.5 * h * k1x, p + 0.5 * h * k1p, k2x, k2p);
  geo(x + 0.5 * h * k2x, p + 0.5 * h * k2p, k3x, k3p);
  geo(x + h * k3x, p + h * k3p, k4x, k4p);
  x += (h / 6.0) * (k1x + 2.0 * (k2x + k3x) + k4x);
  p += (h / 6.0) * (k1p + 2.0 * (k2p + k3p) + k4p);
}

// Frequency ratio between the static camera and gas on a prograde circular orbit in Kerr(a).
// The physical photon's angular momentum is -Lz of the mirrored ray.
float diskRedshift(float r, float Lz) {
  float sr = sqrt(r);
  float r15 = r * sr;
  float Om = 1.0 / (r15 + uSpin);
  float ut = (r15 + uSpin) / sqrt(max(r15 * (r15 - 3.0 * sr + 2.0 * uSpin), 1e-6));
  return uInvLapse / (ut * max(1.0 + Om * Lz, 1e-3));
}

vec3 faceDir(int f, vec2 uv) {
  if (f == 0) return vec3(1.0, uv.x, uv.y);
  if (f == 1) return vec3(-1.0, uv.x, uv.y);
  if (f == 2) return vec3(uv.x, 1.0, uv.y);
  if (f == 3) return vec3(uv.x, -1.0, uv.y);
  if (f == 4) return vec3(uv.x, uv.y, 1.0);
  return vec3(uv.x, uv.y, -1.0);
}

int cubeFace(vec3 d, out vec2 uv) {
  vec3 ad = abs(d);
  if (ad.x >= ad.y && ad.x >= ad.z) { uv = d.yz / ad.x; return d.x > 0.0 ? 0 : 1; }
  if (ad.y >= ad.z) { uv = d.xz / ad.y; return d.y > 0.0 ? 2 : 3; }
  uv = d.xy / ad.z;
  return d.z > 0.0 ? 4 : 5;
}

float bandOf(vec3 g) {
  return exp(-25.0 * g.z * g.z);
}

// One layer of point stars on an equi-angular cube map. Each star is a Gaussian whose width
// follows the pixel's footprint on the sky, so lensed regions stay alias-free and keep their
// flux; once the footprint spans several cells the layer is replaced by its mean brightness.
vec3 starLayer(vec3 g, int face, vec2 s, float N, float prob, float boost, float flux, int seed,
               float sig2, float kpk, float band) {
  float lod = smoothstep(0.08, 0.25, sqrt(sig2) * N / (0.5 * PI));
  vec3 avg = vec3(1.0, 0.92, 0.84) * (prob * (1.0 + boost * band) * flux * 0.2 * 6.0 * N * N / (4.0 * PI))
           * (2.6546 * uPixAngle * uPixAngle);
  if (lod >= 1.0) return avg;
  vec2 c = (s * 0.5 + 0.5) * N;
  vec2 base = floor(c - 0.5);
  vec3 acc = vec3(0.0);
  for (int k = 0; k < 4; k++) {
    vec2 cell = base + vec2(float(k & 1), float(k >> 1));
    if (any(lessThan(cell, vec2(0.0))) || any(greaterThanEqual(cell, vec2(N)))) continue;
    ivec3 id = ivec3(int(cell.x), int(cell.y), face + 8 * seed);
    vec3 h = hash3(id);
    vec2 sc = (cell + 0.2 + 0.6 * h.xy) * (2.0 / N) - 1.0;
    vec3 sd = normalize(faceDir(face, tan(sc * (0.25 * PI))));
    float pr = prob * (1.0 + boost * bandOf(sd));
    vec3 h2 = hash3(id + ivec3(0, 0, 64));
    if (h2.x > pr) continue;
    float u = h2.x / pr;
    float b = flux * u * u * u * u;
    vec3 col = mix(vec3(1.0), blackbody(2400.0 + 9600.0 * h2.y * h2.y), 0.75);
    vec3 dv = g - sd;
    acc += col * (b * kpk * exp(-0.5 * dot(dv, dv) / sig2));
  }
  return mix(acc, avg, lod);
}

vec3 milkyWay(vec3 g, float fw) {
  float bulge = exp(-3.5 * (1.0 - g.x));
  float n1 = fbm4(g * 2.2, fw * 2.2);
  float n2 = fbm4(g * 6.5 + vec3(3.1, 7.7, 1.3), fw * 6.5);
  float n3 = fbm4(g * 19.0 + vec3(-4.2, 1.9, 8.8), fw * 19.0);
  float width = 0.12 + 0.07 * n1 + 0.1 * bulge;
  float lat = g.z + 0.03 * n1;
  float band = exp(-lat * lat / (width * width));
  float clouds = clamp(0.6 + 1.6 * n2 + 0.8 * n3, 0.0, 2.0);
  float laneW = 0.02 + 0.025 * bulge;
  float lq = (lat - 0.015 * n2) / laneW;
  float lane = exp(-lq * lq) * smoothstep(-0.15, 0.25, n2 + 0.6 * n3);
  float I = band * clouds * (0.7 + 2.8 * bulge) * (1.0 - 0.85 * lane);
  vec3 col = mix(vec3(0.62, 0.72, 1.0), vec3(1.0, 0.84, 0.66), clamp(1.6 * bulge + 0.3 * band, 0.0, 1.0));
  return col * I;
}

void main() {
  gA = -uSpin;
  gA2 = uSpin * uSpin;
  // uShift moves the optical axis to the middle of the area the side panel leaves free.
  vec2 ndc = (2.0 * gl_FragCoord.xy - uRes) / uRes.y - uShift;
  vec3 n = normalize(vec3(ndc * uTanFov, 1.0));
  vec3 p = uInvLapse * (uE0 + n.x * uE1 + n.y * uE2 + n.z * uE3);
  vec3 x = uCamPos;

  vec4 h1 = vec4(0.0);
  vec4 h2 = vec4(0.0);
  vec4 h3 = vec4(0.0);
  int nh = 0;
  bool captured = false;
  bool escaped = false;
  float r = ksR(x);

  for (int i = 0; i < ${MAX_STEPS}; i++) {
    if (i >= uMaxSteps) break;
    float h = uEps * r * (1.0 + 0.03 * r) * clamp(2.0 * (r - uRh) / uRh, 0.12, 1.0);
    if (dot(x, p) <= 0.0) h = min(h, 0.3 * r);
    vec3 x0 = x;
    vec3 p0 = p;
    float r0 = r;
    rk4(x, p, h);
    r = ksR(x);

    if (x0.z * x.z < 0.0) {
      float t = x0.z / (x0.z - x.z);
      vec3 xc = mix(x0, x, t);
      float rc = sqrt(max(dot(xc.xy, xc.xy) - gA2, 0.0));
      if (rc > uRin && rc < uRout) {
        vec3 pc = mix(p0, p, t);
        vec3 d = x - x0;
        vec4 hit = vec4(rc, atan(xc.y, xc.x), diskRedshift(rc, xc.x * pc.y - xc.y * pc.x), abs(d.z) / length(d));
        if (nh == 0) h1 = hit;
        else if (nh == 1) h2 = hit;
        else h3 = hit;
        nh++;
        if (nh == 3) break;
      }
    }

    // Inside the innermost photon orbit an ingoing ray can no longer turn around.
    if (!(r > uRcap) || (r < uRph && r < r0)) { captured = true; break; }
    if (dot(x, p) > 0.0 && dot(x, x) > uResc * uResc) { escaped = true; break; }
  }

  vec3 dx, dp;
  geo(x, p, dx, dp);
  vec3 g = uGal * normalize(dx);
  vec3 gx = dFdx(g);
  vec3 gy = dFdy(g);
  float major2 = max(dot(gx, gx), dot(gy, gy));
  if (!(major2 < 1.0)) major2 = 1.0;
  float pa2 = uPixAngle * uPixAngle;
  float sig2 = 0.4225 * max(major2, pa2 / 24.0);

  vec3 sky = vec3(0.0);
  if (escaped) {
    vec2 uv;
    int face = cubeFace(g, uv);
    vec2 s = atan(uv) * (4.0 / PI);
    float kpk = 0.4225 * pa2 / sig2;
    float band = bandOf(g);
    vec3 st = starLayer(g, face, s, 36.0, 0.55, 0.0, 2.4, 1, sig2, kpk, band)
            + starLayer(g, face, s, 110.0, 0.5, 1.0, 0.7, 2, sig2, kpk, band)
            + starLayer(g, face, s, 330.0, 0.45, 2.0, 0.22, 3, sig2, kpk, band);
    sky = st * uStarBright + milkyWay(g, sqrt(max(major2, pa2))) * (0.05 * uMilky);
  }

  oBg = vec4(sky, escaped ? 1.0 : 0.0);
  oHit1 = h1;
  oHit2 = h2;
  oHit3 = h3;
}
`;

  const shade = head + common + `
uniform sampler2D uBg;
uniform sampler2D uHit1;
uniform sampler2D uHit2;
uniform sampler2D uHit3;
uniform float uSpin;
uniform float uPhase;
uniform float uFlowT;
uniform float uRin;
uniform float uRout;
uniform float uTemp;
uniform float uTempSlope;
uniform float uBright;
uniform float uFalloff;
uniform float uOpacity;
uniform float uTurb;
uniform float uDoppler;

out vec4 oColor;

// Screen-space derivatives of (r, phi) for one hit layer; phi's derivative is taken through
// (cos, sin) so the branch cut does not show up as a seam.
vec4 footprint(vec4 h) {
  vec2 c = vec2(cos(h.y), sin(h.y));
  vec2 cx = dFdx(c);
  vec2 cy = dFdy(c);
  return vec4(dFdx(h.x), c.x * cx.y - c.y * cx.x, dFdy(h.x), c.x * cy.y - c.y * cy.x);
}

// Turbulence carried along by Keplerian shear. Two copies, half a period apart, are advected
// and cross-faded so the pattern never winds up indefinitely.
float diskTurb(float r, float phi, vec4 fp) {
  float sr = sqrt(r);
  float Om = 1.0 / (r * sr + uSpin);
  float dOm = -1.5 * sr * Om * Om;
  float n = 0.0;
  float wsum = 0.0;
  for (int k = 0; k < 2; k++) {
    float fr = fract(uPhase + 0.5 * float(k));
    float t = fr * uFlowT;
    float w = 1.0 - abs(2.0 * fr - 1.0);
    float pa = phi - Om * t;
    vec3 P = vec3(cos(pa) * 4.5, sin(pa) * 4.5, r * 2.6) + float(k) * vec3(31.7, -17.3, 11.9);
    float ax = fp.y - dOm * t * fp.x;
    float ay = fp.w - dOm * t * fp.z;
    float fw = max(length(vec2(4.5 * ax, 2.6 * fp.x)), length(vec2(4.5 * ay, 2.6 * fp.z)));
    n += w * fbm4(P, fw);
    wsum += w * w;
  }
  return n * inversesqrt(max(wsum, 1e-4));
}

float rings(float r, float dr) {
  float s = 0.0;
  float amp = 0.5;
  float fq = 1.9;
  for (int i = 0; i < 3; i++) {
    s += amp * (1.0 - smoothstep(0.3, 0.75, dr * fq)) * gnoise(vec3(r * fq, 0.5 + 7.3 * float(i), 0.25));
    fq *= 2.4;
    amp *= 0.6;
  }
  return s;
}

vec3 shadeHit(vec4 h, vec4 fp, vec3 behind) {
  float r = h.x;
  float rr = r / uRin;
  float x = (r - uRin) / (uRout - uRin);
  float profile = smoothstep(1.0, 1.06, rr) * pow(1.0 - smoothstep(0.2, 1.0, x), 1.5);
  float st = clamp(0.62 + 1.5 * diskTurb(r, h.y, fp) + 1.1 * rings(r, max(abs(fp.x), abs(fp.z))), 0.0, 1.8);
  st = mix(1.0, st, uTurb);
  float alpha = 1.0 - exp(-uOpacity * 2.5 * profile * st / max(h.w, 0.02));
  float gs = pow(max(h.z, 1e-3), uDoppler);
  float T = uTemp * pow(rr, -uTempSlope) * gs;
  float I = 3.0 * uBright * pow(rr, -uFalloff) * (0.45 + 0.55 * st) * gs * gs * gs * gs;
  return mix(behind, blackbody(T) * I, alpha);
}

void main() {
  ivec2 ip = ivec2(gl_FragCoord.xy);
  vec3 c = texelFetch(uBg, ip, 0).rgb;
  vec4 h1 = texelFetch(uHit1, ip, 0);
  vec4 h2 = texelFetch(uHit2, ip, 0);
  vec4 h3 = texelFetch(uHit3, ip, 0);
  vec4 f1 = footprint(h1);
  vec4 f2 = footprint(h2);
  vec4 f3 = footprint(h3);
  if (h3.x > 0.0) c = shadeHit(h3, f3, c);
  if (h2.x > 0.0) c = shadeHit(h2, f2, c);
  if (h1.x > 0.0) c = shadeHit(h1, f1, c);
  oColor = vec4(c, 1.0);
}
`;

  const bloomDown = head + `
uniform sampler2D uSrc;
uniform vec2 uSrcTexel;
uniform vec2 uDstTexel;
uniform int uKaris;
out vec4 oColor;

float karis(vec3 c) {
  return 1.0 / (1.0 + dot(c, vec3(0.2126, 0.7152, 0.0722)));
}

void main() {
  vec2 uv = gl_FragCoord.xy * uDstTexel;
  vec2 t = uSrcTexel;
  vec3 a = texture(uSrc, uv + t * vec2(-2.0, 2.0)).rgb;
  vec3 b = texture(uSrc, uv + t * vec2(0.0, 2.0)).rgb;
  vec3 c = texture(uSrc, uv + t * vec2(2.0, 2.0)).rgb;
  vec3 d = texture(uSrc, uv + t * vec2(-2.0, 0.0)).rgb;
  vec3 e = texture(uSrc, uv).rgb;
  vec3 f = texture(uSrc, uv + t * vec2(2.0, 0.0)).rgb;
  vec3 g = texture(uSrc, uv + t * vec2(-2.0, -2.0)).rgb;
  vec3 h = texture(uSrc, uv + t * vec2(0.0, -2.0)).rgb;
  vec3 i = texture(uSrc, uv + t * vec2(2.0, -2.0)).rgb;
  vec3 j = texture(uSrc, uv + t * vec2(-1.0, 1.0)).rgb;
  vec3 k = texture(uSrc, uv + t * vec2(1.0, 1.0)).rgb;
  vec3 l = texture(uSrc, uv + t * vec2(-1.0, -1.0)).rgb;
  vec3 m = texture(uSrc, uv + t * vec2(1.0, -1.0)).rgb;
  vec3 col;
  if (uKaris == 1) {
    vec3 g0 = (a + b + d + e) * 0.25;
    vec3 g1 = (b + c + e + f) * 0.25;
    vec3 g2 = (d + e + g + h) * 0.25;
    vec3 g3 = (e + f + h + i) * 0.25;
    vec3 g4 = (j + k + l + m) * 0.25;
    float w0 = 0.125 * karis(g0);
    float w1 = 0.125 * karis(g1);
    float w2 = 0.125 * karis(g2);
    float w3 = 0.125 * karis(g3);
    float w4 = 0.5 * karis(g4);
    col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / (w0 + w1 + w2 + w3 + w4);
  } else {
    col = e * 0.125 + (a + c + g + i) * 0.03125 + (b + d + f + h) * 0.0625 + (j + k + l + m) * 0.125;
  }
  oColor = vec4(col, 1.0);
}
`;

  const bloomUp = head + `
uniform sampler2D uSrc;
uniform vec2 uSrcTexel;
uniform vec2 uDstTexel;
uniform float uWeight;
out vec4 oColor;

void main() {
  vec2 uv = gl_FragCoord.xy * uDstTexel;
  vec2 t = uSrcTexel;
  vec3 s = texture(uSrc, uv).rgb * 4.0;
  s += (texture(uSrc, uv + vec2(-t.x, 0.0)).rgb + texture(uSrc, uv + vec2(t.x, 0.0)).rgb
      + texture(uSrc, uv + vec2(0.0, -t.y)).rgb + texture(uSrc, uv + vec2(0.0, t.y)).rgb) * 2.0;
  s += texture(uSrc, uv + vec2(-t.x, -t.y)).rgb + texture(uSrc, uv + vec2(t.x, -t.y)).rgb
     + texture(uSrc, uv + vec2(-t.x, t.y)).rgb + texture(uSrc, uv + vec2(t.x, t.y)).rgb;
  oColor = vec4(s * (uWeight / 16.0), 1.0);
}
`;

  const composite = head + `
uniform sampler2D uHdr;
uniform sampler2D uBloom;
uniform vec2 uOutRes;
uniform vec2 uCenter;
uniform float uExposure;
uniform float uBloomStr;
uniform float uGrain;
uniform float uVignette;
uniform float uSeed;
out vec4 oColor;

// ACES filmic fit by Stephen Hill (sRGB -> AP1 -> RRT/ODT -> sRGB).
const mat3 ACES_IN = mat3(0.59719, 0.07600, 0.02840,
                          0.35458, 0.90834, 0.13383,
                          0.04823, 0.01566, 0.83777);
const mat3 ACES_OUT = mat3(1.60475, -0.10208, -0.00327,
                           -0.53108, 1.10813, -0.07276,
                           -0.07367, -0.00605, 1.07602);

vec3 aces(vec3 c) {
  c = ACES_IN * c;
  vec3 a = c * (c + 0.0245786) - 0.000090537;
  vec3 b = c * (0.983729 * c + 0.4329510) + 0.238081;
  return clamp(ACES_OUT * (a / b), 0.0, 1.0);
}

vec3 toSrgb(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uOutRes;
  vec3 c = texture(uHdr, uv).rgb + texture(uBloom, uv).rgb * uBloomStr;
  vec2 q = (uv - uCenter) * vec2(uOutRes.x / uOutRes.y, 1.0);
  c *= 1.0 - uVignette * smoothstep(0.35, 1.25, length(q));
  c = toSrgb(aces(c * uExposure));
  vec2 fc = gl_FragCoord.xy;
  float grain = hash12(fc + uSeed * 37.0) + hash12(fc * 1.37 + uSeed * 91.0) - 1.0;
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  c += grain * uGrain * 0.07 * (0.06 + 4.0 * lum * (1.0 - lum));
  c += (hash12(fc + uSeed * 13.7 + 5.3) - 0.5) / 255.0;
  oColor = vec4(c, 1.0);
}
`;

  BH.Shaders = { vert, trace, shade, bloomDown, bloomUp, composite };
})(window.BH = window.BH || {});
