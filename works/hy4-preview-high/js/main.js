/* =============================================================================
 *  js/main.js  ·  启动、参数联动、渲染循环、快捷键
 * ========================================================================== */
(function (global) {
  'use strict';

  var BH = global.BH;

  function $(id) { return document.getElementById(id); }

  /* ------------------------------------------------------------------ 状态 */
  var state = {};
  for (var k in BH.DEFAULTS) state[k] = BH.DEFAULTS[k];
  BH.state = state;

  var renderer = null;
  var statsTick = 0;

  /* ------------------------------------------------------------- 致命错误 */
  function fatal(msg) {
    var el = $('fatal');
    el.classList.remove('hidden');
    el.innerHTML = '<div class="fatal-inner"><h3>无法启动</h3><p>' + msg + '</p></div>';
    $('boot').classList.add('gone');
  }

  /* ------------------------------------------------------------ 联动逻辑 */
  function applyIsco() {
    if (state.followIsco) {
      state.diskInner = BH.iscoRadius(state.spin);
      BH.UI.sync('diskInner', state);
    }
  }

  function applyQuality(q) {
    var t = BH.QUALITY[q];
    if (!t) return;
    ['resolutionScale', 'steps', 'maxSamples', 'bloom'].forEach(function (key) {
      if (t[key] !== undefined) {
        state[key] = t[key];
        BH.UI.sync(key, state);
      }
    });
  }

  function onParamChange(key) {
    switch (key) {
      case 'quality':      applyQuality(state.quality); break;
      case 'spin':         applyIsco(); break;
      case 'followIsco':   applyIsco(); break;
      case 'cameraDistance':  if (renderer) renderer.cam.distance = state.cameraDistance; break;
      case 'cameraElevation': if (renderer) renderer.cam.elevation = state.cameraElevation; break;
    }
    if (renderer) renderer.invalidate();
  }

  /* ---------------------------------------------------------------- 预设 */
  function applyPreset(name) {
    var pr = BH.PRESETS[name];
    if (!pr) return;
    for (var key in pr.params) state[key] = pr.params[key];
    if (pr.after) pr.after(state);
    if (renderer) {
      renderer.cam.distance = state.cameraDistance;
      renderer.cam.elevation = state.cameraElevation;
    }
    BH.UI.syncAll(state);
    // 同步选中态
    var btns = document.querySelectorAll('.preset');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('is-active', btns[i].getAttribute('data-preset') === name);
      btns[i].setAttribute('aria-pressed', btns[i].getAttribute('data-preset') === name ? 'true' : 'false');
    }
    if (renderer) renderer.invalidate();
  }

  /* -------------------------------------------------------------- 状态栏 */
  function updateStats() {
    if (!renderer) return;
    var now = performance.now();
    if (now - statsTick < 420) return;
    statsTick = now;
    $('stat-fps').textContent = Math.round(renderer.fps) + ' FPS';
    $('stat-res').textContent = renderer.w + '×' + renderer.h +
      (renderer.adaptive < 0.99 ? ' (自动降级)' : '');
    $('stat-samples').textContent = '采样 ' + renderer.sampleCount + '/' + state.maxSamples;
  }

  /* -------------------------------------------------------------- 渲染循环 */
  var last = 0;
  function frame(now) {
    if (!last) last = now;
    var dt = Math.min(0.06, (now - last) / 1000);
    last = now;
    try {
      renderer.render(dt);
      renderer._adaptive(dt);
    } catch (e) {
      fatal('渲染时发生错误：' + e.message);
      return;
    }
    updateStats();
    requestAnimationFrame(frame);
  }

  /* ---------------------------------------------------------------- 启动 */
  function boot() {
    var canvas = $('gl-canvas');

    try {
      renderer = new BH.Renderer(canvas, state);
    } catch (e) {
      if (String(e.message).indexOf('WEBGL2') >= 0) {
        fatal('你的浏览器 / 显卡驱动没有提供可用的 <b>WebGL2</b>。请更新浏览器，或在浏览器设置中开启硬件加速后重试。');
      } else {
        fatal('着色器或 WebGL 初始化失败：<br><code>' + e.message + '</code>');
      }
      return;
    }
    BH.renderer = renderer;

    renderer.attachControls();
    renderer.cam.distance = state.cameraDistance;
    renderer.cam.elevation = state.cameraElevation;
    renderer.onCameraChange = function () {
      state.cameraDistance = renderer.cam.distance;
      state.cameraElevation = renderer.cam.elevation;
      BH.UI.sync('cameraDistance', state);
      BH.UI.sync('cameraElevation', state);
    };

    BH.UI.build($('sidebar-body'), state, onParamChange);
    BH.UI.syncAll(state);

    // 预设按钮
    var btns = document.querySelectorAll('.preset');
    for (var i = 0; i < btns.length; i++) {
      (function (b) {
        b.addEventListener('click', function () { applyPreset(b.getAttribute('data-preset')); });
      })(btns[i]);
    }
    applyPreset('interstellar');

    // 顶栏
    $('btn-shot').addEventListener('click', function () { takeShot(); });
    $('btn-reset').addEventListener('click', function () { applyPreset('interstellar'); });
    $('btn-about').addEventListener('click', function () { toggleAbout(true); });

    // 侧边栏折叠
    $('sidebar-toggle').addEventListener('click', function () {
      document.body.classList.toggle('sidebar-collapsed');
    });

    // 关于浮层
    $('about-close').addEventListener('click', function () { toggleAbout(false); });
    $('about-overlay').addEventListener('click', function (e) {
      if (e.target === $('about-overlay')) toggleAbout(false);
    });

    // 快捷键
    global.addEventListener('keydown', function (e) {
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
      var key = e.key.toLowerCase();
      if (key === 'h') {
        document.body.classList.toggle('ui-hidden');
      } else if (key === 'r') {
        applyPreset('interstellar');
      } else if (key === 's') {
        takeShot();
      } else if (key === 'escape') {
        toggleAbout(false);
      }
    });

    // 上下文丢失
    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      fatal('WebGL 上下文丢失（通常是 GPU 驱动重置或显存不足）。请刷新页面，并适当降低「渲染分辨率」与「光线步数」。');
    });

    // 首帧后隐藏加载遮罩
    requestAnimationFrame(function (t) {
      frame(t);
      setTimeout(function () { $('boot').classList.add('gone'); }, 260);
    });
  }

  function toggleAbout(show) {
    $('about-overlay').classList.toggle('hidden', !show);
  }

  function takeShot() {
    if (!renderer) return;
    var d = new Date();
    var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2) +
                '-' + ('0' + d.getHours()).slice(-2) + ('0' + d.getMinutes()).slice(-2) + ('0' + d.getSeconds()).slice(-2);
    renderer.screenshot('gargantua-' + stamp + '.png');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
