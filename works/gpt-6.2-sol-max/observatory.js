"use strict";

(() => {
  const get = (id) => document.getElementById(id);
  const radians = Math.PI / 180;
  const turn = 2 * Math.PI;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

  const cinema = {
    parameters: { mass: 1, spin: 0.58, outer: 16.8, temperature: 6200, intensity: 1.25, lensing: true, doppler: false },
    view: { yaw: 16 * radians, pitch: 8 * radians, zoom: 1 },
  };
  const presets = {
    cinema,
    overhead: {
      parameters: { ...cinema.parameters, spin: 0.24, outer: 15.2, temperature: 7700, intensity: 1.1 },
      view: { yaw: 47 * radians, pitch: 75 * radians, zoom: 0.83 },
    },
    rapid: {
      parameters: { ...cinema.parameters, mass: 1.08, spin: 0.98, outer: 14.6, temperature: 10500, intensity: 1.45, doppler: true },
      view: { yaw: -27 * radians, pitch: 15 * radians, zoom: 1.04 },
    },
  };
  const qualityProfiles = {
    auto: { scale: 1.12, minimum: 0, pixels: 1280000, fps: 60 },
    high: { scale: 1.75, minimum: 1.3, pixels: 2400000, fps: 60 },
    balanced: { scale: 1, minimum: 0, pixels: 1080000, fps: 60 },
    low: { scale: 0.68, minimum: 0, pixels: 520000, fps: 30 },
  };

  const canvas = get("space");
  const stage = get("stage");
  const status = get("render-status");
  const statusText = get("render-status-text");
  const message = get("view-message");
  const playback = get("playback");
  const fullscreen = get("fullscreen");
  const shell = get("observatory");
  const qualitySelect = get("quality");
  const presetButtons = [...document.querySelectorAll("[data-preset]")];
  const allParameters = [...document.querySelectorAll("[data-param]")];
  const prefersReducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const integer = new Intl.NumberFormat("zh-CN");

  let parameters = { ...cinema.parameters };
  let baseView = cinema.view;
  let view = { ...baseView };
  let playing = !prefersReducedMotion.matches;
  let simulationTime = 0.8;
  let renderer;
  let frameId = 0;
  let lastFrame = 0;
  let frameDeadline = 0;
  let renderPending = true;
  let resizePending = true;
  let autoScale = 1;
  let measureDuration = 0;
  let measureFrames = 0;

  function describeControl(input) {
    if (input.type !== "range") return;
    const key = input.dataset.param;
    const value = input.valueAsNumber;
    const min = Number(input.min);
    const max = Number(input.max);
    input.style.setProperty("--fill", `${100 * (value - min) / (max - min)}%`);
    const output = get(`${key}-value`);
    if (key === "outer") {
      output.firstElementChild.textContent = value.toFixed(1);
      input.setAttribute("aria-valuetext", `${value.toFixed(1)} 倍引力半径`);
      return;
    }
    if (key === "temperature") {
      output.value = `${integer.format(value)} K`;
      input.setAttribute("aria-valuetext", `${integer.format(value)} 开尔文`);
      return;
    }
    output.value = value.toFixed(2) + (key === "spin" ? "" : "×");
  }

  function updatePresets() {
    for (const button of presetButtons) {
      const preset = presets[button.dataset.preset];
      const matches = Object.entries(preset.parameters).every(([key, value]) => value === parameters[key])
        && preset.view === baseView;
      button.setAttribute("aria-pressed", String(matches));
    }
  }

  function syncParameters() {
    for (const input of allParameters) {
      const value = parameters[input.dataset.param];
      if (input.type === "checkbox") {
        input.checked = value;
      } else {
        input.value = value;
        describeControl(input);
      }
    }
    updatePresets();
  }

  function showView() {
    const angle = Math.round(view.yaw / radians);
    const elevation = Math.round(view.pitch / radians);
    get("azimuth").textContent = `${String((angle + 360) % 360).padStart(3, "0")}°`;
    get("elevation").textContent = `${elevation < 0 ? "−" : "+"}${String(Math.abs(elevation)).padStart(2, "0")}°`;
    get("zoom").textContent = `${view.zoom.toFixed(2)}×`;
    requestFrame();
  }

  function updateStatus(state, description) {
    status.dataset.state = state;
    statusText.textContent = description;
  }

  function setPlaying(value) {
    playing = value;
    resetPerformanceSample();
    lastFrame = 0;
    frameDeadline = 0;
    playback.querySelector("span").textContent = playing ? "暂停" : "播放";
    playback.querySelector("use").setAttribute("href", playing ? "#icon-pause" : "#icon-play");
    if (renderer) updateStatus(playing ? "running" : "paused", playing ? "实时渲染" : "动画已暂停");
    requestFrame();
  }

  function resetPerformanceSample() {
    measureDuration = 0;
    measureFrames = 0;
  }

  function samplePerformance(duration) {
    if (duration <= 0 || duration > 800) return;
    measureDuration += duration;
    measureFrames++;
    if (measureDuration < 1450) return;
    const average = measureDuration / measureFrames;
    const nextScale = average > 27
      ? Math.max(0.48, autoScale - 0.16)
      : average < 18.3 ? Math.min(1, autoScale + 0.06) : autoScale;
    if (nextScale !== autoScale) {
      autoScale = nextScale;
      resizePending = true;
    }
    resetPerformanceSample();
  }

  function requestFrame() {
    renderPending = true;
    scheduleFrame();
  }

  function scheduleFrame() {
    if (!frameId && renderer && !document.hidden) frameId = requestAnimationFrame(renderFrame);
  }

  function renderFrame(now) {
    frameId = 0;
    if (!renderer || document.hidden) return;
    if (!renderPending && now + 0.45 < frameDeadline) {
      if (playing) scheduleFrame();
      return;
    }
    try {
      const profile = qualityProfiles[qualitySelect.value];
      const automatic = qualitySelect.value === "auto";
      const duration = now - lastFrame;
      const interval = 1000 / profile.fps;
      if (playing && lastFrame > 0) {
        simulationTime += Math.min(duration, 100) / 1000;
        if (automatic) samplePerformance(duration);
      }
      lastFrame = playing ? now : 0;
      frameDeadline = renderPending
        ? now + interval
        : Math.max(frameDeadline + interval, now + 0.30 * interval);
      renderPending = false;

      if (resizePending) {
        const width = stage.clientWidth;
        const height = stage.clientHeight;
        if (!width || !height) return;
        const deviceScale = clamp(devicePixelRatio, profile.minimum, profile.scale);
        const scale = deviceScale * (automatic ? autoScale : 1);
        renderer.resize(width, height, scale, profile.pixels);
        resizePending = false;
      }
      renderer.render(parameters, view, simulationTime);
    } catch (error) {
      showRenderError(error);
    }
    if (playing) scheduleFrame();
  }

  function showRenderError(error) {
    console.error("黑洞渲染失败", error);
    cancelAnimationFrame(frameId);
    frameId = 0;
    renderer = undefined;
    playback.disabled = true;
    message.textContent = error.message;
    message.hidden = false;
    updateStatus("error", "渲染中断");
  }

  function startRenderer() {
    try {
      renderer = new window.BlackHoleRenderer(canvas);
      resizePending = true;
      playback.disabled = false;
      message.hidden = true;
      setPlaying(playing);
    } catch (error) {
      showRenderError(error);
    }
  }

  function choosePreset(name) {
    const preset = presets[name];
    parameters = { ...preset.parameters };
    baseView = preset.view;
    view = { ...baseView };
    syncParameters();
    showView();
  }

  function refreshSize() {
    resizePending = true;
    requestFrame();
  }

  for (const input of allParameters) {
    input.addEventListener("input", () => {
      parameters[input.dataset.param] = input.type === "checkbox" ? input.checked : input.valueAsNumber;
      describeControl(input);
      updatePresets();
      requestFrame();
    });
  }
  for (const button of presetButtons) {
    button.addEventListener("click", () => choosePreset(button.dataset.preset));
  }
  get("reset").addEventListener("click", () => {
    qualitySelect.value = "auto";
    autoScale = 1;
    simulationTime = 0.8;
    choosePreset("cinema");
    setPlaying(!prefersReducedMotion.matches);
    refreshSize();
  });
  get("recenter").addEventListener("click", () => {
    view = { ...baseView };
    showView();
  });
  playback.addEventListener("click", () => setPlaying(!playing));
  qualitySelect.addEventListener("change", () => {
    resetPerformanceSample();
    autoScale = 1;
    refreshSize();
  });
  prefersReducedMotion.addEventListener("change", (event) => setPlaying(!event.matches));

  const pointers = new Map();
  const pinchDistance = () => {
    const [a, b] = pointers.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  function rotate(yaw, pitch) {
    view.yaw = ((view.yaw + yaw) % turn + turn) % turn;
    view.pitch = clamp(view.pitch + pitch, -88 * radians, 88 * radians);
    showView();
  }
  function zoomBy(factor) {
    view.zoom = clamp(view.zoom * factor, 0.56, 2.6);
    showView();
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || pointers.size === 2) return;
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.dragging = "";
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
  });
  canvas.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const distanceBefore = pointers.size === 2 ? pinchDistance() : 0;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pointers.size === 2) {
      if (distanceBefore > 0) zoomBy(pinchDistance() / distanceBefore);
    } else {
      rotate((previous.x - event.clientX) * 0.007, (event.clientY - previous.y) * 0.007);
    }
  });
  function finishDrag(event) {
    pointers.delete(event.pointerId);
    if (pointers.size === 0) delete canvas.dataset.dragging;
  }
  for (const name of ["pointerup", "pointercancel", "lostpointercapture"]) {
    canvas.addEventListener(name, finishDrag);
  }
  canvas.addEventListener("wheel", (event) => {
    if (event.ctrlKey) return;
    event.preventDefault();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? stage.clientHeight : 1;
    zoomBy(Math.exp(-event.deltaY * unit * 0.00125));
  }, { passive: false });

  canvas.addEventListener("keydown", (event) => {
    const angle = (event.shiftKey ? 12 : 4) * radians;
    switch (event.key) {
      case "ArrowLeft": rotate(angle, 0); break;
      case "ArrowRight": rotate(-angle, 0); break;
      case "ArrowUp": rotate(0, angle); break;
      case "ArrowDown": rotate(0, -angle); break;
      case "+": case "=": zoomBy(1.12); break;
      case "-": zoomBy(1 / 1.12); break;
      case " ":
        if (renderer && !event.repeat) setPlaying(!playing);
        break;
      case "Home":
        view = { ...baseView };
        showView();
        break;
      default: return;
    }
    event.preventDefault();
  });

  if (document.fullscreenEnabled) {
    fullscreen.hidden = false;
    fullscreen.setAttribute("aria-label", "全屏");
    fullscreen.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await shell.requestFullscreen();
      } catch (error) {
        console.error("切换全屏失败", error);
      }
    });
    document.addEventListener("fullscreenchange", () => {
      const active = document.fullscreenElement === shell;
      const label = active ? "退出全屏" : "全屏";
      fullscreen.setAttribute("aria-label", label);
      fullscreen.querySelector("span").textContent = label;
      fullscreen.querySelector("use").setAttribute("href", active ? "#icon-shrink" : "#icon-expand");
      refreshSize();
    });
  }

  const resizeObserver = new ResizeObserver(refreshSize);
  resizeObserver.observe(stage);
  window.addEventListener("resize", refreshSize);
  document.addEventListener("visibilitychange", () => {
    lastFrame = 0;
    frameDeadline = 0;
    resetPerformanceSample();
    if (document.hidden) {
      cancelAnimationFrame(frameId);
      frameId = 0;
    } else {
      refreshSize();
    }
  });
  canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    showRenderError(new Error("图形上下文已中断，等待浏览器恢复…"));
  });
  canvas.addEventListener("webglcontextrestored", startRenderer);

  syncParameters();
  showView();
  requestAnimationFrame(startRenderer);
})();
