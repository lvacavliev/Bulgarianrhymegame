/* Rimoboy: tutorial overlay (M8). Spec: BUILD.md section 7.2.
   4 slides. Shown on the first visit (rb_tutorialDone), reopened with the "?" button.
   A demo ball bounces across the demo cells at 90 BPM (JS + rAF, like the game ball).
   Keys: Esc = skip, ← / → = previous / next slide, Tab stays inside (app.js focus trap).
   Loads last (after end.js). */
(function () {
  'use strict';
  const { $, store, openModal, closeModal } = window.RB;

  const BEAT_MS = 60000 / 90;
  const reduced = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  // rows: null = empty cell, {w, rhyme} = a word (rhyme = orange rhyme cell, else cream)
  const R = (w) => ({ w, rhyme: true });
  const F = (w) => ({ w, rhyme: false });
  const SLIDES = [
    { text: 'Научи се да фрийстайлваш в 3 лесни стъпки.', sub: 'Трябват ти само бийт, топка и рими.', btn: 'Да почваме!', rows: null },
    { text: '1. Следвай топката: тя подскача в ритъм.', sub: 'Всяка клетка е един удар. 4 удара = 1 бар.', btn: 'Напред',
      rows: [[null, null, null, null]] },
    { text: '2. Кажи римата точно когато топката падне върху нея.', sub: 'Еднакъв цвят = думите се римуват.', btn: 'Напред',
      rows: [[null, null, null, R('рима')], [null, null, null, R('зима')]] },
    { text: '3. Останалото е чист фрийстайл!', sub: 'Между римите казваш каквото ти дойде.', btn: 'Към играта',
      rows: [[F('Аз'), F('пиша'), F('тази'), R('рима')], [F('чака'), F('ни'), F('една'), R('зима')]] },
  ];

  const ov = $('#tutorial');
  const stage = $('#tutStage');
  const dots = [...$('#tutDots').children];
  let slide = 0, raf = 0, t0 = 0, ball = null, cells = [];

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function render() {
    const s = SLIDES[slide];
    dots.forEach((d, i) => d.classList.toggle('on', i === slide));
    $('#tutText').textContent = s.text;
    $('#tutSub').textContent = s.sub;
    $('#tutNext').textContent = s.btn;
    $('#tutSkip').classList.toggle('hidden', slide === SLIDES.length - 1);
    cancelAnimationFrame(raf);
    if (!s.rows) {
      stage.className = 'tut-stage intro';
      stage.innerHTML = '<div class="tut-hero" aria-hidden="true">🎤</div>';
      ball = null; cells = [];
      return;
    }
    stage.className = 'tut-stage';
    stage.innerHTML = s.rows.map((row) => '<div class="row">' + row.map((c) => {
      if (!c) return '<div class="cell"></div>';
      return `<div class="cell ${c.rhyme ? 'rhyme c0' : 'free'}">${esc(c.w)}</div>`;
    }).join('') + '</div>').join('') + '<div class="tut-ball" aria-hidden="true"></div>';
    // a screen reader gets the demo as text
    stage.setAttribute('aria-label', s.rows.map((r) => r.map((c) => (c ? c.w : '·')).join(' ')).join(' / '));
    ball = stage.querySelector('.tut-ball');
    cells = [...stage.querySelectorAll('.cell')];
    t0 = performance.now();
    frame();
  }

  // one frame of the demo ball: it lands on cell b at beat b and arcs to the next cell
  function frame() {
    raf = 0;
    if (!ball || ov.classList.contains('hidden')) return;
    const n = cells.length;
    const beats = (performance.now() - t0) / BEAT_MS;
    const b = Math.floor(beats) % n;
    const p = reduced.matches ? 0 : beats - Math.floor(beats);
    const sr = stage.getBoundingClientRect();
    const pos = (i) => {
      const r = cells[i].getBoundingClientRect();
      return { x: r.left + r.width / 2 - sr.left, y: r.top - sr.top };
    };
    const a = pos(b), z = pos((b + 1) % n);
    const rad = ball.offsetWidth / 2 || 10;
    const arcH = Math.max(8, Math.min(34, cells[0].getBoundingClientRect().top - sr.top - 2 * rad - 2));
    const ease = p < 0.5 ? 2 * p * p : 1 - 2 * (1 - p) * (1 - p);
    const x = a.x + (z.x - a.x) * ease;
    const y = (a.y + (z.y - a.y) * ease) - rad - 1 - arcH * 4 * p * (1 - p);
    ball.style.transform = `translate(${(x - rad).toFixed(1)}px, ${(y - rad).toFixed(1)}px)`;
    const lit = beats - Math.floor(beats) < 0.2 ? b : -1;
    cells.forEach((c, i) => c.classList.toggle('lit', i === lit));
    // like the game: the row the ball has left is dimmed (the ball arcs over it)
    const row = Math.floor(b / 4);
    [...stage.querySelectorAll('.row')].forEach((r, i) => r.classList.toggle('past', i < row));
    raf = requestAnimationFrame(frame);
  }

  let pausedGame = false;
  function open(from = 0) {
    // the demo must not run over a live game: pause it (the player resumes with Space)
    const G = window.RB.game && window.RB.game.state;
    pausedGame = false;
    if (G && window.RB.screen === 'game' && !G.ended && !G.paused) { window.RB.game.pause(); pausedGame = true; }
    // a menu preview at another tempo would run against the 90 BPM demo ball
    if (window.RB.screen === 'menu' && window.RB.beats) window.RB.beats.stopPreview();
    slide = from;
    openModal('tutorial');
    render();
    $('#tutNext').focus({ preventScroll: true });
  }
  function close() {
    if (ov.classList.contains('hidden')) return;
    cancelAnimationFrame(raf); raf = 0;
    store.set('rb_tutorialDone', '1');
    closeModal('tutorial');
    ball = null; cells = []; // the demo stays drawn while the dialog fades out
    const G = window.RB.game && window.RB.game.state;
    if (pausedGame && G) {
      // opened while the beat was still starting: pause() only queued a pause, drop it
      if (G.starting) G.pendingPause = false;
      // otherwise the pause overlay is open: give it the focus, not the "?" button behind it
      else if (G.paused && window.RB.screen === 'game') { const r = $('#resumeBtn'); if (r && r.offsetParent !== null) r.focus({ preventScroll: true }); }
    }
    pausedGame = false;
  }
  function go(d) {
    const to = slide + d;
    if (to < 0) return;
    if (to >= SLIDES.length) { close(); return; }
    slide = to;
    render();
    $('#tutNext').focus({ preventScroll: true });
  }

  $('#tutNext').addEventListener('click', () => go(1));
  $('#tutSkip').addEventListener('click', close);
  $('#helpBtn').addEventListener('click', () => open(0));

  // capture phase: while the tutorial is open, no other key handler (P = play, Space = pause,
  // T = tap...) sees the keys. Enter/Space still press the focused tutorial button.
  document.addEventListener('keydown', (e) => {
    if (ov.classList.contains('hidden')) return;
    if (e.key === 'Tab') return; // app.js keeps the focus inside
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'ArrowRight' && !e.repeat) { e.preventDefault(); go(1); }
    else if (e.key === 'ArrowLeft' && !e.repeat) { e.preventDefault(); go(-1); }
  }, true);

  // first visit
  if (store.get('rb_tutorialDone', null) == null) open(0);

  // test handle: frame() draws one demo frame now (rAF is throttled in hidden tabs)
  // at(beats): draw the demo at that many beats after its start
  const at = (beats) => { t0 = performance.now() - beats * BEAT_MS; cancelAnimationFrame(raf); frame(); };
  window.RB.tutorial = { open, close, go, frame, at, get slide() { return slide; }, get pausedGame() { return pausedGame; } };
})();
