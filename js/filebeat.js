/* Rimoboy: the user's own audio file as a beat (M7). Spec: BUILD.md section 8.6.
   FileBeat(buffer, bpm, offsetSec, opts) has the engine interface of SynthBeat:
     start(when[, ctx, dest]) → t0, time(), setVolume(v, ramp), stop(fade)
   Pause = ctx.suspend() (game.js), like the synth.
   Timing: offsetSec = the first downbeat in the file ("Начало"). Bar 1 of the rapping starts
   there, like the drop of a SoundCloud beat, and the count-in (opts.leadSec) plays just
   before it. When the file has less than a count-in before that downbeat, bar 1 moves on by
   whole bars, so the grid stays on the beat and the count-in never starts before 0:00.
   RBFile.envelope(buffer, bins) → peak values for RBDrop.analyze (BPM + downbeat guess).
   Loads after audio.js. */
(function () {
  'use strict';
  const A = window.RBAudio;

  class FileBeat {
    constructor(buffer, bpm, offsetSec, opts = {}) {
      this.buffer = buffer;
      this.bpm = bpm;
      this.leadSec = Math.max(0, opts.leadSec || 0);
      this.barSec = 240 / bpm;
      // a negative start (sync slider) keeps its bar phase: the next grid point at or after 0
      const off = offsetSec || 0;
      this.offset = off >= 0 ? off : ((off % this.barSec) + this.barSec) % this.barSec;
      // bar 1 of the rapping (file seconds)
      let rap = this.offset;
      if (rap < this.leadSec) rap += Math.ceil((this.leadSec - rap) / this.barSec - 1e-9) * this.barSec;
      this.rapStart = rap;
      this.fileStart = Math.max(0, rap - this.leadSec); // file position of the first count-in cell
      // preview only: play from this file position (time() then counts from there)
      if (opts.fromSec != null) this.fileStart = Math.max(0, Math.min(buffer.duration, opts.fromSec));
      this.isFile = true;
    }
    // seconds of music after bar 1 (game.js barsFor uses it for "Цялата песен")
    get afterRap() { return Math.max(0, this.buffer.duration - this.rapStart); }

    start(when, ctx = A.ctx, dest = A.master) {
      this.ctx = ctx;
      this.out = ctx.createGain();
      this.out.gain.value = 0.9;
      this.out.connect(dest);
      const src = ctx.createBufferSource();
      src.buffer = this.buffer;
      src.connect(this.out);
      src.start(when, this.fileStart);
      this.src = src;
      this.t0 = when;
      return when;
    }
    // seconds since the first count-in cell, corrected for output latency
    time() { return this.ctx.currentTime - A.latency() - this.t0; }
    // file position (seconds) that the listener hears now
    position() { return this.fileStart + Math.max(0, this.time()); }
    get ended() { return this.position() >= this.buffer.duration; }
    setVolume(v, ramp = 0.3) {
      if (!this.out) return;
      const g = this.out.gain, now = this.ctx.currentTime;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(0.9 * v, now + ramp);
    }
    stop(fade = 0.4) {
      if (!this.out) return;
      const out = this.out, src = this.src;
      this.setVolume(0, fade);
      setTimeout(() => { try { src.stop(); out.disconnect(); } catch (e) { /* already gone */ } }, fade * 1000 + 300);
      this.out = null;
    }
  }

  // peak envelope of a decoded file: `bins` values of the max |sample| (all channels)
  function envelope(buffer, bins = 1800) {
    const n = buffer.length, per = Math.max(1, Math.floor(n / bins));
    const chans = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) chans.push(buffer.getChannelData(c));
    const out = new Array(Math.ceil(n / per)).fill(0);
    for (let b = 0; b < out.length; b++) {
      let m = 0;
      const i1 = Math.min(n, (b + 1) * per);
      for (const d of chans) for (let i = b * per; i < i1; i += 4) { const v = Math.abs(d[i]); if (v > m) m = v; }
      out[b] = m;
    }
    return out;
  }

  window.FileBeat = FileBeat;
  window.RBFile = { envelope };
})();
