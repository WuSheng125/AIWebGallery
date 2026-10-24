(function (BH) {
  'use strict';

  // Kerr black hole in geometric units (G = c = M = 1). Spin a is in [0, 1).

  function horizon(a) {
    return 1 + Math.sqrt(Math.max(0, 1 - a * a));
  }

  // Innermost stable circular orbit, prograde (Bardeen, Press & Teukolsky 1972).
  function isco(a) {
    const z1 = 1 + Math.cbrt(1 - a * a) * (Math.cbrt(1 + a) + Math.cbrt(1 - a));
    const z2 = Math.sqrt(3 * a * a + z1 * z1);
    return 3 + z2 - Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
  }

  // Equatorial circular photon orbit.
  function photonOrbit(a, prograde) {
    return 2 * (1 + Math.cos((2 / 3) * Math.acos(prograde ? -a : a)));
  }

  function ergosphere(a, theta) {
    const c = Math.cos(theta);
    return 1 + Math.sqrt(Math.max(0, 1 - a * a * c * c));
  }

  // Specific energy of a prograde circular orbit; 1 - E(isco) is the accretion efficiency.
  function circularEnergy(r, a) {
    const sr = Math.sqrt(r), r32 = r * sr;
    return (r32 - 2 * sr + a) / (Math.pow(r, 0.75) * Math.sqrt(r32 - 3 * sr + 2 * a));
  }

  function efficiency(a) {
    return 1 - circularEnergy(isco(a), a);
  }

  // Boundary of the photon shell (spherical photon orbits) in the (r, theta) plane:
  // for each radius between the prograde and retrograde orbits, the smallest polar angle reached.
  function photonShell(a, n) {
    const rp = photonOrbit(a, true), rr = photonOrbit(a, false);
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const r = rp + (rr - rp) * i / n;
      const xi = -(r * r * r - 3 * r * r + a * a * r + a * a) / (a * (r - 1));
      const eta = -(r * r * r) * (r * r * r - 6 * r * r + 9 * r - 4 * a * a) / (a * a * (r - 1) * (r - 1));
      const B = a * a - eta - xi * xi;
      const u2 = (B + Math.sqrt(Math.max(0, B * B + 4 * a * a * eta))) / (2 * a * a);
      pts.push([r, Math.acos(Math.sqrt(Math.min(1, Math.max(0, u2))))]);
    }
    return pts;
  }

  // Kerr–Schild metric g_{mu nu} (index order t, x, y, z).
  function ksMetric(x, y, z, a) {
    const a2 = a * a;
    const w = x * x + y * y + z * z - a2;
    const r2 = 0.5 * (w + Math.sqrt(w * w + 4 * a2 * z * z));
    const r = Math.sqrt(r2);
    const f = 2 * r * r2 / (r2 * r2 + a2 * z * z);
    const S = r2 + a2;
    const l = [1, (r * x + a * y) / S, (r * y - a * x) / S, z / r];
    const eta = [-1, 1, 1, 1];
    const g = [];
    for (let m = 0; m < 4; m++) {
      g.push([]);
      for (let n = 0; n < 4; n++) g[m].push((m === n ? eta[m] : 0) + f * l[m] * l[n]);
    }
    return { g, f, r };
  }

  // Orthonormal frame of a static observer at pos, built by Gram–Schmidt against the metric.
  // Returns the frame vectors with lowered indices; the shader combines them per pixel into
  // the photon's covariant momentum. `a` is the spin used by the integrator.
  function cameraFrame(pos, fwd, up, right, a) {
    const { g, f } = ksMetric(pos[0], pos[1], pos[2], a);
    const dot = (u, v) => {
      let s = 0;
      for (let m = 0; m < 4; m++) for (let n = 0; n < 4; n++) s += g[m][n] * u[m] * v[n];
      return s;
    };
    const lower = u => g.map(row => row[0] * u[0] + row[1] * u[1] + row[2] * u[2] + row[3] * u[3]);
    const e0 = [1 / Math.sqrt(-g[0][0]), 0, 0, 0];
    const ortho = (v, basis) => {
      const w = v.slice();
      const c0 = dot(w, e0);
      for (let m = 0; m < 4; m++) w[m] += c0 * e0[m];
      for (const b of basis) {
        const c = dot(w, b);
        for (let m = 0; m < 4; m++) w[m] -= c * b[m];
      }
      const n = Math.sqrt(dot(w, w));
      return w.map(q => q / n);
    };
    const eF = ortho([0, fwd[0], fwd[1], fwd[2]], []);
    const eU = ortho([0, up[0], up[1], up[2]], [eF]);
    const eR = ortho([0, right[0], right[1], right[2]], [eF, eU]);
    const E0 = lower(e0), ER = lower(eR), EU = lower(eU), EF = lower(eF);
    return {
      e0: E0.slice(1), eRight: ER.slice(1), eUp: EU.slice(1), eFwd: EF.slice(1),
      invLapse: 1 / Math.sqrt(1 - f),
      clockRate: Math.sqrt(1 - f),
    };
  }

  BH.Kerr = { horizon, isco, photonOrbit, ergosphere, circularEnergy, efficiency, photonShell, ksMetric, cameraFrame };
})(window.BH = window.BH || {});
