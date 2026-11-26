/* Rimoboy: menu beat panel (M3a). Tabs (Bizzle Beats / Вградени / Твой файл), search,
   beat list, "ТВОЯТ БИЙТ" preview card, tempo box with tap tempo, sync slider.
   Exposes window.RB.beats for the game (M5):
     current()     → { src, title, meta, cover, emoji, link, bpm, durationSec, ready, reason }
     makeEngine()  → SynthBeat | SCBeat | FileBeat (own file, M7)
     stopPreview()
   Loads after app.js (needs window.RB). */
(function () {
  'use strict';
  const { $, store, toast } = window.RB;
  const A = window.RBAudio, SCW = window.SCW;

  const listEl = $('#beatList');
  const tempoBox = $('#tempoBox');

  const saved = store.get('rb_beatSel', null);
  const state = {
    src: saved && saved.src ? saved.src : 'sc',
    sel: saved || { src: 'synth', id: window.BEATS[0].id }, // what is selected (may be another tab)
    query: '',
    preview: null,      // running engine for preview
    raf: 0,
  };
  let sync = store.get('rb_sync', 0);

  // favourites (M8): rb_favs = ["synth:<id>", "sc:<slug>"]; starred beats come first
  const favsRaw = store.get('rb_favs', []);
  const favs = new Set(Array.isArray(favsRaw) ? favsRaw.filter((x) => typeof x === 'string') : []);
  const favKey = (src, id) => `${src}:${id}`;
  const isFav = (src, id) => favs.has(favKey(src, id));
  const favFirst = (items, src, idOf) => {
    const on = [], off = [];
    for (const it of items) (isFav(src, idOf(it)) ? on : off).push(it);
    return on.concat(off);
  };
  function toggleFav(src, id) {
    const k = favKey(src, id);
    if (favs.has(k)) favs.delete(k); else favs.add(k);
    store.set('rb_favs', [...favs]);
    renderList(); // keeps the focus on the star
  }

  // own file (M7): the decoded AudioBuffer lives in memory only; rb_fileBeat keeps
  // {name, bpm, offset}. guess = the values come from the automatic analysis.
  const fileSaved = store.get('rb_fileBeat', null) || {};
  const file = {
    buffer: null,
    name: typeof fileSaved.name === 'string' ? fileSaved.name : null,
    bpm: Number.isFinite(fileSaved.bpm) ? fileSaved.bpm : null,
    offset: Number.isFinite(fileSaved.offset) && fileSaved.offset >= 0 ? fileSaved.offset : 0,
    guess: !!fileSaved.guess,
    loading: false,
  };
  const FILE_COVER = '#9d8bff';
  const fileOk = () => !!file.buffer && file.bpm >= 60 && file.bpm <= 200;
  const saveFile = () => store.set('rb_fileBeat', { name: file.name, bpm: file.bpm, offset: file.offset, guess: file.guess });
  const round2 = (x) => Math.round(x * 100) / 100;
  const fileMeta = () => `Твой файл · ${fileOk() ? `${file.guess ? '~' : ''}${round2(file.bpm)} BPM` : 'темпо?'}`;

  const fmt = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // a URL inside CSS url('…'): percent-encode the characters that could end the string
  const cssUrl = (u) => String(u).replace(/['"\\()\s]/g, (c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'));

  // ---------- current selection ----------
  function scTrack(slug) { return SCW.tracks.find((t) => t.slug === slug) || null; }

  function current() {
    const sel = state.sel;
    if (sel.src === 'synth') {
      const d = window.BEATS.byId(sel.id);
      return { src: 'synth', id: d.id, title: d.title, meta: `Римобой · ${d.bpm} BPM · ${d.genre}`,
        cover: d.cover, emoji: d.emoji, bpm: d.bpm, durationSec: null, ready: true, def: d };
    }
    if (sel.src === 'sc') {
      const t = scTrack(sel.id);
      if (!t) return { src: 'sc', id: sel.id, title: 'Bizzle Beats', meta: 'Зарежда се…', ready: false, reason: 'Бийтовете от SoundCloud още се зареждат.' };
      const tempo = SCW.tempoFor(t.slug);
      const bpm = tempo && tempo.bpm;
      return { src: 'sc', id: t.slug, title: t.title,
        meta: `Bizzle Beats · ${bpm ? bpmText(tempo) : 'темпо?'}${t.genre ? ' · ' + t.genre : ''}`,
        cover: null, artwork: t.artwork, emoji: '🎧', link: t.url, bpm: bpm || null,
        durationSec: (((tempo && tempo.endMs) || t.durationMs) - ((tempo && tempo.dropMs) || 0)) / 1000,
        ready: !!bpm, reason: bpm ? null : 'Задай темпото (BPM) на този бийт: тапни в ритъм.',
        track: t, tempo };
    }
    // own file
    if (!file.buffer) {
      return { src: 'file', id: 'file', title: file.name || 'Твой файл', cover: FILE_COVER, emoji: '📁',
        meta: file.name ? 'Зареди файла отново' : 'Зареди аудио файл', bpm: null, durationSec: null, ready: false,
        reason: file.name ? 'Зареди файла отново в „Твой файл“: след презареждане браузърът го забравя.' : 'Зареди аудио файл в „Твой файл“.' };
    }
    const ok = fileOk();
    return { src: 'file', id: 'file', title: file.name, cover: FILE_COVER, emoji: '📁',
      meta: fileMeta(),
      bpm: ok ? file.bpm : null, durationSec: Math.max(0, file.buffer.duration - file.offset),
      ready: ok, reason: ok ? null : 'Задай темпото на файла (BPM 60–200): тапни в ритъм.',
      buffer: file.buffer, offset: file.offset };
  }

  // "~90 BPM" = a guess (waveform fallback, or a measurement the analysis flagged); measured
  // and user values have no "~"
  const bpmText = (tempo) => {
    const sure = tempo.bpmSrc === 'user' || tempo.verified || (tempo.bpmSrc === 'table' && !tempo.check);
    return `${sure ? '' : '~'}${Math.round(tempo.bpm * 10) / 10} BPM`;
  };

  // opts.leadMs (game): count-in length, so that bar 1 lands on the beat drop (SCBeat)
  function makeEngine(opts) {
    const c = current();
    if (c.src === 'synth') return new window.SynthBeat(c.def);
    if (c.src === 'sc') return new window.SCBeat(c.track, c.tempo, sync, opts || {});
    if (c.src === 'file' && c.ready) {
      // the sync slider works for files too (negative = ball earlier)
      return new window.FileBeat(c.buffer, c.bpm, c.offset + sync / 1000, { leadSec: ((opts && opts.leadMs) || 0) / 1000 });
    }
    return null;
  }

  // ---------- rendering ----------
  function setTab(src) {
    state.src = src;
    document.querySelectorAll('#beatPanel .tab').forEach((t) => t.classList.toggle('active', t.dataset.src === src));
    $('#beatSearch').classList.toggle('hidden', src !== 'sc');
    renderList();
    if (src === 'sc' && SCW.state === 'idle') loadSC();
  }

  function rowHTML(id, title, meta, coverStyle, coverText, badge, favSrc) {
    const sel = state.sel.id === id ? ' sel' : '';
    const fav = favSrc ? isFav(favSrc, id) : false;
    const favLabel = fav ? 'Махни от любими' : 'Добави в любими';
    const star = favSrc ? `<button class="fav${fav ? ' on' : ''}" aria-pressed="${fav}" aria-label="${favLabel}" title="${favLabel}">${fav ? '★' : '☆'}</button>` : '';
    return `<li data-id="${esc(id)}" class="${sel}" tabindex="0">
      <div class="cover" style="${coverStyle}">${coverText}</div>
      <div class="beat-info"><div class="beat-title">${esc(title)}${badge ? `<span class="badge">${badge}</span>` : ''}</div>
      <div class="beat-meta">${esc(meta)}</div></div>${star}</li>`;
  }

  // every re-render (also the background ones: SoundCloud 'tracks' / 'analysis' events)
  // keeps the keyboard focus on the same row, or on its star
  function renderList() {
    const a = document.activeElement;
    const li = a && listEl.contains(a) ? a.closest('li[data-id]') : null;
    const keep = li ? { id: li.dataset.id, fav: !!a.closest('.fav') } : null;
    renderListHTML();
    if (!keep) return;
    const again = [...listEl.querySelectorAll('li[data-id]')].find((x) => x.dataset.id === keep.id);
    const target = again && (keep.fav ? again.querySelector('.fav') : again);
    if (target) target.focus({ preventScroll: true });
  }

  function renderListHTML() {
    if (state.src === 'synth') {
      listEl.innerHTML = favFirst(window.BEATS, 'synth', (d) => d.id).map((d) => rowHTML(d.id, d.title, `Римобой · ${d.bpm} BPM · ${d.genre}`,
        `background:${d.cover}`, d.emoji, '', 'synth')).join('');
    } else if (state.src === 'sc') {
      if (SCW.state === 'loading' || SCW.state === 'idle') {
        listEl.innerHTML = '<li class="list-state">Зареждам бийтовете от SoundCloud…</li>';
      } else if (SCW.state === 'error') {
        listEl.innerHTML = `<li class="list-state">SoundCloud не се зареди (${SCW.error === 'offline' ? 'няма интернет' : 'грешка'}).<br>
          <button class="btn-ghost" id="scRetry" style="margin-top:8px">Опитай пак</button></li>`;
      } else {
        const q = state.query.trim().toLowerCase();
        const items = favFirst(SCW.tracks.filter((t) => !q || t.title.toLowerCase().includes(q)), 'sc', (t) => t.slug);
        listEl.innerHTML = items.length ? items.map((t) => {
          const tempo = SCW.tempoFor(t.slug);
          const bpm = tempo && tempo.bpm;
          const meta = `Bizzle Beats · ${bpm ? bpmText(tempo) : fmt(t.durationMs / 1000)}${t.genre ? ' · ' + t.genre : ''}`;
          const cov = t.artwork ? `background-image:url('${esc(cssUrl(t.artwork))}')` : 'background:#ff7a45';
          return rowHTML(t.slug, t.title, meta, cov, t.artwork ? '' : '🎧', bpm ? '' : 'Настрой темпо', 'sc');
        }).join('') : '<li class="list-state">Няма такъв бийт.</li>';
      }
    } else {
      const cov = `background:${FILE_COVER}`;
      let html = '';
      if (file.loading) html += '<li class="list-state">Чета файла…</li>';
      else if (file.buffer) {
        html += rowHTML('file', file.name, `${fileMeta()} · ${fmt(file.buffer.duration)}`, cov, '📁', fileOk() ? '' : 'Настрой темпо');
      } else if (file.name) {
        html += rowHTML('__load', 'Зареди файла отново', file.name, cov, '📁');
      }
      if (!file.loading && (file.buffer || !file.name)) {
        html += rowHTML('__load', '＋ Твой бийт', 'MP3, WAV, M4A… от устройството', 'background:var(--panel-2)', '＋');
      }
      listEl.innerHTML = html;
    }
  }

  function renderNow() {
    const c = current();
    const cov = $('#nowCover');
    cov.style.background = c.artwork ? `center/cover url('${c.artwork}')` : (c.cover || '');
    cov.textContent = c.artwork ? '' : (c.emoji || '🎧');
    $('#nowTitle').textContent = c.title;
    $('#nowMeta').textContent = c.meta;
    const link = $('#nowLink');
    link.classList.toggle('hidden', !c.link);
    if (c.link) link.href = c.link;
    $('#nowDur').textContent = c.src === 'sc' && c.track ? fmt(c.track.durationMs / 1000)
      : c.src === 'file' && file.buffer ? fmt(file.buffer.duration) : '';
    $('#recNote').classList.toggle('hidden', !(c.src === 'sc' && $('#recBtn').getAttribute('aria-pressed') === 'true'));
    renderTempoBox(c);
    renderFileBox(c);
  }

  function renderFileBox(c) {
    const show = c.src === 'file' && !!file.buffer;
    $('#fileBox').classList.toggle('hidden', !show);
    if (!show) return;
    if (document.activeElement !== $('#fileBpm')) $('#fileBpm').value = file.bpm ? round2(file.bpm) : '';
    if (document.activeElement !== $('#fileOffset')) $('#fileOffset').value = file.offset.toFixed(2);
    $('#fileAuto').textContent = file.guess
      ? `Предположение от файла: ~${round2(file.bpm)} BPM, начало ${file.offset.toFixed(2)} с. Може да греши: чуй началото или тапни.`
      : '';
  }

  function renderTempoBox(c) {
    const show = c.src === 'sc' && !!c.track;
    tempoBox.classList.toggle('hidden', !show);
    if (!show) return;
    const t = c.tempo || { bpm: null, startMs: null, dropMs: null };
    if (document.activeElement !== $('#bpmInput')) $('#bpmInput').value = t.bpm ? Math.round(t.bpm * 100) / 100 : '';
    if (document.activeElement !== $('#startInput')) $('#startInput').value = t.startMs != null ? (t.startMs / 1000).toFixed(2) : '';
    if (document.activeElement !== $('#offsetInput')) $('#offsetInput').value = t.dropMs != null ? (t.dropMs / 1000).toFixed(2) : '';
    const a = t.auto, b = t.base;
    const mine = t.dropSrc === 'user' || t.bpmSrc === 'user' || t.startMs != null ? ' Сега ползваш твои стойности.' : '';
    $('#tempoAuto').textContent = t.measured
      ? `Измерено от аудиото: ${Math.round(b.bpm * 100) / 100} BPM, дроп ${(b.dropMs / 1000).toFixed(2)} с.`
        + (t.check ? ' Анализът не е напълно сигурен: чуй дропа и тапни, ако не съвпада.' : '') + mine
      : a
        ? `Предположение от вълната: дроп ~${(a.dropMs / 1000).toFixed(2)} с, ~${Math.round(a.bpm * 10) / 10} BPM. Може да греши: провери с „Чуй дропа“.` + mine
        : (SCW.state === 'ready' ? 'Анализирам вълната на песента…' : '');
    $('#tempoAutoBtn').classList.toggle('hidden', !t.user);
    $('#tempoAutoBtn').textContent = t.measured ? 'Върни измерените' : 'Върни автоматичните';
  }

  // ---------- preview ----------
  function stopPreview() {
    if (state.preview) state.preview.stop(0.25);
    state.preview = null;
    cancelAnimationFrame(state.raf);
    $('#previewBtn').textContent = '▶';
    $('#nowProg').style.width = '0';
    $('#nowPos').textContent = '0:00';
  }

  // fromMs (SoundCloud only): play from this song position instead of the start
  async function startPreview(fromMs) {
    const c = current();
    stopPreview();
    if (c.src === 'synth') {
      A.ensure();
      const eng = new window.SynthBeat(c.def);
      eng.start(A.ctx.currentTime + 0.05);
      state.preview = eng;
    } else if (c.src === 'sc' && c.track) {
      // preview plays the track from its start point; the tempo is not needed to listen
      const base = c.tempo || { bpm: null, startMs: null, dropMs: null };
      const eng = new window.SCBeat(c.track, fromMs != null ? Object.assign({}, base, { startMs: fromMs }) : base, 0);
      state.preview = eng;
      $('#previewBtn').textContent = '…';
      eng.onExternalPause = () => { if (state.preview === eng) stopPreview(); };
      try { await eng.start(); } catch (e) {
        if (state.preview === eng) { stopPreview(); toast('Бийтът не тръгна. Натисни ▶ още веднъж.'); }
        return;
      }
      if (state.preview !== eng) return;
    } else if (c.src === 'file' && file.buffer) {
      A.ensure();
      const eng = new window.FileBeat(file.buffer, file.bpm || 120, 0, { fromSec: fromMs != null ? fromMs / 1000 : 0 });
      eng.start(A.ctx.currentTime + 0.05);
      state.preview = eng;
    } else {
      return;
    }
    $('#previewBtn').textContent = '❚❚';
    const eng = state.preview;
    const loop = () => {
      if (state.preview !== eng) return;
      if (eng.isSC) {
        const pos = window.SCW.position() / 1000, dur = c.track.durationMs / 1000;
        $('#nowPos').textContent = fmt(pos);
        $('#nowProg').style.width = `${Math.min(100, (pos / dur) * 100)}%`;
      } else if (eng.isFile) {
        const pos = eng.position(), dur = eng.buffer.duration;
        if (pos >= dur) { stopPreview(); return; }
        $('#nowPos').textContent = fmt(pos);
        $('#nowProg').style.width = `${Math.min(100, (pos / dur) * 100)}%`;
      } else {
        const barSec = (60 / c.bpm) * 4, t = Math.max(0, eng.time());
        $('#nowPos').textContent = `Бар ${Math.floor(t / barSec) + 1}`;
        $('#nowProg').style.width = `${((t % (barSec * 4)) / (barSec * 4)) * 100}%`;
      }
      state.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  function select(src, id, play = true) {
    state.sel = { src, id };
    store.set('rb_beatSel', state.sel);
    renderList();
    renderNow();
    if (play) startPreview();
  }

  // ---------- SoundCloud loading ----------
  function loadSC() {
    renderList();
    SCW.load().then(() => {
      renderList();
      renderNow();
    }).catch(() => {
      renderList();
      if (state.src === 'sc') {
        toast(SCW.error === 'offline' ? 'Няма интернет: ползвай вградените бийтове.' : 'SoundCloud не се зареди: ползвай вградените бийтове.', 4000);
        if (state.sel.src === 'sc') select('synth', window.BEATS[0].id, false);
        setTab('synth');
      }
    });
  }

  // ---------- tempo box ----------
  function saveTempoFromInputs() {
    const c = current();
    if (c.src !== 'sc' || !c.track) return;
    // only fields that differ from the measured / automatic values are stored as the user's own
    const auto = (c.tempo && c.tempo.auto) || {};
    const table = (window.SC_TRACKS || {})[c.track.slug] || {};
    const baseDrop = table.dropMs != null ? table.dropMs : auto.dropMs;
    const num = (sel) => { const v = parseFloat($(sel).value); return Number.isFinite(v) ? v : null; };
    let bpm = num('#bpmInput');
    if (!(bpm >= 50 && bpm <= 220)) bpm = null;
    const autoBpm = table.bpm || auto.bpm;
    if (bpm && autoBpm && Math.abs(bpm - autoBpm) < 0.01) bpm = null;
    const st = num('#startInput'), dr = num('#offsetInput');
    const startMs = st != null && st > 0 ? Math.round(st * 1000) : null;
    let dropMs = dr != null && dr >= 0 ? Math.round(dr * 1000) : null;
    // the input shows 10 ms steps, so anything within 10 ms of the base value is the base value
    if (dropMs != null && baseDrop != null && Math.abs(dropMs - baseDrop) <= 10) dropMs = null;
    SCW.saveTempo(c.track.slug, { bpm, startMs, dropMs });
    renderList();
    $('#nowMeta').textContent = current().meta;
  }
  ['#bpmInput', '#startInput', '#offsetInput'].forEach((s) => $(s).addEventListener('change', () => { saveTempoFromInputs(); renderTempoBox(current()); }));
  $('#tempoAutoBtn').addEventListener('click', () => {
    const c = current();
    if (c.src !== 'sc' || !c.track) return;
    SCW.clearTempo(c.track.slug);
    renderList(); renderNow();
    toast(c.tempo && c.tempo.measured ? 'Темпото и дропът са пак измерените.' : 'Темпото и дропът са пак автоматични.');
  });
  // the automatic analysis finishes track by track after the catalogue loads
  let anaTimer = 0;
  SCW.on('tracks', () => { if (state.src === 'sc') renderList(); });
  SCW.on('analysis', () => {
    clearTimeout(anaTimer);
    anaTimer = setTimeout(() => { if (state.src === 'sc') renderList(); renderNow(); }, 150);
  });

  // ---------- tap along: the first tap marks the drop, the next taps the beats ----------
  // The song position of every tap comes from the SoundCloud clock, so the result does not
  // depend on when the preview started. A line fit over all taps (pos = drop + i × beat)
  // gives the drop and the BPM; missed beats are fine (each tap is rounded to its beat).
  // positions: song ms of each tap (first = drop). known: a BPM from the table or the
  // waveform estimate, which is more precise than a few taps; it is kept when the taps agree
  // within 1 BPM, and then only the drop is fitted.
  function fitTaps(positions, known) {
    const iv = [];
    for (let i = 1; i < positions.length; i++) iv.push(positions[i] - positions[i - 1]);
    // beat length from the median interval (a missed beat gives one long interval)
    const sorted = iv.slice().sort((x, y) => x - y);
    let beat = sorted[sorted.length >> 1];
    // a missed beat gives a double interval: estimate from the single-beat intervals only
    const single = sorted.filter((x) => x < 1.5 * sorted[0]);
    if (single.length >= 2) beat = single[single.length >> 1];
    // a known BPM numbers the taps without ambiguity (when the taps roughly agree with it)
    if (known && Math.abs(beat - 60000 / known) < 0.15 * (60000 / known)) beat = 60000 / known;
    const n = positions.length;
    let idx = [];
    // number every tap by its beat, fit the line, renumber with the better beat; repeat
    for (let pass = 0; pass < 4; pass++) {
      const p0 = positions[0];
      idx = positions.map((p) => Math.round((p - p0) / beat));
      const mi = idx.reduce((x, y) => x + y, 0) / n, mp = positions.reduce((x, y) => x + y, 0) / n;
      let sxy = 0, sxx = 0;
      positions.forEach((p, k) => { sxy += (idx[k] - mi) * (p - mp); sxx += (idx[k] - mi) ** 2; });
      if (sxx) beat = sxy / sxx;
    }
    let bpm = 60000 / beat, keptKnown = false;
    if (known && Math.abs(bpm - known) < 1) { bpm = known; beat = 60000 / known; keptKnown = true; }
    // least squares intercept = song position of beat 0 = the drop
    const drop = positions.reduce((x, p, k) => x + (p - idx[k] * beat), 0) / n;
    // uneven taps (or too many skipped beats) → no result rather than a wrong one
    const rms = Math.sqrt(positions.reduce((x, p, k) => x + (p - drop - idx[k] * beat) ** 2, 0) / n);
    const ok = rms < 0.1 * beat && idx[idx.length - 1] >= 3;
    return { bpm, dropMs: Math.max(0, Math.round(drop)), keptKnown, ok, rmsMs: rms };
  }

  let taps = [];
  function tap() {
    const c = current();
    if (c.src === 'file') { tapFile(); return; }
    const btn = $('#tapBtn');
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 90);
    if (c.src !== 'sc' || !c.track) return;
    if (!state.preview || !state.preview.isSC || !SCW.playing) {
      toast('Пусни бийта с ▶ и тапни точно на дропа, после на всеки удар.');
      return;
    }
    const pos = SCW.position(), now = performance.now();
    if (taps.length && now - taps[taps.length - 1].perf > 2000) taps = [];
    taps.push({ pos, perf: now });
    if (taps.length > 64) taps.shift();
    if (taps.length < 4) { btn.textContent = `Тапни дропа и ритъма · ${taps.length}…`; return; }
    const known = (c.tempo && c.tempo.bpmSrc !== 'user' && c.tempo.bpm) || null;
    const { bpm, dropMs, keptKnown, ok } = fitTaps(taps.map((t) => t.pos), known);
    const n = taps.length;
    if (!ok) { btn.textContent = `Тапите са неравни (${n}): тапни пак, без да пропускаш удари`; return; }
    SCW.saveTempo(c.track.slug, {
      bpm: keptKnown ? null : Math.round(bpm * 100) / 100,
      startMs: c.tempo && c.tempo.startMs != null ? c.tempo.startMs : null,
      dropMs,
    });
    btn.textContent = `Дроп ${(dropMs / 1000).toFixed(2)} с · ${Math.round(bpm * 100) / 100} BPM (${n} тапа)`;
    renderList();
    renderNow();
  }
  // own file: the same line fit; the first tap = "Начало" (bar 1), the file clock is exact
  function tapFile() {
    const btn = $('#fileTapBtn');
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 90);
    if (!file.buffer) return;
    if (!state.preview || !state.preview.isFile) {
      toast('Пусни файла с ▶ и тапни на първия удар, после на всеки удар.');
      return;
    }
    const pos = state.preview.position() * 1000, now = performance.now();
    if (taps.length && now - taps[taps.length - 1].perf > 2000) taps = [];
    taps.push({ pos, perf: now });
    if (taps.length > 64) taps.shift();
    if (taps.length < 4) { btn.textContent = `Тапни първия удар и ритъма · ${taps.length}…`; return; }
    const { bpm, dropMs, keptKnown, ok } = fitTaps(taps.map((t) => t.pos), file.guess ? file.bpm : null);
    const n = taps.length;
    if (!ok) { btn.textContent = `Тапите са неравни (${n}): тапни пак, без да пропускаш удари`; return; }
    // taps on every half beat (or every other beat): fold into 60–200
    let bpmF = bpm;
    while (bpmF > 200) bpmF /= 2;
    while (bpmF < 60) bpmF *= 2;
    if (!(bpmF >= 60 && bpmF <= 200)) { btn.textContent = `Темпото ${Math.round(bpm)} BPM е извън 60–200: тапни на всеки удар`; return; }
    if (!keptKnown) file.bpm = round2(bpmF);
    file.offset = dropMs / 1000;
    file.guess = false;
    saveFile();
    btn.textContent = `Начало ${file.offset.toFixed(2)} с · ${round2(file.bpm)} BPM (${n} тапа)`;
    renderList();
    renderNow();
  }
  $('#fileTapBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); tapFile(); });
  $('#fileTapBtn').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); tapFile(); } });

  // pointerdown, not click: a click fires on release, which is late for a tap
  $('#tapBtn').addEventListener('pointerdown', (e) => { e.preventDefault(); tap(); });
  $('#tapBtn').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); tap(); } });
  document.addEventListener('keydown', (e) => {
    if (window.RB.screen !== 'menu' || e.repeat || (e.target.matches && e.target.matches('input, select, textarea'))) return;
    if (e.code === 'KeyT') { // physical T key = tap (works on Bulgarian layouts too)
      if (!tempoBox.classList.contains('hidden')) tempoBox.open = true; // show the counter while tapping
      tap();
    }
  });

  // listen from 4 s before the drop, to check it by ear
  $('#dropPlayBtn').addEventListener('click', () => {
    const c = current();
    if (c.src !== 'sc' || !c.track || !c.tempo) return;
    taps = [];
    startPreview(Math.max(0, (c.tempo.dropMs || 0) - 4000));
  });

  // copy the user's own values (to put them into js/sc-tracks.js for every player)
  $('#tempoExportBtn').addEventListener('click', async () => {
    let all = {};
    try { all = JSON.parse(localStorage.getItem('rb_scTempo') || '{}'); } catch (e) { /* ignore */ }
    const out = {};
    for (const [slug, v] of Object.entries(all)) {
      const t = SCW.tracks.find((x) => x.slug === slug);
      out[slug] = Object.assign({ title: t ? t.title : slug }, v);
    }
    const text = JSON.stringify(out, null, 1);
    try { await navigator.clipboard.writeText(text); toast(`Копирани настройки за ${Object.keys(out).length} бийта.`); }
    catch (e) { window.prompt('Копирай това:', text); }
  });

  // ---------- own file: load, guess, inputs ----------
  const fileInput = $('#fileInput');
  const MAX_BYTES = 80e6, MAX_SEC = 600; // a decoded 10-min stereo file is ~230 MB of PCM
  let loadTok = 0;
  async function loadFile(f) {
    if (!f) return;
    if (f.size > MAX_BYTES) { toast('Файлът е твърде голям (до 80 MB).', 3500); return; }
    const my = ++loadTok; // only the last picked file counts
    stopPreview();
    file.loading = true;
    state.sel = { src: 'file', id: 'file' };
    store.set('rb_beatSel', state.sel);
    if (state.src !== 'file') setTab('file'); else renderList();
    renderNow();
    let buffer = null;
    try {
      const ctx = A.ensure();
      const data = await f.arrayBuffer();
      buffer = await ctx.decodeAudioData(data);
    } catch (e) {
      if (my !== loadTok) return;
      file.loading = false;
      renderList(); renderNow();
      toast('Този файл не става: опитай MP3, WAV или M4A.', 3500);
      return;
    }
    if (my !== loadTok) return;
    if (buffer.duration > MAX_SEC) {
      file.loading = false;
      renderList(); renderNow();
      toast('Файлът е твърде дълъг (до 10 минути).', 3500);
      return;
    }
    const same = file.name === f.name && file.bpm;
    file.buffer = buffer;
    file.loading = false;
    if (!same) {
      // a new file: guess the BPM and the first downbeat from its envelope (RBDrop)
      file.name = f.name;
      file.offset = 0; file.bpm = null; file.guess = false;
      try {
        const g = window.RBDrop.analyze(window.RBFile.envelope(buffer, Math.min(30000, Math.round(buffer.duration / 0.02))), buffer.duration * 1000);
        if (g.bpm >= 60 && g.bpm <= 200) { file.bpm = round2(g.bpm); file.guess = true; }
        if (g.dropMs > 0 && g.dropMs < buffer.duration * 1000) file.offset = g.dropMs / 1000;
      } catch (e) { /* no guess: the player taps */ }
    }
    saveFile();
    taps = [];
    renderList();
    renderNow();
    startPreview();
  }
  fileInput.addEventListener('change', () => { const f = fileInput.files && fileInput.files[0]; fileInput.value = ''; loadFile(f); });
  $('#fileReplace').addEventListener('click', () => fileInput.click());
  $('#fileStartBtn').addEventListener('click', () => {
    if (!file.buffer) return;
    taps = [];
    startPreview(Math.max(0, file.offset - 4) * 1000);
  });
  $('#fileBpm').addEventListener('change', () => {
    const v = parseFloat($('#fileBpm').value);
    file.bpm = v >= 60 && v <= 200 ? v : null;
    if (!file.bpm) toast('BPM трябва да е между 60 и 200.');
    file.guess = false;
    saveFile(); renderList(); renderNow();
  });
  $('#fileOffset').addEventListener('change', () => {
    const v = parseFloat($('#fileOffset').value);
    const max = file.buffer ? file.buffer.duration : Infinity;
    file.offset = Number.isFinite(v) && v >= 0 && v < max ? v : 0;
    file.guess = false;
    saveFile(); renderList(); renderNow();
  });

  // ---------- sync slider ----------
  const syncRange = $('#syncRange');
  syncRange.value = sync;
  const showSync = () => { $('#syncVal').textContent = `${sync > 0 ? '+' : ''}${sync} ms`; };
  showSync();
  syncRange.addEventListener('input', () => { sync = parseInt(syncRange.value, 10) || 0; store.set('rb_sync', sync); showSync(); });

  // ---------- events ----------
  document.querySelectorAll('#beatPanel .tab').forEach((t) => t.addEventListener('click', () => setTab(t.dataset.src)));
  $('#beatSearch').addEventListener('input', (e) => { state.query = e.target.value; renderList(); });
  listEl.addEventListener('click', (e) => {
    if (e.target.id === 'scRetry') { loadSC(); return; }
    const li = e.target.closest('li[data-id]');
    if (li && e.target.closest('.fav')) { toggleFav(state.src, li.dataset.id); return; }
    if (li && li.dataset.id === '__load') { fileInput.click(); return; }
    if (li) select(state.src, li.dataset.id);
  });
  listEl.addEventListener('keydown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (!li) return;
    // up / down arrows move between the rows (section 12)
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const rows = [...listEl.querySelectorAll('li[data-id]')];
      const to = rows[rows.indexOf(li) + (e.key === 'ArrowDown' ? 1 : -1)];
      if (to) { e.preventDefault(); to.focus(); }
      return;
    }
    if (e.target.closest('.fav')) return; // Enter on the star = its own click
    if (e.key === 'Enter') {
      const id = li.dataset.id;
      if (id === '__load') { fileInput.click(); return; }
      select(state.src, id); // renderList keeps the focus on the row
    }
  });
  $('#previewBtn').addEventListener('click', () => { taps = []; return state.preview ? stopPreview() : startPreview(); });

  // ---------- init ----------
  if (state.sel.src === 'synth' && !window.BEATS.find((b) => b.id === state.sel.id)) state.sel = { src: 'synth', id: window.BEATS[0].id };
  if (state.sel.src === 'file') state.sel = { src: 'file', id: 'file' };
  setTab(state.src);
  renderNow();

  window.RB.beats = { current, makeEngine, stopPreview, fitTaps, get sync() { return sync; } };
})();
