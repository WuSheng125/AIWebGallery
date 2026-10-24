(function () {
  'use strict';

  const canvas = document.getElementById('view');
  const overlay = document.getElementById('overlay');
  const overlayText = document.getElementById('overlayText');
  const panel = document.getElementById('panel');
  const panelBody = document.getElementById('panelBody');
  const panelOpen = document.getElementById('panelOpen');
  const panelClose = document.getElementById('panelClose');
  const btnShot = document.getElementById('btnShot');
  const hint = document.getElementById('hint');
  const statFps = document.getElementById('statFps');
  const statRes = document.getElementById('statRes');
  const statState = document.getElementById('statState');

  function fail(msg) {
    overlayText.textContent = msg;
    overlay.classList.add('error');
  }

  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
  if (!gl) return fail('您的浏览器不支持 WebGL 2。');
  const ext = gl.getExtension('EXT_color_buffer_float');
  if (!ext) return fail('您的显卡不支持浮点渲染目标（EXT_color_buffer_float）。');

  const kpc = gl.getExtension('KHR_parallel_shader_compile');

  const P = {
    spin: 0.6,
    autoInner: true,
    rin: 1.8,
    rout: 20,
    temp: 6200,
    tempSlope: 0.55,
    bright: 1.6,
    falloff: 1.8,
    opacity: 0.9,
    turb: 0.75,
    speed: 1,
    doppler: 0,
    fov: 52,
    stars: 1,
    milky: 0.3,
    exposure: 1,
    bloom: 0.6,
    bloomRadius: 1,
    grain: 0.3,
    vignette: 0.4,
    quality: 1,
    resolution: 2,
  };

  const controls = new BH.OrbitControls(canvas);
  const renderer = new BH.Renderer(gl);

  let ready = false;
  renderer.compile().then(() => {
    overlay.classList.add('done');
    setTimeout(() => overlay.style.display = 'none', 1000);
    ready = true;
  }, err => {
    console.error(err);
    fail(err.message || '着色器编译失败。');
  });

  const ui = new BH.UI(panelBody, P, controls, renderer);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio, 2);
    const scale = [0.5, 0.75, 1][P.resolution] || 1;
    const w = Math.round(canvas.clientWidth * dpr * scale);
    const h = Math.round(canvas.clientHeight * dpr * scale);
    const maxPix = 2.4e6;
    const r = w * h > maxPix ? Math.sqrt(maxPix / (w * h)) : 1;
    canvas.width = Math.max(2, Math.round(w * r));
    canvas.height = Math.max(2, Math.round(h * r));
    renderer.setSize(canvas.width, canvas.height);
  }

  window.addEventListener('resize', () => resize());
  resize();

  let lastT = performance.now();
  let simTime = 0;
  let seed = Math.random();
  let shot = null;

  function render() {
    requestAnimationFrame(render);
    if (!ready) return;
    const now = performance.now();
    const dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    simTime = (simTime + dt * 12 * P.speed) % BH.Renderer.flowPeriod(P);

    const moved = controls.update(dt);
    const cam = controls.camera();

    // Optical axis shift to centre the view within the panel-free area. Panel is 344px, right-aligned.
    const panelHidden = document.body.classList.contains('panel-hidden');
    const panelW = panelHidden || window.innerWidth <= 760 ? 0 : 344;
    const freeW = canvas.clientWidth - panelW;
    const shiftX = -panelW / canvas.clientWidth;

    const result = renderer.render(P, cam, {
      now,
      phase: simTime / BH.Renderer.flowPeriod(P),
      seed,
      shift: [shiftX, 0],
      force: !!shot,
    });

    if (moved || result.moving) {
      renderer.adapt(now - lastT, now);
      if (hint && !hint.classList.contains('gone')) hint.classList.add('gone');
    }

    seed = (seed + 0.001) % 1;

    if (shot) {
      try {
        canvas.toBlob(blob => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `gargantua-${Date.now()}.png`;
          a.click();
          URL.revokeObjectURL(url);
        }, 'image/png');
      } catch (e) {
        console.error('截图失败：', e);
      }
      shot = null;
    }

    statFps.textContent = Math.round(1 / dt);
    statRes.textContent = `${result.width}×${result.height}`;
    statState.textContent = result.moving ? '移动中' : result.complete ? '完整' : `精细中 ${Math.round(result.progress * 100)}%`;
  }

  render();

  controls.onInteract = () => {
    ui._updateAll();
  };

  controls.onReset = () => {
    const preset = ui.schema.presets.items.find(it => it.type === 'preset').presets[0];
    controls.setView('az', preset.az, false);
    controls.setView('elev', preset.elev, false);
    controls.setView('dist', preset.dist, false);
    controls.setView('roll', preset.roll, false);
    P.fov = preset.fov;
    ui._updateAll();
  };

  panelOpen.addEventListener('click', () => document.body.classList.remove('panel-hidden'));
  panelClose.addEventListener('click', () => document.body.classList.add('panel-hidden'));
  btnShot.addEventListener('click', () => { shot = true; });

  document.addEventListener('keydown', e => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;
    if (e.key === 'h' || e.key === 'H') {
      document.body.classList.toggle('ui-hidden');
    } else if (e.key === 'f' || e.key === 'F') {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    } else if (e.key === 'r' || e.key === 'R') {
      controls.onReset();
    } else if (e.key === ' ') {
      e.preventDefault();
      controls.autoRotate = !controls.autoRotate;
      ui._updateAll();
    } else if (e.key === 'p' || e.key === 'P') {
      shot = true;
    }
  });

  gl.canvas.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    overlayText.textContent = 'WebGL 上下文丢失，请刷新页面。';
    overlay.classList.remove('done');
    overlay.classList.add('error');
    overlay.style.display = 'flex';
  });

  window.BH = window.BH || {};
  window.BH.P = P;
  window.BH.controls = controls;
  window.BH.renderer = renderer;
})();
