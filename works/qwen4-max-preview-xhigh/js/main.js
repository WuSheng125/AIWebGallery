/* ============================================================
 * GARGANTUA — 启动引导
 * 错误兜底 · 首帧揭幕 · 窗口缩放 · 运行时自检（?selftest=1）
 * ============================================================ */
(function () {
  'use strict';

  window.__errors = [];
  window.__bhReady = false;

  window.onerror = function (msg, src, line) {
    window.__errors.push(String(msg) + ' @ ' + (src || '') + ':' + (line || 0));
    if (!window.__bhReady) {
      showFatal('运行时错误：' + msg);
    }
    return false;
  };
  window.addEventListener('unhandledrejection', function (e) {
    window.__errors.push('Promise: ' + (e.reason && e.reason.message ? e.reason.message : String(e.reason)));
  });

  function showFatal(msg) {
    var loader = document.getElementById('loader');
    if (loader) loader.classList.add('done');
    var fatal = document.getElementById('fatal');
    var fatalMsg = document.getElementById('fatalMsg');
    if (fatalMsg) fatalMsg.textContent = msg;
    if (fatal) fatal.hidden = false;
  }

  function boot() {
    if (!window.THREE) {
      showFatal('three.js 未能加载。请确认 vendor/three.min.js 存在，或联网以使用 CDN 回退。');
      return;
    }
    var canvas = document.getElementById('scene');
    var engine;
    try {
      engine = new window.BH.Engine(canvas);
    } catch (err) {
      showFatal('WebGL 初始化失败：' + (err && err.message ? err.message : String(err)));
      return;
    }

    var ui;
    try {
      ui = window.BH.UI.init(engine);
    } catch (err) {
      showFatal('界面初始化失败：' + (err && err.message ? err.message : String(err)));
      return;
    }
    window.__bh = { engine: engine, ui: ui };

    engine.onFirstFrame = function () {
      window.__bhReady = true;
      var loader = document.getElementById('loader');
      loader.classList.add('done');
      setTimeout(function () { loader.hidden = true; }, 850);
    };
    engine.onContextLost = function () { ui.toast('WebGL 上下文丢失，正在等待恢复…'); };
    engine.onContextRestored = function () { ui.toast('WebGL 上下文已恢复'); };

    var resizeTimer = null;
    function onResize() {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { engine.resize(); }, 100);
    }
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);

    engine.start();

    var q = new URLSearchParams(window.location.search);
    if (q.get('preset')) ui.applyPreset(q.get('preset'), false);
    if (q.get('ui') === '0') document.body.classList.add('ui-hidden');
    window.__bhRunSelfTest = function () { runSelfTest(engine, ui); };
    if (q.get('selftest') === '1') runSelfTest(engine, ui);
  }

  /* ---------------- 运行时自检 ---------------- */
  function runSelfTest(engine, ui) {
    var log = [];
    var pass = 0, fail = 0;

    function check(name, fn) {
      try {
        var r = fn();
        if (r === false) throw new Error('断言为假');
        log.push('PASS  ' + name);
        pass++;
      } catch (e) {
        log.push('FAIL  ' + name + ' — ' + e.message);
        fail++;
      }
    }
    async function checkAsync(name, fn) {
      try {
        var r = await fn();
        if (r === false) throw new Error('断言为假');
        log.push('PASS  ' + name);
        pass++;
      } catch (e) {
        log.push('FAIL  ' + name + ' — ' + e.message);
        fail++;
      }
    }
    function frames(n) {
      return new Promise(function (res) {
        var c = 0;
        function f() { if (++c >= n) res(); else requestAnimationFrame(f); }
        requestAnimationFrame(f);
      });
    }

    (async function () {
      await frames(12);

      check('THREE 已加载', function () { return !!window.THREE; });
      check('渲染尺寸有效', function () { return engine.width > 2 && engine.height > 2; });
      log.push('INFO  viewport=' + window.innerWidth + 'x' + window.innerHeight +
        ' canvas=' + engine.canvas.clientWidth + 'x' + engine.canvas.clientHeight +
        ' internal=' + engine.width + 'x' + engine.height +
        ' dpr=' + window.devicePixelRatio + ' hdr=' + engine.hdr);
      check('首帧已完成', function () { return engine._firstFrameDone === true; });
      check('HDR 管线状态可知', function () { return typeof engine.hdr === 'boolean'; });

      var sliderKeys = Object.keys(ui.DEFS).filter(function (k) { return ui.DEFS[k].type === 'slider'; });
      check('滑块全行程扫描（' + sliderKeys.length + ' 项）', function () {
        sliderKeys.forEach(function (k) {
          var d = ui.DEFS[k];
          ui.setParam(k, d.min, { silent: true });
          ui.setParam(k, d.max, { silent: true });
          ui.setParam(k, d.value, { silent: true });
        });
        return true;
      });
      check('uniform 与状态同步', function () {
        return Math.abs(engine.uniforms.uRs.value - ui.state.mass) < 1e-6 &&
               Math.abs(engine.uniforms.uDiskTemp.value - ui.state.temp) < 1e-6;
      });
      check('内外缘联动约束', function () {
        ui.setParam('diskIn', 6, { silent: true });
        var ok = ui.state.diskOut >= ui.state.diskIn + 1.19;
        ui.setParam('diskIn', 3.1, { silent: true });
        ui.setParam('diskOut', 12.5, { silent: true });
        return ok;
      });

      for (var i = 0; i < ui.PRESETS.length; i++) {
        (function (p) {
          check('预设应用：' + p.name, function () {
            ui.applyPreset(p, false);
            return Object.keys(p.values).every(function (k) {
              return Math.abs(ui.state[k] - p.values[k]) < 1e-6;
            });
          });
        })(ui.PRESETS[i]);
      }

      check('随机参数生成', function () { ui.randomize(false); return true; });
      check('重置回默认', function () {
        ui.reset(false);
        return ui.state.temp === 5200 && ui.state.mass === 1;
      });

      /* 暂停：相位冻结；恢复：相位前进 */
      engine.setPaused(true);
      await frames(6);
      var p1 = engine.diskPhase;
      await frames(6);
      check('暂停冻结吸积相位', function () { return engine.diskPhase === p1; });
      engine.setPaused(false);
      await frames(8);
      check('恢复后相位前进', function () { return engine.diskPhase > p1; });

      /* 拖拽旋转 */
      check('指针拖拽改变方位角', function () {
        var t0 = engine.view.tTheta;
        var cv = engine.canvas;
        cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 200, clientY: 200, bubbles: true, cancelable: true }));
        cv.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 260, clientY: 215, bubbles: true, cancelable: true }));
        cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 260, clientY: 215, bubbles: true, cancelable: true }));
        return Math.abs(engine.view.tTheta - t0) > 1e-4;
      });

      /* 滚轮缩放 */
      check('滚轮缩小相机距离', function () {
        var r0 = engine.view.tRadius;
        engine.canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -240, bubbles: true, cancelable: true }));
        return engine.view.tRadius < r0;
      });

      /* 双指捏合 */
      check('双指捏合缩放', function () {
        var cv = engine.canvas;
        var r0 = engine.view.tRadius;
        cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 11, clientX: 200, clientY: 200, bubbles: true }));
        cv.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 12, clientX: 300, clientY: 200, bubbles: true }));
        cv.dispatchEvent(new PointerEvent('pointermove', { pointerId: 12, clientX: 380, clientY: 200, bubbles: true }));
        cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 11, clientX: 200, clientY: 200, bubbles: true }));
        cv.dispatchEvent(new PointerEvent('pointerup', { pointerId: 12, clientX: 380, clientY: 200, bubbles: true }));
        return engine.view.tRadius < r0;
      });

      check('画质档位切换', function () {
        engine.setQuality('low');
        var a = engine.uniforms.uSteps.value === 96;
        engine.setQuality('high');
        var b = engine.uniforms.uSteps.value === 208;
        engine.setQuality('medium');
        return a && b && engine.uniforms.uSteps.value === 144;
      });

      check('自适应分辨率开关', function () {
        ui.setParam('autoRes', false, { silent: true });
        var off = engine.autoRes === false;
        ui.setParam('autoRes', true, { silent: true });
        return off && engine.autoRes === true;
      });

      check('相机视角设定', function () {
        engine.setCameraView({ incl: 30, dist: 25 }, false);
        return Math.abs(engine.view.radius - 25) < 0.01 &&
               Math.abs((90 - engine.view.phi * 180 / Math.PI) - 30) < 0.01;
      });

      check('FOV 生效', function () {
        ui.setParam('fov', 70, { silent: true });
        var ok = Math.abs(engine.camera.fov - 70) < 1e-6;
        ui.setParam('fov', 55, { silent: true });
        return ok;
      });

      check('窗口缩放处理', function () { engine.resize(); return engine.width > 2 && engine.height > 2; });

      await checkAsync('截图导出 PNG', function () {
        return new Promise(function (res) {
          engine.requestShot(function (err, url) {
            res(!err && typeof url === 'string' && url.indexOf('data:image/png') === 0 && url.length > 2000);
          });
        });
      });

      check('弹窗开合', function () {
        ui.openAbout();
        var open = !document.getElementById('aboutModal').hidden;
        ui.closeAbout();
        return open && document.getElementById('aboutModal').hidden;
      });

      check('界面显隐', function () {
        document.body.classList.add('ui-hidden');
        var hidden = document.body.classList.contains('ui-hidden');
        document.body.classList.remove('ui-hidden');
        return hidden;
      });

      await frames(6);
      check('无运行时错误', function () {
        if (window.__errors.length) throw new Error(window.__errors.join(' | '));
        return true;
      });

      /* 恢复默认视图 */
      ui.reset(false);

      var pre = document.getElementById('selftest');
      pre.hidden = false;
      pre.textContent = log.join('\n') + '\n\nTOTAL: ' + pass + ' pass / ' + fail + ' fail';
      document.title = 'SELFTEST ' + (fail === 0 ? 'PASS' : 'FAIL') + ' ' + pass + '/' + (pass + fail);
      window.__selftestDone = true;
      window.__selftestResult = { pass: pass, fail: fail, log: log };
    })();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();