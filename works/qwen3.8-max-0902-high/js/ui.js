'use strict';

/* ================================================================
 *  侧边栏 UI：参数配置、预设、DOM 构建
 * ================================================================ */

var UI_DEFAULTS = {
  // 黑洞
  mass: 1.0,          // 事件视界半径 rs
  lensing: 1.0,       // 引力透镜强度
  // 吸积盘
  diskInner: 3.0,     // × rs（3rs = ISCO 最内稳定圆轨道）
  diskOuter: 12.0,    // × rs
  diskBright: 1.0,
  diskTemp: 0.66,     // 色温（金黄白，卡冈图雅色调）
  doppler: 0.8,       // 多普勒聚束强度
  spin: 0.8,          // 旋转速度
  diskThick: 0.5,     // 盘面厚度
  tilt: 0,            // 盘面倾角（度）
  // 星空
  starDensity: 0.55,
  starBright: 1.0,
  nebula: 0.3,
  // 画面
  fov: 50,
  exposure: 0.95,
  bloom: 0.35,
  streak: 0.25,
  vignette: 0.45,
  grain: 0.025,
  renderScale: 0.75,
  steps: 256,
  adaptive: true,
  autoRotate: false
};

var UI_GROUPS = [
  {
    title: '黑洞', sub: 'BLACK HOLE', items: [
      { key: 'mass', label: '质量 / 视界半径', hint: 'Mass', min: 0.4, max: 3, step: 0.05, fmt: function (v) { return v.toFixed(2) + ' Rs'; } },
      { key: 'lensing', label: '引力透镜强度', hint: 'Lensing', min: 0, max: 2, step: 0.01, fmt: function (v) { return v.toFixed(2) + '×'; } }
    ]
  },
  {
    title: '吸积盘', sub: 'ACCRETION DISK', items: [
      { key: 'diskInner', label: '内半径', hint: 'Inner R', min: 1.5, max: 8, step: 0.1, fmt: function (v) { return v.toFixed(1) + ' Rs'; } },
      { key: 'diskOuter', label: '外半径', hint: 'Outer R', min: 5, max: 26, step: 0.1, fmt: function (v) { return v.toFixed(1) + ' Rs'; } },
      { key: 'diskBright', label: '亮度', hint: 'Brightness', min: 0, max: 3, step: 0.01 },
      { key: 'diskTemp', label: '色温', hint: 'Temperature', min: 0.15, max: 1, step: 0.01 },
      { key: 'doppler', label: '多普勒效应', hint: 'Doppler', min: 0, max: 1, step: 0.01 },
      { key: 'spin', label: '旋转速度', hint: 'Spin', min: 0, max: 3, step: 0.01 },
      { key: 'diskThick', label: '盘面厚度', hint: 'Thickness', min: 0, max: 1, step: 0.01 },
      { key: 'tilt', label: '盘面倾角', hint: 'Tilt', min: -90, max: 90, step: 1, fmt: function (v) { return v.toFixed(0) + '°'; } }
    ]
  },
  {
    title: '星空背景', sub: 'STARFIELD', items: [
      { key: 'starDensity', label: '恒星密度', hint: 'Density', min: 0, max: 1, step: 0.01 },
      { key: 'starBright', label: '恒星亮度', hint: 'Brightness', min: 0, max: 2, step: 0.01 },
      { key: 'nebula', label: '星云强度', hint: 'Nebula', min: 0, max: 1, step: 0.01 }
    ]
  },
  {
    title: '画面与渲染', sub: 'RENDERING', items: [
      { key: 'fov', label: '视场角', hint: 'FOV', min: 25, max: 90, step: 1, fmt: function (v) { return v.toFixed(0) + '°'; } },
      { key: 'exposure', label: '曝光', hint: 'Exposure', min: 0.2, max: 2.5, step: 0.01 },
      { key: 'bloom', label: '泛光强度', hint: 'Bloom', min: 0, max: 1.5, step: 0.01 },
      { key: 'streak', label: '宽银幕眩光', hint: 'Streak', min: 0, max: 1, step: 0.01 },
      { key: 'vignette', label: '暗角', hint: 'Vignette', min: 0, max: 1, step: 0.01 },
      { key: 'grain', label: '胶片颗粒', hint: 'Grain', min: 0, max: 0.12, step: 0.002, fmt: function (v) { return v.toFixed(3); } },
      { key: 'renderScale', label: '渲染精度', hint: 'Render Scale', min: 0.4, max: 1, step: 0.05, fmt: function (v) { return Math.round(v * 100) + '%'; } },
      {
        key: 'steps', label: '光线步进质量', hint: 'Quality', type: 'select', options: [
          { v: '96', l: '低 · 96 步' },
          { v: '160', l: '中 · 160 步' },
          { v: '256', l: '高 · 256 步' },
          { v: '400', l: '超高 · 400 步' }
        ]
      },
      { key: 'adaptive', label: '自适应分辨率', hint: 'Adaptive', type: 'toggle' },
      { key: 'autoRotate', label: '自动旋转', hint: 'Auto Rotate', type: 'toggle' }
    ]
  }
];

var UI_PRESETS = {
  gargantua: {
    label: '卡冈图雅', sub: 'Gargantua · 星际穿越',
    params: {
      mass: 1.0, lensing: 1.0, diskInner: 3.0, diskOuter: 12.0,
      diskBright: 1.0, diskTemp: 0.66, doppler: 0.8, spin: 0.8,
      diskThick: 0.5, tilt: 0, starDensity: 0.55, starBright: 1.0, nebula: 0.3,
      fov: 50, exposure: 0.95, bloom: 0.35, streak: 0.25, vignette: 0.45, grain: 0.025
    },
    camera: { thetaDeg: -60, phiDeg: 77, dist: 27 }
  },
  m87: {
    label: '超大质量黑洞', sub: 'M87* 风格 · 缓慢低温',
    params: {
      mass: 2.2, lensing: 1.0, diskInner: 3.2, diskOuter: 20.0,
      diskBright: 0.8, diskTemp: 0.42, doppler: 0.6, spin: 0.22,
      diskThick: 0.65, tilt: 0, starDensity: 0.5, starBright: 1.0, nebula: 0.4,
      fov: 50, exposure: 1.0, bloom: 0.35, streak: 0.2, vignette: 0.45, grain: 0.025
    },
    camera: { thetaDeg: -40, phiDeg: 64, dist: 62 }
  },
  quasar: {
    label: '类星体', sub: 'Quasar · 狂暴吸积',
    params: {
      mass: 1.2, lensing: 1.05, diskInner: 2.6, diskOuter: 16.0,
      diskBright: 1.0, diskTemp: 0.95, doppler: 1.0, spin: 1.3,
      diskThick: 0.45, tilt: 0, starDensity: 0.45, starBright: 0.9, nebula: 0.25,
      fov: 55, exposure: 0.7, bloom: 0.45, streak: 0.35, vignette: 0.5, grain: 0.03
    },
    camera: { thetaDeg: -75, phiDeg: 66, dist: 36 }
  },
  weak: {
    label: '弱透镜演示', sub: '对比 · 光线几乎不弯曲',
    params: {
      mass: 1.0, lensing: 0.12, diskInner: 4.0, diskOuter: 14.0,
      diskBright: 1.0, diskTemp: 0.5, doppler: 0.3, spin: 0.4,
      diskThick: 0.5, tilt: 0, starDensity: 0.55, starBright: 1.0, nebula: 0.3,
      fov: 50, exposure: 0.95, bloom: 0.35, streak: 0.2, vignette: 0.45, grain: 0.025
    },
    camera: { thetaDeg: -60, phiDeg: 70, dist: 36 }
  },
  top: {
    label: '俯视盘面', sub: 'Top-down ·  face-on',
    params: {
      mass: 1.0, lensing: 1.0, diskInner: 3.0, diskOuter: 14.0,
      diskBright: 1.0, diskTemp: 0.66, doppler: 0.85, spin: 0.8,
      diskThick: 0.4, tilt: 0, starDensity: 0.55, starBright: 1.0, nebula: 0.3,
      fov: 50, exposure: 0.95, bloom: 0.35, streak: 0.25, vignette: 0.45, grain: 0.025
    },
    camera: { thetaDeg: -60, phiDeg: 20, dist: 34 }
  },
  perf: {
    label: '性能模式', sub: 'Performance · 低负载流畅',
    params: {
      mass: 1.0, lensing: 1.0, diskInner: 3.0, diskOuter: 12.0,
      diskBright: 1.0, diskTemp: 0.58, doppler: 0.8, spin: 0.8,
      diskThick: 0.5, tilt: 0, starDensity: 0.35, starBright: 1.0, nebula: 0.12,
      fov: 50, exposure: 0.95, bloom: 0.35, streak: 0.2, vignette: 0.45, grain: 0.02,
      steps: 96, renderScale: 0.5, adaptive: true
    },
    camera: { thetaDeg: -60, phiDeg: 77, dist: 27 }
  }
};

/* ---------- DOM 构建 ---------- */
var uiRefs = [];
var presetButtons = {};

function buildUI(params, hooks) {
  var presetBox = document.getElementById('presets');
  Object.keys(UI_PRESETS).forEach(function (key) {
    var p = UI_PRESETS[key];
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    var name = document.createElement('span');
    name.className = 'p-name';
    name.textContent = p.label;
    var sub = document.createElement('span');
    sub.className = 'p-sub';
    sub.textContent = p.sub;
    b.appendChild(name);
    b.appendChild(sub);
    b.addEventListener('click', function () { hooks.onPreset(key); });
    presetBox.appendChild(b);
    presetButtons[key] = b;
  });

  var root = document.getElementById('paramSections');
  UI_GROUPS.forEach(function (group) {
    var det = document.createElement('details');
    det.className = 'block';
    det.open = true;
    var sum = document.createElement('summary');
    var h2 = document.createElement('h2');
    h2.textContent = group.title + ' ';
    var em = document.createElement('em');
    em.textContent = group.sub;
    h2.appendChild(em);
    sum.appendChild(h2);
    det.appendChild(sum);

    group.items.forEach(function (item) {
      if (item.type === 'toggle') {
        det.appendChild(makeToggleRow(item, params, hooks));
      } else if (item.type === 'select') {
        det.appendChild(makeSelectRow(item, params, hooks));
      } else {
        det.appendChild(makeRangeRow(item, params, hooks));
      }
    });
    root.appendChild(det);
  });
}

function _labelWithHint(item) {
  var lab = document.createElement('label');
  lab.textContent = item.label;
  if (item.hint) {
    var s = document.createElement('span');
    s.className = 'hint';
    s.textContent = item.hint;
    lab.appendChild(s);
  }
  return lab;
}

function makeRangeRow(item, params, hooks) {
  var row = document.createElement('div');
  row.className = 'row';
  var head = document.createElement('div');
  head.className = 'row-head';
  head.appendChild(_labelWithHint(item));
  var out = document.createElement('output');
  var fmt = item.fmt || function (v) { return (+v).toFixed(2); };
  out.textContent = fmt(params[item.key]);
  head.appendChild(out);

  var inp = document.createElement('input');
  inp.type = 'range';
  inp.min = String(item.min);
  inp.max = String(item.max);
  inp.step = String(item.step);
  inp.value = String(params[item.key]);
  inp.addEventListener('input', function () {
    var v = parseFloat(inp.value);
    params[item.key] = v;
    out.textContent = fmt(v);
    hooks.onParam(item.key, v);
  });

  row.appendChild(head);
  row.appendChild(inp);
  uiRefs.push({ kind: 'range', key: item.key, input: inp, out: out, fmt: fmt });
  return row;
}

function makeSelectRow(item, params, hooks) {
  var row = document.createElement('div');
  row.className = 'row';
  var head = document.createElement('div');
  head.className = 'row-head';
  head.appendChild(_labelWithHint(item));
  row.appendChild(head);

  var sel = document.createElement('select');
  item.options.forEach(function (o) {
    var op = document.createElement('option');
    op.value = o.v;
    op.textContent = o.l;
    sel.appendChild(op);
  });
  sel.value = String(params[item.key]);
  sel.addEventListener('change', function () {
    params[item.key] = parseInt(sel.value, 10);
    hooks.onParam(item.key, params[item.key]);
  });

  row.appendChild(sel);
  uiRefs.push({ kind: 'select', key: item.key, input: sel });
  return row;
}

function makeToggleRow(item, params, hooks) {
  var row = document.createElement('div');
  row.className = 'switch-row';
  row.appendChild(_labelWithHint(item));

  var sw = document.createElement('label');
  sw.className = 'switch';
  var inp = document.createElement('input');
  inp.type = 'checkbox';
  inp.checked = !!params[item.key];
  var knob = document.createElement('span');
  knob.className = 'knob';
  sw.appendChild(inp);
  sw.appendChild(knob);
  inp.addEventListener('change', function () {
    params[item.key] = inp.checked;
    hooks.onParam(item.key, inp.checked);
  });

  row.appendChild(sw);
  uiRefs.push({ kind: 'toggle', key: item.key, input: inp });
  return row;
}

function refreshUI(params) {
  uiRefs.forEach(function (r) {
    var v = params[r.key];
    if (r.kind === 'toggle') {
      r.input.checked = !!v;
    } else if (r.kind === 'select') {
      r.input.value = String(v);
    } else {
      r.input.value = String(v);
      r.out.textContent = r.fmt(v);
    }
  });
}

function setActivePreset(name) {
  Object.keys(presetButtons).forEach(function (k) {
    presetButtons[k].classList.toggle('active', k === name);
  });
}
