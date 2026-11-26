/* Rimoboy party mode: phone page logic (party.html; BUILD.md section 16.8).
   P1 version: join, lobby, live tap zones + emoji, vote with stars, simple messages.
   The page always draws itself from rooms.state, so a reload or a woken phone lands in
   the right phase. Reactions go to the host in batches (RBNet.SEND_MS) with running totals. */
(function () {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const EMOJI = ['🔥', '😂', '🤯', '👏', '💀'];
  const MAX_TAPS_PER_SEC = 6;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    sget(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    sset(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };

  const views = ['vJoin', 'vMsg', 'vLive', 'vVote'];
  function show(id) { views.forEach((v) => { $('#' + v).hidden = v !== id; }); }
  function msg(text, sub) { $('#msgText').textContent = text; $('#msgSub').textContent = sub || ''; show('vMsg'); }

  const code = window.RBNet && RBNet.normCode(new URLSearchParams(location.search).get('r'));
  let net = null;
  let state = null;
  let round = null;
  let emoji = EMOJI[0];
  let tot = { L: 0, R: 0 };      // this phone's taps in the current round
  let pend = { L: 0, R: 0 };     // taps not sent yet
  let tapTimes = [];
  let myVotes = {};
  let voteQ = { L: null, R: null };   // per side: {busy, want}: one upsert in flight, the latest value wins
  let wake = null, wakeP = null, wakeWant = false;
  let voteTimer = 0;
  let joined = false;
  let lastSend = 0;
  const HEARTBEAT_MS = 5000;     // while live, resend the totals at least this often

  // ---------- join ----------
  async function boot() {
    if (!code) return msg('Невалиден линк.', 'Сканирай кода от екрана отново.');
    $('#pCode').textContent = code;
    if (!RBNet.available()) return msg('Няма връзка.', 'Партито иска интернет.');
    net = new RBNet.PartyNet();
    try { await net.signIn(); } catch (e) {
      return msg('Партито още не е готово.', e.code === 'anonymous_provider_disabled' ? 'Входът за гости е изключен.' : 'Опитай пак след малко.');
    }
    const name = store.get('rb_partyName') || '';
    $('#joinName').value = name;
    if (name && store.get('rb_partyRoom') === code) return join(name); // rejoin after a reload
    show('vJoin');
    $('#joinName').focus();
  }

  async function join(name) {
    $('#joinBtn').disabled = true;
    $('#joinErr').textContent = '';
    try {
      const st = await net.join(code, name);
      store.set('rb_partyName', name);
      store.set('rb_partyRoom', code);
      if (!joined) { // a rename or a retry must not stack feeds and timers
        joined = true;
        net.watchRoom({
          onState: render,
          onStatus: (s) => { if (s === 'SUBSCRIBED') refresh(); },
        });
        setInterval(() => net.touch().catch(() => {}), 30000);
      }
      render(st);
    } catch (e) {
      show('vJoin');
      $('#joinErr').textContent = e.code === 'P0002' ? 'Няма такава стая.' : e.code === 'P0001' ? 'Партито свърши.'
        : e.code === 'P0003' ? 'Стаята е пълна.' : e.code === '23514' ? 'Името не става. Опитай с друго.' : 'Не стана. Опитай пак.';
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

  async function refresh() {
    try { render(await net.readState()); } catch (e) { /* keep the last state */ }
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state) refresh(); });

  // ---------- render from state ----------
  function render(st) {
    const wasLive = state && (state.phase === 'live' || state.phase === 'between');
    state = st || { phase: 'lobby' };
    if (wasLive && state.phase !== 'live' && state.phase !== 'between') flush(true); // last taps of the battle
    if (state.round != null && state.round !== round) newRound(state.round);
    const L = state.left || 'Играч 1', R = state.right || 'Играч 2';
    $('#nameL').textContent = $('#vNameL').textContent = L;
    $('#nameR').textContent = $('#vNameR').textContent = R;
    clearInterval(voteTimer);
    switch (state.phase) {
      case 'live':
      case 'between':
        show('vLive');
        $('#zoneL').classList.toggle('on', state.turn === 'L' || (state.phase === 'live' && state.mode === '1v1' && state.part === 1));
        $('#zoneR').classList.toggle('on', state.turn === 'R' || (state.mode === '1v1' && (state.part === 2 || state.phase === 'between')));
        lockScreen(true);
        break;
      case 'vote':
        show('vVote');
        drawStars();
        tickVote();
        voteTimer = setInterval(tickVote, 250);
        lockScreen(false);
        break;
      case 'results':
        msg('Резултатите са на екрана!', `Ти даде 🔥 × ${tot.L + tot.R}`);
        lockScreen(false);
        break;
      case 'closed':
        if (state.moved) msg('Тази стая е затворена.', 'Сканирай новия код от екрана.');
        else msg('Партито свърши.', 'Благодарим!');
        lockScreen(false);
        break;
      default:
        msg('Чакаме батъла…', state.left ? `${L} (ляво) срещу ${R} (дясно)` : 'Ще започне скоро.');
        lockScreen(false);
    }
  }

  function newRound(r) {
    flush(true);
    round = r;
    const saved = store.sget(`rb_hype_${code}_${r}`);
    tot = saved && typeof saved.L === 'number' ? saved : { L: 0, R: 0 };
    pend = { L: 0, R: 0 };
    myVotes = store.sget(`rb_votes_${code}_${r}`) || {};
    voteQ = { L: null, R: null };
    $('#cntL').textContent = tot.L;
    $('#cntR').textContent = tot.R;
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
    net.sendUp(payload).catch(() => {
      // put the taps back for the next batch (same round only); the totals are resent anyway
      if (round === r) { pend.L += sent.L; pend.R += sent.R; }
      lastSend = 0;
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
      box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.v <= v));
    });
  }

  // one upsert in flight per side; taps while it runs only change the wanted value, and the
  // latest one is sent next, so the screen and the database always end up the same
  let saved = {};   // what the database has, per side
  function vote(side, stars) {
    myVotes[side] = stars;
    drawStars();
    $('#voteErr').textContent = '';
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
        if (round === r) store.sset(`rb_votes_${code}_${r}`, Object.assign({}, myVotes, { [side]: v }));
      } catch (e) {
        if (round === r) {
          myVotes[side] = saved[side + r] || 0;
          drawStars();
          $('#voteErr').textContent = 'Гласуването приключи.';
        }
        q.want = 0;
      }
    }
    q.busy = false;
  }

  function tickVote() {
    const end = RBNet.parseTime(state.voteEndsAt);
    const left = isNaN(end) ? 0 : Math.max(0, Math.ceil((end - net.now()) / 1000));
    $('#voteLeft').textContent = left;
  }

  boot();
})();
