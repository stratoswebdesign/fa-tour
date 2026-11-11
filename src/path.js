import * as THREE from 'three';

// Az ösvény: enyhe S-kanyar a -z irányba. A görgetés 0..1 értéke ezen visz végig.
export const PATH = { z0: 8, z1: -100, eye: 1.62 };

export const pathX = (z) => Math.sin(z * 0.085) * 0.9;

export function pathPoint(p, out = new THREE.Vector3()) {
  const z = PATH.z0 + (PATH.z1 - PATH.z0) * p;
  return out.set(pathX(z), PATH.eye, z);
}

// melyik görgetési értéknél áll a néző `ahead` méterrel a z pont előtt
export const progressAt = (z, ahead = 0) =>
  THREE.MathUtils.clamp((PATH.z0 - (z + ahead)) / (PATH.z0 - PATH.z1), 0, 1);

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const smooth = (x, a, b) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

export function canvasTexture(w, h, draw, { srgb = true, repeat = null } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d', { willReadFrequently: true }), w, h, c);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  t.anisotropy = 4;
  return t;
}
