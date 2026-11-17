export type RenderQuality = 'performance' | 'balanced' | 'ultra';

export interface BlackHoleParams {
  // Black hole spacetime parameters
  mass: number;             // Schwarzschild radius scale (0.5 - 2.0)
  spin: number;             // Dimensionless Kerr spin a* (-0.99 to +0.99)
  lensingStrength: number;  // Gravitational deflection multiplier (0.0 - 2.0, 1.0 = General Relativity)

  // Accretion disk parameters
  showDisk: boolean;        // Toggle accretion disk visibility
  autoIsco: boolean;        // Automatically couple disk inner radius to Kerr ISCO
  diskInner: number;        // Manual inner radius (in r_s) when autoIsco is false
  diskOuter: number;        // Outer radius (in r_s)
  diskThickness: number;    // Vertical half-thickness scale (0.02 - 0.40)
  diskDensity: number;      // Optical emission density / opacity (0.2 - 2.5)
  diskTemperature: number;  // Peak plasma temperature in Kelvin (2600 - 17000)
  diskSpeed: number;        // Differential Keplerian orbital animation speed (0.0 - 2.5)
  dopplerBeaming: number;   // Relativistic Doppler beaming strength (0.0 = symmetric, 0.34 = Interstellar, 1.0 = full GR)
  gravRedshift: boolean;    // Enable gravitational redshift factor sqrt(1 - r_s/r)
  photonRingBoost: number;  // Relativistic photon-sphere asymptotic ring prominence (0.0 - 2.0)

  // Background cosmos & lensing visibility
  starDensity: number;      // Background star brightness & density multiplier (0.0 - 2.5)
  nebulaIntensity: number;  // Galactic dust & Milky Way band intensity (0.0 - 2.0)

  // Cinema optics & camera framing
  bloomStrength: number;    // HDR optical glow intensity (0.0 - 2.0)
  anamorphicFlare: number;  // IMAX horizontal anamorphic streak intensity (0.0 - 1.5)
  exposure: number;         // Filmic tone-mapping exposure (0.4 - 2.2)
  cameraRoll: number;       // Cinema camera roll angle in degrees (-60 to +60)
  fov: number;              // Vertical field of view in degrees (28 - 75)
  autoOrbit: boolean;       // Gentle hands-free cinema orbital drift

  // Performance / raytracing fidelity
  quality: RenderQuality;
  paused: boolean;
}

export interface CameraState {
  azimuth: number;          // Radians
  elevation: number;        // Radians (-PI/2 + eps to PI/2 - eps)
  distance: number;         // Observer distance in world units
}

export interface PhysicsTelemetry {
  schwarzschildRadius: number;
  eventHorizonRadius: number;
  photonSphereRadius: number;
  iscoRadius: number;
  shadowRadius: number;
  observerDistance: number;
  fps: number;
}

export interface ScenePreset {
  id: string;
  name: string;
  subtitle: string;
  params: Partial<BlackHoleParams>;
  camera?: Partial<CameraState>;
}

/**
 * Computes the exact Bardeen-Press-Teukolsky (1972) Innermost Stable Circular Orbit (ISCO)
 * in units of Schwarzschild radius r_s (where r_s = 2M, so M = 0.5 r_s).
 */
export function computeKerrIscoRs(spin: number): number {
  const a = Math.max(-0.999, Math.min(0.999, spin));
  const oneMinusA2 = Math.max(1e-6, 1 - a * a);
  const z1 =
    1 +
    Math.cbrt(oneMinusA2) *
      (Math.cbrt(1 + a) + Math.cbrt(Math.max(0, 1 - a)));
  const z2 = Math.sqrt(3 * a * a + z1 * z1);
  const sign = a >= 0 ? 1 : -1;
  const term = Math.max(0, (3 - z1) * (3 + z1 + 2 * z2));
  const rOverM = 3 + z2 - sign * Math.sqrt(term);
  return 0.5 * rOverM; // Convert from M to r_s (since r_s = 2M)
}

/**
 * Computes Kerr outer event horizon r_+ in units of r_s.
 */
export function computeEventHorizonRs(spin: number): number {
  const a = Math.max(-0.999, Math.min(0.999, spin));
  return 0.5 * (1 + Math.sqrt(Math.max(0, 1 - a * a)));
}

/**
 * Computes prograde/retrograde equatorial photon orbit radius in units of r_s.
 */
export function computePhotonSphereRs(spin: number): number {
  const a = Math.max(-0.999, Math.min(0.999, spin));
  const arg = Math.max(-1, Math.min(1, -a));
  const rOverM = 2 * (1 + Math.cos((2 / 3) * Math.acos(arg)));
  return 0.5 * rOverM;
}

export const DEFAULT_CAMERA: CameraState = {
  azimuth: 0.14,
  elevation: 0.125, // ~7.2 deg above disk plane (iconic Interstellar IMAX framing)
  distance: 15.6,
};

export const DEFAULT_PARAMS: BlackHoleParams = {
  mass: 1.0,
  spin: 0.88,
  lensingStrength: 1.0,

  showDisk: true,
  autoIsco: true,
  diskInner: computeKerrIscoRs(0.88),
  diskOuter: 9.2,
  diskThickness: 0.085,
  diskDensity: 1.32,
  diskTemperature: 5600,
  diskSpeed: 1.0,
  dopplerBeaming: 0.34, // Tuned like Kip Thorne & DNEG's Interstellar film aesthetic
  gravRedshift: true,
  photonRingBoost: 1.0,

  starDensity: 1.35,
  nebulaIntensity: 1.1,

  bloomStrength: 0.55,
  anamorphicFlare: 0.52,
  exposure: 1.06,
  cameraRoll: -16,
  fov: 45,
  autoOrbit: false,

  quality: 'balanced',
  paused: false,
};

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: 'gargantua',
    name: '卡冈图雅 · 星际穿越',
    subtitle: 'IMAX 暖金丝缕吸积盘、上下引力透镜光弧与内光子环',
    params: {
      mass: 1.0,
      spin: 0.88,
      lensingStrength: 1.0,
      showDisk: true,
      autoIsco: true,
      diskOuter: 9.2,
      diskThickness: 0.085,
      diskDensity: 1.32,
      diskTemperature: 5600,
      diskSpeed: 1.0,
      dopplerBeaming: 0.34,
      gravRedshift: true,
      photonRingBoost: 1.0,
      starDensity: 1.35,
      nebulaIntensity: 1.1,
      bloomStrength: 0.55,
      anamorphicFlare: 0.52,
      exposure: 1.06,
      cameraRoll: -16,
      fov: 45,
    },
    camera: {
      azimuth: 0.14,
      elevation: 0.125,
      distance: 15.6,
    },
  },
  {
    id: 'kerr-astrophysics',
    name: '天体物理写实 · 极速克尔',
    subtitle: 'a* = 0.99 强参考系拖曳、D 型不对称阴影与强多普勒蓝移',
    params: {
      mass: 1.05,
      spin: 0.99,
      lensingStrength: 1.0,
      showDisk: true,
      autoIsco: true,
      diskOuter: 8.8,
      diskThickness: 0.075,
      diskDensity: 1.24,
      diskTemperature: 6600,
      diskSpeed: 1.4,
      dopplerBeaming: 0.92,
      gravRedshift: true,
      photonRingBoost: 1.15,
      starDensity: 1.35,
      nebulaIntensity: 1.0,
      bloomStrength: 0.50,
      anamorphicFlare: 0.44,
      exposure: 0.98,
      cameraRoll: -9,
      fov: 44,
    },
    camera: {
      azimuth: 0.08,
      elevation: 0.15,
      distance: 14.6,
    },
  },
  {
    id: 'schwarzschild',
    name: '史瓦西静态黑洞',
    subtitle: '零自旋球对称视界，宽内缘轨道 (3.0 r_s) 清晰分离光子环',
    params: {
      mass: 1.0,
      spin: 0.0,
      lensingStrength: 1.0,
      showDisk: true,
      autoIsco: true,
      diskOuter: 9.8,
      diskThickness: 0.09,
      diskDensity: 1.26,
      diskTemperature: 5200,
      diskSpeed: 0.85,
      dopplerBeaming: 0.45,
      gravRedshift: true,
      photonRingBoost: 1.25,
      starDensity: 1.4,
      nebulaIntensity: 1.05,
      bloomStrength: 0.48,
      anamorphicFlare: 0.30,
      exposure: 1.08,
      cameraRoll: 0,
      fov: 45,
    },
    camera: {
      azimuth: 0.32,
      elevation: 0.21,
      distance: 17.2,
    },
  },
  {
    id: 'einstein-ring',
    name: '爱因斯坦环 · 纯引力透镜',
    subtitle: '隐藏吸积盘，纯粹观测背景群星与银河的引力弯折多重像',
    params: {
      mass: 1.25,
      spin: 0.65,
      lensingStrength: 1.0,
      showDisk: false,
      photonRingBoost: 0.0,
      starDensity: 2.15,
      nebulaIntensity: 1.75,
      bloomStrength: 0.42,
      anamorphicFlare: 0.18,
      exposure: 1.28,
      cameraRoll: -12,
      fov: 45,
    },
    camera: {
      azimuth: 0.0,
      elevation: 0.03,
      distance: 14.0,
    },
  },
  {
    id: 'quasar',
    name: '高能类星体 · 电蓝等离子',
    subtitle: '16000K 超高温蓝白湍流吸积盘与强烈宽银幕光学眩光',
    params: {
      mass: 1.12,
      spin: 0.94,
      lensingStrength: 1.05,
      showDisk: true,
      autoIsco: true,
      diskOuter: 9.4,
      diskThickness: 0.15,
      diskDensity: 1.22,
      diskTemperature: 16000,
      diskSpeed: 1.55,
      dopplerBeaming: 0.56,
      gravRedshift: true,
      photonRingBoost: 1.35,
      starDensity: 1.4,
      nebulaIntensity: 1.25,
      bloomStrength: 0.62,
      anamorphicFlare: 0.78,
      exposure: 0.92,
      cameraRoll: -21,
      fov: 46,
    },
    camera: {
      azimuth: -0.28,
      elevation: 0.18,
      distance: 16.4,
    },
  },
  {
    id: 'crimson-tide',
    name: '红巨星潮汐瓦解 · 赤金余烬',
    subtitle: '3200K 低温厚尘埃等离子流与显著近视界引力红移',
    params: {
      mass: 1.15,
      spin: -0.65,
      lensingStrength: 1.0,
      showDisk: true,
      autoIsco: true,
      diskOuter: 10.6,
      diskThickness: 0.16,
      diskDensity: 1.45,
      diskTemperature: 3200,
      diskSpeed: 0.9,
      dopplerBeaming: 0.42,
      gravRedshift: true,
      photonRingBoost: 1.15,
      starDensity: 1.35,
      nebulaIntensity: 1.15,
      bloomStrength: 0.58,
      anamorphicFlare: 0.42,
      exposure: 1.16,
      cameraRoll: 14,
      fov: 46,
    },
    camera: {
      azimuth: 0.42,
      elevation: 0.17,
      distance: 18.2,
    },
  },
];
