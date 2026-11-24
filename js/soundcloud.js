/* Rimoboy: SoundCloud beats via the official Widget API (M3a). Spec: BUILD.md section 8A.
   - window.SCW: one shared hidden widget (iframe #scw) + the Bizzle Beats catalogue.
   - window.SCBeat: engine with the same interface as SynthBeat (start/time/setVolume/stop)
     plus pause()/resume(). The clock extrapolates from PLAY_PROGRESS events (performance.now)
     because the widget audio cannot be routed into our AudioContext.
   Measured 2026-11-23: PLAY_PROGRESS fires about every 17 ms; extrapolation drift max 11 ms.
   Playback only starts reliably after a user gesture (otherwise SoundCloud pauses after ~1 s). */
(function () {
  'use strict';

  const PROFILE = 'https://soundcloud.com/bizzlebeats';
  const RESYNC_MS = 120;   // hard re-anchor above this drift
  const STALL_MS = 300;    // no progress for this long = buffering

  const listeners = {};
  const S = {
    state: 'idle',        // idle | loading | ready | error
    error: null,
    tracks: [],
    widget: null,
    currentIndex: -1,
    playing: false,
    lastPos: 0,           // ms, from the last PLAY_PROGRESS
    lastProgPerf: 0,      // performance.now() of that event
    expectPause: false,
    pausePending: false,  // pause() sent, PAUSE event not received yet
    playGen: 0,           // bumps on every play(); older play() calls reject 'superseded'
    owner: null,          // the SCBeat that started the current playback
    on(evt, fn) { (listeners[evt] = listeners[evt] || []).push(fn); return () => S.off(evt, fn); },
    off(evt, fn) { listeners[evt] = (listeners[evt] || []).filter((f) => f !== fn); },
    emit(evt, data) { for (const fn of (listeners[evt] || []).slice()) fn(data); },
  };

  const toTracks = (list) => list.map((s, index) => s && s.title ? {
    index,
    id: s.id,
    slug: slugOf(s.permalink_url),
    title: s.title,
    url: s.permalink_url,
    artwork: art(s.artwork_url || (s.user && s.user.avatar_url)),
    durationMs: s.duration || 0,
    genre: s.genre || '',
    waveformUrl: s.waveform_url || null,
  } : null).filter(Boolean);
  const slugOf = (url) => (url || '').replace(/\/+$/, '').split('/').pop();
  const art = (url) => (url ? url.replace('-large.', '-t200x200.') : null);

  function waitFor(evt, test, timeoutMs) {
    return new Promise((resolve, reject) => {
      const to = setTimeout(() => { off(); reject(new Error('timeout:' + evt)); }, timeoutMs);
      const off = S.on(evt, (d) => { if (!test || test(d)) { clearTimeout(to); off(); resolve(d); } });
    });
  }

  let loadPromise = null;
  S.load = function () {
    if (loadPromise) return loadPromise;
    loadPromise = new Promise((resolve, reject) => {
      const fail = (code) => { S.state = 'error'; S.error = code; loadPromise = null; S.emit('state', S.state); reject(new Error(code)); };
      // `?offline` in the URL simulates no internet (for testing the fallback)
      if (!navigator.onLine || /[?&]offline\b/.test(location.search)) return fail('offline');
      if (!window.SC || !window.SC.Widget) return fail('no-api');
      S.state = 'loading'; S.emit('state', S.state);

      const iframe = document.getElementById('scw');
      iframe.src = 'https://w.soundcloud.com/player/?url=' + encodeURIComponent(PROFILE)
        + '&auto_play=false&visual=false&show_artwork=false&buying=false&sharing=false'
        + '&download=false&show_comments=false&show_playcount=false&show_user=false';
      const w = window.SC.Widget(iframe);
      S.widget = w;
      const E = window.SC.Widget.Events;
      const timeout = setTimeout(() => fail('timeout'), 15000);

      // NOTE: seekTo() while paused also fires PLAY_PROGRESS, so `playing` comes only
      // from PLAY/PAUSE events, never from progress.
      w.bind(E.PLAY_PROGRESS, (e) => {
        S.lastPos = e.currentPosition; S.lastProgPerf = performance.now();
        S.emit('progress', e.currentPosition);
      });
      w.bind(E.PLAY, () => { S.playing = true; S.emit('play'); });
      w.bind(E.PAUSE, () => {
        S.playing = false;
        S.pausePending = false;
        if (S.expectPause) S.expectPause = false; else S.emit('externalPause');
        S.emit('pause');
      });
      w.bind(E.FINISH, () => { S.playing = false; S.expectPause = false; S.pausePending = false; S.emit('finish'); });
      w.bind(E.ERROR, () => S.emit('error'));

      let ready = false;
      w.bind(E.READY, () => {
        if (ready) return; // READY can fire again; the catalogue is loaded once
        ready = true;
        let tries = 0;
        const poll = () => w.getSounds((list) => {
          const named = list.filter((s) => s && s.title);
          if ((named.length < list.length || !list.length) && ++tries < 12) return setTimeout(poll, 700);
          clearTimeout(timeout);
          S.tracks = toTracks(list);
          S.state = 'ready'; S.emit('state', S.state);
          resolve(S.tracks);
          S.analyzeAll();
          // the widget pages in more of the profile later (11 at first, 21 a bit later)
          let more = 0;
          const again = () => w.getSounds((l2) => {
            const t2 = toTracks(l2);
            if (t2.length > S.tracks.length) {
              const known = new Set(S.tracks.map((t) => t.slug));
              for (const t of t2) if (!known.has(t.slug)) S.tracks.push(t);
              S.emit('tracks', S.tracks);
              S.analyzeAll();
            }
            if (++more < 6) setTimeout(again, 2500);
          });
          setTimeout(again, 2500);
        });
        poll();
      });
    });
    return loadPromise;
  };

  // Plays track `index` from `fromMs`. Resolves once progress near fromMs arrives.
  // Call it from a click handler chain (user gesture), see the header note.
  S.play = async function (index, fromMs = 0) {
    const w = S.widget;
    if (!w) throw new Error('not-loaded');
    const gen = ++S.playGen;
    const check = () => { if (gen !== S.playGen) throw new Error('superseded'); };
    // a pause() sent just before (stop of the previous game) still has its PAUSE event in
    // flight: S.playing is stale then, so keep expectPause and always send play()
    const pending = S.pausePending;
    if (!pending) S.expectPause = false;
    if (S.currentIndex !== index) {
      const started = waitFor('play', null, 8000);
      w.skip(index); // skip() loads the track and starts it from 0
      S.currentIndex = index;
      await started;
      check();
    }
    const playing = S.playing && !S.pausePending;
    if (!(playing && fromMs < 300 && S.lastPos < 1500)) w.seekTo(fromMs);
    if (!playing) {
      const started = waitFor('play', null, 8000);
      w.play();
      await started;
      check();
    }
    // resolve on real, advancing playback near the start point
    await waitFor('progress', (pos) => S.playing && pos >= fromMs - 50 && pos < fromMs + 2000, 8000);
    check();
  };
  S.pause = function () {
    if (!S.widget) return;
    if (S.playing) { S.expectPause = true; S.pausePending = true; }
    S.widget.pause();
  };
  S.resume = function () { if (S.widget) { S.expectPause = false; S.widget.play(); } };
  S.setVolume = function (v) { if (S.widget) S.widget.setVolume(Math.round(Math.max(0, Math.min(1, v)) * 100)); };
  // extrapolated song position in ms (for previews and progress bars)
  S.position = function () {
    if (!S.playing) return S.lastPos;
    return S.lastPos + Math.min(performance.now() - S.lastProgPerf, STALL_MS);
  };

  // ---------- automatic analysis (js/drop.js) ----------
  // Results per slug {bpm, dropMs}, kept in localStorage `rb_scAuto` (only numbers, no audio).
  // Bump AUTO_V when the algorithm in drop.js changes, so old results are recomputed.
  const AUTO_V = 1;
  S.auto = {};
  try {
    const saved = JSON.parse(localStorage.getItem('rb_scAuto') || 'null');
    if (saved && saved.v === AUTO_V) S.auto = saved.data || {};
  } catch (e) { /* ignore */ }
  const saveAuto = () => { try { localStorage.setItem('rb_scAuto', JSON.stringify({ v: AUTO_V, data: S.auto })); } catch (e) { /* ignore */ } };

  S.analyze = async function (track) {
    if (S.auto[track.slug]) return S.auto[track.slug];
    if (!window.RBDrop || !track.waveformUrl) throw new Error('no-waveform');
    const samples = await window.RBDrop.fetchWaveform(track.waveformUrl);
    const a = window.RBDrop.analyze(samples, track.durationMs, null);
    S.auto[track.slug] = { bpm: a.bpm, dropMs: a.dropMs };
    saveAuto();
    S.emit('analysis', track.slug);
    return S.auto[track.slug];
  };
  let analyzing = null;
  S.analyzeAll = function () {
    if (analyzing) return analyzing;
    analyzing = (async () => {
      for (let i = 0; i < S.tracks.length; i++) { // the list can grow while this runs
        try { await S.analyze(S.tracks[i]); } catch (e) { /* this track stays manual */ }
      }
      analyzing = null;
    })();
    return analyzing;
  };

  // Tempo for a track. Each field: the user's own value (localStorage rb_scTempo) > the
  // SC_TRACKS table (bpm only) > the automatic analysis.
  //   bpm, bpmSrc ('user'|'table'|'auto'|null)
  //   dropMs  : bar 1 of the rapping (the beat drop), dropSrc ('user'|'auto'|null)
  //   startMs : playback start chosen by the user, or null (= automatic, 2 bars before the count-in)
  S.tempoFor = function (slug) {
    let user = null;
    try { user = (JSON.parse(localStorage.getItem('rb_scTempo') || '{}'))[slug] || null; } catch (e) { /* ignore */ }
    const base = (window.SC_TRACKS || {})[slug] || null;
    const auto = S.auto[slug] || null;
    const u = user || {};
    // older saves used offsetMs for "first downbeat"; it means the same as dropMs here
    const uDrop = u.dropMs != null ? u.dropMs : (u.offsetMs > 0 ? u.offsetMs : null);
    const uStart = u.startMs > 0 ? u.startMs : null;
    let bpm = null, bpmSrc = null;
    if (u.bpm) { bpm = u.bpm; bpmSrc = 'user'; } else if (base && base.bpm) { bpm = base.bpm; bpmSrc = 'table'; } else if (auto && auto.bpm) { bpm = auto.bpm; bpmSrc = 'auto'; }
    let dropMs = null, dropSrc = null;
    // a drop checked by ear (user, then the shared table) always beats the waveform guess
    if (uDrop != null) { dropMs = uDrop; dropSrc = 'user'; } else if (base && base.dropMs != null) { dropMs = base.dropMs; dropSrc = 'table'; } else if (auto) { dropMs = auto.dropMs; dropSrc = 'auto'; }
    if (!bpm && dropMs == null && uStart == null) return null;
    return { bpm, bpmSrc, dropMs, dropSrc, startMs: uStart, verified: !!(base && base.verified), user: !!user, auto };
  };
  // fields: bpm (null = not set by the user), startMs (null = auto), dropMs (null = auto)
  S.saveTempo = function (slug, tempo) {
    try {
      const all = JSON.parse(localStorage.getItem('rb_scTempo') || '{}');
      const rec = { bpm: tempo.bpm || null, startMs: tempo.startMs != null ? tempo.startMs : null, dropMs: tempo.dropMs != null ? tempo.dropMs : null };
      if (!rec.bpm && rec.startMs == null && rec.dropMs == null) delete all[slug]; else all[slug] = rec;
      localStorage.setItem('rb_scTempo', JSON.stringify(all));
    } catch (e) { /* private mode: tempo lives for this session only */ }
  };
  S.clearTempo = function (slug) {
    try {
      const all = JSON.parse(localStorage.getItem('rb_scTempo') || '{}');
      delete all[slug];
      localStorage.setItem('rb_scTempo', JSON.stringify(all));
    } catch (e) { /* ignore */ }
  };

  // ---------- engine ----------
  class SCBeat {
    // track: an entry of SCW.tracks; tempo: from SCW.tempoFor; syncMs: user latency fix.
    // opts.leadMs (game only) = count-in length. Then bar 1 of the rapping lands on the drop:
    // time() = 0 at dropMs − leadMs, and playback starts 2 bars before that (or at the user's
    // start). A drop too close to the song start for the count-in moves on by whole bars.
    // Without opts (menu preview): time() counts from dropMs and playback starts at startMs or 0.
    constructor(track, tempo, syncMs = 0, opts = {}) {
      this.track = track;
      this.tempo = tempo;
      this.syncMs = syncMs;
      this.isSC = true;
      this.running = false;
      this.offs = [];
      const barMs = tempo.bpm ? 240000 / tempo.bpm : 0;
      let drop = tempo.dropMs || 0;
      if (opts.leadMs != null) {
        const lead = opts.leadMs;
        if (barMs) while (drop < lead) drop += barMs;
        this.zeroMs = Math.max(0, drop - lead);
        this.fromMs = tempo.startMs != null ? Math.min(tempo.startMs, this.zeroMs) : Math.max(0, this.zeroMs - 2 * barMs);
      } else {
        this.zeroMs = drop;
        this.fromMs = tempo.startMs || 0;
      }
      this.dropMs = drop;
      this.frozenMs = this.fromMs;
    }
    async start() {
      this.offs.push(S.on('progress', (pos) => this.onProgress(pos)));
      this.offs.push(S.on('externalPause', () => { if (this.running) { this.freeze(); if (this.onExternalPause) this.onExternalPause(); } }));
      S.setVolume(1);
      S.owner = this;
      await S.play(this.track.index, this.fromMs);
      if (this.stopped) throw new Error('stopped');
      this.anchor(S.lastPos, S.lastProgPerf);
      this.running = true;
      return 0; // t0: time() is already relative to the first count-in cell
    }
    anchor(pos, perf) { this.aPos = pos; this.aPerf = perf; }
    onProgress(pos) {
      const perf = S.lastProgPerf;
      if (!this.running) {
        if (this.resuming) { this.anchor(pos, perf); this.running = true; this.resuming = false; }
        return;
      }
      const drift = pos - (this.aPos + (perf - this.aPerf));
      if (Math.abs(drift) > RESYNC_MS) this.anchor(pos, perf);
      else this.aPos += drift * 0.1;
    }
    songMs() {
      if (!this.running) return this.frozenMs;
      const now = performance.now();
      // during a buffering stall, do not run ahead of the last known position
      const sinceProg = now - S.lastProgPerf;
      if (sinceProg > STALL_MS) return S.lastPos + STALL_MS;
      return this.aPos + (now - this.aPerf);
    }
    stalled() { return this.running && performance.now() - S.lastProgPerf > STALL_MS; }
    time() { return (this.songMs() - this.zeroMs - this.syncMs) / 1000; }
    freeze() { this.frozenMs = this.songMs(); this.running = false; }
    pause() { this.freeze(); S.pause(); }
    resume() { this.resuming = true; S.resume(); }
    setVolume(v) { S.setVolume(v); }
    stop() {
      this.running = false;
      this.resuming = false;
      this.stopped = true;
      for (const off of this.offs) off();
      this.offs = [];
      // a stale engine must not pause a newer engine's playback
      if (S.owner === this) { S.owner = null; S.pause(); }
    }
  }

  window.SCW = S;
  window.SCBeat = SCBeat;
})();
