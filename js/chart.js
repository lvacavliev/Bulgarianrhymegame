/* Rimoboy: chart generation (M2). Spec: BUILD.md section 4.4.
   buildChart(bars, pattern, list, fill) -> array of bars*4 items:
   null | { word, color 0-5, show, famId, group } */
(function () {
  'use strict';

  const COLORS = 6;

  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  // Hands out families without repeats until all families are used, then reshuffles.
  class FamilyBag {
    constructor(families) {
      this.all = families;
      this.queue = [];
    }
    refill() { this.queue = shuffle(this.all.slice()); }
    take(n) {
      if (!this.queue.length) this.refill();
      let i = this.queue.findIndex((f) => f.words.length >= n);
      if (i < 0) {
        // nothing big enough left in this round: start a new round
        this.refill();
        i = this.queue.findIndex((f) => f.words.length >= n);
        if (i < 0) {
          // no family is big enough at all: take the biggest one (words will repeat)
          return this.all.reduce((a, b) => (b.words.length > a.words.length ? b : a));
        }
      }
      return this.queue.splice(i, 1)[0];
    }
  }

  function buildChart(bars, pattern, list, fill) {
    const cells = bars * 4;
    const chart = new Array(cells).fill(null);
    if (!pattern || fill === 'none' || !list || !list.families.length) return chart;

    const bag = new FamilyBag(list.families);
    // group -> slot beats, in cycle order
    const groups = new Map();
    for (const [g, b] of pattern.beats) {
      if (!groups.has(g)) groups.set(g, []);
      groups.get(g).push(b);
    }

    let colorIdx = 0;
    for (let c0 = 0; c0 < cells; c0 += pattern.dur) {
      for (const [g, slots] of groups) {
        const fam = bag.take(slots.length);
        let words = shuffle(fam.words.slice());
        while (words.length < slots.length) words = words.concat(shuffle(fam.words.slice()));
        words = words.slice(0, slots.length);
        const color = colorIdx++ % COLORS;
        slots.forEach((b, i) => {
          const cell = c0 + b - 1;
          if (cell >= cells) return; // pattern cut off at the end of the game
          const show = fill === 'all'
            || (fill === 'first' && i === 0)
            || (fill === 'last' && i === slots.length - 1);
          chart[cell] = { word: words[i], color, show, famId: fam.id, group: g };
        });
      }
    }
    return chart;
  }

  // Render rows of a chart into a container (used by the menu preview, game and end recap).
  // opts: { labels: bool, startLabel: number, countinRows: number, revealAll: bool, tap: bool }
  function renderRows(container, chart, opts = {}) {
    const rowsCount = (opts.countinRows || 0) + Math.ceil(chart.length / 4);
    const frag = document.createDocumentFragment();
    for (let r = 0; r < rowsCount; r++) {
      const bar = r - (opts.countinRows || 0); // negative = count-in
      const label = bar < 0 ? String(bar) : String(bar + 1);
      const row = document.createElement('div');
      row.className = 'row';
      const l1 = document.createElement('span'); l1.className = 'lbl'; l1.textContent = label;
      row.appendChild(l1);
      for (let c = 0; c < 4; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        const item = bar >= 0 ? chart[bar * 4 + c] : null;
        if (item) {
          cell.classList.add('rhyme', 'c' + item.color);
          const visible = item.show || opts.revealAll;
          cell.textContent = visible ? item.word : '?';
          if (visible && item.word.length > 11) cell.classList.add('xlong');
          else if (visible && item.word.length > 8) cell.classList.add('long');
          if (opts.tap && visible) { cell.classList.add('tap'); cell.dataset.word = item.word; cell.dataset.fam = item.famId; }
        }
        row.appendChild(cell);
      }
      const l2 = document.createElement('span'); l2.className = 'lbl'; l2.textContent = label;
      row.appendChild(l2);
      frag.appendChild(row);
    }
    container.innerHTML = '';
    container.appendChild(frag);
    fitCells(container);
  }

  // Shrinks the font of every word cell until the word fits its cell (min 8px).
  // Runs now and again after layout (fonts may still be loading).
  function fitCells(container) {
    const run = () => {
      for (const cell of container.querySelectorAll('.cell.rhyme')) {
        cell.style.fontSize = '';
        if (!cell.clientWidth) continue; // hidden: fit later
        let fs = parseFloat(getComputedStyle(cell).fontSize);
        while (cell.scrollWidth > cell.clientWidth && fs > 8) {
          fs -= 1;
          cell.style.fontSize = fs + 'px';
        }
      }
    };
    run();
    requestAnimationFrame(run);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(run);
  }

  window.Chart = { buildChart, renderRows, fitCells, FamilyBag, shuffle, COLORS };
})();
