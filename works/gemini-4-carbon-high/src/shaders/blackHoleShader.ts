export const BLACK_HOLE_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

export const BLACK_HOLE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform vec2 uResolution;
uniform float uTime;

// Camera basis
uniform vec3 uCamPos;
uniform vec3 uCamForward;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform float uTanHalfFov;

// Black hole spacetime
uniform float uMass;
uniform float uSpin;
uniform float uLensingStrength;

// Accretion disk
uniform float uShowDisk;
uniform float uDiskInner;
uniform float uDiskOuter;
uniform float uDiskThickness;
uniform float uDiskDensity;
uniform float uDiskTemp;
uniform float uDiskSpeed;
uniform float uDopplerBeaming;
uniform float uGravRedshift;
uniform float uPhotonRingBoost;

// Cosmos background
uniform float uStarDensity;
uniform float uNebulaIntensity;

// Raymarch quality
uniform int uMaxSteps;
uniform float uStepScale;

#define PI 3.14159265359

// ---------------------------------------------------------------------------
// High-speed deterministic hashes & 3D smooth noise
// ---------------------------------------------------------------------------
float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

vec3 hash33(vec3 p3) {
  p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yxz + 33.33);
  return fract((p3.xxy + p3.yxx) * p3.zyx);
}

float noise3D(vec3 x) {
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

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);

  return mix(mix(nx00, nx10, f.y), mix(nx01, nx11, f.y), f.z);
}

float fbm3Fast(vec3 p) {
  float v = 0.5333 * noise3D(p);
  p = p * 2.07 + vec3(13.1, 7.7, 19.3);
  v += 0.2667 * noise3D(p);
  p = p * 2.07 + vec3(5.3, 17.9, 11.1);
  v += 0.2000 * noise3D(p);
  return v;
}

float interleavedGradientNoise(vec2 fragCoord) {
  vec3 magic = vec3(0.06711056, 0.00583715, 52.9829189);
  return fract(magic.z * fract(dot(fragCoord, magic.xy)));
}

// ---------------------------------------------------------------------------
// Calibrated Planckian Blackbody Chromaticity (1200K - 35000K)
// Preserves crimson-copper (<3800K), Gargantua gold (4500-6500K), and vivid
// electric sapphire-white (>10000K)
// ---------------------------------------------------------------------------
vec3 blackbodyColor(float tempK) {
  float t = clamp(tempK, 1200.0, 35000.0) / 100.0;
  vec3 col;

  if (t <= 66.0) {
    col.r = 1.0;
    col.g = clamp(0.39008158 * log(max(1.0, t)) - 0.63184144, 0.0, 1.0);
  } else {
    col.r = clamp(1.292936 * pow(t - 60.0, -0.13320476), 0.0, 1.0);
    col.g = clamp(1.12989086 * pow(t - 60.0, -0.07551485), 0.0, 1.0);
  }

  if (t >= 66.0) {
    col.b = 1.0;
  } else if (t <= 19.0) {
    col.b = 0.0;
  } else {
    col.b = clamp(0.54320679 * log(max(1.0, t - 10.0)) - 1.19625409, 0.0, 1.0);
  }

  vec3 linearCol = pow(col, vec3(2.2));

  // Cinema IMAX amber-gold richness strictly in the 3600K - 6800K Gargantua window
  float goldBell = exp(-pow((tempK - 4900.0) / 1550.0, 2.0));
  linearCol *= mix(vec3(1.0), vec3(1.22, 0.91, 0.62), 0.44 * goldBell);

  // Vivid Cherenkov/quasar sapphire-cobalt chromaticity for >8500K plasma
  float hotBlue = smoothstep(8000.0, 16500.0, tempK);
  linearCol *= mix(vec3(1.0), vec3(0.46, 0.78, 1.55), hotBlue * 0.78);

  return linearCol;
}

// ---------------------------------------------------------------------------
// Cubed-Sphere Astronomical Starfield (100% circular Airy-Gaussian stars,
// exact SO(3) layer rotations, crisp Einstein-ring gravitational lensing)
// ---------------------------------------------------------------------------
void dirToCubeFace(vec3 d, out float faceId, out vec2 uv) {
  vec3 ad = abs(d);
  if (ad.x >= ad.y && ad.x >= ad.z) {
    faceId = d.x > 0.0 ? 0.0 : 1.0;
    uv = vec2(d.z, d.y) / ad.x;
  } else if (ad.y >= ad.x && ad.y >= ad.z) {
    faceId = d.y > 0.0 ? 2.0 : 3.0;
    uv = vec2(d.x, d.z) / ad.y;
  } else {
    faceId = d.z > 0.0 ? 4.0 : 5.0;
    uv = vec2(d.x, d.y) / ad.z;
  }
}

vec3 cubeFaceToDir(float faceId, vec2 uv) {
  vec3 p;
  if (faceId < 0.5)      p = vec3( 1.0, uv.y, uv.x);
  else if (faceId < 1.5) p = vec3(-1.0, uv.y, uv.x);
  else if (faceId < 2.5) p = vec3(uv.x,  1.0, uv.y);
  else if (faceId < 3.5) p = vec3(uv.x, -1.0, uv.y);
  else if (faceId < 4.5) p = vec3(uv.x, uv.y,  1.0);
  else                   p = vec3(uv.x, uv.y, -1.0);
  return normalize(p);
}

vec3 cubedSphereStarLayer(
  vec3 dir,
  float scale,
  float seedOffset,
  float densityProb,
  float sizeScale,
  float magnification,
  float minAngSigma
) {
  float faceId;
  vec2 faceUv;
  dirToCubeFace(dir, faceId, faceUv);

  // Equal-angle tangent warp for uniform cell solid angle across cube faces
  vec2 warpedUv = atan(faceUv) * (4.0 / PI);
  vec2 gridPos = warpedUv * scale;
  vec2 cell = floor(gridPos);
  vec2 localUv = gridPos - cell;

  vec3 rnd = hash33(vec3(cell, faceId * 13.0 + seedOffset));
  if (rnd.x > clamp(densityProb, 0.0, 0.96)) {
    return vec3(0.0);
  }

  // Keep star center well inside cell [0.27, 0.73]^2 so halo decays to 0 before boundary
  vec2 sub = vec2(0.27) + 0.46 * hash33(vec3(cell + 37.0, faceId + seedOffset)).xy;
  vec2 dLocal = localUv - sub;
  float cellDist2 = dot(dLocal, dLocal);
  if (cellDist2 >= 0.055) { // 0.235^2 = 0.0552
    return vec3(0.0);
  }

  float cellDist = sqrt(cellDist2);
  float cellWindow = smoothstep(0.235, 0.09, cellDist);

  vec2 starWarpedUv = (cell + sub) / scale;
  vec2 starFaceUv = tan(starWarpedUv * (PI * 0.25));
  vec3 starDir = cubeFaceToDir(faceId, starFaceUv);

  // True 3D chordal angular distance on the unit celestial sphere (in radians)
  float angRad = length(dir - starDir);
  float mag = pow(rnd.y, 5.2);
  float intrinsicSigma = (mix(0.024, 0.068, mag) * sizeScale) / scale;

  // Nyquist anti-aliasing floor prevents sub-pixel beading along strongly lensed Einstein arcs!
  float effSigma = max(intrinsicSigma, minAngSigma);
  float energyNorm = clamp((intrinsicSigma * intrinsicSigma) / (effSigma * effSigma), 0.18, 1.0);

  float core = exp(-pow(angRad / effSigma, 2.0));
  float halo = 0.16 * exp(-pow(angRad / (effSigma * 2.4), 1.7));

  float starTemp = mix(3000.0, 24000.0, pow(rnd.z, 1.35));
  vec3 sCol = blackbodyColor(starTemp);

  float lum = (0.12 + 3.8 * mag) * (core + halo) * energyNorm * cellWindow * magnification;
  return sCol * lum;
}

vec3 sampleBackgroundCosmos(vec3 dir, float totalTurnAngle) {
  // Relativistic Einstein-ring flux magnification for strongly deflected rays
  float einsteinBoost = smoothstep(0.45, 2.6, totalTurnAngle);
  float lensMag = 1.0 + 1.55 * einsteinBoost * clamp(uLensingStrength, 0.0, 1.6);
  float pixelAng = (2.0 * uTanHalfFov) / max(480.0, uResolution.y);
  float minAngSigma = pixelAng * (0.88 + 1.65 * einsteinBoost);

  // Tilted Galactic Plane coordinate frame
  vec3 galUp = normalize(vec3(0.32, 0.89, -0.31));
  vec3 galRight = normalize(cross(galUp, vec3(0.0, 0.0, 1.0)));
  vec3 galFwd = cross(galRight, galUp);
  vec3 gDir = vec3(dot(dir, galRight), dot(dir, galUp), dot(dir, galFwd));

  // Velvet-black IMAX deep space + subtle Milky Way galactic band, warm core & dark dust rifts
  float galBand = exp(-pow(gDir.y * 4.8, 2.0));
  float outerHalo = exp(-pow(gDir.y * 2.1, 2.0));

  float cloud = fbm3Fast(gDir * 3.8 + vec3(2.1, -1.4, 5.2));
  float fineCloud = fbm3Fast(gDir * 9.4 + vec3(-6.2, 3.3, 8.1));
  float dustRift = smoothstep(0.35, 0.72, fineCloud) * exp(-pow(gDir.y * 9.5, 2.0));

  vec3 spaceBase = vec3(0.00012, 0.00018, 0.00042);
  vec3 coolNebula = mix(vec3(0.00045, 0.0010, 0.0026), vec3(0.0028, 0.0022, 0.0046), cloud) * outerHalo;
  vec3 galCore = vec3(0.015, 0.0092, 0.0052) * exp(-pow(length(vec2(gDir.x + 0.16, gDir.y * 3.0)) * 1.55, 2.0));
  vec3 galCloud = vec3(0.0095, 0.0074, 0.0062) * galBand * pow(cloud, 1.45) * (0.65 + 0.75 * fineCloud) * 1.55;

  vec3 milkyWay = (coolNebula + galCloud + galCore) * (1.0 - 0.82 * dustRift);

  // Subtle amber & ionized H-II emission wisps along the Milky Way
  float wisp = pow(max(0.0, fbm3Fast(gDir * 5.8 + vec3(-4.0, 6.2, 1.8)) - 0.47), 2.4);
  milkyWay += vec3(0.015, 0.006, 0.004) * wisp * galBand * 1.6;

  vec3 cosmos = spaceBase + milkyWay * uNebulaIntensity * (1.0 + 0.35 * einsteinBoost);

  // Multi-octave Starfield using exact orthonormal SO(3) rotation matrices
  if (uStarDensity > 0.001) {
    mat3 rot1 = mat3(
       0.80, -0.48,  0.36,
       0.36,  0.80,  0.48,
      -0.48, -0.36,  0.80
    );
    mat3 rot2 = mat3(
       0.36,  0.48, -0.80,
      -0.80,  0.60,  0.00,
       0.48,  0.64,  0.60
    );

    float dens = clamp(uStarDensity, 0.0, 2.5);
    float galStarBoost = 0.75 + 1.45 * galBand;

    vec3 d1 = normalize(rot1 * dir);
    vec3 d2 = normalize(rot2 * dir);
    vec3 d3 = normalize(rot1 * d2);

    vec3 stars = vec3(0.0);
    stars += cubedSphereStarLayer(dir,  44.0,  1.0, 0.19 * dens, 1.15, lensMag, minAngSigma) * 1.35;
    stars += cubedSphereStarLayer(d1,   84.0,  7.0, 0.30 * dens, 1.00, lensMag, minAngSigma) * 1.10;
    stars += cubedSphereStarLayer(d2,  144.0, 19.0, 0.46 * dens * galStarBoost, 0.94, lensMag, minAngSigma) * 0.88;
    stars += cubedSphereStarLayer(d3,  220.0, 31.0, 0.64 * dens * galStarBoost, 0.88, lensMag, minAngSigma) * 0.65;

    // Prominent background navigation stars behind Gargantua for dramatic Einstein rings & dual arcs
    vec3 hero1 = normalize(vec3(-0.032,  0.014, -0.9994));
    vec3 hero2 = normalize(vec3( 0.142, -0.058, -0.9881));
    vec3 hero3 = normalize(vec3(-0.225,  0.118, -0.9672));
    vec3 hero4 = normalize(vec3( 0.078,  0.182, -0.9802));
    vec3 hero5 = normalize(vec3(-0.115, -0.165, -0.9795));

    float heroSig = max(0.0017, minAngSigma * 1.15);
    float h1 = length(dir - hero1);
    float h2 = length(dir - hero2);
    float h3 = length(dir - hero3);
    float h4 = length(dir - hero4);
    float h5 = length(dir - hero5);

    stars += vec3(0.75, 0.88, 1.00) * (2.2 * exp(-pow(h1 / heroSig, 2.0)) + 0.18 * exp(-h1 / 0.0068)) * lensMag * dens;
    stars += vec3(1.00, 0.78, 0.48) * (1.8 * exp(-pow(h2 / heroSig, 2.0)) + 0.15 * exp(-h2 / 0.0060)) * lensMag * dens;
    stars += vec3(0.84, 0.92, 1.00) * (1.5 * exp(-pow(h3 / heroSig, 2.0)) + 0.12 * exp(-h3 / 0.0054)) * lensMag * dens;
    stars += vec3(1.00, 0.88, 0.68) * (1.3 * exp(-pow(h4 / heroSig, 2.0)) + 0.11 * exp(-h4 / 0.0052)) * lensMag * dens;
    stars += vec3(0.70, 0.84, 1.00) * (1.4 * exp(-pow(h5 / heroSig, 2.0)) + 0.11 * exp(-h5 / 0.0052)) * lensMag * dens;

    cosmos += stars * (1.0 - 0.38 * dustRift);
  }

  return cosmos;
}

// ---------------------------------------------------------------------------
// Geodesic Acceleration in Kerr-like Curved Spacetime
// Exact Schwarzschild Binet potential (-1.5 r_s h^2 / r^5) generalized with
// Kerr prograde/retrograde critical impact asymmetry & Lense-Thirring frame dragging
// ---------------------------------------------------------------------------
vec3 computeGeodesicAccel(
  vec3 pos,
  vec3 vel,
  float rs,
  float spin,
  float lensStrength,
  out float kerrFactorOut
) {
  float r2 = dot(pos, pos);
  vec3 hVec = cross(pos, vel);
  float h2 = dot(hVec, hVec);

  float hFwdY = -hVec.y;
  float spinAlign = hFwdY * inversesqrt(h2 + 1e-6);

  // Kerr prograde/retrograde critical impact asymmetry -> authentic D-shaped shadow at high spin
  float kerrFactor = clamp(1.0 - 0.42 * spin * spinAlign, 0.50, 1.52);
  kerrFactorOut = kerrFactor;

  if (lensStrength <= 0.0001) {
    return vec3(0.0);
  }

  float invR = inversesqrt(r2 + 1e-6);
  float invR2 = invR * invR;
  float invR3 = invR2 * invR;
  float invR5 = invR3 * invR2;

  vec3 acc = (-1.5 * rs * lensStrength * (h2 * kerrFactor) * invR5) * pos;

  // Gravitomagnetic azimuthal frame dragging (Lense-Thirring omega ~ 2 a M / r^3)
  vec3 dragDir = vec3(vel.z, 0.0, -vel.x);
  acc += (-0.26 * spin * lensStrength * rs * rs * invR3) * dragDir;

  return acc;
}

// ---------------------------------------------------------------------------
// Relativistic Accretion Disk: Tightly-Wound Keplerian MRI Plasma Filaments,
// Dust Silhouette Lanes, Relativistic Doppler Beaming & Gravitational Redshift
// ---------------------------------------------------------------------------
void evaluateAccretionDisk(
  vec3 pos,
  vec3 rayVel,
  float rs,
  out vec3 emission,
  out float densityOut
) {
  float rDisk = length(pos.xz);
  float rIn = uDiskInner * rs;
  float rOut = uDiskOuter * rs;

  if (rDisk < rIn * 0.94 || rDisk > rOut * 1.03) {
    emission = vec3(0.0);
    densityOut = 0.0;
    return;
  }

  float radialSpan = max(0.30 * rs, rOut - rIn);
  float u = clamp((rDisk - rIn) / radialSpan, 0.0, 1.0);

  // Flared thin relativistic disk profile
  float halfH = rs * uDiskThickness * (0.34 + 0.94 * pow(u, 0.70));
  float vNorm = abs(pos.y) / max(0.0035 * rs, halfH);
  if (vNorm > 2.05) {
    emission = vec3(0.0);
    densityOut = 0.0;
    return;
  }

  float verticalProfile = exp(-vNorm * vNorm * 1.95);

  // Sharp ISCO inner edge + incandescent inner cusp + smooth outer falloff
  float innerEdge = smoothstep(rIn * 0.955, rIn * 1.055, rDisk);
  float outerEdge = pow(1.0 - smoothstep(rIn + radialSpan * 0.16, rOut, rDisk), 1.55);
  float innerRimBoost = 1.0 + 1.18 * exp(-max(0.0, rDisk - rIn) / (0.34 * rs));
  float radialEnvelope = innerEdge * outerEdge;

  if (radialEnvelope <= 0.001) {
    emission = vec3(0.0);
    densityOut = 0.0;
    return;
  }

  // Dual-phase cross-faded Keplerian shear: seamless 360 deg rings without phase wind-up!
  float spinSign = (abs(uSpin) < 0.015) ? 1.0 : sign(uSpin);
  float angle = atan(pos.z, pos.x);
  float rNorm = rDisk / rs;
  float omega = 1.85 / (pow(max(0.55, rNorm), 1.5) + 0.45 * abs(uSpin));

  float animT = uTime * uDiskSpeed;
  float cycle0 = fract(animT * 0.052);
  float cycle1 = fract(cycle0 + 0.5);
  float blend = 0.5 - 0.5 * cos(2.0 * PI * cycle0);

  // Tightly wound logarithmic spiral shear like DNEG's Interstellar Gargantua
  float tightSpiralPhase = angle + spinSign * animT * 0.44 + spinSign * 6.8 * log(max(0.18, rNorm));
  float a0 = tightSpiralPhase + spinSign * (cycle0 - 0.5) * 5.8 * omega;
  float a1 = tightSpiralPhase + spinSign * (cycle1 - 0.5) * 5.8 * omega;

  // Azimuthally stretched coordinates (low angular freq, high radial freq -> fine concentric striations!)
  vec3 uv0 = vec3(cos(a0) * 1.55, sin(a0) * 1.55, rNorm * 3.4);
  vec3 uv1 = vec3(cos(a1) * 1.55, sin(a1) * 1.55, rNorm * 3.4);
  float shearedStream = mix(fbm3Fast(uv0), fbm3Fast(uv1), blend);

  // Multi-scale concentric plasma rings & fine MRI filaments
  float ringFine1 = noise3D(vec3(rNorm * 8.5,  cos(tightSpiralPhase) * 0.48, sin(tightSpiralPhase) * 0.48));
  float ringFine2 = noise3D(vec3(rNorm * 21.0, cos(tightSpiralPhase * 2.0) * 0.36, sin(tightSpiralPhase * 2.0) * 0.36));
  float ringFine3 = noise3D(vec3(rNorm * 42.0, sin(angle * 3.0 + animT * 0.25) * 0.25, cos(angle * 3.0) * 0.25));
  float concentricRings = 0.48 * ringFine1 + 0.34 * ringFine2 + 0.18 * ringFine3;

  float filament = smoothstep(0.15, 0.86, 0.46 * shearedStream + 0.54 * concentricRings);
  float hotStrands = pow(filament, 1.55) * (0.42 + 1.18 * concentricRings);

  // Cooler dark dust lane striations in outer disk (authentic Interstellar equatorial silhouette!)
  float dustLane = smoothstep(0.28, 0.82, u) * smoothstep(0.55, 0.18, concentricRings);

  float localDensity = radialEnvelope * verticalProfile * (0.24 + 1.18 * filament + 0.35 * dustLane) * uDiskDensity;

  // Relativistic Keplerian velocity v/c, Lorentz gamma, Doppler factor D, Gravitational Redshift
  vec3 gasDir = spinSign * normalize(vec3(pos.z, 0.0, -pos.x + 1e-6));
  float beta = clamp(sqrt(0.5 * rs / max(0.32 * rs, rDisk - 0.26 * rs)), 0.0, 0.84);
  float gamma = inversesqrt(max(0.09, 1.0 - beta * beta));

  vec3 photonToObserver = -normalize(rayVel);
  float cosTheta = dot(gasDir, photonToObserver);
  float doppler = 1.0 / (gamma * (1.0 - beta * cosTheta));

  float gravFactor = (uGravRedshift > 0.5)
    ? sqrt(clamp(1.0 - 0.72 * rs / max(0.76 * rs, rDisk), 0.22, 1.0))
    : 1.0;

  float gTotal = pow(clamp(doppler, 0.34, 2.55), uDopplerBeaming) * mix(1.0, gravFactor, 0.56);
  float intensityShift = pow(gTotal, 2.35);
  float tempShift = pow(clamp(doppler, 0.48, 2.15), 0.75 * uDopplerBeaming) * mix(1.0, gravFactor, 0.42);

  // Calibrated radial temperature profile T(r) so both 5600K gold & 16000K blue-white shine vividly
  float radialTempFactor = pow(clamp(rIn / rDisk, 0.12, 1.0), 0.35);
  float effectiveTemp = uDiskTemp * radialTempFactor * (0.80 + 0.42 * hotStrands) * tempShift;

  // Cooler outer dust lanes & corona edges
  effectiveTemp *= mix(1.0, 0.56, clamp(vNorm * 0.52 + dustLane * 0.42, 0.0, 0.82));

  vec3 bbColor = blackbodyColor(effectiveTemp);

  // Dust lanes absorb more than they emit, carving crisp dark amber-brown grooves across bright plasma
  float selfShadow = 1.0 - 0.56 * dustLane;
  float radiance = (0.28 + 1.62 * hotStrands) * innerRimBoost * intensityShift * selfShadow;

  emission = bbColor * radiance * localDensity;
  densityOut = localDensity;
}

void main() {
  vec2 ndc = vUv * 2.0 - 1.0;
  float aspect = uResolution.x / max(1.0, uResolution.y);

  vec3 rayDir = normalize(
    uCamForward +
    ndc.x * aspect * uTanHalfFov * uCamRight +
    ndc.y * uTanHalfFov * uCamUp
  );

  vec3 pos = uCamPos;
  vec3 vel = rayDir;

  float rs = uMass;
  float aClamped = clamp(uSpin, -0.995, 0.995);
  // True Kerr outer event horizon r_+ = 0.5 * (1 + sqrt(1 - a^2)) * r_s
  float rKerrPlus = 0.5 * (1.0 + sqrt(max(0.0, 1.0 - aClamped * aClamped))) * rs;

  float escapeRadius = max(54.0, length(uCamPos) * 2.05);
  float diskMinR = uDiskInner * rs * 0.90;
  float diskMaxR = uDiskOuter * rs * 1.05;
  float diskSlabMaxY = max(0.042 * rs, rs * uDiskThickness * 2.0);

  vec3 accumLight = vec3(0.0);
  float transmittance = 1.0;
  bool absorbed = false;
  float totalTurnAngle = 0.0;

  float jitter = interleavedGradientNoise(gl_FragCoord.xy);
  int planeCrossings = 0;

  for (int i = 0; i < 270; i++) {
    if (i >= uMaxSteps) break;

    float r = length(pos);

    float kerrFactor = 1.0;
    vec3 acc0 = computeGeodesicAccel(pos, vel, rs, uSpin, uLensingStrength, kerrFactor);

    // Event horizon capture throat: matches exact Kerr r_+ at high spin & Schwarzschild r_s at a*=0
    float lensBlend = clamp(uLensingStrength, 0.0, 1.0);
    float rHorizon = mix(rKerrPlus, rKerrPlus * mix(1.0, kerrFactor, 0.30), lensBlend) * 0.97;
    rHorizon = max(0.48 * rs, rHorizon);

    if (r <= rHorizon) {
      absorbed = true;
      break;
    }

    if (r > escapeRadius && dot(pos, vel) > 0.0) {
      break;
    }

    // Smooth C1 continuous symplectic step sizing (zero step-jump contour ripples on Einstein arcs!)
    float distFromHorizon = max(0.030 * rs, r - 0.85 * rHorizon);
    float radialRate = mix(0.050, 0.165, smoothstep(2.2 * rs, 14.0 * rs, r));
    float dt = uStepScale * clamp(radialRate * distFromHorizon + 0.012 * rs, 0.020 * rs, 3.2 * rs);

    if (uShowDisk > 0.5) {
      float rXZ = length(pos.xz);
      float radialProx =
        smoothstep(diskMinR * 0.82, diskMinR, rXZ) *
        (1.0 - smoothstep(diskMaxR, diskMaxR * 1.18, rXZ));
      if (radialProx > 0.001) {
        float yDist = abs(pos.y);
        float vertProx = 1.0 - smoothstep(diskSlabMaxY * 1.2, diskSlabMaxY * 2.8, yDist);
        float diskDt = max(0.15 * rs, 0.52 * (yDist + 0.10 * rs)) * uStepScale;
        dt = mix(dt, min(dt, diskDt), radialProx * vertProx);
      }
    }

    // 2nd-order Velocity-Verlet geodesic integration
    vec3 nextPos = pos + vel * dt + 0.5 * acc0 * dt * dt;
    float dummyKerr = 1.0;
    vec3 acc1 = computeGeodesicAccel(nextPos, vel + acc0 * dt, rs, uSpin, uLensingStrength, dummyKerr);
    vec3 nextVel = vel + 0.5 * (acc0 + acc1) * dt;

    // Accumulate smooth coordinate-invariant ray deflection angle (diverges smoothly at photon ring!)
    vec3 dir0 = normalize(vel);
    vec3 dir1 = normalize(nextVel);
    totalTurnAngle += length(dir1 - dir0);

    // Sub-step closest-approach check so fast steps never tunnel through the horizon
    vec3 seg = nextPos - pos;
    float segLen2 = dot(seg, seg);
    if (segLen2 > 1e-7) {
      float tClosest = clamp(-dot(pos, seg) / segLen2, 0.0, 1.0);
      float rClosest = length(pos + seg * tClosest);
      if (rClosest <= rHorizon * 0.99) {
        nextPos = pos + seg * tClosest;
        absorbed = true;
      }
    }

    // -----------------------------------------------------------------------
    // Accretion Disk Radiative Transfer:
    // 1) Exact y = 0 midplane root-finding (sharp primary disk + n=1 halo + n=2 photon ring)
    // 2) Stratified jittered 3D volumetric plasma corona slab
    // -----------------------------------------------------------------------
    if (uShowDisk > 0.5 && transmittance > 0.004) {
      float rXZ0 = length(pos.xz);
      float rXZ1 = length(nextPos.xz);
      if (min(rXZ0, rXZ1) < diskMaxR && max(rXZ0, rXZ1) > diskMinR) {
        if ((pos.y <= 0.0 && nextPos.y >= 0.0) || (pos.y >= 0.0 && nextPos.y <= 0.0)) {
          float denom = nextPos.y - pos.y;
          float tCross = (abs(denom) > 1e-6) ? clamp(-pos.y / denom, 0.0, 1.0) : 0.5;
          vec3 crossPos = mix(pos, nextPos, tCross);
          crossPos.y = 0.0;
          vec3 crossVel = mix(vel, nextVel, tCross);

          vec3 sheetEmit;
          float sheetDens;
          evaluateAccretionDisk(crossPos, crossVel, rs, sheetEmit, sheetDens);

          if (sheetDens > 0.0001) {
            planeCrossings += 1;
            float orderBoost = 1.0;
            if (planeCrossings == 2) orderBoost = 1.28;
            else if (planeCrossings >= 3) orderBoost = 1.55 * max(0.4, uPhotonRingBoost);

            float cosIncidence = max(0.17, abs(normalize(crossVel).y));
            float opticalDepth = sheetDens * (0.32 / cosIncidence);
            float alpha = 1.0 - exp(-opticalDepth);
            accumLight += transmittance * sheetEmit * (0.46 / pow(cosIncidence, 0.42)) * orderBoost;
            transmittance *= (1.0 - 0.86 * alpha);
          }
        }

        float y0 = pos.y;
        float y1 = nextPos.y;
        if (max(y0, y1) >= -diskSlabMaxY && min(y0, y1) <= diskSlabMaxY) {
          float tEnter = 0.0;
          float tExit = 1.0;
          float dy = y1 - y0;
          if (abs(dy) > 1e-6) {
            float ta = (-diskSlabMaxY - y0) / dy;
            float tb = ( diskSlabMaxY - y0) / dy;
            tEnter = clamp(min(ta, tb), 0.0, 1.0);
            tExit  = clamp(max(ta, tb), 0.0, 1.0);
          }

          float slabFrac = tExit - tEnter;
          if (slabFrac > 0.002) {
            float segWorldLen = length(seg) * slabFrac;
            float uSub = tEnter + slabFrac * jitter;
            vec3 sPos = mix(pos, nextPos, uSub);
            vec3 sVel = mix(vel, nextVel, uSub);

            vec3 volEmit;
            float volDens;
            evaluateAccretionDisk(sPos, sVel, rs, volEmit, volDens);

            if (volDens > 0.0001) {
              float dTau = volDens * segWorldLen * (0.86 / max(0.05, rs));
              float absorb = 1.0 - exp(-dTau);
              accumLight += transmittance * volEmit * segWorldLen * (0.46 / max(0.05, rs));
              transmittance *= (1.0 - 0.70 * absorb);
            }
          }
        }
      }
    }

    if (absorbed || transmittance <= 0.003) {
      break;
    }

    pos = nextPos;
    vel = nextVel;
  }

  // Escaped rays: smooth anti-aliased asymptotic photon ring (via geodesic winding angle!)
  // + gravitationally lensed celestial sphere!
  // Absorbed rays with no foreground disk remain 100% abyssal black!
  if (!absorbed && transmittance > 0.001) {
    if (uShowDisk > 0.5 && uLensingStrength > 0.05 && uPhotonRingBoost > 0.01) {
      // Smooth continuous winding-angle profile right at the critical photon-sphere boundary
      float asymptoticRing = smoothstep(2.35, 4.95, totalTurnAngle);
      vec3 ringTint = blackbodyColor(min(24000.0, uDiskTemp * 1.18));
      accumLight += transmittance * ringTint * pow(asymptoticRing, 1.55) * 0.78 * uDiskDensity * uPhotonRingBoost;
    }

    vec3 escapedDir = normalize(vel);
    vec3 bg = sampleBackgroundCosmos(escapedDir, totalTurnAngle);
    float bgTrans = (planeCrossings > 0) ? pow(transmittance, 3.2) : pow(transmittance, 1.8);
    accumLight += bgTrans * bg;
  }

  accumLight = min(accumLight, vec3(16.0));
  gl_FragColor = vec4(accumLight, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Post-Processing Pass 1: 13-Tap Jimenez Downsample + Karis Anti-Firefly + Soft-Knee
// Eliminates square mipmap blocks on 1px point stars while preserving lush disk bloom!
// ---------------------------------------------------------------------------
export const BLOOM_PREFILTER_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uTexelSize;
uniform float uThreshold;
uniform float uSoftKnee;

float luma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 softThreshold(vec3 c) {
  float br = max(c.r, max(c.g, c.b));
  float knee = uThreshold * uSoftKnee + 1e-4;
  float soft = clamp(br - uThreshold + knee, 0.0, 2.0 * knee);
  soft = (soft * soft) / (4.0 * knee);
  float contrib = max(soft, br - uThreshold) / max(br, 1e-4);
  return c * clamp(contrib, 0.0, 1.0);
}

vec3 sampleKarisQuad(vec2 uv, vec2 o1, vec2 o2, vec2 o3, vec2 o4) {
  vec3 c1 = softThreshold(texture2D(tInput, uv + o1 * uTexelSize).rgb);
  vec3 c2 = softThreshold(texture2D(tInput, uv + o2 * uTexelSize).rgb);
  vec3 c3 = softThreshold(texture2D(tInput, uv + o3 * uTexelSize).rgb);
  vec3 c4 = softThreshold(texture2D(tInput, uv + o4 * uTexelSize).rgb);
  vec3 avg = 0.25 * (c1 + c2 + c3 + c4);
  float w = 1.0 / (1.0 + luma(avg) * 0.25);
  return avg * w;
}

void main() {
  // 5 overlapping Karis-weighted 2x2 quads (13-tap Jimenez pattern)
  vec3 g0 = sampleKarisQuad(vUv, vec2(-1.0, -1.0), vec2( 1.0, -1.0), vec2(-1.0,  1.0), vec2( 1.0,  1.0));
  vec3 g1 = sampleKarisQuad(vUv, vec2(-2.0, -2.0), vec2( 0.0, -2.0), vec2(-2.0,  0.0), vec2( 0.0,  0.0));
  vec3 g2 = sampleKarisQuad(vUv, vec2( 0.0, -2.0), vec2( 2.0, -2.0), vec2( 0.0,  0.0), vec2( 2.0,  0.0));
  vec3 g3 = sampleKarisQuad(vUv, vec2(-2.0,  0.0), vec2( 0.0,  0.0), vec2(-2.0,  2.0), vec2( 0.0,  2.0));
  vec3 g4 = sampleKarisQuad(vUv, vec2( 0.0,  0.0), vec2( 2.0,  0.0), vec2( 0.0,  2.0), vec2( 2.0,  2.0));

  float w0 = 0.50 / (1.0 + luma(g0));
  float w1 = 0.125 / (1.0 + luma(g1));
  float w2 = 0.125 / (1.0 + luma(g2));
  float w3 = 0.125 / (1.0 + luma(g3));
  float w4 = 0.125 / (1.0 + luma(g4));
  float wSum = max(1e-5, w0 + w1 + w2 + w3 + w4);

  vec3 col = (g0 * w0 + g1 * w1 + g2 * w2 + g3 * w3 + g4 * w4) / wSum;
  gl_FragColor = vec4(col, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Post-Processing Pass 2: Isotropic 13-Tap Jimenez Downsample
// ---------------------------------------------------------------------------
export const BLOOM_DOWNSAMPLE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform sampler2D tInput;
uniform vec2 uTexelSize;

void main() {
  vec2 d = uTexelSize;

  vec3 a = texture2D(tInput, vUv + vec2(-2.0,  2.0) * d).rgb;
  vec3 b = texture2D(tInput, vUv + vec2( 0.0,  2.0) * d).rgb;
  vec3 c = texture2D(tInput, vUv + vec2( 2.0,  2.0) * d).rgb;

  vec3 d0 = texture2D(tInput, vUv + vec2(-2.0,  0.0) * d).rgb;
  vec3 e  = texture2D(tInput, vUv).rgb;
  vec3 f  = texture2D(tInput, vUv + vec2( 2.0,  0.0) * d).rgb;

  vec3 g = texture2D(tInput, vUv + vec2(-2.0, -2.0) * d).rgb;
  vec3 h = texture2D(tInput, vUv + vec2( 0.0, -2.0) * d).rgb;
  vec3 i = texture2D(tInput, vUv + vec2( 2.0, -2.0) * d).rgb;

  vec3 j = texture2D(tInput, vUv + vec2(-1.0,  1.0) * d).rgb;
  vec3 k = texture2D(tInput, vUv + vec2( 1.0,  1.0) * d).rgb;
  vec3 l = texture2D(tInput, vUv + vec2(-1.0, -1.0) * d).rgb;
  vec3 m = texture2D(tInput, vUv + vec2( 1.0, -1.0) * d).rgb;

  vec3 outCol = e * 0.125;
  outCol += (a + c + g + i) * 0.03125;
  outCol += (b + d0 + f + h) * 0.0625;
  outCol += (j + k + l + m) * 0.125;

  gl_FragColor = vec4(outCol, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Post-Processing Pass 3: Isotropic 9-Tap Tent Filter Upsample (Zero Square Footprints!)
// ---------------------------------------------------------------------------
export const BLOOM_UPSAMPLE_TENT_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform sampler2D tLowMip;
uniform sampler2D tCurrMip;
uniform vec2 uTexelSize;
uniform float uRadius;
uniform float uMipWeight;

void main() {
  vec2 d = uTexelSize * uRadius;

  vec3 s = vec3(0.0);
  s += texture2D(tLowMip, vUv + vec2(-d.x,  d.y)).rgb * 1.0;
  s += texture2D(tLowMip, vUv + vec2( 0.0,  d.y)).rgb * 2.0;
  s += texture2D(tLowMip, vUv + vec2( d.x,  d.y)).rgb * 1.0;

  s += texture2D(tLowMip, vUv + vec2(-d.x,  0.0)).rgb * 2.0;
  s += texture2D(tLowMip, vUv).rgb                    * 4.0;
  s += texture2D(tLowMip, vUv + vec2( d.x,  0.0)).rgb * 2.0;

  s += texture2D(tLowMip, vUv + vec2(-d.x, -d.y)).rgb * 1.0;
  s += texture2D(tLowMip, vUv + vec2( 0.0, -d.y)).rgb * 2.0;
  s += texture2D(tLowMip, vUv + vec2( d.x, -d.y)).rgb * 1.0;

  vec3 upsampled = s * (1.0 / 16.0);
  vec3 current = texture2D(tCurrMip, vUv).rgb;

  gl_FragColor = vec4(current + upsampled * uMipWeight, 1.0);
}
`;

// ---------------------------------------------------------------------------
// Post-Processing Pass 4: Smooth Multi-Pass IMAX Horizontal Anamorphic Blur
// ---------------------------------------------------------------------------
export const ANAMORPHIC_BLUR_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;
uniform sampler2D tInput;
uniform float uStepWidth;
uniform float uPassIndex;

void main() {
  vec3 sum = vec3(0.0);
  float wSum = 0.0;

  for (int i = -8; i <= 8; i++) {
    float fi = float(i);
    float w = exp(-abs(fi) * 0.28);
    float sx = clamp(vUv.x + fi * uStepWidth, 0.001, 0.999);
    vec3 s = texture2D(tInput, vec2(sx, vUv.y)).rgb;
    if (uPassIndex < 0.5) {
      // First pass: trigger horizontal anamorphic streak smoothly from hot disk highlights
      float lum = dot(s, vec3(0.2126, 0.7152, 0.0722));
      s *= smoothstep(0.35, 1.85, lum);
    }
    sum += s * w;
    wSum += w;
  }

  gl_FragColor = vec4(sum / max(1e-4, wSum), 1.0);
}
`;

// ---------------------------------------------------------------------------
// Final Cinema Composite: HDR Scene + Soft Tent Bloom + Smooth IMAX Anamorphic
// + Chroma-Preserving Filmic Tone Mapping + Vignette
// ---------------------------------------------------------------------------
export const CINEMA_COMPOSITE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;

uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform sampler2D tAnamorphic;
uniform float uBloomStrength;
uniform float uAnamorphic;
uniform float uExposure;
uniform float uTime;

vec3 acesFilm(vec3 x) {
  float a = 2.51;
  float b = 0.03;
  float c = 2.43;
  float d = 0.59;
  float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  vec2 centerOffset = uv - 0.5;
  float dist2 = dot(centerOffset, centerOffset);

  // Subtle lateral lens chromatic dispersion at outer frame corners
  vec2 caShift = centerOffset * dist2 * 0.0024;
  float rCh = texture2D(tScene, uv + caShift).r;
  float gCh = texture2D(tScene, uv).g;
  float bCh = texture2D(tScene, uv - caShift).b;
  vec3 hdr = vec3(rCh, gCh, bCh);

  // Add circular tent-filtered multi-scale cinema bloom (zero square artifacts!)
  vec3 bloom = texture2D(tBloom, uv).rgb;
  hdr += bloom * (uBloomStrength * 0.72);

  // Add silky-smooth 2-pass horizontal IMAX anamorphic lens flare
  if (uAnamorphic > 0.002) {
    vec3 streak = texture2D(tAnamorphic, uv).rgb;
    vec3 anamorphicTint = vec3(0.76, 0.88, 1.24);
    hdr += streak * anamorphicTint * (uAnamorphic * 0.65);
  }

  hdr *= uExposure;

  // Preserve rich hue saturation in warm gold & cool sapphire plasma before gentle white-hot core rolloff
  float maxC = max(hdr.r, max(hdr.g, hdr.b));
  float lum = dot(hdr, vec3(0.2126, 0.7152, 0.0722));
  float highlightDesat = smoothstep(3.2, 13.0, maxC) * 0.28;
  hdr = mix(hdr, vec3(lum), highlightDesat);

  vec3 ldr = acesFilm(hdr);

  // Subtle IMAX cinema vignette
  float vignette = 1.0 - 0.22 * dist2 * 1.32;
  ldr *= clamp(vignette, 0.70, 1.0);

  vec3 srgb = pow(max(ldr, vec3(0.0)), vec3(1.0 / 2.2));
  float grain = (hash12(gl_FragCoord.xy + fract(uTime) * 100.0) - 0.5) * (1.0 / 255.0);
  srgb = clamp(srgb + grain, 0.0, 1.0);

  gl_FragColor = vec4(srgb, 1.0);
}
`;
