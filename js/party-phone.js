/* Rimoboy party mode: the guest phone page (party.html; BUILD.md 16.8, milestones P1 + P4).
   Views: join (and rename) → lobby → live tap zones (+ "between" in a 1v1) → vote → results.
   The page always draws itself from rooms.state, so a reload, a woken phone or a reconnect
   lands in the right phase. Reactions go to the host in batches (RBNet.SEND_MS) with running
   totals; a failed batch is put back and the totals are resent while the battle runs. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const EMOJI = ['🔥', '😂', '🤯', '👏', '💀'];
  const MAX_TAPS_PER_SEC = 6;
  const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const HEARTBEAT_MS = 5000;     // while live, resend the totals at least this often

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    sget(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    sset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  const views = ['vJoin', 'vMsg', 'vLobby', 'vLive', 'vVote', 'vRes'];
  function show(id) { views.forEach((v) => { $('#' + v).hidden = v !== id; }); }
  function msg(text, sub) { $('#msgText').textContent = text; $('#msgSub').textContent = sub || ''; show('vMsg'); }
  const stars = (n) => (n ? '★'.repeat(n) : '–');
  const fmtAvg = (a) => (a ? a.toFixed(1).replace('.', ',') : '–');

  const code = window.RBNet && RBNet.normCode(new URLSearchParams(location.search).get('r'));
  let net = null;
  let state = null;
  let round = null;
  let myName = '';
  let renaming = false;
  let emoji = EMOJI[0];
  let tot = { L: 0, R: 0 };      // this phone's taps in the current round
  let pend = { L: 0, R: 0 };     // taps not sent yet
  let tapTimes = [];
  let myVotes = {};
  let voteQ = { L: null, R: null };   // per side: {busy, want}: one upsert in flight, the latest value wins
  let saved = {};                // what the database has, per side + round
  let wake = null, wakeP = null, wakeWant = false;
  let voteTimer = 0, votePoll = 0;
  let joined = false;
  let lastSend = 0;

  // ---------- connection status ----------
  // the pill shows while the live channel is down OR the last request failed; a successful
  // request alone does not hide it while the channel is down (no live updates then), so a
  // poll reads the state meanwhile
  let netBad = false, chOk = true, pollT = 0;
  function drawNet() { $('#pNet').hidden = chOk && !netBad; }
  function netState(ok) { netBad = !ok; drawNet(); }
  function channelState(ok) {
    chOk = ok;
    drawNet();
    clearInterval(pollT);
    if (!ok) pollT = setInterval(refresh, 5000);
  }
  window.addEventListener('offline', () => netState(false));
  window.addEventListener('online', () => { refresh(); });

  // ---------- join ----------
  async function boot() {
    if (!code) return msg('Невалиден линк.', 'Сканирай кода от екрана отново.');
    $('#pCode').textContent = code;
    if (!RBNet.available()) return msg('Няма връзка.', 'Партито иска интернет. Включи мобилните данни или Wi-Fi и презареди.');
    net = new RBNet.PartyNet();
    try { await net.signIn(); } catch (e) {
      const limit = /rate|limit|429/i.test(String(e.message || '') + e.code);
      return msg('Не можеш да влезеш точно сега.', e.code === 'anonymous_provider_disabled' ? 'Входът за гости е изключен.'
        : limit ? 'Твърде много нови гости от тази мрежа. Опитай с мобилни данни или след малко.' : 'Опитай пак след малко.');
    }
    const name = store.get('rb_partyName') || '';
    $('#joinName').value = name;
    if (name && store.get('rb_partyRoom') === code) return join(name); // rejoin after a reload
    show('vJoin');
    $('#joinName').focus();
  }

  // the live feed of rooms.state. supabase-js rejoins a channel after CHANNEL_ERROR / TIMED_OUT
  // by itself; a CLOSED channel is not rejoined, so it is made again
  let rewatchT = 0;
  function watch() {
    net.watchRoom({
      onState: (s) => { channelState(true); render(s); },
      onStatus: (s) => {
        if (s === 'SUBSCRIBED') { channelState(true); refresh(); }
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') channelState(false);
        else if (s === 'CLOSED') {
          channelState(false);
          clearTimeout(rewatchT);
          rewatchT = setTimeout(async () => { await net.unlisten(); watch(); }, 2000);
        }
      },
    });
  }

  async function join(name) {
    $('#joinBtn').disabled = true;
    $('#joinErr').textContent = '';
    try {
      const st = await net.join(code, name);
      myName = name;
      renaming = false;
      store.set('rb_partyName', name);
      store.set('rb_partyRoom', code);
      $('#meName').textContent = name;
      if (!joined) { // a rename or a retry must not stack feeds and timers
        joined = true;
        watch();
        setInterval(() => net.touch().then(() => { if (netBad) refresh(); }).catch(() => netState(false)), 30000);
      }
      render(st);
    } catch (e) {
      show('vJoin');
      $('#joinErr').textContent = e.code === 'P0002' ? 'Няма такава стая. Провери кода.' : e.code === 'P0001' ? 'Тази стая е затворена. Сканирай кода от екрана.'
        : e.code === 'P0003' ? 'Стаята е пълна.' : e.code === '23514' ? 'Името не става. Опитай с друго.' : 'Не стана. Провери връзката и опитай пак.';
    } finally {
      $('#joinBtn').disabled = false;
    }
  }

  $('#joinForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = RBNet.cleanName($('#joinName').value);
    $('#joinName').value = name;
    if (name) join(name);
    else $('#joinErr').textContent = 'Напиши име.';
  });
  $('#renameBtn').addEventListener('click', () => {
    renaming = true;
    $('#joinName').value = myName;
    $('#joinBtn').textContent = 'Запази';
    $('#renameCancel').hidden = false;
    show('vJoin');
    $('#joinName').focus();
    $('#joinName').select();
  });
  $('#renameCancel').addEventListener('click', () => { renaming = false; render(state); });

  async function refresh() {
    if (!net || !joined) return;
    try { const s = await net.readState(); netState(true); render(s); } catch (e) { netState(false); }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && joined) refresh(); });

  // ---------- render from state ----------
  function render(st) {
    const wasLive = state && (state.phase === 'live' || state.phase === 'between');
    state = st || { phase: 'lobby' };
    if (wasLive && state.phase !== 'live' && state.phase !== 'between') flush(true); // last taps of the battle
    if (state.round != null && state.round !== round) newRound(state.round);
    const L = state.left || 'Играч 1', R = state.right || 'Играч 2';
    $('#nameL').textContent = $('#vNameL').textContent = $('#resNameL').textContent = L;
    $('#nameR').textContent = $('#vNameR').textContent = $('#resNameR').textContent = R;
    clearInterval(voteTimer);
    clearInterval(votePoll); votePoll = 0;
    // the rename form stays open only in the lobby: a battle or a vote takes over the screen
    if (renaming && state.phase === 'lobby') { lockScreen(false); return; }
    renaming = false;
    $('#joinBtn').textContent = 'Влизам';
    $('#renameCancel').hidden = true;
    switch (state.phase) {
      case 'live':
      case 'between': {
        show('vLive');
        const between = state.phase === 'between';
        const onL = !between && (state.turn === 'L' || (state.mode === '1v1' && state.part === 1));
        const onR = between || state.turn === 'R' || (state.mode === '1v1' && state.part === 2);
        $('#zoneL').classList.toggle('on', onL && !onR);
        $('#zoneR').classList.toggle('on', onR && !onL);
        $('#liveBanner').textContent = between ? `Следва ${R} ▶`
          : state.turn === 'L' ? `◀ ${L} рапира` : state.turn === 'R' ? `${R} рапира ▶` : 'Тапай за хайп!';
        lockScreen(true);
        break;
      }
      case 'vote':
        show('vVote');
        drawStars();
        voteNote();
        tickVote();
        voteTimer = setInterval(tickVote, 250);
        lockScreen(false);
        break;
      case 'results':
        drawResults();
        show('vRes');
        lockScreen(false);
        break;
      case 'closed':
        renaming = false;
        if (state.moved) msg('Тази стая е затворена.', 'Сканирай новия код от екрана.');
        else msg('Партито свърши.', 'Благодарим!');
        lockScreen(false);
        break;
      default: // lobby
        show('vLobby');
        $('#lobbySub').textContent = state.left
          ? `Последно: ${L} (ляво) срещу ${R} (дясно). Гледай екрана за следващия.`
          : 'Гледай екрана: скоро започва.';
        lockScreen(false);
    }
  }

  function newRound(r) {
    flush(true);
    round = r;
    const kept = store.sget(`rb_hype_${code}_${r}`);
    tot = kept && typeof kept.L === 'number' ? kept : { L: 0, R: 0 };
    pend = { L: 0, R: 0 };
    myVotes = store.sget(`rb_votes_${code}_${r}`) || {};
    voteQ = { L: null, R: null };
    // what was saved before a reload counts as saved (it came back from sessionStorage)
    for (const s of ['L', 'R']) if (myVotes[s]) saved[s + r] = myVotes[s];
    $('#cntL').textContent = tot.L;
    $('#cntR').textContent = tot.R;
  }

  function drawResults() {
    const res = state.results;
    const mine = `Ти даде: ${stars(myVotes.L)} / ${stars(myVotes.R)} · 🔥 × ${tot.L + tot.R}`;
    $('#resMine').textContent = mine;
    $('#resColL').className = 'ph-res-col L';
    $('#resColR').className = 'ph-res-col R';
    if (!res) { $('#resTitle').textContent = 'Резултатите идват…'; ['L', 'R'].forEach((s) => { $('#resAvg' + s).textContent = '–'; $('#resN' + s).textContent = ''; }); return; }
    for (const s of ['L', 'R']) {
      const x = res[s] || { avg: 0, n: 0 };
      $('#resAvg' + s).textContent = x.n ? `${fmtAvg(x.avg)} ★` : '–';
      $('#resN' + s).textContent = x.n === 1 ? '1 глас' : `${x.n || 0} гласа`;
    }
    const w = res.winner;
    if (w === 'L' || w === 'R') {
      $('#resTitle').textContent = `🏆 ${w === 'L' ? state.left : state.right}`;
      $('#resCol' + w).classList.add('win');
    } else {
      $('#resTitle').textContent = w === 'tie' ? 'Равенство!' : 'Няма гласове';
    }
  }

  // ---------- live taps ----------
  const row = $('#emojiRow');
  EMOJI.forEach((e) => {
    const b = document.createElement('button');
    b.type = 'button'; b.textContent = e;
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(e === emoji));
    b.addEventListener('click', () => {
      emoji = e;
      row.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    });
    row.appendChild(b);
  });

  function tap(side, el) {
    const now = performance.now();
    tapTimes = tapTimes.filter((t) => now - t < 1000);
    if (tapTimes.length >= MAX_TAPS_PER_SEC) return;
    tapTimes.push(now);
    tot[side]++; pend[side]++;
    $('#cnt' + side).textContent = tot[side];
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
    // a small emoji pops up (removed by a timer: with reduced motion there is no animationend)
    if (!reducedMotion) {
      const pop = document.createElement('span');
      pop.className = 'ph-pop'; pop.textContent = emoji;
      el.appendChild(pop);
      setTimeout(() => pop.remove(), 800);
    }
    if (navigator.vibrate) navigator.vibrate(10);
  }
  $('#zoneL').addEventListener('pointerdown', (e) => { e.preventDefault(); tap('L', e.currentTarget); });
  $('#zoneR').addEventListener('pointerdown', (e) => { e.preventDefault(); tap('R', e.currentTarget); });

  // send the new taps (and the running totals). force = also with no new taps (phase change,
  // heartbeat), so the host always ends up with this phone's final totals.
  function flush(force) {
    if (!net || !joined || round == null) return;
    const live = state && (state.phase === 'live' || state.phase === 'between');
    const beat = live && Date.now() - lastSend > HEARTBEAT_MS && (tot.L || tot.R);
    if (!pend.L && !pend.R && !(force && (tot.L || tot.R)) && !beat) return;
    const sent = pend, r = round;
    const payload = { uid: net.uid, e: emoji, nL: sent.L, nR: sent.R, totL: tot.L, totR: tot.R, round: r, at: Date.now() };
    pend = { L: 0, R: 0 };
    lastSend = Date.now();
    store.sset(`rb_hype_${code}_${r}`, tot);
    net.sendUp(payload).then(() => { if (netBad) netState(true); }).catch(() => {
      // put the taps back for the next batch (same round only); the totals are resent anyway
      if (round === r) { pend.L += sent.L; pend.R += sent.R; }
      lastSend = 0;
      netState(false);
    });
  }
  setInterval(() => flush(false), RBNet.SEND_MS);

  // Screen Wake Lock during the song; tracks a pending request so a release is never lost
  function lockScreen(on) {
    wakeWant = on;
    if (!navigator.wakeLock) return;
    if (on && !wake && !wakeP) {
      wakeP = navigator.wakeLock.request('screen')
        .then((w) => {
          wake = w;
          w.addEventListener('release', () => { if (wake === w) wake = null; });
          if (!wakeWant) { wake = null; return w.release(); }
        })
        .catch(() => { wake = null; })
        .finally(() => { wakeP = null; });
    } else if (!on && wake) {
      const w = wake; wake = null;
      w.release().catch(() => {});
    }
  }
  // the browser drops the lock when the page is hidden: take it again when it comes back
  document.addEventListener('visibilitychange', () => { if (!document.hidden && wakeWant) lockScreen(true); });

  // ---------- vote ----------
  document.querySelectorAll('.stars').forEach((box) => {
    for (let i = 1; i <= 5; i++) {
      const b = document.createElement('button');
      b.type = 'button'; b.textContent = '★'; b.dataset.v = i;
      b.setAttribute('aria-label', `${i} от 5`);
      b.addEventListener('click', () => vote(box.dataset.side, i));
      box.appendChild(b);
    }
  });

  function drawStars() {
    document.querySelectorAll('.stars').forEach((box) => {
      const v = myVotes[box.dataset.side] || 0;
      box.querySelectorAll('button').forEach((b) => {
        b.classList.toggle('on', +b.dataset.v <= v);
        b.setAttribute('aria-pressed', String(+b.dataset.v === v));
      });
    });
  }

  // one upsert in flight per side; taps while it runs only change the wanted value, and the
  // latest one is sent next, so the screen and the database always end up the same
  function vote(side, stars) {
    if (voteClosed()) { $('#voteErr').textContent = 'Гласуването приключи.'; return; }
    myVotes[side] = stars;
    drawStars();
    $('#voteErr').textContent = '';
    if (navigator.vibrate) navigator.vibrate(8);
    const q = voteQ[side] || (voteQ[side] = { busy: false, want: 0 });
    q.want = stars;
    if (!q.busy) pump(side, q, round);
  }
  async function pump(side, q, r) {
    q.busy = true;
    while (q.want && q.want !== saved[side + r]) {
      const v = q.want;
      try {
        await net.vote(r, side, v);
        saved[side + r] = v;
        if (round === r) {
          store.sset(`rb_votes_${code}_${r}`, Object.assign({}, myVotes, { [side]: v }));
          voteNote();
        }
      } catch (e) {
        if (q.want !== v && !voteClosed()) continue; // a newer tap came in meanwhile: send that one
        if (round === r) {
          myVotes[side] = saved[side + r] || 0;
          drawStars();
          voteNote();
          $('#voteErr').textContent = voteClosed() ? 'Гласуването приключи.' : 'Не стана. Тапни звездите пак.';
        }
        q.want = 0;
      }
    }
    q.busy = false;
  }

  // the "saved" line, from what the database has for this round
  function voteNote() {
    const l = saved['L' + round], r = saved['R' + round];
    $('#voteOk').textContent = l && r ? '✓ Гласът ти е записан. Можеш да го смениш.' : l || r ? '✓ Записано. Оцени и другия.' : '';
  }

  function voteClosed() {
    const end = RBNet.parseTime(state && state.voteEndsAt);
    return !state || state.phase !== 'vote' || (!isNaN(end) && net.now() > end + 1500);
  }

  function tickVote() {
    const end = RBNet.parseTime(state.voteEndsAt);
    const left = isNaN(end) ? 0 : Math.max(0, Math.ceil((end - net.now()) / 1000));
    $('#voteLeft').textContent = left ? left : '0';
    document.querySelectorAll('.stars button').forEach((b) => { b.disabled = !left; });
    // after the end: wait for the results, and read the state now and then in case the
    // update was missed or the host is gone for a moment
    if (!left && !isNaN(end) && net.now() > end + 1000) {
      $('#voteOk').textContent = 'Гласуването приключи. Чакаме резултатите…';
      if (!votePoll) votePoll = setInterval(refresh, 3000);
    }
  }

  boot();
})();
