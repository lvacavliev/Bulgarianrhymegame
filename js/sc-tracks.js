/* Rimoboy: tempo data for Bizzle Beats SoundCloud tracks (M3a). Spec: BUILD.md 8A.3.
   Key = track slug (last part of the permalink URL).
   bpm      : beats per minute (hint from the reference app's beat list; wins over the
              automatic estimate of js/drop.js)
   dropMs   : beat drop checked by ear = bar 1 of the rapping. Wins over the automatic
              waveform guess (which cannot see a drop when the intro is as loud as the beat).
              Fill it from the app: tempo box → tap along → "Копирай моите настройки".
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
    // reference-app BPMs from BUILD.md 1.3 (the waveform estimate matched the first three)
    'behind-the-mask':   { bpm: 86, verified: false },
    'florentine':        { bpm: 89, verified: false },
    'the-frogg':         { bpm: 82, verified: false },
    'impulse':           { bpm: 104, verified: false }, // waveform estimate 130 is wrong
    'blight':            { dropMs: 10000 },  // drop at 0:10 (user, 2026-11-24); ear-tap for ms precision
    // no reference data yet: your-eyes, butterflies, blight, warming-up, rescue
  };
})();
