/* ============================================================
   main.js — 启动、主循环、快捷键
   ============================================================ */
(function () {
  'use strict';

  const canvas = document.getElementById('gl');
  const overlay = document.getElementById('overlay');
  const overlayMsg = document.getElementById('overlay-msg');
  const statsEl = document.getElementById('stats');

  function fail(msg) {
    overlay.classList.add('err');
    overlay.classList.remove('hide');
    overlayMsg.innerHTML = msg;
  }

  let renderer;
  try {
    renderer = new window.BlackHoleRenderer(canvas);
  } catch (e) {
    console.error(e);
    fail('初始化失败：' + e.message +
      '<br><br>请使用支持 <b>WebGL2</b> 的现代浏览器（Chrome / Edge / Firefox / Safari 16+），' +
      '并确认已启用硬件加速。');
    return;
  }

  const state = Object.assign({}, window.PARAMS.DEFAULTS, { _inTouched: false });

  /* ---------- UI ---------- */
  const ui = new window.UI(state, key => {
    if (key === 'spin' && !state._inTouched) ui.sync();
    if (key === 'quality' || key === 'autoRes' || key === 'resScale') ui.sync();
  });

  const controls = new window.OrbitControls(canvas, state, () => {
    ui.sync();
  });

  /* ---------- 面板开合 ---------- */
  const panel = document.getElementById('panel');
  const btnOpen = document.getElementById('btn-open');
  const btnCollapse = document.getElementById('btn-collapse');
  function togglePanel(force) {
    const collapsed = force !== undefined ? force : !panel.classList.contains('collapsed');
    panel.classList.toggle('collapsed', collapsed);
    btnOpen.classList.toggle('show', collapsed);
  }
  btnCollapse.addEventListener('click', () => togglePanel(true));
  btnOpen.addEventListener('click', () => togglePanel(false));
  document.getElementById('btn-reset').addEventListener('click', () => {
    Object.assign(state, window.PARAMS.DEFAULTS);
    state._inTouched = false;
    ui.sync();
  });
  document.getElementById('btn-shot').addEventListener('click', shot);

  function shot() {
    try {
      canvas.toBlob(b => {
        if (!b) return;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(b);
        a.download = 'gargantua-blackhole.png';
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      }, 'image/png');
    } catch (e) { console.warn(e); }
  }

  /* ---------- 快捷键 ---------- */
  window.addEventListener('keydown', e => {
    if (e.target && /input|textarea/i.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    if (k === 'h') { togglePanel(); }
    else if (k === 'r') { controls.reset(); ui.sync(); }
    else if (k === 'p') { shot(); }
    else if (k === ' ') { paused = !paused; e.preventDefault(); }
    else if (k >= '1' && k <= '4') {
      state.quality = parseInt(k, 10) - 1;
      ui.sync();
    }
  });

  /* ---------- 尺寸 ---------- */
  let scale = state.resScale;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.resize(w, h, dpr, scale);
  }
  window.addEventListener('resize', resize);

  /* ---------- 主循环 ---------- */
  let last = performance.now();
  let simTime = 0;
  let paused = false;
  let fps = 60, frameAcc = 0, frameCount = 0;
  let autoCounter = 0;
  let lastInfoIn = -1;
  let lastDiskIn = -1;

  const infoEls = {
    rs: document.getElementById('i-rs'),
    isco: document.getElementById('i-isco'),
    period: document.getElementById('i-period'),
    temp: document.getElementById('i-temp'),
    shadow: document.getElementById('i-shadow')
  };

  function fmtPeriod(ms) {
    if (ms < 1000) return ms.toFixed(2) + ' ms';
    if (ms < 60000) return (ms / 1000).toFixed(2) + ' s';
    if (ms < 3600000) return (ms / 60000).toFixed(2) + ' min';
    return (ms / 3600000).toFixed(2) + ' h';
  }

  function loop(now) {
    requestAnimationFrame(loop);
    const dtMs = now - last;
    last = now;
    const dt = Math.min(0.1, dtMs / 1000);

    if (!paused) simTime += dt * state.timeScale;

    const rs = window.PARAMS.computeState(state);

    /* 面板遮挡时，把黑洞平移到可视区域中央（镜头偏移） */
    const panelW = panel.classList.contains('collapsed') ? 0 : panel.offsetWidth;
    const cw = canvas.clientWidth || 1;
    rs.projShift = (cw > 760 && panelW > 0) ? Math.min(0.38, panelW / cw) : 0;

    if (!state._inTouched && Math.abs(rs.diskIn - lastDiskIn) > 1e-6) {
      lastDiskIn = rs.diskIn;
      ui.sync();
    }

    renderer.render(rs, simTime);

    /* 统计 */
    frameAcc += dtMs; frameCount++;
    if (frameAcc > 400) {
      fps = 1000 / (frameAcc / frameCount);
      frameAcc = 0; frameCount = 0;
      statsEl.innerHTML =
        '<span><b>' + fps.toFixed(0) + '</b> FPS</span>' +
        '<span><b>' + renderer.rw + '×' + renderer.rh + '</b></span>' +
        '<span>步数 <b>' + rs.steps + '</b></span>' +
        '<span>距离 <b>' + rs.camera.dist.toFixed(1) + ' rs</b></span>';
    }

    /* 自动分辨率 */
    if (state.autoRes) {
      autoCounter++;
      if (autoCounter > 45) {
        autoCounter = 0;
        const target = state.resScale;
        if (fps < 40 && scale > 0.42) scale = Math.max(0.42, scale - 0.06);
        else if (fps > 56 && scale < target) scale = Math.min(target, scale + 0.04);
        resize();
      }
    } else if (scale !== state.resScale) {
      scale = state.resScale;
      resize();
    }

    /* 物理信息 */
    const i = rs.info;
    if (i.rsKm !== lastInfoIn) {
      lastInfoIn = i.rsKm;
      infoEls.rs.textContent = i.rsKm.toFixed(1) + ' km';
      infoEls.isco.textContent = i.iscoKm.toFixed(1) + ' km (' + i.iscoRs.toFixed(2) + ' rs)';
      infoEls.period.textContent = fmtPeriod(i.periodMs);
      infoEls.temp.textContent = i.tempK.toFixed(0) + ' K';
      infoEls.shadow.textContent = '5.20 rs';
    }
  }

  resize();
  requestAnimationFrame(loop);
  setTimeout(() => overlay.classList.add('hide'), 260);

  /* 调试钩子（可在控制台调整参数） */
  window.__BH = {
    state, renderer, ui, controls,
    get computed() { return window.PARAMS.computeState(state); }
  };
})();
