/* =========================================================================
 * main.js — 卡冈图雅黑洞可视化 · 渲染管线 / 相机 / UI
 * 零依赖 WebGL2 实现：
 *   场景(测地线光线弯曲) -> 亮部提取/降采样 -> 高斯泛光 -> ACES 合成
 * ========================================================================= */
(function () {
  'use strict';

  var S = window.BH_SHADERS;

  /* ============================ 参数与预设 ============================ */

  var params = {
    // 黑洞
    mass: 1.0,          // 质量（×10⁸ M☉），决定视界尺度
    spin: 0.62,         // 自旋 a*
    lensing: 1.0,       // 引力透镜强度
    // 吸积盘
    diskTemp: 9500,     // 内缘温度 K
    diskBright: 1.2,
    diskOpacity: 0.92,
    diskOuter: 12.0,    // 外缘（史瓦西半径单位）
    diskSpeed: 1.0,
    turb: 0.55,
    beaming: 0.62,
    diskThick: 0.6,
    glow: 0.32,
    diskOn: 1,
    // 星空
    starBright: 1.0,
    starDensity: 0.28,
    starsOn: 1,
    // 渲染
    fov: 17,            // 垂直视场角（度）
    exposure: 1.18,
    bloom: 0.55,
    renderScale: 0.9,
    quality: 220,       // 测地线积分步数
    adaptive: 1,
    autoRotate: 0
  };

  var PRESETS = {
    gargantua: {
      label: '卡冈图雅',
      values: {
        mass: 1.0, spin: 0.62, lensing: 1.0, diskTemp: 9500, diskBright: 1.2,
        diskOpacity: 0.92, diskOuter: 12.0, diskSpeed: 1.0, turb: 0.55,
        beaming: 0.62, diskThick: 0.6, glow: 0.32, diskOn: 1,
        starBright: 1.0, starDensity: 0.28, starsOn: 1,
        fov: 17, exposure: 1.18, bloom: 0.55, quality: 220
      },
      view: { yaw: -28, pitch: 11, dist: 38 }
    },
    sgra: {
      label: '人马座 A*',
      values: {
        mass: 0.45, spin: 0.92, lensing: 1.0, diskTemp: 13500, diskBright: 1.45,
        diskOpacity: 0.88, diskOuter: 11.0, diskSpeed: 1.55, turb: 0.7,
        beaming: 0.75, diskThick: 0.65, glow: 0.42, diskOn: 1,
        starBright: 1.15, starDensity: 0.32, starsOn: 1,
        fov: 19, exposure: 1.05, bloom: 0.62, quality: 220
      },
      view: { yaw: -28, pitch: 8, dist: 26 }
    },
    m87: {
      label: 'M87*',
      values: {
        mass: 2.2, spin: 0.9, lensing: 1.0, diskTemp: 5200, diskBright: 1.05,
        diskOpacity: 0.97, diskOuter: 18.0, diskSpeed: 0.55, turb: 0.5,
        beaming: 0.35, diskThick: 1.5, glow: 0.85, diskOn: 1,
        starBright: 0.8, starDensity: 0.22, starsOn: 1,
        fov: 22, exposure: 1.2, bloom: 0.42, quality: 220
      },
      view: { yaw: -28, pitch: 26, dist: 60 }
    },
    nolens: {
      label: '弱透镜对比',
      values: {
        mass: 1.0, spin: 0.0, lensing: 0.0, diskTemp: 9500, diskBright: 1.2,
        diskOpacity: 0.92, diskOuter: 12.0, diskSpeed: 1.0, turb: 0.55,
        beaming: 0.62, diskThick: 0.6, glow: 0.32, diskOn: 1,
        starBright: 1.0, starDensity: 0.28, starsOn: 1,
        fov: 17, exposure: 1.18, bloom: 0.45, quality: 220
      },
      view: { yaw: -28, pitch: 11, dist: 38 }
    }
  };

  /* ============================ DOM ============================ */

  var canvas = document.getElementById('gl');
  var hudFps = document.getElementById('hud-fps');
  var hudRes = document.getElementById('hud-res');
  var hudM = document.getElementById('hud-mass');
  var hudRs = document.getElementById('hud-rs');
  var errBox = document.getElementById('glerror');

  function showError(msg) {
    if (!errBox) return;
    errBox.style.display = 'block';
    errBox.textContent = msg;
  }

  /* ============================ WebGL 初始化 ============================ */

  var gl = canvas.getContext('webgl2', {
    antialias: false,
    alpha: false,
    depth: false,
    stencil: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false
  });
  if (!gl) {
    showError('无法创建 WebGL2 上下文。请使用支持 WebGL2 的现代浏览器（Chrome / Edge / Firefox / Safari 16+），并确认已开启硬件加速。');
    return;
  }
  var hasFloat = !!gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');

  function compile(type, src, name) {
    var sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
      var log = gl.getShaderInfoLog(sh);
      showError('着色器编译失败 [' + name + ']:\n' + log);
      throw new Error(name + ': ' + log);
    }
    return sh;
  }

  function program(vsSrc, fsSrc, name) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc, name + '.vs'));
    gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc, name + '.fs'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      var log = gl.getProgramInfoLog(p);
      showError('着色器链接失败 [' + name + ']:\n' + log);
      throw new Error(name + ': ' + log);
    }
    return p;
  }

  var progScene, progBright, progBlur, progComp;
  try {
    progScene = program(S.VS_QUAD, S.FS_SCENE, 'scene');
    progBright = program(S.VS_QUAD, S.FS_BRIGHT, 'bright');
    progBlur = program(S.VS_QUAD, S.FS_BLUR, 'blur');
    progComp = program(S.VS_QUAD, S.FS_COMPOSITE, 'composite');
  } catch (e) {
    return;
  }

  function uniforms(prog, names) {
    var o = {};
    for (var i = 0; i < names.length; i++) o[names[i]] = gl.getUniformLocation(prog, names[i]);
    return o;
  }

  var uScene = uniforms(progScene, [
    'uRes', 'uTime', 'uCamPos', 'uCamRight', 'uCamUp', 'uCamFwd', 'uTanFov',
    'uRs', 'uLensing', 'uSpin', 'uDiskIn', 'uDiskOut', 'uDiskTemp', 'uDiskBright',
    'uDiskOpacity', 'uDiskSpeed', 'uBeaming', 'uDiskThick', 'uGlow', 'uTurb',
    'uStarBright', 'uStarDensity', 'uSteps', 'uDiskOn', 'uStarsOn'
  ]);
  var uBright = uniforms(progBright, ['uTex', 'uTexel', 'uThreshold', 'uKnee']);
  var uBlur = uniforms(progBlur, ['uTex', 'uDir']);
  var uComp = uniforms(progComp, ['uScene', 'uBloom', 'uBloomStrength', 'uExposure']);

  var vao = gl.createVertexArray();

  /* ============================ 帧缓冲 ============================ */

  function makeTarget(w, h) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    var internal = hasFloat ? gl.RGBA16F : gl.RGBA8;
    var type = hasFloat ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    var ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex: tex, fbo: fbo, w: w, h: h, ok: ok };
  }

  function destroyTarget(t) {
    if (!t) return;
    gl.deleteTexture(t.tex);
    gl.deleteFramebuffer(t.fbo);
  }

  var sceneT = null, bloomA = null, bloomB = null;
  var bufW = 0, bufH = 0;

  function ensureTargets(w, h) {
    if (w === bufW && h === bufH && sceneT && sceneT.ok) return;
    destroyTarget(sceneT); destroyTarget(bloomA); destroyTarget(bloomB);
    bufW = w; bufH = h;
    sceneT = makeTarget(w, h);
    var hw = Math.max(1, w >> 1), hh = Math.max(1, h >> 1);
    bloomA = makeTarget(hw, hh);
    bloomB = makeTarget(hw, hh);
    if (!sceneT.ok || !bloomA.ok || !bloomB.ok) {
      showError('帧缓冲创建失败（FBO incomplete）。请更新显卡驱动后重试。');
    }
  }

  /* ============================ 相机 ============================ */

  var DEG = Math.PI / 180;
  var cam = { yaw: -28 * DEG, pitch: 11 * DEG, dist: 38 };

  // URL 参数覆盖（调试/分享）：如 index.html?glow=0&starsOn=0&pitch=15&dist=30
  (function () {
    try {
      var q = new URLSearchParams(window.location.search);
      q.forEach(function (v, k) {
        var n = parseFloat(v);
        if (!isFinite(n)) return;
        if (k in params) { params[k] = n; return; }
        if (k === 'yaw') cam.yaw = n * DEG;
        else if (k === 'pitch') cam.pitch = n * DEG;
        else if (k === 'dist') cam.dist = n;
      });
    } catch (e) { /* 忽略 */ }
  })();

  function rsScale() {
    // 质量(×10⁸ M☉) -> 视界尺度（世界单位），质量越大视界越大
    return Math.max(0.18, params.mass);
  }

  function camVectors() {
    var cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    var cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    var px = cam.dist * cp * sy;
    var py = cam.dist * sp;
    var pz = cam.dist * cp * cy;
    var fl = Math.sqrt(px * px + py * py + pz * pz);
    var fx = -px / fl, fy = -py / fl, fz = -pz / fl;
    // right = normalize(cross(fwd, up))，up = (0,1,0)
    var rx = fz, ry = 0, rz = -fx;
    var rl = Math.sqrt(rx * rx + rz * rz) || 1;
    rx /= rl; rz /= rl;
    var ux = ry * fz - rz * fy;
    var uy = rz * fx - rx * fz;
    var uz = rx * fy - ry * fx;
    return {
      pos: [px, py, pz],
      fwd: [fx, fy, fz],
      right: [rx, ry, rz],
      up: [ux, uy, uz]
    };
  }

  /* ============================ 输入 ============================ */

  var dragging = false, lastX = 0, lastY = 0, activePointer = null;

  canvas.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'touch' && activePointer !== null) return;
    dragging = true;
    activePointer = e.pointerId;
    lastX = e.clientX; lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });

  canvas.addEventListener('pointermove', function (e) {
    if (!dragging || e.pointerId !== activePointer) return;
    var dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    cam.yaw += dx * 0.0042;
    cam.pitch += dy * 0.0032;
    var lim = 88 * DEG;
    cam.pitch = Math.max(-lim, Math.min(lim, cam.pitch));
  });

  function endDrag(e) {
    if (e.pointerId !== activePointer) return;
    dragging = false;
    activePointer = null;
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    cam.dist *= Math.exp(e.deltaY * 0.0011);
    clampDist();
  }, { passive: false });

  function clampDist() {
    var min = Math.max(2.2 * rsScale(), 1.6);
    var max = 80;
    cam.dist = Math.max(min, Math.min(max, cam.dist));
  }

  canvas.addEventListener('dblclick', function () { resetView(); });

  // 触屏双指缩放
  var pinchDist = 0;
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      pinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinchDist > 0) {
      var dx = e.touches[0].clientX - e.touches[1].clientX;
      var dy = e.touches[0].clientY - e.touches[1].clientY;
      var d = Math.sqrt(dx * dx + dy * dy);
      cam.dist *= pinchDist / Math.max(d, 1);
      pinchDist = d;
      clampDist();
      e.preventDefault();
    }
  }, { passive: false });

  function resetView() {
    cam.yaw = -28 * DEG;
    cam.pitch = 11 * DEG;
    cam.dist = 38;
    clampDist();
  }

  /* ============================ UI 绑定 ============================ */

  // 控件 id -> 参数键
  var BINDINGS = {
    'in-mass': 'mass', 'in-spin': 'spin', 'in-lensing': 'lensing',
    'in-temp': 'diskTemp', 'in-bright': 'diskBright', 'in-opacity': 'diskOpacity',
    'in-outer': 'diskOuter', 'in-speed': 'diskSpeed', 'in-turb': 'turb',
    'in-beaming': 'beaming', 'in-thick': 'diskThick', 'in-glow': 'glow',
    'in-starbright': 'starBright', 'in-stardensity': 'starDensity',
    'in-fov': 'fov',
    'in-exposure': 'exposure', 'in-bloom': 'bloom', 'in-scale': 'renderScale',
    'in-quality': 'quality'
  };
  var TOGGLES = {
    'tg-disk': 'diskOn', 'tg-stars': 'starsOn',
    'tg-adaptive': 'adaptive', 'tg-rotate': 'autoRotate'
  };

  function fmt(id, v) {
    switch (id) {
      case 'in-mass': return v.toFixed(2) + ' ×10⁸ M☉';
      case 'in-spin': return v.toFixed(3);
      case 'in-lensing': return v.toFixed(2) + '×';
      case 'in-temp': return Math.round(v) + ' K';
      case 'in-outer': return v.toFixed(1) + ' rₛ';
      case 'in-speed': return v.toFixed(2) + '×';
      case 'in-fov': return v.toFixed(0) + '°';
      case 'in-scale': return Math.round(v * 100) + '%';
      default: return v.toFixed(2);
    }
  }

  function syncControls() {
    for (var id in BINDINGS) {
      var el = document.getElementById(id);
      if (el) {
        el.value = String(params[BINDINGS[id]]);
        var out = document.getElementById(id + '-v');
        if (out) out.textContent = fmt(id, params[BINDINGS[id]]);
      }
    }
    for (var tid in TOGGLES) {
      var t = document.getElementById(tid);
      if (t) t.classList.toggle('on', params[TOGGLES[tid]] > 0.5);
    }
    updateMassHud();
  }

  for (var id in BINDINGS) {
    (function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('input', function () {
        var v = parseFloat(el.value);
        if (!isFinite(v)) return;
        params[BINDINGS[id]] = v;
        var out = document.getElementById(id + '-v');
        if (out) out.textContent = fmt(id, v);
        if (id === 'in-mass') { clampDist(); updateMassHud(); }
      });
    })(id);
  }

  for (var tid in TOGGLES) {
    (function (tid) {
      var el = document.getElementById(tid);
      if (!el) return;
      el.addEventListener('click', function () {
        params[TOGGLES[tid]] = params[TOGGLES[tid]] > 0.5 ? 0 : 1;
        el.classList.toggle('on', params[TOGGLES[tid]] > 0.5);
      });
    })(tid);
  }

  function applyPreset(key) {
    var p = PRESETS[key];
    if (!p) return;
    for (var k in p.values) params[k] = p.values[k];
    if (p.view) {
      cam.yaw = p.view.yaw * DEG;
      cam.pitch = p.view.pitch * DEG;
      cam.dist = p.view.dist;
    }
    clampDist();
    syncControls();
  }

  var presetBtns = document.querySelectorAll('[data-preset]');
  for (var i = 0; i < presetBtns.length; i++) {
    (function (btn) {
      btn.addEventListener('click', function () {
        applyPreset(btn.getAttribute('data-preset'));
        for (var j = 0; j < presetBtns.length; j++) {
          presetBtns[j].classList.toggle('active', presetBtns[j] === btn);
        }
      });
    })(presetBtns[i]);
  }

  var btnReset = document.getElementById('btn-reset');
  if (btnReset) btnReset.addEventListener('click', resetView);

  var panel = document.getElementById('panel');
  var panelToggle = document.getElementById('panel-toggle');
  if (panelToggle) {
    panelToggle.addEventListener('click', function () {
      panel.classList.toggle('collapsed');
    });
  }

  // 质量信息
  function updateMassHud() {
    var m = params.mass * 1e8;               // M☉
    var rsKm = 2.953 * m;                    // rs = 2GM/c² ≈ 2.953 km × (M/M☉)
    var rsAU = rsKm / 1.496e8;
    if (hudM) hudM.textContent = '质量 ≈ ' + (m / 1e8).toFixed(2) + '×10⁸ M☉';
    if (hudRs) {
      hudRs.textContent = '视界半径 rₛ ≈ ' +
        (rsAU >= 0.1 ? rsAU.toFixed(2) + ' AU' : (rsKm / 1e6).toFixed(2) + ' 百万km');
    }
  }

  /* ============================ 渲染循环 ============================ */

  var timeSec = 0;
  var lastT = 0;
  var frames = 0, fpsAcc = 0, fps = 60, lastFpsT = 0;
  var scaleCur = params.renderScale;
  var running = true;

  function resize() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = Math.max(2, Math.round(canvas.clientWidth * dpr * scaleCur));
    var h = Math.max(2, Math.round(canvas.clientHeight * dpr * scaleCur));
    if (w !== canvas.width || h !== canvas.height) {
      canvas.width = w;
      canvas.height = h;
    }
    ensureTargets(w, h);
    if (hudRes) hudRes.textContent = w + ' × ' + h;
  }

  function drawQuad() {
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function render(now) {
    if (!running) return;
    requestAnimationFrame(render);

    if (!lastT) lastT = now;
    var dt = Math.min((now - lastT) / 1000, 0.1);
    lastT = now;
    if (dt > 0) {
      frames++;
      fpsAcc += dt;
      if (fpsAcc > 0.5) {
        fps = frames / fpsAcc;
        frames = 0; fpsAcc = 0;
        if (hudFps) hudFps.textContent = Math.round(fps) + ' FPS';
        // 自适应分辨率
        if (params.adaptive > 0.5) {
          if (fps < 26 && scaleCur > 0.5) {
            scaleCur = Math.max(0.5, scaleCur * 0.9);
            resize();
          } else if (fps > 55 && scaleCur < params.renderScale) {
            scaleCur = Math.min(params.renderScale, scaleCur * 1.06);
            resize();
          }
        } else if (Math.abs(scaleCur - params.renderScale) > 0.001) {
          scaleCur = params.renderScale;
          resize();
        }
      }
    }

    if (params.autoRotate > 0.5 && !dragging) {
      cam.yaw += dt * 0.045;
    }

    timeSec = (timeSec + dt) % 600;

    var rs = rsScale();
    clampDist();

    // ---- Pass 1: 场景（测地线光线弯曲） ----
    var cv = camVectors();
    gl.bindFramebuffer(gl.FRAMEBUFFER, sceneT.fbo);
    gl.viewport(0, 0, bufW, bufH);
    gl.useProgram(progScene);
    gl.uniform2f(uScene.uRes, bufW, bufH);
    gl.uniform1f(uScene.uTime, timeSec);
    gl.uniform3fv(uScene.uCamPos, cv.pos);
    gl.uniform3fv(uScene.uCamRight, cv.right);
    gl.uniform3fv(uScene.uCamUp, cv.up);
    gl.uniform3fv(uScene.uCamFwd, cv.fwd);
    gl.uniform1f(uScene.uTanFov, Math.tan(params.fov * 0.5 * DEG));
    gl.uniform1f(uScene.uRs, rs);
    gl.uniform1f(uScene.uLensing, params.lensing);
    gl.uniform1f(uScene.uSpin, params.spin);
    gl.uniform1f(uScene.uDiskIn, Math.max(1.15, iscoRs(params.spin)) * rs);
    gl.uniform1f(uScene.uDiskOut, params.diskOuter * rs);
    gl.uniform1f(uScene.uDiskTemp, params.diskTemp);
    gl.uniform1f(uScene.uDiskBright, params.diskBright);
    gl.uniform1f(uScene.uDiskOpacity, params.diskOpacity);
    gl.uniform1f(uScene.uDiskSpeed, params.diskSpeed);
    gl.uniform1f(uScene.uBeaming, params.beaming);
    gl.uniform1f(uScene.uDiskThick, params.diskThick);
    gl.uniform1f(uScene.uGlow, params.glow);
    gl.uniform1f(uScene.uTurb, params.turb);
    gl.uniform1f(uScene.uStarBright, params.starBright);
    gl.uniform1f(uScene.uStarDensity, params.starDensity);
    gl.uniform1i(uScene.uSteps, params.quality | 0);
    gl.uniform1f(uScene.uDiskOn, params.diskOn);
    gl.uniform1f(uScene.uStarsOn, params.starsOn);
    drawQuad();

    // ---- Pass 2-5: 泛光（亮部提取 + 两次可分离模糊） ----
    var bloomStrength = params.bloom;
    if (bloomStrength > 0.002) {
      gl.useProgram(progBright);
      gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
      gl.viewport(0, 0, bloomA.w, bloomA.h);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
      gl.uniform1i(uBright.uTex, 0);
      gl.uniform2f(uBright.uTexel, 1 / bufW, 1 / bufH);
      gl.uniform1f(uBright.uThreshold, hasFloat ? 1.05 : 0.42);
      gl.uniform1f(uBright.uKnee, 0.55);
      drawQuad();

      gl.useProgram(progBlur);
      gl.uniform1i(uBlur.uTex, 0);
      for (var it = 0; it < 2; it++) {
        // 水平
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomB.fbo);
        gl.viewport(0, 0, bloomB.w, bloomB.h);
        gl.bindTexture(gl.TEXTURE_2D, bloomA.tex);
        gl.uniform2f(uBlur.uDir, 1.35 / bloomA.w, 0);
        drawQuad();
        // 垂直
        gl.bindFramebuffer(gl.FRAMEBUFFER, bloomA.fbo);
        gl.viewport(0, 0, bloomA.w, bloomA.h);
        gl.bindTexture(gl.TEXTURE_2D, bloomB.tex);
        gl.uniform2f(uBlur.uDir, 0, 1.35 / bloomA.h);
        drawQuad();
      }
    }

    // ---- Pass 6: 合成 + ACES ----
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(progComp);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.uniform1i(uComp.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomStrength > 0.002 ? bloomA.tex : sceneT.tex);
    gl.uniform1i(uComp.uBloom, 1);
    gl.uniform1f(uComp.uBloomStrength, bloomStrength > 0.002 ? bloomStrength : 0.0);
    gl.uniform1f(uComp.uExposure, params.exposure);
    drawQuad();
    gl.activeTexture(gl.TEXTURE0);
  }

  /* ---------- Kerr 顺行 ISCO（史瓦西半径单位） ---------- */
  function iscoRs(a) {
    a = Math.max(0, Math.min(0.998, a));
    var a2 = a * a;
    var z1 = 1 + Math.cbrt(1 - a2) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
    var z2 = Math.sqrt(3 * a2 + z1 * z1);
    var rM = 3 + z2 - Math.sqrt(Math.max(0, (3 - z1) * (3 + z1 + 2 * z2)));
    return Math.max(0.58, rM / 2);   // M 单位 -> rₛ 单位（rₛ = 2M）
  }

  /* ============================ 启动 ============================ */

  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      running = false;
    } else if (!running) {
      running = true;
      lastT = 0;
      requestAnimationFrame(render);
    }
  });

  window.addEventListener('resize', function () {
    scaleCur = params.renderScale;
    resize();
  });

  syncControls();
  resize();
  requestAnimationFrame(render);
})();
