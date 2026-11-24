/* Rimoboy: menu beat panel (M3a). Tabs (Bizzle Beats / Вградени / Твой файл), search,
   beat list, "ТВОЯТ БИЙТ" preview card, tempo box with tap tempo, sync slider.
   Exposes window.RB.beats for the game (M5):
     current()     → { src, title, meta, cover, emoji, link, bpm, durationSec, ready, reason }
     makeEngine()  → SynthBeat | SCBeat (FileBeat in M7)
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

  const fmt = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

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
        meta: `Bizzle Beats · ${bpm ? (tempo.verified || tempo.user ? '' : '~') + bpm + ' BPM' : 'темпо?'}${t.genre ? ' · ' + t.genre : ''}`,
        cover: null, artwork: t.artwork, emoji: '🎧', link: t.url, bpm: bpm || null,
        durationSec: (t.durationMs - ((tempo && tempo.offsetMs) || 0)) / 1000,
        ready: !!bpm, reason: bpm ? null : 'Задай темпото (BPM) на този бийт: тапни в ритъм.',
        track: t, tempo };
    }
    return { src: sel.src, title: 'Твой файл', meta: '', ready: false, reason: 'Идва скоро (M7).' };
  }

  function makeEngine() {
    const c = current();
    if (c.src === 'synth') return new window.SynthBeat(c.def);
    if (c.src === 'sc') return new window.SCBeat(c.track, c.tempo, sync);
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

  function rowHTML(id, title, meta, coverStyle, coverText, badge) {
    const sel = state.sel.id === id ? ' sel' : '';
    return `<li data-id="${esc(id)}" class="${sel}" tabindex="0">
      <div class="cover" style="${coverStyle}">${coverText}</div>
      <div class="beat-info"><div class="beat-title">${esc(title)}${badge ? `<span class="badge">${badge}</span>` : ''}</div>
      <div class="beat-meta">${esc(meta)}</div></div></li>`;
  }

  function renderList() {
    if (state.src === 'synth') {
      listEl.innerHTML = window.BEATS.map((d) => rowHTML(d.id, d.title, `Римобой · ${d.bpm} BPM · ${d.genre}`,
        `background:${d.cover}`, d.emoji)).join('');
    } else if (state.src === 'sc') {
      if (SCW.state === 'loading' || SCW.state === 'idle') {
        listEl.innerHTML = '<li class="list-state">Зареждам бийтовете от SoundCloud…</li>';
      } else if (SCW.state === 'error') {
        listEl.innerHTML = `<li class="list-state">SoundCloud не се зареди (${SCW.error === 'offline' ? 'няма интернет' : 'грешка'}).<br>
          <button class="btn-ghost" id="scRetry" style="margin-top:8px">Опитай пак</button></li>`;
      } else {
        const q = state.query.trim().toLowerCase();
        const items = SCW.tracks.filter((t) => !q || t.title.toLowerCase().includes(q));
        listEl.innerHTML = items.length ? items.map((t) => {
          const tempo = SCW.tempoFor(t.slug);
          const bpm = tempo && tempo.bpm;
          const meta = `Bizzle Beats · ${bpm ? (tempo.verified || tempo.user ? '' : '~') + bpm + ' BPM' : fmt(t.durationMs / 1000)}${t.genre ? ' · ' + t.genre : ''}`;
          const cov = t.artwork ? `background-image:url('${esc(t.artwork)}')` : 'background:#ff7a45';
          return rowHTML(t.slug, t.title, meta, cov, t.artwork ? '' : '🎧', bpm ? '' : 'Настрой темпо');
        }).join('') : '<li class="list-state">Няма такъв бийт.</li>';
      }
    } else {
      listEl.innerHTML = '<li class="list-state">Качване на твой файл идва скоро (M7).</li>';
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
    $('#nowDur').textContent = c.src === 'sc' && c.track ? fmt(c.track.durationMs / 1000) : '';
    $('#recNote').classList.toggle('hidden', !(c.src === 'sc' && $('#recBtn').getAttribute('aria-pressed') === 'true'));
    renderTempoBox(c);
  }

  function renderTempoBox(c) {
    const show = c.src === 'sc' && !!c.track;
    tempoBox.classList.toggle('hidden', !show);
    if (!show) return;
    const t = c.tempo || { bpm: null, startMs: 0, offsetMs: 0 };
    if (document.activeElement !== $('#bpmInput')) $('#bpmInput').value = t.bpm || '';
    if (document.activeElement !== $('#startInput')) $('#startInput').value = ((t.startMs || 0) / 1000).toFixed(2);
    if (document.activeElement !== $('#offsetInput')) $('#offsetInput').value = ((t.offsetMs || 0) / 1000).toFixed(2);
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

  async function startPreview() {
    const c = current();
    stopPreview();
    if (c.src === 'synth') {
      A.ensure();
      const eng = new window.SynthBeat(c.def);
      eng.start(A.ctx.currentTime + 0.05);
      state.preview = eng;
    } else if (c.src === 'sc' && c.track) {
      // preview plays the track from its start point; the tempo is not needed to listen
      const eng = new window.SCBeat(c.track, c.tempo || { bpm: null, startMs: 0, offsetMs: 0 }, 0);
      state.preview = eng;
      $('#previewBtn').textContent = '…';
      eng.onExternalPause = () => { if (state.preview === eng) stopPreview(); };
      try { await eng.start(); } catch (e) {
        if (state.preview === eng) { stopPreview(); toast('Бийтът не тръгна. Натисни ▶ още веднъж.'); }
        return;
      }
      if (state.preview !== eng) return;
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
    const bpm = parseFloat($('#bpmInput').value);
    const startMs = Math.max(0, Math.round(parseFloat($('#startInput').value || '0') * 1000));
    let offsetMs = Math.max(0, Math.round(parseFloat($('#offsetInput').value || '0') * 1000));
    if (offsetMs < startMs) offsetMs = startMs;
    SCW.saveTempo(c.track.slug, { bpm: bpm >= 50 && bpm <= 220 ? bpm : null, startMs, offsetMs });
    renderList();
    $('#nowMeta').textContent = current().meta;
  }
  ['#bpmInput', '#startInput', '#offsetInput'].forEach((s) => $(s).addEventListener('change', saveTempoFromInputs));

  let taps = [];
  $('#tapBtn').addEventListener('click', () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    if (taps.length > 9) taps.shift();
    const btn = $('#tapBtn');
    btn.classList.add('flash');
    setTimeout(() => btn.classList.remove('flash'), 90);
    if (taps.length >= 4) {
      const iv = [];
      for (let i = 1; i < taps.length; i++) iv.push(taps[i] - taps[i - 1]);
      const bpm = Math.round((60000 / (iv.reduce((a, b) => a + b, 0) / iv.length)) * 2) / 2;
      $('#bpmInput').value = bpm;
      btn.textContent = `Тапни темпото · ${bpm} BPM (${taps.length})`;
      saveTempoFromInputs();
    } else {
      btn.textContent = `Тапни темпото · ${taps.length}…`;
    }
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
    if (li) select(state.src, li.dataset.id);
  });
  listEl.addEventListener('keydown', (e) => {
    const li = e.target.closest('li[data-id]');
    if (li && e.key === 'Enter') select(state.src, li.dataset.id);
  });
  $('#previewBtn').addEventListener('click', () => (state.preview ? stopPreview() : startPreview()));

  // ---------- init ----------
  if (state.sel.src === 'synth' && !window.BEATS.find((b) => b.id === state.sel.id)) state.sel = { src: 'synth', id: window.BEATS[0].id };
  setTab(state.src === 'file' ? 'synth' : state.src);
  renderNow();

  window.RB.beats = { current, makeEngine, stopPreview, get sync() { return sync; } };
})();
