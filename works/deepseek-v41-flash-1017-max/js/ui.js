/*
 * GARGANTUA — observation console, readouts and boot sequence.
 */
(function () {
  'use strict';

  const G = (window.GARGANTUA = window.GARGANTUA || {});

  class UI {
    constructor(options) {
      this.state = options.state;
      this.callbacks = options.callbacks || {};
      this.elements = {};
      this.controls = {};
      this.presetCards = new Map();
      this.toastTimer = 0;
      this.consoleOpen = true;
      this.immersive = false;

      this.presetGrid = document.getElementById('preset-grid');
      this.sectionsRoot = document.getElementById('control-sections');
      this.console = document.getElementById('console');
      this.consoleScroll = document.getElementById('console-scroll');
      this.qualitySegments = document.getElementById('quality-segments');
      this.toast = document.getElementById('toast');
      this.toastText = document.getElementById('toast-text');
      this.hudFps = document.getElementById('hud-fps');
      this.consoleFps = document.getElementById('console-fps');
      this.teleDistance = document.getElementById('tele-distance');
      this.teleElevation = document.getElementById('tele-elevation');
      this.teleFov = document.getElementById('tele-fov');
      this.teleResolution = document.getElementById('tele-resolution');
      this.gestureHint = document.getElementById('gesture-hint');

      this.buildPresets();
      this.buildControls();
      this.bindChrome();

      const initiallyOpen = window.innerWidth > 1024;
      this.setConsoleOpen(initiallyOpen, false);
      this.setQualityMode(this.state.quality || 'auto');
      this.setActivePreset('gargantua');
      this.syncAll();
    }

    /* ---------------------------------------------------------------- build */

    buildPresets() {
      const fragment = document.createDocumentFragment();
      for (const preset of G.PARAMS.presets) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'preset-card';
        button.dataset.preset = preset.id;
        button.setAttribute('aria-pressed', 'false');
        button.title = `${preset.name} · ${preset.desc}`;
        button.innerHTML = `
          <span class="preset-swatch" style="--preset-a:${preset.swatch[0]};--preset-b:${preset.swatch[1]}"></span>
          <span class="preset-copy">
            <span class="preset-name">${preset.name}</span>
            <span class="preset-desc">${preset.desc}</span>
          </span>
        `;
        button.addEventListener('click', () => {
          this.setActivePreset(preset.id);
          if (this.callbacks.onPreset) this.callbacks.onPreset(preset);
        });
        this.presetCards.set(preset.id, button);
        fragment.appendChild(button);
      }
      this.presetGrid.appendChild(fragment);
    }

    buildControls() {
      const fragment = document.createDocumentFragment();

      for (const section of G.PARAMS.sections) {
        const sectionEl = document.createElement('section');
        sectionEl.className = 'control-section';
        sectionEl.dataset.section = section.id;

        const header = document.createElement('button');
        header.type = 'button';
        header.className = 'section-toggle';
        header.setAttribute('aria-expanded', 'true');
        header.innerHTML = `
          <span class="section-number">${section.index}</span>
          <span class="section-title">${section.title}</span>
          <span class="section-en">${section.en}</span>
          <svg class="section-chevron" viewBox="0 0 12 12" fill="none" aria-hidden="true">
            <path d="M2.5 4.5 6 8l3.5-3.5" stroke="currentColor" stroke-width="1.1" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        `;

        const body = document.createElement('div');
        body.className = 'controls-body';
        body.id = `section-body-${section.id}`;
        header.setAttribute('aria-controls', body.id);

        header.addEventListener('click', () => {
          const collapsed = sectionEl.classList.toggle('is-collapsed');
          header.setAttribute('aria-expanded', String(!collapsed));
        });

        for (const control of section.controls) {
          body.appendChild(this.buildControl(control));
        }

        sectionEl.appendChild(header);
        sectionEl.appendChild(body);
        fragment.appendChild(sectionEl);
      }

      this.sectionsRoot.appendChild(fragment);
    }

    buildControl(control) {
      if (control.type === 'toggle') return this.buildToggle(control);

      const wrapper = document.createElement('div');
      wrapper.className = 'control';

      const head = document.createElement('div');
      head.className = 'control-head';

      const label = document.createElement('label');
      label.className = 'control-name';
      label.htmlFor = `ctl-${control.key}`;
      label.innerHTML = `${control.label} <span class="control-en">${control.en}</span>`;

      const output = document.createElement('output');
      output.className = 'control-output';
      output.htmlFor = `ctl-${control.key}`;

      const input = document.createElement('input');
      input.className = 'control-range';
      input.id = `ctl-${control.key}`;
      input.type = 'range';
      input.min = String(control.min);
      input.max = String(control.max);
      input.step = String(control.step);
      input.value = String(this.state[control.key]);
      input.setAttribute('aria-label', control.label);
      this.setFill(input, control, Number(this.state[control.key]));

      input.addEventListener('input', () => {
        const value = Number(input.value);
        this.updateControlDisplay(control, value);
        this.setActivePreset(null);
        if (this.callbacks.onParamChange) this.callbacks.onParamChange(control.key, value, control, 'ui');
      });

      head.appendChild(label);
      head.appendChild(output);

      const scale = document.createElement('div');
      scale.className = 'range-scale';
      const minLabel = document.createElement('span');
      const maxLabel = document.createElement('span');
      minLabel.textContent = G.PARAMS.formatValue(control, control.min, true);
      maxLabel.textContent = G.PARAMS.formatValue(control, control.max, true);
      scale.appendChild(minLabel);
      scale.appendChild(maxLabel);

      wrapper.appendChild(head);
      wrapper.appendChild(input);
      wrapper.appendChild(scale);

      this.controls[control.key] = { control, wrapper, input, output };
      this.elements[control.key] = input;

      this.updateControlDisplay(control, Number(this.state[control.key]));
      return wrapper;
    }

    buildToggle(control) {
      const wrapper = document.createElement('div');
      wrapper.className = 'control control--toggle';

      const head = document.createElement('div');
      head.className = 'control-head';
      const label = document.createElement('label');
      label.className = 'control-name';
      label.htmlFor = `ctl-${control.key}`;
      label.innerHTML = `${control.label} <span class="control-en">${control.en}</span>`;

      const toggle = document.createElement('label');
      toggle.className = 'switch';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `ctl-${control.key}`;
      input.checked = !!this.state[control.key];
      input.setAttribute('aria-label', control.label);
      const track = document.createElement('span');
      track.className = 'switch-track';
      toggle.appendChild(input);
      toggle.appendChild(track);

      input.addEventListener('change', () => {
        this.setActivePreset(null);
        if (this.callbacks.onParamChange) this.callbacks.onParamChange(control.key, input.checked, control, 'ui');
      });

      head.appendChild(label);
      wrapper.appendChild(head);
      wrapper.appendChild(toggle);

      this.controls[control.key] = { control, wrapper, input, output: null };
      this.elements[control.key] = input;
      return wrapper;
    }

    bindChrome() {
      document.getElementById('btn-close-console').addEventListener('click', () => {
        this.setConsoleOpen(false);
      });
      document.getElementById('btn-open-console').addEventListener('click', () => {
        this.setConsoleOpen(true);
      });

      document.getElementById('btn-reset').addEventListener('click', () => {
        if (this.callbacks.onReset) this.callbacks.onReset();
      });
      document.getElementById('btn-capture').addEventListener('click', () => {
        if (this.callbacks.onCapture) this.callbacks.onCapture();
      });

      this.qualitySegments.addEventListener('click', (event) => {
        const button = event.target.closest('button[data-quality]');
        if (!button) return;
        const mode = button.dataset.quality;
        this.setQualityMode(mode);
        if (this.callbacks.onQualityChange) this.callbacks.onQualityChange(mode);
      });

      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this._fpsPaused = true;
      });
    }

    /* --------------------------------------------------------------- values */

    setFill(input, control, value) {
      const min = control.min;
      const max = control.max;
      const percent = max === min ? 0 : ((value - min) / (max - min)) * 100;
      input.style.setProperty('--fill', `${Math.max(0, Math.min(100, percent)).toFixed(2)}%`);
    }

    updateControlDisplay(control, value) {
      const entry = this.controls[control.key];
      if (!entry) return;

      if (control.type === 'toggle') {
        entry.input.checked = !!value;
        return;
      }

      const numeric = Number(value);
      const outputHtml = control.unit
        ? `${G.PARAMS.formatValue(control, numeric)}<small>${control.unit}</small>`
        : G.PARAMS.formatValue(control, numeric);
      entry.output.innerHTML = outputHtml;
      this.setFill(entry.input, control, numeric);
    }

    setValue(key, value) {
      const entry = this.controls[key];
      if (!entry) return;
      const control = entry.control;

      this.updateControlDisplay(control, value);

      if (control.type === 'toggle') {
        entry.input.checked = !!value;
      } else {
        const numeric = Number(value);
        if (String(entry.input.value) !== String(numeric)) entry.input.value = String(numeric);
      }
    }

    syncAll() {
      for (const key of Object.keys(this.controls)) {
        this.setValue(key, this.state[key]);
      }
      this.setQualityMode(this.state.quality || 'auto');
    }

    setActivePreset(id) {
      this.activePreset = id;
      for (const [presetId, card] of this.presetCards) {
        const active = presetId === id;
        card.classList.toggle('is-active', active);
        card.setAttribute('aria-pressed', String(active));
      }
    }

    setQualityMode(mode) {
      const buttons = this.qualitySegments.querySelectorAll('button[data-quality]');
      for (const button of buttons) {
        const active = button.dataset.quality === mode;
        button.classList.toggle('is-active', active);
        button.setAttribute('aria-pressed', String(active));
      }
    }

    /* ---------------------------------------------------------------- chrome */

    setConsoleOpen(open, notify = true) {
      this.consoleOpen = open;
      document.body.classList.toggle('console-open', open);
      if (notify && this.callbacks.onPanelToggle) this.callbacks.onPanelToggle(open);
    }

    setImmersive(hidden) {
      this.immersive = hidden;
      document.body.classList.toggle('ui-hidden', hidden);
    }

    setAutoOrbit(active) {
      const button = document.getElementById('btn-auto-orbit');
      if (!button) return;
      button.setAttribute('aria-pressed', String(!!active));
      button.setAttribute('aria-label', active ? '关闭自动环绕' : '开启自动环绕');
    }

    dismissGestureHint() {
      if (this.gestureHint) this.gestureHint.classList.add('is-dismissed');
    }

    /* ------------------------------------------------------------- readouts */

    setFps(fps) {
      const value = Math.max(0, Math.round(fps));
      if (this.hudFps) this.hudFps.textContent = `${value} FPS`;
      if (this.consoleFps) this.consoleFps.textContent = String(value);
    }

    setObserver(distance, elevation, fov) {
      if (this.teleDistance) {
        this.teleDistance.innerHTML = `${distance.toFixed(1)} <small>Rs</small>`;
      }
      if (this.teleElevation) {
        const sign = elevation >= 0 ? '+' : '−';
        this.teleElevation.innerHTML = `${sign}${Math.abs(elevation).toFixed(1)}<small>°</small>`;
      }
      if (this.teleFov) {
        this.teleFov.innerHTML = `${fov.toFixed(1)}<small>°</small>`;
      }
    }

    setRenderStats(stats) {
      if (!this.teleResolution) return;
      const scale = stats.quality === 'auto' ? `${stats.scale.toFixed(2)}×` : `${stats.scale.toFixed(2)}×`;
      this.teleResolution.innerHTML = `${stats.sceneWidth} × ${stats.sceneHeight}<small>${scale}</small>`;
    }

    /* ----------------------------------------------------------------- toast */

    showToast(message, duration = 2300) {
      if (!this.toast) return;
      window.clearTimeout(this.toastTimer);
      this.toastText.textContent = message;
      this.toast.classList.add('is-visible');
      this.toastTimer = window.setTimeout(() => {
        this.toast.classList.remove('is-visible');
      }, duration);
    }
  }

  class BootSequence {
    constructor() {
      this.root = document.getElementById('boot');
      this.bar = document.getElementById('boot-bar');
      this.percent = document.getElementById('boot-percent');
      this.status = document.getElementById('boot-status-text');
      this.meter = document.getElementById('boot-meter');
      this.done = false;
    }

    setProgress(progress, label) {
      if (this.done) return;
      const clamped = Math.max(0, Math.min(1, progress));
      const percent = Math.round(clamped * 100);
      if (this.bar) this.bar.style.width = `${percent}%`;
      if (this.percent) this.percent.textContent = `${String(percent).padStart(2, '0')}%`;
      if (this.status && label) this.status.textContent = label;
      if (this.meter) this.meter.setAttribute('aria-valuenow', String(percent));
    }

    finish() {
      if (this.done) return;
      this.done = true;
      this.setProgress(1, '观测链路已建立');
      if (this.root) {
        this.root.classList.add('is-complete');
        this.root.setAttribute('aria-hidden', 'true');
        window.setTimeout(() => {
          if (this.root && this.root.parentNode) this.root.parentNode.removeChild(this.root);
        }, 1200);
      }
    }

    fail(message) {
      this.setProgress(0.34, '时空链路中断');
      const error = document.getElementById('error-screen');
      const errorMessage = document.getElementById('error-message');
      if (errorMessage && message) errorMessage.textContent = message;
      if (error) error.hidden = false;
      if (this.root) this.root.classList.add('is-complete');
    }
  }

  G.UI = UI;
  G.BootSequence = BootSequence;
})();
