/* =============================================================================
 *  js/ui.js  ·  参数定义、侧边栏生成、预设
 * ========================================================================== */
(function (global) {
  'use strict';

  var BH = global.BH || (global.BH = {});

  /* ------------------------------------------- 克尔最内稳定圆轨道 ISCO（近似用于盘内缘） */
  // 返回以史瓦西半径 rs = 1 为单位的结果（M = 0.5）
  function iscoRadius(a) {
    a = Math.min(Math.max(a, 0), 0.9999);
    var a2 = a * a;
    var c1 = Math.pow(Math.max(1 - a2, 0), 1 / 3);
    var Z1 = 1 + c1 * (Math.pow(1 + a, 1 / 3) + Math.pow(1 - a, 1 / 3));
    var Z2 = Math.sqrt(3 * a2 + Z1 * Z1);
    var rM = 3 + Z2 - Math.sqrt(Math.max((3 - Z1) * (3 + Z1 + 2 * Z2), 0));
    return 0.5 * rM;                    // r(rs) = 0.5 * r(M)
  }
  BH.iscoRadius = iscoRadius;

  /* ------------------------------------------------------------------ 默认值 */
  var DEFAULTS = {
    // 时空
    spin: 0.999,
    followIsco: true,
    lensing: 1.0,
    frameDragging: 0.0,
    // 盘
    diskOn: true,
    diskInner: iscoRadius(0.999),
    diskOuter: 12.0,
    diskBrightness: 1.15,
    diskTemp: 1.0,
    diskTurbulence: 0.55,
    diskRotation: 0.45,
    diskOpacity: 0.97,
    diskThickness: 0.9,
    // 相对论效应
    doppler: 0.18,
    redshift: 1.0,
    photonRing: 0.5,
    // 星空
    starDensity: 1.0,
    starBrightness: 1.0,
    nebula: 0.35,
    // 相机
    cameraDistance: 20.0,
    cameraElevation: 5.0,
    fov: 46.0,
    autoRotate: false,
    autoRotateSpeed: 1.0,
    // 渲染
    quality: 'high',
    resolutionScale: 1.0,
    steps: 240,
    maxSamples: 32,
    bloom: 0.55,
    bloomRadius: 1.0,
    exposure: 1.0,
    autoQuality: true
  };
  BH.DEFAULTS = DEFAULTS;

  /* ------------------------------------------------------------- 参数表结构 */
  var GROUPS = [
    {
      id: 'spacetime', title: '时空与引力', open: true, items: [
        { key: 'spin', label: '自旋 a*', type: 'range', min: 0, max: 0.999, step: 0.001, digits: 3,
          hint: '克尔近似：决定 ISCO、盘内缘与多普勒不对称' },
        { key: 'followIsco', label: '盘内缘锁定 ISCO', type: 'check',
          hint: '内缘随自旋自动落在最内稳定圆轨道上' },
        { key: 'lensing', label: '引力透镜强度', type: 'range', min: 0, max: 1.5, step: 0.01, digits: 2,
          hint: '1.00 = 真实的史瓦西测地线；0 = 平直时空（可作对比）' },
        { key: 'frameDragging', label: '参考系拖曳（近似）', type: 'range', min: 0, max: 1, step: 0.01, digits: 2,
          hint: '艺术近似，非严格克尔度规；乘以自旋生效' }
      ]
    },
    {
      id: 'disk', title: '吸积盘', open: true, items: [
        { key: 'diskOn', label: '启用吸积盘', type: 'check' },
        { key: 'diskInner', label: '内缘半径 (rs)', type: 'range', min: 0.4, max: 12, step: 0.05, digits: 2 },
        { key: 'diskOuter', label: '外缘半径 (rs)', type: 'range', min: 2, max: 40, step: 0.1, digits: 1 },
        { key: 'diskBrightness', label: '亮度', type: 'range', min: 0, max: 4, step: 0.01, digits: 2 },
        { key: 'diskTemp', label: '色温 (T ∝ r⁻³ᐟ⁴)', type: 'range', min: 0.3, max: 2.5, step: 0.01, digits: 2,
          hint: '低温偏琥珀、高温偏蓝白' },
        { key: 'diskTurbulence', label: '湍流强度', type: 'range', min: 0, max: 2, step: 0.01, digits: 2 },
        { key: 'diskRotation', label: '转动速度', type: 'range', min: -2, max: 2, step: 0.01, digits: 2,
          hint: '开普勒剪切 Ω ∝ r⁻³ᐟ²，内圈明显快于外圈' },
        { key: 'diskOpacity', label: '不透明度', type: 'range', min: 0, max: 1, step: 0.01, digits: 2 },
        { key: 'diskThickness', label: '掠射增厚', type: 'range', min: 0, max: 3, step: 0.01, digits: 2,
          hint: '侧视时视线穿过的发光层更厚 → 边缘更亮' }
      ]
    },
    {
      id: 'relativity', title: '相对论效应', open: true, items: [
        { key: 'doppler', label: '多普勒集束 (g⁴)', type: 'range', min: 0, max: 1, step: 0.01, digits: 2,
          hint: '接近侧变亮偏蓝、远离侧变暗偏红。电影为求左右对称刻意调到 0' },
        { key: 'redshift', label: '引力红移 √(1−rs/r)', type: 'range', min: 0, max: 1, step: 0.01, digits: 2 },
        { key: 'photonRing', label: '光子环增强', type: 'range', min: 0, max: 2, step: 0.01, digits: 2,
          hint: '对高阶透镜像的艺术性提亮' }
      ]
    },
    {
      id: 'sky', title: '星空背景', open: false, items: [
        { key: 'starDensity', label: '恒星密度', type: 'range', min: 0, max: 3, step: 0.01, digits: 2 },
        { key: 'starBrightness', label: '恒星亮度', type: 'range', min: 0, max: 3, step: 0.01, digits: 2 },
        { key: 'nebula', label: '星云', type: 'range', min: 0, max: 1.5, step: 0.01, digits: 2 }
      ]
    },
    {
      id: 'camera', title: '相机', open: true, items: [
        { key: 'cameraDistance', label: '距离 (rs)', type: 'range', min: 3.5, max: 80, step: 0.1, digits: 1 },
        { key: 'cameraElevation', label: '仰角 (°)', type: 'range', min: -89, max: 89, step: 0.1, digits: 1,
          hint: '0° = 完全侧视，正是电影里的视角' },
        { key: 'fov', label: '视场角 (°)', type: 'range', min: 20, max: 90, step: 0.5, digits: 1 },
        { key: 'autoRotate', label: '自动环绕', type: 'check' },
        { key: 'autoRotateSpeed', label: '环绕速度', type: 'range', min: 0, max: 3, step: 0.01, digits: 2 }
      ]
    },
    {
      id: 'render', title: '渲染与性能', open: false, items: [
        { key: 'quality', label: '画质预设', type: 'select', options: [
          { v: 'low', t: '流畅（低）' }, { v: 'medium', t: '均衡（中）' },
          { v: 'high', t: '精细（高）' }, { v: 'ultra', t: '极致' } ] },
        { key: 'resolutionScale', label: '渲染分辨率', type: 'range', min: 0.4, max: 1.5, step: 0.01, digits: 2 },
        { key: 'steps', label: '光线积分步数', type: 'range', min: 64, max: 512, step: 8, digits: 0 },
        { key: 'maxSamples', label: '静止累积采样', type: 'range', min: 1, max: 128, step: 1, digits: 0,
          hint: '相机静止时逐帧叠加，可显著消除噪点与锯齿' },
        { key: 'bloom', label: '泛光强度', type: 'range', min: 0, max: 2, step: 0.01, digits: 2 },
        { key: 'bloomRadius', label: '泛光半径', type: 'range', min: 0.4, max: 2.5, step: 0.01, digits: 2 },
        { key: 'exposure', label: '曝光', type: 'range', min: 0.2, max: 3, step: 0.01, digits: 2 },
        { key: 'autoQuality', label: '帧率自适应降级', type: 'check' }
      ]
    }
  ];
  BH.GROUPS = GROUPS;

  /* ------------------------------------------------------------------ 预设 */
  var PRESETS = {
    interstellar: {
      label: '星际穿越（卡冈图雅）',
      params: { spin: 0.999, followIsco: true, lensing: 1.0, frameDragging: 0.25,
                diskOn: true, diskOuter: 12.0, diskBrightness: 1.15, diskTemp: 1.0,
                diskTurbulence: 0.45, diskRotation: 0.45, diskOpacity: 0.97, diskThickness: 0.9,
                doppler: 0.18, redshift: 1.0, photonRing: 0.5,
                starDensity: 1.0, starBrightness: 1.0, nebula: 0.35,
                cameraDistance: 20.0, cameraElevation: 5.0, fov: 46.0,
                autoRotate: false, autoRotateSpeed: 1.0,
                bloom: 0.55, exposure: 1.0 },
      after: function (s) { s.diskInner = iscoRadius(s.spin); }
    },
    classic: {
      label: '史瓦西经典',
      params: { spin: 0.0, followIsco: true, lensing: 1.0, frameDragging: 0.0,
                diskOn: true, diskOuter: 14.0, diskBrightness: 1.0, diskTemp: 1.1,
                diskTurbulence: 0.7, diskRotation: 0.5, diskOpacity: 0.95, diskThickness: 0.8,
                doppler: 0.65, redshift: 1.0, photonRing: 0.3,
                starDensity: 1.2, starBrightness: 1.1, nebula: 0.3,
                cameraDistance: 24.0, cameraElevation: 14.0, fov: 46.0,
                autoRotate: false, bloom: 0.5, exposure: 1.0 },
      after: function (s) { s.diskInner = iscoRadius(0.0); }
    },
    extreme: {
      label: '极端克尔 a* = 0.99',
      params: { spin: 0.99, followIsco: true, lensing: 1.0, frameDragging: 0.6,
                diskOn: true, diskOuter: 9.0, diskBrightness: 1.5, diskTemp: 1.35,
                diskTurbulence: 0.9, diskRotation: 0.8, diskOpacity: 0.99, diskThickness: 1.2,
                doppler: 0.9, redshift: 1.0, photonRing: 0.8,
                starDensity: 1.0, starBrightness: 1.0, nebula: 0.25,
                cameraDistance: 16.0, cameraElevation: 8.0, fov: 50.0,
                autoRotate: true, autoRotateSpeed: 1.0, bloom: 0.7, exposure: 1.05 },
      after: function (s) { s.diskInner = iscoRadius(0.99); }
    },
    edgeon: {
      label: '纯侧视薄盘',
      params: { spin: 0.999, followIsco: true, lensing: 1.0, frameDragging: 0.3,
                diskOn: true, diskOuter: 16.0, diskBrightness: 1.3, diskTemp: 0.95,
                diskTurbulence: 0.35, diskRotation: 0.35, diskOpacity: 1.0, diskThickness: 0.35,
                doppler: 0.1, redshift: 1.0, photonRing: 0.6,
                starDensity: 1.4, starBrightness: 1.2, nebula: 0.2,
                cameraDistance: 26.0, cameraElevation: 0.4, fov: 40.0,
                autoRotate: false, bloom: 0.6, exposure: 1.0 },
      after: function (s) { s.diskInner = iscoRadius(s.spin); }
    },
    topdown: {
      label: '俯视（近正对）',
      params: { spin: 0.999, followIsco: true, lensing: 1.0, frameDragging: 0.2,
                diskOn: true, diskOuter: 12.0, diskBrightness: 1.2, diskTemp: 1.0,
                diskTurbulence: 0.6, diskRotation: 0.5, diskOpacity: 0.97, diskThickness: 0.9,
                doppler: 0.3, redshift: 1.0, photonRing: 0.4,
                starDensity: 1.0, starBrightness: 1.0, nebula: 0.35,
                cameraDistance: 22.0, cameraElevation: 74.0, fov: 46.0,
                autoRotate: true, autoRotateSpeed: 0.6, bloom: 0.5, exposure: 1.0 },
      after: function (s) { s.diskInner = iscoRadius(s.spin); }
    },
    nolens: {
      label: '关闭引力透镜（平直时空对照）',
      params: { spin: 0.999, followIsco: true, lensing: 0.0, frameDragging: 0.0,
                diskOn: true, diskOuter: 12.0, diskBrightness: 1.15, diskTemp: 1.0,
                diskTurbulence: 0.45, diskRotation: 0.45, diskOpacity: 0.97, diskThickness: 0.9,
                doppler: 0.18, redshift: 0.0, photonRing: 0.0,
                starDensity: 1.0, starBrightness: 1.0, nebula: 0.35,
                cameraDistance: 20.0, cameraElevation: 5.0, fov: 46.0,
                autoRotate: false, bloom: 0.55, exposure: 1.0 },
      after: function (s) { s.diskInner = Math.max(iscoRadius(s.spin), 1.6); }
    }
  };
  BH.PRESETS = PRESETS;

  /* ------------------------------------------------------------ 画质预设表 */
  var QUALITY = {
    low:    { resolutionScale: 0.55, steps: 128, maxSamples: 1,  bloom: 0.45 },
    medium: { resolutionScale: 0.75, steps: 176, maxSamples: 8,  bloom: 0.5 },
    high:   { resolutionScale: 1.0,  steps: 240, maxSamples: 32, bloom: 0.55 },
    ultra:  { resolutionScale: 1.35, steps: 384, maxSamples: 96, bloom: 0.6 }
  };
  BH.QUALITY = QUALITY;

  /* =========================================================================
   *  UI 构建
   * ======================================================================= */
  var UI = {};
  var controls = {};        // key -> { input, valueEl, def }

  function fmt(v, digits) {
    if (digits === 0) return String(Math.round(v));
    return v.toFixed(digits);
  }

  // WebKit 滑块已填充部分（Firefox 用 ::-moz-range-progress 自动处理）
  function setFill(input, def, v) {
    if (def.type !== 'range') return;
    var pct = (parseFloat(v) - def.min) / (def.max - def.min) * 100;
    input.style.setProperty('--fill', Math.max(0, Math.min(100, pct)).toFixed(2) + '%');
  }

  UI.build = function (root, state, onChange) {
    root.innerHTML = '';
    controls = {};

    GROUPS.forEach(function (g) {
      var sec = document.createElement('section');
      sec.className = 'group' + (g.open ? '' : ' collapsed');
      sec.setAttribute('data-group', g.id);

      var head = document.createElement('button');
      head.className = 'group-head';
      head.type = 'button';
      head.innerHTML = '<span class="group-title">' + g.title + '</span><span class="group-caret">▾</span>';
      head.addEventListener('click', function () { sec.classList.toggle('collapsed'); });
      sec.appendChild(head);

      var body = document.createElement('div');
      body.className = 'group-body';

      g.items.forEach(function (def) {
        var wrap = document.createElement('div');
        wrap.className = 'ctrl ctrl-' + def.type;
        wrap.setAttribute('data-param', def.key);

        if (def.type === 'check') {
          var id = 'p-' + def.key;
          var lab = document.createElement('label');
          lab.className = 'ctrl-label';
          lab.setAttribute('for', id);
          lab.textContent = def.label;
          var cb = document.createElement('input');
          cb.type = 'checkbox';
          cb.className = 'ctrl-input';
          cb.id = id;
          cb.checked = !!state[def.key];
          cb.addEventListener('change', function () {
            state[def.key] = cb.checked;
            onChange(def.key);
          });
          wrap.appendChild(cb);
          wrap.appendChild(lab);
          controls[def.key] = { input: cb, def: def };
        } else {
          var top = document.createElement('div');
          top.className = 'ctrl-top';
          var id2 = 'p-' + def.key;
          var lab2 = document.createElement('label');
          lab2.className = 'ctrl-label';
          lab2.setAttribute('for', id2);
          lab2.textContent = def.label;
          var val = document.createElement('span');
          val.className = 'ctrl-value';
          val.id = 'v-' + def.key;
          top.appendChild(lab2);
          top.appendChild(val);
          wrap.appendChild(top);

          var input;
          if (def.type === 'select') {
            input = document.createElement('select');
            input.className = 'ctrl-input';
            def.options.forEach(function (o) {
              var op = document.createElement('option');
              op.value = o.v; op.textContent = o.t;
              input.appendChild(op);
            });
            input.value = state[def.key];
          } else {
            input = document.createElement('input');
            input.type = 'range';
            input.className = 'ctrl-input';
            input.min = def.min; input.max = def.max; input.step = def.step;
            input.value = state[def.key];
            setFill(input, def, state[def.key]);
            val.textContent = fmt(parseFloat(state[def.key]), def.digits);
          }
          input.id = id2;
          input.addEventListener('input', function () {
            var v = def.type === 'select' ? input.value : parseFloat(input.value);
            state[def.key] = v;
            if (def.type !== 'select') {
              val.textContent = fmt(v, def.digits);
              setFill(input, def, v);
            }
            onChange(def.key);
          });
          wrap.appendChild(input);
          controls[def.key] = { input: input, valueEl: val, def: def };
        }

        if (def.hint) {
          var hint = document.createElement('div');
          hint.className = 'ctrl-hint';
          hint.textContent = def.hint;
          wrap.appendChild(hint);
        }
        body.appendChild(wrap);
      });

      sec.appendChild(body);
      root.appendChild(sec);
    });
  };

  /* 刷新某个控件显示（用于相机拖动 / 预设 / 联动） */
  UI.sync = function (key, state) {
    var c = controls[key];
    if (!c) return;
    if (c.def.type === 'check') c.input.checked = !!state[key];
    else if (c.def.type === 'select') c.input.value = state[key];
    else {
      c.input.value = state[key];
      setFill(c.input, c.def, state[key]);
      if (c.valueEl) c.valueEl.textContent = fmt(parseFloat(state[key]), c.def.digits);
    }
  };

  UI.syncAll = function (state) {
    Object.keys(controls).forEach(function (k) { UI.sync(k, state); });
  };

  BH.UI = UI;
})(window);
