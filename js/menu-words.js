/* Rimoboy: menu words panel + game settings + Play/REC (M4). Spec: BUILD.md section 7.3.
   Settings persist in localStorage `rb_settings`.
   Exposes window.RB.settings: get() → copy of settings, list() → current word list,
   pattern() → pattern or null (blank game), speedFactor(). Loads after app.js. */
(function () {
  'use strict';
  const { $, store, toast, openModal, closeModal } = window.RB;
  const LISTS = window.WORD_LISTS, PATTERNS = window.PATTERNS, Chart = window.Chart;

  const DEFAULTS = { listId: 'basic', fill: 'all', duration: '16', patternId: 'aabb', speed: 'normal', blank: false, rec: false };
  const SPEEDS = [
    { id: 'normal', label: 'Нормално', factor: 1 },
    { id: 'double', label: '2x скорост', factor: 2 },
    { id: 'half', label: '0.5x скорост', factor: 0.5 },
  ];
  const FILLS = ['all', 'first', 'last', 'none'];
  const DURS = ['8', '16', '32', '64', 'full'];

  function sanitize(s) {
    const out = Object.assign({}, DEFAULTS, s || {});
    if (!LISTS.find((l) => l.id === out.listId)) out.listId = DEFAULTS.listId;
    if (!FILLS.includes(out.fill)) out.fill = DEFAULTS.fill;
    if (!DURS.includes(String(out.duration))) out.duration = DEFAULTS.duration;
    out.duration = String(out.duration);
    if (!PATTERNS.find((p) => p.id === out.patternId)) out.patternId = DEFAULTS.patternId;
    if (!SPEEDS.find((x) => x.id === out.speed)) out.speed = DEFAULTS.speed;
    out.blank = !!out.blank;
    out.rec = !!out.rec;
    return out;
  }
  let S = sanitize(store.get('rb_settings', null));
  const save = () => store.set('rb_settings', S);

  const listIndex = () => LISTS.findIndex((l) => l.id === S.listId);
  const curList = () => LISTS[listIndex()];
  const curPattern = () => (S.blank ? null : PATTERNS.byId(S.patternId));
  const effFill = () => (S.blank ? 'none' : S.fill);

  // ---------- rendering ----------
  function renderPreview() {
    Chart.renderRows($('#previewGrid'), Chart.buildChart(4, curPattern(), curList(), effFill()));
  }
  function renderListCard() {
    const l = curList();
    $('#listName').textContent = `${l.emoji} ${l.name}`;
    $('#listMeta').textContent = `${listIndex() + 1} от ${LISTS.length} · Виж всички`;
  }
  function renderListModal() {
    $('#listItems').innerHTML = LISTS.map((l) => `
      <button class="list-item${l.id === S.listId ? ' sel' : ''}" data-id="${l.id}">
        <span class="em">${l.emoji}</span>
        <span style="flex:1"><b>${l.name}</b><small>${l.desc}</small><br><small>${l.families.length} рими</small></span>
        ${l.id === S.listId ? '<span style="color:var(--gold);font-weight:900">✓</span>' : ''}
      </button>`).join('');
  }
  function renderChips() {
    $('#patternChips').innerHTML = PATTERNS.map((p) => `
      <button class="chip${p.id === S.patternId ? ' active' : ''}" data-pattern="${p.id}" title="${p.hint}"
        ${S.blank ? 'disabled style="opacity:.4"' : ''}>${p.name}${p.def ? '<small>по подразбиране</small>' : ''}</button>`).join('');
    $('#speedChips').innerHTML = SPEEDS.map((x) => `
      <button class="chip${x.id === S.speed ? ' active' : ''}" data-speed="${x.id}">${x.label}</button>`).join('');
  }
  function renderControls() {
    $('#fillSel').value = S.fill;
    $('#fillSel').disabled = S.blank;
    $('#fillSel').closest('.field').style.opacity = S.blank ? 0.45 : 1;
    $('#durSel').value = S.duration;
    $('#blankChk').checked = S.blank;
    $('#recBtn').setAttribute('aria-pressed', String(S.rec));
    const beat = window.RB.beats && window.RB.beats.current();
    $('#recNote').classList.toggle('hidden', !(S.rec && beat && beat.src === 'sc'));
  }
  function renderAll() { renderListCard(); renderChips(); renderControls(); renderPreview(); }

  function update(patch) {
    Object.assign(S, patch);
    S = sanitize(S);
    save();
    renderAll();
  }

  // ---------- events ----------
  $('#prevPrev').addEventListener('click', renderPreview);
  $('#prevNext').addEventListener('click', renderPreview);
  $('#previewGrid').addEventListener('click', renderPreview); // tap = new words (arrows are hidden on phones)
  $('#previewGrid').title = 'Докосни за нови думи';
  const stepList = (d) => update({ listId: LISTS[(listIndex() + d + LISTS.length) % LISTS.length].id });
  $('#listPrev').addEventListener('click', () => stepList(-1));
  $('#listNext').addEventListener('click', () => stepList(1));
  $('#listCard').addEventListener('click', () => { renderListModal(); openModal('listModal'); });
  $('#listItems').addEventListener('click', (e) => {
    const b = e.target.closest('[data-id]');
    if (!b) return;
    update({ listId: b.dataset.id });
    closeModal('listModal');
  });
  $('#fillSel').addEventListener('change', (e) => update({ fill: e.target.value }));
  $('#durSel').addEventListener('change', (e) => update({ duration: e.target.value }));
  $('#patternChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-pattern]');
    if (b && !S.blank) update({ patternId: b.dataset.pattern });
  });
  $('#speedChips').addEventListener('click', (e) => {
    const b = e.target.closest('[data-speed]');
    if (b) update({ speed: b.dataset.speed });
  });
  $('#blankChk').addEventListener('change', (e) => update({ blank: e.target.checked }));
  $('#resetBtn').addEventListener('click', () => { S = sanitize({ rec: S.rec }); save(); renderAll(); toast('Настройките са нулирани.'); });
  $('#recBtn').addEventListener('click', () => update({ rec: !S.rec }));
  // the beat panel changes the selected beat → the REC note depends on it
  $('#beatList').addEventListener('click', () => setTimeout(renderControls, 0));

  // ---------- Play ----------
  function play() {
    const beat = window.RB.beats.current();
    if (!beat.ready) { toast(beat.reason || 'Избери бийт.'); return; }
    if (typeof window.RB.startGame !== 'function') { toast('Играта идва скоро (M5).'); return; }
    window.RB.startGame();
  }
  $('#playBtn').addEventListener('click', play);
  document.addEventListener('keydown', (e) => {
    if (window.RB.screen !== 'menu' || e.repeat) return;
    if (e.target.matches && e.target.matches('input, select, textarea')) return;
    if (e.code === 'KeyP') play(); // physical key, works on Bulgarian layouts too
  });

  renderAll();

  window.RB.settings = {
    get: () => Object.assign({}, S),
    list: curList,
    pattern: curPattern,
    fill: effFill,
    speedFactor: () => SPEEDS.find((x) => x.id === S.speed).factor,
    speedLabel: () => SPEEDS.find((x) => x.id === S.speed).label,
  };
})();
