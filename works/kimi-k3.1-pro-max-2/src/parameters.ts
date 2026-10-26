export interface BlackHoleParameters {
  lensStrength: number;
  innerRadius: number;
  outerRadius: number;
  diskBrightness: number;
  temperature: number;
  turbulence: number;
  rotationSpeed: number;
  exposure: number;
  starDensity: number;
  bloomStrength: number;
  doppler: boolean;
  bloomEnabled: boolean;
  autoRotate: boolean;
}

export const DEFAULT_PARAMETERS: BlackHoleParameters = {
  lensStrength: 1,
  innerRadius: 3.1,
  outerRadius: 12,
  diskBrightness: 1.2,
  temperature: 6200,
  turbulence: 0.75,
  rotationSpeed: 0.85,
  exposure: 1.1,
  starDensity: 0.9,
  bloomStrength: 0.65,
  doppler: true,
  bloomEnabled: true,
  autoRotate: false,
};

export type NumericParameter = {
  [Key in keyof BlackHoleParameters]: BlackHoleParameters[Key] extends number ? Key : never;
}[keyof BlackHoleParameters];

export type QualityMode = 'auto' | 'high' | 'performance';

export interface ViewPreset {
  inclination: number;
  distance: number;
  azimuth: number;
}

export const VIEW_PRESETS: Record<string, ViewPreset> = {
  classic: { inclination: 3.5, distance: 22.5, azimuth: 0 },
  overhead: { inclination: 55, distance: 20, azimuth: 0.35 },
  close: { inclination: 10, distance: 12.5, azimuth: -0.25 },
};
