/*
 * GARGANTUA — application shell.
 * Camera choreography, pointer interaction, adaptive quality and boot sequence.
 */
(function () {
  'use strict';

  const G = window.GARGANTUA;
  if (!G || !G.Renderer || !G.UI) return;

  const DEG = Math.PI / 180;
  const CAMERA_KEYS = ['distance', 'elevation', 'fov', 'azimuth'];

  const canvas = document.getElementById('space');
  const boot = new G.BootSequence();
  const state = G.PARAMS.cloneDefaults();
  state.quality = 'auto';

  let renderer = null;
  let ui = null;
  let ready = false;
  let fatal = false;
  let frameCount = 0;
  let elapsed = 0;
  let diskTime = 0;
  let lastTimestamp = 0;
  let smoothedFps = 0;
  let lastReadoutAt = 0;
  let lastCameraSyncAt = 0;
  let currentOffset = 0;
  let targetOffset = 0;
  let cameraTween = null;
  let starDensityTimer = 0;
  let captureBusy = false;
  let resizePending = 0;

  const pointers = new Map();
  let dragState = null;
  let pinchState = null;
  let inertiaState = null;
  let wasDesktop = window.innerWidth > 1024;
  let gestureTimer = 0;

  /* ------------------------------------------------------------------ utils */

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function smootherStep(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function normalizeAzimuth(deg) {
    return ((deg + 180) % 360 + 360) % 360 - 180;
  }

  function vectorNormalize(v) {
    const length = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / length, v[1] / length, v[2] / length];
  }

  function vectorCross(a, b) {
    return [
      a[1] * b[2] - a[2] * b[1],
      a[2] * b[0] - a[0] * b[2],
      a[0] * b[1] - a[1] * b[0],
    ];
  }

  function nextPaint() {
    return new Promise((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(resolve));
    });
  }

  function buildCamera() {
    const elevation = state.elevation * DEG;
    const azimuth = state.azimuth * DEG;
    const cosEl = Math.cos(elevation);
    const sinEl = Math.sin(elevation);
    const distance = state.distance;

    const position = [
      distance * cosEl * Math.sin(azimuth),
      distance * sinEl,
      distance * cosEl * Math.cos(azimuth),
    ];

    const forward = vectorNormalize([-position[0], -position[1], -position[2]]);
    const right = vectorNormalize(vectorCross(forward, [0, 1, 0]));
    const up = vectorNormalize(vectorCross(right, forward));

    return {
      position,
      right,
      up,
      forward,
      tanHalfFov: Math.tan((state.fov * DEG) / 2),
    };
  }

  function getControl(key) {
    return G.PARAMS.controlIndex[key] || null;
  }

  function isCameraKey(key) {
    return CAMERA_KEYS.indexOf(key) !== -1;
  }

  /* ------------------------------------------------------------------- boot */

  async function start() {
    boot.setProgress(0.015, '正在初始化观测阵列');

    ui = new G.UI({
      state,
      callbacks: {
        onParamChange: (key, value, control, source) => handleParamChange(key, value, control, source),
        onPreset: (preset) => applyPreset(preset),
        onReset: () => resetAll(),
        onCapture: () => captureImage(),
        onQualityChange: (mode) => setQuality(mode),
        onPanelToggle: () => updateOffsetTarget(),
      },
    });

    ui.setAutoOrbit(!!state.autoOrbit);
    document.getElementById('btn-error-reload').addEventListener('click', () => window.location.reload());

    bindTopbar();
    bindCanvas();
    bindKeyboard();
    bindFullscreen();
    window.addEventListener('resize', handleResize, { passive: true });

    try {
      renderer = new G.Renderer(canvas);
      renderer.onContextLost = () => {
        showFatal('WebGL 上下文意外丢失，观测链路已中断。请点击重新连接以重建时空阵列。');
      };

      await renderer.init(async (progress, label) => {
        boot.setProgress(progress, label);
        await nextPaint();
      });
    } catch (error) {
      console.error('[GARGANTUA] initialization failed', error);
      const message = String(error && error.message ? error.message : error);
      showFatal(
        '无法建立时空渲染链路。请确认浏览器已启用 WebGL2 与硬件加速。\n\n' +
        message.slice(0, 420)
      );
      return;
    }

    setQuality(state.quality, { silent: true });
    updateOffsetTarget();
    currentOffset = targetOffset;

    ui.setAutoOrbit(!!state.autoOrbit);
    ui.setQualityMode(state.quality);

    const camera = buildCamera();
    renderer.render(state, camera, { time: 0, diskTime: 0, offsetX: currentOffset });

    updateReadouts(true);
    syncCameraControls(true);
    ui.setActivePreset('gargantua');

    await nextPaint();
    boot.finish();

    ready = true;
    if (window.__GARGANTUA__) window.__GARGANTUA__.ready = true;

    gestureTimer = window.setTimeout(() => ui.dismissGestureHint(), 9500);
    lastTimestamp = performance.now();
    requestAnimationFrame(frame);
  }

  function showFatal(message) {
    fatal = true;
    const errorScreen = document.getElementById('error-screen');
    const errorMessage = document.getElementById('error-message');
    if (errorMessage) errorMessage.textContent = message;
    if (errorScreen) errorScreen.hidden = false;
    if (boot && !boot.done) boot.fail(message);
    if (ui && !ui.immersive) ui.setConsoleOpen(false, false);
  }

  /* ----------------------------------------------------------------- camera */

  function updateCameraTween(dt) {
    if (!cameraTween) return;
    cameraTween.elapsed += dt;
    const raw = clamp(cameraTween.elapsed / cameraTween.duration, 0, 1);
    const k = smootherStep(raw);

    state.distance = lerp(cameraTween.from.distance, cameraTween.to.distance, k);
    state.elevation = lerp(cameraTween.from.elevation, cameraTween.to.elevation, k);
    state.fov = lerp(cameraTween.from.fov, cameraTween.to.fov, k);
    state.azimuth = normalizeAzimuth(lerp(cameraTween.from.azimuth, cameraTween.to.azimuth, k));

    if (raw >= 1) {
      state.distance = cameraTween.to.distance;
      state.elevation = cameraTween.to.elevation;
      state.fov = cameraTween.to.fov;
      state.azimuth = normalizeAzimuth(cameraTween.to.azimuth);
      cameraTween = null;
      syncCameraControls(true);
      updateReadouts(true);
    }
  }

  function beginCameraTween(target, duration = 0.95) {
    const delta = ((target.azimuth - state.azimuth + 540) % 360) - 180;
    cameraTween = {
      from: {
        distance: state.distance,
        elevation: state.elevation,
        fov: state.fov,
        azimuth: state.azimuth,
      },
      to: {
        distance: clamp(target.distance, 8, 55),
        elevation: clamp(target.elevation, 0.6, 88),
        fov: clamp(target.fov, 28, 72),
        azimuth: state.azimuth + delta,
      },
      elapsed: 0,
      duration,
    };
    inertiaState = null;
  }

  function updateInertia(dt) {
    if (!inertiaState || dragState || pinchState) return;
    state.azimuth = normalizeAzimuth(state.azimuth + inertiaState.azimuth * dt);
    state.elevation = clamp(state.elevation + inertiaState.elevation * dt, 0.6, 88);

    const damping = Math.exp(-dt * 3.8);
    inertiaState.azimuth *= damping;
    inertiaState.elevation *= damping;

    if (Math.abs(inertiaState.azimuth) + Math.abs(inertiaState.elevation) < 2.2) {
      inertiaState = null;
    }
  }

  function resetCameraView() {
    const d = G.PARAMS.defaults;
    beginCameraTween({
      distance: d.distance,
      elevation: d.elevation,
      fov: d.fov,
      azimuth: d.azimuth,
    }, 0.7);
    ui.dismissGestureHint();
    ui.showToast('观测机位已复位', 1600);
  }

  function handleResize() {
    if (resizePending) return;
    resizePending = requestAnimationFrame(() => {
      resizePending = 0;
      if (!renderer) return;
      renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio || 1);
      updateOffsetTarget();

      const desktop = window.innerWidth > 1024;
      if (wasDesktop && !desktop && ui.consoleOpen) {
        ui.setConsoleOpen(false);
      }
      wasDesktop = desktop;
      updateReadouts(true);
    });
  }

  function updateOffsetTarget() {
    if (!ui || ui.immersive || !ui.consoleOpen || window.innerWidth <= 1024) {
      targetOffset = 0;
      return;
    }
    const consoleRect = document.getElementById('console').getBoundingClientRect();
    const shiftPixels = Math.min(consoleRect.width * 0.36, window.innerWidth * 0.11);
    targetOffset = (shiftPixels * 2) / window.innerWidth;
  }

  function syncCameraControls(force = false) {
    if (!ui) return;
    const now = performance.now();
    if (!force && now - lastCameraSyncAt < 110) return;
    lastCameraSyncAt = now;
    ui.setValue('distance', state.distance);
    ui.setValue('elevation', state.elevation);
    ui.setValue('fov', state.fov);
  }

  function updateReadouts(force = false) {
    if (!ui || !renderer) return;
    const now = performance.now();
    if (!force && now - lastReadoutAt < 220) return;
    lastReadoutAt = now;

    ui.setFps(smoothedFps);
    ui.setObserver(state.distance, state.elevation, state.fov);
    ui.setRenderStats(renderer.getStats());
  }

  /* --------------------------------------------------------------- parameters */

  function handleParamChange(key, value, control, source) {
    if (!ui) return;
    const meta = control || getControl(key);

    if (meta && meta.type === 'toggle') {
      state[key] = !!value;
      ui.setValue(key, state[key]);
      if (key === 'autoOrbit') {
        ui.setAutoOrbit(state.autoOrbit);
        if (state.autoOrbit) {
          cameraTween = null;
          inertiaState = null;
        }
      }
      return;
    }

    let numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    if (meta) numeric = clamp(numeric, meta.min, meta.max);

    if (key === 'diskInner') {
      numeric = Math.min(numeric, state.diskOuter - 1.0);
      if (state.diskOuter < numeric + 1.0) {
        state.diskOuter = numeric + 1.0;
        ui.setValue('diskOuter', state.diskOuter);
      }
    } else if (key === 'diskOuter') {
      numeric = Math.max(numeric, state.diskInner + 1.0);
    }

    state[key] = numeric;
    if (isCameraKey(key)) {
      cameraTween = null;
      inertiaState = null;
    }
    ui.setValue(key, numeric);

    if (key === 'starDensity') scheduleStarRebuild();
  }

  function scheduleStarRebuild() {
    window.clearTimeout(starDensityTimer);
    starDensityTimer = window.setTimeout(() => {
      if (!renderer) return;
      const rebuilt = renderer.setStarDensity(state.starDensity);
      if (rebuilt) updateReadouts(true);
    }, 180);
  }

  function applyPreset(preset) {
    if (!preset || !preset.values) return;
    const values = preset.values;

    for (const [key, value] of Object.entries(values)) {
      if (isCameraKey(key)) continue;
      if (!(key in state)) continue;
      state[key] = value;
      if (getControl(key)) ui.setValue(key, value);
    }

    // Keep the disk annulus valid for all current and future presets.
    if (state.diskOuter < state.diskInner + 1.0) {
      state.diskOuter = state.diskInner + 1.0;
    }
    ui.setValue('diskOuter', state.diskOuter);

    beginCameraTween({
      distance: values.distance !== undefined ? values.distance : state.distance,
      elevation: values.elevation !== undefined ? values.elevation : state.elevation,
      fov: values.fov !== undefined ? values.fov : state.fov,
      azimuth: values.azimuth !== undefined ? values.azimuth : state.azimuth,
    });

    ui.setActivePreset(preset.id);
    ui.dismissGestureHint();
    ui.showToast(`载入影像预设 · ${preset.name}`, 1900);
    scheduleStarRebuild();
    updateReadouts(true);
  }

  function resetAll() {
    cameraTween = null;
    inertiaState = null;
    Object.assign(state, G.PARAMS.cloneDefaults());
    state.quality = 'auto';

    if (renderer) setQuality('auto', { silent: true });

    ui.syncAll();
    ui.setActivePreset('gargantua');
    ui.setAutoOrbit(!!state.autoOrbit);
    ui.dismissGestureHint();
    ui.showToast('已恢复默认观测参数', 1900);
    updateOffsetTarget();
    scheduleStarRebuild();
    updateReadouts(true);
  }

  function setQuality(mode, options = {}) {
    if (!renderer || !G.Renderer) return;
    const valid = ['auto', 'high', 'balanced', 'performance'];
    if (valid.indexOf(mode) === -1) return;
    state.quality = mode;
    renderer.setQualityMode(mode);
    ui.setQualityMode(mode);
    if (!options.silent) {
      const labels = { auto: '自动', high: '精致', balanced: '均衡', performance: '流畅' };
      ui.showToast(`渲染质量 · ${labels[mode]}`, 1400);
    }
    updateReadouts(true);
  }

  /* ---------------------------------------------------------------- commands */

  function toggleAutoOrbit() {
    state.autoOrbit = !state.autoOrbit;
    ui.setValue('autoOrbit', state.autoOrbit);
    ui.setAutoOrbit(state.autoOrbit);
    if (state.autoOrbit) {
      cameraTween = null;
      inertiaState = null;
    }
  }

  function setImmersive(hidden) {
    ui.setImmersive(hidden);
    updateOffsetTarget();
    updateReadouts(true);
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      const request = document.documentElement.requestFullscreen;
      if (typeof request !== 'function') {
        ui.showToast('当前浏览器不支持全屏模式', 1800);
        return;
      }
      request.call(document.documentElement).catch(() => {
        ui.showToast('无法进入全屏模式', 1800);
      });
    } else if (document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
  }

  function bindFullscreen() {
    const button = document.getElementById('btn-fullscreen');
    document.addEventListener('fullscreenchange', () => {
      const active = !!document.fullscreenElement;
      if (button) {
        button.setAttribute('aria-label', active ? '退出全屏' : '进入全屏');
        button.title = active ? '退出全屏 (F)' : '全屏 (F)';
      }
      handleResize();
    });
    if (button) {
      button.addEventListener('click', (event) => {
        event.stopPropagation();
        toggleFullscreen();
      });
    }
  }

  async function captureImage() {
    if (!renderer || !ready || captureBusy) return;
    captureBusy = true;
    ui.showToast('正在显影 · 生成无损 PNG', 1300);
    try {
      const blob = await renderer.capture();
      const now = new Date();
      const stamp = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0'),
        '-',
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0'),
      ].join('');
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.href = url;
      link.download = `gargantua-${stamp}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2200);
      ui.showToast('观测影像已保存 · GARGANTUA PNG', 2400);
    } catch (error) {
      console.error('[GARGANTUA] capture failed', error);
      ui.showToast('影像保存失败，请重试', 2200);
    } finally {
      captureBusy = false;
    }
  }

  /* ------------------------------------------------------------------ events */

  function bindTopbar() {
    document.getElementById('btn-auto-orbit').addEventListener('click', () => {
      toggleAutoOrbit();
    });
    document.getElementById('btn-hide-ui').addEventListener('click', () => {
      setImmersive(true);
    });
    document.getElementById('btn-reveal-ui').addEventListener('click', () => {
      setImmersive(false);
    });
  }

  function bindKeyboard() {
    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const targetTag = (event.target && event.target.tagName ? event.target.tagName : '').toLowerCase();
      const isTextEntry = targetTag === 'input' || targetTag === 'select' || targetTag === 'textarea';

      if (event.code === 'Space' && !isTextEntry) {
        event.preventDefault();
        toggleAutoOrbit();
        return;
      }

      if (isTextEntry && event.key !== 'Escape') return;

      const key = event.key.toLowerCase();
      if (key === 'h') {
        setImmersive(!ui.immersive);
      } else if (key === 'p') {
        ui.setConsoleOpen(!ui.consoleOpen);
        updateOffsetTarget();
      } else if (key === 'f') {
        toggleFullscreen();
      } else if (key === 's') {
        captureImage();
      } else if (key === 'r') {
        resetCameraView();
      } else if (key === 'escape') {
        if (ui.immersive) {
          setImmersive(false);
        } else if (window.innerWidth <= 1024 && ui.consoleOpen) {
          ui.setConsoleOpen(false);
          updateOffsetTarget();
        }
      }
    });
  }

  function bindCanvas() {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
    canvas.addEventListener('dblclick', (event) => {
      event.preventDefault();
      resetCameraView();
    });

    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      ui.dismissGestureHint();
      cameraTween = null;
      inertiaState = null;

      let delta = event.deltaY;
      if (event.deltaMode === 1) delta *= 16;
      else if (event.deltaMode === 2) delta *= window.innerHeight;

      const next = clamp(state.distance * Math.exp(delta * 0.0007), 8, 55);
      state.distance = next;
      syncCameraControls(true);
      updateReadouts(true);
    }, { passive: false });
  }

  function onPointerDown(event) {
    if (fatal) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (error) {
      // Pointer capture is best-effort, not required for the interaction.
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    cameraTween = null;
    inertiaState = null;
    ui.dismissGestureHint();

    if (pointers.size === 1) {
      dragState = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        lastTime: performance.now(),
        lastMoveTime: performance.now(),
        azimuthVelocity: 0,
        elevationVelocity: 0,
      };
      document.body.classList.add('is-dragging');
    } else if (pointers.size === 2) {
      dragState = null;
      const pts = Array.from(pointers.values());
      pinchState = {
        startDistance: Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)),
        startCamera: state.distance,
      };
      document.body.classList.add('is-dragging');
    }
  }

  function onPointerMove(event) {
    if (!pointers.has(event.pointerId)) return;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (pointers.size >= 2 && pinchState) {
      const pts = Array.from(pointers.values());
      const distance = Math.max(1, Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y));
      const ratio = pinchState.startDistance / distance;
      state.distance = clamp(pinchState.startCamera * ratio, 8, 55);
      syncCameraControls();
      updateReadouts();
      return;
    }

    if (!dragState || dragState.id !== event.pointerId) return;

    const dx = event.clientX - dragState.x;
    const dy = event.clientY - dragState.y;
    const now = performance.now();
    const dt = Math.max(8, now - dragState.lastTime);
    const sensitivity = event.pointerType === 'touch' ? 0.17 : 0.125;

    state.azimuth = normalizeAzimuth(state.azimuth - dx * sensitivity);
    state.elevation = clamp(state.elevation + dy * sensitivity * 0.72, 0.6, 88);

    dragState.x = event.clientX;
    dragState.y = event.clientY;
    dragState.lastTime = now;
    dragState.lastMoveTime = now;
    dragState.azimuthVelocity = clamp((-dx * sensitivity * 1000) / dt, -125, 125);
    dragState.elevationVelocity = clamp((dy * sensitivity * 0.72 * 1000) / dt, -105, 105);

    syncCameraControls();
    updateReadouts();
  }

  function onPointerUp(event) {
    const hadDrag = dragState && dragState.id === event.pointerId;
    const recentMove = dragState && performance.now() - dragState.lastMoveTime < 90;

    pointers.delete(event.pointerId);
    try {
      if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    } catch (error) {
      // Nothing to release.
    }

    if (pointers.size === 0) {
      if (hadDrag && recentMove && dragState) {
        const az = dragState.azimuthVelocity;
        const el = dragState.elevationVelocity;
        if (Math.abs(az) + Math.abs(el) > 7) {
          inertiaState = { azimuth: az, elevation: el };
        }
      }
      dragState = null;
      pinchState = null;
      document.body.classList.remove('is-dragging');
      syncCameraControls(true);
      updateReadouts(true);
    } else if (pointers.size === 1) {
      const entry = pointers.entries().next().value;
      dragState = {
        id: entry[0],
        x: entry[1].x,
        y: entry[1].y,
        lastTime: performance.now(),
        lastMoveTime: performance.now(),
        azimuthVelocity: 0,
        elevationVelocity: 0,
      };
      pinchState = null;
    }
  }

  /* ---------------------------------------------------------------- renderer */

  function frame(timestamp) {
    if (!ready || fatal) return;
    requestAnimationFrame(frame);

    if (!lastTimestamp) lastTimestamp = timestamp;
    const rawDt = Math.max(0, (timestamp - lastTimestamp) / 1000);
    lastTimestamp = timestamp;
    const dt = clamp(rawDt, 0.0001, 0.05);
    const choreographyDt = clamp(rawDt, 0.0001, 0.25);

    elapsed += dt;

    // Camera moves are choreography, not simulation: use wall time so preset
    // transitions still land on schedule on a slow GPU.
    updateCameraTween(choreographyDt);
    updateInertia(choreographyDt);

    const activelyInteracting = !!dragState || !!pinchState;
    if (!cameraTween && !inertiaState && !activelyInteracting && state.autoOrbit) {
      state.azimuth = normalizeAzimuth(state.azimuth + dt * 2.1);
    }

    diskTime += dt * state.diskSpeed;

    const desiredOffset = targetOffset;
    currentOffset += (desiredOffset - currentOffset) * (1 - Math.exp(-dt * 5.2));

    const camera = buildCamera();
    try {
      renderer.render(state, camera, {
        time: elapsed,
        diskTime,
        offsetX: currentOffset,
      });
    } catch (error) {
      console.error('[GARGANTUA] render failed', error);
      showFatal('渲染链路发生错误，无法继续绘制时空画面。请重新连接。');
      return;
    }

    frameCount += 1;
    if (window.__GARGANTUA__) window.__GARGANTUA__.frameCount = frameCount;

    if (rawDt > 0) {
      const instantFps = 1 / rawDt;
      smoothedFps = smoothedFps === 0 ? instantFps : smoothedFps * 0.9 + instantFps * 0.1;
    }

    // Ignore the first frame after a tab switch or display sleep; a multi-second
    // delta would otherwise cause the auto-quality controller to overreact.
    if (rawDt < 0.25) renderer.updateAdaptive(rawDt * 1000);
    syncCameraControls();
    updateReadouts();
  }

  /* -------------------------------------------------------------------- api */

  const debugApi = {
    ready: false,
    frameCount: 0,
    state,
    renderer: null,
    ui: null,
    get fps() {
      return smoothedFps;
    },
    setParam(key, value) {
      const control = getControl(key);
      if (control) handleParamChange(key, value, control, 'debug');
    },
    applyPreset(id) {
      const preset = G.PARAMS.presetIndex[id];
      if (preset) applyPreset(preset);
    },
    setQuality(mode) {
      setQuality(mode);
    },
    setCamera(partial) {
      for (const key of CAMERA_KEYS) {
        if (partial && Number.isFinite(partial[key])) state[key] = partial[key];
      }
      cameraTween = null;
      inertiaState = null;
      syncCameraControls(true);
      updateReadouts(true);
    },
    reset() {
      resetAll();
    },
    resetView() {
      resetCameraView();
    },
    setImmersive(hidden) {
      setImmersive(!!hidden);
    },
    toggleAutoOrbit() {
      toggleAutoOrbit();
    },
    capture() {
      return captureImage();
    },
    getStats() {
      return renderer ? renderer.getStats() : null;
    },
  };
  window.__GARGANTUA__ = debugApi;

  // Attach live references for debugging and automated visual checks.
  start()
    .catch((error) => {
      console.error('[GARGANTUA] startup failed', error);
      showFatal('观测台启动失败，请刷新页面重试。');
    })
    .finally(() => {
      debugApi.renderer = renderer;
      debugApi.ui = ui;
    });
})();
