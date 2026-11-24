/* Rimoboy: built-in synthesized beats (M3). Spec: BUILD.md sections 8.3–8.5.
   All beats are original patterns written for this project.
   Pattern strings: 16 chars per bar, the string loops. 'x' hit, 'o' soft hit, '.' rest.
   hat: 'x' closed, 'o' open, 'r' roll of 3, 'R' roll of 4.
   chords: one per bar (MIDI notes), loops. roots: bass note per bar (MIDI), loops. */
(function () {
  'use strict';
  const A = window.RBAudio, I = window.Instruments;

  const BEATS = [
    {
      id: 'sofia', title: 'Софийски нощи', genre: 'Бум бап', emoji: '🌃', cover: '#ff7a45',
      bpm: 90, swing: 0.14,
      kick:  'x.....x...x.....' + 'x.....x..x..x...',
      snare: '....x.......x...',
      rim:   '.......o.......o' + '..o....o.......o',
      hat:   'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.xo',
      chords: [[57, 60, 64, 67], [53, 57, 60, 64], [53, 57, 60, 62], [52, 56, 59, 62]],
      keys: 'x.......x.....x.', keysLen: 6,
      roots: [33, 29, 38, 28], bass: 'x......x..x.....',
    },
    {
      id: 'panelka', title: 'Панелка', genre: 'Чил бум бап', emoji: '🏢', cover: '#22c7e8',
      bpm: 84, swing: 0.18, lofi: true,
      kick:  'x.......x.x.....' + 'x......x..x.....',
      snare: '....x.......x...',
      hat:   'x.x.x.x.x.x.x.x.' + 'x.x.x.x.x.x.x.xo',
      chords: [[57, 60, 62, 65], [55, 58, 62, 65], [53, 57, 58, 62], [55, 57, 61, 64]],
      pad: true, keys: 'x...........x...', keysLen: 10,
      roots: [38, 31, 34, 33], bass: 'x.......x.......',
    },
    {
      id: 'snejinka', title: 'Снежинка', genre: 'Лоуфай', emoji: '❄️', cover: '#9d8bff',
      bpm: 80, swing: 0.2, lofi: true,
      kick:  'x......x..x.....',
      snare: '....x.......x...',
      hat:   'x.x.x.x.x.x.x.x.',
      chords: [[53, 57, 60, 64], [52, 55, 59, 62], [50, 53, 57, 60], [48, 52, 55, 59]],
      keys: 'x.......x.......', keysLen: 8,
      roots: [29, 28, 38, 36], bass: 'x.......x.......',
      bellLoop: 64,
      bell: [[0, 72, 4], [6, 76, 2], [8, 79, 6], [16, 76, 4], [22, 74, 2], [24, 72, 6],
             [32, 74, 4], [38, 77, 2], [40, 81, 6], [48, 79, 4], [54, 76, 2], [56, 72, 8]],
    },
    {
      id: 'nazdrave', title: 'Наздраве', genre: 'Олдскул купон', emoji: '🥂', cover: '#ffc83d',
      bpm: 100, swing: 0.05,
      kick:  'x.....x.x.....x.' + 'x.....x.x..x....',
      clap:  '....x.......x...',
      hat:   'x.o.x.o.x.o.x.o.',
      chords: [[60, 64, 67], [57, 60, 64], [53, 57, 60], [55, 59, 62]],
      keys: '..x...x...x...x.', keysLen: 2,
      roots: [36, 33, 29, 31], bass: 'x..x..x...x.x...',
      bellLoop: 32,
      bell: [[0, 84, 2], [3, 88, 2], [6, 91, 4], [16, 86, 2], [19, 89, 2], [22, 93, 4]],
    },
    {
      id: 'champagne', title: 'Шампанско', genre: 'Трап', emoji: '🍾', cover: '#35d48a',
      bpm: 140, swing: 0,
      kick:  'x......x..x.....' + 'x.........x..x..',
      snare: '........x.......',
      hat:   'x.x.x.x.x.xrx.x.' + 'x.x.x.x.xRx.x.x.',
      chords: [[60, 63, 67], [56, 60, 63], [55, 58, 63], [58, 62, 65]],
      keys: 'x.....x.....x...', keysLen: 3,
      roots: [36, 32, 39, 34], bass: 'x......x..x.....', sub: true,
      bellLoop: 32,
      bell: [[0, 72, 2], [3, 75, 2], [6, 79, 4], [16, 77, 2], [19, 75, 2], [22, 72, 4]],
    },
    {
      id: 'polunosht', title: 'Полунощ', genre: 'Дрил', emoji: '🕛', cover: '#ff5fa8',
      bpm: 142, swing: 0,
      kick:  'x.........x.....' + '..x.......x.....',
      snare: '........x.......' + '.......x....x...',
      hat:   'x..x..x.x..x..x.',
      chords: [[53, 56, 60], [53, 56, 61], [53, 58, 61], [52, 55, 60]],
      pad: true,
      roots: [41, 37, 34, 36], bass: 'x.....x...x.....', sub: true, glide: true,
    },
  ];

  // length in 16ths from each bass trigger to the next one (or to the end of the bar)
  function bassLengths(str) {
    const out = new Array(16).fill(0);
    if (!str) return out;
    for (let i = 0; i < 16; i++) {
      if (str[i] !== 'x') continue;
      let j = i + 1;
      while (j < 16 && str[j] !== 'x') j++;
      out[i] = j - i;
    }
    return out;
  }
  const at = (str, step) => (str && str.length ? str[step % str.length] : '.');

  class SynthBeat {
    constructor(def) {
      this.def = def;
      this.bassLen = bassLengths(def.bass);
      this.timer = null;
    }
    // Starts the beat at audio time `when`. Returns t0 = time of the first count-in cell.
    start(when, ctx = A.ctx, dest = A.master) {
      const d = this.def;
      this.ctx = ctx;
      this.out = ctx.createGain();
      this.out.gain.value = 0.9;
      this.out.connect(dest);
      this.bus = this.out;
      if (d.lofi) {
        const lp = ctx.createBiquadFilter();
        lp.type = 'lowpass'; lp.frequency.value = 3200; lp.Q.value = 0.5;
        lp.connect(this.out);
        this.bus = lp;
        const cr = ctx.createBufferSource(), cg = ctx.createGain();
        cr.buffer = A.buffers(ctx).crackle; cr.loop = true; cg.gain.value = 0.05;
        cr.connect(cg); cg.connect(this.out); cr.start(when);
        this.crackle = cr;
      }
      this.sp16 = 60 / d.bpm / 4;
      this.t0 = when;
      this.step = 0;
      this.prevRoot = null;
      if (ctx === A.ctx) {
        this.timer = setInterval(() => this.tick(), 25);
        this.tick();
      }
      return when;
    }
    tick() { this.scheduleUntil(this.ctx.currentTime + 0.25); }
    // Schedules every 16th up to audio time `until`. Tests call it directly offline.
    scheduleUntil(until) {
      for (;;) {
        let t = this.t0 + this.step * this.sp16;
        if (t > until) break;
        if (this.step % 2 === 1) t += this.def.swing * this.sp16;
        this.playStep(this.step, Math.max(t, 0));
        this.step++;
      }
    }
    playStep(step, t) {
      const d = this.def, b = this.bus, st = step % 16, bar = Math.floor(step / 16);
      let c = at(d.kick, step);
      if (c === 'x') I.kick(b, t, 1); else if (c === 'o') I.kick(b, t, 0.55);
      c = at(d.snare, step); if (c !== '.') I.snare(b, t, c === 'o' ? 0.5 : 1);
      c = at(d.clap, step); if (c !== '.') I.clap(b, t, c === 'o' ? 0.5 : 1);
      c = at(d.rim, step); if (c !== '.') I.rim(b, t, c === 'o' ? 0.55 : 1);
      c = at(d.hat, step);
      if (c === 'x') I.hat(b, t, 1, false);
      else if (c === 'o') I.hat(b, t, 1, true);
      else if (c === 'r' || c === 'R') {
        const n = c === 'r' ? 3 : 4;
        for (let i = 0; i < n; i++) I.hat(b, t + (i * this.sp16) / n, 0.7, false);
      }
      const ci = bar % d.chords.length, chord = d.chords[ci];
      if (d.pad && st === 0) I.pad(b, t, chord, 16 * this.sp16);
      if (d.keys && d.keys[st] === 'x') I.keys(b, t, chord, (d.keysLen || 4) * this.sp16);
      if (d.bass && d.bass[st] === 'x') {
        const root = d.roots[bar % d.roots.length];
        const len = this.bassLen[st] * this.sp16;
        if (d.sub) I.sub808(b, t, root, len, d.glide ? this.prevRoot : null);
        else I.bass(b, t, root, len);
        this.prevRoot = root;
      }
      if (d.bell) {
        const s = step % (d.bellLoop || 64);
        for (const [bs, n, l] of d.bell) if (bs === s) I.bell(b, t, n, l * this.sp16);
      }
    }
    // seconds since t0, corrected for output latency (what the listener hears now)
    time() { return this.ctx.currentTime - A.latency() - this.t0; }
    setVolume(v, ramp = 0.3) {
      if (!this.out) return;
      const g = this.out.gain, now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.9 * v, now + ramp);
    }
    stop(fade = 0.4) {
      clearInterval(this.timer);
      this.timer = null;
      if (!this.out) return;
      const out = this.out, cr = this.crackle;
      this.setVolume(0, fade);
      setTimeout(() => { try { out.disconnect(); if (cr) cr.stop(); } catch (e) { /* already gone */ } }, fade * 1000 + 300);
      this.out = null;
    }
  }

  window.BEATS = BEATS;
  window.SynthBeat = SynthBeat;
  window.BEATS.byId = (id) => BEATS.find((b) => b.id === id) || BEATS[0];
})();
