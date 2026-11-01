/* ============================================================
   controls.js — 鼠标 / 触摸轨道控制
   左键拖拽 = 旋转视角，滚轮 = 推拉镜头，Shift = 微调倾角
   ============================================================ */
(function (global) {
  'use strict';

  // 角度单位统一为「度」
  const MIN_ELEV = 0.25;     // 避免严格共面时测地线退化
  const MAX_ELEV = 89;

  class OrbitControls {
    constructor(canvas, state, onChange) {
      this.canvas = canvas;
      this.state = state;
      this.onChange = onChange || function () {};
      this.dragging = false;
      this.fine = false;
      this.lx = 0; this.ly = 0;
      this.pointers = new Map();
      this.pinchDist = 0;

      canvas.addEventListener('pointerdown', this._down.bind(this));
      window.addEventListener('pointermove', this._move.bind(this));
      window.addEventListener('pointerup', this._up.bind(this));
      window.addEventListener('pointercancel', this._up.bind(this));
      canvas.addEventListener('wheel', this._wheel.bind(this), { passive: false });
      canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    _down(e) {
      this.canvas.setPointerCapture && this.canvas.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pointers.size === 1) {
        this.dragging = true;
        this.fine = e.shiftKey;
        this.lx = e.clientX; this.ly = e.clientY;
        this.canvas.classList.add('dragging');
      } else if (this.pointers.size === 2) {
        this.pinchDist = this._dist();
      }
    }

    _move(e) {
      if (!this.pointers.has(e.pointerId)) return;
      this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (this.pointers.size === 2) {
        const d = this._dist();
        if (this.pinchDist > 0) this._zoom((this.pinchDist - d) * 0.012);
        this.pinchDist = d;
        return;
      }
      if (!this.dragging) return;

      const dx = e.clientX - this.lx;
      const dy = e.clientY - this.ly;
      this.lx = e.clientX; this.ly = e.clientY;

      const k = this.fine ? 0.07 : 0.3;      // 度 / 像素
      this.state.azimuth -= dx * k;
      this.state.elevation += dy * k;
      this._clampElev();
      this.onChange('camera');
    }

    _up(e) {
      this.pointers.delete(e.pointerId);
      if (this.pointers.size < 2) this.pinchDist = 0;
      if (this.pointers.size === 0) {
        this.dragging = false;
        this.canvas.classList.remove('dragging');
      }
    }

    _dist() {
      const p = Array.from(this.pointers.values());
      return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
    }

    _wheel(e) {
      e.preventDefault();
      this._zoom(e.deltaY * (e.deltaMode === 1 ? 0.02 : 0.0011));
    }

    _zoom(delta) {
      this.state.zoom = Math.min(4.0, Math.max(0.28, this.state.zoom * Math.exp(delta)));
      this.onChange('camera');
    }

    _clampElev() {
      let el = this.state.elevation;
      if (Math.abs(el) < MIN_ELEV) el = MIN_ELEV * (el < 0 ? -1 : 1);
      this.state.elevation = Math.max(-MAX_ELEV, Math.min(MAX_ELEV, el));
    }

    reset() {
      this.state.azimuth = -90;
      this.state.elevation = 12;
      this.state.zoom = 1;
      this.onChange('camera');
    }
  }

  global.OrbitControls = OrbitControls;
})(window);
