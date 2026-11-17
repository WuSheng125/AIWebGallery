/* ============================================================
   main.js — 应用入口：渲染管线 / 参数 UI / 预设 / 交互
   管线：场景(HDR) → 亮度提取 → 多级降采样 → tent 上采样(加性)
         → 合成(ACES + 暗角 + 颗粒 + 色散)
   ============================================================ */
'use strict';

(() => {
  const $ = (id) => document.getElementById(id);
  const canvas = $('view');
  const urlq = new URLSearchParams(location.search);
  const errors = [];
  window.addEventListener('error', (e) => errors.push(String(e.message)));

  /* ---------------- 参数 ---------------- */
  const DEFAULTS = {
    fov: 55, autoRotate: true, rotSpeed: 0.03, timeScale: 1,
    diskIn: 3.0, diskOut: 12.0, diskTemp: 5000, diskBright: 2.6,
    thickness: 0.12, turb: 0.75, spin: 1.0,
    beaming: 0.30, lensing: 1.0,
    starBright: 1.3, bloom: 0.70, exposure: 1.0,
    quality: 'med',
  };
  const params = { ...DEFAULTS };

  const QUALITY = {
    low:  { label: '流畅', scale: 0.55, stepK: 0.130, steps: 120, levels: 4 },
    med:  { label: '均衡', scale: 0.80, stepK: 0.085, steps: 190, levels: 5 },
    high: { label: '极致', scale: 1.00, stepK: 0.055, steps: 300, levels: 5 },
  };

  const PRESETS = {
    movie: {
      label: '卡冈图雅',
      values: { ...DEFAULTS },
      cam: { yaw: 0.55, pitch: 0.09, dist: 19 },
    },
    physical: {
      label: '物理真实',
      values: {
        ...DEFAULTS, diskTemp: 6500, diskBright: 2.8, thickness: 0.05,
        turb: 0.95, beaming: 1.0, bloom: 0.60, exposure: 1.0, spin: 1.2,
      },
      cam: { yaw: 0.55, pitch: 0.38, dist: 16 },
    },
    newton: {
      label: '牛顿视角',
      values: { ...DEFAULTS, lensing: 0.0, beaming: 0.25 },
      cam: { yaw: 0.55, pitch: 0.09, dist: 19 },
    },
  };

  /* ---------------- 全局状态 ---------------- */
  let gl, floatOK = false, anisoExt = null;
  let sceneProg, brightProg, downProg, upProg, compProg, quad;
  let sceneT = null, bloomT = [];
  let starTex = null;
  let W = 2, H = 2;
  let simTime = 0, lastT = 0, frames = 0, fpsEma = 60, hudTimer = 0;
  let lowFpsTime = 0, lowFpsWarned = false;
  const camera = new OrbitCamera();
  const controls = {};   // key -> refresh()
  let activePreset = 'movie';

  /* ---------------- 错误处理 ---------------- */
  function fatal(msg) {
    $('loading').classList.add('done');
    $('fatalMsg').textContent = msg;
    $('fatal').hidden = false;
    errors.push(msg);
  }

  /* ---------------- WebGL 初始化 ---------------- */
  function initGL() {
    gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      powerPreference: 'high-performance', preserveDrawingBuffer: false,
    });
    if (!gl) { fatal('当前浏览器不支持 WebGL2。'); return false; }
    floatOK = !!gl.getExtension('EXT_color_buffer_float');
    anisoExt = gl.getExtension('EXT_texture_filter_anisotropic');
    try {
      sceneProg  = GLU.program(gl, SHADERS.quadVS, SHADERS.sceneFS);
      brightProg = GLU.program(gl, SHADERS.quadVS, SHADERS.brightFS);
      downProg   = GLU.program(gl, SHADERS.quadVS, SHADERS.downFS);
      upProg     = GLU.program(gl, SHADERS.quadVS, SHADERS.upFS);
      compProg   = GLU.program(gl, SHADERS.quadVS, SHADERS.compositeFS);
    } catch (e) {
      fatal(e.message);
      return false;
    }
    quad = GLU.makeQuad(gl);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      fatal('WebGL 上下文丢失，请刷新页面。');
    });
    return true;
  }

  /* ---------------- 分辨率 / 渲染目标 ---------------- */
  function resize() {
    const q = QUALITY[params.quality];
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(2, Math.floor(window.innerWidth * dpr * q.scale));
    H = Math.max(2, Math.floor(window.innerHeight * dpr * q.scale));
    canvas.width = W; canvas.height = H;

    GLU.disposeTarget(gl, sceneT);
    bloomT.forEach((t) => GLU.disposeTarget(gl, t));
    bloomT = [];
    sceneT = GLU.target(gl, W, H, { float: floatOK });
    for (let i = 0; i < q.levels; i++) {
      const w = Math.max(1, W >> (i + 1));
      const h = Math.max(1, H >> (i + 1));
      bloomT.push(GLU.target(gl, w, h, { float: floatOK }));
    }
    $('hudRes').textContent = `${W}×${H}`;
  }

  /* ---------------- 星空纹理 ---------------- */
  function uploadStars(cv) {
    starTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, starTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.SRGB8_ALPHA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (anisoExt) {
      const max = gl.getParameter(anisoExt.MAX_TEXTURE_MAX_ANISOTROPY_EXT);
      gl.texParameterf(gl.TEXTURE_2D, anisoExt.TEXTURE_MAX_ANISOTROPY_EXT, Math.min(8, max));
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  }

  /* ---------------- 渲染 ---------------- */
  function renderFrame() {
    const q = QUALITY[params.quality];
    const u = sceneProg.u;

    gl.disable(gl.BLEND);

    /* 1. 场景（HDR） */
    GLU.bindTarget(gl, sceneT);
    gl.useProgram(sceneProg);
    gl.uniform2f(u.uRes, W, H);
    gl.uniform3fv(u.uCamPos, camera.pos);
    gl.uniformMatrix3fv(u.uCamBasis, false, camera.basis);
    gl.uniform1f(u.uTanFov, Math.tan((params.fov * Math.PI / 180) / 2));
    gl.uniform1f(u.uTime, simTime);
    gl.uniform1f(u.uDiskIn, params.diskIn);
    gl.uniform1f(u.uDiskOut, params.diskOut);
    gl.uniform1f(u.uDiskTemp, params.diskTemp);
    gl.uniform1f(u.uDiskBright, params.diskBright);
    gl.uniform1f(u.uThickness, params.thickness);
    gl.uniform1f(u.uTurb, params.turb);
    gl.uniform1f(u.uSpin, params.spin);
    gl.uniform1f(u.uBeaming, params.beaming);
    gl.uniform1f(u.uLensing, params.lensing);
    gl.uniform1f(u.uStarBright, params.starBright);
    gl.uniform1f(u.uStepK, q.stepK);
    gl.uniform1i(u.uMaxSteps, q.steps);
    gl.uniform1f(u.uEscape, Math.max(camera.dist * 1.2 + 6, params.diskOut + 5, 30));
    gl.uniform1f(u.uHDR, floatOK ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, starTex);
    gl.uniform1i(u.uStars, 0);
    quad.draw();

    /* 2. 亮度提取（半分辨率） */
    GLU.bindTarget(gl, bloomT[0]);
    gl.useProgram(brightProg);
    gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.uniform1i(brightProg.u.uTex, 0);
    gl.uniform2f(brightProg.u.uTexel, 1 / W, 1 / H);
    gl.uniform1f(brightProg.u.uThreshold, 1.0);
    quad.draw();

    /* 3. 降采样链 */
    gl.useProgram(downProg);
    gl.uniform1i(downProg.u.uTex, 0);
    for (let i = 1; i < bloomT.length; i++) {
      GLU.bindTarget(gl, bloomT[i]);
      gl.bindTexture(gl.TEXTURE_2D, bloomT[i - 1].tex);
      gl.uniform2f(downProg.u.uTexel, 1 / bloomT[i - 1].w, 1 / bloomT[i - 1].h);
      quad.draw();
    }

    /* 4. 上采样链（加性） */
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.useProgram(upProg);
    gl.uniform1i(upProg.u.uTex, 0);
    gl.uniform1f(upProg.u.uRadius, 1.0);
    for (let i = bloomT.length - 1; i >= 1; i--) {
      GLU.bindTarget(gl, bloomT[i - 1]);
      gl.bindTexture(gl.TEXTURE_2D, bloomT[i].tex);
      gl.uniform2f(upProg.u.uTexel, 1 / bloomT[i].w, 1 / bloomT[i].h);
      quad.draw();
    }
    gl.disable(gl.BLEND);

    /* 5. 合成到屏幕 */
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, W, H);
    gl.useProgram(compProg);
    const cu = compProg.u;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, sceneT.tex);
    gl.uniform1i(cu.uScene, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, bloomT[0].tex);
    gl.uniform1i(cu.uBloom, 1);
    gl.uniform1f(cu.uBloomStrength, params.bloom);
    gl.uniform1f(cu.uExposure, params.exposure);
    gl.uniform1f(cu.uVignette, 0.32);
    gl.uniform1f(cu.uGrain, 0.014);
    gl.uniform1f(cu.uCA, 0.0022);
    gl.uniform1f(cu.uTime, simTime);
    gl.uniform1f(cu.uLDR, floatOK ? 0 : 1);
    gl.uniform2f(cu.uRes, W, H);
    quad.draw();
    gl.activeTexture(gl.TEXTURE0);

    frames++;
  }

  /* ---------------- 主循环 ---------------- */
  function frame(tms) {
    const t = tms / 1000;
    let dt = lastT === 0 ? 0.016 : Math.min(t - lastT, 0.05);
    lastT = t;

    camera.update(dt);
    simTime += dt * params.timeScale;
    renderFrame();

    if (dt > 0) fpsEma = fpsEma * 0.92 + (1 / dt) * 0.08;
    hudTimer += dt;
    if (hudTimer > 0.25) {
      hudTimer = 0;
      $('hudFps').textContent = Math.round(fpsEma) + ' FPS';
      $('hudCam').textContent =
        `d=${camera.dist.toFixed(1)} rs · i=${(camera.pitch * 57.2958).toFixed(1)}°`;
    }

    // 低帧率提示
    if (fpsEma < 22 && params.quality !== 'low') {
      lowFpsTime += dt;
      if (lowFpsTime > 6 && !lowFpsWarned) {
        lowFpsWarned = true;
        toast('帧率较低：建议在右侧「性能」中切换为流畅画质');
      }
    } else lowFpsTime = 0;

    requestAnimationFrame(frame);
  }

  /* ---------------- 提示 ---------------- */
  let toastTimer = 0;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.hidden = false;
    el.style.opacity = 1;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.style.opacity = 0;
      setTimeout(() => { el.hidden = true; }, 600);
    }, 3600);
  }

  /* ---------------- 参数设置 ---------------- */
  function setParam(key, v) {
    params[key] = v;
    // 吸积盘内外半径约束
    if (key === 'diskIn' && params.diskOut < v + 2) {
      params.diskOut = Math.min(24, v + 2);
      controls.diskOut && controls.diskOut();
    }
    if (key === 'diskOut' && params.diskIn > v - 2) {
      params.diskIn = Math.max(1.5, v - 2);
      controls.diskIn && controls.diskIn();
    }
    if (key === 'quality') resize();
    if (key === 'autoRotate') camera.autoRotate = v;
    if (key === 'rotSpeed') camera.rotSpeed = v;
  }

  function markPresetDirty() {
    activePreset = null;
    document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
  }

  function applyPreset(name, silent) {
    const p = PRESETS[name];
    if (!p) return;
    Object.assign(params, p.values);
    camera.autoRotate = params.autoRotate;
    camera.rotSpeed = params.rotSpeed;
    if (p.cam) {
      camera.tYaw = p.cam.yaw; camera.tPitch = p.cam.pitch; camera.tDist = p.cam.dist;
    }
    activePreset = name;
    Object.values(controls).forEach((fn) => fn());
    document.querySelectorAll('.chip').forEach((c) =>
      c.classList.toggle('active', c.dataset.preset === name));
    if (!silent) toast('已应用预设：' + p.label);
  }

  /* ---------------- UI 构建 ---------------- */
  const UI_SECTIONS = [
    { title: '观测', items: [
      { key: 'fov', label: '视场角', min: 30, max: 90, step: 1, unit: '°' },
      { key: 'autoRotate', label: '自动旋转', type: 'check' },
      { key: 'rotSpeed', label: '旋转速度', min: 0, max: 0.15, step: 0.005,
        fmt: (v) => (v * 57.2958).toFixed(1) + '°/s' },
      { key: 'timeScale', label: '时间流速', min: 0, max: 3, step: 0.05,
        fmt: (v) => v.toFixed(2) + '×' },
    ]},
    { title: '吸积盘', items: [
      { key: 'diskIn', label: '内半径', min: 1.5, max: 6, step: 0.1, unit: ' rs' },
      { key: 'diskOut', label: '外半径', min: 6, max: 24, step: 0.5, unit: ' rs' },
      { key: 'diskTemp', label: '峰值温度', min: 2000, max: 12000, step: 100, unit: ' K' },
      { key: 'diskBright', label: '盘亮度', min: 0, max: 5, step: 0.05 },
      { key: 'thickness', label: '盘晕厚度', min: 0, max: 0.5, step: 0.01, unit: ' rs' },
      { key: 'turb', label: '湍流强度', min: 0, max: 1.5, step: 0.05 },
      { key: 'spin', label: '物质旋速', min: 0, max: 3, step: 0.05,
        fmt: (v) => v.toFixed(2) + '×' },
    ]},
    { title: '相对论效应', items: [
      { key: 'lensing', label: '引力透镜强度', min: 0, max: 2, step: 0.05,
        fmt: (v) => v.toFixed(2) + '×' },
      { key: 'beaming', label: '多普勒 / 红移调制', min: 0, max: 1, step: 0.01,
        fmt: (v) => Math.round(v * 100) + '%' },
    ]},
    { title: '星空与后期', items: [
      { key: 'starBright', label: '星空亮度', min: 0, max: 3, step: 0.05 },
      { key: 'bloom', label: '泛光强度', min: 0, max: 2, step: 0.05 },
      { key: 'exposure', label: '曝光', min: 0.3, max: 2.5, step: 0.05 },
    ]},
  ];

  function fmtDefault(item, v) {
    const dec = item.step >= 1 ? 0 : (item.step >= 0.1 ? 1 : 2);
    return (+v).toFixed(dec) + (item.unit || '');
  }

  function buildUI() {
    // 预设
    const presetsEl = $('presets');
    for (const [name, p] of Object.entries(PRESETS)) {
      const b = document.createElement('button');
      b.className = 'chip';
      b.dataset.preset = name;
      b.textContent = p.label;
      b.addEventListener('click', () => applyPreset(name));
      presetsEl.appendChild(b);
    }

    const body = $('panelBody');
    for (const sec of UI_SECTIONS) {
      const s = document.createElement('div');
      s.className = 'section';
      s.innerHTML = `<div class="section-title">${sec.title}</div>`;
      for (const item of sec.items) {
        if (item.type === 'check') {
          const row = document.createElement('label');
          row.className = 'ctl-check';
          row.innerHTML = `<span class="ctl-label">${item.label}</span>
            <span class="switch"><input type="checkbox"><i></i></span>`;
          const input = row.querySelector('input');
          const refresh = () => { input.checked = !!params[item.key]; };
          input.addEventListener('change', () => {
            setParam(item.key, input.checked);
            markPresetDirty();
          });
          refresh();
          controls[item.key] = refresh;
          s.appendChild(row);
        } else {
          const ctl = document.createElement('div');
          ctl.className = 'ctl';
          ctl.innerHTML = `<div class="ctl-row">
            <span class="ctl-label">${item.label}</span>
            <span class="ctl-val"></span></div>`;
          const input = document.createElement('input');
          input.type = 'range';
          input.min = item.min; input.max = item.max; input.step = item.step;
          const val = ctl.querySelector('.ctl-val');
          const refresh = () => {
            const v = params[item.key];
            input.value = v;
            val.textContent = item.fmt ? item.fmt(v) : fmtDefault(item, v);
            const p = ((v - item.min) / (item.max - item.min)) * 100;
            input.style.setProperty('--p', p + '%');
          };
          input.addEventListener('input', () => {
            setParam(item.key, parseFloat(input.value));
            refresh();
            markPresetDirty();
          });
          refresh();
          controls[item.key] = refresh;
          ctl.appendChild(input);
          s.appendChild(ctl);
        }
      }
      body.appendChild(s);
    }

    // 画质
    const perf = document.createElement('div');
    perf.className = 'section';
    perf.innerHTML = `<div class="section-title">性能</div>`;
    const seg = document.createElement('div');
    seg.className = 'seg';
    for (const [key, q] of Object.entries(QUALITY)) {
      const b = document.createElement('button');
      b.textContent = q.label;
      b.dataset.q = key;
      b.addEventListener('click', () => {
        setParam('quality', key);
        seg.querySelectorAll('button').forEach((x) =>
          x.classList.toggle('active', x.dataset.q === key));
      });
      seg.appendChild(b);
    }
    const refreshQ = () => seg.querySelectorAll('button').forEach((x) =>
      x.classList.toggle('active', x.dataset.q === params.quality));
    controls.quality = refreshQ;
    refreshQ();
    perf.appendChild(seg);
    body.appendChild(perf);

    // 关于
    const about = document.createElement('details');
    about.className = 'about';
    about.innerHTML = `
      <summary>关于本渲染器</summary>
      <p>每个像素发射一条光线，按<b>史瓦西时空零测地线</b>方程
      u″+u=1.5·rₛ·u² 数值积分，真实再现<b>事件视界阴影</b>（r=rₛ）、
      <b>光子球</b>（r=1.5rₛ）与<b>光子环</b>。</p>
      <p>吸积盘为不透明薄盘，内缘默认位于最内稳定圆轨道
      <b>ISCO=3rₛ</b>；颜色来自 Shakura–Sunyaev 温度剖面的黑体辐射，
      叠加开普勒差速旋转湍流、<b>多普勒聚束</b>与<b>引力红移</b>。</p>
      <p>盘面上方的光弧是盘背面被引力透镜弯折到黑洞上下的像——
      这正是《星际穿越》卡冈图雅标志性外观的成因。电影为美学弱化了
      多普勒不对称，默认预设亦如此；调高「多普勒/红移调制」可见
      真实物理下亮暗分明的盘面。</p>
      <p>渲染：WebGL2 · HDR 泛光 · ACES 色调映射 · 无第三方依赖。</p>`;
    body.appendChild(about);

    // 底部按钮
    $('btnReset').addEventListener('click', () => { camera.reset(); toast('视角已重置'); });
    $('btnShot').addEventListener('click', screenshot);

    // 面板开关
    $('panelToggle').addEventListener('click', () => $('panel').classList.toggle('closed'));

    // 键盘
    window.addEventListener('keydown', (e) => {
      if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName) && e.key !== 'h' && e.key !== 'H') return;
      if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('zen');
      else if (e.key === ' ') {
        e.preventDefault();
        setParam('autoRotate', !params.autoRotate);
        controls.autoRotate && controls.autoRotate();
        toast(params.autoRotate ? '自动旋转：开' : '自动旋转：关');
      }
      else if (e.key === 'r' || e.key === 'R') camera.reset();
      else if (e.key === 'p' || e.key === 'P') $('panel').classList.toggle('closed');
    });
  }

  /* ---------------- 截图 ---------------- */
  function screenshot() {
    renderFrame(); // 同帧读取，无需 preserveDrawingBuffer
    canvas.toBlob((blob) => {
      if (!blob) { toast('截图失败'); return; }
      const a = document.createElement('a');
      const ts = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 19);
      a.href = URL.createObjectURL(blob);
      a.download = `gargantua-${ts}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      toast('截图已保存');
    }, 'image/png');
  }

  /* ---------------- 启动 ---------------- */
  async function boot() {
    // URL 参数
    const q = urlq.get('quality');
    if (q && QUALITY[q]) params.quality = q;

    if (!initGL()) return;
    buildUI();

    $('loadMsg').textContent = '正在生成星空贴图…';
    await new Promise((r) => setTimeout(r, 80)); // 让加载动画先绘制
    const isSmall = matchMedia('(max-width: 760px)').matches
      || (navigator.hardwareConcurrency || 8) <= 4;
    const starW = isSmall ? 2048 : 4096;
    const cv = StarField.generate(starW, starW / 2);
    $('loadMsg').textContent = '正在上传纹理…';
    uploadStars(cv);

    resize();
    window.addEventListener('resize', resize);

    // 预设 / URL 覆盖
    const preset = urlq.get('preset');
    applyPreset(preset && PRESETS[preset] ? preset : 'movie', true);
    if (urlq.get('ui') === '0') document.body.classList.add('zen');
    if (urlq.get('still') === '1') {
      setParam('timeScale', 0);
      setParam('autoRotate', false);
      controls.timeScale && controls.timeScale();
      controls.autoRotate && controls.autoRotate();
    }

    camera.attach(canvas);
    camera.update(0.016);
    requestAnimationFrame(frame);

    // 首帧完成后淡出加载遮罩
    await new Promise((r) => setTimeout(r, 300));
    $('loading').classList.add('done');
    setTimeout(() => $('hint').classList.add('fade'), 9000);

    window.__bh = {
      ready: true, errors, params, PRESETS,
      get frames() { return frames; },
      get fps() { return Math.round(fpsEma); },
      setPreset: (n) => applyPreset(n, true),
      setParam: (k, v) => { setParam(k, v); controls[k] && controls[k](); },
      renderer: gl.getParameter(gl.RENDERER),
      hdr: floatOK,
      camera,
    };
  }

  boot().catch((e) => { fatal(e.message || String(e)); errors.push(String(e.stack || e)); });
})();