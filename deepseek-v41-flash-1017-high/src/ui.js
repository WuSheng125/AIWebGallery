import { CONTROL_GROUPS, PRESETS, QUALITY_OPTIONS } from './params.js';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export class ObservationUI {
  constructor(options) {
    this.state = options.state;
    this.handlers = options.handlers;
    this.controls = new Map();
    this.presets = new Map();
    this.panelOpen = true;
    this.toastTimer = 0;
    this.hintTimer = 0;
    this.$ = (selector) => document.querySelector(selector);

    this.dom = {
      body: document.body,
      panel: this.$('#panel'),
      panelScroll: this.$('#panelScroll'),
      presetGrid: this.$('#presetGrid'),
      controlMount: this.$('#controlMount'),
      panelBtn: this.$('#panelBtn'),
      panelClose: this.$('#panelClose'),
      panelLaunch: this.$('#panelLaunch'),
      hideBtn: this.$('#hideBtn'),
      fullBtn: this.$('#fullBtn'),
      revealBtn: this.$('#revealBtn'),
      resetViewBtn: this.$('#resetViewBtn'),
      resetAllBtn: this.$('#resetAllBtn'),
      snapshotBtn: this.$('#snapshotBtn'),
      hint: this.$('#hint'),
      hudDistance: this.$('#hudDistance'),
      hudElevation: this.$('#hudElevation'),
      hudFov: this.$('#hudFov'),
      hudPerf: this.$('#hudPerf'),
      hudBar: this.$('#hudBar'),
      statusText: this.$('#statusText'),
      toast: this.$('#toast'),
      liveBadge: this.$('#liveBadge'),
    };
  }

  mount() {
    this.buildPresets();
    this.buildControls();
    this.bindStaticControls();
    this.bindPanel();

    const desktop = window.matchMedia('(min-width: 901px)').matches;
    this.setPanelOpen(desktop, false);

    this.hintTimer = window.setTimeout(() => this.dom.hint.classList.add('is-hidden'), 9800);
    window.addEventListener('pointerdown', () => this.hideHint(), { once: true, passive: true });
  }

  /* ---------------------------------------------------------------- presets */

  buildPresets() {
    for (const preset of PRESETS) {
      const button = el('button', 'preset');
      button.type = 'button';
      button.dataset.preset = preset.id;
      button.title = preset.meta;
      button.append(el('span', 'preset__name', preset.name));
      button.append(el('span', 'preset__meta', preset.meta));
      button.addEventListener('click', () => {
        this.markPreset(preset.id);
        this.handlers.onPreset(preset);
      });
      this.presets.set(preset.id, button);
      this.dom.presetGrid.append(button);
    }
    this.markPreset('gargantua');
  }

  markPreset(id) {
    for (const [key, button] of this.presets) {
      button.classList.toggle('is-active', key === id);
    }
  }

  clearPreset() {
    for (const button of this.presets.values()) button.classList.remove('is-active');
  }

  /* --------------------------------------------------------------- controls */

  buildControls() {
    for (const group of CONTROL_GROUPS) {
      const section = el('section', 'control-group');
      section.dataset.group = group.id;

      const heading = el('div', 'section-heading');
      heading.append(el('span', 'section-heading__index', group.index));
      heading.append(el('span', 'section-heading__title', group.title));
      heading.append(el('span', 'section-heading__en', group.en));
      section.append(heading);

      if (group.id === 'disk') {
        // Nothing above the sliders; the disk visibility toggle lives below.
      }

      for (const control of group.controls) {
        section.append(this.buildRangeControl(control));
      }

      if (group.toggle) {
        section.append(
          this.buildSwitchRow(group.toggle.key, group.toggle.label, group.toggle.hint)
        );
      }

      if (group.id === 'imaging') {
        section.append(this.buildQualityRow());
        section.append(
          this.buildSwitchRow('autoOrbit', '自动环绕', '缓慢巡航，拖动后短暂暂停')
        );
      }

      this.dom.controlMount.append(section);
    }
  }

  buildRangeControl(control) {
    const wrapper = el('div', 'control');
    wrapper.dataset.control = control.key;

    const top = el('div', 'control__top');
    const label = el('label', 'control__label', control.label);
    label.htmlFor = `range-${control.key}`;
    if (control.hint) label.title = control.hint;

    const value = el('span', 'control__value');
    const number = el('b');
    value.append(number);
    if (control.unit) value.append(el('i', null, control.unit));

    top.append(label, value);

    const range = el('input', 'range');
    range.type = 'range';
    range.id = `range-${control.key}`;
    range.min = String(control.min);
    range.max = String(control.max);
    range.step = String(control.step);
    range.value = String(this.state[control.key]);
    range.title = control.hint || control.label;
    range.setAttribute('aria-label', control.label);

    const setFill = (raw) => {
      const pct = ((raw - control.min) / (control.max - control.min)) * 100;
      range.style.setProperty('--fill', `${clamp(pct, 0, 100).toFixed(2)}%`);
    };

    const setDisplay = (raw) => {
      const clipped = clamp(raw, control.min, control.max);
      const text =
        control.key === 'temperature'
          ? Math.round(clipped).toLocaleString('en-US')
          : Number(clipped).toFixed(control.digits);
      number.textContent = text;
      setFill(clipped);
      range.setAttribute('aria-valuetext', `${text}${control.unit ? ' ' + control.unit : ''}`);
    };

    const record = { ...control, range, number, setDisplay };
    this.controls.set(control.key, record);
    setDisplay(this.state[control.key]);

    range.addEventListener('input', () => {
      const raw = parseFloat(range.value);
      setDisplay(raw);
      this.clearPreset();
      this.handlers.onChange(control.key, raw);
    });

    wrapper.append(top, range);
    return wrapper;
  }

  buildSwitchRow(key, label, hint) {
    const row = el('div', 'switch-row');
    const copy = el('div', 'switch-row__copy');
    copy.append(el('strong', null, label));
    if (hint) copy.append(el('span', null, hint));

    const switchLabel = el('label', 'switch');
    switchLabel.title = hint || label;
    const input = el('input');
    input.type = 'checkbox';
    input.id = `toggle-${key}`;
    input.checked = Boolean(this.state[key]);
    input.setAttribute('aria-label', label);
    const track = el('span', 'switch__track');
    switchLabel.append(input, track);

    input.addEventListener('change', () => {
      this.clearPreset();
      this.handlers.onChange(key, input.checked);
    });

    row.append(copy, switchLabel);
    this.controls.set(key, { type: 'switch', input });
    return row;
  }

  buildQualityRow() {
    const wrapper = el('div', 'control control--select');
    wrapper.dataset.control = 'quality';
    wrapper.style.marginTop = '6px';

    const top = el('div', 'control__top');
    top.append(el('span', 'control__label', '渲染质量'));

    const selectWrap = el('div', 'select-wrap');
    const select = el('select', 'select');
    select.id = 'quality-select';
    select.setAttribute('aria-label', '渲染质量');
    for (const option of QUALITY_OPTIONS) {
      const node = el('option', null, option.label);
      node.value = option.value;
      select.append(node);
    }
    select.value = this.state.quality;
    select.addEventListener('change', () => {
      this.handlers.onChange('quality', select.value);
      this.setStatus('自适应质量已启动');
    });
    selectWrap.append(select);
    top.append(selectWrap);
    wrapper.append(top);

    this.controls.set('quality', { type: 'select', select });
    return wrapper;
  }

  /* ---------------------------------------------------------------- binding */

  bindStaticControls() {
    this.dom.resetViewBtn.addEventListener('click', () => this.handlers.onResetView());
    this.dom.resetAllBtn.addEventListener('click', () => {
      this.handlers.onResetAll();
    });
    this.dom.snapshotBtn.addEventListener('click', () => this.handlers.onSnapshot());
    this.dom.fullBtn.addEventListener('click', () => this.handlers.onFullscreen());
    this.dom.hideBtn.addEventListener('click', () => this.handlers.onToggleUI());
    this.dom.revealBtn?.addEventListener('click', () => this.handlers.onToggleUI());

    this.dom.panelLaunch.addEventListener('click', () => this.setPanelOpen(true));
    this.dom.panelBtn.addEventListener('click', () => this.setPanelOpen(!this.panelOpen));
    this.dom.panelClose.addEventListener('click', () => this.setPanelOpen(false));

    window.addEventListener('keydown', (event) => this.onKeyDown(event));
  }

  bindPanel() {
    const media = window.matchMedia('(max-width: 900px)');
    const onChange = (event) => {
      if (!event.matches && !this.dom.body.classList.contains('ui-hidden')) {
        this.setPanelOpen(true, false);
      }
    };
    if (media.addEventListener) media.addEventListener('change', onChange);
    else media.addListener(onChange);
  }

  onKeyDown(event) {
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable)
    ) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'h') {
      event.preventDefault();
      this.handlers.onToggleUI();
    } else if (key === 'p') {
      event.preventDefault();
      this.setPanelOpen(!this.panelOpen);
    } else if (key === 'f') {
      event.preventDefault();
      this.handlers.onFullscreen();
    } else if (key === 'r') {
      event.preventDefault();
      this.handlers.onResetView();
      this.showToast('视角已复位');
    } else if (key === 's') {
      event.preventDefault();
      this.handlers.onSnapshot();
    } else if (key === 'escape') {
      if (this.dom.body.classList.contains('ui-hidden')) {
        this.handlers.onToggleUI();
      } else if (this.panelOpen) {
        this.setPanelOpen(false);
      }
    }
  }

  setPanelOpen(open, animate = true) {
    this.panelOpen = open;
    this.dom.body.classList.toggle('panel-open', open);
    if (!animate) {
      this.dom.panel.style.transition = 'none';
      requestAnimationFrame(() => {
        this.dom.panel.style.transition = '';
      });
    }
  }

  /* --------------------------------------------------------------- UI state */

  onChangeFromState() {
    for (const [key, control] of this.controls) {
      if (control.type === 'select') {
        control.select.value = this.state[key];
      } else if (control.type === 'switch') {
        control.input.checked = Boolean(this.state[key]);
      } else {
        control.range.value = String(this.state[key]);
        control.setDisplay(this.state[key]);
      }
    }
  }

  setDisplayValue(key, value) {
    const control = this.controls.get(key);
    if (!control || control.type) return;
    if (document.activeElement === control.range) return;
    control.range.value = String(value);
    control.setDisplay(value);
  }

  refreshControl(key, value) {
    const control = this.controls.get(key);
    if (!control) return;
    if (control.type === 'select') control.select.value = value;
    else if (control.type === 'switch') control.input.checked = Boolean(value);
    else {
      control.range.value = String(value);
      control.setDisplay(value);
    }
  }

  refreshAll() {
    this.onChangeFromState();
  }

  updateHud({ distance, elevation, fov, fps, resolution, qualityScale }) {
    this.dom.hudDistance.textContent = `${distance.toFixed(1)} Rs`;
    this.dom.hudElevation.textContent = `${elevation.toFixed(1)}°`;
    this.dom.hudFov.textContent = `${fov.toFixed(0)}°`;
    this.dom.hudPerf.textContent = `${Math.max(1, Math.round(fps))} FPS · ${resolution}`;
    const pct = clamp((fps / 60) * 100, 8, 100);
    this.dom.hudBar.style.width = `${pct}%`;
    if (this.state.quality === 'auto') {
      this.setStatus(`自适应 ${qualityScale.toFixed(2)}×`);
    } else {
      const label =
        QUALITY_OPTIONS.find((item) => item.value === this.state.quality)?.label.split(' · ')[0] ||
        '固定';
      this.setStatus(`${label}质量`);
    }
  }

  setStatus(text) {
    this.dom.statusText.textContent = text;
  }

  setLive(ok) {
    this.dom.liveBadge.classList.toggle('is-offline', !ok);
  }

  showToast(message, duration = 2200) {
    window.clearTimeout(this.toastTimer);
    this.dom.toast.textContent = message;
    this.dom.toast.classList.add('is-visible');
    this.toastTimer = window.setTimeout(() => {
      this.dom.toast.classList.remove('is-visible');
    }, duration);
  }

  hideHint() {
    this.dom.hint.classList.add('is-hidden');
  }

  setUIHidden(hidden) {
    this.dom.body.classList.toggle('ui-hidden', hidden);
    this.dom.revealBtn?.setAttribute('aria-hidden', hidden ? 'false' : 'true');
  }

  busyOn(message) {
    this.dom.snapshotBtn.disabled = true;
    this.dom.snapshotBtn.querySelector('span').textContent = message;
  }

  busyOff() {
    this.dom.snapshotBtn.disabled = false;
    this.dom.snapshotBtn.querySelector('span').textContent = '保存观测影像';
  }
}
