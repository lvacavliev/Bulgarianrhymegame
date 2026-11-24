/* Rimoboy: audio core (M3). Spec: BUILD.md sections 8.1–8.2.
   - A.ensure(): lazy AudioContext + master bus (call from a click handler only)
   - A.makeOutput(ctx): master → compressor → destination (+ recDest on the live context)
   - I.*: synth instruments. Signature: I.name(bus, t, ...args). They create nodes on
     bus.context, so they also work inside an OfflineAudioContext (used by tests). */
(function () {
  'use strict';

  const A = { ctx: null, master: null, comp: null, recDest: null };

  // ---------- per-context shared buffers ----------
  const cache = new WeakMap();
  function buffers(ctx) {
    let b = cache.get(ctx);
    if (b) return b;
    const sr = ctx.sampleRate;
    const noise = ctx.createBuffer(1, sr * 2, sr);
    const nd = noise.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    const crackle = ctx.createBuffer(1, sr * 4, sr);
    const cd = crackle.getChannelData(0);
    for (let i = 0; i < cd.length; i++) cd[i] = (Math.random() * 2 - 1) * 0.01;
    for (let k = 0; k < 120; k++) {
      const p = Math.floor(Math.random() * (cd.length - 40));
      const a = (Math.random() * 2 - 1) * 0.3;
      for (let j = 0; j < 30; j++) cd[p + j] += a * Math.exp(-j / 4);
    }

    const curve = new Float32Array(1024);
    for (let i = 0; i < curve.length; i++) {
      const x = (i / (curve.length - 1)) * 2 - 1;
      curve[i] = Math.tanh(2.5 * x);
    }
    b = { noise, crackle, curve };
    cache.set(ctx, b);
    return b;
  }

  function makeOutput(ctx) {
    const master = ctx.createGain();
    master.gain.value = 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 6;
    comp.ratio.value = 6;
    comp.attack.value = 0.005;
    comp.release.value = 0.15;
    master.connect(comp);
    comp.connect(ctx.destination);
    return { master, comp };
  }

  A.ensure = function () {
    if (!A.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      A.ctx = new Ctx({ latencyHint: 'interactive' });
      const o = makeOutput(A.ctx);
      A.master = o.master;
      A.comp = o.comp;
      if (A.ctx.createMediaStreamDestination) {
        A.recDest = A.ctx.createMediaStreamDestination();
        A.comp.connect(A.recDest);
      }
      buffers(A.ctx);
    }
    if (A.ctx.state === 'suspended') A.ctx.resume();
    return A.ctx;
  };
  // seconds of audio output delay; the game subtracts it to sync the ball with the sound
  A.latency = function () {
    if (!A.ctx) return 0;
    return (A.ctx.outputLatency || 0) + (A.ctx.baseLatency || 0);
  };
  A.makeOutput = makeOutput;
  A.buffers = buffers;

  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  A.mtof = mtof;

  // ---------- helpers ----------
  function gainNode(ctx, v = 0) { const g = ctx.createGain(); g.gain.value = v; return g; }
  function noiseSrc(ctx) {
    const s = ctx.createBufferSource();
    s.buffer = buffers(ctx).noise;
    return s;
  }
  function filter(ctx, type, freq, q) {
    const f = ctx.createBiquadFilter();
    f.type = type; f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  }
  // percussive envelope: peak at t, exponential decay to silence over `dur`
  function perc(g, t, peak, dur) {
    g.gain.setValueAtTime(Math.max(peak, 0.0001), t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  }
  function noiseHit(bus, t, type, freq, q, peak, dur) {
    const ctx = bus.context;
    const s = noiseSrc(ctx), f = filter(ctx, type, freq, q), g = gainNode(ctx);
    perc(g, t, peak, dur);
    s.connect(f); f.connect(g); g.connect(bus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  // ---------- instruments ----------
  const I = {
    kick(bus, t, v = 1) {
      const ctx = bus.context;
      const o = ctx.createOscillator(), g = gainNode(ctx);
      o.type = 'sine';
      o.frequency.setValueAtTime(160, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
      perc(g, t, 0.85 * v, 0.45);
      o.connect(g); g.connect(bus);
      o.start(t); o.stop(t + 0.5);
      noiseHit(bus, t, 'highpass', 3000, 0.7, 0.3 * v, 0.006);
    },
    snare(bus, t, v = 1) {
      const ctx = bus.context;
      noiseHit(bus, t, 'bandpass', 1900, 0.8, 0.95 * v, 0.2);
      const o = ctx.createOscillator(), g = gainNode(ctx);
      o.type = 'triangle';
      o.frequency.setValueAtTime(190, t);
      perc(g, t, 0.4 * v, 0.1);
      o.connect(g); g.connect(bus);
      o.start(t); o.stop(t + 0.15);
    },
    clap(bus, t, v = 1) {
      for (let i = 0; i < 3; i++) noiseHit(bus, t + i * 0.012, 'bandpass', 1200, 1.2, 0.6 * v, 0.02);
      noiseHit(bus, t + 0.036, 'bandpass', 1200, 1, 0.45 * v, 0.15);
    },
    hat(bus, t, v = 1, open = false) {
      if (open) noiseHit(bus, t, 'highpass', 7500, 0.7, 0.18 * v, 0.28);
      else noiseHit(bus, t, 'highpass', 7500, 0.7, 0.22 * v, 0.045);
    },
    rim(bus, t, v = 1) {
      const ctx = bus.context;
      const o = ctx.createOscillator(), f = filter(ctx, 'bandpass', 1700, 4), g = gainNode(ctx);
      o.type = 'square';
      o.frequency.setValueAtTime(1700, t);
      perc(g, t, 0.25 * v, 0.03);
      o.connect(f); f.connect(g); g.connect(bus);
      o.start(t); o.stop(t + 0.06);
    },
    keys(bus, t, notes, dur, v = 0.05) {
      const ctx = bus.context;
      const f = filter(ctx, 'lowpass', 2200, 0.5);
      const g = gainNode(ctx);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.01);
      g.gain.setTargetAtTime(v * 0.6, t + 0.01, 0.1);
      g.gain.setTargetAtTime(0, t + dur, 0.08);
      f.connect(g); g.connect(bus);
      for (const m of notes) {
        const o1 = ctx.createOscillator(), o2 = ctx.createOscillator();
        o1.type = 'triangle'; o2.type = 'sine';
        o1.frequency.value = mtof(m); o2.frequency.value = mtof(m); o2.detune.value = 6;
        o1.connect(f); o2.connect(f);
        o1.start(t); o2.start(t);
        o1.stop(t + dur + 0.6); o2.stop(t + dur + 0.6);
      }
    },
    pad(bus, t, notes, dur, v = 0.035) {
      const ctx = bus.context;
      const f = filter(ctx, 'lowpass', 900, 0.7);
      const g = gainNode(ctx);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.4);
      g.gain.setTargetAtTime(0, t + dur, 0.2);
      f.connect(g); g.connect(bus);
      for (const m of notes) {
        for (const det of [-8, 8]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = det;
          o.connect(f); o.start(t); o.stop(t + dur + 1.4);
        }
      }
    },
    bass(bus, t, m, dur, v = 0.2) {
      const ctx = bus.context;
      const g = gainNode(ctx);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(v, t + 0.005);
      g.gain.setTargetAtTime(v * 0.45, t + 0.005, 0.18);
      g.gain.setTargetAtTime(0, t + Math.max(0.02, dur - 0.03), 0.03);
      g.connect(bus);
      const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = gainNode(ctx, 0.15);
      o1.type = 'sine'; o2.type = 'triangle';
      o1.frequency.value = mtof(m); o2.frequency.value = mtof(m);
      o1.connect(g); o2.connect(g2); g2.connect(g);
      o1.start(t); o2.start(t); o1.stop(t + dur + 0.3); o2.stop(t + dur + 0.3);
    },
    sub808(bus, t, m, dur, glideFrom = null, v = 0.55) {
      const ctx = bus.context;
      const o = ctx.createOscillator(), sh = ctx.createWaveShaper(), g = gainNode(ctx);
      o.type = 'sine';
      if (glideFrom != null && glideFrom !== m) {
        o.frequency.setValueAtTime(mtof(glideFrom), t);
        o.frequency.exponentialRampToValueAtTime(mtof(m), t + 0.08);
      } else {
        o.frequency.setValueAtTime(mtof(m), t);
      }
      sh.curve = buffers(ctx).curve;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(v, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(0.1, dur));
      o.connect(sh); sh.connect(g); g.connect(bus);
      o.start(t); o.stop(t + Math.max(0.1, dur) + 0.05);
    },
    bell(bus, t, m, dur, v = 0.12) {
      const ctx = bus.context;
      const len = Math.max(0.4, Math.min(1.2, dur + 0.6));
      for (const [mult, amp] of [[1, 1], [2.76, 0.3], [5.4, 0.1]]) {
        const o = ctx.createOscillator(), g = gainNode(ctx);
        o.type = 'sine'; o.frequency.value = mtof(m) * mult;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(v * amp, t + 0.002);
        g.gain.exponentialRampToValueAtTime(0.0001, t + len);
        o.connect(g); g.connect(bus);
        o.start(t); o.stop(t + len + 0.05);
      }
    },
  };

  // ---------- recording (M7 fills this in) ----------
  // A.startRecording / A.stopRecording go here (BUILD.md section 10).

  window.RBAudio = A; // not `Audio`: that name is the built-in HTMLAudioElement constructor
  window.Instruments = I;
})();
