/* 卡冈图雅 — 主程序：渲染管线、相机交互、侧边栏 UI、预设、自适应画质 */
"use strict";

(function () {

  /* ---------- 错误提示 ---------- */
  const errbox = document.getElementById("errbox");
  function showErr(msg) {
    errbox.hidden = false;
    errbox.textContent = String(msg);
  }
  window.addEventListener("error", (e) => showErr(e.message || "未知脚本错误"));
  window.addEventListener("unhandledrejection", (e) => showErr(e.reason || "未处理的 Promise 拒绝"));

  const canvas = document.getElementById("view");
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    showErr("WebGL 上下文丢失，请刷新页面。");
  });

  /* ---------- 参数 ---------- */
  const PARAMS = {
    rs: 1.0,            /* 黑洞尺度（施瓦西半径） */
    lens: 1.0,          /* 透镜强度 */
    din: 2.2, dout: 9.0,
    dbright: 1.25, dtemp: 1.0, dopac: 0.92, dspeed: 1.0, doppler: 0.0,
    stard: 1.0, starb: 1.0, nebula: 0.45,
    fov: 60, bloom: 0.8, exposure: 1.0,
    steps: 192, quality: "auto",
    autoOrbit: false
  };

  const PRESETS = {
    movie:   { rs: 1.0, lens: 1.0, din: 2.2, dout: 9.0, dbright: 1.25, dtemp: 1.0, dopac: 0.95, dspeed: 1.0, doppler: 0.0, stard: 1.0, starb: 1.0, nebula: 0.35, bloom: 0.75, exposure: 1.0 },
    real:    { rs: 1.0, lens: 1.0, din: 2.2, dout: 9.0, dbright: 1.1,  dtemp: 1.12, dopac: 1.0, dspeed: 1.0, doppler: 1.0, stard: 0.9, starb: 0.95, nebula: 0.45, bloom: 0.85, exposure: 1.0 },
    extreme: { rs: 1.25, lens: 1.7, din: 1.6, dout: 12.0, dbright: 1.35, dtemp: 1.15, dopac: 1.0, dspeed: 1.4, doppler: 0.35, stard: 1.1, starb: 1.0, nebula: 0.55, bloom: 1.0, exposure: 1.0 },
    dormant: { rs: 1.0, lens: 1.0, din: 2.2, dout: 9.0, dbright: 0.05, dtemp: 0.85, dopac: 1.0, dspeed: 0.6, doppler: 0.0, stard: 1.4, starb: 1.4, nebula: 0.7, bloom: 0.55, exposure: 1.1 }
  };

  const GROUPS = [
    { name: "引力", items: [
      { key: "rs",   label: "黑洞尺度", min: 0.4, max: 2.2, step: 0.01 },
      { key: "lens", label: "透镜强度", min: 0, max: 2, step: 0.01 }
    ] },
    { name: "吸积盘", items: [
      { key: "din",     label: "内半径",   min: 1.2, max: 5,  step: 0.05 },
      { key: "dout",    label: "外半径",   min: 4,   max: 14, step: 0.1 },
      { key: "dbright", label: "亮度",     min: 0,   max: 3,  step: 0.01 },
      { key: "dtemp",   label: "色温",     min: 0.6, max: 1.6, step: 0.01 },
      { key: "dopac",   label: "不透明度", min: 0.15, max: 1, step: 0.01 },
      { key: "dspeed",  label: "旋转速度", min: 0,   max: 3,  step: 0.01 },
      { key: "doppler", label: "多普勒集束", min: 0, max: 1, step: 0.01 }
    ] },
    { name: "星空", items: [
      { key: "stard",  label: "星星密度", min: 0, max: 2, step: 0.01 },
      { key: "starb",  label: "星星亮度", min: 0, max: 2, step: 0.01 },
      { key: "nebula", label: "星云强度", min: 0, max: 1, step: 0.01 }
    ] },
    { name: "渲染与相机", items: [
      { key: "fov",      label: "视场角",   min: 30, max: 95, step: 1, unit: "°" },
      { key: "bloom",    label: "泛光强度", min: 0,  max: 2,  step: 0.01 },
      { key: "exposure", label: "曝光",     min: 0.2, max: 2.5, step: 0.01 },
      { key: "steps",    label: "光线步数", min: 96, max: 384, step: 16, int: true },
      { type: "select", key: "quality", label: "渲染质量",
        options: [["auto", "自适应"], ["0.55", "低"], ["0.75", "中"], ["1", "高"]] },
      { type: "toggle", key: "autoOrbit", label: "自动环绕" }
    ] }
  ];

  /* ---------- 相机 ---------- */
  const DEF_CAM = { yaw: 0.6, pitch: 0.17, dist: 16 };
  const cam = {
    yaw: DEF_CAM.yaw, pitch: DEF_CAM.pitch, dist: DEF_CAM.dist,
    tYaw: DEF_CAM.yaw, tPitch: DEF_CAM.pitch, tDist: DEF_CAM.dist,
    minD: 3.2, maxD: 55
  };

  /* ---------- URL 参数（便于分享配置 / 自动化测试） ---------- */
  try {
    const qs = new URLSearchParams(location.search);
    const p = qs.get("p");
    if (p && PRESETS[p]) Object.assign(PARAMS, PRESETS[p]);
    const NUM = {
      rs: "rs", lens: "lens", din: "din", dout: "dout", dbright: "dbright",
      dtemp: "dtemp", dopac: "dopac", dspeed: "dspeed", doppler: "doppler",
      stard: "stard", starb: "starb", nebula: "nebula", bloom: "bloom",
      exposure: "exposure", fov: "fov", steps: "steps"
    };
    for (const k in NUM) {
      const v = parseFloat(qs.get(k));
      if (isFinite(v)) PARAMS[NUM[k]] = v;
    }
    const q = qs.get("q");
    if (q) {
      const map = { low: "0.55", mid: "0.75", high: "1", auto: "auto" };
      PARAMS.quality = map[q] || q;
    }
    const yaw = parseFloat(qs.get("yaw"));
    if (isFinite(yaw)) { cam.tYaw = yaw; cam.yaw = yaw; }
    const pitch = parseFloat(qs.get("pitch"));
    if (isFinite(pitch)) {
      const r = pitch * Math.PI / 180;
      cam.tPitch = Math.min(1.45, Math.max(-1.45, r));
      cam.pitch = cam.tPitch;
    }
    const dist = parseFloat(qs.get("dist"));
    if (isFinite(dist)) {
      cam.tDist = Math.min(cam.maxD, Math.max(cam.minD, dist));
      cam.dist = cam.tDist;
    }
  } catch (e) { /* URL 参数解析失败不影响运行 */ }

  /* ---------- 引擎与着色器程序 ---------- */
  function fatal(err) {
    showErr(err && err.message ? err.message : String(err));
    const l = document.getElementById("loading");
    if (l) l.remove();
  }

  let engine;
  try {
    engine = BHEngine.create(canvas);
  } catch (e) {
    fatal(e);
    return;
  }

  let bhProg, brightProg, blurProg, compProg;
  try {
    bhProg      = engine.createProgram(BHShaders.vertex, BHShaders.bh);
    brightProg  = engine.createProgram(BHShaders.vertex, BHShaders.bright);
    blurProg    = engine.createProgram(BHShaders.vertex, BHShaders.blur);
    compProg    = engine.createProgram(BHShaders.vertex, BHShaders.composite);
  } catch (e) {
    fatal(e);
    return;
  }

  /* ---------- uniform 载体 ---------- */
  const camPos = new Float32Array(3);
  const camFwd = new Float32Array(3);
  const camRight = new Float32Array(3);
  const camUp = new Float32Array(3);

  const bhU = {
    uTime: 0,
    uCamPos: camPos, uCamRight: camRight, uCamUp: camUp, uCamFwd: camFwd,
    uTanFov: 0.577, uAspect: 1.0,
    uRs: PARAMS.rs, uLens: PARAMS.lens,
    uDiskIn: PARAMS.din, uDiskOut: PARAMS.dout,
    uDiskBright: PARAMS.dbright, uDiskTemp: PARAMS.dtemp,
    uDiskOpacity: PARAMS.dopac, uDiskSpeed: PARAMS.dspeed,
    uDoppler: PARAMS.doppler,
    uStarDensity: PARAMS.stard, uStarBright: PARAMS.starb, uNebula: PARAMS.nebula,
    uEsc: 80, uSteps: PARAMS.steps
  };
  const brightU = { tSrc: null, uThresh: engine.halfCapable ? 1.0 : 0.72 };
  const blurU = { tSrc: null, uDir: [0, 0] };
  const compU = {
    tScene: null, tBloom: null,
    uBloomStr: PARAMS.bloom, uExposure: PARAMS.exposure,
    uTime: 0, uRes: [1, 1]
  };

  /* ---------- 渲染目标与尺寸 ---------- */
  let sceneRT = null, bloomA = null, bloomB = null;
  let dead = false;           /* 渲染资源失效后停止主循环 */
  let renderScale = 0.85;
  if (PARAMS.quality !== "auto") {
    const s = parseFloat(PARAMS.quality);
    if (isFinite(s) && s > 0) renderScale = s;
  }

  function applySize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));

    const sw = Math.max(8, Math.round(canvas.width * renderScale));
    const sh = Math.max(8, Math.round(canvas.height * renderScale));
    sceneRT = sceneRT ? engine.resizeRT(sceneRT, sw, sh) : engine.createRT(sw, sh);
    const bw = Math.max(8, sw >> 2);
    const bh = Math.max(8, sh >> 2);
    bloomA = bloomA ? engine.resizeRT(bloomA, bw, bh) : engine.createRT(bw, bh);
    bloomB = bloomB ? engine.resizeRT(bloomB, bw, bh) : engine.createRT(bw, bh);
    if (!sceneRT || !bloomA || !bloomB) {
      if (!dead) {
        dead = true;
        fatal(new Error("创建渲染目标失败（可能显存不足）"));
      }
      return false;
    }
    bhU.uAspect = w / h;
    compU.uRes[0] = canvas.width;
    compU.uRes[1] = canvas.height;
    return true;
  }
  window.addEventListener("resize", applySize);

  /* ---------- 渲染一帧（黑洞 → 亮部 → 两轮模糊 → 合成） ---------- */
  function render() {
    engine.draw(bhProg, bhU, sceneRT);

    brightU.tSrc = sceneRT.tex;
    engine.draw(brightProg, brightU, bloomA);

    for (let i = 0; i < 2; i++) {
      blurU.tSrc = bloomA.tex;
      blurU.uDir[0] = (i + 1) * 0.8 / bloomA.width;
      blurU.uDir[1] = 0;
      engine.draw(blurProg, blurU, bloomB);
      blurU.tSrc = bloomB.tex;
      blurU.uDir[0] = 0;
      blurU.uDir[1] = (i + 1) * 0.8 / bloomA.height;
      engine.draw(blurProg, blurU, bloomA);
    }

    compU.tScene = sceneRT.tex;
    compU.tBloom = bloomA.tex;
    engine.draw(compProg, compU, null);
  }

  /* ---------- 相机更新 ---------- */
  function updateCamera(dt) {
    const k = 1 - Math.exp(-dt * 8);
    cam.yaw += (cam.tYaw - cam.yaw) * k;
    cam.pitch += (cam.tPitch - cam.pitch) * k;
    cam.dist += (cam.tDist - cam.dist) * k;

    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const cy = Math.cos(cam.yaw), sy = Math.sin(cam.yaw);
    camPos[0] = cam.dist * cp * cy;
    camPos[1] = cam.dist * sp;
    camPos[2] = cam.dist * cp * sy;

    const L = Math.hypot(camPos[0], camPos[1], camPos[2]) || 1;
    camFwd[0] = -camPos[0] / L;
    camFwd[1] = -camPos[1] / L;
    camFwd[2] = -camPos[2] / L;

    /* right = normalize(cross(fwd, worldUp)) */
    let rx = -camFwd[2], rz = camFwd[0];
    const rl = Math.hypot(rx, rz) || 1;
    camRight[0] = rx / rl; camRight[1] = 0; camRight[2] = rz / rl;

    /* up = cross(right, fwd) */
    camUp[0] = camRight[1] * camFwd[2] - camRight[2] * camFwd[1];
    camUp[1] = camRight[2] * camFwd[0] - camRight[0] * camFwd[2];
    camUp[2] = camRight[0] * camFwd[1] - camRight[1] * camFwd[0];

    bhU.uEsc = Math.max(70, cam.dist + 45);
    bhU.uTanFov = Math.tan(PARAMS.fov * Math.PI / 360);
  }

  function syncParams() {
    bhU.uRs = PARAMS.rs;
    bhU.uLens = PARAMS.lens;
    bhU.uDiskIn = PARAMS.din;
    bhU.uDiskOut = PARAMS.dout;
    bhU.uDiskBright = PARAMS.dbright;
    bhU.uDiskTemp = PARAMS.dtemp;
    bhU.uDiskOpacity = PARAMS.dopac;
    bhU.uDiskSpeed = PARAMS.dspeed;
    bhU.uDoppler = PARAMS.doppler;
    bhU.uStarDensity = PARAMS.stard;
    bhU.uStarBright = PARAMS.starb;
    bhU.uNebula = PARAMS.nebula;
    bhU.uSteps = Math.round(PARAMS.steps);
    compU.uBloomStr = PARAMS.bloom;
    compU.uExposure = PARAMS.exposure;
  }

  /* ---------- 交互：拖拽旋转 / 滚轮缩放 / 双指捏合 ---------- */
  const pointers = new Map();
  function pinchDist() {
    const arr = Array.from(pointers.values());
    return Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
  }
  canvas.addEventListener("pointerdown", (e) => {
    try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = pointers.get(e.pointerId);
    if (!p) return;
    const before = pointers.size === 2 ? pinchDist() : 0;
    if (pointers.size === 1) {
      cam.tYaw -= (e.clientX - p.x) * 0.0045;
      cam.tPitch = Math.min(1.45, Math.max(-1.45, cam.tPitch - (e.clientY - p.y) * 0.0045));
    }
    p.x = e.clientX;
    p.y = e.clientY;
    if (pointers.size === 2) {
      const after = pinchDist();
      if (before > 1 && after > 1) {
        cam.tDist = Math.min(cam.maxD, Math.max(cam.minD, cam.tDist * before / after));
      }
    }
  });
  const endPointer = (e) => { pointers.delete(e.pointerId); };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    cam.tDist = Math.min(cam.maxD, Math.max(cam.minD, cam.tDist * Math.exp(e.deltaY * 0.0011)));
  }, { passive: false });

  /* ---------- 侧边栏 UI ---------- */
  const controlsEl = document.getElementById("controls");
  const inputs = {};

  function el(tag, cls) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    return e;
  }
  function fmtVal(v, it) {
    if (it.int) return String(Math.round(v)) + (it.unit || "");
    const dec = it.step >= 1 ? 0 : (it.step >= 0.1 ? 1 : 2);
    return v.toFixed(dec) + (it.unit || "");
  }

  function buildUI() {
    for (const g of GROUPS) {
      const sec = el("section", "group");
      const h = el("h2");
      h.textContent = g.name;
      sec.appendChild(h);
      for (const it of g.items) {
        const row = el("div", "row" + (it.type ? " tg" : ""));
        const lab = el("label");
        lab.textContent = it.label;
        row.appendChild(lab);

        if (it.type === "toggle") {
          const sw = el("label", "switch");
          const cb = document.createElement("input");
          cb.type = "checkbox";
          const track = el("span", "track");
          sw.appendChild(cb);
          sw.appendChild(track);
          row.appendChild(sw);
          cb.addEventListener("change", () => { PARAMS[it.key] = cb.checked; });
          inputs[it.key] = { kind: "toggle", input: cb };
        } else if (it.type === "select") {
          const sel = document.createElement("select");
          for (const pair of it.options) {
            const o = document.createElement("option");
            o.value = pair[0];
            o.textContent = pair[1];
            sel.appendChild(o);
          }
          row.appendChild(sel);
          sel.addEventListener("change", () => {
            PARAMS[it.key] = sel.value;
            if (it.key === "quality") {
              if (sel.value === "auto") {
                warmup = 1.2;
                emaFrame = 16.7;
              } else {
                const s = parseFloat(sel.value);
                if (isFinite(s) && s > 0) {
                  renderScale = s;
                  warmup = 1e9;      /* 手动模式禁用自适应 */
                  applySize();
                }
              }
            }
          });
          inputs[it.key] = { kind: "select", input: sel };
        } else {
          const inp = document.createElement("input");
          inp.type = "range";
          inp.min = it.min;
          inp.max = it.max;
          inp.step = it.step;
          const val = el("span", "val");
          row.appendChild(inp);
          row.appendChild(val);
          inp.addEventListener("input", () => {
            PARAMS[it.key] = parseFloat(inp.value);
            val.textContent = fmtVal(PARAMS[it.key], it);
          });
          inputs[it.key] = { kind: "range", input: inp, val, it };
        }
        sec.appendChild(row);
      }
      controlsEl.appendChild(sec);
    }
  }

  function syncUI() {
    for (const key in inputs) {
      const w = inputs[key];
      if (w.kind === "range") {
        w.input.value = PARAMS[key];
        w.val.textContent = fmtVal(PARAMS[key], w.it);
      } else if (w.kind === "toggle") {
        w.input.checked = !!PARAMS[key];
      } else {
        w.input.value = String(PARAMS[key]);
      }
    }
  }

  buildUI();
  syncUI();

  /* 预设按钮 */
  Array.prototype.forEach.call(document.querySelectorAll(".chip"), (btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const p = PRESETS[btn.dataset.preset];
      if (p) {
        Object.assign(PARAMS, p);
        syncUI();
      }
      btn.blur();
    });
  });

  /* 面板收起 / 展开 */
  const expandBtn = document.getElementById("expand");
  function togglePanel() {
    const hidden = document.body.classList.toggle("panel-hidden");
    expandBtn.hidden = !hidden;
  }
  document.getElementById("collapse").addEventListener("click", togglePanel);
  expandBtn.addEventListener("click", togglePanel);

  /* 重置视角 */
  function resetView() {
    cam.tYaw = DEF_CAM.yaw;
    cam.tPitch = DEF_CAM.pitch;
    cam.tDist = DEF_CAM.dist;
  }
  document.getElementById("btn-reset").addEventListener("click", (e) => {
    e.preventDefault();
    resetView();
    e.currentTarget.blur();
  });

  /* 截图 */
  document.getElementById("btn-shot").addEventListener("click", (e) => {
    e.preventDefault();
    try {
      render();
      const url = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = url;
      a.download = "gargantua-" + new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + ".png";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err) {
      showErr("截图失败：" + (err && err.message ? err.message : err));
    }
    e.currentTarget.blur();
  });

  /* 键盘 */
  let paused = false;
  window.addEventListener("keydown", (e) => {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON") return;
    if (e.code === "Space") {
      e.preventDefault();
      paused = !paused;
    } else if (e.code === "KeyR") {
      resetView();
    } else if (e.code === "KeyH") {
      togglePanel();
    }
  });

  /* 提示淡出 */
  const hintEl = document.getElementById("hint");
  const hintTimer = setTimeout(() => hintEl.classList.add("fade"), 9000);
  canvas.addEventListener("pointerdown", () => {
    clearTimeout(hintTimer);
    hintEl.classList.add("fade");
  }, { once: true });

  /* ---------- 自适应画质 ---------- */
  let emaFrame = 16.7;      /* 帧耗时指数滑动平均（ms） */
  let warmup = 1.5;         /* 预热秒数（跳过编译卡顿） */
  let adaptAcc = 0;
  function adaptQuality(dtMs) {
    if (PARAMS.quality !== "auto") return;
    emaFrame += (dtMs - emaFrame) * 0.08;
    if (warmup > 0 && warmup < 1e8) {
      warmup -= dtMs / 1000;
      return;
    }
    if (warmup >= 1e8) return;   /* 曾手动选择质量后退出自适应 */
    adaptAcc += dtMs;
    if (adaptAcc < 1200) return;
    adaptAcc = 0;
    if (emaFrame > 23 && renderScale > 0.45) {
      renderScale = Math.max(0.45, renderScale * 0.8);
      applySize();
    } else if (emaFrame < 17.8 && renderScale < 1.0) {
      renderScale = Math.min(1.0, renderScale * 1.06);
      applySize();
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) {
      lastT = performance.now();
      emaFrame = 16.7;
    }
  });

  /* ---------- 主循环 ---------- */
  const statsEl = document.getElementById("stats");
  let lastT = performance.now();
  let fps = 60;
  let statAcc = 0;
  let firstFrame = true;

  if (!applySize()) return;
  updateCamera(0.1);
  syncParams();

  function tick(now) {
    if (dead) return;
    requestAnimationFrame(tick);
    let dt = (now - lastT) / 1000;
    lastT = now;
    if (!(dt > 0)) dt = 0.016;
    if (dt > 0.1) dt = 0.1;

    if (!paused) {
      bhU.uTime += dt;
      compU.uTime += dt;
    }
    if (PARAMS.autoOrbit) cam.tYaw += dt * 0.05;

    updateCamera(dt);
    syncParams();
    render();
    adaptQuality(dt * 1000);

    if (firstFrame) {
      firstFrame = false;
      const l = document.getElementById("loading");
      if (l) {
        l.classList.add("fade");
        setTimeout(() => { if (l.parentNode) l.remove(); }, 700);
      }
    }

    fps += (1 / dt - fps) * 0.08;
    statAcc += dt;
    if (statAcc > 0.5) {
      statAcc = 0;
      statsEl.textContent =
        Math.round(fps) + " FPS · " + sceneRT.width + "×" + sceneRT.height +
        " · " + renderScale.toFixed(2) + "×";
    }
  }
  requestAnimationFrame(tick);

})();
