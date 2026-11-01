/* ============================================================
   params.js — 参数定义 / 默认值 / 预设 / 派生量计算
   ============================================================ */
(function (global) {
  'use strict';

  const QUALITY = [
    { name: '低', steps: 300, stepH: 0.105 },
    { name: '中', steps: 620, stepH: 0.075 },
    { name: '高', steps: 1100, stepH: 0.055 },
    { name: '极致', steps: 1800, stepH: 0.040 }
  ];

  const DEFAULTS = {
    // 黑洞
    mass: 10, spin: 0.0, mdotLog: -8,
    // 吸积盘
    diskIn: 3, diskOut: 14, diskBright: 1.15, diskTemp: 1.0, diskTurb: 0.5, diskDir: 1,
    diskFall: 0.85,
    // 引力透镜
    lensing: 1.0, doppler: 1.0, redshift: 0.8, spinDrag: 0.4,
    // 星空
    starDensity: 85, starBright: 1.0, galaxy: 0.15,
    // 相机
    zoom: 1.0, fov: 44, azimuth: -90, elevation: 12, exposure: 0.25,
    // 渲染
    quality: 2, autoRes: true, resScale: 0.85,
    bloom: 0.85, bloomThreshold: 0.9, grain: 0.18, vignette: 0.38, aberration: 0.18,
    timeScale: 1.0
  };

  const GROUPS = [
    {
      id: 'hole', name: '黑洞', items: [
        {
          key: 'mass', label: '质量 M', type: 'range', min: 3, max: 80, step: 0.5,
          fmt: v => v.toFixed(1) + ' M☉',
          hint: '改变物理尺度与吸积盘色温（温度 ∝ Ṁ^¼ / M）。几何外观按 rs 归一化后不变。'
        },
        {
          key: 'spin', label: '无量纲自旋 a*', type: 'range', min: 0, max: 0.998, step: 0.002,
          fmt: v => v.toFixed(3),
          hint: '改变吸积盘最内稳定圆轨道 (ISCO)：a*=0 时 ISCO=3 rs，a*→1 时趋近 0.5 rs。光线追踪仍采用史瓦西近似。'
        },
        {
          key: 'mdotLog', label: '吸积率 Ṁ', type: 'range', min: -12, max: -5, step: 0.05,
          fmt: v => '10^' + v.toFixed(2) + ' M☉/yr',
          hint: '爱丁顿率约 2.2×10⁻⁸ M☉/yr（10 M☉）。'
        }
      ]
    },
    {
      id: 'disk', name: '吸积盘', items: [
        {
          key: 'diskIn', label: '内缘半径', type: 'range', min: 0.5, max: 16, step: 0.1,
          fmt: v => v.toFixed(1) + ' rs',
          hint: '默认跟随自旋对应的 ISCO；手动拖动后即解除联动。'
        },
        {
          key: 'diskOut', label: '外缘半径', type: 'range', min: 3, max: 32, step: 0.5,
          fmt: v => v.toFixed(1) + ' rs'
        },
        {
          key: 'diskBright', label: '整体亮度', type: 'range', min: 0, max: 3, step: 0.05,
          fmt: v => v.toFixed(2)
        },
        {
          key: 'diskTemp', label: '色温倍率', type: 'range', min: 0.2, max: 3, step: 0.05,
          fmt: v => '×' + v.toFixed(2),
          hint: '物理色温被压缩映射到可见波段以便肉眼观察。'
        },
        {
          key: 'diskFall', label: '亮度径向梯度', type: 'range', min: 0.2, max: 3, step: 0.05,
          fmt: v => v.toFixed(2),
          hint: '吸积盘亮度随半径的衰减指数（Stefan–Boltzmann 型），越大外缘越暗。'
        },
        {
          key: 'diskTurb', label: '湍流条纹', type: 'range', min: 0, max: 1, step: 0.02,
          fmt: v => v.toFixed(2),
          hint: '开普勒剪切驱动的螺旋扰动，模拟电影中的气体条纹。'
        },
        {
          key: 'diskDir', label: '旋向', type: 'seg',
          options: ['逆时针', '顺时针'], values: [1, -1]
        }
      ]
    },
    {
      id: 'lens', name: '透镜', items: [
        {
          key: 'lensing', label: '透镜强度', type: 'range', min: 0, max: 1.5, step: 0.02,
          fmt: v => v.toFixed(2),
          hint: '0 = 完全关闭弯曲（直线传播），可直观对比广义相对论效应。'
        },
        {
          key: 'doppler', label: '多普勒增亮', type: 'range', min: 0, max: 2, step: 0.05,
          fmt: v => v.toFixed(2),
          hint: '迎面一侧因相对论集束 (I ∝ g⁴) 显著增亮并蓝移。'
        },
        {
          key: 'redshift', label: '引力红移', type: 'range', min: 0, max: 2, step: 0.05,
          fmt: v => v.toFixed(2),
          hint: '越靠近视界越红、越暗。'
        },
        {
          key: 'spinDrag', label: '参考系拖曳', type: 'range', min: 0, max: 1.5, step: 0.05,
          fmt: v => v.toFixed(2),
          hint: '自旋引起的拖曳效应（一阶近似，仅作用于背景星空）。'
        }
      ]
    },
    {
      id: 'sky', name: '星空', items: [
        { key: 'starDensity', label: '恒星密度', type: 'range', min: 30, max: 420, step: 5, fmt: v => v.toFixed(0) },
        { key: 'starBright', label: '恒星亮度', type: 'range', min: 0, max: 3, step: 0.05, fmt: v => v.toFixed(2) },
        { key: 'galaxy', label: '银河带', type: 'range', min: 0, max: 1, step: 0.02, fmt: v => v.toFixed(2) }
      ]
    },
    {
      id: 'cam', name: '相机', items: [
        { key: 'zoom', label: '距离倍率', type: 'range', min: 0.28, max: 4, step: 0.02, fmt: v => '×' + v.toFixed(2) },
        { key: 'fov', label: '垂直视场角', type: 'range', min: 20, max: 90, step: 1, fmt: v => v.toFixed(0) + '°' },
        { key: 'azimuth', label: '方位角', type: 'range', min: -180, max: 180, step: 1, fmt: v => v.toFixed(0) + '°' },
        { key: 'elevation', label: '仰角', type: 'range', min: -85, max: 85, step: 0.5, fmt: v => v.toFixed(1) + '°' },
        { key: 'exposure', label: '曝光', type: 'range', min: -4, max: 4, step: 0.1, fmt: v => (v >= 0 ? '+' : '') + v.toFixed(1) + ' EV' }
      ]
    },
    {
      id: 'render', name: '渲染', items: [
        { key: 'quality', label: '积分质量', type: 'seg', options: QUALITY.map(q => q.name), values: [0, 1, 2, 3] },
        { key: 'autoRes', label: '自动分辨率', type: 'toggle' },
        { key: 'resScale', label: '渲染倍率', type: 'range', min: 0.4, max: 1, step: 0.05, fmt: v => v.toFixed(2) + '×' },
        { key: 'bloom', label: '泛光强度', type: 'range', min: 0, max: 2.5, step: 0.05, fmt: v => v.toFixed(2) },
        { key: 'bloomThreshold', label: '泛光阈值', type: 'range', min: 0.2, max: 3, step: 0.05, fmt: v => v.toFixed(2) },
        { key: 'grain', label: '胶片颗粒', type: 'range', min: 0, max: 1, step: 0.02, fmt: v => v.toFixed(2) },
        {key: 'vignette', label: '暗角', type: 'range', min: 0, max: 1, step: 0.02, fmt: v => v.toFixed(2) },
        { key: 'aberration', label: '色散', type: 'range', min: 0, max: 1, step: 0.02, fmt: v => v.toFixed(2) },
        { key: 'timeScale', label: '时间流速', type: 'range', min: 0, max: 4, step: 0.05, fmt: v => '×' + v.toFixed(2) }
      ]
    }
  ];

  const PRESETS = [
    {
      name: '卡冈图雅', wide: true,
      patch: {
        mass: 10, spin: 0, mdotLog: -7.6,
        diskIn: 3, diskOut: 14, diskBright: 1.05, diskTemp: 1.0, diskTurb: 0.55, diskDir: 1,
        lensing: 1, doppler: 1, redshift: 0.75, spinDrag: 0.4,
        starDensity: 160, starBright: 1, galaxy: 0.22,
        zoom: 1, fov: 44, azimuth: -90, elevation: 11, exposure: 0.25,
        quality: 2, bloom: 0.9, bloomThreshold: 0.85, grain: 0.16, vignette: 0.38, aberration: 0.18, timeScale: 1
      }
    },
    { name: '电影广角', patch: { fov: 72, elevation: 20, zoom: 1.15, diskOut: 16, diskBright: 0.95, quality: 2 } },
    { name: '极端透镜', patch: { zoom: 0.42, fov: 30, elevation: 5, diskOut: 12, quality: 3 } },
    { name: '关闭透镜（对照）', wide: true, patch: { lensing: 0, spinDrag: 0, diskIn: 3, diskOut: 14 } },
    { name: '正侧视', patch: { elevation: 0.6, fov: 40, zoom: 1, diskOut: 13 } },
    { name: '冷蓝巨盘', patch: { mass: 4, mdotLog: -6.6, diskTemp: 1.15, diskBright: 1.1 } },
    { name: '暖红矮盘', patch: { mass: 45, mdotLog: -8.4, diskTemp: 1.0, diskOut: 16 } },
    { name: '纯净星空', patch: { galaxy: 0, starDensity: 260, starBright: 1.25, diskBright: 0.8 } }
  ];

  /* ---------- Kerr ISCO (Bardeen-Press-Teukolsky) ---------- */
  function iscoRs(a) {
    a = Math.min(Math.max(a, 0), 0.998);
    const c = Math.cbrt(1 - a * a);
    const Z1 = 1 + c * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
    const Z2 = Math.sqrt(3 * a * a + Z1 * Z1);
    const rM = 3 + Z2 - Math.sqrt((3 - Z1) * (3 + Z1 + 2 * Z2));
    return rM / 2;   // M → rs
  }

  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  }
  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }

  /** 由参数生成渲染所需的完整状态 */
  function computeState(s) {
    const q = QUALITY[s.quality] || QUALITY[2];

    /* ISCO 联动 */
    const isco = iscoRs(s.spin);
    if (!s._inTouched) s.diskIn = Math.round(isco * 10) / 10;
    const rin = Math.min(Math.max(s.diskIn, 0.3), s.diskOut - 0.5);

    /* 色温：物理温度压缩映射到可见波段 */
    const mdot = Math.pow(10, s.mdotLog);
    const tPhys = 7.5e8 * Math.pow(mdot, 0.25) / Math.max(s.mass, 0.1);
    const tempK = 4200 * Math.pow(Math.max(tPhys, 1) / 1e5, 0.30) * s.diskTemp;

    /* 相机 */
    const dist = s.zoom * 3.45 * Math.max(s.diskOut, 2);
    const az = s.azimuth * Math.PI / 180;
    const el = s.elevation * Math.PI / 180;
    const pos = [
      dist * Math.cos(el) * Math.cos(az),
      dist * Math.cos(el) * Math.sin(az),
      dist * Math.sin(el)
    ];
    const fwd = [-pos[0] / dist, -pos[1] / dist, -pos[2] / dist];
    const upW = Math.abs(fwd[2]) > 0.999 ? [0, 1, 0] : [0, 0, 1];
    const right = norm(cross(fwd, upW));
    const up = cross(right, fwd);
    const basis = new Float32Array([
      right[0], right[1], right[2],
      up[0], up[1], up[2],
      fwd[0], fwd[1], fwd[2]
    ]);

    const rsKm = 2.95325 * s.mass;
    return {
      diskIn: rin,
      diskOut: Math.max(s.diskOut, rin + 0.5),
      diskBright: s.diskBright,
      diskTempK: tempK,
      diskTurb: s.diskTurb,
      diskDir: s.diskDir,
      diskFall: s.diskFall,
      lensing: s.lensing,
      doppler: s.doppler,
      redshift: s.redshift,
      spinDrag: s.spinDrag,
      spinSign: 1,
      starDensity: s.starDensity,
      starBright: s.starBright,
      galaxy: s.galaxy,
      exposure: s.exposure,
      bloom: s.bloom,
      bloomThreshold: s.bloomThreshold,
      grain: s.grain,
      vignette: s.vignette,
      aberration: s.aberration,
      steps: q.steps,
      stepH: q.stepH,
      omega: 6.6 * s.timeScale,
      camera: {
        pos, basis,
        tanHalfFov: Math.tan(s.fov * Math.PI / 360),
        dist
      },
      info: {
        rsKm: rsKm,
        iscoKm: isco * rsKm,
        iscoRs: isco,
        periodMs: 2 * Math.PI * Math.sqrt(Math.pow(isco * rsKm * 1000, 3) / (6.674e-11 * s.mass * 1.989e30)) * 1000,
        tempK: tempK,
        shadowRs: 2.598 * 2   // b_c = 3√3 M = 2.598 rs，直径 5.196 rs
      }
    };
  }

  global.PARAMS = { QUALITY, DEFAULTS, GROUPS, PRESETS, iscoRs, computeState };
})(window);
