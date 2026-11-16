(function (BH) {
  'use strict';

  const DEG = Math.PI / 180;
  const TAU = 2 * Math.PI;
  const DIST_MIN = 4;
  const DIST_MAX = 200;
  const ELEV_MAX = 89.5 * DEG;
  const ROT_PER_PX = 0.005;

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const wrapDeg = d => ((d + 180) % 360 + 360) % 360 - 180;

  // Orbit camera around the hole with the spin axis as "up". Azimuth 0° in the UI is the
  // default front view, which sits at -90° in world coordinates (looking along +y).
  class OrbitControls {
    constructor(el) {
      this.el = el;
      this.value = { az: -90 * DEG, elev: 4.5 * DEG, dist: 26, roll: 0 };
      this.target = Object.assign({}, this.value);
      this.vel = { az: 0, elev: 0 };
      this.autoRotate = false;
      this.rotateSpeed = 3 * DEG;
      this.pointers = new Map();
      this.pinch = 0;
      this.lastMove = 0;
      this.onInteract = null;
      this.onReset = null;
      this._bind();
    }

    get dragging() {
      return this.pointers.size > 0;
    }

    _interact() {
      if (this.onInteract) this.onInteract();
    }

    _pinchDistance() {
      const [a, b] = [...this.pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    _bind() {
      const el = this.el;

      el.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
        el.setPointerCapture(e.pointerId);
        this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        this.vel.az = 0;
        this.vel.elev = 0;
        this.lastMove = performance.now();
        el.classList.add('dragging');
        if (this.pointers.size === 2) this.pinch = this._pinchDistance();
        this._interact();
      });

      el.addEventListener('pointermove', e => {
        const p = this.pointers.get(e.pointerId);
        if (!p) return;
        const dx = e.clientX - p.x;
        const dy = e.clientY - p.y;
        p.x = e.clientX;
        p.y = e.clientY;
        if (this.pointers.size === 1) {
          const dAz = -dx * ROT_PER_PX;
          const dEl = dy * ROT_PER_PX;
          this.target.az += dAz;
          this.target.elev = clamp(this.target.elev + dEl, -ELEV_MAX, ELEV_MAX);
          const now = performance.now();
          const dt = Math.max(4, now - this.lastMove) / 1000;
          this.vel.az = 0.6 * this.vel.az + 0.4 * dAz / dt;
          this.vel.elev = 0.6 * this.vel.elev + 0.4 * dEl / dt;
          this.lastMove = now;
        } else if (this.pointers.size === 2) {
          const d = this._pinchDistance();
          if (this.pinch > 0 && d > 0) this.target.dist = clamp(this.target.dist * this.pinch / d, DIST_MIN, DIST_MAX);
          this.pinch = d;
        }
      });

      const end = e => {
        if (!this.pointers.delete(e.pointerId)) return;
        if (this.pointers.size < 2) this.pinch = 0;
        if (this.pointers.size === 0) {
          el.classList.remove('dragging');
          // A pointer that was held still before release should not fling the view.
          if (performance.now() - this.lastMove > 80) {
            this.vel.az = 0;
            this.vel.elev = 0;
          }
        }
      };
      el.addEventListener('pointerup', end);
      el.addEventListener('pointercancel', end);

      el.addEventListener('wheel', e => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        this.target.dist = clamp(this.target.dist * Math.exp(e.deltaY * unit * 0.0012), DIST_MIN, DIST_MAX);
        this._interact();
      }, { passive: false });

      el.addEventListener('dblclick', () => {
        if (this.onReset) this.onReset();
      });
    }

    // View parameters in UI units: distance in M, angles in degrees.
    getView(key) {
      const t = this.target;
      if (key === 'dist') return t.dist;
      if (key === 'elev') return t.elev / DEG;
      if (key === 'roll') return t.roll / DEG;
      return wrapDeg(t.az / DEG + 90);
    }

    setView(key, v, immediate) {
      const t = this.target;
      if (key === 'dist') {
        t.dist = clamp(v, DIST_MIN, DIST_MAX);
      } else if (key === 'elev') {
        t.elev = clamp(v * DEG, -ELEV_MAX, ELEV_MAX);
      } else if (key === 'roll') {
        t.roll = v * DEG;
      } else {
        const want = (v - 90) * DEG;
        t.az = want + TAU * Math.round((this.value.az - want) / TAU);
      }
      if (immediate) this.value[key] = t[key];
      this.vel.az = 0;
      this.vel.elev = 0;
    }

    update(dt) {
      const t = this.target;
      if (!this.dragging) {
        if (this.vel.az || this.vel.elev) {
          t.az += this.vel.az * dt;
          t.elev = clamp(t.elev + this.vel.elev * dt, -ELEV_MAX, ELEV_MAX);
          const decay = Math.exp(-dt * 3.5);
          this.vel.az *= decay;
          this.vel.elev *= decay;
          if (Math.abs(this.vel.az) < 1e-3 && Math.abs(this.vel.elev) < 1e-3) {
            this.vel.az = 0;
            this.vel.elev = 0;
          }
        }
        if (this.autoRotate) t.az += this.rotateSpeed * dt;
      }
      if (Math.abs(this.value.az) > 2 * TAU) {
        const shift = TAU * Math.trunc(this.value.az / TAU);
        this.value.az -= shift;
        t.az -= shift;
      }

      const k = 1 - Math.exp(-dt * 12);
      let changed = false;
      for (const key of ['az', 'elev', 'dist', 'roll']) {
        const v = this.value[key];
        const d = t[key] - v;
        if (d === 0) continue;
        // Snap once close: the full-resolution trace only starts when the camera is exactly still.
        const eps = key === 'dist' ? 1e-4 * t.dist : 2e-5;
        this.value[key] = Math.abs(d) < eps ? t[key] : v + d * k;
        changed = true;
      }
      return changed;
    }

    camera() {
      const { az, elev, dist, roll } = this.value;
      const ce = Math.cos(elev);
      const se = Math.sin(elev);
      const ca = Math.cos(az);
      const sa = Math.sin(az);
      const pos = [dist * ce * ca, dist * ce * sa, dist * se];
      const fwd = [-ce * ca, -ce * sa, -se];
      // right = fwd × z, up = right × fwd
      const rl = Math.hypot(fwd[1], fwd[0]);
      const rx = fwd[1] / rl;
      const ry = -fwd[0] / rl;
      const up0 = [ry * fwd[2], -rx * fwd[2], rx * fwd[1] - ry * fwd[0]];
      const cr = Math.cos(roll);
      const sr = Math.sin(roll);
      const right = [rx * cr + up0[0] * sr, ry * cr + up0[1] * sr, up0[2] * sr];
      const up = [up0[0] * cr - rx * sr, up0[1] * cr - ry * sr, up0[2] * cr];
      return { pos, fwd, up, right };
    }
  }

  OrbitControls.wrapDeg = wrapDeg;
  BH.OrbitControls = OrbitControls;
})(window.BH = window.BH || {});
