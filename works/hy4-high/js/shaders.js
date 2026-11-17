/* =========================================================================
   GARGANTUA — shaders
   Pure WebGL2 / GLSL ES 3.00. No external runtime dependencies.
   The black hole is rendered by integrating null geodesics of the
   Schwarzschild metric in Cartesian form:

        d²r⃗/dλ² = - (3/2) · r_s · h² · r⃗ / |r|⁵ ,   h = |r⃗ × v⃗| = b

   which reproduces the GR light deflection  Δφ = 2 r_s / b, the photon
   sphere at 1.5 r_s and the shadow (critical impact parameter) 2.598 r_s.
   ========================================================================= */
(function () {
  'use strict';

  /* Fullscreen triangle — no vertex buffers needed, gl_VertexID does it. */
  const VERT = `#version 300 es
precision highp float;
out vec2 vUv;
void main(){
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  /* ---------------------------------------------------------------- BLACK HOLE */
  const BLACKHOLE = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
out vec4 fragColor;

uniform vec2  uResolution;
uniform vec3  uCamPos;
uniform mat3  uCamBasis;      // columns: right, up, forward
uniform float uTanHalfFov;
uniform float uCamDist;
uniform float uTime;
uniform float uShiftX;        // lens shift so the hole stays visually centred

// black hole
uniform float uRs;            // event horizon radius (world units)
uniform float uLens;          // artistic lensing multiplier
uniform float uSpin;          // orbital velocity / frame-dragging flavour
uniform float uPhotonRing;    // extra glow on the critical ring

// accretion disk
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskBright;
uniform float uDiskTemp;
uniform float uTurbulence;
uniform float uDoppler;
uniform float uRotation;
uniform float uDiskSoft;

// sky
uniform float uStarDensity;
uniform float uStarBright;
uniform float uNebula;

uniform int   uSteps;

#define MAX_STEPS 400
const float PI = 3.14159265359;

/* ------------------------------ hashing / noise ------------------------------ */
float hash11(float p){
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
float hash13(vec3 p3){
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}
vec3 hash33(vec3 p3){
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}
float noise3(vec3 x){
  vec3 p = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 57.0 + p.z * 113.0;
  float a = hash11(n),        b = hash11(n + 1.0);
  float c = hash11(n + 57.0), d = hash11(n + 58.0);
  float e = hash11(n + 113.0),g = hash11(n + 114.0);
  float h = hash11(n + 170.0),k = hash11(n + 171.0);
  return mix(mix(mix(a,b,f.x), mix(c,d,f.x), f.y),
             mix(mix(e,g,f.x), mix(h,k,f.x), f.y), f.z);
}
float noise2(vec2 x){
  vec2 p = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n = p.x + p.y * 57.0;
  return mix(mix(hash11(n), hash11(n + 1.0), f.x),
             mix(hash11(n + 57.0), hash11(n + 58.0), f.x), f.y);
}
float fbm2(vec2 p){
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){
    s += a * noise2(p);
    p = p * 2.07 + vec2(19.1, 7.3);
    a *= 0.5;
  }
  return s / 0.9375;
}

/* -------------------------------- star field --------------------------------- */
vec3 starLayer(vec3 dir, float scale, float density, float sharp){
  vec3 p    = dir * scale;
  vec3 cell = floor(p);
  vec3 f    = fract(p);
  vec3 rnd  = hash33(cell);
  if (rnd.z > 1.0 - density) {
    vec3 off = vec3(0.22) + 0.56 * hash33(cell + 19.73);
    vec3 dv  = f - off;
    float d2 = dot(dv, dv);
    float b  = pow(hash13(cell + 3.71), 2.4);
    float core = exp(-d2 * sharp);
    float halo = 0.10 * exp(-d2 * sharp * 0.09);
    vec3 tint = mix(vec3(1.0, 0.74, 0.52),
                    vec3(0.68, 0.82, 1.0), hash13(cell + 7.37));
    return tint * b * (core + halo) * 1.9;
  }
  return vec3(0.0);
}

vec3 sky(vec3 dir){
  dir = normalize(dir);
  vec3 col = vec3(0.0);

  // faint interstellar dust / nebula
  float n1 = noise3(dir * 2.2 + 5.0);
  float n2 = noise3(dir * 3.6 - 2.0);
  vec3 neb = mix(vec3(0.006, 0.012, 0.030), vec3(0.020, 0.010, 0.038), n2);
  col += neb * (n1 * n1) * uNebula * 1.10;

  // a soft galactic band, fixed in world space so lensing warps it
  vec3 bandN = normalize(vec3(0.28, 0.91, 0.30));
  float band = exp(-pow(dot(dir, bandN) * 3.1, 2.0));
  col += vec3(0.012, 0.020, 0.038) * band * (0.4 + n2) * uNebula;

  // three star layers: bright nearby, dense mid, faint far
  float d = clamp(uStarDensity, 0.0, 3.0);
  col += starLayer(dir,  32.0, 0.075 * d,  420.0) * 1.00;
  col += starLayer(dir,  78.0, 0.060 * d, 1500.0) * 0.60;
  col += starLayer(dir, 165.0, 0.035 * d, 4200.0) * 0.28;

  return col * uStarBright;
}

/* ----------------------------- accretion disk -------------------------------- */
vec3 diskEmission(vec3 p, vec3 rd, float inner, float outer, out float alpha){
  float r = length(p.xz);
  float t = clamp((r - inner) / max(0.001, outer - inner), 0.0, 1.0);

  float soft = mix(0.015, 0.30, clamp(uDiskSoft, 0.0, 1.0));
  float edge = smoothstep(0.0, soft, t) * (1.0 - smoothstep(0.74, 1.0, t));
  float radial = 0.22 + 0.95 * pow(1.0 - t, 1.55);
  float rim = exp(-pow((r - inner) / (0.42 * uRs + 0.30), 2.0));

  // differentially rotating (Keplerian) turbulent filaments — seamless in angle
  float omega = uRotation * 1.8 * pow(max(r, inner), -1.15);
  float rot = uTime * omega;
  float c = cos(rot), s = sin(rot);
  vec2 xy = mat2(c, -s, s, c) * p.xz;
  // domain warp breaks up the noise grid into organic filaments
  vec2 warp = vec2(noise2(xy * 0.35), noise2(xy * 0.35 + vec2(7.1, 3.3)));
  vec2 xw = xy + (warp - 0.5) * 2.6;
  float n1 = fbm2(xw * 1.70);
  float n2 = fbm2(xw * 4.80 + vec2(3.7, -1.2));
  float fil = clamp(n1 * 0.62 + n2 * 0.62 - 0.18, 0.0, 1.0);
  float dens = mix(1.0, 0.38 + 1.25 * fil, clamp(uTurbulence, 0.0, 1.0));
  dens = max(dens, 0.05);

  // radial temperature: white-hot inside, cooler outside. uDiskTemp shifts
  // the whole palette from warm gold toward blue-white.
  vec3 hot  = mix(vec3(1.00, 0.86, 0.60), vec3(0.80, 0.90, 1.00), uDiskTemp);
  vec3 cool = mix(vec3(0.85, 0.30, 0.07), vec3(0.28, 0.44, 0.95), uDiskTemp * uDiskTemp);
  vec3 col = mix(hot, cool, pow(t, 0.55));
  col = mix(col, vec3(1.0, 0.975, 0.92), 0.38 * rim);

  // relativistic Doppler beaming + colour shift
  vec3 vdir = normalize(vec3(p.z, 0.0, -p.x) + vec3(1e-5, 0.0, 0.0));
  float beta = clamp(sqrt(0.5 * uRs / max(r, uRs)) * (0.55 + 0.70 * uSpin), 0.0, 0.88);
  float mu = dot(vdir, -normalize(rd));
  float dop = 1.0 / max(0.12, 1.0 - beta * mu);
  float boost = clamp(pow(dop, 1.0 + 2.5 * uDoppler), 0.25, 4.0);
  col *= mix(vec3(1.0), vec3(0.76, 0.92, 1.38), clamp((dop - 1.0) * 0.85 * uDoppler, 0.0, 1.0));
  col *= mix(vec3(1.0), vec3(1.22, 0.86, 0.64), clamp((1.0 - dop) * 0.85 * uDoppler, 0.0, 1.0));

  float em = (radial * edge + 0.55 * rim) * dens * boost * uDiskBright * 0.42;
  alpha = clamp((radial * edge + 0.55 * rim) * dens * 0.82, 0.0, 0.92);
  return col * em;
}

/* ------------------------------------ main ----------------------------------- */
void main(){
  vec2 uv = vUv * 2.0 - 1.0;
  uv.x += uShiftX;
  float aspect = uResolution.x / uResolution.y;
  vec3 rd = normalize(uCamBasis[2]
                    + (uv.x * aspect * uTanHalfFov) * uCamBasis[0]
                    + (uv.y * uTanHalfFov) * uCamBasis[1]);
  vec3 pos = uCamPos;

  // h² = b² (impact parameter), conserved along the null geodesic
  vec3 hv = cross(pos, rd);
  float h2 = dot(hv, hv);

  float horizon = uRs;
  float escapeR = uCamDist * 1.08 + 6.0;
  float inner = max(uDiskInner, 2.62 * uRs);
  float outer = max(uDiskOuter, inner + 1.0);

  vec3  col   = vec3(0.0);
  float trans = 1.0;
  float minR  = 1e9;
  int   hits  = 0;
  bool  captured = false;
  vec3  prevPos = pos;

  for (int i = 0; i < MAX_STEPS; i++){
    if (i >= uSteps) break;

    float r2 = dot(pos, pos);
    float r  = sqrt(r2);
    minR = min(minR, r);

    if (r < horizon){ captured = true; break; }
    // Inside the photon sphere (for full-strength lensing) no null geodesic
    // can return to infinity — terminate early for a crisp shadow and speed.
    if (uLens > 0.98 && r < 1.5 * uRs){ captured = true; break; }
    if (dot(pos, rd) > 0.0 && r > escapeR) break;   // freely escaping

    float dt = clamp(0.055 * r, 0.012, 0.85);

    // geodesic acceleration (Schwarzschild, Cartesian form)
    vec3 acc = -1.5 * uRs * uLens * h2 * pos / (r2 * r2 * r);
    vec3 nrd = rd + acc * dt;
    vec3 npos = pos + nrd * dt;

    // equatorial-plane crossing -> sample the (optically thin) disk.
    // Rays that wind around the hole cross it several times: those extra
    // images are exactly the lensed "halo" above and below Gargantua.
    if (prevPos.y * npos.y < 0.0 && hits < 8 && trans > 0.015){
      float f = prevPos.y / (prevPos.y - npos.y);
      vec3 cp = mix(prevPos, npos, f);
      float cr = length(cp.xz);
      if (cr > inner && cr < outer){
        float a;
        vec3 e = diskEmission(cp, nrd, inner, outer, a);
        col += e * trans;
        trans *= (1.0 - 0.58 * a);
        hits++;
      }
    }

    prevPos = npos;
    pos = npos;
    rd  = nrd;
  }

  // Any ray whose periapsis drops below the photon sphere cannot escape.
  // Using this as a second capture test keeps the shadow perfectly black even
  // when the step budget is exhausted before the ray reaches the horizon.
  if (!captured && uLens > 0.02 && minR < 1.47 * uRs * min(uLens, 1.4)) {
    captured = true;
  }

  // thin bright photon ring at the critical impact parameter
  if (!captured){
    float ring = smoothstep(0.34 * uRs, 0.0, abs(minR - 1.5 * uRs));
    col += vec3(1.0, 0.90, 0.72) * ring * ring * uPhotonRing * 0.42 * trans;
    col += sky(rd) * trans;
  }

  fragColor = vec4(col, 1.0);
}`;

  /* ---------------------------- bloom blur / bright pass ---------------------- */
  const BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2  uTexel;      // texel size of the SOURCE texture
uniform vec2  uDir;
uniform float uSpacing;
uniform float uThreshold;
uniform int   uExtract;

void main(){
  vec3 sum = vec3(0.0);
  float wsum = 0.0;
  for (int i = -7; i <= 7; i++){
    float fi = float(i);
    float w = exp(-0.5 * (fi / 3.1) * (fi / 3.1));
    vec3 c = texture(uTex, vUv + uDir * uTexel * uSpacing * fi).rgb;
    if (uExtract == 1){
      float l = max(max(c.r, c.g), c.b);
      c *= smoothstep(uThreshold, uThreshold + 0.65, l);
    }
    sum += c * w;
    wsum += w;
  }
  fragColor = vec4(sum / wsum, 1.0);
}`;

  /* --------------------------------- composite -------------------------------- */
  const COMPOSITE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom1;
uniform sampler2D uBloom2;
uniform float uExposure;
uniform float uBloomStrength;
uniform float uChroma;
uniform float uVignette;
uniform float uTime;

vec3 aces(vec3 x){
  const float a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
float hash12(vec2 p){
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main(){
  vec2 dc = vUv - 0.5;
  vec2 off = dc * uChroma;
  vec3 scene;
  scene.r = texture(uScene, vUv + off).r;
  scene.g = texture(uScene, vUv).g;
  scene.b = texture(uScene, vUv - off).b;

  vec3 bloom = texture(uBloom1, vUv).rgb * 0.46
             + texture(uBloom2, vUv).rgb * 0.82;
  vec3 c = (scene + bloom * uBloomStrength) * uExposure;
  c = aces(c);

  c *= clamp(1.0 - uVignette * dot(dc, dc) * 1.65, 0.0, 1.0);
  c += (hash12(gl_FragCoord.xy + uTime * 41.0) - 0.5) * 0.006;
  c = pow(max(c, 0.0), vec3(1.0 / 2.2));
  fragColor = vec4(c, 1.0);
}`;

  window.BH_SHADERS = { VERT, BLACKHOLE, BLUR, COMPOSITE };
})();
