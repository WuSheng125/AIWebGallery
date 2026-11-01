/**
 * params.js —— 参数定义、默认值与预设
 * 所有长度单位均以"史瓦西半径 rs"为基准，保证物理比例一致。
 */

/** 最内稳定圆轨道（ISCO）半径 / rs，随自旋变化（近似公式） */
export function iscoRadius(spin) {
  const a = Math.min(Math.max(spin, 0), 0.998);
  const Z1 = 1 + Math.pow(1 - a * a, 1 / 3) * (
    Math.pow(1 + a, 1 / 3) + Math.pow(1 - a, 1 / 3));
  const Z2 = Math.sqrt(3 * a * a + Z1 * Z1);
  return 3 + Z2 - Math.sign(a) * Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2));
}

/** 光子球半径 / rs */
export function photonSphere(spin) {
  return 1.5;
}

export const DEFAULT_PARAMS = {
  // --- 黑洞本体 ---
  rs: 1.0,                 // 史瓦西半径（世界单位）
  spin: 0.62,              // 自旋 a ∈ [0, 0.998]

  // --- 吸积盘 ---
  diskInner: 2.75,         // 内半径（rs 倍数）
  diskOuter: 8.5,          // 外半径（rs 倍数）≈ 3.3× 阴影半径，接近电影构图
  diskThickness: 0.16,     // 半厚度（rs 倍数）
  diskTemp: 1.40,          // 温度标度
  diskOpacity: 0.97,       // 不透明度
  diskTilt: -0.115,        // 盘倾角（弧度）≈ -6.6°，电影中盘几乎侧向

  // --- 相对论效应 ---
  dopplerBeam: 0.90,       // 多普勒集束
  gravRedshift: 1.05,      // 引力红移
  lensing: 1.00,           // 透镜效应强度
  einsteinRing: 0.55,      // 爱因斯坦环
  volumetric: 0.30,        // 体积雾 / 湍流

  // --- 性能 / 画质 ---
  steps: 2.0,              // 光线步进质量 1..3
  renderScale: 1.0,        // 渲染缩放
  maxPixelRatio: 2.0,

  // --- 后期 ---
  exposure: 1.10,
  bloomStrength: 0.42,
  bloomThreshold: 1.00,
  grain: 0.30,
  vignette: 0.42,
  chroma: 0.5,

  // --- 背景 ---
  starDensity: 0.55,
  starBrightness: 1.00,

  // --- 调试（0 = 正常渲染；仅在 tools/debug-render.mjs 中使用）---
  debug: 0,
};

export const PRESETS = {
  gargantua: {
    label: '卡冈图雅（电影默认）',
    hint: '接近侧向的薄盘、强烈多普勒集束、明亮光环',
    params: {
      spin: 0.62, diskInner: 2.75, diskOuter: 8.5, diskThickness: 0.16,
      diskTemp: 1.40, diskOpacity: 0.97, diskTilt: -0.115,
      dopplerBeam: 0.90, gravRedshift: 1.05, lensing: 1.00,
      einsteinRing: 0.55, volumetric: 0.30, steps: 2.0,
      exposure: 1.10, bloomStrength: 0.42, bloomThreshold: 1.00,
      grain: 0.30, vignette: 0.42, chroma: 0.5,
      starDensity: 0.55, starBrightness: 1.00,
    },
  },
  extreme: {
    label: '极端自旋（接近视界）',
    hint: 'a≈0.998，ISCO 贴近视界，盘面极度扭曲',
    params: {
      spin: 0.998, diskInner: 0.85, diskOuter: 7.0, diskThickness: 0.26,
      diskTemp: 1.75, diskOpacity: 1.00, diskTilt: -0.18,
      dopplerBeam: 1.00, gravRedshift: 1.30, lensing: 1.00,
      einsteinRing: 0.75, volumetric: 0.45, steps: 3.0,
      exposure: 0.95, bloomStrength: 0.65, bloomThreshold: 0.80,
      grain: 0.30, vignette: 0.42, chroma: 0.6,
      starDensity: 0.45, starBrightness: 0.95,
    },
  },
  coldQuiet: {
    label: '低温暗盘',
    hint: '温度低、亮度弱，突出纯引力透镜结构',
    params: {
      spin: 0.25, diskInner: 3.10, diskOuter: 9.0, diskThickness: 0.14,
      diskTemp: 0.60, diskOpacity: 0.60, diskTilt: -0.10,
      dopplerBeam: 0.40, gravRedshift: 0.80, lensing: 1.00,
      einsteinRing: 0.35, volumetric: 0.18, steps: 2.0,
      exposure: 1.25, bloomStrength: 0.35, bloomThreshold: 0.95,
      grain: 0.30, vignette: 0.50, chroma: 0.4,
      starDensity: 0.65, starBrightness: 1.10,
    },
  },
  faceOn: {
    label: '近正视角',
    hint: '盘面接近正对相机，可见完整吸积盘与多普勒双峰',
    params: {
      spin: 0.55, diskInner: 2.60, diskOuter: 8.0, diskThickness: 0.24,
      diskTemp: 1.25, diskOpacity: 0.92, diskTilt: -1.30,
      dopplerBeam: 0.90, gravRedshift: 1.00, lensing: 1.00,
      einsteinRing: 0.45, volumetric: 0.30, steps: 2.0,
      exposure: 1.00, bloomStrength: 0.45, bloomThreshold: 0.90,
      grain: 0.30, vignette: 0.42, chroma: 0.5,
      starDensity: 0.55, starBrightness: 1.00,
    },
  },
  noLensing: {
    label: '对照组：关闭透镜',
    hint: '仅保留盘与星空，便于理解引力透镜的贡献',
    params: {
      spin: 0.62, diskInner: 2.75, diskOuter: 8.5, diskThickness: 0.16,
      diskTemp: 1.40, diskOpacity: 0.97, diskTilt: -0.115,
      dopplerBeam: 0.90, gravRedshift: 1.05, lensing: 0.00,
      einsteinRing: 0.00, volumetric: 0.30, steps: 2.0,
      exposure: 1.10, bloomStrength: 0.42, bloomThreshold: 1.00,
      grain: 0.30, vignette: 0.42, chroma: 0.5,
      starDensity: 0.55, starBrightness: 1.00,
    },
  },
  quasar: {
    label: '类星体（极端亮度）',
    hint: '极高亮度与喷流辉光，高曝光',
    params: {
      spin: 0.90, diskInner: 1.40, diskOuter: 8.0, diskThickness: 0.30,
      diskTemp: 2.20, diskOpacity: 1.00, diskTilt: -0.30,
      dopplerBeam: 1.00, gravRedshift: 1.10, lensing: 1.00,
      einsteinRing: 0.80, volumetric: 0.60, steps: 3.0,
      exposure: 0.80, bloomStrength: 0.75, bloomThreshold: 0.75,
      grain: 0.30, vignette: 0.40, chroma: 0.7,
      starDensity: 0.40, starBrightness: 0.85,
    },
  },
};

/** 视角预设：theta（方位角）, phi（极角）, distance */
export const VIEWS = {
  cinematic: { label: '电影机位', theta: Math.PI * 0.28, phi: Math.PI / 2 - 0.20, distance: 20 },
  closeup:   { label: '特写',     theta: Math.PI * 0.42, phi: Math.PI / 2 - 0.10, distance: 10 },
  wide:      { label: '广角',     theta: Math.PI * 0.15, phi: Math.PI / 2 - 0.34, distance: 46 },
  top:       { label: '俯视',     theta: Math.PI * 0.30, phi: 0.20,             distance: 24 },
  grazing:   { label: '掠射',     theta: Math.PI * 0.10, phi: Math.PI / 2 - 0.03, distance: 15 },
};

/** 滑块控件定义 */
export const CONTROLS = [
  {
    group: '黑洞本体',
    items: [
      { key: 'rs', label: '质量（rs）', min: 0.35, max: 3.0, step: 0.05,
        fmt: v => `${v.toFixed(2)} rs`, desc: '史瓦西半径，决定黑洞的物理尺度与阴影大小' },
      { key: 'spin', label: '自旋 a', min: 0, max: 0.998, step: 0.001, fmt: v => v.toFixed(3),
        desc: '克尔黑洞自旋参数，决定 ISCO 位置与时空拖曳' },
    ],
  },
  {
    group: '吸积盘',
    items: [
      { key: 'diskInner', label: '内半径', min: 0.6, max: 8, step: 0.05,
        fmt: v => `${v.toFixed(2)} rs`, desc: '吸积盘内边界，通常取 ISCO' },
      { key: 'diskOuter', label: '外半径', min: 4, max: 30, step: 0.5,
        fmt: v => `${v.toFixed(1)} rs`, desc: '吸积盘外边界' },
      { key: 'diskThickness', label: '厚度', min: 0.02, max: 1.2, step: 0.01,
        fmt: v => `${v.toFixed(2)} rs`, desc: '盘的半厚度，越大越蓬松' },
      { key: 'diskTemp', label: '温度', min: 0.2, max: 3, step: 0.01,
        fmt: v => `${v.toFixed(2)}`, desc: '盘的温度标度，影响亮度与色温' },
      { key: 'diskOpacity', label: '不透明度', min: 0, max: 1, step: 0.01,
        fmt: v => v.toFixed(2), desc: '盘的物质不透明度' },
      { key: 'diskTilt', label: '倾角', min: -1.6, max: 0, step: 0.005,
        fmt: v => `${(-v * 180 / Math.PI).toFixed(1)}°`, desc: '盘面相对视线的倾角（0=正对）' },
    ],
  },
  {
    group: '相对论效应',
    items: [
      { key: 'dopplerBeam', label: '多普勒集束', min: 0, max: 1, step: 0.01,
        fmt: v => v.toFixed(2), desc: '运动物质朝向观测者时的增亮效应' },
      { key: 'gravRedshift', label: '引力红移', min: 0, max: 2, step: 0.01,
        fmt: v => v.toFixed(2), desc: '强引力场中的光子红移与变暗' },
      { key: 'lensing', label: '透镜强度', min: 0, max: 1, step: 0.01,
        fmt: v => v.toFixed(2), desc: '引力透镜（光线偏折）强度' },
      { key: 'einsteinRing', label: '爱因斯坦环', min: 0, max: 1.5, step: 0.01,
        fmt: v => v.toFixed(2), desc: '远侧星光被透镜形成的亮环' },
      { key: 'volumetric', label: '体积湍流', min: 0, max: 1, step: 0.01,
        fmt: v => v.toFixed(2), desc: '盘的体积感与湍流细节' },
    ],
  },
  {
    group: '背景星空',
    items: [
      { key: 'starDensity', label: '恒星密度', min: 0, max: 1, step: 0.01,
        fmt: v => v.toFixed(2), desc: '背景恒星数量' },
      { key: 'starBrightness', label: '恒星亮度', min: 0, max: 2, step: 0.01,
        fmt: v => v.toFixed(2), desc: '背景恒星亮度' },
    ],
  },
  {
    group: '后期处理',
    items: [
      { key: 'exposure', label: '曝光', min: 0.2, max: 2.5, step: 0.01,
        fmt: v => v.toFixed(2), desc: '整体曝光' },
      { key: 'bloomStrength', label: '辉光', min: 0, max: 1.5, step: 0.01,
        fmt: v => v.toFixed(2), desc: '辉光强度' },
      { key: 'bloomThreshold', label: '辉光阈值', min: 0.1, max: 2, step: 0.01,
        fmt: v => v.toFixed(2), desc: '超过此亮度才产生辉光' },
      { key: 'grain', label: '颗粒', min: 0, max: 1, step: 0.01,
        fmt: v => v.toFixed(2), desc: '胶片颗粒感' },
      { key: 'vignette', label: '暗角', min: 0, max: 1, step: 0.01,
        fmt: v => v.toFixed(2), desc: '画面四角变暗' },
      { key: 'chroma', label: '色散', min: 0, max: 2, step: 0.01,
        fmt: v => v.toFixed(2), desc: '镜头色散' },
    ],
  },
];

/** 性能相关控件（单独区域） */
export const PERF_CONTROLS = [
  { key: 'steps', label: '步进质量', min: 1, max: 3, step: 0.05,
    fmt: v => `${v.toFixed(2)}x`, desc: '光线步进采样数，越高越精细但更耗性能' },
  { key: 'renderScale', label: '渲染分辨率', min: 0.5, max: 1, step: 0.05,
    fmt: v => `${Math.round(v * 100)}%`, desc: '低于 100% 可提升帧率' },
  { key: 'maxPixelRatio', label: '设备像素比上限', min: 1, max: 3, step: 0.25,
    fmt: v => `${v.toFixed(2)}x`, desc: '限制 DPR 上限以控制高分辨率屏幕的负载' },
];
