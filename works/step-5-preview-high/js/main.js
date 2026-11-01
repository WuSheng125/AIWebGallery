/**
 * main.js —— 入口：初始化引擎、UI、错误处理
 */

import { BlackHoleEngine } from './engine.js';
import { DEFAULT_PARAMS } from './params.js';
import { UI } from './ui.js';

const canvas = document.getElementById('gl');
const loading = document.getElementById('loading');
const errBox = document.getElementById('error');

function fail(msg, detail) {
  loading.style.display = 'none';
  errBox.style.display = 'flex';
  errBox.innerHTML = `
    <div class="err-card">
      <h2>⚠ 无法启动渲染</h2>
      <p>${msg}</p>
      ${detail ? `<pre>${String(detail).slice(0, 2000)}</pre>` : ''}
      <p class="hint">请使用支持 WebGL2 的现代浏览器（Chrome / Edge / Firefox / Safari 15+）。
      若在 <code>file://</code> 协议下打开，请通过本地 HTTP 服务器访问
      （例如 <code>npx serve</code> 或 <code>python -m http.server</code>）。</p>
    </div>`;
}

async function boot() {
  let engine;
  try {
    engine = new BlackHoleEngine(canvas);
  } catch (e) {
    fail('WebGL2 上下文创建失败。', e.message || e);
    return;
  }

  try {
    await engine.init();
  } catch (e) {
    fail('着色器加载失败（请通过 HTTP 服务器访问本页面，而非直接双击打开文件）。',
         e.message || e);
    return;
  }

  const params = { ...DEFAULT_PARAMS };
  engine.setParams(params);
  engine.renderScale = params.renderScale;

  let ui;
  try {
    ui = new UI(engine, params);
  } catch (e) {
    fail('界面初始化失败。', e.message || e);
    return;
  }
  engine.resize();

  // 尺寸自适应
  const ro = new ResizeObserver(() => engine.resize());
  ro.observe(canvas.parentElement);
  window.addEventListener('resize', () => engine.resize());

  engine.onError = (e) => fail('渲染过程中发生错误。', e.message || e);

  loading.style.display = 'none';
  document.getElementById('app').classList.add('ready');

  // 键盘快捷键
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    switch (e.key.toLowerCase()) {
      case ' ': e.preventDefault();
        if (engine.running) engine.stop(); else engine.start();
        break;
      case 'r': ui.applyPreset('gargantua'); break;
      case 'h': document.body.classList.toggle('hide-ui'); break;
      case 's': ui.shot(); break;
    }
  });

  // 首次渲染后启动循环
  engine.render(0.0001);
  engine.start();

  // 供调试 / 自动化使用
  window.__bh = { engine, ui, params };
}

boot();
