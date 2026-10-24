(function (BH) {
  'use strict';

  const DEG = Math.PI / 180;

  const PRESETS = [
    { name: '电影版', az: 0, elev: 4.5, dist: 26, fov: 52, roll: 0, spin: 0.6, autoInner: true, rout: 20,
      temp: 6200, tempSlope: 0.55, bright: 1.6, falloff: 1.8, opacity: 0.9, turb: 0.75, speed: 1, doppler: 0,
      stars: 1, milky: 0.3, exposure: 1, bloom: 0.6, bloomRadius: 1, grain: 0.3, vignette: 0.4 },
    { name: '物理真实', az: 0, elev: 4.5, dist: 26, fov: 52, roll: 0, spin: 0.7, autoInner: true, rout: 18,
      temp: 4000, tempSlope: 0.75, bright: 0.85, falloff: 2.8, opacity: 0.65, turb: 0.4, speed: 1, doppler: 0.85,
      stars: 1, milky: 0.5, exposure: 0.8, bloom: 0.5, bloomRadius: 0.9, grain: 0.2, vignette: 0.3 },
    { name: '无自旋', az: 0, elev: 5, dist: 18, fov: 58, roll: 0, spin: 0, autoInner: true, rout: 15,
      temp: 6500, tempSlope: 0.75, bright: 1.1, falloff: 2.1, opacity: 0.75, turb: 0.6, speed: 1, doppler: 0,
      stars: 1, milky: 0.35, exposure: 1, bloom: 0.55, bloomRadius: 1, grain: 0.25, vignette: 0.35 },
    { name: '极限自旋', az: 0, elev: 3, dist: 28, fov: 50, roll: 0, spin: 0.998, autoInner: true, rout: 24,
      temp: 5800, tempSlope: 0.4, bright: 2.4, falloff: 1.5, opacity: 1, turb: 0.8, speed: 1, doppler: 0,
      stars: 1, milky: 0.4, exposure: 1.15, bloom: 0.72, bloomRadius: 1.1, grain: 0.3, vignette: 0.45 },
    { name: '俯瞰盘面', az: 0, elev: 68, dist: 22, fov: 54, roll: 0, spin: 0.65, autoInner: true, rout: 18,
      temp: 6200, tempSlope: 0.55, bright: 1.4, falloff: 1.9, opacity: 0.85, turb: 0.7, speed: 1, doppler: 0,
      stars: 1, milky: 0.45, exposure: 1, bloom: 0.58, bloomRadius: 1, grain: 0.28, vignette: 0.38 },
    { name: '贴近视界', az: 0, elev: 2, dist: 4.2, fov: 75, roll: 0, spin: 0.8, autoInner: true, rout: 18,
      temp: 6500, tempSlope: 0.6, bright: 2.5, falloff: 1.7, opacity: 1.05, turb: 0.8, speed: 1, doppler: 0,
      stars: 1.3, milky: 0.6, exposure: 1.3, bloom: 0.72, bloomRadius: 1.2, grain: 0.32, vignette: 0.5 },
  ];

  const PRESET_DESC = [
    '卡冈图雅的标志性侧面观察视角，带有明显的光圈。',
    '更慢的温度梯度和更强的多普勒效应，符合预期的物理外观。',
    '施瓦西黑洞：无自旋，完美对称，较窄的盘面。',
    '接近理论极限的旋转，事件视界外非常贴近盘面。',
    '从高仰角观察盘面的结构和湍流。',
    '坐标点靠近视界，周围时空的弯曲达到极限。',
  ];

  function clamp(v, lo, hi) {
    return Math.min(hi, Math.max(lo, v));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function lerpAngle(a, b, t) {
    const w = BH.OrbitControls.wrapDeg;
    return w(lerp(w(a), w(b), t));
  }

  function ease(t) {
    return t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t);
  }

  // Schema for the panel. Each section is {name, items: [{type, ...}]}, optionally closed.
  // Controls: {label, math?, range, min, max, map?, value, note?, disabled?}, or
  // {type: 'toggle', label}, {type: 'seg', label, options}, {type: 'custom', element}.
  class UI {
    constructor(container, P, controls, renderer) {
      this.container = container;
      this.P = P;
      this.controls = controls;
      this.renderer = renderer;
      this.tweening = null;
      this.listeners = new Map();
      this.schema = this._schema();
      this._build();
      this._updateAll();
    }

    _schema() {
      const v = this.P;
      const diagram = this._diagram();
      const readouts = this._readouts();
      return {
        presets: {
          name: '场景', items: [
            { type: 'custom', element: diagram },
            { type: 'preset', presets: PRESETS },
            { type: 'custom', element: readouts },
          ]
        },
        blackhole: {
          name: '黑洞', items: [
            { key: 'spin', label: '自旋', math: 'a', range: true, min: 0, max: 0.998, value: v.spin, note: 'a = J c / (G M²)，无量纲角动量' },
          ]
        },
        disk: {
          name: '吸积盘', items: [
            { type: 'toggle', key: 'autoInner', label: '内边缘设于最内稳定圆轨道', value: v.autoInner },
            { key: 'rin', label: '内边缘', math: 'r₁', range: true, min: 1.3, max: 12, map: 'log', value: v.rin, disabled: () => v.autoInner },
            { key: 'rout', label: '外边缘', math: 'r₂', range: true, min: 6, max: 50, map: 'log', value: v.rout },
            { key: 'temp', label: '温度', range: true, min: 1200, max: 16000, value: v.temp, swatch: true },
            { key: 'tempSlope', label: '温度梯度', math: 'q', range: true, min: 0, max: 1.2, value: v.tempSlope, note: 'T(r) ∝ r^(-q)' },
            { key: 'bright', label: '亮度', range: true, min: 0, max: 4, value: v.bright },
            { key: 'falloff', label: '亮度衰减', math: 'β', range: true, min: 0.5, max: 3.5, value: v.falloff, note: 'I(r) ∝ r^(-β)' },
            { key: 'opacity', label: '不透明度', math: 'τ₀', range: true, min: 0, max: 1.5, value: v.opacity },
            { key: 'turb', label: '湍流强度', range: true, min: 0, max: 1, value: v.turb },
            { key: 'speed', label: '湍流速度', range: true, min: 0, max: 3, value: v.speed },
            { key: 'doppler', label: '多普勒指数', range: true, min: 0, max: 1, value: v.doppler, note: '强度 ∝ g^(4·u)，温度 ∝ g^u' },
          ]
        },
        view: {
          name: '视角', items: [
            { key: 'dist', label: '距离', math: 'D', range: true, min: 4, max: 120, map: 'log', value: this.controls.getView('dist') },
            { key: 'elev', label: '仰角', range: true, min: -89, max: 89, value: this.controls.getView('elev') },
            { key: 'az', label: '方位角', range: true, min: -180, max: 180, value: this.controls.getView('az') },
            { key: 'fov', label: '视野', range: true, min: 20, max: 100, value: v.fov },
            { key: 'roll', label: '横滚角', range: true, min: -180, max: 180, value: this.controls.getView('roll') },
            { type: 'toggle', key: 'autoRotate', label: '自动旋转', value: this.controls.autoRotate },
            { key: 'rotateSpeed', label: '自动旋转速度', range: true, min: 0.5, max: 12, value: this.controls.rotateSpeed / DEG, disabled: () => !this.controls.autoRotate },
          ]
        },
        sky: {
          name: '星空', items: [
            { key: 'stars', label: '恒星', range: true, min: 0, max: 2, value: v.stars },
            { key: 'milky', label: '银河', range: true, min: 0, max: 1, value: v.milky },
          ]
        },
        post: {
          name: '成像', items: [
            { key: 'exposure', label: '曝光', range: true, min: -1, max: 1.5, value: v.exposure, note: '以 EV（stops）单位' },
            { key: 'bloom', label: '辉光强度', range: true, min: 0, max: 1, value: v.bloom },
            { key: 'bloomRadius', label: '辉光半径', range: true, min: 0.2, max: 2, value: v.bloomRadius },
            { key: 'grain', label: '颗粒', range: true, min: 0, max: 1, value: v.grain },
            { key: 'vignette', label: '晕影', range: true, min: 0, max: 1, value: v.vignette },
          ]
        },
        perf: {
          name: '性能', items: [
            { type: 'seg', key: 'quality', label: '画面质量', options: ['流畅', '均衡', '精细', '极致'], value: v.quality },
            { type: 'seg', key: 'resolution', label: '分辨率', options: ['1/2', '3/4', '1/1'], value: v.resolution },
          ]
        },
        about: {
          name: '说明', closed: true, items: [
            { type: 'custom', element: this._about() },
          ]
        },
      };
    }

    _build() {
      this.container.innerHTML = '';
      for (const key in this.schema) {
        const s = this.schema[key];
        const div = document.createElement('div');
        div.className = 'section' + (s.closed ? ' closed' : '');
        const head = document.createElement('button');
        head.className = 'section-head';
        head.type = 'button';
        head.innerHTML = `<span>${s.name}</span><i></i>`;
        head.addEventListener('click', () => div.classList.toggle('closed'));
        div.appendChild(head);
        const body = document.createElement('div');
        body.className = 'section-content';
        s.items.forEach(it => {
          if (it.type === 'custom') {
            body.appendChild(it.element);
          } else if (it.type === 'preset') {
            body.appendChild(this._presetsElement(it.presets));
          } else if (it.type === 'toggle') {
            body.appendChild(this._toggle(it));
          } else if (it.type === 'seg') {
            body.appendChild(this._seg(it));
          } else {
            body.appendChild(this._range(it));
          }
        });
        div.appendChild(body);
        this.container.appendChild(div);
      }
    }

    _presetsElement(presets) {
      const grid = document.createElement('div');
      grid.className = 'presets';
      presets.forEach((p, i) => {
        const btn = document.createElement('button');
        btn.className = 'preset';
        btn.type = 'button';
        btn.textContent = p.name;
        btn.setAttribute('aria-pressed', 'false');
        btn.addEventListener('click', () => {
          this._applyPreset(p);
          this._updatePresetButtons();
        });
        grid.appendChild(btn);
      });
      const desc = document.createElement('p');
      desc.className = 'preset-desc';
      desc.textContent = PRESET_DESC[0];
      grid.querySelectorAll('.preset').forEach((btn, i) => {
        btn.addEventListener('mouseenter', () => { desc.textContent = PRESET_DESC[i]; });
        btn.addEventListener('mouseleave', () => {
          const pressed = grid.querySelector('.preset[aria-pressed="true"]');
          const j = pressed ? [...grid.querySelectorAll('.preset')].indexOf(pressed) : 0;
          desc.textContent = PRESET_DESC[j];
        });
      });
      const wrap = document.createElement('div');
      wrap.appendChild(grid);
      wrap.appendChild(desc);
      return wrap;
    }

    _applyPreset(p) {
      if (this.tweening) this.tweening.cancel = true;
      const t0 = performance.now();
      const duration = 1200;
      const from = {};
      const to = {};
      const keys = ['az', 'elev', 'dist', 'fov', 'roll', 'spin', 'autoInner', 'rin', 'rout', 'temp', 'tempSlope',
                    'bright', 'falloff', 'opacity', 'turb', 'speed', 'doppler', 'stars', 'milky', 'exposure',
                    'bloom', 'bloomRadius', 'grain', 'vignette'];
      keys.forEach(k => {
        if (['az', 'elev', 'dist', 'roll'].includes(k)) {
          from[k] = this.controls.getView(k);
          to[k] = p[k];
        } else {
          from[k] = this.P[k];
          to[k] = p[k];
        }
      });
      const anim = { cancel: false };
      this.tweening = anim;
      const step = () => {
        if (anim.cancel) return;
        const now = performance.now();
        const t = clamp((now - t0) / duration, 0, 1);
        const s = ease(t);
        keys.forEach(k => {
          const v = k === 'az' ? lerpAngle(from[k], to[k], s) : lerp(from[k], to[k], s);
          if (['az', 'elev', 'dist', 'roll'].includes(k)) {
            this.controls.setView(k, v, t >= 1);
          } else {
            this.P[k] = v;
          }
        });
        this._updateAll();
        if (t < 1) requestAnimationFrame(step);
        else this.tweening = null;
      };
      step();
    }

    _updatePresetButtons() {
      const grid = this.container.querySelector('.presets');
      if (!grid) return;
      grid.querySelectorAll('.preset').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
    }

    _range(item) {
      const wrap = document.createElement('div');
      wrap.className = 'ctl';
      if (item.disabled) wrap.setAttribute('data-key', item.key);
      const top = document.createElement('div');
      top.className = 'ctl-top';
      const lab = document.createElement('span');
      lab.className = 'ctl-label';
      lab.innerHTML = item.label + (item.math ? `<span class="m">${item.math}</span>` : '');
      const val = document.createElement('span');
      val.className = 'ctl-value';
      if (item.swatch) {
        const sw = document.createElement('span');
        sw.className = 'swatch';
        sw.setAttribute('data-key', item.key);
        val.appendChild(sw);
      }
      const num = document.createElement('span');
      num.setAttribute('data-key', item.key);
      val.appendChild(num);
      top.appendChild(lab);
      top.appendChild(val);
      wrap.appendChild(top);

      const inp = document.createElement('input');
      inp.type = 'range';
      inp.setAttribute('data-key', item.key);
      inp.min = 0;
      inp.max = 1000;
      inp.step = 1;
      if (item.note) {
        const note = document.createElement('p');
        note.className = 'ctl-note';
        note.textContent = item.note;
        wrap.appendChild(note);
      }
      wrap.appendChild(inp);
      inp.addEventListener('input', () => this._rangeInput(item, inp));
      return wrap;
    }

    _rangeInput(item, inp) {
      const f = parseFloat(inp.value) / 1000;
      const map = item.map === 'log' ? t => item.min * Math.exp(t * Math.log(item.max / item.min))
                                      : t => item.min + t * (item.max - item.min);
      const v = map(f);
      if (['az', 'elev', 'dist', 'roll'].includes(item.key)) {
        this.controls.setView(item.key, v, false);
      } else if (item.key === 'rotateSpeed') {
        this.controls.rotateSpeed = v * DEG;
      } else {
        this.P[item.key] = v;
      }
      if (item.swatch && item.key === 'temp') this._updateAccent();
      this._updateCtl(item.key);
    }

    _toggle(item) {
      const wrap = document.createElement('button');
      wrap.className = 'toggle';
      wrap.type = 'button';
      wrap.setAttribute('role', 'switch');
      wrap.setAttribute('data-key', item.key);
      const lab = document.createElement('span');
      lab.textContent = item.label;
      const knob = document.createElement('span');
      knob.className = 'knob';
      wrap.appendChild(lab);
      wrap.appendChild(knob);
      wrap.addEventListener('click', () => {
        if (item.key === 'autoRotate') {
          this.controls.autoRotate = !this.controls.autoRotate;
        } else {
          this.P[item.key] = !this.P[item.key];
        }
        this._updateCtl(item.key);
        this._updateAll();
      });
      return wrap;
    }

    _seg(item) {
      const wrap = document.createElement('div');
      wrap.className = 'ctl';
      const lab = document.createElement('p');
      lab.className = 'ctl-label';
      lab.textContent = item.label;
      wrap.appendChild(lab);
      const seg = document.createElement('div');
      seg.className = 'seg';
      seg.setAttribute('data-key', item.key);
      item.options.forEach((opt, i) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = opt;
        btn.setAttribute('data-value', String(i));
        btn.addEventListener('click', () => {
          this.P[item.key] = i;
          this._updateCtl(item.key);
        });
        seg.appendChild(btn);
      });
      wrap.appendChild(seg);
      return wrap;
    }

    _about() {
      const div = document.createElement('div');
      div.className = 'about';
      div.innerHTML = `
        <p>本页面实时求解广义相对论中的光线测地线，并模拟克尔时空（旋转黑洞）周围的吸积盘辐射。画面采用
        Kerr–Schild 坐标的 Hamiltonian 形式积分器，支持穿越事件视界的入流坐标系，以及引力红移、多普勒效应、
        引力透镜与框架拖曳的完整相对论效果。</p>
        <p>键盘快捷键：</p>
        <div class="keys">
          <span><kbd>H</kbd></span><span>显示/隐藏所有界面</span>
          <span><kbd>F</kbd></span><span>全屏</span>
          <span><kbd>R</kbd></span><span>复位视角</span>
          <span><kbd>空格</kbd></span><span>自动旋转</span>
          <span><kbd>P</kbd></span><span>截图</span>
        </div>
      `;
      return div;
    }

    _diagram() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'diagram');
      svg.setAttribute('viewBox', '0 0 230 130');
      svg.setAttribute('data-key', 'diagram');
      return svg;
    }

    _readouts() {
      const dl = document.createElement('dl');
      dl.className = 'readouts';
      dl.setAttribute('data-key', 'readouts');
      return dl;
    }

    _updateAll() {
      for (const sec in this.schema) {
        this.schema[sec].items.forEach(it => {
          if (it.key) this._updateCtl(it.key);
          if (it.disabled) {
            const el = this.container.querySelector(`.ctl[data-key="${it.key}"]`);
            if (el) el.classList.toggle('disabled', it.disabled());
          }
        });
      }
      this._updateDiagram();
    }

    _updateCtl(key) {
      let v;
      if (key === 'diagram') {
        this._updateDiagram();
        return;
      } else if (key === 'readouts') {
        this._updateReadouts();
        return;
      } else if (['az', 'elev', 'dist', 'roll'].includes(key)) {
        v = this.controls.getView(key);
      } else if (key === 'autoRotate') {
        v = this.controls.autoRotate;
      } else if (key === 'rotateSpeed') {
        v = this.controls.rotateSpeed / DEG;
      } else {
        v = this.P[key];
      }

      const toggle = this.container.querySelector(`.toggle[data-key="${key}"]`);
      if (toggle) {
        toggle.setAttribute('aria-checked', v ? 'true' : 'false');
        return;
      }

      const seg = this.container.querySelector(`.seg[data-key="${key}"]`);
      if (seg) {
        seg.querySelectorAll('button').forEach(b => {
          b.setAttribute('aria-pressed', parseInt(b.getAttribute('data-value')) === v ? 'true' : 'false');
        });
        return;
      }

      const inp = this.container.querySelector(`input[data-key="${key}"]`);
      if (!inp) return;
      const sec = Object.values(this.schema).find(s => s.items.some(it => it.key === key));
      if (!sec) return;
      const item = sec.items.find(it => it.key === key);
      if (!item || !item.range) return;
      const unmap = item.map === 'log' ? x => Math.log(x / item.min) / Math.log(item.max / item.min)
                                        : x => (x - item.min) / (item.max - item.min);
      const f = clamp(unmap(v), 0, 1);
      inp.value = String(Math.round(f * 1000));
      inp.style.setProperty('--fill', `${f * 100}%`);
      const span = this.container.querySelector(`.ctl-value span[data-key="${key}"]`);
      if (span && !span.classList.contains('swatch')) {
        const fmt = key === 'temp' ? d => Math.round(d) + ' K'
                  : key === 'az' || key === 'elev' || key === 'roll' ? d => d.toFixed(1) + '°'
                  : Math.abs(v) < 10 ? d => d.toFixed(2)
                  : d => d.toFixed(1);
        span.textContent = fmt(v);
      }
    }

    _updateDiagram() {
      const svg = this.container.querySelector('svg[data-key="diagram"]');
      if (!svg) return;
      const s = r => (r / (r + 4)) * 105;
      const a = this.P.spin;
      const rh = BH.Kerr.horizon(a);
      const ri = BH.Renderer.innerRadius(this.P);
      const ro = BH.Renderer.outerRadius(this.P);
      const rp = BH.Kerr.photonOrbit(a, true);
      const rr = BH.Kerr.photonOrbit(a, false);
      const shell = BH.Kerr.photonShell(a, 24);
      const erg = [];
      for (let th = 0; th <= Math.PI; th += Math.PI / 40) erg.push([BH.Kerr.ergosphere(a, th), th]);
      const polY = t => 65 - s(erg.find(p => Math.abs(p[1] - t) < 0.02)[0]) * Math.cos(t);
      const polX = t => 115 + s(erg.find(p => Math.abs(p[1] - t) < 0.02)[0]) * Math.sin(t);

      svg.innerHTML = `
        <line x1="10" y1="65" x2="220" y2="65" stroke="var(--hair-2)" stroke-width="0.75"/>
        <circle cx="115" cy="65" r="${s(rh)}" fill="none" stroke="var(--paper-3)" stroke-width="1" stroke-dasharray="1.5 1.5"/>
        <path d="M ${polX(0)} ${polY(0)} ${erg.filter((_, i) => i % 2 === 0).map(p => {
          const r = p[0];
          const t = p[1];
          return `L ${115 + s(r) * Math.sin(t)} ${65 - s(r) * Math.cos(t)}`;
        }).join(' ')} L ${polX(Math.PI)} ${polY(Math.PI)}" fill="none" stroke="var(--hair-2)" stroke-width="1"/>
        <path d="M ${115 + s(shell[0][0])} 65 ${shell.map(p => `L ${115 + s(p[0]) * Math.sin(p[1])} ${65 - s(p[0]) * Math.cos(p[1])}`).join(' ')}"
              fill="none" stroke="var(--cool)" stroke-width="1"/>
        <circle cx="115" cy="65" r="${s(rp)}" fill="none" stroke="var(--cool)" stroke-width="0.75" stroke-dasharray="2 1.5"/>
        <circle cx="115" cy="65" r="${s(rr)}" fill="none" stroke="var(--cool)" stroke-width="0.75" stroke-dasharray="2 1.5"/>
        <rect x="${115 - s(ro)}" y="${64.25}" width="${2 * s(ro)}" height="1.5" fill="var(--accent)" opacity="0.5"/>
        <rect x="${115 - s(ri)}" y="${64}" width="${2 * s(ri)}" height="2" fill="var(--accent)"/>
        ${this.controls ? (() => {
          const cam = this.controls.camera();
          const R = Math.hypot(cam.pos[0], cam.pos[1]);
          const phi = Math.atan2(cam.pos[1], cam.pos[0]);
          const cphi = Math.cos(phi);
          const sphi = Math.sin(phi);
          const xC = 115 + s(R) * cphi;
          const yC = 65 - s(cam.pos[2]);
          const dx = cam.fwd[0] * cphi + cam.fwd[1] * sphi;
          const dy = -cam.fwd[2];
          const len = 15;
          const xE = xC + dx * len;
          const yE = yC + dy * len;
          return `<line x1="${xC}" y1="${yC}" x2="${xE}" y2="${yE}" stroke="var(--paper)" stroke-width="1.25"/>
                  <circle cx="${xC}" cy="${yC}" r="2.5" fill="var(--paper)"/>`;
        })() : ''}
        <text x="4" y="7" class="lbl-accent">吸积盘</text>
        <text x="4" y="18" class="lbl-cool">光子球</text>
        <text x="4" y="29">事件视界</text>
        <text x="4" y="40">能层</text>
        ${this.controls ? `<text x="4" y="51">观测者</text>` : ''}
      `;
    }

    _updateReadouts() {
      const dl = this.container.querySelector('dl[data-key="readouts"]');
      if (!dl) return;
      const a = this.P.spin;
      const rh = BH.Kerr.horizon(a);
      const rp = BH.Kerr.photonOrbit(a, true);
      const rr = BH.Kerr.photonOrbit(a, false);
      const risco = BH.Kerr.isco(a);
      const eta = BH.Kerr.efficiency(a);
      const cam = this.controls ? this.controls.camera() : null;
      const frame = cam ? BH.Kerr.cameraFrame(cam.pos, cam.fwd, cam.up, cam.right, -a) : null;
      const clock = frame ? frame.clockRate : 1;
      dl.innerHTML = `
        <dt>事件视界<span class="m">r₊</span></dt><dd>${rh.toFixed(3)} M</dd>
        <dt>能层半径</dt><dd>${BH.Kerr.ergosphere(a, Math.PI / 2).toFixed(3)} M</dd>
        <dt>顺行光子轨道<span class="m">r_ph</span></dt><dd>${rp.toFixed(3)} M</dd>
        <dt>逆行光子轨道</dt><dd>${rr.toFixed(3)} M</dd>
        <dt>最内稳定圆轨道<span class="m">r_isco</span></dt><dd>${risco.toFixed(3)} M</dd>
        <dt>吸积效率<span class="m">η</span></dt><dd>${(eta * 100).toFixed(2)}%</dd>
        ${frame ? `<dt>观测者时钟速率</dt><dd>${clock.toFixed(4)}</dd>` : ''}
      `;
    }

    _updateAccent() {
      const T = this.P.temp * 0.62;
      const col = BH.Blackbody.cssColor(T);
      document.documentElement.style.setProperty('--accent', col);
      document.documentElement.style.setProperty('--accent-soft', BH.Blackbody.cssColor(T, 0.16));
      const sw = this.container.querySelector('.ctl-value .swatch[data-key="temp"]');
      if (sw) sw.style.color = col;
    }
  }

  BH.UI = UI;
})(window.BH = window.BH || {});
