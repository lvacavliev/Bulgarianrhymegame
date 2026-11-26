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
  // openModal remembers the focused element, focuses the dialog's first button and
  // closeModal gives the focus back (M8, section 12).
  const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';
  const returnFocus = {};
  function focusables(el) {
    return [...el.querySelectorAll(FOCUSABLE)].filter((x) => x.offsetParent !== null || x === document.activeElement);
  }
  function openModal(id) {
    const el = document.getElementById(id);
    const wasOpen = !el.classList.contains('hidden');
    el.classList.remove('hidden');
    if (wasOpen) return;
    returnFocus[id] = document.activeElement;
    const first = el.querySelector('.dialog [data-autofocus]') || focusables(el).find((x) => !x.matches('[data-close]')) || focusables(el)[0];
    if (first) first.focus({ preventScroll: true });
  }
  function closeModal(id) {
    const el = document.getElementById(id);
    if (el.classList.contains('hidden')) return;
    el.classList.add('hidden');
    const back = returnFocus[id];
    returnFocus[id] = null;
    if (back && back.isConnected && back.offsetParent !== null) back.focus({ preventScroll: true });
    else if (el.contains(document.activeElement)) document.activeElement.blur(); // no focus left on a hidden button
  }
  // the top open overlay (they share one z-index, so the last one in the DOM is on top)
  function topOverlay() {
    const open = [...document.querySelectorAll('.overlay:not(.hidden)')].filter((o) => o.getClientRects().length > 0);
    return open[open.length - 1] || null;
  }
  document.addEventListener('click', (e) => {
    const closer = e.target.closest('[data-close]');
    if (closer) closeModal(closer.closest('.overlay').id);
    // click on the dark backdrop closes list/dict modals
    if (e.target.classList.contains('overlay') && (e.target.id === 'listModal' || e.target.id === 'dictModal')) {
      closeModal(e.target.id);
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      for (const id of ['listModal', 'dictModal']) closeModal(id);
    }
    // focus trap: Tab cycles inside the top open overlay
    if (e.key === 'Tab' && !e.defaultPrevented) {
      const ov = topOverlay();
      if (!ov) return;
      const list = focusables(ov);
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0], last = list[list.length - 1];
      if (!ov.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); }
      else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
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
  // TV mode = big cells for a party on a TV. On: the 📺 button (saved in rb_tv), `?tv` in the
  // URL (`?tv=0` turns it off), or automatically in fullscreen at a width of 1600 px or more.
  const tvParam = new URLSearchParams(location.search).get('tv');
  if (tvParam != null) store.set('rb_tv', tvParam !== '0');
  let tvOn = !!store.get('rb_tv', false);
  const autoTv = () => !!document.fullscreenElement && window.innerWidth >= 1600;
  function updateTvMode() {
    const on = tvOn || autoTv();
    const was = document.body.classList.contains('tv');
    document.body.classList.toggle('tv', on);
    const b = $('#tvBtn');
    b.setAttribute('aria-pressed', String(tvOn));
    b.classList.toggle('on', tvOn);
    return was !== on;
  }
  function toggleTv() {
    tvOn = !tvOn;
    store.set('rb_tv', tvOn);
    // game.js and end.js re-fit the words and the ball on resize
    if (updateTvMode()) window.dispatchEvent(new Event('resize'));
    toast(tvOn ? 'TV режим: големи клетки.'
      : autoTv() ? 'TV режимът остава, докато си на цял екран.' : 'TV режимът е изключен.', 2200);
  }
  document.addEventListener('fullscreenchange', updateTvMode);
  window.addEventListener('resize', updateTvMode);

  // ---------- top bar ----------
  $('#fsBtn').addEventListener('click', toggleFullscreen);
  $('#brandBtn').addEventListener('click', () => {
    if (current === 'end') (window.RB.toMenu || (() => showScreen('menu')))(); // game.js stops the quiet beat
    // during a game the brand does nothing (exit has its own button)
  });
  $('#tvBtn').addEventListener('click', toggleTv);
  // #helpBtn is wired in tutorial.js (M8).
  // #exitBtn, #menuBtn and #againBtn are wired in game.js (M5).

  makeStars();
  updateTvMode();

  // shared helpers for later milestones
  window.RB = { $, store, showScreen, toast, openModal, closeModal, focusables, get screen() { return current; } };
})();
