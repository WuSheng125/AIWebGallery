import { DEFAULTS, ORBIT_SPEED, PRESETS } from './params.js';
import { Renderer } from './renderer.js';
import { ObservationUI } from './ui.js';

const stage = document.getElementById('stage');
const canvas = document.getElementById('view');
const loading = document.getElementById('loading');
const loadingBar = document.getElementById('loadingBar');
const loadingStatus = document.getElementById('loadingStatus');
const loadingTitle = document.querySelector('.loading__title');
const loadingError = document.getElementById('loadingError');

const TAU = Math.PI * 2;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const angleDelta = (target, current) => {
  let delta = target - current;
  while (delta > Math.PI) delta -= TAU;
  while (delta < -Math.PI) delta += TAU;
  return delta;
};

const state = { ...DEFAULTS };
const camera = {
  azimuth: 0.58,
  targetAzimuth: 0.58,
  elevation: DEFAULTS.elevation,
  targetElevation: DEFAULTS.elevation,
  distance: DEFAULTS.distance,
  targetDistance: DEFAULTS.distance,
  fov: DEFAULTS.fov,
  targetFov: DEFAULTS.fov,
  position: [0, 0, 0],
  right: [1, 0, 0],
  up: [0, 1, 0],
  forward: [0, 0, -1],
};

const pointers = new Map();
let renderer = null;
let ui = null;
let animationId = 0;
let simTime = 0;
let lastFrameTime = performance.now();
let fps = 60;
let frameCounter = 0;
let hudClock = 0;
let lastInteraction = performance.now() - 5000;
let firstFrame = true;
let pendingCapture = false;
let snapshotBusy = false;
let autoScale = 0.82;
let qualityCheckTimer = performance.now();
let qualityAccumulator = 0;
let qualitySamples = 0;
let resizeScheduled = false;
let appReady = false;
let lastFpsSampleTime = performance.now();
let fpsFrames = 0;

const QUALITY_SCALE = {
  high: 1.0,
  balanced: 0.78,
  performance: 0.55,
};

/* ------------------------------------------------------------------ helpers */

function nextPaint() {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  });
}

function setLoadingProgress(progress, status) {
  if (loadingBar) {
    const value = clamp(progress, 0.01, 1);
    loadingBar.style.transform = `scaleX(${value.toFixed(3)})`;
  }
  if (loadingStatus && status) loadingStatus.textContent = status;
}

async function loadingStep(progress, status) {
  setLoadingProgress(progress, status);
  await nextPaint();
}

function showFatalError(error) {
  console.error('[GARGANTUA]', error);
  if (!loading) return;
  loading.classList.add('is-error');
  loading.classList.remove('is-done');
  if (loadingTitle) loadingTitle.textContent = '无法建立观测链路';
  if (loadingError) {
    loadingError.hidden = false;
    loadingError.textContent =
      (error && error.message ? error.message : String(error)) +
      '\n\n请确认浏览器支持 WebGL 2 并启用硬件加速，然后刷新页面重试。';
  }
  if (loadingStatus) loadingStatus.textContent = '观测台离线';
  if (loadingBar) loadingBar.style.transform = 'scaleX(0)';
  if (ui) ui.setLive(false);
}

function finishLoading() {
  if (!loading) return;
  loading.classList.add('is-done');
  window.setTimeout(() => {
    if (loading.parentNode) loading.setAttribute('aria-hidden', 'true');
  }, 1200);
  if (ui) {
    ui.setStatus('度规已同步');
    window.setTimeout(() => ui && ui.hideHint(), 9000);
  }
}

function applySceneScale() {
  if (!renderer) return;
  const scale = effectiveSceneScale(renderer.width, renderer.height);
  renderer.setSceneScale(scale);
}

function effectiveSceneScale(width, height) {
  let base;
  if (state.quality === 'auto') {
    base = autoScale;
  } else {
    base = QUALITY_SCALE[state.quality] ?? 0.82;
  }

  const maxScenePixels = 4.0e6;
  const pixels = width * height * base * base;
  if (pixels > maxScenePixels) base = Math.sqrt(maxScenePixels / Math.max(1, width * height));
  return clamp(base, 0.35, 1.15);
}

function fitCanvas() {
  if (!renderer) return;
  resizeScheduled = false;
  const rect = stage.getBoundingClientRect();
  const cssWidth = Math.max(2, rect.width);
  const cssHeight = Math.max(2, rect.height);

  let dpr = Math.min(window.devicePixelRatio || 1, 1.6);
  const maxBackingPixels = 4.4e6;
  if (cssWidth * cssHeight * dpr * dpr > maxBackingPixels) {
    dpr = Math.sqrt(maxBackingPixels / (cssWidth * cssHeight));
  }

  const width = Math.max(2, Math.round(cssWidth * dpr));
  const height = Math.max(2, Math.round(cssHeight * dpr));
  const scale = effectiveSceneScale(width, height);

  const sizeChanged = renderer.width !== width || renderer.height !== height;
  renderer.resize(width, height, scale);
  if (!sizeChanged) renderer.setSceneScale(scale);
}

function scheduleFit() {
  if (resizeScheduled) return;
  resizeScheduled = true;
  requestAnimationFrame(fitCanvas);
}

/* ------------------------------------------------------------------- camera */

function updateCamera(dt, now) {
  if (state.autoOrbit && pointers.size === 0 && now - lastInteraction > 4200) {
    camera.targetAzimuth += ORBIT_SPEED * dt;
  }

  const damping = 1 - Math.exp(-dt * 7.2);
  camera.azimuth += angleDelta(camera.targetAzimuth, camera.azimuth) * damping;
  camera.elevation += (camera.targetElevation - camera.elevation) * damping;
  camera.distance += (camera.targetDistance - camera.distance) * damping;
  camera.fov += (camera.targetFov - camera.fov) * damping;

  const elevation = (camera.elevation * Math.PI) / 180;
  const azimuth = camera.azimuth;
  const cosE = Math.cos(elevation);
  const sinE = Math.sin(elevation);
  const distance = camera.distance;

  const px = Math.sin(azimuth) * cosE * distance;
  const py = sinE * distance;
  const pz = Math.cos(azimuth) * cosE * distance;
  camera.position[0] = px;
  camera.position[1] = py;
  camera.position[2] = pz;

  const inv = 1 / Math.max(0.0001, Math.hypot(px, py, pz));
  const fx = -px * inv;
  const fy = -py * inv;
  const fz = -pz * inv;
  camera.forward[0] = fx;
  camera.forward[1] = fy;
  camera.forward[2] = fz;

  // right = normalize(forward × worldUp)
  let rx = fy * 0 - fz * 1;
  let ry = fz * 0 - fx * 0;
  let rz = fx * 1 - fy * 0;
  const rInv = 1 / Math.max(0.0001, Math.hypot(rx, ry, rz));
  rx *= rInv;
  ry *= rInv;
  rz *= rInv;
  camera.right[0] = rx;
  camera.right[1] = ry;
  camera.right[2] = rz;

  // up = right × forward
  camera.up[0] = ry * fz - rz * fy;
  camera.up[1] = rz * fx - rx * fz;
  camera.up[2] = rx * fy - ry * fx;
}

/* -------------------------------------------------------------- state / UI */

function normalizeDiskRadii() {
  state.diskInner = clamp(state.diskInner, 1.6, 6);
  state.diskOuter = clamp(state.diskOuter, 6, 30);
  if (state.diskOuter < state.diskInner + 0.8) {
    state.diskOuter = Math.min(30, state.diskInner + 0.8);
  }
}

function handleStateChange(key, value) {
  if (key === 'distance') {
    state.distance = clamp(value, 5, 40);
    camera.targetDistance = state.distance;
  } else if (key === 'elevation') {
    state.elevation = clamp(value, 1, 85);
    camera.targetElevation = state.elevation;
  } else if (key === 'fov') {
    state.fov = clamp(value, 24, 90);
    camera.targetFov = state.fov;
  } else if (key === 'diskInner' || key === 'diskOuter') {
    state[key] = value;
    normalizeDiskRadii();
    if (state.diskInner !== value) ui?.refreshControl('diskInner', state.diskInner);
    ui?.refreshControl('diskOuter', state.diskOuter);
  } else if (key === 'quality') {
    state.quality = value;
    if (value === 'auto') {
      autoScale = 0.82;
      qualityCheckTimer = performance.now();
      qualityAccumulator = 0;
      qualitySamples = 0;
    }
    applySceneScale();
  } else if (key in state) {
    state[key] = value;
  }

  if (ui && (key === 'showDisk' || key === 'autoOrbit')) {
    ui.refreshControl(key, state[key]);
  }
}

function resetView(showMessage = true) {
  state.distance = DEFAULTS.distance;
  state.elevation = DEFAULTS.elevation;
  state.fov = DEFAULTS.fov;
  camera.targetDistance = DEFAULTS.distance;
  camera.targetElevation = DEFAULTS.elevation;
  camera.targetFov = DEFAULTS.fov;
  camera.targetAzimuth = 0.58;
  lastInteraction = performance.now() - 5000;
  if (ui) {
    ui.refreshControl('distance', state.distance);
    ui.refreshControl('elevation', state.elevation);
    ui.refreshControl('fov', state.fov);
    if (showMessage) ui.showToast('视角已复位');
  }
}

function resetAll() {
  Object.assign(state, DEFAULTS);
  camera.targetAzimuth = 0.58;
  camera.targetDistance = state.distance;
  camera.targetElevation = state.elevation;
  camera.targetFov = state.fov;
  autoScale = 0.82;
  lastInteraction = performance.now() - 5000;
  normalizeDiskRadii();
  if (ui) {
    ui.refreshAll();
    ui.clearPreset();
    ui.markPreset('gargantua');
    ui.showToast('全部观测参数已恢复默认');
  }
  applySceneScale();
}

function applyPreset(preset) {
  for (const [key, value] of Object.entries(preset.values)) {
    if (key in state) state[key] = value;
  }
  if (!('showDisk' in preset.values)) state.showDisk = true;
  normalizeDiskRadii();

  camera.targetDistance = state.distance;
  camera.targetElevation = state.elevation;
  camera.targetFov = state.fov;
  lastInteraction = performance.now() - 5000;

  if (ui) {
    ui.refreshAll();
    ui.markPreset(preset.id);
    ui.showToast(`已载入预设 · ${preset.name}`);
  }
  if (state.quality === 'auto') {
    qualityCheckTimer = performance.now();
    qualityAccumulator = 0;
    qualitySamples = 0;
  }
}

function toggleUI() {
  if (!ui) return;
  const hidden = !document.body.classList.contains('ui-hidden');
  ui.setUIHidden(hidden);
  if (hidden) {
    ui.showToast('界面已隐藏 · 按 H 或点击右上角恢复', 3200);
  } else {
    ui.showToast('观测界面已恢复', 1400);
  }
}

async function toggleFullscreen() {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    ui?.showToast('浏览器阻止了全屏请求');
  }
}

async function captureFrame() {
  if (!renderer || snapshotBusy) return;
  snapshotBusy = true;
  pendingCapture = true;
  ui?.busyOn('正在显影…');
  ui?.hideHint();
}

async function finishCapture() {
  pendingCapture = false;
  if (!renderer) {
    snapshotBusy = false;
    ui?.busyOff();
    return;
  }
  try {
    const blob = await renderer.capture();
    if (!blob) throw new Error('empty image');
    const stamp = new Date();
    const pad = (value) => String(value).padStart(2, '0');
    const filename = `gargantua-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(
      stamp.getDate()
    )}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.png`;
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 3000);
    ui?.showToast(`观测影像已保存 · ${filename}`);
  } catch (error) {
    console.error(error);
    ui?.showToast('影像导出失败，请重试');
  } finally {
    snapshotBusy = false;
    ui?.busyOff();
  }
}

/* --------------------------------------------------------------- interaction */

function pointDistance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function setupInteraction() {
  canvas.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 && event.pointerType === 'mouse') return;
    canvas.setPointerCapture(event.pointerId);
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    lastInteraction = performance.now();
    ui?.hideHint();
    if (pointers.size === 1) {
      canvas.dataset.dragOrigin = `${event.clientX},${event.clientY}`;
    }
  });

  canvas.addEventListener('pointermove', (event) => {
    const point = pointers.get(event.pointerId);
    if (!point) return;
    const previousX = point.x;
    const previousY = point.y;
    point.x = event.clientX;
    point.y = event.clientY;
    lastInteraction = performance.now();

    if (pointers.size === 1) {
      const dx = point.x - previousX;
      const dy = point.y - previousY;
      if (Math.abs(dx) + Math.abs(dy) > 0.3) {
        camera.targetAzimuth -= dx * 0.0043;
        camera.targetElevation = clamp(camera.targetElevation - dy * 0.11, 1, 85);
        state.elevation = camera.targetElevation;
        ui?.setDisplayValue('elevation', state.elevation);
      }
    } else if (pointers.size === 2) {
      const points = [...pointers.values()];
      const distance = pointDistance(points[0], points[1]);
      if (canvas.dataset.pinchDistance) {
        const previous = parseFloat(canvas.dataset.pinchDistance);
        if (previous > 0) {
          const factor = previous / Math.max(distance, 1);
          camera.targetDistance = clamp(camera.targetDistance * factor, 5, 40);
          state.distance = camera.targetDistance;
          ui?.setDisplayValue('distance', state.distance);
        }
      }
      canvas.dataset.pinchDistance = String(distance);
    }
  });

  const endPointer = (event) => {
    if (!pointers.has(event.pointerId)) return;
    pointers.delete(event.pointerId);
    canvas.dataset.pinchDistance = '';
    lastInteraction = performance.now();
    if (pointers.size === 0) {
      const origin = canvas.dataset.dragOrigin;
      if (origin) {
        const [ox, oy] = origin.split(',').map(Number);
        if (Math.hypot(event.clientX - ox, event.clientY - oy) > 4) ui?.clearPreset();
      }
      canvas.dataset.dragOrigin = '';
    } else if (pointers.size === 1) {
      const remaining = [...pointers.values()][0];
      remaining.x = remaining.x ?? event.clientX;
      remaining.y = remaining.y ?? event.clientY;
      if (canvas.dataset.dragOrigin) {
        canvas.dataset.dragOrigin = `${remaining.x},${remaining.y}`;
      }
    }
  };

  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('lostpointercapture', (event) => {
    if (pointers.has(event.pointerId)) endPointer(event);
  });

  canvas.addEventListener(
    'wheel',
    (event) => {
      event.preventDefault();
      lastInteraction = performance.now();
      const factor = Math.exp(event.deltaY * 0.00115);
      camera.targetDistance = clamp(camera.targetDistance * factor, 5, 40);
      state.distance = camera.targetDistance;
      ui?.setDisplayValue('distance', state.distance);
      ui?.hideHint();
      ui?.clearPreset();
    },
    { passive: false }
  );

  canvas.addEventListener('dblclick', () => resetView());
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  window.addEventListener('resize', scheduleFit);
  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(scheduleFit);
    observer.observe(stage);
  }
  document.addEventListener('fullscreenchange', scheduleFit);

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && document.fullscreenElement) return;
  });
}

/* ---------------------------------------------------------------- animation */

function updatePerformance(dt, now) {
  if (dt > 0.0001) {
    const instantaneous = 1 / dt;
    fps += (instantaneous - fps) * 0.085;
  }

  if (state.quality !== 'auto' || !renderer) return;
  if (dt > 0.2) return;

  qualityAccumulator += dt;
  qualitySamples++;
  if (now - qualityCheckTimer < 1600 || qualitySamples < 36) return;

  const average = qualityAccumulator / qualitySamples;
  qualityAccumulator = 0;
  qualitySamples = 0;
  qualityCheckTimer = now;

  let nextScale = autoScale;
  if (average > 0.0255 && autoScale > 0.5) {
    nextScale = Math.max(0.5, autoScale - 0.045);
  } else if (average < 0.0148 && autoScale < 0.9) {
    nextScale = Math.min(0.9, autoScale + 0.022);
  }

  if (Math.abs(nextScale - autoScale) > 0.001) {
    autoScale = nextScale;
    applySceneScale();
  }
}

function updateHud(now) {
  if (!ui || !renderer) return;
  if (now - hudClock < 240) return;
  hudClock = now;
  const scene = renderer.sceneTarget;
  ui.updateHud({
    distance: camera.distance,
    elevation: camera.elevation,
    fov: camera.fov,
    fps,
    resolution: scene ? `${scene.width}×${scene.height}` : '—',
    qualityScale: renderer.sceneScale,
  });
}

function frame(now) {
  animationId = requestAnimationFrame(frame);
  let dt = (now - lastFrameTime) / 1000;
  lastFrameTime = now;
  if (document.hidden) {
    return;
  }
  if (!Number.isFinite(dt) || dt < 0) dt = 0;
  dt = Math.min(dt, 0.09);

  if (!renderer) return;

  updateCamera(dt, now);
  simTime += dt * state.timeSpeed;
  updatePerformance(dt, now);
  updateHud(now);

  renderer.render(state, camera, simTime);

  if (pendingCapture) {
    finishCapture();
  }

  if (firstFrame) {
    firstFrame = false;
    appReady = true;
    window.setTimeout(finishLoading, 420);
  }
}

/* --------------------------------------------------------------------- boot */

async function boot() {
  await nextPaint();

  try {
    setLoadingProgress(0.03, '初始化 WebGL 2 上下文');
    renderer = new Renderer(canvas);
    await renderer.initialize(loadingStep);

    ui = new ObservationUI({
      state,
      handlers: {
        onChange: handleStateChange,
        onPreset: applyPreset,
        onResetView: () => resetView(true),
        onResetAll: resetAll,
        onSnapshot: captureFrame,
        onFullscreen: toggleFullscreen,
        onToggleUI: toggleUI,
      },
    });
    ui.mount();
    ui.setLive(true);

    setupInteraction();
    fitCanvas();

    // Warm up the scene with the current camera before revealing the deck.
    updateCamera(0, performance.now());
    renderer.render(state, camera, simTime);

    window.__GARGANTUA__ = {
      state,
      camera,
      renderer,
      ui,
      applyPreset(id) {
        const preset = PRESETS.find((item) => item.id === id);
        if (preset) {
          ui.markPreset(id);
          applyPreset(preset);
        }
      },
      setParam(key, value) {
        handleStateChange(key, value);
        ui.refreshAll();
      },
      resetView: () => resetView(true),
      snapshot: captureFrame,
      get fps() {
        return fps;
      },
      get ready() {
        return appReady;
      },
    };
    window.__GARGANTUA_READY__ = true;

    animationId = requestAnimationFrame(frame);
  } catch (error) {
    showFatalError(error);
  }
}

document.addEventListener('visibilitychange', () => {
  lastFrameTime = performance.now();
  lastFpsSampleTime = performance.now();
  fpsFrames = 0;
});

window.addEventListener('pagehide', () => {
  cancelAnimationFrame(animationId);
});

boot();
