/*
 * GARGANTUA — shader library
 * --------------------------------------------------------------------------
 * All imagery is procedural. No textures are downloaded at runtime.
 *
 *  · STARFIELD_FRAG   builds a 1024² HDR cubemap of stars and diffraction
 *                     spikes once at startup.
 *  · NEBULA_FRAG      builds a 512² cubemap of low-frequency galactic dust.
 *  · DISK_FRAG        bakes a seamless 2048×1024 polar turbulence field.
 *  · SCENE_FRAG       integrates Schwarzschild null geodesics per pixel,
 *                     lensing both the accretion disk and the sky.
 *
 * Units: Schwarzschild radius Rs = 1. The photon orbit equation is
 *
 *      d²u/dφ² + u = (3/2) · Rs · u²,      u = 1/r
 *
 * solved with velocity Verlet in the orbital plane of every photon.
 */
(function () {
  'use strict';

  const G = (window.GARGANTUA = window.GARGANTUA || {});

  const FULLSCREEN_VERT = `#version 300 es
precision highp float;
out vec2 vUv;

void main() {
  vec2 p = vec2(
    (gl_VertexID == 1) ? 3.0 : -1.0,
    (gl_VertexID == 2) ? 3.0 : -1.0
  );
  vUv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}
`;

  /* ========================================================================
     Stars — rendered into six cube faces, then sampled by final ray direction
     ======================================================================== */

  const STARFIELD_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform int   uFace;
uniform float uDensity;
uniform float uSeed;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 hash42(vec2 p) {
  vec4 p4 = fract(vec4(p.x, p.y, p.x, p.y) * vec4(0.1031, 0.1030, 0.0973, 0.1099));
  p4 += dot(p4, p4.wzxy + 33.33);
  return fract((p4.xxyz + p4.yzzw) * p4.zywx);
}

float faceSeed() {
  return float(uFace) * 17.371 + uSeed * 3.117;
}

vec3 starTint(float h) {
  vec3 cool    = vec3(0.58, 0.72, 1.00);
  vec3 neutral = vec3(1.00, 0.94, 0.84);
  vec3 warm    = vec3(1.00, 0.69, 0.39);
  vec3 c;
  if (h < 0.38) {
    c = mix(cool, neutral, h / 0.38);
  } else {
    c = mix(neutral, warm, (h - 0.38) / 0.62);
  }
  return mix(neutral, c, 0.78);
}

vec3 starLayer(vec2 uv, float cells, float seed, float probability, float brightnessScale, float sizeScale) {
  vec2 p = uv * cells;
  vec2 baseCell = floor(p);
  vec3 accum = vec3(0.0);
  float fs = faceSeed();

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = baseCell + vec2(float(x), float(y));

      float selectHash = hash12(cell + vec2(seed * 19.71 + fs * 31.37, seed * 11.31 - fs * 7.91));
      if (selectHash > probability) continue;

      vec4 h = hash42(cell + vec2(seed * 7.13 + fs * 3.71, seed * 23.93 + fs * 13.17));
      vec2 starUv = (cell + 0.28 + h.xy * 0.44) / cells;
      vec2 d = uv - starUv;
      float dist = length(d);

      float rnd = hash12(cell + vec2(seed * 29.37 - fs * 5.11, seed * 5.71 + fs * 17.73));
      float temperature = hash12(cell + vec2(seed * 43.19 + fs * 2.93, seed * 9.07 - fs * 11.31));
      float radius = mix(0.00042, 0.00102, pow(rnd, 2.7)) * sizeScale;
      if (dist > radius * 4.2) continue;

      float core = exp(-(dot(d, d) / (radius * radius)) * 0.92);
      float halo = exp(-dist / (radius * 1.9)) * 0.011;
      float brightness = (pow(rnd, 10.0) * 7.2 + pow(rnd, 4.0) * 0.12 + 0.0045) * brightnessScale;

      // A handful of hero stars get subtle anamorphic diffraction spikes.
      float spikes = 0.0;
      if (rnd > 0.955) {
        vec2 ad = abs(d) / radius;
        spikes = (exp(-ad.x * 0.55) * exp(-ad.y * 9.0) +
                  exp(-ad.y * 0.55) * exp(-ad.x * 9.0)) * 0.038;
      }

      accum += starTint(temperature) * brightness * (core + halo + spikes);
    }
  }
  return accum;
}

void main() {
  // Face grids are rendered in the same orientation GL uses for cube sampling;
  // a little overlap hides face seams from clipped star glows.
  vec2 uv = vUv;
  float density = clamp(uDensity, 0.25, 2.0);
  vec3 stars = vec3(0.0);

  stars += starLayer(uv,  27.0, 3.17, 0.28 * density, 2.10, 1.12);
  stars += starLayer(uv,  63.0, 8.41, 0.24 * density, 1.05, 0.82);
  stars += starLayer(uv, 128.0, 15.73, 0.18 * density, 0.44, 0.60);

  // Extremely faint unresolved star haze. It keeps the empty sky from feeling
  // like clipped pure black while leaving the event horizon absolutely dark.
  vec2 q = uv * 399.0;
  float haze = hash12(floor(q) + faceSeed());
  stars += vec3(0.0012, 0.0016, 0.0024) * smoothstep(0.72, 0.98, haze);

  stars = min(stars, vec3(48.0));
  fragColor = vec4(stars, 1.0);
}
`;

  /* ========================================================================
     Galactic nebula — a gentle dust band, baked once
     ======================================================================== */

  const NEBULA_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform int uFace;
uniform float uSeed;

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.52;
  for (int i = 0; i < 4; i++) {
    value += amplitude * vnoise(p);
    p = p * 2.03 + vec3(7.1, 3.7, 5.9);
    amplitude *= 0.5;
  }
  return value;
}

vec3 faceDirection(vec2 uv) {
  vec2 s = uv * 2.0 - 1.0;
  vec3 dir;
  if (uFace == 0) {
    dir = vec3( 1.0, -s.y, -s.x);
  } else if (uFace == 1) {
    dir = vec3(-1.0, -s.y,  s.x);
  } else if (uFace == 2) {
    dir = vec3( s.x,  1.0,  s.y);
  } else if (uFace == 3) {
    dir = vec3( s.x, -1.0, -s.y);
  } else if (uFace == 4) {
    dir = vec3( s.x, -s.y,  1.0);
  } else {
    dir = vec3(-s.x, -s.y, -1.0);
  }
  return normalize(dir);
}

void main() {
  vec3 dir = faceDirection(vUv);

  // A wide galactic plane crossing the sky at a cinematic diagonal.
  vec3 bandNormal = normalize(vec3(0.34, 0.82, 0.46));
  float latitude = dot(dir, bandNormal);
  float band = exp(-latitude * latitude * 19.0);

  vec3 axis = normalize(vec3(-0.58, 0.12, -0.80));
  float core = pow(max(dot(dir, axis), 0.0), 9.0);

  vec3 p = dir * 3.0 + vec3(uSeed * 0.37);
  float cloudA = fbm(p * 1.55 + vec3(1.7, -2.1, 0.8));
  float cloudB = fbm(p * 3.4 - vec3(4.1, 1.3, 2.7));
  float dust = smoothstep(0.40, 0.68, cloudB + latitude * 0.22 + 0.12);
  float detail = fbm(p * 7.6 + vec3(8.2, -3.1, 1.4));

  float wisps = smoothstep(0.42, 0.78, cloudA + cloudB * 0.32);
  float lanes = smoothstep(0.44, 0.63, detail + cloudA * 0.18);
  float structure = wisps * (1.0 - 0.84 * dust * lanes);

  vec3 cool = vec3(0.016, 0.027, 0.055);
  vec3 warm = vec3(0.090, 0.043, 0.019);
  vec3 tint = mix(cool, warm, smoothstep(0.24, 0.84, cloudB + detail * 0.16));
  vec3 color = tint * structure * (0.22 + 1.05 * band);
  color += vec3(0.090, 0.060, 0.032) * core * band * (0.24 + 0.62 * wisps);

  // Very low-amplitude scatter outside the galactic plane.
  color += vec3(0.012, 0.017, 0.028) * pow(cloudA, 3.0) * 0.10;

  fragColor = vec4(max(color, 0.0) * 0.30, 1.0);
}
`;

  /* ========================================================================
     Accretion disk turbulence — seamless in azimuth, radial in V
     ======================================================================== */

  const DISK_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

#define PI  3.141592653589793
#define TAU 6.283185307179586

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash13(i);
  float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

  float x00 = mix(n000, n100, f.x);
  float x10 = mix(n010, n110, f.x);
  float x01 = mix(n001, n101, f.x);
  float x11 = mix(n011, n111, f.x);
  return mix(mix(x00, x10, f.y), mix(x01, x11, f.y), f.z);
}

float fbm(vec3 p, int octaves) {
  float value = 0.0;
  float amplitude = 0.54;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    value += amplitude * vnoise(p);
    p = p * 2.03 + vec3(6.7, 2.9, 4.3);
    amplitude *= 0.5;
  }
  return value;
}

float cylindricalNoise(float theta, float radius, float frequency, float zScale, int octaves) {
  // Sampling a 3D noise field on a cylinder guarantees a seamless azimuth.
  vec3 p = vec3(cos(theta) * frequency, sin(theta) * frequency, radius * zScale + frequency * 0.37);
  return fbm(p, octaves);
}

void main() {
  float theta = vUv.x * TAU;
  float radius = vUv.y;

  float n1 = cylindricalNoise(theta, radius, 1.65, 4.8, 4);
  float n2 = cylindricalNoise(theta, radius, 5.30, 13.0, 4);
  float n3 = cylindricalNoise(theta, radius, 13.2, 33.0, 3);

  // A layered Keplerian spiral. The squared sine produces incandescent
  // filaments separated by darker troughs.
  float warp = n1 * 1.45 + n2 * 0.78;
  float spiral = 0.5 + 0.5 * sin(theta * 5.0 + 2.2 * log(radius + 0.15) + warp * 7.0);
  float filament = pow(smoothstep(0.31, 1.0, spiral), 2.2);
  float fineFilament = pow(0.5 + 0.5 * sin(theta * 47.0 + n3 * 29.0 + radius * 3.5), 12.0);
  float ridged = 1.0 - abs(2.0 * n2 - 1.0);

  float cloud = n1 * 0.44 + n2 * 0.35 + n3 * 0.21;
  float density = smoothstep(0.26, 0.78, cloud + filament * 0.18 + ridged * 0.12);
  density *= 0.55 + 0.45 * ridged;

  float detail = smoothstep(0.20, 0.84, n2 * 0.30 + n3 * 0.45 + filament * 0.18 + fineFilament * 0.20);
  float hot = smoothstep(0.55, 0.90, n2 * 0.25 + filament * 0.48 + ridged * 0.18 + fineFilament * 0.16);
  float opacity = clamp(density * 0.84 + detail * 0.30 + 0.20, 0.0, 1.0);

  // Feather the radial ends of the map; the shader adds the physical edges.
  float edge = smoothstep(0.0, 0.016, radius) * (1.0 - smoothstep(0.982, 1.0, radius));

  fragColor = vec4(detail * edge, density * edge, hot * edge, opacity * edge);
}
`;

  /* ========================================================================
     Scene — one geodesic per pixel
     ======================================================================== */

  const SCENE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
precision highp samplerCube;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;
uniform float uDiskTime;
uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamForward;
uniform float uTanHalfFov;
uniform float uAspect;
uniform float uOffsetX;

uniform float uLensing;
uniform float uStepScale;
uniform float uShowDisk;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskTemperature;
uniform float uDiskBrightness;
uniform float uTurbulence;
uniform float uDoppler;
uniform float uPhotonRing;
uniform float uStarBrightness;
uniform float uNebula;

uniform sampler2D   uDiskTex;
uniform samplerCube uStarTex;
uniform samplerCube uNebulaTex;

#define PI        3.141592653589793
#define TAU       6.283185307179586
#define RS        1.0
#define ESCAPE_R  96.0
#define MAX_STEPS 480

/* ------------------------------------------------------------- blackbody */

vec3 blackbodyLinear(float kelvin) {
  float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  float r;
  float g;
  float b;

  if (t <= 66.0) {
    r = 1.0;
    g = clamp(0.3900815 * log(t) - 0.6318414, 0.0, 1.0);
  } else {
    r = clamp(1.292936 * pow(t - 60.0, -0.1332047), 0.0, 1.0);
    g = clamp(1.129891 * pow(t - 60.0, -0.0755148), 0.0, 1.0);
  }

  if (t >= 66.0) {
    b = 1.0;
  } else if (t <= 19.0) {
    b = 0.0;
  } else {
    b = clamp(0.5432068 * log(t - 10.0) - 1.196254, 0.0, 1.0);
  }

  vec3 srgb = vec3(r, g, b);
  vec3 lin = pow(srgb, vec3(2.2));
  float luma = dot(lin, vec3(0.2126, 0.7152, 0.0722));
  return max(mix(vec3(luma), lin, 1.18), 0.0);
}

/* ---------------------------------------------------------------- deep sky */

vec3 sampleSky(vec3 dir) {
  vec3 stars = textureLod(uStarTex, dir, 0.0).rgb * uStarBrightness;
  vec3 nebula = textureLod(uNebulaTex, dir, 0.0).rgb * uNebula;
  // This floor is a filmic choice, not light from the event horizon.
  return stars + nebula + vec3(0.00055, 0.00068, 0.0010);
}

/* ------------------------------------------------------------ accretion disk */

vec4 sampleDisk(vec3 pos, vec3 rayDir) {
  float r = length(pos.xz);
  float rIn = uDiskInner;
  float rOut = max(uDiskOuter, rIn + 0.35);

  if (r < rIn * 0.94 || r > rOut * 1.035) return vec4(0.0);

  float t = clamp((r - rIn) / (rOut - rIn), 0.0, 1.0);
  float innerFade = smoothstep(0.0, 0.015, t);
  float outerFade = 1.0 - smoothstep(0.72, 1.0, t);
  float edge = innerFade * outerFade;

  // The angular coordinate is advanced by a radius-dependent Keplerian rate,
  // so the inner disk visibly shears past the outer flow.
  float angle = atan(pos.z, pos.x);
  float omega = 0.55 * pow(rIn / max(r, 0.5), 1.38);
  vec2 uv = vec2(angle / TAU + uDiskTime * omega, t);
  vec4 tex = textureLod(uDiskTex, uv, 0.0);

  float turbulence = clamp(uTurbulence, 0.0, 2.0);
  float density = mix(0.54, tex.g, clamp(turbulence, 0.0, 1.0));
  float detail = mix(0.52, tex.r, clamp(turbulence * 0.85, 0.0, 1.0));
  float hot = tex.b;
  float hotMix = clamp(tex.b + 0.22 * smoothstep(0.55, 0.95, detail), 0.0, 1.0);

  // Radial temperature structure: an incandescent inner rim fading into a
  // deep amber outer flow. This is the film's signature colour ramp.
  float temperature = uDiskTemperature *
      (0.41 + 0.80 * pow(rIn / max(r, 0.2), 0.74));
  float grav = sqrt(max(1.0 - RS / max(r, 1.001), 0.0));

  vec3 velDir = normalize(vec3(-pos.z, 0.0, pos.x));
  float beta = clamp(sqrt(0.5 / max(r, 1.55)), 0.0, 0.66);
  float gamma = inversesqrt(max(1.0 - beta * beta, 0.001));
  float mu = clamp(dot(velDir, -rayDir), -1.0, 1.0);
  float delta = 1.0 / max(gamma * (1.0 - beta * mu), 0.045);

  float shift = grav * mix(1.0, delta, clamp(uDoppler, 0.0, 1.0));
  temperature *= clamp(shift, 0.48, 2.4);

  // A steep radial falloff leaves a dark, structured outer flow and a
  // brilliant core, instead of a uniformly clipped white pancake.
  float radial = 0.10 + 1.02 * pow(rIn / max(r, 0.2), 2.15);
  float rim = exp(-pow((r - rIn) / (rIn * 0.085), 2.0)) * innerFade;
  float energy = uDiskBrightness * 1.5 * edge *
      (0.18 + 1.28 * radial) * (0.35 + 0.95 * density);
  energy *= 0.82 + 0.36 * detail;
  energy += uDiskBrightness * rim * 0.62;
  energy *= mix(1.0, clamp(pow(delta, 2.5), 0.20, 3.8), clamp(uDoppler, 0.0, 1.0) * 0.92);

  vec3 color = blackbodyLinear(temperature);
  // White-hot filaments, but never enough to turn the whole disk into a lamp.
  float whiten = clamp(rim * 0.48 + hotMix * 0.08, 0.0, 0.46);
  float coolBias = smoothstep(6200.0, 11000.0, uDiskTemperature);
  vec3 hotTint = mix(vec3(1.0, 0.88, 0.70), vec3(0.84, 0.92, 1.08), coolBias * 0.72);
  color = mix(color, hotTint, whiten);
  color = mix(color, color * vec3(0.84, 0.92, 1.2), coolBias * 0.55);
  color *= 1.0 + 0.22 * smoothstep(0.55, 0.95, detail);

  // Very gradual extinction at the outer edge keeps the lensed arcs cohesive.
  float alpha = clamp(edge * (0.70 + 0.25 * tex.a + 0.05 * density), 0.0, 0.985);
  return vec4(color * max(energy, 0.0), alpha);
}

/* --------------------------------------------------------------------- main */

void main() {
  vec2 ndc = gl_FragCoord.xy / uResolution * 2.0 - 1.0;

  // A small principal-point shift balances the composition against the UI.
  vec3 rayDir = normalize(
    uCamForward +
    uCamRight * ((ndc.x + uOffsetX) * uTanHalfFov * uAspect) +
    uCamUp * (ndc.y * uTanHalfFov)
  );

  vec3 ro = uCamPos;
  float radius0 = max(length(ro), 1.001);
  vec3 e1 = ro / radius0;

  float cosAlpha = dot(rayDir, e1);
  vec3 tangent = rayDir - e1 * cosAlpha;
  float sinAlpha = length(tangent);

  // Rays aimed exactly at the singularity have no orbital plane and are
  // captured anyway. The central pixels of the shadow should be black.
  if (sinAlpha < 0.0015) {
    fragColor = vec4(0.0, 0.0, 0.0, 1.0);
    return;
  }

  vec3 e2 = tangent / sinAlpha;

  // Impact parameter in the static observer's local frame.
  float b = radius0 * sinAlpha * inversesqrt(max(1.0 - RS / radius0, 0.0025));
  float u = 1.0 / radius0;
  float du2 = 1.0 / (b * b) - u * u + RS * u * u * u;
  float du = -sign(cosAlpha) * sqrt(max(du2, 0.0));
  float phi = 0.0;

  float transmittance = 1.0;
  vec3 accum = vec3(0.0);
  bool captured = false;
  bool escaped = false;

  float dphi = max(uStepScale, 0.006);

  for (int i = 0; i < MAX_STEPS; i++) {
    float rHere = 1.0 / max(u, 1.0e-6);
    float stepNow = dphi * mix(0.32, 1.0, smoothstep(1.53, 3.2, rHere));

    // Velocity Verlet integration of u'' = -u + 1.5·Rs·u². Lensing strength
    // scales the curvature term for artistic inspection of the geometry.
    float a0 = -u + 1.5 * uLensing * u * u;
    float uMid = u + 0.5 * stepNow * du;
    float duMid = du + 0.5 * stepNow * a0;
    float aMid = -uMid + 1.5 * uLensing * uMid * uMid;
    float uNext = u + stepNow * duMid;
    float duNext = du + stepNow * aMid;
    float phiNext = phi + stepNow;
    float rNext = 1.0 / max(uNext, 1.0e-6);

    // Detect the equatorial-plane crossings of this ray. Each crossing is a
    // possible image of the disk: direct, lensed, or higher-order.
    if (uShowDisk > 0.5) {
      vec3 radialNow = cos(phi) * e1 + sin(phi) * e2;
      vec3 radialNext = cos(phiNext) * e1 + sin(phiNext) * e2;
      float y0 = radialNow.y / max(u, 1.0e-6);
      float y1 = radialNext.y / max(uNext, 1.0e-6);

      if (y0 * y1 < 0.0) {
        float frac = clamp(y0 / (y0 - y1), 0.0, 1.0);
        float phiC = phi + stepNow * frac;
        float uC = mix(u, uNext, frac);
        float duC = mix(du, duNext, frac);
        float rC = 1.0 / max(uC, 1.0e-6);

        if (rC > uDiskInner * 0.91 && rC < uDiskOuter * 1.06) {
          vec3 radialC = cos(phiC) * e1 + sin(phiC) * e2;
          vec3 tangentC = -sin(phiC) * e1 + cos(phiC) * e2;
          vec3 pos = radialC * rC;
          vec3 velocity = (-duC / (uC * uC)) * radialC + (1.0 / uC) * tangentC;
          vec3 crossingDir = normalize(velocity);
          vec4 disk = sampleDisk(pos, crossingDir);

          if (disk.a > 0.002) {
            accum += transmittance * disk.rgb * disk.a;
            transmittance *= 1.0 - disk.a;
            if (transmittance < 0.006) break;
          }
        }
      }
    }

    if (uNext >= 1.0 || rNext < RS) {
      captured = true;
      break;
    }

    if (rNext > ESCAPE_R && duNext < 0.0) {
      escaped = true;
      break;
    }

    if (uNext <= 1.0e-5) {
      escaped = duNext <= 0.0;
      break;
    }

    u = uNext;
    du = duNext;
    phi = phiNext;
  }

  if (!captured && escaped) {
    // Use the asymptotic velocity, not the finite-radius position, or point
    // stars smear into radial streaks near the shadow.
    vec3 radialDir = cos(phi) * e1 + sin(phi) * e2;
    vec3 tangentDir = -sin(phi) * e1 + cos(phi) * e2;
    vec3 skyDir = normalize(
      (-du / max(u * u, 1.0e-9)) * radialDir +
      (1.0 / max(u, 1.0e-9)) * tangentDir
    );
    accum += transmittance * sampleSky(skyDir);
  }

  float rPhoton = 1.5 * mix(1.0, uLensing, 0.72);
  float bCrit = rPhoton * inversesqrt(max(1.0 - 1.0 / rPhoton, 0.075));

  // On a physically thin disk, some foreground plasma is visible across the
  // shadow. A gentle cinematic veil keeps the event horizon legible while
  // preserving the direct disk line across its equator.
  if (captured) {
    float veil = mix(0.28, 0.76, smoothstep(0.0, bCrit, b));
    accum *= veil;
  }

  // The critical photon orbit produces a razor-thin ring. The real higher-order
  // disk images are resolved by the integration; this adds the unresolved
  // contribution that cinema renders as a glowing edge.
  if (uPhotonRing > 0.001) {
    float width = 0.036 + 0.012 / max(uLensing, 0.6);
    float ring = exp(-pow((b - bCrit) / width, 2.0));
    ring *= smoothstep(bCrit - 0.16, bCrit - 0.012, b);
    float ringPower = uPhotonRing * (0.10 + 0.72 * uShowDisk) * (0.34 + 0.66 * transmittance);
    accum += blackbodyLinear(uDiskTemperature * 1.05) * ring * ringPower * 0.92;

    // A barely-there halo just outside the shadow, like scattered disk light.
    float halo = exp(-pow((b - bCrit - 0.14) / 0.48, 2.0)) * 0.014;
    accum += blackbodyLinear(uDiskTemperature * 0.92) * halo * uPhotonRing * uShowDisk;
  }

  accum = clamp(accum, vec3(0.0), vec3(96.0));
  fragColor = vec4(accum, 1.0);
}
`;

  /* ========================================================================
     Post-processing
     ======================================================================== */

  const BRIGHT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform vec2 uSourceTexel;
uniform float uThreshold;

void main() {
  vec2 o = uSourceTexel;
  vec3 c = texture(uScene, vUv + vec2(-o.x, -o.y)).rgb;
  c += texture(uScene, vUv + vec2( o.x, -o.y)).rgb;
  c += texture(uScene, vUv + vec2(-o.x,  o.y)).rgb;
  c += texture(uScene, vUv + vec2( o.x,  o.y)).rgb;
  c *= 0.25;
  c = min(c, vec3(40.0));

  float level = max(max(c.r, c.g), c.b);
  float knee = smoothstep(uThreshold, uThreshold + 0.85, level);
  fragColor = vec4(c * knee, 1.0);
}
`;

  const BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uImage;
uniform vec2 uTexel;
uniform vec2 uDirection;

void main() {
  vec2 stepUv = uTexel * uDirection;
  vec3 c = texture(uImage, vUv).rgb * 0.2270270270;
  c += texture(uImage, vUv + stepUv * 1.3846153846).rgb * 0.3162162162;
  c += texture(uImage, vUv - stepUv * 1.3846153846).rgb * 0.3162162162;
  c += texture(uImage, vUv + stepUv * 3.2307692308).rgb * 0.0702702703;
  c += texture(uImage, vUv - stepUv * 3.2307692308).rgb * 0.0702702703;
  fragColor = vec4(c, 1.0);
}
`;

  const COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;

uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform vec2  uResolution;
uniform float uTime;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uVignette;
uniform float uGrain;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 acesFilm(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = vUv;
  vec2 centered = uv - 0.5;
  float aspect = uResolution.x / max(uResolution.y, 1.0);

  // Edge-only lateral chromatic aberration.
  float radius2 = dot(centered, centered);
  float edge = smoothstep(0.02, 0.42, radius2);
  vec2 ca = centered * (0.0007 + edge * 0.0018);
  vec3 scene;
  scene.r = texture(uScene, uv + ca).r;
  scene.g = texture(uScene, uv).g;
  scene.b = texture(uScene, uv - ca).b;

  vec3 bloom = texture(uBloom, uv).rgb;
  vec2 sx = vec2(0.016, 0.0);
  vec3 streak = texture(uBloom, uv + sx).rgb +
                texture(uBloom, uv - sx).rgb +
                0.55 * texture(uBloom, uv + sx * 2.7).rgb +
                0.55 * texture(uBloom, uv - sx * 2.7).rgb;
  vec3 color = scene;
  color += bloom * uBloomStrength * 0.82;
  color += streak * vec3(1.0, 0.67, 0.38) * uBloomStrength * 0.11;

  color *= uExposure;

  // Gentle warm highlight / cool shadow split, after the film's orange
  // highlights and near-black space.
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 warm = color * vec3(1.055, 1.0, 0.915);
  vec3 cool = color * vec3(0.955, 0.98, 1.025);
  color = mix(cool, warm, smoothstep(0.05, 1.8, luma));

  color = acesFilm(color);
  color = pow(max(color, 0.0), vec3(1.0 / 2.2));

  // Golden highlight bias, kept gentle so blue-temperature presets survive.
  vec3 gold = vec3(1.0, 0.91, 0.78);
  color = mix(color, color * gold, smoothstep(0.34, 1.0, dot(color, vec3(0.333))) * 0.16);

  // Optical vignette.
  vec2 q = centered * vec2(aspect * 0.78, 1.0);
  float v = length(q * 1.16);
  color *= 1.0 - clamp(uVignette, 0.0, 1.0) * 0.52 * smoothstep(0.30, 1.04, v);

  // Film grain, slightly stronger in mid-tones. The grain is part of the
  // observatory's visual language and also dithers HDR gradients.
  float grain = hash12(uv * uResolution + vec2(fract(uTime) * 317.7, fract(uTime) * 171.3)) - 0.5;
  float grainMod = 0.55 + 0.75 * (1.0 - abs(luma - 0.38));
  color += grain * uGrain * 0.043 * grainMod;

  // Fine static dither against banding in the shadow falloff.
  color += (hash12(uv * uResolution + vec2(19.7, 7.3)) - 0.5) / 255.0;
  color += vec3(0.0007, 0.00065, 0.0006);

  fragColor = vec4(clamp(color, 0.0, 1.0), 1.0);
}
`;

  G.SHADERS = {
    FULLSCREEN_VERT,
    STARFIELD_FRAG,
    NEBULA_FRAG,
    DISK_FRAG,
    SCENE_FRAG,
    BRIGHT_FRAG,
    BLUR_FRAG,
    COMPOSITE_FRAG,
  };
})();
