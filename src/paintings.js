import * as THREE from 'three';
import { PATH, pathX, canvasTexture, smooth } from './path.js';

// A prototípus képei. A címek munkacímek; technika, méret és ár a művésztől érkezik majd.
// side: +1 jobb, -1 bal, 0 az ösvény végén szemben. h: a kép magassága méterben a térben.
export const PAINTINGS = [
  { src: 'assets/paintings/3.jpg', title: 'Fasor', artist: 'Moldvai Réka', z: -9, side: 1, h: 1.5 },
  { src: 'assets/paintings/4.jpg', title: 'Kék óriás', artist: 'Moldvai Réka', z: -26, side: -1, h: 1.55 },
  { src: 'assets/paintings/6.jpg', title: 'Gyökerek', artist: 'Moldvai Réka', z: -43, side: 1, h: 1.85 },
  { src: 'assets/paintings/1.jpg', title: 'Hosszú árnyékok', artist: 'Moldvai Réka', z: -60, side: -1, h: 1.3 },
  { src: 'assets/paintings/2.jpg', title: 'Áttörő fény', artist: 'Moldvai Réka', z: -76, side: 1, h: 0.9 },
  { src: 'assets/paintings/5.jpg', title: 'Fénykapu', artist: 'Moldvai Réka', z: PATH.z1 - 8, side: 0, h: 1.75 },
];

// Hol áll és merre néz egy kép. Az oldalsó képek a közeledő látogató felé fordulnak.
export function layoutOf(P) {
  const pos = new THREE.Vector3();
  let yaw = 0;
  if (P.side === 0) {
    pos.set(pathX(PATH.z1), 1.8, P.z);
  } else {
    pos.set(pathX(P.z) + P.side * 3.1, 1.75, P.z);
    const dx = pathX(P.z + 7.5) - pos.x;
    yaw = Math.atan2(dx, 7.5);
  }
  const normal = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  return { pos, yaw, normal, right };
}

// ---------- aranykeret ----------

// A keret keresztmetszete: [távolság a kép szélétől kifelé, kiemelkedés a néző felé].
function frameProfile(s) {
  const pts = [[-0.012, 0.0]];
  const marks = {};
  const len = () => {
    let L = 0;
    for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return L;
  };
  for (let i = 0; i <= 7; i++) { const a = Math.PI * (1 - i / 7); pts.push([0.012 + 0.014 * Math.cos(a), 0.012 + 0.014 * Math.sin(a)]); }
  marks.beadEnd = len();
  pts.push([0.031, 0.01]);
  marks.coveStart = len();
  for (let i = 0; i <= 9; i++) { const t = i / 9; pts.push([0.035 + 0.095 * t, 0.012 + 0.06 * t * t]); }
  marks.coveEnd = len();
  for (let i = 0; i <= 8; i++) { const a = Math.PI * 0.92 - (Math.PI * 1.12 * i) / 8; pts.push([0.152 + 0.022 * Math.cos(a), 0.072 + 0.022 * Math.sin(a)]); }
  marks.ridgeEnd = len();
  pts.push([0.182, 0.044], [0.19, 0.044], [0.196, 0.0], [0.196, -0.05]);
  const total = len();
  for (const k in marks) marks[k] /= total;
  return { pts: pts.map(([d, z]) => [d * s, z * s]), marks, total: total * s, width: 0.196 * s };
}

export function makeFrameGeometry(w, h, s = 1) {
  const { pts, total } = frameProfile(s);
  const n = pts.length;
  const vAt = [0];
  for (let i = 1; i < n; i++) vAt.push(vAt[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const pos = [], uv = [], idx = [];
  const tile = 0.5 * s; // a díszítés ismétlődése méterben
  for (let side = 0; side < 4; side++) {
    const a = corners[side], b = corners[(side + 1) % 4];
    const base = pos.length / 3;
    const sideLen = side % 2 === 0 ? w : h;
    for (let i = 0; i < n; i++) {
      const [d, z] = pts[i];
      pos.push(a[0] * (w / 2 + d), a[1] * (h / 2 + d), z, b[0] * (w / 2 + d), b[1] * (h / 2 + d), z);
      const u = (sideLen / 2 + d) / tile, v = vAt[i] / total;
      uv.push(-u, v, u, v);
    }
    for (let i = 0; i < n - 1; i++) {
      const a0 = base + i * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
      idx.push(a0, a1, b0, b0, a1, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Faragott díszítés: domborzat (bump) és ebből patinás arany szín.
function goldTextures() {
  const { marks } = frameProfile(1);
  const W = 512, H = 256;
  let bumpCanvas;
  const bump = canvasTexture(W, H, (g, w, h, c) => {
    bumpCanvas = c;
    const Y = (v) => (1 - v) * h;
    g.fillStyle = '#6e6e6e'; g.fillRect(0, 0, w, h);
    // gyöngysor a belső peremen
    const n = 22, by = Y(marks.beadEnd * 0.5), br = Math.min(w / n * 0.44, marks.beadEnd * h * 0.42);
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * w / n;
      const gr = g.createRadialGradient(x, by, 0, x, by, br);
      gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#6e6e6e');
      g.fillStyle = gr; g.beginPath(); g.arc(x, by, br, 0, 6.29); g.fill();
    }
    // indás levéldísz a homorú sávban
    const c0 = marks.coveStart, c1 = marks.coveEnd, yc = Y((c0 + c1) / 2), amp = (c1 - c0) * h * 0.36;
    const m = 4, cw = w / m;
    g.lineCap = 'round';
    for (let i = 0; i < m; i++) {
      const x0 = i * cw;
      g.strokeStyle = '#ececec'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(x0, yc);
      g.bezierCurveTo(x0 + cw * 0.2, yc - amp * 1.5, x0 + cw * 0.5, yc - amp * 1.1, x0 + cw * 0.5, yc);
      g.bezierCurveTo(x0 + cw * 0.5, yc + amp * 1.1, x0 + cw * 0.8, yc + amp * 1.5, x0 + cw, yc);
      g.stroke();
      g.fillStyle = '#d8d8d8';
      for (const [lx, ly, rot] of [[0.2, -0.25, -0.6], [0.36, 0.35, 0.5], [0.7, 0.25, -0.6], [0.86, -0.35, 0.5]]) {
        g.beginPath(); g.ellipse(x0 + cw * lx, yc + amp * ly * 2, cw * 0.1, amp * 0.36, rot, 0, 6.29); g.fill();
      }
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(x0 + cw * 0.5, yc, amp * 0.3, 0, 6.29); g.fill();
      g.beginPath(); g.arc(x0, yc, amp * 0.3, 0, 6.29); g.arc(x0 + cw, yc, amp * 0.3, 0, 6.29); g.fill();
    }
    // sodrott zsinór a külső gerincen
    g.strokeStyle = '#f2f2f2'; g.lineWidth = 6;
    const r0 = Y(marks.coveEnd + 0.02), r1 = Y(marks.ridgeEnd - 0.02);
    for (let x = -24; x < w + 24; x += 16) { g.beginPath(); g.moveTo(x, r0); g.lineTo(x + 12, r1); g.stroke(); }
    // árkok a sávok között
    g.fillStyle = '#262626';
    for (const v of [marks.beadEnd + 0.012, marks.coveEnd, marks.ridgeEnd]) g.fillRect(0, Y(v) - 2, w, 4);
    // lágyítás
    const t = document.createElement('canvas'); t.width = w / 2; t.height = h / 2;
    t.getContext('2d').drawImage(c, 0, 0, w / 2, h / 2);
    g.imageSmoothingQuality = 'high';
    g.drawImage(t, 0, 0, w, h);
  }, { srgb: false, repeat: [1, 1] });

  const src = bumpCanvas.getContext('2d').getImageData(0, 0, W, H).data;
  const color = canvasTexture(W, H, (g, w, h) => {
    const img = g.createImageData(w, h), d = img.data;
    const lo = [58, 36, 10], mid = [176, 128, 44], hi = [246, 214, 128];
    for (let i = 0; i < w * h; i++) {
      let v = src[i * 4] / 255;
      v = Math.min(1, Math.max(0, (v - 0.12) / 0.8)) + (Math.random() - 0.5) * 0.08;
      const a = v < 0.5 ? lo : mid, b = v < 0.5 ? mid : hi, t = Math.min(1, Math.max(0, v < 0.5 ? v * 2 : (v - 0.5) * 2));
      d[i * 4] = a[0] + (b[0] - a[0]) * t;
      d[i * 4 + 1] = a[1] + (b[1] - a[1]) * t;
      d[i * 4 + 2] = a[2] + (b[2] - a[2]) * t;
      d[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }, { repeat: [1, 1] });

  return { bump, color };
}

let shared = null;
function sharedAssets() {
  if (shared) return shared;
  const { bump, color } = goldTextures();
  const gold = new THREE.MeshStandardMaterial({
    map: color, bumpMap: bump, bumpScale: 3, metalness: 1, roughness: 0.34,
    emissive: '#5a3c10', emissiveMap: color, emissiveIntensity: 0.55,
    envMapIntensity: 1.5, side: THREE.DoubleSide,
  });
  const goldPlain = new THREE.MeshStandardMaterial({ color: '#d9ab4c', metalness: 1, roughness: 0.3, emissive: '#3a2608', envMapIntensity: 1.5 });
  const back = new THREE.MeshStandardMaterial({ color: '#0a0d18', roughness: 1, envMapIntensity: 0.1 });
  const thread = new THREE.MeshBasicMaterial({ color: '#a8823a' });
  const halo = canvasTexture(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(0.5, 'rgba(255,255,255,.25)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const boss = new THREE.SphereGeometry(1, 20, 12);
  shared = { gold, goldPlain, back, thread, halo, boss };
  return shared;
}

// ---------- a festmény anyaga ----------

// A fotóból számolt térképek: domborzat (vastag festék), normál, és hol fémes az arany.
function deriveMaps(img) {
  const w = Math.min(img.width, 1024), h = Math.round((w * img.height) / img.width);
  let data;
  const map = canvasTexture(w, h, (g) => {
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, w, h);
    data = g.getImageData(0, 0, w, h).data;
  });
  map.anisotropy = 8;

  const lum = new Float32Array(w * h), gold = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4] / 255, g = data[i * 4 + 1] / 255, b = data[i * 4 + 2] / 255;
    const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lum[i] = L;
    const mx = Math.max(r, g, b) + 1e-4;
    gold[i] = smooth((r - b) / mx, 0.28, 0.6) * smooth(g / (r + 1e-4), 0.5, 0.68) * smooth(L, 0.3, 0.6);
  }
  // enyhe elmosás, hogy a JPEG-zaj ne váljon domborzattá
  const soft = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let s = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      s += lum[Math.min(h - 1, Math.max(0, y + j)) * w + Math.min(w - 1, Math.max(0, x + i))];
    }
    soft[y * w + x] = s / 9;
  }

  const normal = canvasTexture(w, h, (g) => {
    const im = g.createImageData(w, h), d = im.data, k = 5.5;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const xl = soft[y * w + Math.max(0, x - 1)], xr = soft[y * w + Math.min(w - 1, x + 1)];
      const yu = soft[Math.max(0, y - 1) * w + x], yd = soft[Math.min(h - 1, y + 1) * w + x];
      let nx = (xl - xr) * k, ny = (yd - yu) * k, nz = 1;
      const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }, { srgb: false });

  const orm = canvasTexture(w, h, (g) => {
    const im = g.createImageData(w, h), d = im.data;
    for (let i = 0; i < w * h; i++) {
      d[i * 4] = 255;
      d[i * 4 + 1] = (0.66 - gold[i] * 0.36 - lum[i] * 0.08) * 255; // érdesség
      d[i * 4 + 2] = gold[i] * 0.62 * 255;                           // fémesség
      d[i * 4 + 3] = 255;
    }
    g.putImageData(im, 0, 0);
  }, { srgb: false });

  // domborzat: erősen elmosott fényesség, a szélek felé kisimítva
  const dw = 256, dh = Math.max(8, Math.round((dw * h) / w));
  const height = canvasTexture(dw, dh, (g) => {
    const t = document.createElement('canvas'); t.width = 56; t.height = Math.max(4, Math.round((56 * h) / w));
    const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(img, 0, 0, t.width, t.height);
    g.imageSmoothingQuality = 'high';
    g.drawImage(t, 0, 0, dw, dh);
    const im = g.getImageData(0, 0, dw, dh), d = im.data;
    for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
      const i = (y * dw + x) * 4;
      const L = (0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]) / 255;
      const edge = smooth(Math.min(x, dw - 1 - x) / dw, 0, 0.08) * smooth(Math.min(y, dh - 1 - y) / dh, 0, 0.08);
      const v = (0.5 + (L - 0.5) * edge) * 255;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    g.putImageData(im, 0, 0);
  }, { srgb: false });

  return { map, normal, orm, height };
}

function drawNameplate(g, w, h, title) {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#e9c877'); gr.addColorStop(0.5, '#b98b34'); gr.addColorStop(1, '#8a6422');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(40,24,4,.55)'; g.lineWidth = 2; g.strokeRect(7, 7, w - 14, h - 14);
  g.fillStyle = 'rgba(30,18,4,.88)';
  g.font = '500 36px "Fraunces", Georgia, serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const text = title.toLocaleUpperCase('hu').split('').join('  ');
  g.fillText(text, w / 2, h / 2 + 3, w - 40);
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Nem tölthető be: ${src}`));
    img.src = src;
  });
}

// Egy bekeretezett, felfüggesztett festmény. Visszaadja a csoportot és a vezérléshez kellő adatokat.
export function buildPainting(P, img) {
  const S = sharedAssets();
  const L = layoutOf(P);
  const h = P.h, w = Math.min(h * (img.width / img.height), 2.5);
  const fs = THREE.MathUtils.clamp(h / 1.5, 0.72, 1.12); // a keret vastagsága a képmérethez igazodik
  const prof = frameProfile(fs);
  const maps = deriveMaps(img);

  const group = new THREE.Group();
  group.position.copy(L.pos);
  group.rotation.y = L.yaw;

  const mat = new THREE.MeshStandardMaterial({
    map: maps.map, normalMap: maps.normal, normalScale: new THREE.Vector2(1.1, 1.1),
    roughnessMap: maps.orm, metalnessMap: maps.orm, roughness: 1, metalness: 1,
    displacementMap: maps.height, displacementScale: 0.016, displacementBias: -0.008,
    emissive: '#ffffff', emissiveMap: maps.map, emissiveIntensity: 0.34,
    envMapIntensity: 0.9,
  });
  const seg = 128;
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(w, h, seg, Math.max(8, Math.round((seg * h) / w))), mat);
  canvas.userData.painting = P;
  group.add(canvas);

  const frame = new THREE.Mesh(makeFrameGeometry(w, h, fs), S.gold);
  group.add(frame);

  // sarokdíszek és középdíszek
  const fw = prof.width;
  const addBoss = (x, y, sx, sy, sz, rot = 0) => {
    const m = new THREE.Mesh(S.boss, S.goldPlain);
    m.position.set(x, y, 0.062 * fs);
    m.scale.set(sx * fs, sy * fs, sz * fs);
    m.rotation.z = rot;
    group.add(m);
  };
  for (const [cx, cy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = cx * (w / 2 + fw * 0.52), y = cy * (h / 2 + fw * 0.52);
    addBoss(x, y, 0.062, 0.062, 0.04);
    addBoss(x - cx * 0.1 * fs, y, 0.07, 0.026, 0.024);
    addBoss(x, y - cy * 0.1 * fs, 0.026, 0.07, 0.024);
  }
  addBoss(0, h / 2 + fw * 0.6, 0.11, 0.04, 0.034);
  addBoss(-(w / 2 + fw * 0.6), 0, 0.04, 0.1, 0.03);
  addBoss(w / 2 + fw * 0.6, 0, 0.04, 0.1, 0.03);

  // réztábla a címmel
  let plateCanvas;
  const plateTex = canvasTexture(512, 96, (g, cw, ch, c) => { plateCanvas = c; drawNameplate(g, cw, ch, P.title); });
  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(0.36 * fs, 0.0675 * fs),
    new THREE.MeshStandardMaterial({ map: plateTex, metalness: 0.9, roughness: 0.42, emissive: '#3a2a0c', emissiveIntensity: 0.6, envMapIntensity: 1.2 })
  );
  plate.position.set(0, -(h / 2 + fw * 0.46), 0.07 * fs);
  group.add(plate);

  const back = new THREE.Mesh(new THREE.BoxGeometry(w + fw * 2, h + fw * 2, 0.03), S.back);
  back.position.z = -0.066 * fs;
  group.add(back);

  // aranyszálak a lombok közé
  const threadGeo = new THREE.CylinderGeometry(0.004, 0.004, 16, 5);
  for (const sx of [-1, 1]) {
    const t = new THREE.Mesh(threadGeo, S.thread);
    t.position.set(sx * (w / 2 - 0.05), h / 2 + fw + 8, -0.03);
    group.add(t);
  }

  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: S.halo, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: '#ffc470', opacity: 0.2 }));
  halo.position.set(0, 0, -0.5);
  halo.scale.set(w * 2.7, h * 2.7, 1);
  group.add(halo);

  const up = new THREE.Vector3(0, 1, 0);
  return {
    ...P, ...L, group, canvas, mat, halo, w, h, fs,
    outerW: w + fw * 2, outerH: h + fw * 2, up,
    // a „Megnyitás" felirat helye: a keret alatt, középen
    anchor: L.pos.clone().addScaledVector(up, -(h / 2 + fw + 0.2)),
    // a réztábla újrarajzolása, amikor a betűtípus megérkezett
    refreshPlate() { drawNameplate(plateCanvas.getContext('2d'), 512, 96, P.title); plateTex.needsUpdate = true; },
    phase: Math.random() * 6.28,
  };
}
