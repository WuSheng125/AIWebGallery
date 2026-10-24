import { BlackHoleExperience } from './experience';
import { BlackHoleUI } from './ui';
import { DEFAULT_PARAMS, type BlackHoleParams, type UIAction } from './types';

const sceneContainer = document.querySelector<HTMLElement>('#scene');
const loading = document.querySelector<HTMLElement>('#loading');
const errorPanel = document.querySelector<HTMLElement>('#error-panel');

if (!sceneContainer) throw new Error('缺少 #scene 渲染容器。');

let params: BlackHoleParams = { ...DEFAULT_PARAMS };
let experience: BlackHoleExperience | undefined;

function showError(error: unknown): void {
  console.error(error);
  if (loading) {
    loading.classList.add('is-hidden');
    loading.setAttribute('aria-hidden', 'true');
  }
  if (errorPanel) {
    const message = error instanceof Error ? error.message : String(error);
    errorPanel.hidden = false;
    errorPanel.textContent = `无法启动黑洞渲染器。请使用支持 WebGL 2 的最新版 Chrome、Edge 或 Firefox，并确认已开启硬件加速。${message ? `（${message}）` : ''}`;
  }
}

async function saveScreenshot(ui: BlackHoleUI): Promise<void> {
  if (!experience) return;
  try {
    const blob = await experience.captureScreenshot();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    anchor.href = url;
    anchor.download = `gargantua-${timestamp}.png`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    ui.showToast('画面已保存为 PNG');
  } catch (error) {
    console.error(error);
    ui.showToast('保存失败，请稍后重试');
  }
}

async function toggleFullscreen(): Promise<void> {
  if (document.fullscreenElement) await document.exitFullscreen();
  else await document.documentElement.requestFullscreen();
}

function handleAction(action: UIAction, ui: BlackHoleUI): void {
  switch (action) {
    case 'reset-view':
      experience?.resetView();
      break;
    case 'screenshot':
      void saveScreenshot(ui);
      break;
    case 'fullscreen':
      void toggleFullscreen().catch(() => ui.showToast('当前浏览器不允许全屏'));
      break;
    case 'toggle-help':
      // The help dialog itself is managed by BlackHoleUI.
      break;
  }
}

try {
  const ui = new BlackHoleUI(params, {
    onParamsChange: (nextParams) => {
      params = { ...nextParams };
      experience?.setParams(params);
    },
    onAction: (action) => handleAction(action, ui),
  });

  experience = new BlackHoleExperience(sceneContainer, params);
  experience.onFirstFrame = () => {
    if (loading) {
      loading.classList.add('is-hidden');
      loading.setAttribute('aria-hidden', 'true');
    }
  };
  experience.onViewChange = (info) => ui.setViewInfo(info);
  experience.onStatusChange = (fps, scale) => ui.setStatus(fps, scale);
  experience.start();
} catch (error) {
  showError(error);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    experience?.dispose();
  });
}
