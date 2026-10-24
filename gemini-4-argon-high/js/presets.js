/**
 * GARGANTUA — Relativistic Black Hole Simulation
 * Parameter Schema, Astrophysical Presets & General Relativistic Telemetry Formulas
 */
(function (global) {
  'use strict';

  // Default state modeled after Kip Thorne's Gargantua in "Interstellar" (2014)
  const DEFAULT_PARAMS = {
    // 1. Black Hole & Spacetime Metric Parameters
    massSolar: 100.0,         // In millions of solar masses (10^6 M_sun), Gargantua = 100M M_sun
    horizonRadius: 1.0,       // Visual Schwarzschild radius scale R_s
    spin: 0.96,               // Dimensionless Kerr spin parameter a* in [0.0, 0.999]
    lensingStrength: 1.0,     // Gravitational light-bending multiplier [0.0, 2.0]
    photonRingIntensity: 1.35,// Luminance of the critical photon sphere ring [0.0, 3.0]
    shadowAsymmetry: 0.85,    // Frame-dragging D-shape & horizontal shadow shift strength [0.0, 1.5]

    // 2. Relativistic Accretion Disk Parameters
    diskEnabled: true,        // Toggle accretion disk visibility
    diskInnerScale: 1.0,      // Multiplier on physical ISCO radius [0.6, 2.5]
    diskOuterRadius: 9.5,     // Outer truncation radius in units of R_s [4.0, 22.0]
    diskThickness: 0.11,      // Vertical scale height ratio H/R [0.03, 0.55]
    diskDensity: 1.45,        // Optical depth / plasma emission density [0.2, 3.0]
    diskRotationSpeed: 0.85,  // Relativistic Keplerian angular velocity scale [0.0, 2.5]
    dopplerBeaming: 0.62,     // Relativistic Doppler beaming asymmetry [0.0 = symmetric, 1.5 = extreme]
    diskTemperature: 5400,    // Peak inner disk effective temperature in Kelvin [1800, 22000]
    colorMode: 0,             // 0: Gargantua Gold, 1: Blackbody Kelvin, 2: Quasar Blue, 3: Crimson Ember, 4: Magnetar Cyan
    diskTurbulence: 1.15,     // Multi-octave MHD spiral filament contrast [0.1, 2.0]
    jetIntensity: 0.0,        // Relativistic polar astrophysical jet [0.0, 2.0]

    // 3. Background Cosmos & Optical Post-Processing
    starDensity: 1.15,        // Background starfield luminance & density [0.0, 2.5]
    nebulaIntensity: 0.85,    // Deep-space Milky Way dust & nebula brightness [0.0, 2.0]
    einsteinRingBoost: 1.25,  // Gravitational lensing magnification of background stars [0.0, 2.5]
    bloomStrength: 0.88,      // Multi-pass HDR bloom intensity [0.0, 2.5]
    anamorphicFlare: 0.65,    // IMAX 65mm horizontal anamorphic lens flare [0.0, 2.0]
    exposure: 1.08,           // ACES Filmic exposure [0.4, 2.5]
    chromaticAberration: 0.25,// Edge spectral dispersion [0.0, 1.0]
    spacetimeGrid: false,     // Overlay curved-spacetime equatorial metric grid

    // 4. Camera & Performance Settings
    camDistance: 15.6,        // Camera distance in R_s [3.4, 42.0]
    camElevation: 5.2,        // Camera pitch angle above equatorial plane in degrees [-85, 85]
    camAzimuth: -18.0,        // Camera orbit azimuth in degrees
    camRoll: -8.5,            // Cinematic Dutch tilt / roll angle in degrees [-90, 90]
    camFov: 38.0,             // Vertical Field of View in degrees [22, 85]
    autoRotate: true,         // Gentle orbital drift
    autoRotateSpeed: 0.14,    // Orbital drift speed
    qualityPreset: 'high',    // 'ultra' | 'high' | 'balanced' | 'performance'
    raySteps: 136,            // Geodesic integrator step budget [64, 240]
    renderScale: 1.0          // Internal framebuffer resolution multiplier [0.5, 1.5]
  };

  // Curated Astrophysical & Cinematic Presets
  const PRESETS = {
    gargantua: {
      name: '卡冈图雅 (Gargantua)',
      subtitle: '《星际穿越》电影经典外观 · 1亿倍太阳质量高速自旋黑洞',
      params: {
        massSolar: 100.0,
        horizonRadius: 1.0,
        spin: 0.96,
        lensingStrength: 1.0,
        photonRingIntensity: 1.35,
        shadowAsymmetry: 0.85,
        diskEnabled: true,
        diskInnerScale: 1.0,
        diskOuterRadius: 9.5,
        diskThickness: 0.11,
        diskDensity: 1.45,
        diskRotationSpeed: 0.85,
        dopplerBeaming: 0.62,
        diskTemperature: 5400,
        colorMode: 0,
        diskTurbulence: 1.15,
        jetIntensity: 0.0,
        starDensity: 1.15,
        nebulaIntensity: 0.85,
        einsteinRingBoost: 1.25,
        bloomStrength: 0.88,
        anamorphicFlare: 0.65,
        exposure: 1.08,
        chromaticAberration: 0.25,
        spacetimeGrid: false,
        camDistance: 15.6,
        camElevation: 5.2,
        camAzimuth: -18.0,
        camRoll: -8.5,
        camFov: 38.0
      }
    },
    millerOrbit: {
      name: '米勒行星近轨 (Miller Orbit)',
      subtitle: '逼近光子球与内稳定轨道 · 强烈多普勒集束与时间膨胀',
      params: {
        massSolar: 100.0,
        horizonRadius: 1.08,
        spin: 0.998,
        lensingStrength: 1.12,
        photonRingIntensity: 1.65,
        shadowAsymmetry: 1.1,
        diskEnabled: true,
        diskInnerScale: 0.88,
        diskOuterRadius: 13.5,
        diskThickness: 0.12,
        diskDensity: 1.65,
        diskRotationSpeed: 1.25,
        dopplerBeaming: 1.05,
        diskTemperature: 6600,
        colorMode: 0,
        diskTurbulence: 1.35,
        jetIntensity: 0.0,
        starDensity: 1.2,
        nebulaIntensity: 0.95,
        einsteinRingBoost: 1.45,
        bloomStrength: 1.1,
        anamorphicFlare: 0.85,
        exposure: 1.15,
        chromaticAberration: 0.35,
        spacetimeGrid: false,
        camDistance: 7.4,
        camElevation: 4.2,
        camAzimuth: 12.0,
        camRoll: -14.0,
        camFov: 52.0
      }
    },
    quasarJet: {
      name: '高能类星体 (Relativistic Quasar)',
      subtitle: '超爱丁顿吸积率 · 蓝白高温等离子体与南北极相对论喷流',
      params: {
        massSolar: 650.0,
        horizonRadius: 0.95,
        spin: 0.99,
        lensingStrength: 1.05,
        photonRingIntensity: 1.75,
        shadowAsymmetry: 0.95,
        diskEnabled: true,
        diskInnerScale: 0.92,
        diskOuterRadius: 14.0,
        diskThickness: 0.22,
        diskDensity: 1.8,
        diskRotationSpeed: 1.4,
        dopplerBeaming: 0.95,
        diskTemperature: 14500,
        colorMode: 2,
        diskTurbulence: 1.4,
        jetIntensity: 1.35,
        starDensity: 1.3,
        nebulaIntensity: 1.1,
        einsteinRingBoost: 1.35,
        bloomStrength: 1.25,
        anamorphicFlare: 0.95,
        exposure: 1.18,
        chromaticAberration: 0.4,
        spacetimeGrid: false,
        camDistance: 15.5,
        camElevation: 16.5,
        camAzimuth: -32.0,
        camRoll: 11.0,
        camFov: 46.0
      }
    },
    ehtM87: {
      name: 'M87* 事件视界望远镜 (EHT Shadow)',
      subtitle: '低倾角厚环状磁流体吸积流 · 显著相对论不对称亮环',
      params: {
        massSolar: 6500.0,
        horizonRadius: 1.05,
        spin: 0.90,
        lensingStrength: 1.0,
        photonRingIntensity: 1.85,
        shadowAsymmetry: 1.0,
        diskEnabled: true,
        diskInnerScale: 1.05,
        diskOuterRadius: 7.5,
        diskThickness: 0.36,
        diskDensity: 1.25,
        diskRotationSpeed: 0.95,
        dopplerBeaming: 1.2,
        diskTemperature: 3200,
        colorMode: 3,
        diskTurbulence: 0.9,
        jetIntensity: 0.35,
        starDensity: 0.85,
        nebulaIntensity: 0.45,
        einsteinRingBoost: 1.1,
        bloomStrength: 1.15,
        anamorphicFlare: 0.2,
        exposure: 1.08,
        chromaticAberration: 0.15,
        spacetimeGrid: false,
        camDistance: 11.5,
        camElevation: 38.0,
        camAzimuth: 25.0,
        camRoll: -22.0,
        camFov: 40.0
      }
    },
    einsteinLens: {
      name: '纯引力透镜与爱因斯坦环 (Einstein Ring)',
      subtitle: '无吸积盘遮挡 · 直观观测背景星系畸变、爱因斯坦环与时空度规网格',
      params: {
        massSolar: 50.0,
        horizonRadius: 1.05,
        spin: 0.5,
        lensingStrength: 1.15,
        photonRingIntensity: 1.6,
        shadowAsymmetry: 0.5,
        diskEnabled: false,
        diskInnerScale: 1.0,
        diskOuterRadius: 10.0,
        diskThickness: 0.12,
        diskDensity: 1.0,
        diskRotationSpeed: 0.6,
        dopplerBeaming: 0.5,
        diskTemperature: 5000,
        colorMode: 1,
        diskTurbulence: 1.0,
        jetIntensity: 0.0,
        starDensity: 1.85,
        nebulaIntensity: 1.55,
        einsteinRingBoost: 2.1,
        bloomStrength: 0.85,
        anamorphicFlare: 0.35,
        exposure: 1.25,
        chromaticAberration: 0.3,
        spacetimeGrid: true,
        camDistance: 11.0,
        camElevation: 14.0,
        camAzimuth: 0.0,
        camRoll: 0.0,
        camFov: 45.0
      }
    }
  };

  /**
   * Computes exact General Relativistic quantities for telemetry display & shader uniforms.
   * Uses Bardeen, Press & Teukolsky (1972) formula for Kerr ISCO radius.
   */
  function computeAstrophysics(params) {
    const a = Math.max(0.0, Math.min(0.999, params.spin));
    // Bardeen-Press-Teukolsky (1972) prograde ISCO in units of gravitational radius r_g = GM/c^2 = 0.5 R_s
    const oneMinusA2 = Math.max(1e-6, 1.0 - a * a);
    const cbrt1 = Math.cbrt(1.0 + a);
    const cbrt2 = Math.cbrt(1.0 - a);
    const Z1 = 1.0 + Math.cbrt(oneMinusA2) * (cbrt1 + cbrt2);
    const Z2 = Math.sqrt(3.0 * a * a + Z1 * Z1);
    // r_ISCO / r_g = 3 + Z2 - sqrt((3 - Z1)*(3 + Z1 + 2*Z2))
    const term = Math.max(0.0, (3.0 - Z1) * (3.0 + Z1 + 2.0 * Z2));
    const rIscoRg = 3.0 + Z2 - Math.sqrt(term); // in r_g (from 6.0 at a=0 down to 1.0 at a=1)
    const rIscoRs = 0.5 * rIscoRg;              // in Schwarzschild radii R_s (from 3.0 down to 0.5)

    // Prograde photon sphere radius in R_s
    const rPhRs = 1.5 * (1.0 - 0.32 * a);

    // Event horizon shadow radius in visual R_s units
    const rHorizonRs = 1.0 - 0.18 * a * a;

    // Visual inner ISCO radius in R_s: from 2.65 R_s (a*=0) down to 1.48 R_s (a*->1)
    // Ensures the pitch-black Event Horizon shadow & Photon Ring are cleanly framed inside the disk!
    const visualIscoRs = (1.42 + 0.42 * rIscoRs) * params.diskInnerScale;
    const effectiveInnerRs = Math.max(rHorizonRs * 1.42, visualIscoRs);

    // Physical Schwarzschild radius in kilometers: R_s = 2.95325 * M / M_sun (km)
    // Since massSolar is in 10^6 M_sun:
    const rsMillionKm = (params.massSolar * 2.95325); // in 10^6 km
    const rsAU = rsMillionKm / 149.59787;             // in Astronomical Units (AU)

    // Orbital velocity beta = v/c at the inner edge of the disk
    const rInRg = Math.max(1.05, rIscoRs * 2.0 * params.diskInnerScale);
    const betaInner = Math.min(0.92, 1.0 / Math.max(1.08, Math.sqrt(Math.max(0.08, rInRg - 0.85)) + 0.45 * (1.0 - a)));

    // Gravitational time dilation factor d_t / d_tau at camera distance & at inner disk edge
    const camR = Math.max(1.05, params.camDistance / Math.max(0.2, params.horizonRadius));
    const timeDilationCam = Math.sqrt(Math.max(0.01, 1.0 - rHorizonRs / camR));
    const timeDilationInner = 1.0 / Math.sqrt(Math.max(0.02, 1.0 - (0.68 / Math.max(0.72, rIscoRs * params.diskInnerScale))));

    return {
      rIscoRs,
      rPhRs,
      rHorizonRs,
      effectiveInnerRs,
      rsMillionKm,
      rsAU,
      betaInner,
      timeDilationCam,
      timeDilationInner
    };
  }

  global.GargantuaConfig = {
    DEFAULT_PARAMS,
    PRESETS,
    computeAstrophysics
  };
})(window);
