/* Rimoboy: app shell (M1). Screens, top bar, fullscreen, stars, toast, modals.
   Later milestones extend this file (menu M4, end screen M6, tutorial M8). */
(function () {
  'use strict';

  const $ = (sel) => document.querySelector(sel);

  // ---------- safe localStorage ----------
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v == null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
    },
  };

  // ---------- screens ----------
  const SCREENS = ['menu', 'game', 'end'];
  let current = 'menu';
  function showScreen(name) {
    if (!SCREENS.includes(name)) return;
    for (const s of SCREENS) document.getElementById(s).classList.toggle('active', s === name);
    current = name;
    window.scrollTo(0, 0);
  }

  // ---------- toast ----------
  let toastTimer = null;
  function toast(msg, ms = 3000) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
  }

  // ---------- modals ----------
  function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
  function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) closer.closest('.overlay').classList.add('hidden');
    // click on the dark backdrop closes list/dict modals
    if (e.target.classList.contains('overlay') && (e.target.id === 'listModal' || e.target.id === 'dictModal')) {
      e.target.classList.add('hidden');
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      for (const id of ['listModal', 'dictModal']) closeModal(id);
    }
  });

  // ---------- stars background ----------
  function makeStars() {
    const box = $('#stars');
    const n = 42;
    let html = '';
    for (let i = 0; i < n; i++) {
      const x = Math.random() * 100, y = Math.random() * 100;
      const d = (Math.random() * 4).toFixed(2), s = Math.random() < 0.2 ? 3 : 2;
      html += `<i style="left:${x}%;top:${y}%;width:${s}px;height:${s}px;animation-delay:-${d}s"></i>`;
    }
    box.innerHTML = html;
  }

  // ---------- fullscreen + TV mode ----------
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    } else {
      document.exitFullscreen();
    }
  }
  function updateTvMode() {
    document.body.classList.toggle('tv', !!document.fullscreenElement && window.innerWidth >= 1600);
  }
  document.addEventListener('fullscreenchange', updateTvMode);
  window.addEventListener('resize', updateTvMode);

  // ---------- top bar ----------
  $('#fsBtn').addEventListener('click', toggleFullscreen);
  $('#brandBtn').addEventListener('click', () => {
    if (current === 'end') (window.RB.toMenu || (() => showScreen('menu')))(); // game.js stops the quiet beat
    // during a game the brand does nothing (exit has its own button)
  });
  $('#helpBtn').addEventListener('click', () => toast('Обучението идва скоро (M8).'));

  // #exitBtn, #menuBtn and #againBtn are wired in game.js (M5).

  makeStars();

  // shared helpers for later milestones
  window.RB = { $, store, showScreen, toast, openModal, closeModal, get screen() { return current; } };
})();
