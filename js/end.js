/* Rimoboy: end screen (M6). Spec: BUILD.md sections 7.5 (end screen), 7.6 (rhyme
   dictionary), 7.7 (streak popup), 9.5 (end), 11 (rb_streak).
   game.js endGame() calls RB.onGameEnd(G) after it shows the end screen. The beat keeps
   playing quietly in G.engine; "Меню" / "Играй пак" (wired in game.js) stop it.
   Loads after game.js. */
(function () {
  'use strict';
  const { $, store, openModal } = window.RB;
  const Chart = window.Chart;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const fmt = (sec) => {
    sec = Math.max(0, Math.round(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };

  // ---------- streak (rb_streak = {last:"YYYY-MM-DD", count}) ----------
  const dayStr = (d) => d.toLocaleDateString('sv'); // local YYYY-MM-DD
  function bumpStreak() {
    const now = new Date();
    const today = dayStr(now);
    const y = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yesterday = dayStr(y);
    const old = store.get('rb_streak', null);
    const last = old && typeof old.last === 'string' ? old.last : null;
    const count = old && Number.isFinite(old.count) && old.count > 0 ? Math.floor(old.count) : 0;
    if (last === today && count) return { count, changed: false };
    const next = last === yesterday && count ? count + 1 : 1;
    store.set('rb_streak', { last: today, count: next });
    return { count: next, changed: true };
  }

  // ---------- popup + streak popup + confetti ----------
  const popup = $('#popup'), popBtn = $('#popBtn');
  let popTimer = 0, popMode = null, pendingStreak = null;

  function showPopup(mode, emoji, text, sub) {
    clearTimeout(popTimer);
    popMode = mode;
    $('#popEmoji').textContent = emoji;
    $('#popText').textContent = text;
    $('#popSub').textContent = sub || '';
    popBtn.classList.toggle('hidden', mode === 'streak');
    popup.classList.remove('hidden');
    if (mode === 'end') popBtn.focus({ preventScroll: true });
    if (mode === 'streak') popTimer = setTimeout(closePopup, 2500);
  }

  function closePopup() {
    clearTimeout(popTimer);
    if (popup.classList.contains('hidden')) return;
    const was = popMode;
    popup.classList.add('hidden');
    popMode = null;
    if (was === 'end' && pendingStreak) {
      const n = pendingStreak; pendingStreak = null;
      showPopup('streak', '🔥', n === 1 ? 'Първи ден от поредицата!' : `${n} поредни дни!`);
    }
  }

  // stopPropagation: the same click must not reach the popup and close the streak popup
  popBtn.addEventListener('click', (e) => { e.stopPropagation(); closePopup(); });
  // the streak popup closes on any tap
  popup.addEventListener('click', (e) => { if (popMode === 'streak' || e.target === popup) closePopup(); });
  document.addEventListener('keydown', (e) => {
    if (popup.classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); closePopup(); }
  });

  // confetti: ~120 paper pieces for 3 s, none with reduced motion
  const canvas = $('#confetti');
  let confRaf = 0;
  function confetti() {
    stopConfetti();
    if (reducedMotion) return;
    const ctx = canvas.getContext('2d');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W * dpr; canvas.height = H * dpr;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const cols = ['--r1', '--r2', '--r3', '--r4', '--r5', '--r6', '--gold']
      .map((v) => css.getPropertyValue(v).trim()).filter(Boolean);
    const P = Array.from({ length: 120 }, () => ({
      x: W * (0.2 + Math.random() * 0.6), y: H * (0.25 + Math.random() * 0.15),
      vx: (Math.random() - 0.5) * 9, vy: -4 - Math.random() * 9,
      w: 6 + Math.random() * 6, h: 4 + Math.random() * 6,
      a: Math.random() * Math.PI, va: (Math.random() - 0.5) * 0.3,
      c: cols[Math.floor(Math.random() * cols.length)] || '#ffc94a',
    }));
    const t0 = performance.now(), DUR = 3000;
    canvas.classList.remove('hidden');
    let prev = t0;
    const step = (now) => {
      const t = now - t0;
      const k = Math.min(3, (now - prev) / 16.7); prev = now; // frame-rate independent
      ctx.clearRect(0, 0, W, H);
      ctx.globalAlpha = t > DUR - 600 ? Math.max(0, (DUR - t) / 600) : 1;
      for (const p of P) {
        p.vy += 0.25 * k; p.vx *= Math.pow(0.99, k);
        p.x += p.vx * k; p.y += p.vy * k; p.a += p.va * k;
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.a);
        ctx.fillStyle = p.c;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.a * 2)) + 1);
        ctx.restore();
      }
      if (t < DUR) confRaf = requestAnimationFrame(step); else stopConfetti();
    };
    confRaf = requestAnimationFrame(step);
  }
  function stopConfetti() {
    cancelAnimationFrame(confRaf); confRaf = 0;
    canvas.classList.add('hidden');
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // ---------- rhyme dictionary ----------
  // one index over all lists ("Микс" reuses the same family objects, so skip it)
  let famById = null, wordIndex = null;
  function buildIndex() {
    famById = new Map();
    wordIndex = []; // {w (lower case), word, famId}
    const seen = new Set();
    for (const l of window.WORD_LISTS || []) {
      if (l.id === 'mix') continue;
      for (const f of l.families) {
        famById.set(f.id, f);
        for (const w of f.words) {
          const key = f.id + '|' + w;
          if (seen.has(key)) continue;
          seen.add(key);
          wordIndex.push({ w: w.toLowerCase(), word: w, famId: f.id });
        }
      }
    }
  }
  const tail = (w) => w.toLowerCase().slice(-3);

  function chip(word, famId) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = word;
    b.dataset.word = word;
    b.dataset.fam = famId || '';
    return b;
  }

  function openDict(word, famId) {
    if (!famById) buildIndex();
    const lower = word.toLowerCase();
    const fam = famById.get(famId) || null;
    $('#dictWord').textContent = word;

    const famWords = fam ? fam.words.filter((w) => w.toLowerCase() !== lower) : [];
    const famEl = $('#dictFam');
    famEl.innerHTML = '';
    famWords.forEach((w) => famEl.appendChild(chip(w, fam.id)));
    if (!famWords.length) famEl.textContent = '—';

    // "Още рими": other families whose words end in the same 3 letters
    // (fallback: the last 2 letters, when no word matches 3)
    const inFam = new Set([lower, ...famWords.map((w) => w.toLowerCase())]);
    const findMore = (end) => {
      const out = [], used = new Set();
      for (const it of wordIndex) {
        if (it.famId === famId || inFam.has(it.w) || used.has(it.w)) continue;
        if (it.w.endsWith(end)) { used.add(it.w); out.push(it); }
        if (out.length >= 40) break;
      }
      return out;
    };
    let more = findMore(tail(word));
    if (!more.length && lower.length > 2) more = findMore(lower.slice(-2));
    const moreEl = $('#dictMore');
    moreEl.innerHTML = '';
    more.forEach((it) => moreEl.appendChild(chip(it.word, it.famId)));
    $('#dictMoreWrap').classList.toggle('hidden', !more.length);

    openModal('dictModal');
    const dlg = $('#dictModal .dialog');
    if (dlg) dlg.scrollTop = 0;
    const x = $('#dictModal [data-close]');
    if (x) x.focus({ preventScroll: true });
  }

  // chips open the tapped word
  $('#dictModal').addEventListener('click', (e) => {
    const b = e.target.closest('.dict-chips button');
    if (b) openDict(b.dataset.word, b.dataset.fam);
  });

  // focus trap inside the dictionary (Tab cycles through its buttons)
  $('#dictModal').addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = Array.from(e.currentTarget.querySelectorAll('button')).filter((b) => b.offsetParent);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  // ---------- recap ----------
  const recap = $('#recap');
  recap.addEventListener('click', (e) => {
    const c = e.target.closest('.cell.tap');
    if (c) openDict(c.dataset.word, c.dataset.fam);
  });
  recap.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const c = e.target.closest('.cell.tap');
    if (c) { e.preventDefault(); openDict(c.dataset.word, c.dataset.fam); }
  });

  let rz = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(() => { if (window.RB.screen === 'end') Chart.fitCells(recap); });
  });

  function renderRecap(G) {
    Chart.renderRows(recap, G.chart, { revealAll: true, tap: true });
    const taps = recap.querySelectorAll('.cell.tap');
    taps.forEach((c) => {
      c.tabIndex = 0;
      c.setAttribute('role', 'button');
      c.setAttribute('aria-label', `Рими за „${c.dataset.word}“`);
    });
    recap.scrollTop = 0;
    const hint = recap.parentElement.querySelector('.hint');
    if (hint) hint.classList.toggle('hidden', !taps.length);
  }

  // ---------- beat card ----------
  function fillBeat(beat, S) {
    const cov = $('#eCover');
    cov.style.background = beat.artwork ? `center/cover url('${beat.artwork}')` : (beat.cover || '');
    cov.textContent = beat.artwork ? '' : (beat.emoji || '🎧');
    $('#eTitle').textContent = beat.title;
    const sf = window.RB.settings.speedFactor();
    $('#eMeta').textContent = beat.meta + (sf !== 1 ? ' · ' + window.RB.settings.speedLabel() : '');
    const link = $('#eLink');
    if (beat.src === 'sc' && beat.link) { link.href = beat.link; link.classList.remove('hidden'); }
    else { link.removeAttribute('href'); link.classList.add('hidden'); }
  }

  // ---------- recording card (M7) ----------
  const recCard = $('#recCard'), recAudio = $('#recAudio'), recDl = $('#recDl');
  let shownG = null; // the game whose end screen is shown
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;

  function hideRec() {
    recCard.classList.add('hidden');
    recAudio.pause();
    recAudio.removeAttribute('src');
    recAudio.load();
    recDl.removeAttribute('href');
  }

  function showRec(G) {
    hideRec();
    if (!G.recP) return;
    G.recP.then((r) => {
      if (shownG !== G) { if (r) window.RB.rec.revoke(); return; } // the player already left
      if (!r) { window.RB.toast('Записът е празен.'); return; }
      recAudio.src = r.url;
      recDl.href = r.url;
      recDl.download = `rimoboy-${stamp(new Date())}.${r.ext}`;
      recCard.classList.remove('hidden');
    });
  }

  // while the recording plays, the quiet end-screen beat goes silent
  const beatVol = (v) => { const g = window.RB.game.state; if (g && g === shownG && g.engine) g.engine.setVolume(v, 0.3); };
  recAudio.addEventListener('play', () => beatVol(0));
  recAudio.addEventListener('pause', () => beatVol(0.5));
  recAudio.addEventListener('ended', () => beatVol(0.5));

  // ---------- entry point (called by game.js endGame) ----------
  function onGameEnd(G) {
    shownG = G;
    showRec(G);
    $('#stDur').textContent = fmt(G.playSec);
    $('#stBars').textContent = String(G.bars);
    const st = bumpStreak();
    $('#stStreak').textContent = `🔥 ${st.count}`;
    fillBeat(G.beat, G.settings);
    renderRecap(G);
    window.scrollTo(0, 0);

    pendingStreak = st.changed ? st.count : null;
    showPopup('end', '🎉', 'Страхотни барове!', `${G.bars} бара · ${fmt(G.playSec)}`);
    confetti();
  }

  // leaving the end screen (game.js toMenu / startGame call this): drop popups + confetti
  function cleanup() {
    shownG = null;
    hideRec();
    pendingStreak = null;
    clearTimeout(popTimer);
    popup.classList.add('hidden');
    popMode = null;
    stopConfetti();
    window.RB.closeModal('dictModal');
  }

  window.RB.onGameEnd = onGameEnd;
  window.RB.end = { bumpStreak, openDict, cleanup, confetti, get shown() { return shownG; } };
})();
