import './style.css';
import { BlackHoleRenderer } from './blackHole';
import { DEFAULT_PARAMETERS, VIEW_PRESETS, type BlackHoleParameters, type NumericParameter, type QualityMode } from './parameters';

const byId = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const parameters: BlackHoleParameters = { ...DEFAULT_PARAMETERS };
const inclinationInput = byId<HTMLInputElement>('inclination');
const mobileLayout = window.matchMedia('(max-width: 900px)');
let renderer: BlackHoleRenderer | undefined;
let paused = false;
let toastTimer = 0;

const formatters: Record<string, (value: number) => string> = {
  lensStrength: (value) => `${value.toFixed(2)} ×`,
  innerRadius: (value) => `${value.toFixed(2)} rₛ`,
  outerRadius: (value) => `${value.toFixed(1)} rₛ`,
  diskBrightness: (value) => `${value.toFixed(2)} ×`,
  temperature: (value) => `${Math.round(value).toLocaleString('en-US')} K`,
  turbulence: (value) => value.toFixed(2),
  rotationSpeed: (value) => `${value.toFixed(2)} ×`,
  exposure: (value) => value.toFixed(2),
  starDensity: (value) => value.toFixed(2),
  bloomStrength: (value) => value.toFixed(2),
  inclination: (value) => `${value.toFixed(1)}°`,
};

function updateRange(input: HTMLInputElement) {
  const value = Number(input.value);
  const min = Number(input.min);
  const max = Number(input.max);
  input.style.setProperty('--progress', `${((value - min) / (max - min)) * 100}%`);
  const output = byId<HTMLOutputElement>(`${input.id}-value`);
  const key = input.dataset.param ?? input.id;
  if (output && formatters[key]) output.value = formatters[key](value);
}

function setActiveView(name?: string) {
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
    const active = button.dataset.view === name;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function updatePauseButton() {
  const button = byId<HTMLButtonElement>('pause-simulation');
  button.innerHTML = `<svg><use href="#i-${paused ? 'play' : 'pause'}"></use></svg><span>${paused ? '继续时间' : '暂停时间'}</span>`;
  button.setAttribute('aria-label', paused ? '继续模拟' : '暂停模拟');
  button.setAttribute('aria-pressed', String(paused));
}

function setPaused(value: boolean) {
  paused = value;
  renderer?.setPaused(paused);
  updatePauseButton();
}

function showToast(message: string) {
  const toast = byId('toast');
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.add('visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 2400);
}

function syncParameterUI() {
  document.querySelectorAll<HTMLInputElement>('input[type="range"][data-param]').forEach((input) => {
    const key = input.dataset.param as NumericParameter;
    input.value = String(parameters[key]);
    updateRange(input);
  });
  document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-param]').forEach((input) => {
    const key = input.dataset.param as 'doppler' | 'bloomEnabled' | 'autoRotate';
    input.checked = parameters[key];
  });
  byId('curvature-value').innerHTML = `${parameters.lensStrength.toFixed(2)} <small>×</small>`;
  renderer?.setParameters(parameters);
}

function resetView() {
  renderer?.flyTo(VIEW_PRESETS.classic);
  setActiveView('classic');
}

function toggleInterface(force?: boolean) {
  const hidden = force ?? !document.body.classList.contains('ui-hidden');
  document.body.classList.toggle('ui-hidden', hidden);
  document.body.classList.remove('panel-open');
  if (hidden) document.body.classList.remove('panel-collapsed');
}

document.querySelectorAll<HTMLInputElement>('input[type="range"]').forEach((input) => {
  updateRange(input);
  input.addEventListener('input', () => {
    updateRange(input);
    const value = Number(input.value);
    if (input === inclinationInput) {
      renderer?.setInclination(value);
      setActiveView();
      return;
    }
    const key = input.dataset.param as NumericParameter;
    Object.assign(parameters, { [key]: value });
    renderer?.setParameters(parameters);
    if (key === 'lensStrength') byId('curvature-value').innerHTML = `${value.toFixed(2)} <small>×</small>`;
  });
});

document.querySelectorAll<HTMLInputElement>('input[type="checkbox"][data-param]').forEach((input) => {
  input.addEventListener('change', () => {
    const key = input.dataset.param as 'doppler' | 'bloomEnabled' | 'autoRotate';
    Object.assign(parameters, { [key]: input.checked });
    renderer?.setParameters(parameters);
  });
});

document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach((button) => {
  button.addEventListener('click', () => {
    const name = button.dataset.view as string;
    renderer?.flyTo(VIEW_PRESETS[name]);
    setActiveView(name);
  });
});

byId('quality').addEventListener('change', (event) => {
  renderer?.setQuality((event.target as HTMLSelectElement).value as QualityMode);
});
byId('pause-simulation').addEventListener('click', () => setPaused(!paused));
byId('reset-view').addEventListener('click', resetView);
byId('reset-parameters').addEventListener('click', () => {
  Object.assign(parameters, DEFAULT_PARAMETERS);
  byId<HTMLSelectElement>('quality').value = 'auto';
  renderer?.setQuality('auto');
  syncParameterUI();
  setPaused(false);
  resetView();
  showToast('已恢复默认参数与经典视角');
});
byId('toggle-ui').addEventListener('click', () => toggleInterface());
byId('show-ui').addEventListener('click', () => toggleInterface(false));
byId('collapse-panel').addEventListener('click', () => {
  if (mobileLayout.matches) document.body.classList.remove('panel-open');
  else document.body.classList.add('panel-collapsed');
});
byId('mobile-panel-toggle').addEventListener('click', () => {
  if (mobileLayout.matches) document.body.classList.add('panel-open');
  else document.body.classList.remove('panel-collapsed');
});
byId('panel-scrim').addEventListener('click', () => document.body.classList.remove('panel-open'));

byId('fullscreen').addEventListener('click', async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen();
  } catch {
    showToast('当前浏览器暂不支持全屏模式');
  }
});
document.addEventListener('fullscreenchange', () => {
  const button = byId('fullscreen');
  button.setAttribute('aria-label', document.fullscreenElement ? '退出全屏' : '切换全屏');
  button.dataset.tooltip = document.fullscreenElement ? '退出全屏' : '全屏观测';
});
byId('save-view').addEventListener('click', () => {
  if (!renderer) return;
  const link = document.createElement('a');
  link.href = renderer.capture();
  link.download = `gargantua-${new Date().toISOString().replace(/[:.]/g, '-')}.png`;
  link.click();
  showToast('当前时空视图已保存');
});

window.addEventListener('keydown', (event) => {
  const target = event.target as HTMLElement;
  if (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) return;
  if (event.key.toLowerCase() === 'h') toggleInterface();
  if (event.key.toLowerCase() === 'r') resetView();
  if (event.code === 'Space') {
    event.preventDefault();
    setPaused(!paused);
  }
});

function showRenderError(error?: unknown) {
  if (error) console.error(error);
  byId('loading-screen').hidden = true;
  byId('webgl-error').hidden = false;
}

window.addEventListener('error', (event) => {
  const message = event.error instanceof Error ? `${event.error.name}: ${event.error.message}` : event.message;
  byId('webgl-error').querySelector('p')!.textContent = message;
  showRenderError(event.error);
});

byId('scene-canvas').addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  showRenderError();
});

try {
  renderer = new BlackHoleRenderer(byId<HTMLCanvasElement>('scene-canvas'), byId('viewport'), {
    onReady: () => { byId('loading-screen').hidden = true; },
    onViewChange: (distance, inclination) => {
      byId('distance-value').innerHTML = `${distance.toFixed(1)} <small>r<sub>s</sub></small>`;
      if (document.activeElement !== inclinationInput) inclinationInput.value = String(inclination);
      updateRange(inclinationInput);
    },
    onInteraction: () => setActiveView(),
    onFps: (fps) => { byId('fps-readout').textContent = `${fps} FPS`; },
  });
  renderer.start();
} catch (error) {
  showRenderError(error);
}
