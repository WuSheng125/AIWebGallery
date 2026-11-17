/* ============================================================
   camera.js — 阻尼轨道相机（拖拽旋转 / 滚轮缩放 / 双指捏合 / 自动旋转）
   坐标约定：黑洞位于原点，吸积盘在 y=0 赤道面，单位为史瓦西半径 rs。
   ============================================================ */
'use strict';

class OrbitCamera {
  constructor() {
    this.yaw = 0.55;          // 当前值
    this.pitch = 0.09;
    this.dist = 19;
    this.tYaw = this.yaw;     // 目标值（阻尼跟随）
    this.tPitch = this.pitch;
    this.tDist = this.dist;
    this.autoRotate = true;
    this.rotSpeed = 0.03;     // rad/s
    this.pos = [0, 0, 19];
    this.basis = new Float32Array(9); // 列主序：right / up / forward
    this.moving = true;
    this._pointers = new Map();
    this._pinchDist = 0;
  }

  reset() {
    this.tYaw = 0.55; this.tPitch = 0.09; this.tDist = 19;
  }

  rotate(dx, dy) {
    this.tYaw -= dx * 0.0052;
    this.tPitch += dy * 0.0052;
    const lim = 1.45; // ≈83°，避免万向节退化
    this.tPitch = Math.min(lim, Math.max(-lim, this.tPitch));
  }

  zoom(delta) {
    this.tDist *= Math.exp(delta * 0.0011);
    this.tDist = Math.min(60, Math.max(2.2, this.tDist));
  }

  update(dt) {
    if (this.autoRotate && this._pointers.size === 0) {
      this.tYaw += this.rotSpeed * dt;
    }
    const k = 1 - Math.exp(-dt * 7.5);
    const dyaw = this.tYaw - this.yaw;
    const dpitch = this.tPitch - this.pitch;
    const ddist = this.tDist - this.dist;
    this.yaw += dyaw * k;
    this.pitch += dpitch * k;
    this.dist += ddist * k;
    this.moving = Math.abs(dyaw) + Math.abs(dpitch) + Math.abs(ddist) > 1e-4;

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    const p = [this.dist * cp * sy, this.dist * sp, this.dist * cp * cy];
    this.pos = p;

    // forward = 指向原点
    const fl = Math.hypot(p[0], p[1], p[2]);
    const f = [-p[0] / fl, -p[1] / fl, -p[2] / fl];
    // right = forward × worldUp
    let r = [-f[2], 0, f[0]];
    const rl = Math.hypot(r[0], r[1], r[2]) || 1;
    r = [r[0] / rl, r[1] / rl, r[2] / rl];
    // up = right × forward
    const u = [
      r[1] * f[2] - r[2] * f[1],
      r[2] * f[0] - r[0] * f[2],
      r[0] * f[1] - r[1] * f[0],
    ];
    this.basis.set([r[0], r[1], r[2], u[0], u[1], u[2], f[0], f[1], f[2]]);
  }

  /** 绑定指针输入到画布 */
  attach(canvas, onChange) {
    this._canvas = canvas;
    const fire = () => onChange && onChange();

    canvas.addEventListener('pointerdown', (e) => {
      canvas.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        this._pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
      canvas.classList.add('dragging');
      fire();
    });

    canvas.addEventListener('pointermove', (e) => {
      const pt = this._pointers.get(e.pointerId);
      if (!pt) return;
      const dx = e.clientX - pt.x, dy = e.clientY - pt.y;
      pt.x = e.clientX; pt.y = e.clientY;

      if (this._pointers.size === 1) {
        this.rotate(dx, dy);
      } else if (this._pointers.size === 2) {
        const [a, b] = [...this._pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this._pinchDist > 0) this.zoom((this._pinchDist - d) * 2.2);
        this._pinchDist = d;
        this.rotate(dx * 0.5, dy * 0.5);
      }
      fire();
    });

    const release = (e) => {
      this._pointers.delete(e.pointerId);
      this._pinchDist = 0;
      if (this._pointers.size === 0) canvas.classList.remove('dragging');
      fire();
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const d = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      this.zoom(d);
      fire();
    }, { passive: false });

    canvas.addEventListener('dblclick', () => { this.reset(); fire(); });
  }
}