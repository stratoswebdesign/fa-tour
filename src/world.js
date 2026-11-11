import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PATH, pathX, mulberry32, smooth, canvasTexture } from './path.js';

const NIGHT = new THREE.Color('#050c20');
const BLUE = new THREE.Color('#0c2152');
const DAWN = new THREE.Color('#b9904f');
const WHITE = new THREE.Color('#ffffff');
const WARM = new THREE.Color('#ffd58a');

// Visszaverődés az aranyhoz: sötétkék tér néhány meleg és hideg fényfolttal.
function buildEnvironment(renderer) {
  const s = new THREE.Scene();
  const geo = new THREE.SphereGeometry(50, 32, 16);
  const pos = geo.attributes.position, cols = [];
  const lo = new THREE.Color('#060b1e'), hi = new THREE.Color('#1c3a7a'), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    c.copy(lo).lerp(hi, smooth(pos.getY(i) / 50, -0.2, 0.9));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  s.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
  const panel = (x, y, z, w, h, r, g, b) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    m.material.color.setRGB(r, g, b);
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    s.add(m);
  };
  panel(18, 14, 10, 16, 10, 9, 6, 2.4);
  panel(-20, 6, 4, 10, 14, 1.2, 2.2, 5);
  panel(0, 24, -6, 10, 10, 6, 5.4, 4.4);
  panel(4, 3, 22, 30, 5, 5, 3.4, 1.4);
  panel(-6, 4, -22, 26, 5, 4, 2.8, 1.2);
  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(s, 0.03).texture;
  pm.dispose();
  return tex;
}

const distToSegment = (px, pz, s) => {
  const dx = s.bx - s.ax, dz = s.bz - s.az;
  const t = THREE.MathUtils.clamp(((px - s.ax) * dx + (pz - s.az) * dz) / (dx * dx + dz * dz), 0, 1);
  return Math.hypot(px - (s.ax + dx * t), pz - (s.az + dz * t));
};

// Ívelt, elvékonyodó ág: cső egy görbe mentén, a sugár a vége felé csökken.
function taperedTube(points, r0, r1, seg = 12, rad = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const g = new THREE.TubeGeometry(curve, seg, 1, rad, false);
  const pos = g.attributes.position, c = new THREE.Vector3(), v = new THREE.Vector3();
  for (let i = 0; i <= seg; i++) {
    curve.getPointAt(i / seg, c);
    const r = r0 + (r1 - r0) * (i / seg);
    for (let j = 0; j <= rad; j++) {
      const k = i * (rad + 1) + j;
      v.fromBufferAttribute(pos, k).sub(c).multiplyScalar(r).add(c);
      pos.setXYZ(k, v.x, v.y, v.z);
    }
  }
  g.computeVertexNormals();
  return g;
}

export function createWorld(renderer, layout) {
  const rnd = mulberry32(11);
  const scene = new THREE.Scene();
  scene.background = NIGHT.clone();
  scene.fog = new THREE.FogExp2(NIGHT.clone(), 0.042);
  scene.environment = buildEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.1, 600);

  // ---------- fények ----------
  const hemi = new THREE.HemisphereLight('#6f9bff', '#0a1020', 0.6);
  const moon = new THREE.DirectionalLight('#86a9ff', 0.7);
  moon.position.set(-6, 14, 6);
  const sun = new THREE.DirectionalLight('#ffcc85', 0);
  sun.position.set(0, 5, PATH.z1 - 60);
  sun.target.position.set(0, 1, PATH.z1);
  const lantern = new THREE.PointLight('#ffd7a0', 26, 11, 1.7);
  scene.add(hemi, moon, sun, sun.target, lantern);

  // ---------- festett textúrák ----------
  const bark = canvasTexture(128, 512, (g, w, h) => {
    g.fillStyle = '#0a1330'; g.fillRect(0, 0, w, h);
    const cols = ['#101d45', '#17306b', '#0c1736', '#22468f', '#0a1026'];
    for (let i = 0; i < 460; i++) {
      g.strokeStyle = cols[i % cols.length];
      g.globalAlpha = 0.35 + rnd() * 0.5; g.lineWidth = 1 + rnd() * 5;
      const x = rnd() * w, y = rnd() * h - 60, l = 40 + rnd() * 170;
      g.beginPath(); g.moveTo(x, y);
      g.bezierCurveTo(x + rnd() * 8 - 4, y + l * 0.3, x + rnd() * 8 - 4, y + l * 0.6, x + rnd() * 6 - 3, y + l);
      g.stroke();
    }
    for (let i = 0; i < 60; i++) {
      g.strokeStyle = i % 4 ? '#6a9ad6' : '#d0a04a';
      g.globalAlpha = 0.2 + rnd() * 0.35; g.lineWidth = 1 + rnd() * 2;
      const x = rnd() * w, y = rnd() * h, l = 10 + rnd() * 50;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + rnd() * 4 - 2, y + l); g.stroke();
    }
  }, { repeat: [1, 3] });

  const dab = canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    for (let i = 0; i < 30; i++) {
      const a = rnd() * 6.28, r = Math.pow(rnd(), 0.7) * 38;
      g.fillStyle = `rgba(255,255,255,${0.3 + rnd() * 0.55})`;
      g.beginPath();
      g.ellipse(w / 2 + Math.cos(a) * r, h / 2 + Math.sin(a) * r, 7 + rnd() * 15, 4 + rnd() * 9, rnd() * 3.14, 0, 6.29);
      g.fill();
    }
  });

  const puff = canvasTexture(128, 128, (g, w, h) => {
    const gr = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.4, 'rgba(255,255,255,.45)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });

  const groundTex = canvasTexture(512, 512, (g, w, h) => {
    g.fillStyle = '#060e22'; g.fillRect(0, 0, w, h);
    const cols = ['#0b1a3d', '#0e2752', '#0a2233', '#123a5e', '#081430', '#16406e'];
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = cols[i % cols.length]; g.globalAlpha = 0.25 + rnd() * 0.5;
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 3 + rnd() * 12, 2 + rnd() * 5, rnd() * 3.14, 0, 6.29); g.fill();
    }
    for (let i = 0; i < 260; i++) {
      g.fillStyle = i % 3 ? '#3f7fb5' : '#c9a04a'; g.globalAlpha = 0.25 + rnd() * 0.4;
      g.beginPath(); g.ellipse(rnd() * w, rnd() * h, 1 + rnd() * 4, 1 + rnd() * 2, rnd() * 3.14, 0, 6.29); g.fill();
    }
  }, { repeat: [70, 70] });

  // ---------- talaj és ösvény ----------
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(420, 420),
    new THREE.MeshStandardMaterial({ map: groundTex, roughness: 1, metalness: 0, envMapIntensity: 0.15 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.z = -50;
  scene.add(ground);

  const pathTex = canvasTexture(64, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    const across = g.createLinearGradient(0, 0, w, 0);
    across.addColorStop(0, 'rgba(255,255,255,0)');
    across.addColorStop(0.3, 'rgba(255,255,255,.75)');
    across.addColorStop(0.7, 'rgba(255,255,255,.75)');
    across.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = across; g.fillRect(0, 0, w, h);
    // keresztbe vetülő fa-árnyékok, mint a fasoros képen
    g.globalCompositeOperation = 'destination-out';
    for (let y = 0; y < h; y += 26 + rnd() * 34) {
      g.fillStyle = `rgba(0,0,0,${0.45 + rnd() * 0.4})`;
      g.beginPath();
      const t = 5 + rnd() * 12, sk = rnd() * 14 - 7;
      g.moveTo(0, y); g.lineTo(w, y + sk); g.lineTo(w, y + sk + t); g.lineTo(0, y + t); g.fill();
    }
  }, { repeat: [1, 1] });
  pathTex.wrapT = THREE.RepeatWrapping;

  const pathGeo = new THREE.BufferGeometry();
  {
    const p = [], uv = [], idx = [];
    let n = 0;
    for (let z = 14; z >= -116; z -= 1, n++) {
      const x = pathX(z);
      p.push(x - 1.5, 0.02, z, x + 1.5, 0.02, z);
      uv.push(0, z / 18, 1, z / 18);
      if (n > 0) { const a = (n - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    pathGeo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    pathGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    pathGeo.setIndex(idx);
  }
  const pathMat = new THREE.MeshBasicMaterial({ map: pathTex, transparent: true, depthWrite: false, opacity: 0.3, color: '#7ea6e0', side: THREE.DoubleSide });
  scene.add(new THREE.Mesh(pathGeo, pathMat));

  // ---------- fák ----------
  const sight = layout.map((L) => ({ ax: L.pos.x, az: L.pos.z, bx: L.pos.x + L.normal.x * 11, bz: L.pos.z + L.normal.z * 11 }));
  const free = (x, z, r) => Math.abs(x - pathX(z)) > r && sight.every((s) => distToSegment(x, z, s) > 2.4);

  const trees = [];
  for (let z = 12; z > -128; z -= 4.2) {
    for (const side of [-1, 1]) {
      const zz = z + rnd() * 2.4 - 1.2;
      const x = pathX(zz) + side * (4.5 + rnd() * 1.5);
      if (free(x, zz, 3.6)) trees.push({ x, z: zz, s: 1.1 + rnd() * 0.6, lean: side * (0.05 + rnd() * 0.07), side, alley: true });
    }
  }
  for (let i = 0; i < 560; i++) {
    const z = 18 - rnd() * 160;
    const side = rnd() < 0.5 ? -1 : 1;
    const x = pathX(z) + side * (6.8 + Math.pow(rnd(), 1.5) * 46);
    if (free(x, z, 6.5)) trees.push({ x, z, s: 0.55 + rnd() * 1.3, lean: (rnd() - 0.5) * 0.08, side, alley: false });
  }

  const dummy = new THREE.Object3D(), col = new THREE.Color();
  // törzs: lent kiszélesedő gyökértalp, fölfelé vékonyodik
  const trunkYs = [0, 0.15, 0.35, 0.6, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
  const trunkGeo = new THREE.LatheGeometry(
    trunkYs.map((y) => new THREE.Vector2(0.13 + 0.15 * (1 - y / 18) + 0.28 * Math.exp(-y * 2.2), y)), 10);
  const barkMat = new THREE.MeshStandardMaterial({ map: bark, roughness: 1, metalness: 0, envMapIntensity: 0.3, side: THREE.DoubleSide });
  const trunks = new THREE.InstancedMesh(trunkGeo, barkMat, trees.length);
  trees.forEach((t, i) => {
    dummy.position.set(t.x, -0.1, t.z);
    dummy.rotation.set(0, rnd() * 6.28, t.lean, 'ZYX');
    dummy.scale.set(t.s, 1 + rnd() * 0.2, t.s);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    trunks.setColorAt(i, col.setHSL(0.6 + rnd() * 0.05, 0.5, 0.55 + rnd() * 0.35));
  });
  scene.add(trunks);

  // ívelt ágak: az ösvény menti fák a látogató fölé hajolnak, a távolabbiak szabadon nőnek
  const branchGeos = [
    mergeGeometries([
      taperedTube([[0, 0, 0], [0.8, 1.3, 0.1], [2.0, 2.3, -0.15], [3.4, 2.9, 0.1], [4.8, 3.0, 0.3]], 0.075, 0.012),
      taperedTube([[2.0, 2.3, -0.15], [2.6, 3.2, -0.7], [3.1, 4.2, -1.1]], 0.036, 0.008, 6),
    ]),
    mergeGeometries([
      taperedTube([[0, 0, 0], [0.5, 1.6, -0.1], [1.4, 3.0, 0.2], [2.9, 3.9, 0.1], [4.2, 4.1, -0.3]], 0.07, 0.012),
      taperedTube([[1.4, 3.0, 0.2], [1.5, 4.1, 0.9], [2.1, 5.0, 1.3]], 0.034, 0.008, 6),
    ]),
  ];
  const branchList = [[], []];
  trees.forEach((t) => {
    const near = Math.abs(t.x - pathX(t.z));
    if (t.alley) {
      for (let k = 0; k < 2; k++) branchList[k].push({ x: t.x, y: 2.4 + rnd() * 3.4, z: t.z, yaw: (t.side > 0 ? Math.PI : 0) + (rnd() - 0.5) * 1.3, s: 0.8 + rnd() * 0.5 });
    } else if (near < 18) {
      branchList[rnd() < 0.5 ? 0 : 1].push({ x: t.x, y: 2.5 + rnd() * 5, z: t.z, yaw: rnd() * 6.28, s: 0.6 + rnd() * 0.6 });
    }
  });
  branchList.forEach((list, k) => {
    const mesh = new THREE.InstancedMesh(branchGeos[k], barkMat, list.length);
    list.forEach((b, i) => {
      dummy.position.set(b.x, b.y, b.z);
      dummy.rotation.set(0, b.yaw, 0, 'XYZ');
      dummy.scale.set(b.s, b.s * (0.85 + rnd() * 0.3), b.s);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, col.setHSL(0.61, 0.5, 0.6 + rnd() * 0.3));
    });
    scene.add(mesh);
  });

  // lombfoltok: ecsetnyomok a fák koronájában
  const dabs = [];
  const leafCols = ['#0f2a5c', '#18428a', '#1f63ad', '#2c86c4', '#0b1c44', '#12366f', '#0d2350', '#4f97cf'];
  trees.forEach((t) => {
    const near = Math.abs(t.x - pathX(t.z));
    if (near > 20) return;
    const n = t.alley ? 10 : 5;
    for (let k = 0; k < n; k++) {
      dabs.push({
        x: t.x - (t.alley ? t.side * rnd() * 5.2 : (rnd() - 0.5) * 5),
        y: 4.6 + rnd() * 6.5,
        z: t.z + (rnd() - 0.5) * 5,
        s: 1.6 + rnd() * 2.8,
        c: leafCols[Math.floor(Math.pow(rnd(), 1.3) * leafCols.length)],
      });
    }
  });
  const foliageMat = new THREE.MeshBasicMaterial({ map: dab, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  const foliage = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), foliageMat, dabs.length);
  dabs.forEach((d, i) => {
    dummy.position.set(d.x, d.y, d.z);
    dummy.rotation.set(-Math.PI / 2 + (rnd() - 0.5) * 2.2, rnd() * 6.28, (rnd() - 0.5) * 1.2, 'XYZ');
    dummy.scale.set(d.s, d.s, d.s);
    dummy.updateMatrix();
    foliage.setMatrixAt(i, dummy.matrix);
    foliage.setColorAt(i, col.set(d.c));
  });
  scene.add(foliage);

  // ---------- köd ----------
  const mist = [];
  const mistMat = [0.05, 0.08, 0.11].map((o) => new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, opacity: o, color: '#9cc4ea' }));
  for (let i = 0; i < 54; i++) {
    const z = 8 - rnd() * 128;
    const s = new THREE.Sprite(mistMat[i % 3]);
    const x = pathX(z) + (rnd() - 0.5) * 30;
    s.position.set(x, 0.4 + rnd() * 1.5, z);
    s.scale.set(11 + rnd() * 10, 2.6 + rnd() * 2.6, 1);
    s.userData = { x, ph: rnd() * 6.28, sp: 0.03 + rnd() * 0.05 };
    mist.push(s); scene.add(s);
  }

  // ---------- szentjánosbogarak / aranypor ----------
  const flyN = 1400;
  const flyPos = new Float32Array(flyN * 3), flySeed = new Float32Array(flyN);
  for (let i = 0; i < flyN; i++) {
    const z = 10 - rnd() * 126;
    flyPos[i * 3] = pathX(z) + (rnd() - 0.5) * 22;
    flyPos[i * 3 + 1] = 0.25 + Math.pow(rnd(), 1.6) * 5;
    flyPos[i * 3 + 2] = z;
    flySeed[i] = rnd();
  }
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(flyPos, 3));
  flyGeo.setAttribute('aSeed', new THREE.BufferAttribute(flySeed, 1));
  const flyMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uFade: { value: 1 }, uColor: { value: new THREE.Color('#ffcf7a') } },
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime, uPx; varying float vA;
      void main() {
        vec3 p = position;
        p.x += sin(uTime * .3 + aSeed * 17.) * .7;
        p.y += sin(uTime * .5 + aSeed * 31.) * .35;
        p.z += cos(uTime * .25 + aSeed * 11.) * .7;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        float tw = .5 + .5 * sin(uTime * (1. + aSeed * 2.) + aSeed * 40.);
        vA = tw * smoothstep(55., 6., -mv.z);
        gl_PointSize = min(uPx * (2. + aSeed * 4.) * (7. / max(-mv.z, .5)), 46.);
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; uniform float uFade; varying float vA;
      void main() {
        float d = length(gl_PointCoord - .5);
        float a = smoothstep(.5, 0., d);
        gl_FragColor = vec4(uColor * a * a * vA * 1.7 * uFade, 1.);
      }`,
  });
  const flies = new THREE.Points(flyGeo, flyMat);
  flies.frustumCulled = false;
  scene.add(flies);

  // ---------- hajnal az ösvény végén ----------
  const glowMat = new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, color: '#ffbf66', opacity: 0 });
  const glow = new THREE.Sprite(glowMat);
  glow.position.set(pathX(PATH.z1), 7, PATH.z1 - 95);
  glow.scale.set(190, 150, 1);
  const coreMat = new THREE.SpriteMaterial({ map: puff, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, color: '#fff1cf', opacity: 0 });
  const core = new THREE.Sprite(coreMat);
  core.position.set(pathX(PATH.z1), 5.5, PATH.z1 - 94);
  core.scale.set(52, 52, 1);
  scene.add(glow, core);

  // fénysugarak a hajnali nap körül: két, lassan ellentétesen forgó sugárkoszorú
  const rayTex = canvasTexture(512, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.translate(w / 2, h / 2);
    for (let i = 0; i < 44; i++) {
      const a = rnd() * 6.283, width = 0.012 + rnd() * 0.06;
      const gr = g.createRadialGradient(0, 0, 8, 0, 0, w / 2);
      gr.addColorStop(0, `rgba(255,255,255,${0.06 + rnd() * 0.24})`);
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, w / 2, a, a + width); g.closePath(); g.fill();
    }
  });
  const rays = [0, 1].map((i) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(1, 1),
      new THREE.MeshBasicMaterial({ map: rayTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, color: '#ffd49a', opacity: 0 })
    );
    m.position.set(pathX(PATH.z1), 6, PATH.z1 - 34 - i * 4);
    m.scale.set(150 + i * 30, 150 + i * 30, 1);
    scene.add(m);
    return m;
  });

  // hulló levelek
  const leafN = 380;
  const leafPos = new Float32Array(leafN * 3), leafSeed = new Float32Array(leafN);
  for (let i = 0; i < leafN; i++) {
    const z = 10 - rnd() * 124;
    leafPos[i * 3] = pathX(z) + (rnd() - 0.5) * 17;
    leafPos[i * 3 + 1] = rnd() * 7;
    leafPos[i * 3 + 2] = z;
    leafSeed[i] = rnd();
  }
  const leafGeo = new THREE.BufferGeometry();
  leafGeo.setAttribute('position', new THREE.BufferAttribute(leafPos, 3));
  leafGeo.setAttribute('aSeed', new THREE.BufferAttribute(leafSeed, 1));
  const leafMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPx: { value: 1 }, uFade: { value: 1 }, uMap: { value: dab }, uColor: { value: new THREE.Color('#4a8fd0') } },
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime, uPx; varying float vA, vRot;
      void main() {
        vec3 p = position;
        p.y = mod(position.y - uTime * (.16 + aSeed * .3), 7.);
        p.x += sin(uTime * .7 + aSeed * 40.) * .45;
        p.z += cos(uTime * .5 + aSeed * 23.) * .3;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        vA = smoothstep(38., 5., -mv.z) * smoothstep(0., .5, p.y) * smoothstep(7., 6., p.y);
        vRot = aSeed * 6.283 + uTime * (aSeed - .5) * 1.8;
        gl_PointSize = min(uPx * (9. + aSeed * 13.) * (4. / max(-mv.z, .5)), 54.);
      }`,
    fragmentShader: /* glsl */`
      uniform sampler2D uMap; uniform vec3 uColor; uniform float uFade; varying float vA, vRot;
      void main() {
        vec2 c = gl_PointCoord - .5;
        float s = sin(vRot), k = cos(vRot);
        c = vec2(c.x * k - c.y * s, (c.x * s + c.y * k) * 1.9); // nyújtott, levélszerű folt
        if (abs(c.x) > .5 || abs(c.y) > .5) discard;
        float a = texture2D(uMap, c + .5).a * vA * .85 * uFade;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const leaves = new THREE.Points(leafGeo, leafMat);
  leaves.frustumCulled = false;
  scene.add(leaves);
  const LEAF_NIGHT = new THREE.Color('#4a8fd0'), LEAF_DAWN = new THREE.Color('#e9b55c');

  const fogCol = new THREE.Color(), veilCol = new THREE.Color();
  const MIST = new THREE.Color('#b9c8df');
  const state = { dawn: 0, bgLum: 1 };

  // reveal: 0 = vakító fehér (töltőképernyő), ~0.45 = világos köd, amelyből a törzsek kirajzolódnak,
  // 1 = kitisztult éjszakai erdő.
  function update(p, time, reveal = 1) {
    const dawn = smooth(p, 0.52, 1);
    state.dawn = dawn;
    if (p < 0.5) fogCol.copy(NIGHT).lerp(BLUE, p / 0.5);
    else fogCol.copy(BLUE).lerp(DAWN, dawn);
    let density = THREE.MathUtils.lerp(0.042, 0.027, dawn);
    if (reveal < 1) {
      const thicken = smooth(reveal, 0, 0.45), clear = smooth(reveal, 0.36, 1);
      // a fehér a tónusleképezés után is fehér maradjon, ezért a fényerő jóval 1 fölött indul
      veilCol.setRGB(10, 10, 10).lerp(MIST, thicken);
      fogCol.copy(veilCol.lerp(fogCol, clear));
      density = THREE.MathUtils.lerp(1.5 * Math.pow(0.1 / 1.5, thicken), density, clear);
    }
    const settled = smooth(reveal, 0.55, 1);
    scene.fog.color.copy(fogCol);
    scene.background.copy(fogCol);
    scene.fog.density = density;
    // a háttér világossága: ehhez igazodik a jelenet fölötti szöveg színe
    state.bgLum = Math.min(1, 0.2126 * fogCol.r + 0.7152 * fogCol.g + 0.0722 * fogCol.b);

    hemi.intensity = THREE.MathUtils.lerp(0.6, 1.5, dawn);
    hemi.color.set('#6f9bff').lerp(WARM, dawn * 0.8);
    moon.intensity = THREE.MathUtils.lerp(0.7, 0.2, dawn);
    sun.intensity = dawn * 3.2;
    glowMat.opacity = dawn * 0.8;
    coreMat.opacity = dawn * 0.9;
    foliageMat.color.copy(WHITE).lerp(WARM, dawn * 0.75);
    pathMat.color.set('#7ea6e0').lerp(WARM, dawn);
    pathMat.opacity = THREE.MathUtils.lerp(0.3, 0.55, dawn);
    mistMat.forEach((m) => m.color.set('#9cc4ea').lerp(WARM, dawn));

    flyMat.uniforms.uTime.value = time;
    flyMat.uniforms.uFade.value = settled;
    leafMat.uniforms.uFade.value = settled;
    leafMat.uniforms.uTime.value = time;
    leafMat.uniforms.uColor.value.copy(LEAF_NIGHT).lerp(LEAF_DAWN, dawn);
    rays.forEach((r, i) => {
      r.material.opacity = dawn * (0.26 + 0.07 * Math.sin(time * 0.3 + i * 2));
      r.rotation.z = (i ? -1 : 1) * time * 0.012 + i;
    });
    for (const s of mist) s.position.x = s.userData.x + Math.sin(time * s.userData.sp + s.userData.ph) * 2.2;
  }

  function resize(w, h, pr) {
    camera.aspect = w / h;
    camera.fov = camera.aspect < 0.8 ? 64 : 50;
    camera.updateProjectionMatrix();
    flyMat.uniforms.uPx.value = pr * (h / 800);
    leafMat.uniforms.uPx.value = pr * (h / 800);
  }

  return { scene, camera, lantern, state, update, resize };
}
