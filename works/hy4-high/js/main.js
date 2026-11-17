/* =========================================================================
   GARGANTUA — application state, UI, camera, render loop
   ========================================================================= */
(function () {
  'use strict';

  /* ------------------------------------------------------------------ defaults */
  const CONTROL_DEFAULTS = {
    // 02 · relativity
    rs: 1.00, lens: 1.00, spin: 0.62, photonRing: 1.10,
    // 03 · accretion disk
    diskInner: 3.00, diskOuter: 12.0, diskBright: 1.30, diskTemp: 0.22,
    turbulence: 0.52, doppler: 0.45, rotation: 1.00, diskSoft: 0.45,
    // 04 · observation
    elevation: 11.0, azimuth: 0.0, distance: 18.0, fov: 48.0,
    // 05 · starfield
    starDensity: 1.00, starBright: 1.20, nebula: 0.30,
    // 06 · post processing
    exposure: 1.00, bloom: 0.85, chroma: 0.0015
  };
  const APP_DEFAULTS = {
    quality: 'high', adaptive: true, autoRotate: false,
    autoSpeed: 1.00, timeScale: 1.00, shiftX: 0
  };
  const state = Object.assign({}, CONTROL_DEFAULTS, APP_DEFAULTS);

  const QUALITY = {
    low:    { scale: 0.55, steps: 150, dpr: 1.00 },
    medium: { scale: 0.75, steps: 200, dpr: 1.00 },
    high:   { scale: 1.00, steps: 260, dpr: 1.25 },
    ultra:  { scale: 1.00, steps: 360, dpr: 1.50 }
  };

  /* ------------------------------------------------------------------- presets */
  const PRESETS = [
    { id: 'cinematic', icon: '🎬', label: '星际穿越 · 电影', values: {} },
    { id: 'eht', icon: '🔭', label: 'EHT 真实观测',
      values: { rs: 1.0, lens: 1.0, photonRing: 1.3, diskInner: 2.8, diskOuter: 6.6,
                diskBright: 1.25, diskTemp: 0.12, turbulence: 0.92, doppler: 0.92,
                diskSoft: 0.7, spin: 0.85, rotation: 1.4, elevation: 18, distance: 13.5,
                fov: 42, starDensity: 0.55, nebula: 0.18, bloom: 0.95, exposure: 1.0 } },
    { id: 'nolens', icon: '◌', label: '关闭引力透镜',
      values: { lens: 0.0, photonRing: 0.0, doppler: 0.35, elevation: 22,
                distance: 20, diskBright: 1.25, bloom: 0.8 } },
    { id: 'blue', icon: '✦', label: '炽热蓝巨星盘',
      values: { diskTemp: 0.94, diskBright: 1.70, spin: 0.95, rotation: 1.9,
                turbulence: 0.85, doppler: 0.55, diskOuter: 14.0, elevation: 9,
                exposure: 0.95, bloom: 1.05 } },
    { id: 'heavy', icon: '⬤', label: '超大质量黑洞',
      values: { rs: 1.9, diskInner: 5.4, diskOuter: 19.0, distance: 30.0,
                diskBright: 1.25, lens: 1.0, photonRing: 1.15, elevation: 14,
                fov: 46, rotation: 0.55, bloom: 1.0 } },
    { id: 'polar', icon: '◎', label: '极轴俯视',
      values: { elevation: 72, distance: 23, lens: 1.0, rotation: 1.5,
                turbulence: 0.9, photonRing: 1.1, fov: 46, diskOuter: 13.0 } }
  ];

  /* ------------------------------------------------------- control definitions */
  const S = (key, label, en, min, max, step, dec, unit) =>
    ({ type: 'slider', key, label, en, min, max, step, dec, unit: unit || '' });

  const SECTIONS = [
    { n: '02', title: '引力场与透镜', en: 'RELATIVITY', items: [
      S('rs',          '事件视界半径', 'r_s',        0.40, 2.40, 0.01, 2, ''),
      S('lens',        '引力透镜强度', 'LENS POWER',  0.00, 2.00, 0.01, 2, ''),
      S('spin',        '自旋',         'SPIN',        0.00, 1.00, 0.01, 2, ''),
      S('photonRing',  '光子环辉光',   'PHOTON RING', 0.00, 2.50, 0.01, 2, '')
    ]},
    { n: '03', title: '吸积盘结构与动态', en: 'ACCRETION DISK', items: [
      S('diskInner',   '吸积盘内径',   'r_in',        2.50,  7.00, 0.05, 2, ''),
      S('diskOuter',   '吸积盘外径',   'r_out',       8.00, 22.00, 0.10, 1, ''),
      S('diskBright',  '辐射强度',     'LUMINOSITY',  0.10,  4.00, 0.01, 2, ''),
      S('diskTemp',    '盘面色温',     'TEMPERATURE', 0.00,  1.00, 0.01, 2, ''),
      S('turbulence',  '等离子体湍流', 'TURBULENCE',  0.00,  1.00, 0.01, 2, ''),
      S('doppler',     '多普勒集束',   'BEAMING',     0.00,  1.00, 0.01, 2, ''),
      S('rotation',    '开普勒转速',   'ORBIT SPEED', 0.00,  3.00, 0.01, 2, ''),
      S('diskSoft',    '边缘柔化',     'EDGE SOFT',   0.00,  1.00, 0.01, 2, '')
    ]},
    { n: '04', title: '观测视角', en: 'OBSERVATION', items: [
      S('elevation',   '观测倾角',     'INCLINATION',  2.00, 85.00, 0.10, 1, '°'),
      S('azimuth',     '方位角',       'AZIMUTH',      0.00, 360.0, 0.10, 1, '°'),
      S('distance',    '观测距离',     'DISTANCE',     7.00, 55.00, 0.10, 1, ''),
      S('fov',         '视场角',       'FIELD OF VIEW',30.00, 70.00, 0.10, 1, '°'),
      { type: 'switch', key: 'autoRotate', label: '自动环绕', en: 'AUTO ORBIT' },
      S('autoSpeed',   '环绕速度',     'ORBIT RATE',   0.10,  3.00, 0.01, 2, ''),
      S('timeScale',   '时间流速',     'TIME SCALE',   0.00,  3.00, 0.01, 2, '')
    ]},
    { n: '05', title: '星空背景', en: 'STARFIELD', items: [
      S('starDensity', '恒星密度',     'STAR DENSITY', 0.00,  2.50, 0.01, 2, ''),
      S('starBright',  '恒星亮度',     'STAR BRIGHT',  0.00,  2.50, 0.01, 2, ''),
      S('nebula',      '星云与银河',   'NEBULA',       0.00,  1.50, 0.01, 2, '')
    ]},
    { n: '06', title: '渲染与后期', en: 'RENDER', items: [
      S('exposure',    '曝光',         'EXPOSURE',     0.30,  2.50, 0.01, 2, ''),
      S('bloom',       '辉光强度',     'BLOOM',        0.00,  2.50, 0.01, 2, ''),
      S('chroma',      '色散',         'CHROMATIC AB.',0.0000,0.0060,0.0001,4,''),
      { type: 'select', key: 'quality', label: '渲染质量', en: 'QUALITY',
        options: [['low','低 · 最流畅'],['medium','中 · 均衡'],['high','高 · 推荐'],['ultra','极高 · 精细']] },
      { type: 'switch', key: 'adaptive', label: '自适应分辨率', en: 'ADAPTIVE RESOLUTION' },
      { type: 'note', text: '自适应会在帧率偏低时自动降低内部渲染分辨率以保证流畅；HDR 半浮点缓冲不可用时自动回退到 LDR。' }
    ]}
  ];

  /* ---------------------------------------------------------------------- DOM */
  const $ = sel => document.querySelector(sel);
  const canvas = $('#view');
  const panel = $('#panel');
  const controlsEl = $('#controls');
  const presetsEl = $('#presets');
  const inputMap = {};   // key -> { input, output, spec }
  let activePreset = 'cinematic';

  function fmt(spec, v) {
    return Number(v).toFixed(spec.dec) + spec.unit;
  }
  function setProgress(spec, input) {
    const p = (parseFloat(input.value) - spec.min) / (spec.max - spec.min) * 100;
    input.style.setProperty('--p', Math.max(0, Math.min(100, p)) + '%');
  }

  function buildPresets() {
    PRESETS.forEach(pr => {
      const b = document.createElement('button');
      b.className = 'preset';
      b.dataset.preset = pr.id;
      b.innerHTML = '<i>' + pr.icon + '</i><span>' + pr.label + '</span>';
      b.addEventListener('click', () => applyPreset(pr.id));
      presetsEl.appendChild(b);
    });
  }

  function buildControls() {
    SECTIONS.forEach(sec => {
      const wrap = document.createElement('section');
      wrap.innerHTML = '<div class="section-label"><span>' + sec.n + '</span> ' +
                       sec.title + ' <em>' + sec.en + '</em></div>';
      const body = document.createElement('div');
      wrap.appendChild(body);
      controlsEl.appendChild(wrap);

      sec.items.forEach(spec => {
        if (spec.type === 'note') {
          const p = document.createElement('p');
          p.className = 'quality-note';
          p.textContent = spec.text;
          body.appendChild(p);
          return;
        }
        if (spec.type === 'switch') {
          const row = document.createElement('label');
          row.className = 'switch-row';
          row.innerHTML = '<span>' + spec.label + ' <em style="font-style:normal;font-family:var(--mono);font-size:9px;color:#69727e;margin-left:5px">' + spec.en + '</em></span>' +
                          '<span class="switch"><input type="checkbox" data-key="' + spec.key + '"><span></span></span>';
          body.appendChild(row);
          const inp = row.querySelector('input');
          inp.checked = !!state[spec.key];
          inp.addEventListener('change', () => { state[spec.key] = inp.checked; });
          inputMap[spec.key] = { input: inp, spec, kind: 'switch' };
          return;
        }
        if (spec.type === 'select') {
          const ctrl = document.createElement('div');
          ctrl.className = 'ctrl';
          ctrl.innerHTML = '<div class="ctrl-head"><label>' + spec.label +
            ' <em>' + spec.en + '</em></label></div>';
          const sel = document.createElement('select');
          spec.options.forEach(o => {
            const op = document.createElement('option');
            op.value = o[0]; op.textContent = o[1]; sel.appendChild(op);
          });
          sel.value = state[spec.key];
          sel.addEventListener('change', () => {
            state[spec.key] = sel.value;
            applyQuality();
          });
          ctrl.appendChild(sel);
          body.appendChild(ctrl);
          inputMap[spec.key] = { input: sel, spec, kind: 'select' };
          return;
        }
        // slider
        const ctrl = document.createElement('div');
        ctrl.className = 'ctrl';
        ctrl.innerHTML = '<div class="ctrl-head"><label>' + spec.label +
          ' <em>' + spec.en + '</em></label><output></output></div>';
        const inp = document.createElement('input');
        inp.type = 'range';
        inp.min = spec.min; inp.max = spec.max; inp.step = spec.step;
        inp.value = state[spec.key];
        inp.dataset.key = spec.key;
        const out = ctrl.querySelector('output');
        out.textContent = fmt(spec, state[spec.key]);
        ctrl.appendChild(inp);
        body.appendChild(ctrl);
        setProgress(spec, inp);
        inp.addEventListener('input', () => {
          state[spec.key] = parseFloat(inp.value);
          out.textContent = fmt(spec, state[spec.key]);
          setProgress(spec, inp);
          clearPreset();
        });
        inputMap[spec.key] = { input: inp, output: out, spec, kind: 'slider' };
      });
    });
  }

  function syncControl(key) {
    const e = inputMap[key];
    if (!e) return;
    if (e.kind === 'switch') { e.input.checked = !!state[key]; return; }
    if (e.kind === 'select') { e.input.value = state[key]; return; }
    e.input.value = state[key];
    e.output.textContent = fmt(e.spec, state[key]);
    setProgress(e.spec, e.input);
  }
  function syncAll() { Object.keys(inputMap).forEach(syncControl); }
  function clearPreset() {
    activePreset = null;
    presetsEl.querySelectorAll('.preset').forEach(b => b.classList.remove('active'));
  }
  function markPreset(id) {
    activePreset = id;
    presetsEl.querySelectorAll('.preset').forEach(b =>
      b.classList.toggle('active', b.dataset.preset === id));
  }
  function applyPreset(id) {
    const pr = PRESETS.find(p => p.id === id);
    if (!pr) return;
    Object.assign(state, CONTROL_DEFAULTS, pr.values);
    syncAll();
    markPreset(id);
  }

  /* ----------------------------------------------------------- quality / resize */
  let renderer, adaptiveScale = 1.0;
  function applyQuality() {
    const q = QUALITY[state.quality] || QUALITY.high;
    state.steps = q.steps;
    resize();
  }
  function resize() {
    if (!renderer) return;
    const q = QUALITY[state.quality] || QUALITY.high;
    const dpr = Math.min(window.devicePixelRatio || 1, q.dpr);
    const s = q.scale * adaptiveScale;
    const w = Math.max(2, Math.round(window.innerWidth * dpr * s));
    const h = Math.max(2, Math.round(window.innerHeight * dpr * s));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      renderer.resize(w, h);
    }
    updateHUD();
  }

  /* --------------------------------------------------------------- view / math */
  function norm(v) {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  }
  function cross(a, b) {
    return [a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0]];
  }
  function computeView() {
    const e = state.elevation * Math.PI / 180;
    const a = state.azimuth * Math.PI / 180;
    const d = state.distance;
    const pos = [d * Math.cos(e) * Math.sin(a), d * Math.sin(e), d * Math.cos(e) * Math.cos(a)];
    const f = norm([-pos[0], -pos[1], -pos[2]]);
    const r = norm(cross(f, [0, 1, 0]));
    const u = cross(r, f);
    return {
      pos,
      basis: new Float32Array([r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2]]),
      dist: d
    };
  }
  function resetView() {
    ['elevation', 'azimuth', 'distance', 'fov'].forEach(k => {
      state[k] = CONTROL_DEFAULTS[k]; syncControl(k);
    });
  }

  /* --------------------------------------------------------------------- HUD */
  let fpsAvg = 60, hudTimer = 0;
  function updateHUD() {
    $('#t-fps').textContent = isFinite(fpsAvg) ? fpsAvg.toFixed(0) : '--';
    const q = QUALITY[state.quality] || QUALITY.high;
    $('#t-res').textContent = Math.round(q.scale * adaptiveScale * 100) + '%';
    $('#t-inc').textContent = state.elevation.toFixed(1) + '°';
    $('#t-dist').textContent = state.distance.toFixed(1) + ' r_s';
  }

  /* ------------------------------------------------------------------ input */
  function bindInput() {
    let dragging = false, lastX = 0, lastY = 0;
    canvas.addEventListener('pointerdown', e => {
      dragging = true; lastX = e.clientX; lastY = e.clientY;
      canvas.classList.add('dragging');
      canvas.setPointerCapture(e.pointerId);
      state.autoRotate = false; syncControl('autoRotate');
    });
    canvas.addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      state.azimuth = ((state.azimuth - dx * 0.26) % 360 + 360) % 360;
      state.elevation = Math.max(2, Math.min(85, state.elevation + dy * 0.20));
      syncControl('azimuth'); syncControl('elevation');
    });
    const end = () => { dragging = false; canvas.classList.remove('dragging'); };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('wheel', e => {
      e.preventDefault();
      state.distance = Math.max(7, Math.min(55, state.distance * Math.exp(e.deltaY * 0.0011)));
      syncControl('distance');
    }, { passive: false });
    canvas.addEventListener('dblclick', resetView);

    document.addEventListener('keydown', e => {
      const k = e.key.toLowerCase();
      if (k === 'h') togglePanel();
      else if (k === 'r') resetView();
    });
    window.addEventListener('resize', resize);

    $('#btnReset').addEventListener('click', () => { applyPreset('cinematic'); adaptiveScale = 1; resize(); });
    $('#btnShot').addEventListener('click', saveShot);
    $('#btnFull').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    });
    $('#panelClose').addEventListener('click', togglePanel);
    $('#panelToggle').addEventListener('click', togglePanel);
  }

  function togglePanel() {
    const closed = panel.classList.toggle('closed');
    $('#panelToggle').classList.toggle('show', closed);
  }

  function saveShot() {
    try {
      renderer.render(state, computeView(), simTime);
      canvas.toBlob(blob => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'gargantua-' + Date.now() + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }, 'image/png');
    } catch (err) { console.warn('screenshot failed', err); }
  }

  /* ------------------------------------------------------------------- startup */
  let simTime = 0, lastFrame = 0, lowAcc = 0, highAcc = 0, elapsed = 0;

  function fatal(err) {
    const box = $('#fatal');
    box.hidden = false;
    box.innerHTML = '<h3>无法启动 WebGL2 渲染</h3>' +
      '<p>本页面需要支持 WebGL2 的浏览器（Chrome / Edge / Firefox 新版本）。' +
      '请使用现代浏览器打开，并确认已开启硬件加速。</p><pre></pre>';
    box.querySelector('pre').textContent = String(err && err.stack || err);
    $('#loading').classList.add('hide');
    console.error(err);
  }

  function frame(now) {
    const rawDt = lastFrame ? (now - lastFrame) / 1000 : 0.016;
    lastFrame = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.25);
    elapsed += dt;
    simTime += dt * state.timeScale;
    if (simTime > 7200) simTime -= 7200;   // keep float precision well behaved

    const instFps = 1 / dt;
    fpsAvg = fpsAvg * 0.90 + instFps * 0.10;

    if (state.autoRotate) {
      state.azimuth = (state.azimuth + state.autoSpeed * dt * 9) % 360;
      syncControl('azimuth');
    }

    // keep the black hole centred in the area not covered by the sidebar
    const targetShift = panel.classList.contains('closed')
      ? 0 : panel.offsetWidth / Math.max(1, window.innerWidth);
    state.shiftX += (targetShift - state.shiftX) * Math.min(1, dt * 5);

    // adaptive internal resolution with hysteresis
    if (state.adaptive && elapsed > 2.5) {
      if (fpsAvg < 27) { lowAcc += dt; highAcc = 0; }
      else if (fpsAvg > 52) { highAcc += dt; lowAcc = 0; }
      else { lowAcc *= 0.9; highAcc *= 0.9; }
      if (lowAcc > 2.2 && adaptiveScale > 0.52) {
        adaptiveScale = Math.max(0.5, adaptiveScale - 0.12);
        lowAcc = 0; resize();
      } else if (highAcc > 5.0 && adaptiveScale < 1.0) {
        adaptiveScale = Math.min(1.0, adaptiveScale + 0.08);
        highAcc = 0; resize();
      }
    }

    try {
      renderer.render(state, computeView(), simTime);
    } catch (err) { fatal(err); return; }

    hudTimer += dt;
    if (hudTimer > 0.3) { hudTimer = 0; updateHUD(); }
    requestAnimationFrame(frame);
  }

  function init() {
    const params = new URLSearchParams(location.search);
    if (params.has('q') && QUALITY[params.get('q')]) state.quality = params.get('q');
    if (params.get('adaptive') === '0') state.adaptive = false;
    if (params.get('panel') === '0') { panel.classList.add('closed'); $('#panelToggle').classList.add('show'); }

    buildPresets();
    buildControls();
    markPreset('cinematic');
    if (params.has('preset')) applyPreset(params.get('preset'));

    renderer = new window.BH_Renderer(canvas);
    state.steps = (QUALITY[state.quality] || QUALITY.high).steps;
    bindInput();
    resize();
    syncAll();

    requestAnimationFrame(now => {
      lastFrame = now;
      frame(now);
      setTimeout(() => $('#loading').classList.add('hide'), 350);
    });

    // small debug / automation surface
    window.__BH = {
      state, renderer, presets: PRESETS,
      applyPreset, resetView, computeView, resize,
      get fps() { return fpsAvg; },
      get hdr() { return renderer.hdr; },
      setQuality(q) { state.quality = q; syncControl('quality'); applyQuality(); }
    };
  }

  try { init(); } catch (err) { fatal(err); }
})();
