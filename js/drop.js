/* Rimoboy: beat-drop + tempo analysis of SoundCloud waveform data.
   The SoundCloud widget audio is cross-origin, so Web Audio cannot read it. SoundCloud
   publishes a public waveform summary per track (waveform_url → JSON, ~1800 peak values over
   the whole track, about 50–130 ms per value). That is not audio: we only read the envelope.

   RBDrop.analyze(samples, durationMs, bpmHint?) →
     { bpm, bpmScore, barMs, dropMs, introMs, intro, level, bins, binMs }
     bpm      : given hint, or the estimate from the envelope (autocorrelation, 70–160 BPM;
                matched 5 of the 6 reference BPMs exactly, the 6th by 1 BPM)
     dropMs   : where the full beat comes in = bar 1 of the rapping (0 when there is no intro)
     introMs  : coarse drop time (4 s windows), for debugging
   Tried and dropped: folding the envelope to find the downbeat phase (did not line up with
   the drops) and a rhythmic-pulse feature (too noisy at ~90 ms per value).
   RBDrop.fetchWaveform(url) → Promise<samples[]> (url = the track's waveform_url) */
(function () {
  'use strict';

  const mean = (a, i0, i1) => {
    i0 = Math.max(0, Math.floor(i0)); i1 = Math.min(a.length, Math.floor(i1));
    if (i1 <= i0) return 0;
    let s = 0; for (let i = i0; i < i1; i++) s += a[i];
    return s / (i1 - i0);
  };
  const median = (arr) => { const s = arr.slice().sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
  // linear interpolation of a[] at a float index
  const at = (a, x) => {
    const i = Math.floor(x), f = x - i;
    if (i < 0 || i + 1 >= a.length) return 0;
    return a[i] * (1 - f) + a[i + 1] * f;
  };

  // envelope minus its 2-second moving average: keeps the rhythmic pulses only
  function detrend(e, dt) {
    const w = Math.max(3, Math.round(2 / dt)), out = new Array(e.length);
    let s = 0;
    const pre = [0];
    for (let i = 0; i < e.length; i++) { s += e[i]; pre.push(s); }
    for (let i = 0; i < e.length; i++) {
      const a = Math.max(0, i - w), b = Math.min(e.length, i + w + 1);
      out[i] = e[i] - (pre[b] - pre[a]) / (b - a);
    }
    return out;
  }

  // autocorrelation comb over many beats: long lags give a precise tempo despite coarse bins
  function estimateBpm(d, dt, i0, i1) {
    const seg = d.slice(i0, i1);
    const n = seg.length;
    const r = (lag) => { // normalised autocorrelation at a float lag (in bins)
      let s = 0, c = 0;
      for (let i = 0; i + lag + 1 < n; i++) { s += seg[i] * at(seg, i + lag); c++; }
      return c ? s / c : 0;
    };
    let best = { bpm: null, score: -Infinity };
    const scores = [];
    for (let bpm = 70; bpm <= 160; bpm += 0.25) {
      const beatBins = 60 / bpm / dt;
      let s = 0, k = 0;
      for (let m = 1; m <= 32; m++) { const lag = m * beatBins; if (lag > n / 2) break; s += r(lag) * (m % 4 === 0 ? 1.5 : 1); k++; }
      s = k ? s / k : 0;
      scores.push([bpm, s]);
      if (s > best.score) best = { bpm, score: s };
    }
    // half/double tempo: prefer the faster one when it scores almost as well (rap beats 80–150)
    const sc = (b) => { const x = scores.find((p) => Math.abs(p[0] - b) < 0.13); return x ? x[1] : -Infinity; };
    if (best.bpm < 80 && sc(Math.round(best.bpm * 8) / 4) > 0.8 * best.score) best = { bpm: Math.round(best.bpm * 8) / 4, score: sc(Math.round(best.bpm * 8) / 4) };
    return best;
  }

  function analyze(samples, durationMs, bpmHint) {
    const e = samples.map(Number);
    const n = e.length;
    const dur = durationMs / 1000, dt = dur / n;
    const sec = (s) => s / dt; // seconds → bins

    // body level of the track = median 1-second level in its middle part
    const ones = [];
    for (let t = dur * 0.2; t < dur * 0.8; t += 1) ones.push(mean(e, sec(t), sec(t + 1)));
    const level = median(ones);

    // "the beat is fully in" score = loudness relative to the body (about 1 in the body).
    // (A rhythmic-pulse feature was tried; at ~90 ms per value it was too noisy.)
    const full = (a, b) => mean(e, a, b) / level;

    // coarse drop: the earliest clearly big rise (4 s windows) in the first 45%
    const W = 4, limit = Math.min(dur * 0.45, 70);
    const rises = [];
    let bestRise = 0;
    for (let t = 2; t < limit; t += 0.25) {
      const after = full(sec(t), sec(t + W));
      const rise = after - full(sec(t - W), sec(t));
      rises.push([t, rise, after]);
      if (rise > bestRise) bestRise = rise;
    }
    // later rises are usually a break ending, not the first drop
    let coarse = 0, intro = true;
    const big = rises.filter(([, r, a]) => r >= Math.max(0.6 * bestRise, 0.08) && a >= 0.8);
    if (big.length) {
      // walk to the local maximum of this rise (the windows peak at the jump itself)
      let k = rises.indexOf(big[0]);
      while (k + 1 < rises.length && rises[k + 1][1] >= rises[k][1]) k++;
      coarse = rises[k][0];
    } else { intro = false; }

    // fine onset: the biggest short step (about 0.45 s each side) within 1.5 s of the coarse
    // time. A drop lands on a downbeat, so this onset is bar 1. Precision is about one value.
    let drop = 0;
    if (intro) {
      const h = Math.max(2, Math.round(0.45 / dt));
      let best = -Infinity;
      for (let i = Math.floor(sec(coarse - 1.5)); i < sec(coarse + 1.5); i++) {
        if (i - h < 0 || i + h > n) continue;
        const r = mean(e, i, i + h) - mean(e, i - h, i);
        if (r > best) { best = r; drop = i * dt; }
      }
    }

    // tempo from the full part after the drop
    const d = detrend(e, dt);
    const i0 = Math.floor(sec(drop + 1)), i1 = Math.min(n, Math.floor(sec(Math.min(dur - 5, drop + 90))));
    let bpm = bpmHint || null, bpmScore = null;
    if (!bpm) { const b = estimateBpm(d, dt, i0, i1); bpm = b.bpm; bpmScore = b.score; }
    return {
      bpm, bpmScore, barMs: (240 / bpm) * 1000,
      dropMs: Math.round(drop * 1000), introMs: Math.round(coarse * 1000), intro, level, bins: n, binMs: dt * 1000,
    };
  }

  const cache = {};
  function fetchWaveform(url) {
    if (!url) return Promise.reject(new Error('no-waveform'));
    const json = url.replace(/\.png(\?.*)?$/, '.json');
    if (!cache[json]) {
      cache[json] = fetch(json).then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
        .then((j) => j.samples)
        .catch((err) => { delete cache[json]; throw err; });
    }
    return cache[json];
  }

  window.RBDrop = { analyze, fetchWaveform };
})();
