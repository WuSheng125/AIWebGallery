/**
 * Procedural deep-space star cubemap.
 *
 * Generating the sky once into a mip-mapped cubemap gives us crisp, stable
 * stars under heavy gravitational lensing at a fraction of the cost of
 * evaluating a multi-layer star hash for every escaped ray, every frame.
 */

const STAR_COLORS = [
  [0.58, 0.69, 1.0],
  [0.76, 0.84, 1.0],
  [0.92, 0.94, 1.0],
  [1.0, 0.97, 0.88],
  [1.0, 0.88, 0.66],
  [1.0, 0.73, 0.48],
  [1.0, 0.58, 0.40],
];

const COLOR_WEIGHTS = [0.06, 0.13, 0.27, 0.27, 0.17, 0.07, 0.03];

function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickStarColor(random) {
  let value = random();
  let index = 0;
  for (let i = 0; i < COLOR_WEIGHTS.length; i++) {
    value -= COLOR_WEIGHTS[i];
    index = i;
    if (value <= 0) break;
  }
  return STAR_COLORS[index];
}

/**
 * @param {WebGL2RenderingContext} gl
 * @param {{size?: number, starsPerFace?: number, seed?: number, onProgress?: Function}} options
 * @returns {{texture: WebGLTexture, starCount: number}}
 */
export function createStarCubemap(gl, options = {}) {
  const size = options.size ?? 1024;
  const starsPerFace = options.starsPerFace ?? 6000;
  const seed = options.seed ?? 0x9e3779b9;
  const onProgress = options.onProgress;
  const random = mulberry32(seed);
  const faces = [];

  const total = size * size;

  for (let face = 0; face < 6; face++) {
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d', { alpha: false });
    const image = ctx.createImageData(size, size);
    const pixels = image.data;
    const rgb = new Float32Array(total * 3);

    for (let i = 0; i < starsPerFace; i++) {
      const cx = random() * size;
      const cy = random() * size;

      const brightnessRoll = random();
      // A steep power law: thousands of faint embers, a handful of beacons.
      const amplitude = 0.010 + Math.pow(brightnessRoll, 3.15) * 1.7;
      const sigma = 0.34 + random() * 0.34;
      const haloR = 0.75 + random() * 1.35;
      const color = pickStarColor(random);
      const haloWeight = 0.012 + Math.pow(brightnessRoll, 2.2) * 0.062;

      // Leave enough margin that the Gaussian actually reaches zero before the
      // stamp boundary — otherwise every star becomes a tiny square tile.
      const reach = Math.ceil(Math.max(sigma * 3.2, haloR * 2.8));
      const x0 = Math.max(0, Math.floor(cx - reach));
      const x1 = Math.min(size - 1, Math.ceil(cx + reach));
      const y0 = Math.max(0, Math.floor(cy - reach));
      const y1 = Math.min(size - 1, Math.ceil(cy + reach));
      const invCore = 1 / (2 * sigma * sigma);
      const invHalo = 1 / Math.max(haloR * 0.55, 0.001);

      for (let y = y0; y <= y1; y++) {
        const dy = y + 0.5 - cy;
        for (let x = x0; x <= x1; x++) {
          const dx = x + 0.5 - cx;
          const d2 = dx * dx + dy * dy;
          const core = Math.exp(-d2 * invCore);
          const halo = Math.exp(-Math.sqrt(d2) * invHalo) * haloWeight;
          const weight = core + halo;
          if (weight < 0.002) continue;
          const idx = (y * size + x) * 3;
          rgb[idx] += color[0] * amplitude * weight;
          rgb[idx + 1] += color[1] * amplitude * weight;
          rgb[idx + 2] += color[2] * amplitude * weight;
        }
      }
    }

    // A sparse dusting of sub-pixel stars keeps the sky from feeling like a
    // handful of decals when lensing magnifies a patch of sky.
    const dustCount = Math.floor(starsPerFace * 1.8);
    for (let i = 0; i < dustCount; i++) {
      const x = Math.floor(random() * size);
      const y = Math.floor(random() * size);
      const amplitude = 0.006 + Math.pow(random(), 3.8) * 0.055;
      const tint = pickStarColor(random);
      const idx = (y * size + x) * 3;
      rgb[idx] += tint[0] * amplitude;
      rgb[idx + 1] += tint[1] * amplitude;
      rgb[idx + 2] += tint[2] * amplitude;
    }

    for (let i = 0; i < total; i++) {
      const src = i * 3;
      const dst = i * 4;
      pixels[dst] = Math.min(255, Math.round(rgb[src] * 255));
      pixels[dst + 1] = Math.min(255, Math.round(rgb[src + 1] * 255));
      pixels[dst + 2] = Math.min(255, Math.round(rgb[src + 2] * 255));
      pixels[dst + 3] = 255;
    }

    ctx.putImageData(image, 0, 0);
    faces.push(canvas);
    onProgress?.((face + 1) / 6);
  }

  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, texture);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

  const facesTargets = [
    gl.TEXTURE_CUBE_MAP_POSITIVE_X,
    gl.TEXTURE_CUBE_MAP_NEGATIVE_X,
    gl.TEXTURE_CUBE_MAP_POSITIVE_Y,
    gl.TEXTURE_CUBE_MAP_NEGATIVE_Y,
    gl.TEXTURE_CUBE_MAP_POSITIVE_Z,
    gl.TEXTURE_CUBE_MAP_NEGATIVE_Z,
  ];

  for (let i = 0; i < 6; i++) {
    gl.texImage2D(
      facesTargets[i],
      0,
      gl.RGBA8,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      faces[i]
    );
  }

  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_CUBE_MAP, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.bindTexture(gl.TEXTURE_CUBE_MAP, null);

  return { texture, starCount: starsPerFace * 6 };
}
