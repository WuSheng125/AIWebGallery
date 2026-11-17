/* ============================================================
 * GARGANTUA — 交互界面
 * 参数系统（单一事实来源）· 预设补间 · HUD 遥测 · 环境音 · 快捷键
 * 所有控件拖动即刻生效
 * ============================================================ */
(function () {
  'use strict';

  var BH = window.BH;
  var engine = null;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function $(id) { return document.getElementById(id); }
  function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function rand(a, b) { return a + Math.random() * (b - a); }

  var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- 参数定义 ---------------- */
  var DEFS = {
    /* 时空几何 */
    mass:       { type: 'slider', label: '黑洞质量',   min: 0.4,  max: 3,     step: 0.01, value: 1,     uniform: 'uRs',         fmt: function (v) { return v.toFixed(2) + ' ×10⁸ M☉'; } },
    lens:       { type: 'slider', label: '引力透镜强度', min: 0,   max: 2,     step: 0.01, value: 1,     uniform: 'uLens',       fmt: function (v) { return v.toFixed(2) + '×'; } },
    /* 吸积盘 */
    diskIn:     { type: 'slider', label: '内缘半径',   min: 2.2,  max: 6,     step: 0.05, value: 3.1,   uniform: 'uDiskIn',     fmt: function (v) { return v.toFixed(2) + ' rₛ'; } },
    diskOut:    { type: 'slider', label: '外缘半径',   min: 6,    max: 26,    step: 0.1,  value: 12.5,  uniform: 'uDiskOut',    fmt: function (v) { return v.toFixed(1) + ' rₛ'; } },
    temp:       { type: 'slider', label: '盘面温度',   min: 1500, max: 15000, step: 50,   value: 5200,  uniform: 'uDiskTemp',   fmt: function (v) { return Math.round(v) + ' K'; } },
    brightness: { type: 'slider', label: '盘面亮度',   min: 0,    max: 3,     step: 0.01, value: 1.15,  uniform: 'uDiskBright', fmt: function (v) { return v.toFixed(2); } },
    speed:      { type: 'slider', label: '旋转速度',   min: 0,    max: 3,     step: 0.01, value: 0.7,   apply: function (v) { engine.diskSpeed = v; Sound.setSpeed(v); }, fmt: function (v) { return v.toFixed(2) + '×'; } },
    turb:       { type: 'slider', label: '湍流细节',   min: 0,    max: 1.5,   step: 0.01, value: 0.7,   uniform: 'uTurb',       fmt: function (v) { return v.toFixed(2); } },
    doppler:    { type: 'slider', label: '多普勒束流', min: 0,    max: 1.5,   step: 0.01, value: 0.3,   uniform: 'uDoppler',    fmt: function (v) { return v.toFixed(2); } },
    redshift:   { type: 'slider', label: '引力红移',   min: 0,    max: 1,     step: 0.01, value: 0.7,   uniform: 'uRedshift',   fmt: function (v) { return Math.round(v * 100) + '%'; } },
    density:    { type: 'slider', label: '盘面密度',   min: 0.05, max: 1,     step: 0.01, value: 0.85,  uniform: 'uDiskDensity', fmt: function (v) { return Math.round(v * 100) + '%'; } },
    /* 深空环境 */
    stars:      { type: 'slider', label: '恒星密度',   min: 0,    max: 1,     step: 0.01, value: 0.65,  uniform: 'uStarDensity', fmt: function (v) { return Math.round(v * 100) + '%'; } },
    starBright: { type: 'slider', label: '星光亮度',   min: 0,    max: 2,     step: 0.01, value: 1,     uniform: 'uStarBright', fmt: function (v) { return v.toFixed(2); } },
    nebula:     { type: 'slider', label: '星云强度',   min: 0,    max: 1.5,   step: 0.01, value: 0.5,   uniform: 'uNebula',     fmt: function (v) { return v.toFixed(2); } },
    /* 渲染管线 */
    bloom:      { type: 'slider', label: '泛光强度',   min: 0,    max: 2.5,   step: 0.01, value: 1.0,   apply: function (v) { engine.setBloom(v); }, fmt: function (v) { return v.toFixed(2); } },
    exposure:   { type: 'slider', label: '曝光',       min: 0.3,  max: 2.5,   step: 0.01, value: 1.1,   apply: function (v) { engine.setExposure(v); }, fmt: function (v) { return v.toFixed(2); } },
    quality:    { type: 'select', label: '画质档位',   value: 'medium',
      options: [['low', '性能 · 96 步积分'], ['medium', '均衡 · 144 步积分'], ['high', '高清 · 208 步积分'], ['ultra', '极致 · 288 步积分']],
      apply: function (v) { engine.setQuality(v); } },
    autoRes:    { type: 'switch', label: '自适应分辨率', value: true, apply: function (v) { engine.autoRes = v; if (v) { engine.adaptiveScale = 1; engine.resize(); } } },
    /* 相机与时间 */
    fov:        { type: 'slider', label: '视场角',     min: 30,   max: 90,    step: 1,    value: 55,    apply: function (v) { engine.setFov(v); }, fmt: function (v) { return Math.round(v) + '°'; } },
    rotSpeed:   { type: 'slider', label: '环绕速度',   min: 0,    max: 2,     step: 0.01, value: 0.35,  apply: function (v) { engine.autoRotateSpeed = v; }, fmt: function (v) { return v.toFixed(2); } },
    autoRotate: { type: 'switch', label: '自动环绕',   value: !reducedMotion, apply: function (v) { engine.autoRotate = v; } },
    resetView:  { type: 'button', label: '复位视角',   onClick: function () { engine.resetView(); toast('视角已复位'); } }
  };

  var GROUPS = [
    { id: 'spacetime', en: 'SPACETIME GEOMETRY', title: '时空几何', items: ['mass', 'lens'] },
    { id: 'disk', en: 'ACCRETION DISK', title: '吸积盘', items: ['diskIn', 'diskOut', 'temp', 'brightness', 'speed', 'turb', 'doppler', 'redshift', 'density'] },
    { id: 'env', en: 'DEEP SPACE', title: '深空环境', items: ['stars', 'starBright', 'nebula'] },
    { id: 'render', en: 'RENDER PIPELINE', title: '渲染管线', items: ['bloom', 'exposure', 'quality', 'autoRes'] },
    { id: 'camera', en: 'CAMERA & TIME', title: '相机与时间', items: ['fov', 'rotSpeed', 'autoRotate', 'resetView'] }
  ];

  /* ---------------- 预设 ---------------- */
  var DEFAULTS = {};
  Object.keys(DEFS).forEach(function (k) { if (DEFS[k].type === 'slider') DEFAULTS[k] = DEFS[k].value; });

  function preset(id, name, en, desc, values, cam) {
    return { id: id, name: name, en: en, desc: desc, values: Object.assign({}, DEFAULTS, values), cam: cam };
  }

  var PRESETS = [
    preset('gargantua', '卡冈图雅', 'GARGANTUA',
      '《星际穿越》中的 10⁸ M☉ 超大质量黑洞：温暖的薄吸积盘被引力透镜弯折成包裹黑洞的光环。电影为观感弱化了多普勒不对称，此处默认亦然。',
      {}, { incl: 9, dist: 18, az: -61 }),
    preset('m87', 'M87*', 'MESSIER 87',
      '人类首张黑洞照片的主角：强多普勒束流让朝向我们的一侧显著增亮，偏红的低温吸积流，还原 EHT 影像的真实不对称。',
      { mass: 1.6, diskIn: 3.0, diskOut: 9.5, temp: 3400, brightness: 1.3, speed: 0.45, turb: 0.9, doppler: 1.15, redshift: 0.8, density: 0.9, stars: 0.45, starBright: 0.8, nebula: 0.35, bloom: 1.25, exposure: 1.15, fov: 50 },
      { incl: 26, dist: 16, az: -30 }),
    preset('sgrA', '人马座 A*', 'SAGITTARIUS A*',
      '银河系中心的 4×10⁶ M☉ 黑洞：更小、更炽热、吸积节奏更快，背景是密集的银心星场与尘埃带。',
      { mass: 0.55, diskIn: 2.8, diskOut: 10, temp: 7200, brightness: 1.0, speed: 1.5, turb: 1.1, doppler: 0.7, redshift: 0.6, density: 0.7, stars: 0.9, starBright: 1.1, nebula: 0.75, bloom: 0.9, exposure: 1.05, fov: 60 },
      { incl: 14, dist: 14, az: -80 }),
    preset('blueShift', '蓝移风暴', 'BLUESHIFT STORM',
      '艺术化想象：12500 K 的蓝白吸积流高速旋转，相对论束流把接近侧烧成刺眼的蓝白，另一侧沉入暗红。',
      { temp: 12500, brightness: 1.25, speed: 1.8, doppler: 1.3, turb: 1.2, diskIn: 2.9, diskOut: 14, bloom: 1.35, stars: 0.6, nebula: 0.4 },
      { incl: 12, dist: 17, az: -45 }),
    preset('ember', '赤色残烬', 'LAST EMBER',
      '艺术化想象：冷却到 2300 K 的暗红残盘缓慢旋转，稀薄物质在引力透镜中拉出幽暗的弧，星云格外清晰。',
      { temp: 2300, brightness: 0.85, speed: 0.25, doppler: 0.15, turb: 0.5, diskOut: 16, bloom: 0.7, nebula: 1.0, stars: 0.8, exposure: 1.25 },
      { incl: 6, dist: 20, az: -100 }),
    preset('pureLens', '纯净透镜', 'PURE LENSING',
      '关闭吸积盘，只剩时空弯曲本身：背景星场被拉成爱因斯坦环与多重弧，直观展示引力透镜如何扭曲整个宇宙。',
      { brightness: 0, stars: 1, starBright: 1.35, nebula: 1.15, bloom: 0.6, lens: 1.15 },
      { incl: 3, dist: 13, az: -61 })
  ];

  /* ---------------- 状态 ---------------- */
  var state = {};
  var controls = {};
  var activePreset = 'gargantua';
  var tween = null;

  function setParam(key, v, opts) {
    opts = opts || {};
    var d = DEFS[key];
    if (!d) return;
    if (d.type === 'slider') {
      v = clamp(parseFloat(v), d.min, d.max);
      if (isNaN(v)) return;
    }
    state[key] = v;
    if (d.uniform) engine.uniforms[d.uniform].value = v;
    if (d.apply) d.apply(v);

    /* 内外缘联动约束 */
    if (key === 'diskIn' && state.diskOut < v + 1.2) {
      setParam('diskOut', Math.min(DEFS.diskOut.max, v + 1.2), { fromLink: true });
    }
    if (key === 'diskOut' && state.diskIn > v - 1.2) {
      setParam('diskIn', Math.max(DEFS.diskIn.min, v - 1.2), { fromLink: true });
    }

    if (!opts.fromLink && !opts.fromTween && !opts.silent) markCustom();
    syncControl(key);
    /* 参数改变立即刷新遥测，保证控件与读数零延迟同步 */
    if (engine && engine.view) updateHUD();
  }

  function syncControl(key) {
    var c = controls[key];
    var d = DEFS[key];
    if (!c) return;
    var v = state[key];
    if (d.type === 'slider') {
      c.input.value = v;
      var pct = ((v - d.min) / (d.max - d.min)) * 100;
      c.input.style.setProperty('--fill', pct + '%');
      c.output.textContent = d.fmt ? d.fmt(v) : String(v);
    } else if (d.type === 'switch') {
      c.btn.setAttribute('aria-checked', v ? 'true' : 'false');
    } else if (d.type === 'select') {
      c.select.value = v;
    }
  }

  function markCustom() {
    if (activePreset === null) return;
    activePreset = null;
    updateChips();
    $('presetDesc').textContent = '自定义参数 · 拖动滑块，塑造属于你自己的黑洞。';
  }

  function updateChips() {
    PRESETS.forEach(function (p) {
      var el = controls['preset_' + p.id];
      if (el) el.classList.toggle('active', activePreset === p.id);
    });
  }

  /* ---------------- 预设补间 ---------------- */
  function applyPreset(p, animate) {
    if (typeof p === 'string') p = PRESETS.filter(function (x) { return x.id === p; })[0];
    if (!p) return;
    activePreset = p.id;
    updateChips();
    $('presetDesc').textContent = p.desc;

    var keys = Object.keys(p.values);
    if (animate === false || reducedMotion) {
      tween = null;
      keys.forEach(function (k) { setParam(k, p.values[k], { silent: true }); });
    } else {
      var from = {};
      keys.forEach(function (k) { from[k] = state[k]; });
      tween = { from: from, to: p.values, keys: keys, t0: performance.now(), dur: 950 };
    }
    if (p.cam) engine.setCameraView(p.cam, animate !== false);
  }

  function tweenStep() {
    if (!tween) return;
    var t = clamp((performance.now() - tween.t0) / tween.dur, 0, 1);
    var e = easeInOutCubic(t);
    tween.keys.forEach(function (k) {
      setParam(k, tween.from[k] + (tween.to[k] - tween.from[k]) * e, { fromTween: true, silent: true });
    });
    if (t >= 1) tween = null;
  }

  function randomize(animate) {
    var values = {
      mass: rand(0.6, 1.9),
      lens: rand(0.85, 1.25),
      diskIn: rand(2.6, 4.4),
      diskOut: rand(9, 20),
      temp: rand(2200, 12000),
      brightness: rand(0.7, 1.6),
      speed: rand(0.2, 2.0),
      turb: rand(0.3, 1.3),
      doppler: rand(0, 1.4),
      redshift: rand(0.4, 0.9),
      density: rand(0.55, 0.95),
      stars: rand(0.3, 1),
      starBright: rand(0.7, 1.3),
      nebula: rand(0, 1.2),
      bloom: rand(0.6, 1.6),
      exposure: rand(0.9, 1.3),
      fov: rand(45, 70)
    };
    values.diskOut = Math.max(values.diskOut, values.diskIn + 2);
    activePreset = null;
    updateChips();
    $('presetDesc').textContent = '随机生成 · 每一次都是新的时空。';
    var keys = Object.keys(values);
    if (animate === false || reducedMotion) {
      tween = null;
      keys.forEach(function (k) { setParam(k, values[k], { silent: true }); });
    } else {
      var from = {};
      keys.forEach(function (k) { from[k] = state[k]; });
      tween = { from: from, to: values, keys: keys, t0: performance.now(), dur: 950 };
    }
    engine.setCameraView({ incl: rand(3, 30), dist: rand(13, 24), az: rand(-180, 180) }, animate !== false);
  }

  function reset(animate) {
    applyPreset('gargantua', animate);
    engine.resetView();
  }

  /* ---------------- 控件生成 ---------------- */
  var SVG_RESET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4v6h6"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>';

  function buildSlider(key, d, parent) {
    var wrap = document.createElement('div');
    wrap.className = 'ctl';
    var head = document.createElement('div');
    head.className = 'ctl-head';
    var label = document.createElement('label');
    label.textContent = d.label;
    label.htmlFor = 'sl-' + key;
    var out = document.createElement('output');
    out.id = 'out-' + key;
    head.appendChild(label);
    head.appendChild(out);
    var input = document.createElement('input');
    input.type = 'range';
    input.id = 'sl-' + key;
    input.min = d.min; input.max = d.max; input.step = d.step;
    input.value = d.value;
    input.setAttribute('aria-label', d.label);
    input.addEventListener('input', function () { setParam(key, input.value); });
    wrap.appendChild(head);
    wrap.appendChild(input);
    parent.appendChild(wrap);
    controls[key] = { input: input, output: out };
  }

  function buildSwitch(key, d, parent) {
    var row = document.createElement('div');
    row.className = 'switch-row';
    var lab = document.createElement('span');
    lab.className = 'sw-label';
    lab.id = 'swl-' + key;
    lab.textContent = d.label;
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'switch';
    btn.id = 'sw-' + key;
    btn.setAttribute('role', 'switch');
    btn.setAttribute('aria-checked', d.value ? 'true' : 'false');
    btn.setAttribute('aria-labelledby', 'swl-' + key);
    var knob = document.createElement('span');
    knob.className = 'knob';
    btn.appendChild(knob);
    btn.addEventListener('click', function () { setParam(key, !state[key]); });
    row.appendChild(lab);
    row.appendChild(btn);
    parent.appendChild(row);
    controls[key] = { btn: btn };
  }

  function buildSelect(key, d, parent) {
    var row = document.createElement('div');
    row.className = 'select-row';
    var lab = document.createElement('label');
    lab.textContent = d.label;
    lab.htmlFor = 'sel-' + key;
    var wrapEl = document.createElement('div');
    wrapEl.className = 'select-wrap';
    var sel = document.createElement('select');
    sel.id = 'sel-' + key;
    d.options.forEach(function (o) {
      var opt = document.createElement('option');
      opt.value = o[0];
      opt.textContent = o[1];
      sel.appendChild(opt);
    });
    sel.value = d.value;
    sel.addEventListener('change', function () { setParam(key, sel.value); });
    wrapEl.appendChild(sel);
    row.appendChild(lab);
    row.appendChild(wrapEl);
    parent.appendChild(row);
    controls[key] = { select: sel };
  }

  function buildButton(key, d, parent) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ctl-btn';
    btn.id = 'btn-' + key;
    btn.innerHTML = SVG_RESET + '<span>' + d.label + '</span>';
    btn.addEventListener('click', function () { if (d.onClick) d.onClick(); });
    parent.appendChild(btn);
    controls[key] = { btn: btn };
  }

  function buildControls() {
    var root = $('controls');
    GROUPS.forEach(function (g) {
      var sec = document.createElement('section');
      sec.className = 'group';
      sec.id = 'group-' + g.id;
      var head = document.createElement('header');
      head.className = 'group-head';
      head.innerHTML = '<span class="en">' + g.en + '</span><h3>' + g.title + '</h3>';
      sec.appendChild(head);
      g.items.forEach(function (key) {
        var d = DEFS[key];
        if (d.type === 'slider') buildSlider(key, d, sec);
        else if (d.type === 'switch') buildSwitch(key, d, sec);
        else if (d.type === 'select') buildSelect(key, d, sec);
        else if (d.type === 'button') buildButton(key, d, sec);
      });
      root.appendChild(sec);
    });

    /* 预设按钮 */
    var grid = $('presetGrid');
    PRESETS.forEach(function (p) {
      var chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip';
      chip.title = p.desc;
      chip.innerHTML = '<span class="name">' + p.name + '</span><span class="en">' + p.en + '</span>';
      chip.addEventListener('click', function () {
        applyPreset(p, true);
        toast('已切换预设：' + p.name);
      });
      grid.appendChild(chip);
      controls['preset_' + p.id] = chip;
    });
  }

  /* ---------------- Toast ---------------- */
  var toastTimer = null;
  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.classList.remove('show'); }, 2600);
  }

  /* ---------------- 截图 ---------------- */
  function capture() {
    engine.requestShot(function (err, url) {
      if (err || !url) {
        toast('截图失败：' + ((err && err.message) || '未知错误'));
        return;
      }
      var d = new Date();
      function pad(n) { return String(n).padStart(2, '0'); }
      var name = 'gargantua-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
        '-' + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds()) + '.png';
      var a = document.createElement('a');
      a.download = name;
      a.href = url;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast('已导出 PNG 截图 · ' + name);
    });
  }

  /* ---------------- 环境音：深空低鸣 ----------------
   * 与可见的吸积盘运动绑定：旋转速度驱动滤波频率与呼吸节奏。
   * 默认开启，首次用户手势后启动（浏览器自动播放策略），顶栏一键静音。 */
  var Sound = {
    enabled: true,
    ctx: null,
    master: null,
    filter: null,
    lfo: null,
    _suspendedByMute: false,

    ensure: function () {
      if (this.ctx || !this.enabled) return;
      try {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) { this.disable(); return; }
        var ctx = this.ctx = new AC();
        var master = this.master = ctx.createGain();
        master.gain.value = 0;
        master.connect(ctx.destination);

        /* 低鸣音簇：55 Hz 基频 + 五度 + 八度泛音 */
        var o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 55;
        var g1 = ctx.createGain(); g1.gain.value = 0.5;
        o1.connect(g1); g1.connect(master);
        var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 82.41; o2.detune.value = 5;
        var g2 = ctx.createGain(); g2.gain.value = 0.2;
        o2.connect(g2); g2.connect(master);
        var o3 = ctx.createOscillator(); o3.type = 'triangle'; o3.frequency.value = 110;
        var g3 = ctx.createGain(); g3.gain.value = 0.045;
        o3.connect(g3); g3.connect(master);

        /* 布朗噪声 → 低通：吸积流的沙沙声 */
        var len = Math.floor(ctx.sampleRate * 2);
        var buf = ctx.createBuffer(1, len, ctx.sampleRate);
        var data = buf.getChannelData(0);
        var last = 0;
        for (var i = 0; i < len; i++) {
          var w = Math.random() * 2 - 1;
          last = (last + 0.02 * w) / 1.02;
          data[i] = last * 3.5;
        }
        var noise = ctx.createBufferSource();
        noise.buffer = buf;
        noise.loop = true;
        var filter = this.filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 220;
        filter.Q.value = 0.8;
        var gn = ctx.createGain(); gn.gain.value = 0.16;
        noise.connect(filter); filter.connect(gn); gn.connect(master);

        /* 缓慢呼吸 LFO */
        var lfo = this.lfo = ctx.createOscillator();
        lfo.frequency.value = 0.07;
        var lg = ctx.createGain(); lg.gain.value = 70;
        lfo.connect(lg); lg.connect(filter.frequency);

        o1.start(); o2.start(); o3.start(); noise.start(); lfo.start();
        master.gain.setTargetAtTime(0.05, ctx.currentTime, 1.4);
      } catch (e) {
        this.disable();
      }
    },

    resume: function () {
      if (!this.enabled) return;
      this.ensure();
      if (this.ctx && this.ctx.state === 'suspended' && !this._suspendedByMute) {
        this.ctx.resume().catch(function () {});
      }
    },

    setSpeed: function (v) {
      if (!this.ctx || !this.filter) return;
      var t = this.ctx.currentTime;
      this.filter.frequency.setTargetAtTime(150 + v * 120, t, 0.5);
      if (this.lfo) this.lfo.frequency.setTargetAtTime(0.05 + v * 0.04, t, 0.5);
    },

    duck: function (paused) {
      if (!this.ctx || !this.enabled) return;
      this.master.gain.setTargetAtTime(paused ? 0.018 : 0.05, this.ctx.currentTime, 0.6);
    },

    toggle: function () {
      this.enabled = !this.enabled;
      var btn = $('btnSound');
      if (this.enabled) {
        this._suspendedByMute = false;
        this.ensure();
        if (this.ctx) {
          this.ctx.resume().catch(function () {});
          this.master.gain.setTargetAtTime(0.05, this.ctx.currentTime, 0.8);
        }
      } else if (this.ctx) {
        this._suspendedByMute = true;
        this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
        var ctx = this.ctx;
        setTimeout(function () { if (ctx.state === 'running') ctx.suspend().catch(function () {}); }, 700);
      }
      if (btn) {
        btn.classList.toggle('on', this.enabled);
        btn.setAttribute('aria-pressed', this.enabled ? 'true' : 'false');
        btn.title = this.enabled ? '环境音：开（点击静音）' : '环境音：关（点击开启）';
        btn.querySelector('.i-on').hidden = !this.enabled;
        btn.querySelector('.i-off').hidden = this.enabled;
      }
      toast(this.enabled ? '环境音已开启' : '环境音已静音');
    },

    disable: function () {
      this.enabled = false;
      var btn = $('btnSound');
      if (btn) btn.style.display = 'none';
    }
  };

  /* ---------------- HUD ---------------- */
  function updateHUD() {
    var rs = state.mass;
    $('hudMass').textContent = rs.toFixed(2) + ' ×10⁸ M☉';
    var au = 1.974 * rs;
    $('hudRs').textContent = au.toFixed(2) + ' AU';
    $('hudRs').title = (2.953e8 * rs).toExponential(3) + ' km';
    $('hudDist').textContent = (engine.view.radius / rs).toFixed(1) + ' rₛ';
    var incl = 90 - engine.view.phi * 180 / Math.PI;
    $('hudIncl').textContent = incl.toFixed(1) + '°';
    var adapt = engine.adaptiveScale < 0.999 ? ' · ' + Math.round(engine.adaptiveScale * 100) + '%' : '';
    $('hudFps').textContent = Math.round(engine.fps) + ' fps · ' + engine.width + '×' + engine.height + adapt;
  }

  /* ---------------- 弹窗 / 界面显隐 ---------------- */
  function openAbout() {
    var m = $('aboutModal');
    m.hidden = false;
    var closeBtn = m.querySelector('.modal-close');
    if (closeBtn) closeBtn.focus();
  }
  function closeAbout() { $('aboutModal').hidden = true; }

  function setHiddenUI(hidden) {
    document.body.classList.toggle('ui-hidden', hidden);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    } else {
      (document.exitFullscreen || function () {}).call(document);
    }
  }

  function toggleSidebar(force) {
    var sb = $('sidebar');
    var open = typeof force === 'boolean' ? force : !sb.classList.contains('open');
    sb.classList.toggle('open', open);
    $('sidebarToggle').setAttribute('aria-expanded', open ? 'true' : 'false');
  }

  /* ---------------- 初始化 ---------------- */
  function init(eng) {
    engine = eng;

    buildControls();

    /* 初始状态写入（silent，避免标记自定义） */
    Object.keys(DEFS).forEach(function (k) {
      var d = DEFS[k];
      if (d.type === 'button') return;
      setParam(k, d.value, { silent: true });
    });

    applyPreset('gargantua', false);
    engine.setCameraView({ incl: 9, dist: 18, az: -61 }, false);

    if (reducedMotion) engine.setGrain(0.012);

    /* 顶栏 */
    $('btnSound').addEventListener('click', function () { Sound.toggle(); });
    $('btnPause').addEventListener('click', togglePause);
    $('btnShot').addEventListener('click', capture);
    $('btnFull').addEventListener('click', toggleFullscreen);
    $('btnHide').addEventListener('click', function () { setHiddenUI(true); });
    $('restoreUI').addEventListener('click', function () { setHiddenUI(false); });

    /* 侧栏操作 */
    $('btnReset').addEventListener('click', function () { reset(true); toast('已重置为卡冈图雅'); });
    $('btnRandom').addEventListener('click', function () { randomize(true); toast('已生成随机黑洞'); });
    $('btnExport').addEventListener('click', capture);

    /* 移动端侧栏 */
    $('sidebarToggle').addEventListener('click', function () { toggleSidebar(); });
    $('sidebarClose').addEventListener('click', function () { toggleSidebar(false); });

    /* 弹窗 */
    $('btnAbout').addEventListener('click', openAbout);
    $('aboutModal').addEventListener('click', function (e) {
      if (e.target && e.target.hasAttribute && e.target.hasAttribute('data-close')) closeAbout();
    });

    /* 首次手势启动音频（自动播放策略） */
    function firstGesture() {
      Sound.resume();
      window.removeEventListener('pointerdown', firstGesture);
      window.removeEventListener('keydown', firstGesture);
    }
    window.addEventListener('pointerdown', firstGesture);
    window.addEventListener('keydown', firstGesture);

    /* 快捷键 */
    window.addEventListener('keydown', function (e) {
      var tag = (e.target && e.target.tagName) || '';
      var inField = tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA';
      if (e.key === 'Escape') {
        if (!$('aboutModal').hidden) closeAbout();
        else if (window.innerWidth <= 900) toggleSidebar(false);
        return;
      }
      if (inField) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          togglePause();
          break;
        case 'KeyH':
          setHiddenUI(!document.body.classList.contains('ui-hidden'));
          break;
        case 'KeyR':
          engine.resetView();
          toast('视角已复位');
          break;
        case 'KeyS':
          capture();
          break;
        case 'KeyF':
          toggleFullscreen();
          break;
      }
    });

    /* 帧回调：补间 + HUD（真实时间 4Hz，低帧率下不滞后） */
    var hudLast = performance.now();
    engine.onFrame = function (dt) {
      tweenStep();
      var now = performance.now();
      if (now - hudLast >= 250) {
        hudLast = now;
        updateHUD();
      }
    };
    updateHUD();

    return {
      DEFS: DEFS,
      PRESETS: PRESETS,
      state: state,
      setParam: setParam,
      applyPreset: applyPreset,
      randomize: randomize,
      reset: reset,
      toast: toast,
      capture: capture,
      Sound: Sound,
      updateHUD: updateHUD,
      togglePause: togglePause,
      toggleSidebar: toggleSidebar,
      openAbout: openAbout,
      closeAbout: closeAbout
    };
  }

  function togglePause() {
    engine.setPaused(!engine.paused);
    var btn = $('btnPause');
    btn.setAttribute('aria-pressed', engine.paused ? 'true' : 'false');
    btn.classList.toggle('on', engine.paused);
    btn.title = engine.paused ? '继续吸积盘（空格）' : '暂停吸积盘（空格）';
    btn.querySelector('.i-pause').hidden = engine.paused;
    btn.querySelector('.i-play').hidden = !engine.paused;
    Sound.duck(engine.paused);
    toast(engine.paused ? '吸积盘已暂停 · 相机仍可自由观察' : '吸积盘已继续演化');
  }

  window.BH = window.BH || {};
  window.BH.UI = { init: init };
})();