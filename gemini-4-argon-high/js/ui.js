/**
 * GARGANTUA — Interactive UI Controller & Real-Time Astrophysical Telemetry Binder
 */
(function (global) {
  'use strict';

  const { DEFAULT_PARAMS, PRESETS, computeAstrophysics } = global.GargantuaConfig;
  const GargantuaRenderer = global.GargantuaRenderer;

  function initApp() {
    const canvas = document.getElementById('gl-canvas');
    const state = Object.assign({}, DEFAULT_PARAMS);

    const sliderConfigs = [
      { key: 'massSolar', format: (v) => `${Math.round(v)} M☉×10⁶` },
      { key: 'spin', format: (v) => `${Number(v).toFixed(3)} c` },
      { key: 'lensingStrength', format: (v) => `${Number(v).toFixed(2)}×` },
      { key: 'horizonRadius', format: (v) => `${Number(v).toFixed(2)} R<sub>s</sub>`, html: true },
      { key: 'photonRingIntensity', format: (v) => Number(v).toFixed(2) },
      { key: 'shadowAsymmetry', format: (v) => Number(v).toFixed(2) },
      { key: 'dopplerBeaming', format: (v) => Number(v).toFixed(2) },
      { key: 'diskTemperature', format: (v) => `${Math.round(v)} K` },
      { key: 'diskInnerScale', format: (v) => `${Number(v).toFixed(2)}×` },
      { key: 'diskOuterRadius', format: (v) => `${Number(v).toFixed(1)} R<sub>s</sub>`, html: true },
      { key: 'diskThickness', format: (v) => Number(v).toFixed(2) },
      { key: 'diskDensity', format: (v) => Number(v).toFixed(2) },
      { key: 'diskRotationSpeed', format: (v) => Number(v).toFixed(2) },
      { key: 'diskTurbulence', format: (v) => Number(v).toFixed(2) },
      { key: 'jetIntensity', format: (v) => Number(v).toFixed(2) },
      { key: 'starDensity', format: (v) => Number(v).toFixed(2) },
      { key: 'nebulaIntensity', format: (v) => Number(v).toFixed(2) },
      { key: 'einsteinRingBoost', format: (v) => Number(v).toFixed(2) },
      { key: 'bloomStrength', format: (v) => Number(v).toFixed(2) },
      { key: 'anamorphicFlare', format: (v) => Number(v).toFixed(2) },
      { key: 'exposure', format: (v) => Number(v).toFixed(2) },
      { key: 'chromaticAberration', format: (v) => Number(v).toFixed(2) },
      { key: 'camDistance', format: (v) => `${Number(v).toFixed(1)} R<sub>s</sub>`, html: true, isCam: true },
      { key: 'camElevation', format: (v) => `${Number(v).toFixed(1)}°`, isCam: true },
      { key: 'camRoll', format: (v) => `${Number(v).toFixed(1)}°`, isCam: true },
      { key: 'camFov', format: (v) => `${Math.round(v)}°`, isCam: true },
      { key: 'raySteps', format: (v) => `${Math.round(v)} 步` },
      { key: 'renderScale', format: (v) => `${Number(v).toFixed(2)}×` }
    ];

    // Update top telemetry bar from physical formulas
    function updateTelemetryDisplay() {
      const astro = computeAstrophysics(state);
      const elRs = document.getElementById('tel-rs');
      const elIsco = document.getElementById('tel-isco');
      const elPh = document.getElementById('tel-ph');
      const elBeta = document.getElementById('tel-beta');
      const elDilation = document.getElementById('tel-dilation');

      if (elRs) {
        const exp8 = (astro.rsMillionKm / 100.0).toFixed(2);
        elRs.textContent = `${exp8}×10⁸ km (${astro.rsAU.toFixed(2)} AU)`;
      }
      if (elIsco) {
        elIsco.innerHTML = `${astro.rIscoRs.toFixed(2)} R<sub>s</sub>`;
      }
      if (elPh) {
        elPh.innerHTML = `${astro.rPhRs.toFixed(2)} R<sub>s</sub>`;
      }
      if (elBeta) {
        elBeta.textContent = `${astro.betaInner.toFixed(2)} c`;
      }
      if (elDilation) {
        elDilation.textContent = `${astro.timeDilationInner.toFixed(2)}×`;
      }
    }

    // Sync all DOM inputs and badges with current state
    function syncUIFromState() {
      sliderConfigs.forEach((cfg) => {
        const inp = document.getElementById(`inp-${cfg.key}`);
        const valEl = document.getElementById(`val-${cfg.key}`);
        const v = state[cfg.key];
        if (inp && v !== undefined) {
          inp.value = v;
        }
        if (valEl && v !== undefined) {
          if (cfg.html) {
            valEl.innerHTML = cfg.format(v);
          } else {
            valEl.textContent = cfg.format(v);
          }
        }
      });

      const chkDisk = document.getElementById('chk-diskEnabled');
      if (chkDisk) chkDisk.checked = !!state.diskEnabled;

      const chkGrid = document.getElementById('chk-spacetimeGrid');
      if (chkGrid) chkGrid.checked = !!state.spacetimeGrid;

      const chkAuto = document.getElementById('chk-autoRotate');
      if (chkAuto) chkAuto.checked = !!state.autoRotate;

      const selColor = document.getElementById('sel-colorMode');
      if (selColor) selColor.value = String(state.colorMode);

      updateTelemetryDisplay();
    }

    // Instantiate Three.js Renderer
    const renderer = new GargantuaRenderer(
      canvas,
      state,
      (updatedCamParams) => {
        state.camDistance = updatedCamParams.camDistance;
        state.camElevation = updatedCamParams.camElevation;
        state.camAzimuth = updatedCamParams.camAzimuth;
        state.camRoll = updatedCamParams.camRoll;
        state.camFov = updatedCamParams.camFov;

        // Update camera sliders smoothly when user orbits/zooms with mouse
        ['camDistance', 'camElevation', 'camRoll', 'camFov'].forEach((k) => {
          const cfg = sliderConfigs.find((c) => c.key === k);
          const inp = document.getElementById(`inp-${k}`);
          const valEl = document.getElementById(`val-${k}`);
          if (inp) inp.value = state[k];
          if (valEl && cfg) {
            if (cfg.html) valEl.innerHTML = cfg.format(state[k]);
            else valEl.textContent = cfg.format(state[k]);
          }
        });
        updateTelemetryDisplay();
      },
      (stats) => {
        const elFps = document.getElementById('tel-fps');
        if (elFps) {
          elFps.textContent = `${stats.fps} FPS (${stats.width}×${stats.height})`;
        }
      }
    );

    // Clear active highlight on preset cards when custom tweaked
    function clearPresetHighlight() {
      document.querySelectorAll('.preset-card').forEach((btn) => btn.classList.remove('active'));
    }

    // Bind range sliders
    sliderConfigs.forEach((cfg) => {
      const inp = document.getElementById(`inp-${cfg.key}`);
      const valEl = document.getElementById(`val-${cfg.key}`);
      if (!inp) return;

      inp.addEventListener('input', () => {
        const num = parseFloat(inp.value);
        state[cfg.key] = num;
        if (valEl) {
          if (cfg.html) valEl.innerHTML = cfg.format(num);
          else valEl.textContent = cfg.format(num);
        }
        clearPresetHighlight();
        renderer.updateParams(state, !!cfg.isCam);
        updateTelemetryDisplay();
      });
    });

    // Bind checkboxes & selects
    const chkDisk = document.getElementById('chk-diskEnabled');
    if (chkDisk) {
      chkDisk.addEventListener('change', () => {
        state.diskEnabled = chkDisk.checked;
        clearPresetHighlight();
        renderer.updateParams(state, false);
      });
    }

    const chkGrid = document.getElementById('chk-spacetimeGrid');
    if (chkGrid) {
      chkGrid.addEventListener('change', () => {
        state.spacetimeGrid = chkGrid.checked;
        clearPresetHighlight();
        renderer.updateParams(state, false);
      });
    }

    const chkAuto = document.getElementById('chk-autoRotate');
    if (chkAuto) {
      chkAuto.addEventListener('change', () => {
        state.autoRotate = chkAuto.checked;
        renderer.updateParams(state, false);
      });
    }

    const selColor = document.getElementById('sel-colorMode');
    if (selColor) {
      selColor.addEventListener('change', () => {
        state.colorMode = parseInt(selColor.value, 10);
        clearPresetHighlight();
        renderer.updateParams(state, false);
      });
    }

    // Quality Preset Selector
    const selQuality = document.getElementById('sel-qualityPreset');
    if (selQuality) {
      selQuality.addEventListener('change', () => {
        const q = selQuality.value;
        if (q === 'ultra') {
          state.raySteps = 188;
          state.renderScale = 1.2;
        } else if (q === 'high') {
          state.raySteps = 136;
          state.renderScale = 1.0;
        } else if (q === 'balanced') {
          state.raySteps = 104;
          state.renderScale = 0.85;
        } else if (q === 'performance') {
          state.raySteps = 76;
          state.renderScale = 0.65;
        }
        syncUIFromState();
        renderer.updateParams(state, false);
      });
    }

    // Bind Curated Astrophysical Presets
    document.querySelectorAll('.preset-card').forEach((card) => {
      card.addEventListener('click', () => {
        const presetKey = card.getAttribute('data-preset');
        const preset = PRESETS[presetKey];
        if (!preset) return;

        document.querySelectorAll('.preset-card').forEach((b) => b.classList.remove('active'));
        card.classList.add('active');

        Object.assign(state, preset.params);
        syncUIFromState();
        renderer.updateParams(state, true);
      });
    });

    // Bind Quick Camera Angle Buttons
    const camAngles = {
      cinematic: { distance: 13.8, elevation: 7.2, azimuth: -18.0, roll: -8.5, fov: 44 },
      edge: { distance: 14.2, elevation: 1.1, azimuth: 0.0, roll: 0.0, fov: 42 },
      high: { distance: 15.0, elevation: 34.0, azimuth: -25.0, roll: -12.0, fov: 45 },
      polar: { distance: 16.5, elevation: 82.0, azimuth: 0.0, roll: 0.0, fov: 46 },
      grazing: { distance: 5.8, elevation: 3.6, azimuth: 16.0, roll: -15.0, fov: 56 }
    };

    document.querySelectorAll('[data-cam]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.getAttribute('data-cam');
        const target = camAngles[key];
        if (!target) return;
        Object.assign(state, {
          camDistance: target.distance,
          camElevation: target.elevation,
          camAzimuth: target.azimuth,
          camRoll: target.roll,
          camFov: target.fov
        });
        syncUIFromState();
        renderer.setCameraTarget(target);
      });
    });

    // Reset to Gargantua Default
    const btnReset = document.getElementById('btn-reset-defaults');
    if (btnReset) {
      btnReset.addEventListener('click', () => {
        Object.assign(state, DEFAULT_PARAMS);
        document.querySelectorAll('.preset-card').forEach((b) => {
          b.classList.toggle('active', b.getAttribute('data-preset') === 'gargantua');
        });
        syncUIFromState();
        renderer.updateParams(state, true);
      });
    }

    // Sidebar Collapse & Cinema Mode Toggles
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    const labelSidebar = document.getElementById('label-sidebar');
    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener('click', () => {
        document.body.classList.remove('cinema-mode');
        const collapsed = document.body.classList.toggle('sidebar-collapsed');
        if (labelSidebar) {
          labelSidebar.textContent = collapsed ? '⚙️ 展开面板' : '⚙️ 收起面板';
        }
      });
    }

    const btnCinema = document.getElementById('btn-cinema');
    const labelCinema = document.getElementById('label-cinema');
    function toggleCinemaMode() {
      const active = document.body.classList.toggle('cinema-mode');
      if (labelCinema) {
        labelCinema.textContent = active ? '🎬 退出纯享' : '🎬 纯享模式';
      }
    }
    if (btnCinema) {
      btnCinema.addEventListener('click', toggleCinemaMode);
    }

    window.addEventListener('keydown', (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (e.key === 'h' || e.key === 'H') {
        toggleCinemaMode();
      }
    });

    // Screenshot Capture Button
    const btnScreenshot = document.getElementById('btn-screenshot');
    if (btnScreenshot) {
      btnScreenshot.addEventListener('click', () => {
        renderer.captureScreenshot();
      });
    }

    syncUIFromState();
    renderer.start();

    // Expose for debugging/testing
    global.gargantuaApp = { state, renderer, syncUIFromState };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})(window);
