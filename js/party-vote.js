/* Rimoboy party mode: the vote and the results on the TV (BUILD.md 16.6, milestone P5).
   party-battle.js calls RB.party.startVote(info) when a battle is complete:
     start_vote (20 s on the server clock) → overlay #partyVote with a big countdown, two live
     columns (average stars + votes) and a live feed "Петя — ★★★★☆ · ★★★★★"
     → at 0 (or "Край на гласуването") finish_vote ends the vote on the server and returns the
     final tally with names → reveal (winner, confetti), the who-rated-whom table, top hypers
     and the ranking of the evening → rounds.results + rooms.state.results (the phones show it).
   Also: the "История на батълите" list in the party overlay, and the vote is picked up again
   after a host reload (resumeRoom). */
(function () {
  'use strict';
  const RB = window.RB;
  const P = RB.party;
  if (!P) return;
  const { $, openModal, closeModal, toast } = RB;

  const VOTE_SEC = 20;
  let V = null;          // the vote/results on screen
  let tick = 0, scrollT = 0;

  const stars = (n) => (n ? '★'.repeat(n) + '☆'.repeat(5 - n) : '–');
  const fmtAvg = (a) => (a ? a.toFixed(1).replace('.', ',') : '–');
  const votesWord = (n) => (n === 1 ? '1 глас' : `${n} гласа`);
  const guestName = (uid, fallback) => {
    const p = P.people.get(uid);
    if (p) return p.hidden ? 'Гост' : p.name;
    return fallback || 'Гост';
  };

  // ---------- tally ----------
  // votes: Map uid -> {L, R}; returns {L:{avg,n}, R:{avg,n}}
  function tally(votes) {
    const t = { L: { sum: 0, n: 0 }, R: { sum: 0, n: 0 } };
    votes.forEach((v) => {
      for (const s of ['L', 'R']) if (v[s]) { t[s].sum += v[s]; t[s].n++; }
    });
    const out = {};
    for (const s of ['L', 'R']) out[s] = { avg: t[s].n ? Math.round((t[s].sum / t[s].n) * 100) / 100 : 0, n: t[s].n, sum: t[s].sum };
    return out;
  }
  // stars decide (exact averages: sumL/nL vs sumR/nR, cross-multiplied); a tie on the average
  // goes to the higher hype; then a draw. A side with no votes counts as 0.
  function winnerOf(t, hype) {
    if (!t.L.n && !t.R.n) return 'none';
    const a = t.L.n ? t.L.sum * (t.R.n || 1) : 0, b = t.R.n ? t.R.sum * (t.L.n || 1) : 0;
    if (a !== b) return a > b ? 'L' : 'R';
    if (hype && hype.L !== hype.R) return hype.L > hype.R ? 'L' : 'R';
    return 'tie';
  }

  // ---------- start / live ----------
  P.startVote = async (info) => {
    const r = await P.net.startVote(VOTE_SEC);
    info.sent = true;
    const ends = RBNet.parseTime(r.voteEndsAt);
    open(Object.assign({}, info, { endsAt: isNaN(ends) ? P.net.now() + VOTE_SEC * 1000 : ends }));
  };

  function open(info) {
    clearInterval(tick); clearInterval(scrollT);
    V = Object.assign({ votes: new Map(), order: [], finishing: false, done: false }, info);
    $('#pvTitle').textContent = 'Гласувайте сега!';
    $('#pvWinner').textContent = '';
    $('#pvNameL').textContent = $('#pvThL').textContent = V.left;
    $('#pvNameR').textContent = $('#pvThR').textContent = V.right;
    $('#pvColL').className = 'pv-col L';
    $('#pvColR').className = 'pv-col R';
    $('#pvFeed').textContent = '';
    $('#pvAfter').classList.add('hidden');
    $('#pvStop').classList.remove('hidden');
    $('#pvStop').textContent = 'Край на гласуването';
    $('#pvNext').classList.add('hidden');
    $('#pvClose').classList.add('hidden');
    drawLive();
    openModal('partyVote');
    // votes that came in before the overlay (a reload, or very fast phones)
    // (a live event can be newer than this snapshot: the snapshot only fills sides not seen yet)
    P.net.votes(V.round).then((rows) => { if (V && !V.done) rows.forEach((r) => addVote(r, true)); }).catch(() => {});
    countdown();
    tick = setInterval(countdown, 200);
  }

  function addVote(row, snapshot) {
    if (!V || V.done || row.round !== V.round) return;
    const v = V.votes.get(row.uid) || {};
    if (snapshot && v[row.side]) return;
    v[row.side] = row.stars;
    V.votes.set(row.uid, v);
    V.order = V.order.filter((u) => u !== row.uid);
    V.order.push(row.uid);
    drawLive();
  }
  P.onVote = (row) => addVote(row, false); // party-host.js forwards the Postgres Changes of the votes table

  function drawCols(t) {
    for (const s of ['L', 'R']) {
      $('#pvAvg' + s).textContent = t[s].n ? `${fmtAvg(t[s].avg)} ★` : '–';
      $('#pvN' + s).textContent = votesWord(t[s].n);
      $('#pvBar' + s).style.width = `${(t[s].avg / 5) * 100}%`;
    }
  }

  function drawLive() {
    if (!V) return;
    drawCols(tally(V.votes));
    // the newest 8 voters, newest first
    const feed = $('#pvFeed');
    feed.textContent = '';
    V.order.slice(-8).reverse().forEach((uid) => {
      const v = V.votes.get(uid);
      const line = document.createElement('div');
      line.className = 'pv-line';
      const b = document.createElement('b'); b.textContent = guestName(uid);
      const l = document.createElement('span'); l.className = 'L'; l.textContent = `${V.left} ${stars(v.L)}`;
      const r = document.createElement('span'); r.className = 'R'; r.textContent = `${V.right} ${stars(v.R)}`;
      line.append(b, l, r);
      feed.appendChild(line);
    });
  }

  function countdown() {
    if (!V || V.done) return;
    const left = Math.max(0, Math.ceil((V.endsAt - P.net.now()) / 1000));
    $('#pvCount').textContent = left;
    if (left <= 0) finish();
  }

  // ---------- finish + reveal ----------
  async function finish() {
    if (!V || V.finishing || V.done) return;
    V.finishing = true;
    const v = V;
    const room = P.net.code;
    const same = () => V === v && P.net && P.net.code === room && P.code === room;
    let fin = null, err = null;
    for (let i = 0; i < 3 && !fin; i++) {
      try { fin = await P.net.finishVote(); } catch (e) { err = e; if (e.code === '42501' || e.code === 'RB004') break; await new Promise((r) => setTimeout(r, 800)); }
    }
    if (!same()) return;
    clearInterval(tick);
    if (!fin) {
      // stop here: the host retries with the button (no endless loop on a lasting error)
      v.finishing = false;
      $('#pvStop').textContent = 'Покажи резултата';
      toast(err && err.code === 'RB004' ? 'Гласуването вече не върви.' : 'Гласуването не приключи. Натисни "Покажи резултата".', 3500);
      return;
    }
    v.done = true;
    // the server's list is the result (votes that arrived after the countdown are in it too)
    const votes = new Map();
    const names = new Map();
    fin.votes.forEach((x) => {
      const e = votes.get(x.uid) || {};
      e[x.side] = x.stars;
      votes.set(x.uid, e);
      names.set(x.uid, x.hidden ? 'Гост' : x.name);
    });
    const t = tally(votes);
    const hype = v.hype || { L: 0, R: 0 };
    const win = winnerOf(t, hype);
    const top = topHypers(v.by);
    const results = { L: t.L, R: t.R, winner: win, hype: { L: hype.L, R: hype.R }, topHypers: top, voters: votes.size };
    reveal(v, t, win, votes, names, top);
    const retry = async (fn) => {
      try { await fn(); return true; } catch (e) {
        await new Promise((r) => setTimeout(r, 1000));
        try { if (!same()) return false; await fn(); return true; } catch (e2) { return false; }
      }
    };
    const short = { winner: win, L: { avg: t.L.avg, n: t.L.n }, R: { avg: t.R.avg, n: t.R.n } };
    // two separate writes: the phones need the state one even when the round one fails
    const okRound = same() && await retry(() => P.net.saveRound(v.round, { results }));
    const okState = same() && await retry(() => P.net.patchState({ results: short }));
    if (same() && (!okRound || !okState)) toast('Резултатът не се записа изцяло.', 2500);
    drawRanking(v);
  }

  function topHypers(by) {
    if (!by) return [];
    const list = Object.keys(by).map((uid) => ({ uid, n: (by[uid].L || 0) + (by[uid].R || 0) }));
    return list.filter((x) => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 3)
      .map((x) => ({ name: guestName(x.uid), n: x.n }));
  }

  function reveal(v, t, win, votes, names, top) {
    $('#pvTitle').textContent = 'Резултати';
    $('#pvCount').textContent = '';
    drawCols(t);
    if ((win === 'L' || win === 'R') && fmtAvg(t.L.avg) === fmtAvg(t.R.avg)) {
      for (const s of ['L', 'R']) $('#pvAvg' + s).textContent = `${t[s].avg.toFixed(2).replace('.', ',')} ★`;
    }
    $('#pvFeed').textContent = '';
    if (win === 'L' || win === 'R') {
      $('#pvWinner').textContent = `ПОБЕДИТЕЛ: ${String(win === 'L' ? v.left : v.right).toLocaleUpperCase('bg')}`;
      $('#pvCol' + win).classList.add('win');
      $('#pvCol' + (win === 'L' ? 'R' : 'L')).classList.add('lose');
      if (RB.end && RB.end.confetti) RB.end.confetti();
    } else {
      $('#pvWinner').textContent = win === 'tie' ? 'Равенство!' : 'Няма гласове';
    }
    // who rated whom, sorted by name
    const body = $('#pvTable');
    body.textContent = '';
    const rows = [...votes.entries()].map(([uid, x]) => ({ name: names.get(uid) || guestName(uid), x }))
      .sort((a, b) => a.name.localeCompare(b.name, 'bg'));
    for (const r of rows) {
      const tr = document.createElement('tr');
      const n = document.createElement('td'); n.textContent = r.name;
      const l = document.createElement('td'); l.className = r.x.L ? 'st' : 'none'; l.textContent = stars(r.x.L);
      const rr = document.createElement('td'); rr.className = r.x.R ? 'st' : 'none'; rr.textContent = stars(r.x.R);
      tr.append(n, l, rr);
      body.appendChild(tr);
    }
    if (!rows.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td'); td.colSpan = 3; td.className = 'none'; td.textContent = 'Никой не гласува.';
      tr.appendChild(td); body.appendChild(tr);
    }
    const hy = $('#pvHypers');
    hy.textContent = '';
    if (!top.length) { const li = document.createElement('li'); li.textContent = '–'; hy.appendChild(li); }
    top.forEach((h) => {
      const li = document.createElement('li');
      li.textContent = `${h.name} `;
      const s = document.createElement('small'); s.textContent = `🔥 × ${h.n}`; li.appendChild(s);
      hy.appendChild(li);
    });
    $('#pvAfter').classList.remove('hidden');
    $('#pvStop').classList.add('hidden');
    $('#pvNext').classList.remove('hidden');
    $('#pvClose').classList.remove('hidden');
    $('#pvNext').focus({ preventScroll: true });
    autoScroll();
  }

  // a long table scrolls by itself on the TV, pauses at both ends
  let topT = 0;
  function autoScroll() {
    clearInterval(scrollT); clearTimeout(topT);
    const w = $('#pvTableWrap');
    w.scrollTop = 0;
    if (w.scrollHeight <= w.clientHeight + 2) return; // fits: nothing to scroll
    let wait = 60;
    scrollT = setInterval(() => {
      if (wait > 0) { wait--; return; }
      w.scrollTop += 1;
      if (w.scrollTop + w.clientHeight >= w.scrollHeight - 1) { wait = 80; clearTimeout(topT); topT = setTimeout(() => { w.scrollTop = 0; }, 2500); }
    }, 40);
  }

  // the evening so far: finished battles, best winner average first
  async function drawRanking(v) {
    const ol = $('#pvRank');
    ol.textContent = '';
    let rounds = [];
    try { rounds = await P.net.rounds(); } catch (e) { /* empty list */ }
    const done = rounds.filter((r) => r.results && !r.results.cancelled && (r.results.winner === 'L' || r.results.winner === 'R'));
    done.sort((a, b) => b.results[b.results.winner].avg - a.results[a.results.winner].avg);
    if (!done.length) { const li = document.createElement('li'); li.textContent = '–'; ol.appendChild(li); }
    done.slice(0, 5).forEach((r) => {
      const w = r.results.winner;
      const li = document.createElement('li');
      li.textContent = `${w === 'L' ? r.left_name : r.right_name} `;
      const s = document.createElement('small');
      s.textContent = `${fmtAvg(r.results[w].avg)} ★ · батъл ${r.round}${r.round === v.round ? ' (сега)' : ''}`;
      li.appendChild(s);
      ol.appendChild(li);
    });
  }

  // ---------- leaving the results ----------
  function closeUI() {
    clearInterval(tick); clearInterval(scrollT); clearTimeout(topT);
    closeModal('partyVote');
  }
  // back to the lobby on the phones (a new battle, the menu, "Нов батъл")
  // a vote that is still running is never dropped (returns false then)
  P.leaveResults = () => {
    const was = V;
    if (!was) return true;
    if (!was.done) return false;
    V = null;
    closeUI();
    if (P.on && P.net) P.queueWrite(() => P.net.patchState({ phase: 'lobby', turn: null, results: null }));
    return true;
  };
  $('#pvStop').addEventListener('click', () => {
    if (!V || V.finishing) return;
    V.endsAt = P.net.now();
    finish();
  });
  $('#pvNext').addEventListener('click', () => { P.leaveResults(); RB.toMenu(); });
  $('#pvClose').addEventListener('click', () => { if (V && V.done) closeUI(); });
  window.addEventListener('keydown', (e) => {
    if ($('#partyVote').classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); if (V && V.done) closeUI(); return; }
    if (e.code === 'Space') { e.preventDefault(); e.stopImmediatePropagation(); return; } // no click on a focused button
    if (e.code === 'KeyP' || e.code === 'KeyT') e.stopImmediatePropagation();
  }, true);

  P.onRoomGone2 = () => { V = null; closeUI(); };

  // ---------- after a host reload ----------
  // a vote that was running continues; a battle that was running is lost (no game), back to lobby
  P.resumeRoom = async (state) => {
    if (!state) return;
    if (state.phase === 'vote' && state.round != null) {
      let hype = null, by = null;
      try {
        const rows = await P.net.rounds();
        const r = rows.find((x) => x.round === state.round);
        if (r && r.hype) { hype = { L: r.hype.L || 0, R: r.hype.R || 0 }; by = r.hype.by || null; }
      } catch (e) { /* no hype then */ }
      open({ round: state.round, left: state.left || 'Играч 1', right: state.right || 'Играч 2', hype, by,
        endsAt: RBNet.parseTime(state.voteEndsAt) || P.net.now() });
    } else if (state.phase === 'results' && !state.results && state.round != null) {
      // the host left between finish_vote and the result write: finish again (it is safe)
      open({ round: state.round, left: state.left || 'Играч 1', right: state.right || 'Играч 2', hype: null, by: null, endsAt: P.net.now() });
    } else if (state.phase === 'live' || state.phase === 'between') {
      P.net.patchState({ phase: 'lobby', turn: null }).catch(() => {});
    }
  };

  // ---------- history (party overlay) ----------
  $('#poHist').addEventListener('toggle', async () => {
    if (!$('#poHist').open || !P.net || !P.code) return;
    const box = $('#poHistBody');
    box.textContent = 'Зарежда…';
    let rounds = [], votes = [];
    try { [rounds, votes] = await Promise.all([P.net.rounds(), P.net.votes()]); } catch (e) { box.textContent = 'Не се зареди.'; return; }
    box.textContent = '';
    const list = rounds.filter((r) => r.results).reverse();
    if (!list.length) { const p = document.createElement('p'); p.className = 'po-hint'; p.textContent = 'Още няма батъли.'; box.appendChild(p); return; }
    for (const r of list) {
      const item = document.createElement('div');
      item.className = 'ph-item';
      const title = document.createElement('div');
      title.className = 'ph-title';
      title.textContent = `Батъл ${r.round} · ${r.mode === '1v1' ? '1 на 1' : 'Дует'} · ${r.left_name} срещу ${r.right_name}`;
      const sub = document.createElement('div');
      sub.className = 'ph-sub';
      const res = r.results;
      if (res.cancelled) sub.textContent = 'Прекъснат';
      else {
        const w = res.winner === 'L' ? r.left_name : res.winner === 'R' ? r.right_name : null;
        sub.textContent = `${w ? 'Победител: ' + w : res.winner === 'tie' ? 'Равенство' : 'Няма гласове'} · ${fmtAvg(res.L.avg)} ★ / ${fmtAvg(res.R.avg)} ★ · ${res.voters || 0} гласували`;
      }
      item.append(title, sub);
      const mine = new Map();
      votes.filter((x) => x.round === r.round).forEach((x) => {
        const e = mine.get(x.uid) || {}; e[x.side] = x.stars; mine.set(x.uid, e);
      });
      if (mine.size) {
        const tb = document.createElement('table');
        const head = document.createElement('tr');
        ['Гост', r.left_name, r.right_name].forEach((h) => { const th = document.createElement('th'); th.textContent = h; head.appendChild(th); });
        tb.appendChild(head);
        [...mine.entries()].map(([uid, x]) => ({ n: guestName(uid), x })).sort((a, b) => a.n.localeCompare(b.n, 'bg')).forEach((row) => {
          const tr = document.createElement('tr');
          const a = document.createElement('td'); a.textContent = row.n;
          const b = document.createElement('td'); b.className = 'st'; b.textContent = stars(row.x.L);
          const c = document.createElement('td'); c.className = 'st'; c.textContent = stars(row.x.R);
          tr.append(a, b, c); tb.appendChild(tr);
        });
        item.appendChild(tb);
      }
      box.appendChild(item);
    }
  });

  Object.defineProperty(P, 'voteState', { get: () => V }); // tests / debugging
})();
