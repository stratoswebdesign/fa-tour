import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld } from './world.js';
import { PAINTINGS, layoutOf, buildPainting, loadImage } from './paintings.js';
import { PATH, pathPoint, progressAt, smooth } from './path.js';
import { createAudio } from './audio.js';

const $ = (s) => document.querySelector(s);
const { clamp, lerp } = THREE.MathUtils;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = document.body;

// A séta közben beúszó sorok – Moldvai Réka saját megfogalmazásai a jelentkezéséből.
const VERSES = [
  { at: 0.215, side: 'right', lines: ['A fák, az erdők', 'és az ember kapcsolata', 'áll a középpontban.'] },
  { at: 0.375, side: 'left', lines: ['Mintegy húsz festőművész,', 'közel ötven alkotás,', 'egyetlen közös cél:'] },
  { at: 0.53, side: 'right', lines: ['hogy a művészet', 'valódi erdőket', 'hozzon létre.'] },
  { at: 0.7, side: 'left', lines: ['„A művészet nemcsak gondolatokat', 'és érzéseket ébreszthet,', 'hanem kézzelfogható,', 'maradandó értéket is teremthet.”'], by: 'Moldvai Réka' },
];

const fail = (msg, err) => {
  const el = $('#load-error');
  el.textContent = msg; el.hidden = false;
  $('#hint').classList.remove('on');
  if (err) console.error(err);
};

// ---------- megjelenítő ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('#scene'), antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  fail('A böngésződ nem tudja megjeleníteni a 3D-s kiállítást (WebGL nem érhető el). Görgess lejjebb a kezdeményezés leírásához.', err);
  body.classList.remove('locked', 'loading');
  body.classList.add('no-webgl');
  throw err;
}
let pixelRatio = Math.min(devicePixelRatio, 1.75);
renderer.setPixelRatio(pixelRatio);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const layout = PAINTINGS.map(layoutOf);
const world = createWorld(renderer, layout);
const { scene, camera, lantern } = world;

const composer = new EffectComposer(renderer);
composer.renderTarget1.samples = 4;
composer.renderTarget2.samples = 4;
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.5, 0.75, 0.86);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const audio = createAudio();

// ---------- görgetés ----------
let lenis = null;
if (!reduced) {
  try {
    const { default: Lenis } = await import('lenis');
    lenis = new Lenis({ lerp: 0.085, wheelMultiplier: 0.9 });
    lenis.stop();
  } catch (err) {
    console.warn('A finom görgetés nem töltődött be, a böngésző saját görgetése marad.', err);
  }
}
const walkEl = $('#walk');
const walkRange = () => walkEl.offsetHeight - innerHeight;
const scrollToY = (y) => (lenis ? lenis.scrollTo(y, { duration: 2.4 }) : window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' }));
const lockScroll = (v) => {
  if (lenis) (v ? lenis.stop() : lenis.start());
  document.documentElement.style.overflow = v ? 'hidden' : '';
};

document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
  const el = document.querySelector(a.getAttribute('href'));
  if (!el) return;
  e.preventDefault();
  scrollToY(el.id === 'top' ? 0 : el.getBoundingClientRect().top + scrollY - 40);
}));

// ---------- feliratok a jelenet fölött ----------
const versesEl = $('#verses');
const verseLines = [];
for (const V of VERSES) {
  const box = document.createElement('p');
  box.className = `verse ${V.side}`;
  V.lines.forEach((text, i) => {
    const s = document.createElement('span');
    s.textContent = text;
    box.append(s);
    verseLines.push({ el: s, at: V.at + (i - (V.lines.length - 1) / 2) * 0.011 });
  });
  if (V.by) {
    const s = document.createElement('span');
    s.className = 'by'; s.textContent = V.by;
    box.append(s);
    verseLines.push({ el: s, at: V.at + (V.lines.length / 2) * 0.011 });
  }
  versesEl.append(box);
}
const setBlurFade = (el, d, shift = 18, dim = 1) => {
  const a = clamp(1 - Math.abs(d), 0, 1) * dim;
  el.style.opacity = a.toFixed(3);
  const blur = Math.max(0, 1 - a - 0.08) * 9.8; // a majdnem teljesen látható szöveg már éles
  el.style.filter = blur < 0.05 ? 'none' : `blur(${blur.toFixed(2)}px)`;
  el.style.transform = `translateY(${(-d * shift).toFixed(1)}px)`;
};

const two = (n) => String(n).padStart(2, '0');

// ---------- képek betöltése ----------
const paintings = [];
const hotspots = $('#hotspots'), rail = $('#rail');
const loadSteps = PAINTINGS.length + 1; // a képek, majd a jelenet bemelegítése
const setLoaded = (n) => { $('#hint-text').textContent = `Betöltés ${Math.round((n / loadSteps) * 100)}%`; };
try {
  for (let i = 0; i < PAINTINGS.length; i++) {
    const img = await loadImage(PAINTINGS[i].src);
    const P = buildPainting(PAINTINGS[i], img);
    P.index = i;
    scene.add(P.group);
    paintings.push(P);

    const spot = document.createElement('button');
    spot.type = 'button'; spot.className = 'spot';
    spot.textContent = 'Kép megnyitása';
    spot.setAttribute('aria-label', `${P.title} megnyitása`);
    spot.addEventListener('click', () => open(P));
    spot.addEventListener('pointerenter', () => audio.chime());
    hotspots.append(spot);
    P.spot = spot;

    const li = document.createElement('li'), tick = document.createElement('button');
    tick.type = 'button';
    tick.setAttribute('aria-label', `${i + 1}. kép: ${P.title}`);
    const railLabel = document.createElement('span');
    railLabel.className = 'rail-label';
    railLabel.textContent = `${two(i + 1)} — ${P.title}`;
    railLabel.setAttribute('aria-hidden', 'true');
    tick.append(railLabel);
    P.viewAt = progressAt(P.z, P.side === 0 ? 8 : 8.5);
    tick.addEventListener('click', () => scrollToY(P.viewAt * walkRange()));
    li.append(tick); rail.append(li);
    P.tick = tick;

    // a textúrák feltöltése most, hogy séta közben ne akadjon meg a kép
    for (const t of [P.mat.map, P.mat.normalMap, P.mat.roughnessMap, P.mat.displacementMap]) renderer.initTexture(t);
    setLoaded(i + 1);
  }
} catch (err) {
  fail('A képeket nem sikerült betölteni. Frissítsd az oldalt, és ha így sem megy, nézd meg az internetkapcsolatot.', err);
  throw err;
}
const canvases = paintings.map((P) => P.canvas);
document.fonts.load('500 36px "Fraunces"').then(() => paintings.forEach((P) => P.refreshPlate())).catch(() => {});

// ---------- állapot ----------
let entered = false;
let active = null;          // a megnyitott (vagy éppen záródó) kép
let mixTarget = 0, mix = 0, mixVel = 0;
let pS = 0;
let hover = null, needRay = false;
const pointer = { x: 0, y: 0, sx: 0, sy: 0, cx: -100, cy: -100 };
const raycaster = new THREE.Raycaster();
raycaster.far = 17;
const ndc = new THREE.Vector2();

const v = new THREE.Vector3(), dir = new THREE.Vector3(), rightW = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
const walkPos = new THREE.Vector3(), walkTarget = new THREE.Vector3();
const openPos = new THREE.Vector3(), openTarget = new THREE.Vector3();
const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3(), lampA = new THREE.Vector3(), lampB = new THREE.Vector3();

function smoothDamp(cur, target, vel, time, dt) {
  const omega = 2 / time, x = omega * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = cur - target, temp = (vel + omega * change) * dt;
  return [target + (change + temp) * e, (vel - omega * temp) * e];
}

function computeWalkPose(p, extra) {
  pathPoint(p, walkPos);
  if (!reduced) walkPos.y += Math.sin(walkPos.z * 1.3) * 0.014;
  pathPoint(p + 0.04, walkTarget);
  walkTarget.y = 1.72 + extra * 1.3;
  // a tekintet a közeledő kép felé húz
  for (const P of paintings) {
    if (P.side === 0) continue;
    const ahead = walkPos.z - P.pos.z;
    const w = smooth(ahead, -1.5, 3) * (1 - smooth(ahead, 8, 15));
    // álló képernyőn a kép különben kilógna oldalt, ezért ott erősebben fordulunk felé
    if (w > 0) walkTarget.lerp(P.pos, w * (camera.aspect < 0.8 ? 0.78 : 0.34));
  }
  // az ösvény végén a záró kép kerül a kép közepére
  const last = paintings[paintings.length - 1];
  if (last) walkTarget.lerp(v.copy(last.pos).setY(walkTarget.y), smooth(p, 0.86, 1));
}

function computeOpenPose(P) {
  const mobile = innerWidth <= 820;
  const tan = Math.tan((camera.fov * Math.PI) / 360);
  const fracH = mobile ? 0.36 : 0.72, fracW = mobile ? 0.84 : 0.48;
  const dist = Math.max(P.outerH / fracH / 2 / tan, P.outerW / fracW / 2 / (tan * camera.aspect));
  const viewH = 2 * dist * tan, viewW = viewH * camera.aspect;
  openTarget.copy(P.pos);
  if (mobile) openTarget.y -= viewH * 0.24;
  else openTarget.addScaledVector(P.right, viewW * 0.17);
  openPos.copy(openTarget).addScaledVector(P.normal, dist);
}

// ---------- kép megnyitása / bezárása ----------
const plate = $('#plate');
function fillPlate(P) {
  $('#plate-kicker').textContent = `N° ${two(P.index + 1)} / ${two(paintings.length)} · munkacím`;
  $('#plate-title').textContent = P.title;
  $('#plate-artist').textContent = P.artist;
  $('#plate-note').textContent = '';
  $('#plate-data').replaceChildren(...[['Technika', P.technique], ['Méret', P.size], ['Kikiáltási ár', P.price]].map(([k, val]) => {
    const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = val ?? 'hamarosan';
    if (!val) dd.className = 'todo';
    row.append(dt, dd);
    return row;
  }));
}
// megnyitott képnél a háttérben lévő vezérlők nem kaphatnak fókuszt
const behind = [$('.top'), $('main'), rail, hotspots];
const setBehindInert = (v) => { behind.forEach((el) => { el.inert = v; }); plate.inert = !v; };
const jumpTo = (p) => {
  const y = p * walkRange();
  if (lenis) lenis.scrollTo(y, { immediate: true, force: true }); else window.scrollTo(0, y);
  pS = Math.min(p, 1);
};
function open(P) {
  if (!entered || active) return;
  active = P;
  computeOpenPose(P);
  mixTarget = 1;
  lockScroll(true);
  body.classList.add('is-open');
  plate.setAttribute('aria-hidden', 'false');
  setBehindInert(true);
  fillPlate(P);
  setHover(null);
  audio.setMode('open');
  audio.chime();
  setTimeout(() => active === P && $('#plate-back').focus({ preventScroll: true }), 900);
}
function close() {
  if (!active || mixTarget === 0) return;
  mixTarget = 0;
  body.classList.remove('is-open');
  plate.setAttribute('aria-hidden', 'true');
  setBehindInert(false);
  lockScroll(false);
  audio.setMode('walk');
}
// Lapozás megnyitott képek között: rövid elsötétülés alatt vált a kamera a következő képre,
// és a séta is odaugrik, hogy bezáráskor a látogató e kép mellett találja magát.
let switching = false;
function step(dir) {
  if (!active || mixTarget === 0 || switching) return;
  const Q = paintings[(active.index + dir + paintings.length) % paintings.length];
  switching = true;
  body.classList.add('blink');
  setTimeout(() => {
    active = Q;
    jumpTo(Q.viewAt);
    computeOpenPose(Q);
    fillPlate(Q);
    audio.chime();
    body.classList.remove('blink');
    switching = false;
  }, 420);
}
$('#plate-back').addEventListener('click', close);
$('#plate-prev').addEventListener('click', () => step(-1));
$('#plate-next').addEventListener('click', () => step(1));
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') close();
  else if (active && e.key === 'ArrowRight') step(1);
  else if (active && e.key === 'ArrowLeft') step(-1);
});
$('#plate-cta').addEventListener('click', () => {
  $('#plate-note').textContent = 'Ez még prototípus: az érdeklődést itt később lehet majd elküldeni.';
});

function setHover(P) {
  if (hover === P) return;
  hover = P;
  $('#cursor').classList.toggle('on', !!P);
  body.style.cursor = P ? 'pointer' : '';
  if (P) audio.chime();
}

addEventListener('pointermove', (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -((e.clientY / innerHeight) * 2 - 1);
  pointer.cx = e.clientX; pointer.cy = e.clientY;
  needRay = e.pointerType === 'mouse';
});
const hit = (x, y) => {
  ndc.set((x / innerWidth) * 2 - 1, -((y / innerHeight) * 2 - 1));
  raycaster.setFromCamera(ndc, camera);
  const h = raycaster.intersectObjects(canvases, false)[0];
  return h ? paintings[canvases.indexOf(h.object)] : null;
};
addEventListener('click', (e) => {
  if (!entered || active) return;
  if (e.target.closest('a, button, input, label, #plate, .after')) return;
  const P = hit(e.clientX, e.clientY);
  if (P) open(P);
});

// ---------- belépés, hang ----------
const soundBtn = $('#sound');
const syncSound = () => soundBtn.setAttribute('aria-pressed', String(audio.on));
soundBtn.addEventListener('click', () => { audio.toggle(); syncSound(); });
// Belépéskor a fehér töltőképernyő köddé válik, majd kitisztul: reveal 0 → 1.
// A séta akkor indul (görgetés, képek megnyitása), amikor az erdő már nagyrészt látszik.
const REVEAL_SECONDS = 5.6;
let loaded = false, revealing = false, reveal = 0, revealHeld = false; // a „held" csak a ?debug ellenőrzéshez kell
function startReveal() {
  if (revealing) return;
  revealing = true;
  body.classList.remove('loading', 'ready');
  body.classList.add('revealing');
  if (reduced) reveal = 1;
}
// A látogató maga lép be: kattintással a két lehetőség egyikére, vagy Enterrel (ez hanggal indít).
function begin(withSound) {
  if (!loaded || revealing) return;
  if (withSound) audio.setOn(true);
  syncSound();
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  startReveal();
}
$('#enter-sound').addEventListener('click', () => begin(true));
$('#enter-mute').addEventListener('click', () => begin(false));
addEventListener('keydown', (e) => {
  // ha a fókusz valamelyik gombon áll, az Enter magát a gombot nyomja meg
  if (e.key === 'Enter' && !e.repeat && !e.target.closest?.('button, a, input')) begin(true);
});
function enter() {
  if (entered) return;
  entered = true;
  body.classList.remove('locked');
  body.classList.add('entered');
  $('#hint-text').textContent = 'Görgess az erdőbe';
  lenis?.start();
}

$('#news').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#email'), msg = $('#news-msg');
  msg.textContent = input.checkValidity()
    ? 'Ez még prototípus: a feliratkozás a kész oldalon fog működni.'
    : 'Írj be egy érvényes e-mail-címet, például nev@pelda.hu.';
});

// ---------- minőség ----------
// Ha a gép nem bírja simán, kisebb felbontásra váltunk és elhagyjuk a fényudvart.
let lowQuality = false, frameTimes = [];
function setLowQuality() {
  if (lowQuality) return;
  lowQuality = true;
  pixelRatio = 1;
  bloom.enabled = false;
  renderer.setPixelRatio(1);
  composer.setPixelRatio(1);
  resize();
}

// ---------- méretezés ----------
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  world.resize(innerWidth, innerHeight, pixelRatio);
  if (active) computeOpenPose(active);
}
addEventListener('resize', resize);
resize();

// ---------- képkocka ----------
const hero = $('#hero'), hint = $('#hint'), cursor = $('#cursor');
const clock = new THREE.Clock();
let lastFg = -1;

function frame(now) {
  requestAnimationFrame(frame);
  const raw = clock.getDelta(), dt = Math.min(raw, 0.05), time = clock.elapsedTime;
  lenis?.raf(now);

  if (revealing && !revealHeld && reveal < 1) reveal = Math.min(1, reveal + Math.min(raw, 0.1) / REVEAL_SECONDS);
  if (!entered && reveal >= 0.72) enter();
  // képkockaidő mérése a belépés után (csak látható lapon), szükség esetén minőségváltás
  if (frameTimes && reveal >= 1 && document.visibilityState === 'visible' && raw < 0.25) {
    frameTimes.push(raw);
    if (frameTimes.length >= 150) {
      frameTimes.sort((a, b) => a - b);
      if (frameTimes[75] > 0.03) setLowQuality();
      frameTimes = null;
    }
  }

  const range = walkRange(), y = window.scrollY;
  const p = clamp(y / range, 0, 1);
  const extra = clamp((y - range) / innerHeight, 0, 1.2);
  pS += (p - pS) * (1 - Math.exp(-dt * 6));

  [mix, mixVel] = smoothDamp(mix, mixTarget, mixVel, 0.62, dt);
  if (mixTarget === 0 && mix < 0.004 && active) { active = null; mix = 0; mixVel = 0; }
  const m = clamp(mix, 0, 1);

  pointer.sx += (pointer.x - pointer.sx) * (1 - Math.exp(-dt * 4));
  pointer.sy += (pointer.y - pointer.sy) * (1 - Math.exp(-dt * 4));
  const px = reduced ? 0 : pointer.sx, py = reduced ? 0 : pointer.sy;

  world.update(pS, time, reveal);
  audio.setDawn(world.state.dawn);

  // kamera: a séta és a megnyitott kép nézete között úszik át
  computeWalkPose(pS, extra);
  // amíg a köd oszlik, a kamera hátulról, kicsit magasabbról ereszkedik az ösvényre
  const away = reduced ? 0 : 1 - smooth(reveal, 0.05, 1);
  if (away > 0.001) { walkPos.z += away * 7; walkPos.y += away * 0.9; walkTarget.y += away * 0.25; }
  dir.copy(walkTarget).sub(walkPos).normalize();
  rightW.crossVectors(dir, UP).normalize();
  walkTarget.addScaledVector(rightW, px * 0.9).addScaledVector(UP, py * 0.45);
  camPos.copy(walkPos); camTarget.copy(walkTarget);
  lampA.copy(walkPos).addScaledVector(dir, 2.4).addScaledVector(rightW, px * 2.6).addScaledVector(UP, 0.15 + py * 1.3);
  if (active) {
    v.copy(openPos).addScaledVector(active.right, px * 0.34).addScaledVector(UP, py * 0.2);
    camPos.lerp(v, m);
    camTarget.lerp(openTarget, m);
    lampB.copy(active.pos).addScaledVector(active.right, px * active.w * 0.62).addScaledVector(UP, py * active.h * 0.62).addScaledVector(active.normal, 1.5);
    lampA.lerp(lampB, m);
  }
  camera.position.copy(camPos);
  camera.lookAt(camTarget);
  lantern.position.copy(lampA);
  lantern.intensity = lerp(26 * lerp(1, 0.45, world.state.dawn), 3.4, m);

  // képek
  for (const P of paintings) {
    const o = P === active ? m : 0;
    P.mat.displacementScale = lerp(0.016, 0.058, o);
    P.mat.displacementBias = -P.mat.displacementScale / 2;
    // a kép „felébred", ahogy a látogató közeledik hozzá
    const dist = camera.position.distanceTo(P.pos);
    const near = 1 - smooth(dist, 8, 21);
    P.mat.emissiveIntensity = lerp(lerp(0.15, 0.34, near), 0.42, o);
    P.halo.material.opacity = lerp(lerp(0.05, 0.2, near), 0.3, o);
    P.group.rotation.z = reduced ? 0 : Math.sin(time * 0.5 + P.phase) * 0.008 * (1 - o);

    // „Kép megnyitása" felirat
    const facing = v.copy(camera.position).sub(P.pos).dot(P.normal) > 0.5;
    let a = entered && facing ? (1 - smooth(dist, 9.5, 15)) * smooth(dist, 2.4, 3.6) * (1 - smooth(m, 0, 0.3)) * (1 - smooth(extra, 0.05, 0.3)) : 0;
    v.copy(P.anchor).project(camera);
    if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) a = 0;
    const s = P.spot.style;
    if (a > 0.02) {
      s.visibility = 'visible'; s.opacity = a.toFixed(3);
      s.transform = `translate(${((v.x * 0.5 + 0.5) * innerWidth).toFixed(1)}px, ${((-v.y * 0.5 + 0.5) * innerHeight).toFixed(1)}px) translateX(-50%)`;
    } else if (s.visibility !== 'hidden') { s.visibility = 'hidden'; s.opacity = '0'; }
    P.tick.classList.toggle('on', Math.abs(pS - P.viewAt) < 0.045);
  }

  // egér a kép fölött
  if (needRay && entered && !active) { needRay = false; setHover(hit(pointer.cx, pointer.cy)); }
  cursor.style.transform = `translate(${pointer.cx}px, ${pointer.cy}px)`;

  // szövegek
  const dim = 1 - smooth(m, 0, 0.4); // megnyitott kép mellett a sorok eltűnnek
  setBlurFade(hero, pS / 0.055, 30, dim);
  for (const L of verseLines) setBlurFade(L.el, (pS - L.at) / 0.046, 18, dim);
  hint.classList.toggle('on', !loaded || (entered && pS < 0.012 && !active));
  body.classList.toggle('past-walk', extra > 0.08);

  // a jelenet fölötti szöveg hajnalban sötétre vált, hogy olvasható maradjon
  // Ugyanez történik a fehér töltőképernyőn és a világos ködben. A váltás a háttér tényleges
  // világosságát követi, és gyors: így a szöveg sosem szürkül össze a háttérrel.
  const light = smooth(world.state.bgLum, 0.2, 0.32) * (1 - smooth(extra, 0.05, 0.45)) * (1 - m);
  const k = Math.round(light * 40) / 40, night = 1 - k;
  if (k !== lastFg) {
    lastFg = k;
    const mixRgb = (a, b) => `rgb(${a.map((x, i) => Math.round(lerp(x, b[i], k))).join(', ')})`;
    body.style.setProperty('--fg', mixRgb([239, 230, 210], [9, 17, 42]));
    body.style.setProperty('--accent', mixRgb([241, 212, 138], [140, 98, 14]));
    body.style.setProperty('--night', night);
  }

  composer.render(dt);
}

// Bemelegítés a belépő mögött: az árnyalók lefordítása és egy első képkocka,
// hogy a belépés pillanatában már semmi ne akassza meg a mozgást.
try {
  await renderer.compileAsync(scene, camera);
  frame(performance.now());
  await Promise.race([
    new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    new Promise((r) => setTimeout(r, 600)),
  ]);
} catch (err) {
  console.warn('A jelenet előkészítése nem sikerült teljesen, a betöltés így is folytatódik.', err);
  requestAnimationFrame(frame);
}
setLoaded(loadSteps);
// minden kész: megjelennek a belépési lehetőségek, a köd csak a látogató jelére indul
loaded = true;
body.classList.add('ready');
$('#enter-sound').focus({ preventScroll: true });

// kézi ellenőrzéshez a konzolból – csak a ?debug címmel érhető el
if (new URLSearchParams(location.search).has('debug')) window.__fa = {
  world, paintings, open, close, enter, scrollToY, walkRange,
  get progress() { return pS; },
  settle() { mix = mixTarget; mixVel = 0; pointer.sx = pointer.x; pointer.sy = pointer.y; },
  // a ködös nyitány adott pontjára ugrik (0..1); 1-nél a séta is elindul
  begin,
  setReveal(r, hold = false) { startReveal(); reveal = r; revealHeld = hold; if (r >= 1) enter(); },
  setLowQuality,
  // egy képkocka valós ideje ezredmásodpercben (a GPU bevárásával)
  bench(n = 20) {
    const gl = renderer.getContext(), t0 = performance.now();
    for (let i = 0; i < n; i++) { composer.render(0.016); gl.finish(); }
    return (performance.now() - t0) / n;
  },
  get stats() { return { lowQuality, reveal, entered, mix, frames: frameTimes ? frameTimes.length : 'done', dpr: renderer.getPixelRatio() }; },
  point(x, y) { pointer.x = x; pointer.y = y; },
  jump: (p) => jumpTo(p), step,
};
