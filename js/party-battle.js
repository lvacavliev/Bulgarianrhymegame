/* Rimoboy party mode: battles in the game (BUILD.md 16.2, 16.5, milestone P3).
   Extends RB.party (js/party-host.js) with the hooks game.js calls while party mode is on:
     beginGame(G, pattern) → battle info for this game (a new battle, or part 2 of a 1v1);
                             local only, nothing is sent yet
     decorate(rowsEl, G)   → side classes on the grid rows
     onStarted(G)          → the beat really plays: start_round / part 2 go to the phones
     onCell(G, idx)        → turn changes (the phones get them one beat early)
     header(G, idx, stall) → [line1, line2] for the game header
     onEnd(G)              → 1v1 part 1 → "between" + "▶ <right>"; otherwise the battle is done
     onStop(G, why)        → leaving a game: a battle that did not finish is cancelled
     onMenu()              → back in the menu: a 1v1 waiting for part 2 is cancelled
   and the reactions layer (#partyFx): side glows, flying emoji, hype meter, hype calls.
   A finished battle saves its hype and starts the vote (js/party-vote.js). */
(function () {
  'use strict';
  const RB = window.RB;
  const P = RB.party;
  if (!P) return;
  const $ = RB.$;

  const COUNTIN_BARS = (RB.game && RB.game.COUNTIN_BARS) || 2;
  const COUNT_CELLS = COUNTIN_BARS * 4;
  const EMOJI = ['🔥', '😂', '🤯', '👏', '💀'];
  const CALLS = [[50, 'Залата гори!'], [150, 'ОГЪН!'], [300, 'Неудържим!']];
  const MAX_FLOATS = 30;          // flying emoji on screen at once (recycled nodes)
  const RATE = 8, BURST = 24;     // hype a guest can add: 8 points/s, 24 at once (a phone sends ≤ 6 taps/s)
  const PULSE_TAPS = 10, PULSE_MS = 2000;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let B = null;                   // the current battle
  let pendingPart2 = false;       // 1v1: part 1 ended, the end screen offers part 2
  let ops = Promise.resolve();    // network writes in order (start_round before turn patches)
  let warned = 0;
  // a finished battle's vote is being started (network): no new battle until it is up.
  // Time-capped, so a hung request cannot lock the host out of playing.
  let voteSetup = 0, voteSetupAt = 0;
  const VOTE_SETUP_MAX_MS = 15000;
  const againBtn = $('#againBtn');
  const againText = againBtn.textContent;

  // writes run one after another and only while the room they were queued for is still the
  // current one (not after "Нова стая" or "Край на партито"). A failed write is logged, the
  // host gets a toast (at most every 20 s), and onFail can schedule a resend.
  function queue(fn, onFail) {
    const room = P.code;
    const ok = () => P.on && !P.closing && P.code === room && P.net && P.net.code === room;
    ops = ops.then(() => (ok() ? fn() : null)).catch((e) => {
      console.warn('party write failed', e);
      if (Date.now() - warned > 20000) { warned = Date.now(); RB.toast('Парти връзката се бави…', 2500); }
      if (onFail && ok()) onFail(e);
    });
    return ops;
  }
  const up = (s) => String(s).toLocaleUpperCase('bg');
  const nameOf = (side) => (B ? (side === 'L' ? B.left : B.right) : '');
  const barOf = (idx) => Math.floor(idx / 4) - COUNTIN_BARS + 1;

  // ---------- battle lifecycle ----------
  function sideOf(bar) {
    if (!B || bar < 1) return null;
    if (B.mode === '1v1') return B.part === 1 ? 'L' : 'R';
    return Math.floor((bar - 1) / B.turnBars) % 2 === 0 ? 'L' : 'R';
  }

  function beginGame(G, pattern) {
    if (!P.on || !P.net) return null;
    if (pendingPart2 && B && B.mode === '1v1') {
      pendingPart2 = false;
      B.part = 2;
      B.started = false;
      B.armed = false;
      B.lastTurn = null;
    } else {
      pendingPart2 = false;
      if (P.leaveResults) P.leaveResults(); // the last battle's results leave the phones
      const cfg = P.battle();
      const cycleBars = pattern ? Math.ceil(pattern.dur / 4) : 1;
      const turnBars = cfg.mode === 'duet' ? Math.max(cfg.turnBars, cycleBars) : 0;
      if (cfg.mode === 'duet' && turnBars > cfg.turnBars) {
        RB.toast(`Смяна на всеки ${turnBars} бара: схемата на римите е толкова дълга.`, 3500);
      }
      B = {
        mode: cfg.mode, left: cfg.left, right: cfg.right, part: 1, turnBars,
        round: null, roundP: null, started: false, done: false,
        by: new Map(), bucket: new Map(), tot: { L: 0, R: 0 }, called: { L: 0, R: 0 },
        named: new Set(), seen: 0, recent: { L: [], R: [] }, lastTurn: null, edgeBar: 0,
      };
      resetFx();
    }
    showFx(true);
    edges(null);
    return { mode: B.mode, part: B.part, turnBars: B.turnBars, left: B.left, right: B.right };
  }

  // the beat plays: now the phones may switch to this battle. A new battle waits for
  // ARM_CELLS beats of the count-in (onCell), so a host who starts and leaves at once
  // (mashing Play / Esc to get to the right battle) makes no round and sends nothing.
  const ARM_CELLS = 2;
  function onStarted(G) {
    if (!B || B.started) return;
    if (B.part === 2) {
      B.started = true;
      const b = B;
      b.lastTurn = 'R';
      queue(() => P.net.patchState({ phase: 'live', part: 2, turn: 'R' }), () => { b.lastTurn = null; });
      return;
    }
    B.armed = true;
  }
  function sendStart() {
    B.started = true;
    const b = B;
    // new battle: start_round (one retry), then the first turn
    b.roundP = queue(async () => {
      let n;
      try { n = await P.net.startRound(b.mode, b.left, b.right); }
      catch (e) { n = await P.net.startRound(b.mode, b.left, b.right); }
      b.round = n;
      if (b !== B) { // cancelled while it started: mark the round
        await P.net.saveRound(n, { results: { cancelled: true } });
        await P.net.patchState({ phase: 'lobby', turn: null });
        return;
      }
      b.lastTurn = sideOf(1);
      await P.net.patchState({ turn: b.lastTurn });
    }, () => { b.lastTurn = null; RB.toast('Батълът не стигна до телефоните.', 3000); });
  }

  // the grid rows get the side of their bar (count-in rows stay neutral)
  function decorate(rowsEl, G) {
    [...rowsEl.children].forEach((row, r) => {
      const bar = r - COUNTIN_BARS + 1;
      if (bar < 1) return;
      const s = sideOf(bar);
      row.classList.add('side-' + s);
      // the first row of a turn carries the rapper's name
      if (bar === 1 || sideOf(bar - 1) !== s) {
        row.classList.add('turn-start');
        row.dataset.who = s === 'L' ? `◀ ${nameOf('L')}` : `${nameOf('R')} ▶`;
      }
    });
  }

  // called for the cell a frame lands on; frames can skip cells (slow frames, 2x speed,
  // a hidden tab), so nothing here depends on seeing one exact cell
  function onCell(G, idx) {
    if (!B || idx < 0) return;
    if (B.armed && !B.started && idx >= ARM_CELLS) sendStart();
    const bar = barOf(idx);
    // the TV glow follows the bar the ball is in
    if (bar >= 1 && bar <= G.bars && bar !== B.edgeBar) { B.edgeBar = bar; edges(sideOf(bar)); }
    // the phones get the turn of the bar that starts after this beat when it is the last beat,
    // so the change arrives on time (the update takes about 150 ms)
    if (!B.started || (B.part === 1 && B.round == null)) return;
    const target = sideOf(Math.min(G.bars, Math.max(1, idx % 4 === 3 ? bar + 1 : bar)));
    if (target && target !== B.lastTurn) {
      const b = B;
      b.lastTurn = target;
      queue(() => P.net.patchState({ turn: target }), () => { if (b.lastTurn === target) b.lastTurn = null; });
    }
  }

  function header(G, idx, stall) {
    if (!B) return null;
    if (idx < COUNT_CELLS) {
      const first = up(nameOf(sideOf(1)));
      return ['Пригответе се!', stall ? 'Зарежда…' : idx < 0 ? `Започва ${first}` : `Започва ${first} · ${COUNT_CELLS - idx}`];
    }
    const bar = Math.min(G.bars, barOf(idx));
    const s = sideOf(bar);
    const next = bar < G.bars ? sideOf(bar + 1) : s;
    const label = (side) => (side === 'L' ? `◀ ${up(nameOf('L'))}` : `${up(nameOf('R'))} ▶`);
    const part = B.mode === '1v1' ? ` · част ${B.part}/2` : '';
    if (stall) return [`Бар ${bar} / ${G.bars}${part}`, 'Зарежда…'];
    return [`Бар ${bar} / ${G.bars}${part}`, next !== s ? `Следва ${label(next)}` : label(s)];
  }

  function onEnd(G) {
    if (!B) return;
    if (B.mode === '1v1' && B.part === 1) {
      pendingPart2 = true;
      B.lastTurn = null;
      B.edgeBar = 0;
      edges(null);
      queue(() => P.net.patchState({ phase: 'between', turn: null }));
      againBtn.textContent = `▶ ${B.right} (дясно)`;
      return;
    }
    finish();
  }

  // the battle is complete: save the hype, then the vote
  function finish() {
    const b = B;
    B = null;
    pendingPart2 = false;
    againBtn.textContent = againText;
    edges(null);
    setTimeout(() => { if (!B) showFx(false); }, 2500);
    const mine = ++voteSetup;
    voteSetupAt = Date.now();
    queue(async () => {
      if (b.round == null) { await P.net.patchState({ phase: 'lobby', turn: null }); return; } // start_round failed
      const by = {};
      b.by.forEach((v, uid) => { by[uid] = v; });
      await P.net.saveRound(b.round, { hype: { L: b.tot.L, R: b.tot.R, by } });
      // the vote (js/party-vote.js) runs on its own timer; the queue only starts it
      if (P.startVote) await P.startVote(b.vote = { round: b.round, mode: b.mode, left: b.left, right: b.right, hype: { L: b.tot.L, R: b.tot.R }, by });
      else await P.net.patchState({ phase: 'lobby', turn: null });
    }, () => {
      // only when the vote never started (startVote sets vote.sent after the RPC); a started
      // vote belongs to party-vote.js
      if (!(b.vote && b.vote.sent)) P.net.patchState({ phase: 'lobby', turn: null }).catch(() => {});
    }).then(() => { if (mine === voteSetup) voteSetupAt = 0; });
    P.afterBattle();
  }

  // a battle that did not finish: the round (if it was made) is marked cancelled
  function cancel(silent) {
    if (!B && !pendingPart2) return;
    const b = B;
    B = null;
    pendingPart2 = false;
    againBtn.textContent = againText;
    showFx(false);
    if (silent || !b || !b.started) {
      if (b && b.part === 2) queue(() => P.net.patchState({ phase: 'lobby', turn: null }));
      if (b && b.part === 2 && b.round != null) queue(() => P.net.saveRound(b.round, { results: { cancelled: true } }));
      return;
    }
    queue(async () => {
      if (b.round != null) await P.net.saveRound(b.round, { results: { cancelled: true } });
      await P.net.patchState({ phase: 'lobby', turn: null });
    });
  }

  function onStop(G, why) {
    if (!G.ended) { cancel(); return; }          // left in the middle of a game (or it never started)
    if (pendingPart2 && why === 'menu') cancel(); // 1v1 part 2 never played
    // why === 'restart' after part 1: beginGame starts part 2
    // a finished battle: nothing left to do (a restart starts a new battle)
  }

  function onMenu() {
    if (pendingPart2 || (B && !RB.game.state)) cancel();
    if (P.leaveResults && P.voteState && P.voteState.done) P.leaveResults(); // results → lobby
  }

  // "Нова стая" / "Край на партито" during a battle: the battle is gone (the game keeps playing)
  P.onRoomGone = () => {
    if (B || pendingPart2) RB.toast('Батълът спря: стаята е затворена.', 3000);
    B = null; pendingPart2 = false; againBtn.textContent = againText; showFx(false);
    voteSetupAt = 0;
  };

  // game.js asks before every start: true while the last battle's vote is being set up or runs
  P.startBlocked = () => {
    if (!P.on) return false;
    if (voteSetupAt && Date.now() - voteSetupAt < VOTE_SETUP_MAX_MS) return true;
    return !!(P.voteState && !P.voteState.done);
  };

  // ---------- reactions ----------
  const fx = $('#partyFx');
  const zones = { L: $('#pfxZoneL'), R: $('#pfxZoneR') };
  const bursts = { L: $('#pfxBurstL'), R: $('#pfxBurstR') };
  const callsEl = { L: $('#pfxCallL'), R: $('#pfxCallR') };
  const edgeEl = { L: $('#pfxEdgeL'), R: $('#pfxEdgeR') };
  const pool = [];
  let live = 0;
  const burstN = { L: 0, R: 0 };
  const burstT = { L: 0, R: 0 };

  function showFx(on) {
    fx.classList.toggle('hidden', !on);
    if (!on) recycleAll();
    if (B) { $('#pfxNameL').textContent = B.left; $('#pfxNameR').textContent = B.right; }
    meter();
  }
  function resetFx() {
    burstN.L = burstN.R = 0;
    recycleAll();
    for (const s of ['L', 'R']) { bursts[s].classList.remove('show'); callsEl[s].classList.remove('show'); edgeEl[s].classList.remove('pulse'); }
    meter();
  }
  // a hidden layer gets no animationend: take every flying node back by hand
  function recycleAll() {
    for (const s of ['L', 'R']) {
      [...zones[s].children].forEach((el) => { el.remove(); el.classList.remove('go'); pool.push(el); });
    }
    live = 0;
  }
  function edges(side) {
    edgeEl.L.classList.toggle('on', side === 'L');
    edgeEl.R.classList.toggle('on', side === 'R');
  }
  function meter() {
    const t = B ? B.tot.L + B.tot.R : 0;
    $('#pfxBarL').style.width = `${t ? (B.tot.L / t) * 100 : 50}%`;
  }

  function done(el) {
    if (!el.isConnected) return;
    el.remove(); el.classList.remove('go'); live = Math.max(0, live - 1); pool.push(el);
  }
  function float(side, emoji, name) {
    if (reducedMotion) return;
    if (live >= MAX_FLOATS) { burst(side, 1); return; }
    let el = pool.pop();
    if (!el) {
      el = document.createElement('span');
      el.className = 'pfx-float';
      el.addEventListener('animationend', () => done(el));
      el.addEventListener('animationcancel', () => done(el));
    }
    el.textContent = emoji;
    if (name) { const n = document.createElement('small'); n.textContent = name; el.appendChild(n); }
    el.style.left = `${8 + Math.random() * 72}%`;
    el.style.setProperty('--drift', `${(Math.random() * 2 - 1) * 30}px`);
    el.style.animationDuration = `${1.8 + Math.random() * 0.8}s`;
    zones[side].appendChild(el);
    live++;
    void el.offsetWidth; // restart the animation on a recycled node
    el.classList.add('go');
  }

  function burst(side, n) {
    burstN[side] += n;
    const el = bursts[side];
    el.textContent = `+${burstN[side]} 🔥`;
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(burstT[side]);
    burstT[side] = setTimeout(() => { burstN[side] = 0; }, 1500);
  }

  function hypeCall(side) {
    const tot = B.tot[side];
    let k = B.called[side];
    while (k < CALLS.length && tot >= CALLS[k][0]) k++;
    if (k === B.called[side]) return;
    B.called[side] = k;
    const el = callsEl[side];
    el.textContent = CALLS[k - 1][1];
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  }

  function pulse(side, n) {
    const now = performance.now();
    const r = B.recent[side];
    r.push([now, n]);
    while (r.length && now - r[0][0] > PULSE_MS) r.shift();
    const sum = r.reduce((a, x) => a + x[1], 0);
    if (sum >= PULSE_TAPS) {
      const el = edgeEl[side];
      el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
      B.recent[side] = [];
    }
  }

  const int = (v, max) => Math.max(0, Math.min(max, Math.floor(Number(v) || 0)));

  // how much hype this guest may add now: a token bucket (RATE per second, BURST at once).
  // A payload's uid is not proven by Realtime, so this also limits what a guest who copies
  // another guest's uid can add; the stars decide a battle, hype is only a tiebreak.
  function allowance(uid) {
    const now = performance.now();
    const k = B.bucket.get(uid) || { t: now, v: BURST };
    k.v = Math.min(BURST, k.v + ((now - k.t) / 1000) * RATE);
    k.t = now;
    B.bucket.set(uid, k);
    return k;
  }

  // reactions of a guest whose people row has not arrived yet (two separate channels):
  // keep the newest one per guest and replay it after one people reload
  const waiting = new Map();
  let reloadT = 0;
  function later(p) {
    if (waiting.size >= 200 && !waiting.has(p.uid)) return;
    waiting.set(p.uid, p);
    if (reloadT) return;
    reloadT = setTimeout(async () => {
      try { await P.reloadPeople(); } finally {
        reloadT = 0;
        const list = [...waiting.values()];
        waiting.clear();
        list.forEach((x) => { if (P.people.has(x.uid)) P.onReaction(x); });
      }
    }, 600);
  }

  P.onReaction = (p) => {
    // only guests of this room, only for the battle that runs now
    if (!B || !p || B.round == null || p.round !== B.round) return;
    const st = P.net && P.net.state;
    if (!st || (st.phase !== 'live' && st.phase !== 'between')) return;
    const person = P.people.get(p.uid);
    if (!person) { later(p); return; }
    const prev = B.by.get(p.uid) || { L: 0, R: 0 };
    const k = allowance(p.uid);
    let wantL = Math.max(0, int(p.totL, 1e6) - prev.L), wantR = Math.max(0, int(p.totR, 1e6) - prev.R);
    const room = Math.floor(k.v);
    if (wantL + wantR > room) { // over the allowance: scale both sides down
      const f = room / (wantL + wantR);
      wantL = Math.floor(wantL * f); wantR = Math.floor(wantR * f);
    }
    k.v -= wantL + wantR;
    const next = { L: prev.L + wantL, R: prev.R + wantR };
    B.by.set(p.uid, next);
    const dL = wantL, dR = wantR;
    B.tot.L += dL; B.tot.R += dR;
    const emoji = EMOJI.includes(p.e) ? p.e : EMOJI[0];
    // the name shows on the first reaction of a guest in this battle, then on every 5th
    B.seen++;
    const showName = !person.hidden && (!B.named.has(p.uid) || B.seen % 5 === 0);
    if (showName) B.named.add(p.uid);
    let named = !showName;
    for (const [side, d, n] of [['L', dL, int(p.nL, 20)], ['R', dR, int(p.nR, 20)]]) {
      const shown = Math.min(n, d, 3);
      for (let i = 0; i < shown; i++) { float(side, emoji, !named ? person.name : ''); named = true; }
      if (d > shown) burst(side, d - shown);
      if (d) { pulse(side, d); hypeCall(side); }
    }
    meter();
  };

  // queueWrite: party-vote.js sends its lobby patch through the same queue (order with start_round)
  Object.assign(P, { beginGame, decorate, onStarted, onCell, header, onEnd, onStop, onMenu, sideOf, queueWrite: queue });
  Object.defineProperty(P, 'battleState', { get: () => B }); // tests / debugging
})();
