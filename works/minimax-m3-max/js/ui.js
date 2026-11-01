/* ============================================================
   ui.js — 侧边栏参数面板（由参数表动态生成）
   ============================================================ */
(function (global) {
  'use strict';

  const P = global.PARAMS;

  class UI {
    constructor(state, onChange) {
      this.state = state;
      this.onChange = onChange || function () {};
      this.ctrls = new Map();
      this.activeTab = 'hole';
      this._buildTabs();
      this._buildPanels();
      this.sync();
    }

    /* ---------------- 标签页 ---------------- */
    _buildTabs() {
      const tabs = document.getElementById('tabs');
      const mk = (id, label) => {
        const b = document.createElement('button');
        b.textContent = label;
        b.dataset.tab = id;
        b.addEventListener('click', () => this.showTab(id));
        tabs.appendChild(b);
        return b;
      };
      P.GROUPS.forEach(g => mk(g.id, g.name));
      mk('preset', '预设');
      this.tabButtons = Array.from(tabs.querySelectorAll('button'));
    }

    showTab(id) {
      this.activeTab = id;
      this.tabButtons.forEach(b => b.classList.toggle('on', b.dataset.tab === id));
      document.querySelectorAll('.panel-page').forEach(p => {
        p.style.display = p.dataset.page === id ? '' : 'none';
      });
    }

    /* ---------------- 控件生成 ---------------- */
    _buildPanels() {
      const body = document.getElementById('panel-body');

      /* 预设页 */
      const pp = document.createElement('div');
      pp.className = 'panel-page';
      pp.dataset.page = 'preset';
      const pg = document.createElement('div');
      pg.className = 'group';
      const gt = document.createElement('div');
      gt.className = 'group-title';
      gt.textContent = '场景预设';
      pg.appendChild(gt);
      const wrap = document.createElement('div');
      wrap.className = 'presets';
      P.PRESETS.forEach(pre => {
        const b = document.createElement('button');
        b.textContent = pre.name;
        if (pre.wide) b.classList.add('wide');
        b.addEventListener('click', () => this.applyPreset(pre));
        wrap.appendChild(b);
      });
      pg.appendChild(wrap);
      pp.appendChild(pg);
      body.appendChild(pp);

      /* 各参数组 */
      P.GROUPS.forEach(g => {
        const page = document.createElement('div');
        page.className = 'panel-page';
        page.dataset.page = g.id;
        const grp = document.createElement('div');
        grp.className = 'group';
        const t = document.createElement('div');
        t.className = 'group-title';
        t.textContent = g.name;
        grp.appendChild(t);
        g.items.forEach(item => grp.appendChild(this._makeControl(item)));
        page.appendChild(grp);
        body.appendChild(page);
      });

      this.showTab('hole');
    }

    _makeControl(item) {
      const st = this.state;

      if (item.type === 'range') {
        const wrap = document.createElement('div');
        wrap.className = 'ctl';
        const top = document.createElement('div');
        top.className = 'ctl-top';
        const lab = document.createElement('div');
        lab.className = 'ctl-label';
        lab.textContent = item.label;
        const val = document.createElement('div');
        val.className = 'ctl-val';
        top.appendChild(lab); top.appendChild(val);
        const input = document.createElement('input');
        input.type = 'range';
        input.min = item.min; input.max = item.max; input.step = item.step;
        input.value = st[item.key];
        wrap.appendChild(top); wrap.appendChild(input);
        if (item.hint) {
          const h = document.createElement('div');
          h.className = 'ctl-hint';
          h.textContent = item.hint;
          wrap.appendChild(h);
        }
        const update = () => {
          const v = st[item.key];
          input.value = v;
          val.textContent = item.fmt ? item.fmt(v) : String(v);
          const pct = (v - item.min) / (item.max - item.min) * 100;
          input.style.setProperty('--pct', pct.toFixed(2) + '%');
        };
        input.addEventListener('input', () => {
          st[item.key] = parseFloat(input.value);
          if (item.key === 'diskIn') st._inTouched = true;
          update();
          this.onChange(item.key);
        });
        this.ctrls.set(item.key, { update });
        update();
        return wrap;
      }

      if (item.type === 'toggle') {
        const wrap = document.createElement('div');
        wrap.className = 'toggle';
        const lab = document.createElement('span');
        lab.textContent = item.label;
        const sw = document.createElement('div');
        sw.className = 'switch';
        wrap.appendChild(lab); wrap.appendChild(sw);
        const update = () => wrap.classList.toggle('on', !!st[item.key]);
        wrap.addEventListener('click', () => {
          st[item.key] = !st[item.key];
          update();
          this.onChange(item.key);
        });
        this.ctrls.set(item.key, { update });
        update();
        return wrap;
      }

      if (item.type === 'seg') {
        const wrap = document.createElement('div');
        const top = document.createElement('div');
        top.className = 'ctl-top';
        const lab = document.createElement('div');
        lab.className = 'ctl-label';
        lab.textContent = item.label;
        top.appendChild(lab);
        const seg = document.createElement('div');
        seg.className = 'seg';
        item.options.forEach((opt, i) => {
          const b = document.createElement('button');
          b.textContent = opt;
          b.addEventListener('click', () => {
            st[item.key] = item.values[i];
            update();
            this.onChange(item.key);
          });
          seg.appendChild(b);
        });
        wrap.appendChild(top); wrap.appendChild(seg);
        const update = () => {
          const idx = item.values.indexOf(st[item.key]);
          Array.from(seg.children).forEach((b, i) => b.classList.toggle('on', i === idx));
        };
        this.ctrls.set(item.key, { update });
        update();
        return wrap;
      }
      return document.createElement('div');
    }

    /* ---------------- 预设 ---------------- */
    applyPreset(pre) {
      Object.assign(this.state, pre.patch);
      this.state._inTouched = false;
      this.sync();
      this.onChange('preset');
    }

    /* ---------------- 外部同步 ---------------- */
    sync() {
      this.ctrls.forEach(c => c.update());
    }
  }

  global.UI = UI;
})(window);
