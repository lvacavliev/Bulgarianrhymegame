/* Rimoboy: tempo data for Bizzle Beats SoundCloud tracks (M3a). Spec: BUILD.md 8A.3.
   Key = track slug (last part of the permalink URL).
   bpm      : beats per minute (hint from the reference app's beat list; wins over the
              automatic estimate of js/drop.js)
   offsetMs : optional fixed beat drop (bar 1 of the rapping). 0 = use the automatic drop.
   startMs  : unused here (playback starts 2 bars before the count-in automatically)
   verified : true once someone has checked bpm + drop by ear.
   The user's own values (localStorage rb_scTempo) override this table; the automatic
   analysis (waveform, rb_scAuto) fills everything else, so every track is playable.
   Catalogue seen on 2026-11-23 (11 tracks), 21 tracks on 2026-11-24. */
(function () {
  'use strict';
  window.SC_TRACKS = {
    'moments-like-this': { bpm: 90, startMs: 0, offsetMs: 0, verified: false },
    'roses':             { bpm: 88, startMs: 0, offsetMs: 0, verified: false },
    'freshair':          { bpm: 94, startMs: 0, offsetMs: 0, verified: false },
    'expectations':      { bpm: 94, startMs: 0, offsetMs: 0, verified: false },
    'round-the-bend':    { bpm: 98, startMs: 0, offsetMs: 0, verified: false },
    'enchanted':         { bpm: 92, startMs: 0, offsetMs: 0, verified: false },
    // no reference data yet: your-eyes, butterflies, blight, warming-up, rescue
  };
})();
