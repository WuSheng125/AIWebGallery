import { PRESETS } from './types';
import type {
  BlackHoleParams,
  PresetName,
  RenderQuality,
  UIAction,
  ViewInfo,
} from './types';

type NumericKey = {
  [Key in keyof BlackHoleParams]: BlackHoleParams[Key] extends number ? Key : never;
}[keyof BlackHoleParams];

type ToggleKey = {
  [Key in keyof BlackHoleParams]: BlackHoleParams[Key] extends boolean ? Key : never;
}[keyof BlackHoleParams];

interface SliderConfig {
  key: NumericKey;
  label: string;
  min: number;
  max: number;
  step: number;
  decimals: number;
  unit?: string;
}

interface SliderControl {
  config: SliderConfig;
  input: HTMLInputElement;
  output: HTMLOutputElement;
}

interface ControlGroup {
  id: string;
  eyebrow: string;
  title: string;
  controls: readonly SliderConfig[];
}

const CONTROL_GROUPS: readonly ControlGroup[] = [
  {
    id: 'spacetime',
    eyebrow: '01 / SPACETIME',
    title: '时空结构',
    controls: [
      { key: 'mass', label: '质量', min: 0.5, max: 2, step: 0.01, decimals: 2 },
      { key: 'lensing', label: '透镜强度', min: 0, max: 2, step: 0.01, decimals: 2, unit: '×' },
    ],
  },
  {
    id: 'disk',
    eyebrow: '02 / ACCRETION DISK',
    title: '吸积盘',
    controls: [
      { key: 'diskInner', label: '盘内半径', min: 1.5, max: 6, step: 0.05, decimals: 2 },
      { key: 'diskOuter', label: '盘外半径', min: 4, max: 14, step: 0.1, decimals: 1 },
      { key: 'diskBrightness', label: '盘亮度', min: 0, max: 3, step: 0.01, decimals: 2, unit: '×' },
      { key: 'diskTemperature', label: '色温', min: 1000, max: 12000, step: 50, decimals: 0, unit: 'K' },
      { key: 'diskSpeed', label: '转速', min: 0, max: 2, step: 0.01, decimals: 2, unit: '×' },
      { key: 'diskDensity', label: '密度', min: 0.1, max: 2, step: 0.01, decimals: 2 },
      { key: 'doppler', label: '多普勒效应', min: 0, max: 2, step: 0.01, decimals: 2, unit: '×' },
    ],
  },
  {
    id: 'image',
    eyebrow: '03 / LIGHT & IMAGE',
    title: '光与影像',
    controls: [
      { key: 'starBrightness', label: '星光', min: 0, max: 2, step: 0.01, decimals: 2, unit: '×' },
      { key: 'bloom', label: 'Bloom 光晕', min: 0, max: 1.5, step: 0.01, decimals: 2 },
      { key: 'exposure', label: '曝光', min: 0.2, max: 2.5, step: 0.01, decimals: 2 },
    ],
  },
];

const PRESET_NAMES = ['gargantua', 'ember', 'sapphire'] as const satisfies readonly PresetName[];

const PRESET_META: Record<PresetName, { label: string; english: string; description: string }> = {
  gargantua: { label: '卡冈图雅', english: 'GARGANTUA', description: '经典银金色吸积盘' },
  ember: { label: '余烬', english: 'EMBER', description: '温暖、厚重的低频光芒' },
  sapphire: { label: '蓝宝石', english: 'SAPPHIRE', description: '清冷、明亮的高能盘面' },
};

const QUALITY_LABELS: Record<RenderQuality, string> = {
  low: '低',
  medium: '中',
  high: '高',
};

const TOGGLE_LABELS: Record<ToggleKey, string> = {
  autoRotate: '自动旋转',
  diskVisible: '吸积盘',
  starsVisible: '星空',
};

const PARAM_KEYS = [
  'mass',
  'lensing',
  'diskInner',
  'diskOuter',
  'diskBrightness',
  'diskTemperature',
  'diskSpeed',
  'diskDensity',
  'doppler',
  'starBrightness',
  'bloom',
  'exposure',
  'quality',
  'autoRotate',
  'diskVisible',
  'starsVisible',
] as const satisfies readonly (keyof BlackHoleParams)[];

let instanceCount = 0;

function isRenderQuality(value: string): value is RenderQuality {
  return value === 'low' || value === 'medium' || value === 'high';
}

function isToggleKey(value: string | undefined): value is ToggleKey {
  return value === 'autoRotate' || value === 'diskVisible' || value === 'starsVisible';
}

function isUIAction(value: string | undefined): value is UIAction {
  return value === 'reset-view' || value === 'screenshot' || value === 'fullscreen' || value === 'toggle-help';
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function requiredElement<ElementType extends Element>(root: ParentNode, selector: string): ElementType {
  const element = root.querySelector(selector);
  if (!element) {
    throw new Error(`UI 初始化失败：缺少元素 ${selector}`);
  }
  return element as ElementType;
}

export class BlackHoleUI {
  private params: BlackHoleParams;

  private readonly callbacks: {
    onParamsChange: (params: BlackHoleParams) => void;
    onAction: (action: UIAction) => void;
  };

  private readonly idPrefix: string;
  private readonly root: HTMLDivElement;
  private readonly panel: HTMLElement;
  private readonly panelToggle: HTMLButtonElement;
  private readonly panelClose: HTMLButtonElement;
  private readonly helpButton: HTMLButtonElement;
  private readonly helpDialog: HTMLDialogElement;
  private readonly fullscreenButton: HTMLButtonElement;
  private readonly qualitySelect: HTMLSelectElement;
  private readonly fpsOutput: HTMLOutputElement;
  private readonly scaleOutput: HTMLOutputElement;
  private readonly inclinationOutput: HTMLOutputElement;
  private readonly distanceOutput: HTMLOutputElement;
  private readonly activePresetOutput: HTMLOutputElement;
  private readonly toast: HTMLDivElement;
  private readonly sliders = new Map<NumericKey, SliderControl>();
  private readonly toggles = new Map<ToggleKey, HTMLInputElement>();
  private readonly presetButtons = new Map<PresetName, HTMLButtonElement>();
  private panelOpen = true;
  private toastTimer: number | undefined;

  constructor(
    initialParams: BlackHoleParams,
    callbacks: {
      onParamsChange: (params: BlackHoleParams) => void;
      onAction: (action: UIAction) => void;
    },
  ) {
    this.params = { ...initialParams };
    this.callbacks = callbacks;
    this.idPrefix = `gargantua-ui-${++instanceCount}`;

    this.root = document.createElement('div');
    this.root.className = 'bh-ui';
    this.root.innerHTML = this.createMarkup();

    this.panel = requiredElement<HTMLElement>(this.root, '[data-control-panel]');
    this.panelToggle = requiredElement<HTMLButtonElement>(this.root, '[data-panel-toggle]');
    this.panelClose = requiredElement<HTMLButtonElement>(this.root, '[data-panel-close]');
    this.helpButton = requiredElement<HTMLButtonElement>(this.root, '[data-action="toggle-help"]');
    this.helpDialog = requiredElement<HTMLDialogElement>(this.root, '[data-help-dialog]');
    this.fullscreenButton = requiredElement<HTMLButtonElement>(this.root, '[data-action="fullscreen"]');
    this.qualitySelect = requiredElement<HTMLSelectElement>(this.root, '[data-quality]');
    this.fpsOutput = requiredElement<HTMLOutputElement>(this.root, '[data-fps]');
    this.scaleOutput = requiredElement<HTMLOutputElement>(this.root, '[data-render-scale]');
    this.inclinationOutput = requiredElement<HTMLOutputElement>(this.root, '[data-inclination]');
    this.distanceOutput = requiredElement<HTMLOutputElement>(this.root, '[data-distance]');
    this.activePresetOutput = requiredElement<HTMLOutputElement>(this.root, '[data-active-preset]');
    this.toast = requiredElement<HTMLDivElement>(this.root, '[data-toast]');

    this.buildPresets();
    this.buildParameterControls();
    this.bindToggles();
    this.bindActions();
    this.bindPanel();
    this.bindHelp();

    document.body.append(this.root);
    this.syncControls();
    this.setPanelOpen(!window.matchMedia('(max-width: 760px)').matches);
  }

  setParams(params: BlackHoleParams): void {
    this.params = { ...params };
    this.syncControls();
  }

  setStatus(fps: number, renderScale: number): void {
    if (Number.isFinite(fps)) {
      const roundedFps = Math.max(0, Math.round(fps));
      this.setOutput(this.fpsOutput, String(roundedFps));
      this.fpsOutput.dataset.level = roundedFps < 24 ? 'low' : 'normal';
      this.fpsOutput.setAttribute('aria-label', `每秒 ${roundedFps} 帧`);
    } else {
      this.setOutput(this.fpsOutput, '—');
      this.fpsOutput.dataset.level = 'unknown';
      this.fpsOutput.setAttribute('aria-label', '帧率未知');
    }

    if (Number.isFinite(renderScale)) {
      const percentage = Math.max(0, Math.round(renderScale * 100));
      this.setOutput(this.scaleOutput, `${percentage}%`);
      this.scaleOutput.setAttribute('aria-label', `实际渲染比例 ${percentage}%`);
    } else {
      this.setOutput(this.scaleOutput, '—');
      this.scaleOutput.setAttribute('aria-label', '实际渲染比例未知');
    }
  }

  setViewInfo(info: ViewInfo): void {
    if (Number.isFinite(info.inclination)) {
      const roundedDegrees = Math.round((info.inclination * 180) / Math.PI);
      const degrees = roundedDegrees === 0 ? 0 : roundedDegrees;
      const sign = degrees > 0 ? '+' : '';
      this.setOutput(this.inclinationOutput, `${sign}${degrees}°`);
      this.inclinationOutput.setAttribute('aria-label', `视线仰角 ${sign}${degrees} 度`);
    } else {
      this.setOutput(this.inclinationOutput, '—');
      this.inclinationOutput.setAttribute('aria-label', '视线仰角未知');
    }

    if (Number.isFinite(info.distance)) {
      this.setOutput(this.distanceOutput, info.distance.toFixed(2));
      this.distanceOutput.setAttribute('aria-label', `观测距离 ${info.distance.toFixed(2)} 场景单位`);
    } else {
      this.setOutput(this.distanceOutput, '—');
      this.distanceOutput.setAttribute('aria-label', '观测距离未知');
    }
  }

  showToast(message: string): void {
    if (this.toastTimer !== undefined) {
      window.clearTimeout(this.toastTimer);
      this.toastTimer = undefined;
    }

    this.toast.classList.remove('is-visible');
    this.toast.textContent = message;

    if (!message.trim()) {
      return;
    }

    // Force a style boundary so repeated messages still provide visible feedback.
    void this.toast.offsetWidth;
    this.toast.classList.add('is-visible');
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('is-visible');
      this.toastTimer = undefined;
    }, 2800);
  }

  private createMarkup(): string {
    const id = this.idPrefix;
    return `
      <a class="skip-link" href="#${id}-controls" data-skip-controls>跳至参数控制</a>

      <header class="topbar" aria-label="卡冈图雅模拟器工具栏">
        <div class="brand" aria-label="卡冈图雅，实时黑洞模拟">
          <span class="brand__mark" aria-hidden="true"><span></span></span>
          <span class="brand__text">
            <strong>GARGANTUA</strong>
            <small>卡冈图雅 · 实时黑洞模拟</small>
          </span>
        </div>

        <div class="live-indicator" aria-label="模拟实时运行">
          <span aria-hidden="true"></span>
          LIVE
        </div>

        <nav class="action-bar" aria-label="画面操作">
          <button class="action-button" type="button" data-action="reset-view" aria-label="重置视角" title="重置视角">
            <span class="action-button__icon" aria-hidden="true">↺</span>
            <span class="action-button__label">重置视角</span>
          </button>
          <button class="action-button" type="button" data-action="screenshot" aria-label="保存画面" title="保存画面">
            <span class="action-button__icon action-button__icon--save" aria-hidden="true"></span>
            <span class="action-button__label">保存画面</span>
          </button>
          <button class="action-button" type="button" data-action="fullscreen" aria-label="切换全屏" aria-pressed="false" title="切换全屏">
            <span class="action-button__icon action-button__icon--fullscreen" aria-hidden="true"></span>
            <span class="action-button__label" data-fullscreen-label>全屏</span>
          </button>
          <button
            class="action-button"
            type="button"
            data-action="toggle-help"
            aria-label="操作帮助"
            aria-haspopup="dialog"
            aria-controls="${id}-help"
            aria-expanded="false"
            title="操作帮助"
          >
            <span class="action-button__icon action-button__icon--help" aria-hidden="true">?</span>
            <span class="action-button__label">操作帮助</span>
          </button>
          <span class="action-bar__divider" aria-hidden="true"></span>
          <button
            class="action-button action-button--panel"
            type="button"
            data-panel-toggle
            aria-label="展开或收起参数面板"
            aria-controls="${id}-controls"
            aria-expanded="true"
            title="参数面板"
          >
            <span class="action-button__icon action-button__icon--sliders" aria-hidden="true"><i></i><i></i><i></i></span>
            <span class="action-button__label">参数</span>
          </button>
        </nav>
      </header>

      <section class="telemetry" aria-label="实时观测数据">
        <div class="telemetry__item">
          <span class="telemetry__label">帧率 <small>FPS</small></span>
          <output data-fps aria-label="帧率未知">—</output>
        </div>
        <div class="telemetry__item">
          <span class="telemetry__label">渲染比例</span>
          <output data-render-scale aria-label="实际渲染比例未知">—</output>
        </div>
        <div class="telemetry__item">
          <span class="telemetry__label">倾角 <small>仰角</small></span>
          <output data-inclination aria-label="视线仰角未知">—</output>
        </div>
        <div class="telemetry__item">
          <span class="telemetry__label">距离 <small>SU</small></span>
          <output data-distance aria-label="观测距离未知">—</output>
        </div>
      </section>

      <button class="panel-scrim" type="button" data-panel-dismiss aria-label="关闭参数面板" tabindex="-1"></button>

      <aside class="control-panel" id="${id}-controls" data-control-panel aria-label="黑洞参数控制" tabindex="-1">
        <div class="control-panel__header">
          <div>
            <p class="eyebrow">OBSERVATION CONTROL</p>
            <h2>观测参数</h2>
          </div>
          <button class="panel-close" type="button" data-panel-close aria-label="收起参数面板" title="收起参数面板">
            <span aria-hidden="true"></span>
          </button>
        </div>

        <div class="control-panel__scroll">
          <section class="preset-section" aria-labelledby="${id}-preset-title">
            <div class="section-heading">
              <h3 id="${id}-preset-title">时空预设</h3>
              <span>PRESETS</span>
            </div>
            <div class="preset-grid" data-presets role="group" aria-label="选择黑洞预设"></div>
          </section>

          <div data-parameter-groups></div>

          <section class="control-group control-group--settings" aria-labelledby="${id}-settings-title">
            <div class="control-group__heading">
              <p class="eyebrow">04 / OBSERVATION</p>
              <h3 id="${id}-settings-title">观测设置</h3>
            </div>

            <div class="select-control">
              <label for="${id}-quality">画质</label>
              <div class="select-shell">
                <select id="${id}-quality" data-quality aria-describedby="${id}-quality-hint">
                  <option value="low">低 · 流畅优先</option>
                  <option value="medium">中 · 平衡</option>
                  <option value="high">高 · 细节优先</option>
                </select>
              </div>
              <p class="control-hint" id="${id}-quality-hint">调整实际渲染精度，不改变场景参数</p>
            </div>

            <div class="switch-list">
              <label class="switch-row" for="${id}-auto-rotate">
                <span class="switch-row__text">自动旋转<small>缓慢环绕观测目标</small></span>
                <input class="switch-input" id="${id}-auto-rotate" type="checkbox" role="switch" data-toggle="autoRotate" />
                <span class="switch-control" aria-hidden="true"></span>
              </label>
              <label class="switch-row" for="${id}-disk-visible">
                <span class="switch-row__text">显示吸积盘<small>切换盘面的可见性</small></span>
                <input class="switch-input" id="${id}-disk-visible" type="checkbox" role="switch" data-toggle="diskVisible" />
                <span class="switch-control" aria-hidden="true"></span>
              </label>
              <label class="switch-row" for="${id}-stars-visible">
                <span class="switch-row__text">显示星空<small>切换背景星场的可见性</small></span>
                <input class="switch-input" id="${id}-stars-visible" type="checkbox" role="switch" data-toggle="starsVisible" />
                <span class="switch-control" aria-hidden="true"></span>
              </label>
            </div>
          </section>
        </div>

        <footer class="control-panel__footer">
          <span>当前配置</span>
          <output data-active-preset>自定义</output>
          <span class="control-panel__footer-line" aria-hidden="true"></span>
          <span>REALTIME</span>
        </footer>
      </aside>

      <dialog class="help-dialog" id="${id}-help" data-help-dialog aria-labelledby="${id}-help-title">
        <div class="help-dialog__topline">
          <p class="eyebrow">NAVIGATION MANUAL / 01</p>
          <button class="help-dialog__close" type="button" data-help-close aria-label="关闭操作帮助" autofocus>
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <h2 id="${id}-help-title">在引力边缘观测</h2>
        <p class="help-dialog__intro">所有调整都会实时作用于当前场景。放慢动作，观察光如何弯曲。</p>
        <dl class="help-list">
          <div><dt>拖动画面</dt><dd>环绕黑洞，改变观测方向</dd></div>
          <div><dt>滚轮 / 双指捏合</dt><dd>靠近或远离事件视界</dd></div>
          <div><dt>参数面板</dt><dd>实时调整时空、吸积盘与影像</dd></div>
          <div><dt>重置视角</dt><dd>返回初始观测位置</dd></div>
        </dl>
        <div class="help-dialog__footer">
          <span><kbd>Esc</kbd> 关闭帮助</span>
          <button class="text-button" type="button" data-help-close>继续观测 <span aria-hidden="true">→</span></button>
        </div>
      </dialog>

      <div class="toast" data-toast role="status" aria-live="polite" aria-atomic="true"></div>
    `;
  }

  private buildPresets(): void {
    const container = requiredElement<HTMLDivElement>(this.root, '[data-presets]');

    for (const name of PRESET_NAMES) {
      const meta = PRESET_META[name];
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `preset-button preset-button--${name}`;
      button.dataset.preset = name;
      button.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-label', `应用${meta.label}预设：${meta.description}`);
      button.title = meta.description;
      button.innerHTML = `
        <span class="preset-button__swatch" aria-hidden="true"></span>
        <span class="preset-button__name">${meta.label}</span>
        <small>${meta.english}</small>
      `;
      button.addEventListener('click', () => this.applyPreset(name));
      container.append(button);
      this.presetButtons.set(name, button);
    }
  }

  private buildParameterControls(): void {
    const container = requiredElement<HTMLDivElement>(this.root, '[data-parameter-groups]');

    for (const group of CONTROL_GROUPS) {
      const section = document.createElement('section');
      section.className = 'control-group';
      section.setAttribute('aria-labelledby', `${this.idPrefix}-${group.id}-title`);

      const heading = document.createElement('div');
      heading.className = 'control-group__heading';
      const eyebrow = document.createElement('p');
      eyebrow.className = 'eyebrow';
      eyebrow.textContent = group.eyebrow;
      const title = document.createElement('h3');
      title.id = `${this.idPrefix}-${group.id}-title`;
      title.textContent = group.title;
      heading.append(eyebrow, title);
      section.append(heading);

      for (const config of group.controls) {
        section.append(this.createSlider(config));
      }
      container.append(section);
    }
  }

  private createSlider(config: SliderConfig): HTMLDivElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'slider-control';

    const header = document.createElement('div');
    header.className = 'slider-control__header';
    const inputId = `${this.idPrefix}-${config.key}`;
    const label = document.createElement('label');
    label.htmlFor = inputId;
    label.textContent = config.label;
    const output = document.createElement('output');
    output.id = `${inputId}-value`;
    output.setAttribute('for', inputId);
    output.setAttribute('aria-label', `${config.label}当前值`);
    header.append(label, output);

    const input = document.createElement('input');
    input.id = inputId;
    input.type = 'range';
    input.min = String(config.min);
    input.max = String(config.max);
    input.step = String(config.step);
    input.dataset.parameter = config.key;
    input.setAttribute('aria-valuetext', '');
    input.title = `${config.label}：${config.min} 至 ${config.max}`;
    input.addEventListener('input', () => {
      this.updateNumeric(config.key, Number(input.value));
    });

    wrapper.append(header, input);
    this.sliders.set(config.key, { config, input, output });
    return wrapper;
  }

  private bindToggles(): void {
    this.qualitySelect.addEventListener('change', () => {
      const value = this.qualitySelect.value;
      if (!isRenderQuality(value)) return;
      this.params.quality = value;
      this.emitParams();
      this.showToast(`画质已切换为「${QUALITY_LABELS[value]}」`);
    });

    const inputs = this.root.querySelectorAll<HTMLInputElement>('[data-toggle]');
    inputs.forEach((input) => {
      const key = input.dataset.toggle;
      if (!isToggleKey(key)) {
        throw new Error(`UI 初始化失败：未知开关 ${String(key)}`);
      }
      this.toggles.set(key, input);
      input.addEventListener('change', () => {
        this.params[key] = input.checked;
        this.emitParams();
        this.showToast(`${TOGGLE_LABELS[key]}已${input.checked ? '开启' : '关闭'}`);
      });
    });
  }

  private bindActions(): void {
    const buttons = this.root.querySelectorAll<HTMLButtonElement>('[data-action]');
    buttons.forEach((button) => {
      const action = button.dataset.action;
      if (!isUIAction(action)) {
        throw new Error(`UI 初始化失败：未知动作 ${String(action)}`);
      }
      button.addEventListener('click', () => this.handleAction(action));
    });

    document.addEventListener('fullscreenchange', () => {
      const isFullscreen = document.fullscreenElement !== null;
      this.fullscreenButton.setAttribute('aria-pressed', String(isFullscreen));
      const label = requiredElement<HTMLSpanElement>(this.fullscreenButton, '[data-fullscreen-label]');
      label.textContent = isFullscreen ? '退出全屏' : '全屏';
      this.fullscreenButton.setAttribute('aria-label', isFullscreen ? '退出全屏' : '切换全屏');
    });
  }

  private bindPanel(): void {
    this.panelToggle.addEventListener('click', () => {
      const open = !this.panelOpen;
      this.setPanelOpen(open);
      if (open) this.panelClose.focus({ preventScroll: true });
    });

    this.panelClose.addEventListener('click', () => {
      this.setPanelOpen(false);
      this.panelToggle.focus({ preventScroll: true });
    });

    requiredElement<HTMLButtonElement>(this.root, '[data-panel-dismiss]').addEventListener('click', () => {
      this.setPanelOpen(false);
    });

    requiredElement<HTMLAnchorElement>(this.root, '[data-skip-controls]').addEventListener('click', (event) => {
      event.preventDefault();
      this.setPanelOpen(true);
      this.panel.focus({ preventScroll: true });
    });

    this.panel.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape' || !this.panelOpen) return;
      event.preventDefault();
      this.setPanelOpen(false);
      this.panelToggle.focus({ preventScroll: true });
    });
  }

  private bindHelp(): void {
    const closeButtons = this.helpDialog.querySelectorAll<HTMLButtonElement>('[data-help-close]');
    closeButtons.forEach((button) => button.addEventListener('click', () => this.helpDialog.close()));

    this.helpDialog.addEventListener('close', () => {
      this.helpButton.setAttribute('aria-expanded', 'false');
    });

    this.helpDialog.addEventListener('click', (event) => {
      if (event.target !== this.helpDialog) return;
      const bounds = this.helpDialog.getBoundingClientRect();
      const outside =
        event.clientX < bounds.left ||
        event.clientX > bounds.right ||
        event.clientY < bounds.top ||
        event.clientY > bounds.bottom;
      if (outside) this.helpDialog.close();
    });
  }

  private handleAction(action: UIAction): void {
    if (action === 'toggle-help') {
      if (this.helpDialog.open) {
        this.helpDialog.close();
      } else {
        this.helpDialog.showModal();
        this.helpButton.setAttribute('aria-expanded', 'true');
      }
      this.callbacks.onAction(action);
      return;
    }

    this.callbacks.onAction(action);
    if (action === 'reset-view') {
      this.showToast('已返回初始观测视角');
    } else if (action === 'screenshot') {
      this.showToast('正在保存当前画面');
    }
  }

  private applyPreset(name: PresetName): void {
    this.params = { ...PRESETS[name] };
    this.syncControls();
    this.callbacks.onParamsChange({ ...this.params });
    this.showToast(`已应用「${PRESET_META[name].label}」预设`);
  }

  private updateNumeric(key: NumericKey, value: number): void {
    const control = this.sliders.get(key);
    if (!control || !Number.isFinite(value)) return;
    this.params[key] = clamp(value, control.config.min, control.config.max);
    this.syncSliders();
    this.emitParams();
  }

  private emitParams(): void {
    this.updatePresetState();
    this.callbacks.onParamsChange({ ...this.params });
  }

  private syncControls(): void {
    this.syncSliders();
    this.qualitySelect.value = this.params.quality;
    this.toggles.forEach((input, key) => {
      input.checked = this.params[key];
    });
    this.updatePresetState();
  }

  private syncSliders(): void {
    this.sliders.forEach((control, key) => {
      const value = this.params[key];
      const { config, input, output } = control;
      input.value = String(value);
      const positionedValue = Number(input.value);
      const fill = ((positionedValue - config.min) / (config.max - config.min)) * 100;
      input.style.setProperty('--range-fill', `${clamp(fill, 0, 100)}%`);
      const formatted = this.formatSliderValue(config, value);
      output.value = formatted;
      input.setAttribute('aria-valuetext', formatted);
    });
  }

  private formatSliderValue(config: SliderConfig, value: number): string {
    const formatted =
      config.key === 'diskTemperature'
        ? Math.round(value).toLocaleString('zh-CN')
        : value.toFixed(config.decimals);
    if (!config.unit) return formatted;
    return config.unit === '×' ? `${formatted}×` : `${formatted} ${config.unit}`;
  }

  private updatePresetState(): void {
    const activePreset =
      PRESET_NAMES.find((name) => PARAM_KEYS.every((key) => this.params[key] === PRESETS[name][key])) ?? null;

    this.presetButtons.forEach((button, name) => {
      button.setAttribute('aria-pressed', String(name === activePreset));
    });
    this.setOutput(
      this.activePresetOutput,
      activePreset ? PRESET_META[activePreset].label : '自定义',
    );
  }

  private setPanelOpen(open: boolean): void {
    this.panelOpen = open;
    this.root.classList.toggle('panel-open', open);
    this.panel.classList.toggle('is-collapsed', !open);
    this.panel.inert = !open;
    this.panel.setAttribute('aria-hidden', String(!open));
    this.panelToggle.setAttribute('aria-expanded', String(open));
  }

  private setOutput(output: HTMLOutputElement, value: string): void {
    if (output.value !== value) output.value = value;
  }
}
