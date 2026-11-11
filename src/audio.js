// Generált háttérhang (Web Audio): szél, lassú akkordszőnyeg, harangok, hajnalban madarak.
// Nincs hangfájl, így jogdíj sincs; a végleges oldalon felvett erdőhangra és zenére cserélhető.
export function createAudio() {
  let ctx = null, master, verb, windGain, padFilter;
  let on = false, mode = 'walk', dawn = 0;
  const oscs = [];

  const impulse = (sec, decay) => {
    const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay);
    }
    return buf;
  };

  const brownNoise = (sec) => {
    const n = Math.floor(ctx.sampleRate * sec), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    return buf;
  };

  const lfo = (freq, depth, target) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; g.gain.value = depth;
    o.connect(g).connect(target); o.start();
  };

  function build() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);

    verb = ctx.createConvolver(); verb.buffer = impulse(4.5, 2.4);
    const wet = ctx.createGain(); wet.gain.value = 0.8;
    verb.connect(wet).connect(master);

    // szél a lombok között
    const noise = ctx.createBufferSource(); noise.buffer = brownNoise(7); noise.loop = true;
    const windFilter = ctx.createBiquadFilter(); windFilter.type = 'bandpass'; windFilter.frequency.value = 430; windFilter.Q.value = 0.45;
    windGain = ctx.createGain(); windGain.gain.value = 0.55;
    noise.connect(windFilter).connect(windGain).connect(master); noise.start();
    lfo(0.07, 190, windFilter.frequency);
    lfo(0.11, 0.22, windGain.gain);

    // akkordszőnyeg (d-moll, szeptimmel)
    padFilter = ctx.createBiquadFilter(); padFilter.type = 'lowpass'; padFilter.frequency.value = 720; padFilter.Q.value = 0.3;
    const padGain = ctx.createGain(); padGain.gain.value = 0.5;
    padFilter.connect(padGain); padGain.connect(master); padGain.connect(verb);
    [73.42, 110, 146.83, 174.61, 220, 261.63].forEach((f, i) => {
      const g = ctx.createGain(); g.gain.value = 0.05 / (1 + i * 0.35);
      lfo(0.03 + i * 0.013, g.gain.value * 0.6, g.gain);
      for (const [type, cents] of [['sine', -5], ['triangle', 6]]) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.detune.value = cents; o.base = cents;
        o.connect(g); o.start(); oscs.push(o);
      }
      g.connect(padFilter);
    });

    schedule();
  }

  function bell(freq, vol, dur) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), g2 = ctx.createGain();
    o.frequency.value = freq; o2.frequency.value = freq * 2.76; g2.gain.value = 0.22;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); o2.connect(g2).connect(g); g.connect(verb); g.connect(master);
    o.start(t); o2.start(t); o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  function chirp() {
    const t = ctx.currentTime, base = 2300 + Math.random() * 1900, n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = t + i * 0.11;
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.1), s);
      o.frequency.exponentialRampToValueAtTime(base * (1.25 + Math.random() * 0.3), s + 0.06);
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.014, s + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.09);
      o.connect(g); g.connect(verb); g.connect(master);
      o.start(s); o.stop(s + 0.12);
    }
  }

  function schedule() {
    const scale = [293.66, 349.23, 392.0, 440.0, 523.25, 587.33, 698.46];
    const tick = () => {
      if (on && ctx.state === 'running') {
        const open = mode === 'open';
        if (Math.random() < (open ? 0.85 : 0.5)) bell(scale[Math.floor(Math.random() * scale.length)] * (open ? 1 : 0.5), 0.032, open ? 4.5 : 3.5);
        if (Math.random() < dawn * 0.75) chirp();
      }
      setTimeout(tick, (mode === 'open' ? 1300 : 2400) + Math.random() * 2600);
    };
    tick();
  }

  function setOn(v) {
    if (v && !ctx) build();
    if (!ctx) return;
    on = v;
    if (v) ctx.resume();
    master.gain.setTargetAtTime(v ? 0.9 : 0, ctx.currentTime, 0.5);
  }

  return {
    get on() { return on; },
    setOn,
    toggle() { setOn(!on); return on; },
    setMode(m) {
      mode = m;
      if (!ctx) return;
      const t = ctx.currentTime, open = m === 'open';
      padFilter.frequency.setTargetAtTime(open ? 1900 : 720, t, 1.2);
      windGain.gain.setTargetAtTime(open ? 0.18 : 0.55, t, 1);
      oscs.forEach((o) => o.detune.setTargetAtTime(o.base + (open ? 500 : 0), t, 1.6));
    },
    setDawn(v) { dawn = v; },
    chime() { if (ctx && on) bell(880 + Math.random() * 220, 0.022, 2.2); },
  };
}
