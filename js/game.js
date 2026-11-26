/* Rimoboy: game screen (M5). Spec: BUILD.md section 9 (+ START HERE, M5 brief).
   Defines RB.startGame(): builds the chart, renders the grid, starts the beat engine and
   runs the frame loop (cell lighting, row scroll, bouncing ball, header, progress).
   Timing comes only from engine.time() (audio clock / SoundCloud clock, latency-corrected).
   Also exposes RB.game (debug/test handle) and RB.toMenu() (stops the beat, back to menu).
   Loads LAST (needs RB, RB.beats, RB.settings). */
(function () {
  'use strict';
  const { $, toast, showScreen } = window.RB;
  const A = window.RBAudio, Chart = window.Chart;

  const COUNTIN_BARS = 2;
  const COUNT_CELLS = COUNTIN_BARS * 4;
  const TRAIL = [0.05, 0.1, 0.15]; // trail clones lag this many cells behind the ball

  const rowsEl = $('#rows'), viewport = $('#viewport'), ball = $('#ball');
  const trails = [$('#tr1'), $('#tr2'), $('#tr3')];
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let G = null;     // current game state
  let token = 0;    // invalidates async starts when the player exits early

  const fmt = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
  };
  const easeInOut = (p) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);

  // ---------- geometry (read from the DOM; recomputed on resize) ----------
  function measure() {
    if (!G) return;
    const vr = viewport.getBoundingClientRect();
    const rows = rowsEl.children;
    if (!rows.length) return;
    const r0 = rows[0].getBoundingClientRect();
    const cells = rows[0].querySelectorAll('.cell');
    G.colX = Array.from(cells, (c) => { const b = c.getBoundingClientRect(); return b.left + b.width / 2 - vr.left; });
    G.rowH = r0.height;
    G.rowStep = rows.length > 1 ? rows[1].getBoundingClientRect().top - r0.top : r0.height;
    G.padTop = rowsEl.offsetTop;
    G.ballR = ball.offsetWidth / 2 || 12;
    G.baseY = G.padTop - G.ballR; // ball centre when it touches the top of the current row
    G.arcH = Math.max(8, Math.min(1.1 * G.rowH, G.padTop - 2 * G.ballR - 2));
    scrollTo(G.row, false);
  }

  function scrollTo(row, animate = true) {
    // rows already played scroll up into the ball area: dim them
    const rows = rowsEl.children;
    for (let r = Math.max(0, Math.min(G.row, row) - 1); r < rows.length && r <= Math.max(G.row, row); r++) {
      rows[r].classList.toggle('past', r < row);
    }
    G.row = row;
    if (!animate) rowsEl.style.transition = 'none';
    rowsEl.style.transform = `translateY(${-row * G.rowStep}px)`;
    if (!animate) { void rowsEl.offsetHeight; rowsEl.style.transition = ''; }
  }

  // ball position for a float cell position f
  function ballPos(f) {
    const cx = G.colX;
    if (f < 0) {
      // before the first count-in cell: bounce in place over column 0
      const p = f - Math.floor(f);
      return [cx[0], G.baseY - G.arcH * 4 * p * (1 - p)];
    }
    const i = Math.floor(f), p = f - i;
    const from = cx[i % 4], to = cx[(i + 1) % 4];
    return [from + (to - from) * easeInOut(p), G.baseY - G.arcH * 4 * p * (1 - p)];
  }

  function place(el, xy) {
    el.style.transform = `translate(${xy[0] - G.ballR}px, ${xy[1] - G.ballR}px)`;
  }

  function drawBall(f) {
    place(ball, ballPos(f));
    if (reducedMotion) return;
    trails.forEach((el, k) => {
      const ft = f - TRAIL[k];
      el.style.visibility = ft < -1 ? 'hidden' : 'visible';
      place(el, ballPos(ft));
    });
  }

  // ---------- header + progress ----------
  function setHead(a, b) {
    if (G.head1 !== a) { $('#gHead1').textContent = a; G.head1 = a; }
    if (G.head2 !== b) { $('#gHead2').textContent = b; G.head2 = b; }
  }

  function onCell(idx) {
    if (G.party) window.RB.party.onCell(G, idx); // party battle: turns (party-host.js)
    if (G.litEl) G.litEl.classList.remove('lit');
    G.litEl = null;
    if (idx < 0) return;
    const row = Math.floor(idx / 4);
    if (row !== G.row) scrollTo(row);
    const el = G.cells[idx];
    if (el) { el.classList.add('lit'); G.litEl = el; }
  }

  function header(idx) {
    if (G.paused) return;
    const stall = G.engine && G.engine.isSC && G.engine.stalled && G.engine.stalled();
    const ph = G.party && window.RB.party.header(G, idx, stall); // party battle: whose turn
    if (ph) { setHead(ph[0], ph[1]); return; }
    if (idx < COUNT_CELLS) {
      setHead('Пригответе се!', stall ? 'Зарежда…' : (idx < 0 ? (G.beat.src === 'sc' && idx < -1 ? 'Слушай интрото…' : '') : `Започваме след ${COUNT_CELLS - idx}`));
    } else {
      const bar = Math.min(G.bars, Math.floor(idx / 4) - COUNTIN_BARS + 1);
      setHead(`Бар ${bar} / ${G.bars}`, stall ? 'Зарежда…' : G.sub);
    }
  }

  function progress(t) {
    const play = t - COUNT_CELLS * G.cellDur;
    const sec = Math.max(0, Math.min(G.playSec, play));
    const pos = Math.floor(sec);
    if (pos !== G.lastSec) { $('#gPos').textContent = fmt(pos); G.lastSec = pos; }
    $('#gProg').style.width = `${(sec / G.playSec) * 100}%`;
  }

  // ---------- frame loop ----------
  // one frame of drawing; returns false when the game has ended
  function frame() {
    const t = G.engine.time();
    const f = t / G.cellDur;
    const idx = Math.floor(f);
    if (idx !== G.lastIdx) { onCell(idx); G.lastIdx = idx; }
    header(idx);
    drawBall(f);
    progress(t);
    if (idx >= G.total) { endGame(); return false; }
    return true;
  }
  function loop() {
    if (!G || G.ended || G.paused) return;
    if (frame()) G.raf = requestAnimationFrame(loop);
  }

  // ---------- start ----------
  // engine: for SoundCloud, engine.dropMs = where bar 1 starts in the song
  function barsFor(beat, cellDur, duration, engine) {
    if (duration !== 'full') return parseInt(duration, 10) || 16;
    if (beat.src === 'sc' && beat.track) {
      // the count-in plays before the drop, so all the time after the drop is for rapping,
      // up to the measured end of the beat (the outro is not rapped over) or the song end
      const drop = (engine && engine.dropMs) || 0;
      let endMs = (beat.tempo && beat.tempo.endMs) || beat.track.durationMs;
      // a user drop late in the song can pass the measured end: use the song end then
      if (endMs - drop < 4 * 4 * cellDur * 1000) endMs = beat.track.durationMs;
      const after = (endMs - drop) / 1000;
      return Math.max(4, Math.floor(after / cellDur / 4 + 1e-6)); // epsilon: endMs is a whole bar
    }
    if (beat.src === 'file' && engine && engine.isFile) {
      return Math.max(4, Math.floor(engine.afterRap / (4 * cellDur) + 1e-6));
    }
    return 64;
  }

  function fillPlayer(beat, S) {
    const cov = $('#gCover');
    cov.style.background = beat.artwork ? `center/cover url('${beat.artwork}')` : (beat.cover || '');
    cov.textContent = beat.artwork ? '' : (beat.emoji || '🎧');
    $('#gTitle').textContent = beat.title;
    const speed = window.RB.settings.speedFactor() !== 1 ? ' · ' + window.RB.settings.speedLabel() : '';
    $('#gMeta').textContent = beat.meta + speed;
    $('#gPos').textContent = '0:00';
    $('#gProg').style.width = '0';
    $('#recBadge').classList.add('hidden'); // M7 shows it while recording
    $('#pauseBtn').textContent = '❚❚';
    $('#pauseOv').classList.add('hidden');
  }

  async function startGame() {
    if (window.RB.end) window.RB.end.cleanup(); // end-screen popups/confetti
    stopEngine(0.05, 'restart'); // short fade: "Играй пак" must not overlap two beats
    window.RB.beats.stopPreview();
    window.RB.rec.revoke(); // the last recording's blob URL
    const my = ++token;
    const S = window.RB.settings.get();
    const beat = window.RB.beats.current();
    const speed = window.RB.settings.speedFactor();
    const cellDur = 60 / beat.bpm / speed;
    // SoundCloud: the count-in ends exactly on the beat drop (SCBeat leadMs)
    const engine = window.RB.beats.makeEngine({ leadMs: COUNT_CELLS * cellDur * 1000 });
    // an own file needs at least 4 bars after its start
    if (beat.src === 'file' && engine && engine.afterRap < 16 * cellDur - 1e-6) {
      toast('Файлът е твърде кратък след началото: нужни са поне 4 бара.', 3500);
      toMenu();
      return;
    }
    let bars = barsFor(beat, cellDur, S.duration, engine);
    // an own file can be shorter than the chosen length: play only the bars it has
    if (beat.src === 'file' && engine && S.duration !== 'full') {
      const fit = Math.floor(engine.afterRap / (4 * cellDur) + 1e-6);
      if (fit < bars) { bars = fit; toast(`Файлът стига за ${fit} бара.`); }
    }
    const list = window.RB.settings.list();
    const chart = Chart.buildChart(bars, window.RB.settings.pattern(), list, window.RB.settings.fill());

    G = {
      engine: null, beat, settings: S, cellDur, bars, chart, list,
      total: (COUNTIN_BARS + bars) * 4, playSec: bars * 4 * cellDur,
      lastIdx: -999, lastSec: -1, row: 0, litEl: null, raf: 0,
      paused: false, ended: false, starting: true, head1: null, head2: null,
      sub: S.blank ? 'Празна игра' : `${list.emoji} ${list.name}`,
    };
    // party mode: this game is a battle (or its second part); null otherwise
    G.party = window.RB.party && window.RB.party.on ? window.RB.party.beginGame(G, window.RB.settings.pattern()) : null;

    showScreen('game');
    Chart.renderRows(rowsEl, chart, { countinRows: COUNTIN_BARS });
    if (G.party) window.RB.party.decorate(rowsEl, G);
    G.cells = Array.from(rowsEl.querySelectorAll('.cell'));
    fillPlayer(beat, S);
    $('#gDur').textContent = fmt(Math.round(G.playSec)); // same rounding as the end screen
    measure();
    // web fonts change the word sizes: re-measure once they are in
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (G && G.chart === chart) measure(); });
    drawBall(-0.001);
    trails.forEach((el) => { el.style.visibility = 'hidden'; });
    setHead('Пригответе се!', beat.src === 'sc' ? 'Зарежда…' : '');

    if (!engine) { toast('Този бийт още не става за игра.'); toMenu(); return; }
    G.engine = engine;
    G.rec = false;
    if (S.rec) {
      // ask for the mic before the beat starts; no mic → play without REC
      setHead('Пригответе се!', 'Микрофон…');
      let recOk = false;
      try {
        await window.RB.rec.prepare();
        recOk = true;
      } catch (e) {
        if (my === token) {
          toast(e && e.message === 'unsupported'
            ? 'Този браузър не може да записва: играем без запис.'
            : 'Няма достъп до микрофона: играем без запис.', 3500);
        }
      }
      // left during the mic prompt: stopEngine already discarded (and rec.js drops a late mic)
      if (my !== token || !G || G.engine !== engine) return;
      G.rec = recOk;
      setHead('Пригответе се!', engine.isSC ? 'Зарежда…' : '');
    }
    try {
      if (engine.isSC) {
        engine.onExternalPause = () => { if (G && G.engine === engine && !G.paused && !G.ended) pause(true); };
        await engine.start();
      } else {
        A.ensure();
        // REC: the recorder starts in the same task, 0.15 s before the count-in
        if (G.rec) startRec();
        engine.start(A.ctx.currentTime + 0.15);
      }
    } catch (e) {
      if (my !== token) return;
      toast('Бийтът не тръгна. Опитай пак.');
      toMenu();
      return;
    }
    if (my !== token || !G || G.engine !== engine) { engine.stop(0); return; }
    G.starting = false;
    if (G.party) window.RB.party.onStarted(G); // the battle goes live only once the beat really plays
    if (G.rec && engine.isSC) startRec(); // SoundCloud: once the track really plays
    G.raf = requestAnimationFrame(loop);
    if (G.pendingPause || document.hidden) { G.pendingPause = false; pause(); }
  }

  function startRec() {
    try {
      window.RB.rec.start();
      $('#recBadge').classList.remove('hidden');
    } catch (e) {
      G.rec = false;
      window.RB.rec.discard();
      toast('Записът не тръгна: играем без запис.');
    }
  }

  // ---------- pause / resume / exit ----------
  function pause(fromSC) {
    if (!G || G.ended || G.paused) return;
    if (G.starting) { G.pendingPause = true; return; } // applied when the beat has started
    G.paused = true;
    cancelAnimationFrame(G.raf);
    if (G.engine.isSC) { if (!fromSC) G.engine.pause(); } else if (A.ctx) A.ctx.suspend();
    if (G.rec) window.RB.rec.pause();
    $('#pauseBtn').textContent = '▶';
    $('#pauseBtn').setAttribute('aria-label', 'Продължи');
    $('#pauseOv').classList.remove('hidden');
    $('#gHead2').textContent = 'Пауза'; G.head2 = 'Пауза';
  }

  function resume() {
    if (!G || !G.paused) return;
    G.paused = false;
    if (G.engine.isSC) G.engine.resume(); else if (A.ctx) A.ctx.resume();
    if (G.rec) window.RB.rec.resume();
    $('#pauseBtn').textContent = '❚❚';
    $('#pauseBtn').setAttribute('aria-label', 'Пауза');
    $('#pauseOv').classList.add('hidden');
    G.raf = requestAnimationFrame(loop);
  }

  // why: 'restart' (a new game follows) or 'menu'
  function stopEngine(fade = 0.2, why = 'menu') {
    if (!G) return;
    cancelAnimationFrame(G.raf);
    if (G.party && window.RB.party) window.RB.party.onStop(G, why);
    // exit mid-game (also during the mic prompt): no recording, mic released
    if (!G.ended) window.RB.rec.discard();
    if (G.engine) G.engine.stop(fade);
    if (A.ctx && A.ctx.state === 'suspended') A.ctx.resume();
    G.ended = true;
    G = null;
  }

  function toMenu() {
    token++;
    if (window.RB.end) window.RB.end.cleanup();
    stopEngine();
    if (window.RB.party && window.RB.party.onMenu) window.RB.party.onMenu(); // also when no game was left to stop
    $('#recBadge').classList.add('hidden');
    $('#pauseOv').classList.add('hidden');
    showScreen('menu');
  }

  function exitGame() {
    if (!G) { toMenu(); return; }
    if (G.rec && !G.ended && !G.starting) {
      const wasPaused = G.paused;
      if (!wasPaused) pause();
      if (!window.confirm('Да прекратим ли играта?')) { if (!wasPaused) resume(); return; }
    }
    toMenu();
  }

  // ---------- end (end screen itself: js/end.js, RB.onGameEnd) ----------
  function endGame() {
    G.ended = true;
    cancelAnimationFrame(G.raf);
    if (G.litEl) G.litEl.classList.remove('lit');
    G.engine.setVolume(0.5, 1);
    G.recP = G.rec ? window.RB.rec.stop() : null; // → {blob, url, ext} | null (end.js shows it)
    $('#recBadge').classList.add('hidden');
    showScreen('end');
    if (window.RB.onGameEnd) window.RB.onGameEnd(G);
    if (G.party && window.RB.party) window.RB.party.onEnd(G);
  }

  // ---------- events ----------
  const blurBtn = (e) => { if (e.currentTarget.blur) e.currentTarget.blur(); };
  $('#pauseBtn').addEventListener('click', (e) => { blurBtn(e); G && G.paused ? resume() : pause(); });
  $('#resumeBtn').addEventListener('click', (e) => { blurBtn(e); resume(); });
  $('#quitBtn').addEventListener('click', toMenu);
  $('#exitBtn').addEventListener('click', exitGame);
  // end screen: stop the quiet beat when leaving (end.js cleans up its popups in toMenu/startGame)
  $('#menuBtn').addEventListener('click', toMenu);
  $('#againBtn').addEventListener('click', () => startGame());

  document.addEventListener('keydown', (e) => {
    if (window.RB.screen !== 'game' || e.repeat) return;
    if (e.code === 'Space') {
      e.preventDefault();
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      if (G && G.paused) resume(); else pause();
    } else if (e.key === 'Escape') {
      exitGame();
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && window.RB.screen === 'game') pause();
  });
  let rz = 0;
  window.addEventListener('resize', () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(() => { if (G && window.RB.screen === 'game') { Chart.fitCells(rowsEl); measure(); } });
  });
  document.addEventListener('fullscreenchange', () => setTimeout(() => { if (G) { Chart.fitCells(rowsEl); measure(); } }, 50));

  window.RB.startGame = startGame;
  window.RB.toMenu = toMenu;
  // debug/test handle; frame() draws one frame now (rAF is throttled in hidden tabs)
  window.RB.game = { get state() { return G; }, pause, resume, exit: exitGame, frame: () => G && !G.ended && frame(), COUNTIN_BARS };
})();
