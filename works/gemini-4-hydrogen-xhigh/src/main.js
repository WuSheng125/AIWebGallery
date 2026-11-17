import './style.css';
import { BlackHoleApp, PRESETS } from './blackholeApp.js';

const PARAM_KEYS = [
  'mass',
  'spin',
  'lensing',
  'photonRing',
  'diskOuter',
  'diskThickness',
  'diskSpeed',
  'doppler',
  'turbulence',
  'temperature',
  'starDensity',
  'nebula',
  'bloom',
  'exposure',
];

function formatValue(val) {
  return Number(val).toFixed(2);
}

function initUI() {
  const canvas = document.getElementById('gl-canvas');
  const fpsEl = document.getElementById('fps-val');
  const inclEl = document.getElementById('incl-val');
  const distEl = document.getElementById('dist-val');

  let app;
  try {
    app = new BlackHoleApp(canvas, {
      onTelemetry: ({ fps, inclinationDeg, distanceRs }) => {
        fpsEl.textContent = String(fps);
        inclEl.textContent = `${inclinationDeg.toFixed(1)}°`;
        distEl.innerHTML = `${distanceRs.toFixed(1)} r<sub>s</sub>`;
      },
    });
  } catch (err) {
    console.error('WebGL 初始化失败:', err);
    document.getElementById('viewport-wrap').innerHTML = `
      <div style="display:grid;place-items:center;height:100%;padding:24px;text-align:center;color:#f4efe6;">
        <div>
          <h2 style="margin-bottom:8px;">无法初始化 WebGL2 渲染环境</h2>
          <p style="color:#9b958b;font-size:14px;">请确保浏览器支持 WebGL2 与浮点纹理扩展。</p>
        </div>
      </div>
    `;
    return;
  }

  // 绑定所有参数滑块
  const syncSlidersFromState = (stateObj) => {
    for (const key of PARAM_KEYS) {
      const input = document.getElementById(`param-${key}`);
      const valEl = document.getElementById(`val-${key}`);
      if (!input || !valEl || stateObj[key] === undefined) continue;
      input.value = String(stateObj[key]);
      valEl.textContent = formatValue(stateObj[key]);
    }
  };

  for (const key of PARAM_KEYS) {
    const input = document.getElementById(`param-${key}`);
    const valEl = document.getElementById(`val-${key}`);
    if (!input || !valEl) continue;

    input.addEventListener('input', () => {
      const num = parseFloat(input.value);
      valEl.textContent = formatValue(num);
      app.setParam(key, num);
      document.querySelectorAll('.preset-btn').forEach((btn) => btn.classList.remove('active'));
    });
  }

  // 预设按钮
  const presetGrid = document.getElementById('preset-grid');
  presetGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.preset-btn');
    if (!btn) return;
    const presetKey = btn.dataset.preset;
    if (!PRESETS[presetKey]) return;

    document.querySelectorAll('.preset-btn').forEach((el) => el.classList.remove('active'));
    btn.classList.add('active');

    app.applyPreset(presetKey);
    syncSlidersFromState(PRESETS[presetKey]);
  });

  // 渲染质量档位
  const qualityGroup = document.getElementById('quality-segmented');
  qualityGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    const q = btn.dataset.quality;
    document.querySelectorAll('.seg-btn').forEach((el) => el.classList.remove('active'));
    btn.classList.add('active');
    app.setParam('quality', q);
  });

  // 自动环绕运镜
  const autoOrbitInput = document.getElementById('param-autoOrbit');
  autoOrbitInput.addEventListener('change', () => {
    app.setParam('autoOrbit', autoOrbitInput.checked);
  });

  // 暂停 / 继续
  const pauseBtn = document.getElementById('btn-pause');
  const pauseIcon = document.getElementById('pause-icon');
  pauseBtn.addEventListener('click', () => {
    const paused = app.togglePause();
    pauseIcon.textContent = paused ? '▶' : '❚❚';
  });

  // 侧边栏折叠
  const sidebarToggle = document.getElementById('sidebar-toggle');
  sidebarToggle.addEventListener('click', () => {
    document.body.classList.toggle('sidebar-collapsed');
  });

  // 恢复默认
  document.getElementById('btn-reset').addEventListener('click', () => {
    document.querySelectorAll('.preset-btn').forEach((el) => {
      el.classList.toggle('active', el.dataset.preset === 'gargantua');
    });
    app.applyPreset('gargantua');
    syncSlidersFromState(PRESETS.gargantua);
    autoOrbitInput.checked = false;
    app.setParam('autoOrbit', false);
  });

  // 导出高清截图
  document.getElementById('btn-screenshot').addEventListener('click', () => {
    app.captureScreenshot();
  });

  // 暴露实例便于调试
  window.__blackHoleApp = app;

  syncSlidersFromState(PRESETS.gargantua);
  app.start();
}

initUI();
