'use strict';

/* ================================================================
 *  主程序：WebGL 上下文、轨道相机、渲染循环、交互、自适应画质
 * ================================================================ */

(function () {

  /* ---------- DOM ---------- */
  var canvas = document.getElementById('glcanvas');
  var loadingEl = document.getElementById('loading');
  var fallbackEl = document.getElementById('fallback');
  var hudEl = document.getElementById('hud');

  var gl = null;
  try {
    gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance'
    });
  } catch (e) {
    gl = null;
  }
  if (!gl) {
    fallbackEl.style.display = 'flex';
    loadingEl.classList.add('done');
    return;
  }

  /* ---------- 工具 ---------- */
  function clamp(v, a, b) { return Math.min(Math.max(v, a), b); }

  /* ---------- 状态 ---------- */
  var params = Object.assign({}, UI_DEFAULTS);
  var urlq = new URLSearchParams(location.search);
  var FREEZE = urlq.get('freeze') === '1';   // 测试用：只渲染少量帧
  var FREEZE_FRAMES = clamp(parseInt(urlq.get('frames'), 10) || 3, 1, 5);

  var cam = { theta: -1.05, phi: 1.34, dist: 27, fov: 50 };
  var camT = { theta: -1.05, phi: 1.34, dist: 27 };

  /* ---------- 程序与渲染目标 ---------- */
  var rayProg = null;
  var bloom = null;
  try {
    rayProg = createProgram(gl, VS_QUAD, FS_RAYMARCH, 'raymarch');
    bloom = new BloomPipeline(gl);
  } catch (err) {
    console.error(err);
    fallbackEl.innerHTML = '着色器编译失败 / Shader compile failed<br><small>' +
      String(err && err.message ? err.message : err).replace(/</g, '&lt;') + '</small>';
    fallbackEl.style.display = 'flex';
    loadingEl.classList.add('done');
    return;
  }

  var rtScene = null;
  var sceneW = 2, sceneH = 2, bufW = 2, bufH = 2;
  var autoScale = 1.0;
  var contextLost = false;

  function effectiveScale() {
    return params.adaptive
      ? clamp(Math.min(params.renderScale, autoScale), 0.35, 1)
      : clamp(params.renderScale, 0.2, 1);
  }

  function resize() {
    if (contextLost) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var cssW = Math.max(2, window.innerWidth);
    var cssH = Math.max(2, window.innerHeight);
    bufW = Math.max(2, Math.round(cssW * dpr));
    bufH = Math.max(2, Math.round(cssH * dpr));
    // 显示尺寸完全交给 CSS（width/height:100%），只设置绘图缓冲
    if (canvas.width !== bufW) canvas.width = bufW;
    if (canvas.height !== bufH) canvas.height = bufH;

    var s = effectiveScale();
    sceneW = Math.max(2, Math.round(bufW * s));
    sceneH = Math.max(2, Math.round(bufH * s));
    if (rtScene) rtScene.dispose();
    rtScene = createFBO(gl, sceneW, sceneH, bloom.internalFormat, bloom.format, bloom.type);
    bloom.resize(sceneW, sceneH);
  }

  /* ---------- 轨道相机 ---------- */
  var eye = new Float32Array(3);
  var fwd = new Float32Array(3);
  var right = new Float32Array(3);
  var upv = new Float32Array(3);

  function updateCamera(dt) {
    if (params.autoRotate && !dragging) camT.theta += dt * 0.06;
    var k = 1 - Math.exp(-dt * 8.0);
    cam.theta += (camT.theta - cam.theta) * k;
    cam.phi += (camT.phi - cam.phi) * k;

    var minD = params.mass * 2.6 + 0.6;
    camT.dist = clamp(camT.dist, minD, 300);
    cam.dist += (camT.dist - cam.dist) * k;
    cam.fov += (params.fov - cam.fov) * k;

    var sp = Math.sin(cam.phi), cp = Math.cos(cam.phi);
    var st = Math.sin(cam.theta), ct = Math.cos(cam.theta);
    eye[0] = sp * ct * cam.dist;
    eye[1] = cp * cam.dist;
    eye[2] = sp * st * cam.dist;
    // 视线指向原点
    fwd[0] = -sp * ct; fwd[1] = -cp; fwd[2] = -sp * st;
    // right = normalize(cross(fwd, worldUp)) = (-fwd.z, 0, fwd.x)/sinφ
    var inv = 1 / Math.max(sp, 1e-5);
    right[0] = -fwd[2] * inv; right[1] = 0; right[2] = fwd[0] * inv;
    // up = cross(right, fwd)
    upv[0] = right[1] * fwd[2] - right[2] * fwd[1];
    upv[1] = right[2] * fwd[0] - right[0] * fwd[2];
    upv[2] = right[0] * fwd[1] - right[1] * fwd[0];
  }

  function resetCamera() {
    camT.theta = -1.05;
    camT.phi = 1.34;
    camT.dist = 27;
    params.fov = 50;
    refreshUI(params);
    setActivePreset(null);
  }

  /* ---------- 渲染 ---------- */
  var simPhase = 0;
  var realTime = 0;
  var loadingDone = false;

  function renderFrame(dt) {
    simPhase += dt * params.spin;
    realTime += dt;
    updateCamera(dt);

    var U = rayProg.uniforms;
    gl.useProgram(rayProg.program);
    gl.uniform3fv(U.uCamPos, eye);
    gl.uniform3fv(U.uCamRight, right);
    gl.uniform3fv(U.uCamUp, upv);
    gl.uniform3fv(U.uCamFwd, fwd);
    gl.uniform1f(U.uTanHalfFov, Math.tan(cam.fov * Math.PI / 360));
    gl.uniform1f(U.uAspect, sceneW / sceneH);
    gl.uniform1f(U.uPhase, simPhase);
    gl.uniform1f(U.uMass, params.mass);
    gl.uniform1f(U.uLensing, params.lensing);
    gl.uniform1f(U.uDiskInner, params.diskInner);
    gl.uniform1f(U.uDiskOuter, params.diskOuter);
    gl.uniform1f(U.uDiskBright, params.diskBright);
    gl.uniform1f(U.uDiskTemp, params.diskTemp);
    gl.uniform1f(U.uDoppler, params.doppler);
    gl.uniform1f(U.uDiskThick, params.diskThick);
    gl.uniform1f(U.uTilt, params.tilt * Math.PI / 180);
    gl.uniform1f(U.uStarDensity, params.starDensity);
    gl.uniform1f(U.uStarBright, params.starBright);
    gl.uniform1f(U.uNebula, params.nebula);
    gl.uniform1i(U.uSteps, params.steps | 0);

    gl.bindFramebuffer(gl.FRAMEBUFFER, rtScene.fb);
    gl.viewport(0, 0, sceneW, sceneH);
    drawFullscreen(gl);

    bloom.render({
      scene: rtScene.tex,
      w: sceneW, h: sceneH,
      outW: bufW, outH: bufH,
      params: params,
      time: realTime
    });

    if (!loadingDone) {
      loadingDone = true;
      if (FREEZE) loadingEl.style.transition = 'none';
      loadingEl.classList.add('done');
    }
  }

  /* ---------- 主循环 + 自适应画质 ---------- */
  var last = performance.now();
  var fps = 60, fpsAccum = 0, fpsFrames = 0, hudTimer = 0, adaptTimer = 0;

  function updateHUD() {
    hudEl.textContent = 'FPS ' + fps.toFixed(0) +
      ' · 屏幕 ' + bufW + '×' + bufH +
      ' · 渲染 ' + sceneW + '×' + sceneH +
      ' · 步进 ' + params.steps;
  }

  function loop(now) {
    requestAnimationFrame(loop);
    if (contextLost) { last = now; return; }
    var dt = (now - last) / 1000;
    last = now;
    if (!(dt > 0)) dt = 0.0001;
    if (dt > 0.1) dt = 0.016;

    renderFrame(dt);

    fpsAccum += dt; fpsFrames++; hudTimer += dt; adaptTimer += dt;
    if (hudTimer >= 0.5) {
      fps = fpsFrames / Math.max(fpsAccum, 1e-6);
      fpsAccum = 0; fpsFrames = 0; hudTimer = 0;
      updateHUD();
    }
    if (params.adaptive && adaptTimer >= 2.0) {
      adaptTimer = 0;
      if (fps < 40 && autoScale > 0.45) {
        autoScale = Math.max(0.45, autoScale - 0.15);
        resize();
      } else if (fps > 57 && autoScale < 1.0) {
        autoScale = Math.min(1.0, autoScale + 0.1);
        resize();
      }
    }
  }

  /* ---------- 交互：指针 / 滚轮 / 键盘 ---------- */
  var pointers = new Map();
  var dragging = false, lastX = 0, lastY = 0, pinchDist = 0;

  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    dragging = true;
    lastX = e.clientX; lastY = e.clientY;
    canvas.classList.add('dragging');
    if (pointers.size === 2) {
      var pts = Array.from(pointers.values());
      pinchDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
    }
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      var pts = Array.from(pointers.values());
      var d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (pinchDist > 0 && d > 0) camT.dist = clamp(camT.dist * (pinchDist / d), 0.5, 500);
      pinchDist = d;
      return;
    }
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    camT.theta -= dx * 0.0055;
    camT.phi = clamp(camT.phi - dy * 0.0055, 0.06, Math.PI - 0.06);
  });

  function endPointer(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) {
      dragging = false;
      canvas.classList.remove('dragging');
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    var f = Math.exp(clamp(e.deltaY, -120, 120) * 0.0016);
    camT.dist = clamp(camT.dist * f, 0.5, 500);
  }, { passive: false });

  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  window.addEventListener('keydown', function (e) {
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (e.key !== 'Escape') return;
    }
    var k = (e.key || '').toLowerCase();
    if (e.key === 'Escape') {
      document.body.classList.remove('ui-hidden');
    } else if (k === 'h') {
      document.body.classList.toggle('ui-hidden');
    } else if (k === 'r') {
      resetCamera();
    } else if (e.key === ' ' || e.code === 'Space') {
      e.preventDefault();
      params.autoRotate = !params.autoRotate;
      refreshUI(params);
      setActivePreset(null);
    }
  });

  /* ---------- UI 挂钩 ---------- */
  var hooks = {
    onParam: function (key) {
      setActivePreset(null);
      if (key === 'diskInner' || key === 'diskOuter') {
        if (params.diskOuter < params.diskInner + 1.5) {
          if (key === 'diskInner') params.diskOuter = params.diskInner + 1.5;
          else params.diskInner = params.diskOuter - 1.5;
        }
        refreshUI(params);
      }
      if (key === 'renderScale') resize();
      if (key === 'adaptive' && !params.adaptive) { autoScale = 1.0; resize(); }
    },
    onPreset: function (name) { applyPreset(name); },
    onResetParams: function () {
      Object.assign(params, UI_DEFAULTS);
      refreshUI(params);
      setActivePreset('gargantua');
      autoScale = 1.0;
      resize();
    },
    onResetCam: function () { resetCamera(); }
  };

  function applyPreset(name) {
    var p = UI_PRESETS[name];
    if (!p) return;
    Object.assign(params, p.params);
    if (p.camera) {
      camT.theta = p.camera.thetaDeg * Math.PI / 180;
      camT.phi = clamp(p.camera.phiDeg * Math.PI / 180, 0.06, Math.PI - 0.06);
      camT.dist = p.camera.dist;
    }
    refreshUI(params);
    setActivePreset(name);
    resize();
  }

  buildUI(params, hooks);
  document.getElementById('btnResetParams').addEventListener('click', hooks.onResetParams);
  document.getElementById('btnResetCam').addEventListener('click', hooks.onResetCam);
  document.getElementById('sbClose').addEventListener('click', function () {
    document.body.classList.add('sb-closed');
  });
  document.getElementById('sbOpen').addEventListener('click', function () {
    document.body.classList.remove('sb-closed');
  });

  /* ---------- URL 参数覆盖（便于测试与分享视角） ---------- */
  var presetApplied = false;
  if (urlq.has('preset')) { applyPreset(urlq.get('preset')); presetApplied = true; }
  if (urlq.has('steps')) params.steps = clamp(parseInt(urlq.get('steps'), 10) || 256, 32, 640);
  if (urlq.has('scale')) params.renderScale = clamp(parseFloat(urlq.get('scale')) || 0.75, 0.2, 1);
  if (urlq.has('fov')) params.fov = clamp(parseFloat(urlq.get('fov')) || 50, 25, 90);
  if (urlq.has('spin')) params.spin = Math.max(0, parseFloat(urlq.get('spin')) || 0);
  if (urlq.has('dist')) camT.dist = clamp(parseFloat(urlq.get('dist')) || 30, 2, 300);
  if (urlq.has('theta')) camT.theta = (parseFloat(urlq.get('theta')) || -60) * Math.PI / 180;
  if (urlq.has('phi')) camT.phi = clamp((parseFloat(urlq.get('phi')) || 77) * Math.PI / 180, 0.06, Math.PI - 0.06);
  if (urlq.has('autorotate')) params.autoRotate = urlq.get('autorotate') === '1';
  if (urlq.has('adaptive')) params.adaptive = urlq.get('adaptive') !== '0';
  if (urlq.get('ui') === '0') document.body.classList.add('ui-hidden');
  if (FREEZE || urlq.has('theta') || urlq.has('phi') || urlq.has('dist') || urlq.has('fov')) {
    // 立即对齐（跳过阻尼过渡，保证测试截图确定性）
    cam.theta = camT.theta;
    cam.phi = camT.phi;
    cam.dist = camT.dist;
    cam.fov = params.fov;
  }
  if (!presetApplied) setActivePreset('gargantua');
  refreshUI(params);

  /* ---------- 窗口事件 ---------- */
  var resizeTimer = 0;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(resize, 120);
  });

  canvas.addEventListener('webglcontextlost', function (e) {
    e.preventDefault();
    contextLost = true;
  });
  canvas.addEventListener('webglcontextrestored', function () {
    location.reload();
  });

  /* ---------- 启动 ---------- */
  resize();
  updateHUD();

  if (FREEZE) {
    // 测试模式：渲染少量帧后停止（无头截图 / 低功耗）
    var n = 0;
    var frozenLoop = function (now) {
      if (contextLost) return;
      var dt = (now - last) / 1000;
      last = now;
      if (!(dt > 0) || dt > 0.1) dt = 0.016;
      renderFrame(dt);
      updateHUD();
      n++;
      if (n < FREEZE_FRAMES) requestAnimationFrame(frozenLoop);
    };
    requestAnimationFrame(frozenLoop);
  } else {
    requestAnimationFrame(loop);
  }

})();
