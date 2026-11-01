/**
 * ui.js —— 侧边栏参数面板、预设、视角控制与状态持久化
 */

import { DEFAULT_PARAMS, PRESETS, VIEWS, CONTROLS, PERF_CONTROLS,
         iscoRadius } from './params.js';

const STORAGE_KEY = 'gargantua-params-v1';

export class UI {
  constructor(engine, params) {
    this.engine = engine;
    this.params = params;
    this.panel = document.getElementById('panel');
    this.body = document.getElementById('panelBody');
    this.sliders = new Map();
    this.activePreset = 'gargantua';

    this._load();
    this._build();
    this._bindGlobal();
  }

  _load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        // 仅接受已知键，避免旧版本脏数据
        for (const k of Object.keys(DEFAULT_PARAMS)) {
          if (typeof saved[k] === 'number' &&
              Number.isFinite(saved[k])) {
            this.params[k] = saved[k];
          }
        }
        if (typeof saved.__preset === 'string' && PRESETS[saved.__preset]) {
          this.activePreset = saved.__preset;
        }
      }
    } catch (_) { /* 忽略存储错误 */ }
  }

  _save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...this.params, __preset: this.activePreset,
      }));
    } catch (_) { /* 忽略存储错误 */ }
  }

  _build() {
    const html = [];

    // ---- 预设 ----
    html.push(`<section class="grp">
      <h3>预设</h3>
      <div class="presets" id="presets">
        ${Object.entries(PRESETS).map(([k, v]) => `
          <button class="preset${k === this.activePreset ? ' on' : ''}"
                  data-preset="${k}" title="${v.hint}">${v.label}</button>`).join('')}
      </div>
    </section>`);

    // ---- 视角 ----
    html.push(`<section class="grp">
      <h3>视角机位</h3>
      <div class="views" id="views">
        ${Object.entries(VIEWS).map(([k, v]) => `
          <button class="view" data-view="${k}">${v.label}</button>`).join('')}
      </div>
      <label class="chk">
        <input type="checkbox" id="autoRotate" checked>
        <span>自动环绕旋转（双击画面亦可切换）</span>
      </label>
    </section>`);

    // ---- 参数分组 ----
    const renderGroup = (title, list, withReset = false) => {
      let s = `<section class="grp"><h3>${title}</h3>`;
      for (const c of list) {
        const v = this.params[c.key];
        s += `<div class="ctl" data-key="${c.key}">
          <div class="ctl-head">
            <label>${c.label}</label>
            <span class="val" id="val-${c.key}">${c.fmt(v)}</span>
          </div>
          <input type="range" id="sl-${c.key}" min="${c.min}" max="${c.max}"
                 step="${c.step}" value="${v}">
          <div class="tip">${c.desc}</div>
        </div>`;
      }
      if (withReset) {
        s += `<button class="reset" id="resetPerf">恢复默认画质设置</button>`;
      }
      return s + `</section>`;
    };

    for (const g of CONTROLS) html.push(renderGroup(g.group, g.items));
    html.push(renderGroup('性能', PERF_CONTROLS, true));

    // ---- 信息 ----
    html.push(`<section class="grp">
      <h3>状态信息</h3>
      <div class="info">
        <div><span>ISCO 半径</span><b id="info-isco">—</b></div>
        <div><span>临界瞄准距离 b<sub>c</sub></span><b id="info-bcrit">—</b></div>
        <div><span>相机距离</span><b id="info-dist">—</b></div>
        <div><span>帧率</span><b id="info-fps">—</b></div>
        <div><span>渲染分辨率</span><b id="info-res">—</b></div>
      </div>
    </section>`);

    html.push(`<section class="grp">
      <button class="act" id="btnShot">📷 保存截图 PNG</button>
      <button class="act" id="btnReset">↺ 重置全部参数</button>
    </section>`);

    this.body.innerHTML = html.join('\n');

    // ---- 绑定滑块 ----
    const bindSlider = (c) => {
      const sl = document.getElementById(`sl-${c.key}`);
      const val = document.getElementById(`val-${c.key}`);
      if (!sl || !val) return;
      this.sliders.set(c.key, { slider: sl, val, def: c });
      const apply = () => {
        const n = parseFloat(sl.value);
        this.params[c.key] = n;
        val.textContent = c.fmt(n);
        this._onParamChange(c.key);
      };
      sl.addEventListener('input', apply);
    };
    for (const g of CONTROLS) for (const c of g.items) bindSlider(c);
    for (const c of PERF_CONTROLS) bindSlider(c);

    // ---- 预设按钮 ----
    this.panel.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.preset;
        this.applyPreset(key);
      });
    });

    // ---- 视角按钮 ----
    this.panel.querySelectorAll('[data-view]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const v = VIEWS[btn.dataset.view];
        this.engine.camera.setSpherical(v.theta, v.phi, v.distance);
        this.engine.camera.autoRotate =
          document.getElementById('autoRotate').checked;
      });
    });

    document.getElementById('autoRotate').addEventListener('change', (e) => {
      this.engine.camera.autoRotate = e.target.checked;
    });

    // ---- 性能区按钮 ----
    const rp = document.getElementById('resetPerf');
    if (rp) rp.addEventListener('click', () => {
      for (const c of PERF_CONTROLS) {
        this.params[c.key] = DEFAULT_PARAMS[c.key];
        this._syncSlider(c.key);
      }
      this._onParamChange('steps');
      this._save();
    });

    document.getElementById('btnShot').addEventListener('click', () => this.shot());
    document.getElementById('btnReset').addEventListener('click', () => {
      this.applyPreset('gargantua', true);
      for (const k of Object.keys(DEFAULT_PARAMS)) {
        this.params[k] = DEFAULT_PARAMS[k];
        this._syncSlider(k);
      }
      this._onParamChange('all');
      this._save();
      this._toast('已重置为默认参数');
    });

    // 折叠分组
    this.panel.querySelectorAll('.grp h3').forEach((h) => {
      h.addEventListener('click', () => h.parentElement.classList.toggle('closed'));
    });
  }

  _syncSlider(key) {
    const e = this.sliders.get(key);
    if (!e) return;
    e.slider.value = String(this.params[key]);
    e.val.textContent = e.def.fmt(this.params[key]);
  }

  _onParamChange(key) {
    // 需要立即生效的副作用
    if (key === 'renderScale' || key === 'maxPixelRatio') {
      this.engine.renderScale = this.params.renderScale;
      this.engine.params.maxPixelRatio = this.params.maxPixelRatio;
      this.engine.resize();
    }
    if (key === 'spin' || key === 'diskInner') this._updateInfo();
    this._save();
  }

  applyPreset(key, silent = false) {
    const p = PRESETS[key];
    if (!p) return;
    this.activePreset = key;
    for (const [k, v] of Object.entries(p.params)) {
      this.params[k] = v;
      this._syncSlider(k);
    }
    this.panel.querySelectorAll('[data-preset]').forEach((b) => {
      b.classList.toggle('on', b.dataset.preset === key);
    });
    this._onParamChange('all');
    this._save();
    if (!silent) this._toast(`已应用预设：${p.label}`);
  }

  shot() {
    try {
      const url = this.engine.snapshot();
      const a = document.createElement('a');
      a.href = url;
      a.download = `gargantua-${Date.now()}.png`;
      a.click();
      this._toast('截图已保存');
    } catch (e) {
      this._toast('截图失败：' + e.message);
    }
  }

  _updateInfo() {
    const isco = iscoRadius(this.params.spin);
    const bcrit = 2.598076 * 1.0; // rs=1
    const el = (id) => document.getElementById(id);
    if (el('info-isco')) el('info-isco').textContent = `${isco.toFixed(2)} rs`;
    if (el('info-bcrit')) el('info-bcrit').textContent = `${bcrit.toFixed(2)} rs`;
  }

  _bindGlobal() {
    this._updateInfo();
    // 每秒刷新信息
    setInterval(() => {
      const el = (id) => document.getElementById(id);
      const cam = this.engine.camera;
      if (el('info-dist')) el('info-dist').textContent =
        `${cam.smoothDistance.toFixed(1)} rs`;
      if (el('info-fps')) el('info-fps').textContent =
        `${this.engine.fps.toFixed(0)} fps`;
      if (el('info-res')) el('info-res').textContent =
        `${this.engine.width}×${this.engine.height}`;
    }, 500);
  }

  _toast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
}
