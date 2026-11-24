/* Rimoboy: tempo data for Bizzle Beats SoundCloud tracks (M3a). Spec: BUILD.md 8A.3.
   Key = track slug (last part of the permalink URL).
   bpm      : beats per minute
   startMs  : where playback starts (skip an intro), default 0
   offsetMs : time of the first downbeat the game counts from (>= startMs), default 0
   verified : true once someone has checked bpm + offset by ear. Unverified values come from
              the reference app's beat list and may differ from the SoundCloud versions.
   The user's own taps (localStorage rb_scTempo) override this table.
   Catalogue seen on 2026-11-23 (11 tracks): moments-like-this, roses, your-eyes, butterflies,
   freshair, expectations, blight, warming-up, round-the-bend, rescue, enchanted. */
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
