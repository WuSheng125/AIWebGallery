export type RenderQuality = 'low' | 'medium' | 'high';
export type PresetName = 'gargantua' | 'ember' | 'sapphire';
export type UIAction = 'reset-view' | 'screenshot' | 'fullscreen' | 'toggle-help';

export interface BlackHoleParams {
  /** Schwarzschild radius in scene units. */
  mass: number;
  /** Additional artistic control over ray curvature, 1 is physical. */
  lensing: number;
  diskInner: number;
  diskOuter: number;
  diskBrightness: number;
  diskTemperature: number;
  diskSpeed: number;
  diskDensity: number;
  doppler: number;
  starBrightness: number;
  bloom: number;
  exposure: number;
  quality: RenderQuality;
  autoRotate: boolean;
  diskVisible: boolean;
  starsVisible: boolean;
}

export interface ViewInfo {
  /** Elevation above/below the disk plane, in radians. */
  inclination: number;
  /** Camera distance from the singularity in scene units. */
  distance: number;
}

export const DEFAULT_PARAMS: Readonly<BlackHoleParams> = Object.freeze({
  mass: 1,
  lensing: 1,
  diskInner: 3,
  diskOuter: 8.2,
  diskBrightness: 1.45,
  diskTemperature: 5900,
  diskSpeed: 0.72,
  diskDensity: 0.9,
  doppler: 0.9,
  starBrightness: 0.85,
  bloom: 0.26,
  exposure: 1.05,
  quality: 'medium',
  autoRotate: false,
  diskVisible: true,
  starsVisible: true,
});

export const PRESETS: Record<PresetName, BlackHoleParams> = {
  gargantua: { ...DEFAULT_PARAMS },
  ember: {
    ...DEFAULT_PARAMS,
    mass: 1.15,
    diskInner: 3.35,
    diskOuter: 7.2,
    diskBrightness: 1.15,
    diskTemperature: 3400,
    diskSpeed: 0.42,
    diskDensity: 1.15,
    doppler: 0.55,
    starBrightness: 0.55,
    bloom: 0.36,
    exposure: 1,
  },
  sapphire: {
    ...DEFAULT_PARAMS,
    mass: 0.9,
    diskInner: 2.75,
    diskOuter: 9,
    diskBrightness: 1.75,
    diskTemperature: 9800,
    diskSpeed: 1.35,
    diskDensity: 0.75,
    doppler: 1.35,
    starBrightness: 1.1,
    bloom: 0.44,
    exposure: 1.08,
  },
};
