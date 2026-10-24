/*
 * GARGANTUA — parameter model, control schema and film-inspired presets.
 */
(function () {
  'use strict';

  const G = (window.GARGANTUA = window.GARGANTUA || {});

  const DEFAULTS = Object.freeze({
    // Camera / observer
    distance: 21.0,
    elevation: 1.25,
    fov: 42.0,
    azimuth: -16.0,
    autoOrbit: false,

    // Spacetime
    lensing: 1.0,
    photonRing: 0.3,

    // Accretion disk
    showDisk: true,
    diskInner: 3.0,
    diskOuter: 15.5,
    temperature: 4200,
    diskBrightness: 0.84,
    turbulence: 1.05,
    doppler: 0.22,
    diskSpeed: 1.0,

    // Sky / image
    starDensity: 0.9,
    stars: 1.0,
    nebula: 1.0,
    exposure: 0.9,
    bloom: 0.64,
    vignette: 55,
    grain: 30,

    // Renderer
    quality: 'auto',
  });

  const SECTIONS = [
    {
      id: 'observer',
      index: '01',
      title: '观测机位',
      en: 'OBSERVER',
      controls: [
        { key: 'distance', label: '观测距离', en: 'RANGE', min: 8, max: 55, step: 0.1, unit: 'Rs', precision: 1 },
        { key: 'elevation', label: '视线仰角', en: 'INCLINATION', min: 0.6, max: 88, step: 0.1, unit: '°', precision: 1, signed: true },
        { key: 'fov', label: '视场角度', en: 'FIELD OF VIEW', min: 28, max: 72, step: 0.5, unit: '°', precision: 1 },
        { key: 'autoOrbit', label: '自动环绕', en: 'AUTO ORBIT', type: 'toggle' },
      ],
    },
    {
      id: 'spacetime',
      index: '02',
      title: '时空透镜',
      en: 'SPACETIME',
      controls: [
        { key: 'lensing', label: '引力透镜强度', en: 'LENSING', min: 0.35, max: 2.0, step: 0.01, unit: '×', precision: 2 },
        { key: 'photonRing', label: '光子环增益', en: 'PHOTON RING', min: 0, max: 2.0, step: 0.01, unit: '×', precision: 2 },
      ],
    },
    {
      id: 'disk',
      index: '03',
      title: '吸积盘',
      en: 'ACCRETION DISK',
      controls: [
        { key: 'showDisk', label: '显示吸积盘', en: 'VISIBLE', type: 'toggle' },
        { key: 'diskInner', label: '盘面内径', en: 'INNER RADIUS', min: 2.2, max: 8.0, step: 0.1, unit: 'Rs', precision: 1 },
        { key: 'diskOuter', label: '盘面外径', en: 'OUTER RADIUS', min: 8, max: 26, step: 0.1, unit: 'Rs', precision: 1 },
        { key: 'temperature', label: '辐射色温', en: 'TEMPERATURE', min: 2800, max: 12000, step: 50, unit: 'K', precision: 0 },
        { key: 'diskBrightness', label: '盘面亮度', en: 'LUMINOSITY', min: 0.2, max: 2.5, step: 0.01, unit: '×', precision: 2 },
        { key: 'turbulence', label: '湍流细节', en: 'TURBULENCE', min: 0, max: 2.0, step: 0.01, unit: '×', precision: 2 },
        { key: 'doppler', label: '相对论多普勒', en: 'DOPPLER', min: 0, max: 1.0, step: 0.01, unit: '×', precision: 2 },
        { key: 'diskSpeed', label: '激流速度', en: 'FLOW RATE', min: 0, max: 3.0, step: 0.01, unit: '×', precision: 2 },
      ],
    },
    {
      id: 'image',
      index: '04',
      title: '星野与影像',
      en: 'IMAGE · SKY',
      controls: [
        { key: 'starDensity', label: '星野密度', en: 'STAR DENSITY', min: 0.3, max: 1.8, step: 0.01, unit: '×', precision: 2 },
        { key: 'stars', label: '星野亮度', en: 'STARLIGHT', min: 0, max: 2.5, step: 0.01, unit: '×', precision: 2 },
        { key: 'nebula', label: '星际尘埃', en: 'NEBULA', min: 0, max: 2.0, step: 0.01, unit: '×', precision: 2 },
        { key: 'exposure', label: '曝光补偿', en: 'EXPOSURE', min: 0.4, max: 2.0, step: 0.01, unit: '×', precision: 2 },
        { key: 'bloom', label: '镜头泛光', en: 'BLOOM', min: 0, max: 2.0, step: 0.01, unit: '×', precision: 2 },
        { key: 'vignette', label: '暗角强度', en: 'VIGNETTE', min: 0, max: 100, step: 1, unit: '%', precision: 0 },
        { key: 'grain', label: '胶片颗粒', en: 'FILM GRAIN', min: 0, max: 100, step: 1, unit: '%', precision: 0 },
      ],
    },
  ];

  const PRESETS = [
    {
      id: 'gargantua',
      name: '卡冈图雅',
      en: 'GARGANTUA',
      desc: '电影基准 · 暖金薄盘',
      swatch: ['#f8e3bd', '#a4632b'],
      values: {
        distance: 21.0, elevation: 1.25, fov: 42.0, azimuth: -16.0,
        lensing: 1.0, photonRing: 0.3, showDisk: true,
        diskInner: 3.0, diskOuter: 15.5, temperature: 4200,
        diskBrightness: 0.84, turbulence: 1.05, doppler: 0.22, diskSpeed: 1.0,
        starDensity: 0.9, stars: 1.0, nebula: 1.0,
        exposure: 0.9, bloom: 0.64, vignette: 55, grain: 30,
      },
    },
    {
      id: 'genesis',
      name: '白热奇点',
      en: 'WHITE HOT',
      desc: '高能爆发 · 冰白内缘',
      swatch: ['#f7f5eb', '#7aa6c4'],
      values: {
        distance: 20.0, elevation: 6.5, fov: 42.0, azimuth: 18.0,
        lensing: 1.05, photonRing: 0.45, showDisk: true,
        diskInner: 3.0, diskOuter: 14.5, temperature: 12000,
        diskBrightness: 0.42, turbulence: 1.2, doppler: 0.3, diskSpeed: 1.1,
        starDensity: 1.0, stars: 0.8, nebula: 1.0,
        exposure: 0.6, bloom: 0.35, vignette: 60, grain: 25,
      },
    },
    {
      id: 'ember',
      name: '赤色余烬',
      en: 'EMBER',
      desc: '低能晚年 · 深红残焰',
      swatch: ['#ffc477', '#6b1c08'],
      values: {
        distance: 24.0, elevation: 3.0, fov: 45.0, azimuth: -36.0,
        lensing: 1.18, photonRing: 0.4, showDisk: true,
        diskInner: 3.5, diskOuter: 13.8, temperature: 3100,
        diskBrightness: 0.95, turbulence: 1.1, doppler: 0.06, diskSpeed: 0.72,
        starDensity: 0.8, stars: 0.9, nebula: 0.72,
        exposure: 0.95, bloom: 0.55, vignette: 64, grain: 42,
      },
    },
    {
      id: 'abyss',
      name: '引力深渊',
      en: 'ABYSS',
      desc: '极近观测 · 强透镜场',
      swatch: ['#e9d6b1', '#183548'],
      values: {
        distance: 15.5, elevation: 16.0, fov: 52.0, azimuth: 48.0,
        lensing: 1.4, photonRing: 0.45, showDisk: true,
        diskInner: 3.0, diskOuter: 10.0, temperature: 6000,
        diskBrightness: 0.45, turbulence: 1.25, doppler: 0.4, diskSpeed: 1.0,
        starDensity: 1.1, stars: 0.9, nebula: 1.15,
        exposure: 0.62, bloom: 0.38, vignette: 66, grain: 34,
      },
    },
    {
      id: 'equator',
      name: '赤道切面',
      en: 'EDGE-ON',
      desc: '掠过盘面 · 极薄光刃',
      swatch: ['#fff0ce', '#cc742e'],
      values: {
        distance: 19.0, elevation: 0.9, fov: 40.0, azimuth: -4.0,
        lensing: 1.0, photonRing: 0.42, showDisk: true,
        diskInner: 3.0, diskOuter: 18.0, temperature: 4200,
        diskBrightness: 0.95, turbulence: 0.82, doppler: 0.3, diskSpeed: 1.0,
        starDensity: 0.85, stars: 0.9, nebula: 0.65,
        exposure: 0.9, bloom: 0.72, vignette: 58, grain: 27,
      },
    },
    {
      id: 'lens',
      name: '纯引力透镜',
      en: 'LENS ONLY',
      desc: '熄灭吸积盘 · 只看星空',
      swatch: ['#dfe8ff', '#5d5137'],
      values: {
        distance: 16.0, elevation: 12.0, fov: 41.0, azimuth: 112.0,
        lensing: 1.32, photonRing: 0.12, showDisk: false,
        diskInner: 3.0, diskOuter: 15.5, temperature: 4050,
        diskBrightness: 0.85, turbulence: 1.05, doppler: 0.0, diskSpeed: 1.0,
        starDensity: 1.15, stars: 1.25, nebula: 1.25,
        exposure: 1.0, bloom: 0.5, vignette: 50, grain: 22,
      },
    },
  ];

  const CONTROL_INDEX = {};
  for (const section of SECTIONS) {
    for (const control of section.controls) {
      CONTROL_INDEX[control.key] = control;
    }
  }

  const PRESET_INDEX = {};
  for (const preset of PRESETS) PRESET_INDEX[preset.id] = preset;

  function cloneDefaults() {
    return { ...DEFAULTS };
  }

  function formatValue(control, value, withUnit) {
    if (!control) return String(value);
    let text;
    if (control.unit === '%') {
      text = String(Math.round(value));
    } else if (control.precision === 0) {
      text = String(Math.round(value));
    } else if (control.signed) {
      const sign = value >= 0 ? '+' : '−';
      text = sign + Math.abs(value).toFixed(control.precision);
    } else {
      text = Number(value).toFixed(control.precision);
    }
    return withUnit && control.unit ? `${text} ${control.unit}` : text;
  }

  G.PARAMS = {
    defaults: DEFAULTS,
    sections: SECTIONS,
    presets: PRESETS,
    controlIndex: CONTROL_INDEX,
    presetIndex: PRESET_INDEX,
    cloneDefaults,
    formatValue,
  };
})();
