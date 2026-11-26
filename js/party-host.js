/* Rimoboy party mode: host side in index.html (BUILD.md 16.5, milestone P2).
   🎉 button → a room with a unique code → big QR overlay with the guests joining live
   (tap a name to hide it), a party strip in the menu (format, turn length, rapper names),
   a mini QR in the corner, "Нова стая" and "Край на партито".
   supabase-js and the QR library load only when party mode starts (the rest of the app
   stays offline-safe). The room id lives in sessionStorage, so a reload keeps the room.
   Exposes RB.party = {on, code, net, people, battle(), afterBattle(), open(), close()}.
   P3 (battles in the game) builds on battle()/afterBattle() and RB.party.net. */
(function () {
  'use strict';
  const RB = window.RB;
  const { $, toast, openModal, closeModal } = RB;

  // pinned versions with Subresource Integrity: a changed file on the CDN is refused
  const LIBS = [
    ['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.119.2/dist/umd/supabase.js',
      'sha384-A97u3Qnt9GZHURO9YJZRe7VQgGUeFzcv6I1oIGnUTxQrCxnpQMwR0/G8F2zt9abZ'],
    ['https://cdn.jsdelivr.net/npm/qrcode-generator@2.0.4/dist/qrcode.js',
      'sha384-e9EFD6BGC90bkW9aDV5xbbBfzwN7G8YImHao2lfLVKV/hPB0E0go+H3I64h7oHtA'],
  ];
  const DEFAULT_L = 'Играч 1', DEFAULT_R = 'Играч 2';
  const AWAY_MS = 120000; // "Влезли" counts guests seen in the last 2 minutes

  const ss = {
    get(k) { try { return JSON.parse(sessionStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
    del(k) { try { sessionStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };

  let net = null;
  let busy = false;
  const people = new Map(); // uid -> people row
  const P = { on: false, code: null };
  const battleCfg = Object.assign({ mode: 'duet', turnBars: 4, same: false, left: '', right: '' }, ss.get('rb_partyBattle') || {});

  // ---------- libraries ----------
  let libsP = null;
  function loadLibs() {
    if (!libsP) {
      libsP = Promise.all(LIBS.map(([src, sri]) => new Promise((res, rej) => {
        if (/supabase/.test(src) ? window.supabase : window.qrcode) { res(); return; }
        const s = document.createElement('script');
        s.src = src; s.async = false;
        s.integrity = sri; s.crossOrigin = 'anonymous';
        s.onload = res;
        s.onerror = () => rej(new Error('lib ' + src));
        document.head.appendChild(s);
      }))).catch((e) => { libsP = null; throw e; });
    }
    return libsP;
  }

  // ---------- QR ----------
  function qrSvg(text) {
    const qr = window.qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    const n = qr.getModuleCount(), m = 3; // 3-module quiet zone (the cream box adds more)
    let d = '';
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c + m} ${r + m}h1v1h-1z`;
    }
    const size = n + 2 * m;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">` +
      `<rect width="${size}" height="${size}" fill="#fff4d6"/><path d="${d}" fill="#1a1030"/></svg>`;
  }

  // ---------- start / resume / end ----------
  async function connect() {
    const cfg = window.RB_PARTY;
    if (!window.RBNet || !cfg || !cfg.url || navigator.onLine === false) throw new Error('offline');
    await loadLibs();
    if (!RBNet.available()) throw new Error('offline');
    if (!net) net = new RBNet.PartyNet({ storageKey: 'rb-party-host' });
    await net.signIn();
    try { await net.syncNow(); } catch (e) { /* use the laptop clock then */ }
  }

  function listen() {
    net.hostListen({
      onPeople: (row) => { if (row && row.uid && row.room === P.code) { people.set(row.uid, row); drawPeople(); } },
      onReaction: (p) => { if (P.onReaction) P.onReaction(p); }, // js/party-battle.js
      onVote: (row) => { if (row && P.onVote) P.onVote(row); }, // js/party-vote.js
      onStatus: (k, st) => {
        if (k !== 'db') return;
        if (st === 'SUBSCRIBED') { status(''); reloadPeople(); }
        else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT' || st === 'CLOSED') status('Връзката прекъсна. Свързвам отново…', true);
      },
    });
  }

  // merge, never clear: a live insert that lands while the query runs must survive
  function putPerson(row) {
    const old = people.get(row.uid);
    if (old && RBNet.parseTime(old.seen_at) > RBNet.parseTime(row.seen_at)) return; // ours is newer
    people.set(row.uid, row);
  }
  async function reloadPeople() {
    const code = P.code;
    try {
      const rows = await net.people();
      if (P.code !== code) return; // the room changed meanwhile
      rows.forEach(putPerson);
      drawPeople();
    } catch (e) { /* keep the list */ }
  }

  async function start() {
    if (busy || P.on) return;
    busy = true;
    toast('Свързвам парти стаята…', 8000);
    try {
      await connect();
      await newRoom();
      toast('Стаята е готова: ' + P.code, 1500);
      open();
    } catch (e) {
      toast(e.message === 'offline' || /^lib /.test(e.message) ? 'Парти режимът иска интернет.' : 'Парти режимът не тръгна. Опитай пак.');
    } finally { busy = false; }
  }

  // the new room is made first: if that fails, the old room keeps working
  async function newRoom() {
    const old = P.code;
    const code = await net.createRoom();
    await net.unlisten();
    if (P.onRoomGone) P.onRoomGone(); // a running battle belonged to the old room
    if (P.onRoomGone2) P.onRoomGone2(); // and so did a vote on screen
    clearPeople();
    setOn(code);
    listen();
    if (old) net.closeRoom(old, { moved: true }).catch(() => { /* the old room just stays open */ });
  }

  // after a reload: same host user, same room (if it is still open)
  async function resume() {
    const code = ss.get('rb_partyRoom');
    if (!code || busy) return;
    busy = true;
    try {
      await connect();
      const room = await net.loadRoom(code);
      if (!room || (room.state && room.state.phase === 'closed')) { ss.del('rb_partyRoom'); return; }
      setOn(code);
      listen();
      await reloadPeople();
      if (P.resumeRoom) P.resumeRoom(room.state); // a vote that was running continues
    } catch (e) {
      toast('Парти стаята не се зареди. Натисни 🎉 за нова.');
    } finally { busy = false; }
  }

  async function end() {
    if (busy || !confirm('Край на партито? Гостите вече няма да могат да гласуват.')) return;
    busy = true;
    // stop the battle first and block its queued writes, so nothing reopens the closed room
    P.closing = true;
    if (P.onRoomGone) P.onRoomGone();
    if (P.onRoomGone2) P.onRoomGone2();
    let ok = false;
    for (let i = 0; i < 2 && !ok; i++) {
      try { await net.patchState({ phase: 'closed' }); ok = true; } catch (e) { /* retry once */ }
    }
    busy = false;
    if (!ok) { P.closing = false; status('Стаята не се затвори. Провери интернета и опитай пак.', true); return; }
    await net.close();
    closeModal('partyOv');
    clearPeople();
    ss.del('rb_partyRoom');
    P.on = false; P.code = null; P.closing = false;
    drawOn();
    toast('Партито приключи.');
  }

  function setOn(code) {
    P.on = true; P.code = code;
    ss.set('rb_partyRoom', code);
    const url = RBNet.joinUrl(code);
    $('#poQr').innerHTML = qrSvg(url);
    $('#pmQr').innerHTML = $('#poQr').innerHTML;
    $('#poUrl').textContent = url.replace(/^https?:\/\//, '');
    $('#poCode').textContent = $('#pmCode').textContent = $('#psCode').textContent = code;
    drawPeople();
    drawOn();
  }

  function drawOn() {
    const b = $('#partyBtn');
    b.classList.toggle('on', P.on);
    b.setAttribute('aria-pressed', String(P.on));
    $('#partyStrip').classList.toggle('hidden', !P.on);
    $('#partyMini').classList.toggle('hidden', !P.on || !!ss.get('rb_partyMiniOff'));
  }

  // ---------- overlay ----------
  function open() {
    if (!P.on) return;
    ss.del('rb_partyMiniOff');
    drawOn();
    openModal('partyOv');
    if (RB.game && RB.game.state && !RB.game.state.paused && !RB.game.state.ended) RB.game.pause();
  }
  function close() { closeModal('partyOv'); }

  function status(text, bad) {
    const el = $('#poStatus');
    el.textContent = text;
    el.classList.toggle('bad', !!bad);
  }

  function activeCount() {
    const now = net ? net.now() : Date.now();
    let n = 0;
    people.forEach((p) => { if (now - RBNet.parseTime(p.seen_at) < AWAY_MS) n++; });
    return n;
  }

  // one chip per guest, updated in place (heartbeats arrive all the time: a rebuild would
  // steal the keyboard focus and could swallow a click)
  const chips = new Map(); // uid -> button
  function clearPeople() {
    people.clear();
    chips.clear();
    $('#poPeople').textContent = '';
  }
  function drawPeople() {
    const box = $('#poPeople');
    const now = net ? net.now() : Date.now();
    const rows = [...people.values()].sort((a, b) => RBNet.parseTime(a.joined_at) - RBNet.parseTime(b.joined_at));
    for (const p of rows) {
      let b = chips.get(p.uid);
      if (!b) {
        b = document.createElement('button');
        b.addEventListener('click', () => toggleHidden(people.get(p.uid)));
        chips.set(p.uid, b);
        box.appendChild(b);
      }
      const cls = 'po-chip' + (p.hidden ? ' hid' : '') + (now - RBNet.parseTime(p.seen_at) >= AWAY_MS ? ' away' : '');
      if (b.className !== cls) b.className = cls;
      if (b.textContent !== p.name) b.textContent = p.name;
      b.title = p.hidden ? 'Скрито от екрана. Тапни, за да го покажеш.' : 'Тапни, за да скриеш името от екрана.';
      b.setAttribute('aria-pressed', String(!!p.hidden));
    }
    const n = activeCount();
    $('#poCount').textContent = `Влезли: ${n}`;
    $('#psCount').textContent = n ? `${n} влезли` : '';
  }

  async function toggleHidden(p) {
    if (!p) return;
    const want = !p.hidden;
    p.hidden = want;
    drawPeople();
    try { await net.setHidden(p.uid, want); } catch (e) { p.hidden = !want; drawPeople(); toast('Не стана. Опитай пак.'); }
  }
  setInterval(() => { if (P.on) drawPeople(); }, 15000);

  // ---------- party strip ----------
  function drawStrip() {
    document.querySelectorAll('#psMode .chip').forEach((c) => c.classList.toggle('active', c.dataset.mode === battleCfg.mode));
    document.querySelectorAll('#psTurn .chip').forEach((c) => c.classList.toggle('active', +c.dataset.bars === battleCfg.turnBars));
    $('#psTurnBox').classList.toggle('hidden', battleCfg.mode !== 'duet');
    $('#psSame').checked = battleCfg.same;
    $('#psLeft').value = battleCfg.left;
    $('#psRight').value = battleCfg.right;
  }
  function saveStrip() {
    battleCfg.left = $('#psLeft').value.slice(0, 24);
    battleCfg.right = $('#psRight').value.slice(0, 24);
    battleCfg.same = $('#psSame').checked;
    ss.set('rb_partyBattle', battleCfg);
  }
  $('#psMode').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    battleCfg.mode = c.dataset.mode; saveStrip(); drawStrip();
  });
  $('#psTurn').addEventListener('click', (e) => {
    const c = e.target.closest('.chip'); if (!c) return;
    battleCfg.turnBars = +c.dataset.bars; saveStrip(); drawStrip();
  });
  ['#psLeft', '#psRight'].forEach((id) => $(id).addEventListener('input', saveStrip));
  $('#psSame').addEventListener('change', saveStrip);
  // Enter in a name field plays, like the P key elsewhere in the menu
  ['#psLeft', '#psRight'].forEach((id) => $(id).addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); $('#playBtn').click(); }
  }));

  // the battle settings for the next game; empty names = the defaults
  function battle() {
    saveStrip();
    return {
      mode: battleCfg.mode,
      turnBars: battleCfg.turnBars,
      left: battleCfg.left.trim() || DEFAULT_L,
      right: battleCfg.right.trim() || DEFAULT_R,
    };
  }
  // after a battle: new people next time, unless "Същите рапъри" is on
  function afterBattle() {
    if (!battleCfg.same) { battleCfg.left = ''; battleCfg.right = ''; ss.set('rb_partyBattle', battleCfg); }
    drawStrip();
  }

  // ---------- wiring ----------
  $('#partyBtn').addEventListener('click', () => (P.on ? open() : start()));
  $('#psRoom').addEventListener('click', open);
  $('#pmOpen').addEventListener('click', open);
  $('#pmHide').addEventListener('click', () => { ss.set('rb_partyMiniOff', true); drawOn(); });
  $('#poClose').addEventListener('click', close);
  $('#poOk').addEventListener('click', close);
  $('#poNew').addEventListener('click', async () => {
    if (busy || !confirm('Нова стая? Гостите ще трябва да сканират новия код.')) return;
    busy = true;
    try { await newRoom(); status(''); toast('Нова стая: ' + P.code); }
    catch (e) { status('Новата стая не стана. Опитай пак.', true); }
    finally { busy = false; }
  });
  $('#poEnd').addEventListener('click', end);
  $('#partyOv').addEventListener('click', (e) => { if (e.target.id === 'partyOv') close(); });

  // while the overlay is open: Esc closes it, and the menu/game keys (P, T, Space) do nothing
  window.addEventListener('keydown', (e) => {
    if ($('#partyOv').classList.contains('hidden')) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.code === 'KeyP' || e.code === 'KeyT' || e.code === 'Space') e.stopImmediatePropagation();
  }, true);

  drawStrip();
  drawOn();
  resume();

  Object.defineProperty(P, 'net', { get: () => net });
  // reloadPeople: party-battle.js calls it when a reaction comes from a guest it does not know yet
  RB.party = Object.assign(P, { people, battle, afterBattle, open, close, reloadPeople });
})();
