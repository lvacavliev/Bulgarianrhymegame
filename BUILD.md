# Rimoboy (Римобой): Bulgarian freestyle rhyme game. Build specification

> Living document. Every session that works on this project reads this file first, then
> continues from the **Progress checklist** (section 14). Update the checklist and the
> **Session log** (section 15) before you end a session.

---

## START HERE (handoff for a new session, updated after M10, 2026-11-26)

**Status:** M0–M10 done (including M3a). The solo game is complete. Open: the user's home
tests (the checklist at the top of the M10 notes in section 14) and party mode.
The party is on 2026-12-31.
**Party mode** (section 16: QR join, phone voting, live reactions, ranking; Supabase; duet +
1v1; milestones in 16.10, decisions in 16.12): **P0–P5 done** (Supabase `rimoboy`, `party/schema.sql`, `party-net.js`, `party-host.js`,
`party-battle.js`, `party-vote.js`, `party.html`). Open: a rehearsal with real phones and
a TV before 2026-12-20 (section 16.10).

**Read in this order:** this section → section 14 (the checklist, with implementation notes
under each finished milestone: *the code is the source of truth where they differ from
sections 4–9*) → section 13 (the test list).

**Run / test:**
- Dev server: preview config `rimoboy` in `.claude/launch.json` (= `python serve.py 8080`,
  no-cache). Open `http://localhost:8080/`. **Do not test on `file://`**. The user runs `start.bat`.
- `node tests/data-check.js .` → must print `OK` (words, patterns, chart).
- `http://localhost:8080/tests/audio-check.html` → all synth beats PASS (offline render).
- `http://localhost:8080/tests/sc-check.html` → SoundCloud widget catalogue + clock drift.
- `?offline` in the app URL simulates no internet (SoundCloud fallback).
- SoundCloud playback and the AudioContext need a real click first (a `computer`
  left_click on `▶ Играй`, not `element.click()` from JS before any gesture).
- **The preview pane is often hidden → rAF is throttled and screenshots are stale.** Drive
  frames by hand with `RB.game.frame()` (draws one frame now) when testing sync. An 8-bar
  synth game lasts about 27 s: wait, then call `RB.game.frame()` once to trigger the end.
  A hidden pane also fires `visibilitychange`, which pauses the game: check `G.paused`.
- **Own file without a file dialog:** build a WAV in the page and hand it to the input:
  `const dt = new DataTransfer(); dt.items.add(new File([wavArrayBuffer], 'x.wav')); fileInput.files = dt.files; fileInput.dispatchEvent(new Event('change'))`.
  A click track (100 BPM, quiet 4.8 s intro, loud beats after) was guessed as 100 BPM,
  start 4.78 s.
- **REC without a real mic:** replace `navigator.mediaDevices.getUserMedia` with a function
  that returns `RBAudio.ctx.createMediaStreamDestination().stream` fed by an oscillator, or
  one that throws `new DOMException('x', 'NotAllowedError')` for the denied path.

**What exists (globals, all on `window`):**

| Global | File | What it gives |
|---|---|---|
| `RB` | app.js | `$`, `store.get/set` (safe localStorage), `showScreen('menu'\|'game'\|'end')`, `toast(msg, ms)`, `openModal(id)` (focuses the first button), `closeModal(id)` (gives the focus back), `focusables(el)`, `screen` (current). Tab is trapped in the top open `.overlay` |
| `RB.tutorial` | tutorial.js | `open(slide)`, `close()`, `go(±1)`, `at(beats)` (draws the demo ball at that beat; for tests), `slide` |
| `RB.beats` | menu-beats.js | `current()` → `{src:'synth'\|'sc'\|'file', title, meta, cover, artwork, emoji, link, bpm, durationSec, ready, reason, def?, track?, tempo?}`; `makeEngine()`; `stopPreview()`; `sync` (ms) |
| `RB.settings` | menu-words.js | `get()` → `{listId, fill, duration, patternId, speed, blank, rec}`; `list()`; `pattern()`; `fill()`; `speedFactor()`; `speedLabel()` |
| `RB.startGame()` | game.js | async; builds the chart, renders, starts the engine, runs the loop. "Играй пак" calls it too |
| `RB.toMenu()` | game.js | stops the engine (also the quiet end-screen beat), resumes a suspended ctx, shows the menu |
| `RB.game` | game.js | `state` (= `G`: `{engine, beat, settings, cellDur, bars, chart, list, total, playSec, cells, ended, paused, ...}`, null when no game), `pause()`, `resume()`, `exit()`, `frame()` |
| `RB.onGameEnd(G)` | end.js | called by game.js `endGame()` after `showScreen('end')`: stats, streak, recap, beat card, popups, confetti |
| `RB.end` | end.js | `bumpStreak()` → `{count, changed}`, `openDict(word, famId)`, `cleanup()` (game.js calls it in `toMenu`/`startGame`), `confetti()`, `shown` (the game whose end screen is shown) |
| `RB.rec` | rec.js | `prepare()` (mic), `start()`, `pause()`, `resume()`, `stop()` → `Promise<{blob, url, ext, mime} \| null>`, `discard()`, `revoke()`, `recording` |
| `FileBeat`, `RBFile` | filebeat.js | own-file engine (`isFile`, `position()`, `afterRap`, `rapStart`); `RBFile.envelope(buffer, bins)` for `RBDrop.analyze` |
| `WORD_LISTS`, `PATTERNS` (+`byId`) | words.js, patterns.js | data |
| `Chart` | chart.js | `buildChart`, `renderRows(el, chart, {countinRows, revealAll, tap})`, `fitCells(el)`, `FamilyBag`, `shuffle` |
| `RBAudio` | audio.js | `ensure()`, `ctx`, `master`, `recBus` (REC mix input: compressor and mic feed it) → limiter → `recDest` (MediaStreamDestination, live ctx only), `latency()`, `makeOutput`, `buffers`, `mtof` |
| `BEATS`, `SynthBeat` | beats.js | 6 synth beats; engine |
| `SCW`, `SCBeat` | soundcloud.js | SoundCloud widget singleton; engine |

**Engine interface:** `await engine.start()` (synth: `start(ctx.currentTime + 0.15)`),
`time()` (latency-corrected, seconds since the first count-in cell), `setVolume(v, ramp)`,
`stop(fade)`. Pause: synth `RBAudio.ctx.suspend()/resume()`; SC `engine.pause()/resume()`.

**Beat data for SoundCloud (reworked 2026-11-24, section 8A.7):** BPM, beat drop and end
of every Bizzle Beats track are **measured offline from the audio** (`tools/analyze_sc.py`,
librosa) and baked into `js/sc-tracks.js` (`bpm`, `dropMs`, `endMs`, `check`). This is how the
reference game works too (hand-made `beatBpm` / `beatDropMs` / `beatEndMs` per beat). Bar 1
of the rapping = `dropMs` (the downbeat where the drums come in); the 2-bar count-in runs
just before it; "Цялата песен" stops at `endMs`. Precedence per field: the user's tap/inputs
(`rb_scTempo`) > the measured table > the waveform guess (`js/drop.js`, now only for new
uploads that are not in the table yet). **New track on the profile:** run the analyzer, then
`node tools/bake-sc-tracks.js` (8A.7). Tracks with `check: true` (11 of 21) should be heard
once with "▶ Чуй дропа"; the tap tool fixes them.

**Open items carried forward:** the measured beat data is not checked by ear (the agent
cannot listen); listen first to the `check: true` tracks (2wenty, behind-the-mask, blight,
butterflies, eclipse, florentine, restraint, round-the-bend, the-frogg, warming-up, your-eyes — see the
comments in sc-tracks.js); the
synth beats are not judged by ear. Hosting: the user has a Vercel deployment linked to the
GitHub repo.

---

## 0. Goal and hard constraints

**Goal.** A browser game for freestyle rap in **Bulgarian**. The user plays it at a New Year's
party. A beat plays. A ball bounces across a grid in time with the beat. Rhyme words appear
in the grid on the beats where the player must land a rhyme. The player freestyles the rest
of each line.

**Reference.** The mechanics come from the free tier of `https://play.therhymegame.com/`
(analysed on 2026-11-23, see section 1). We copy the **mechanics, game rules and settings**
only.

**Hard constraints (do not break these):**

1. **No copied identity or assets.** Do not use the original name ("The Rhyme Game"), logo,
   wordmark, colour scheme (purple gradient + cream/orange logo blocks), fonts as a "look",
   artwork, the original's bundled beat files, or English word lists. The app is called
   **Римобой** (Rimoboy). It has its own look (section 6). **Main beat source (user decision,
   2026-11-23): the public SoundCloud account `https://soundcloud.com/bizzlebeats`**, streamed
   through SoundCloud's official embed/API (section 8A). We never download, cache or
   re-host the audio. (Exception, user decision 2026-11-24: the developer tool
   `tools/analyze_sc.py` fetches each track once to measure BPM/drop/end and deletes the
   audio right after; only numbers are kept. The app itself never downloads audio. 8A.7.) Fallbacks: beats synthesized by our own code (section 8) and a file
   the user loads.
2. **All UI text is Bulgarian.** Code identifiers and comments are English.
3. **Runs from one folder.** It opens from `index.html` by double-click (`file://`) in
   Chrome/Edge. No build step, no framework, no npm. SoundCloud beats need internet.
   Offline, only the synthesized beats and the user's own file work, and the app must say
   so ("Няма интернет: ползвай вградените бийтове"). Note: the SoundCloud widget can refuse
   to work on a `file://` origin. Test this first in M3. If it fails, serve the folder with
   `python -m http.server 8080` and add `start.bat` with that command.
4. **Works on a laptop connected to a TV or speaker, and on a phone.** Responsive down to
   360 px wide.
5. **Audio timing comes from `AudioContext.currentTime`.** Never use `setTimeout` or
   `Date.now()` for musical timing (section 9).

---

## 1. Observed behaviour of the reference app (evidence)

Observed live in Chrome, plus the shipped JS bundle (Expo / React Native Web, files
`_expo/static/js/web/App-*.js` and `__common-*.js`). Copies of the bundles were saved to
the session scratchpad and are **not** in the project. Re-download them only if you need
more detail:
`https://play.therhymegame.com/_expo/static/js/web/__common-49f942cc3103361e09f6de6451ce1b38.js`
(the hash can change).

### 1.1 Screens and flow

1. **Welcome overlay** (first visit). Logo, "Welcome…", big round play button "How to play",
   secondary "Skip tutorial". The play menu is visible but dimmed behind it.
2. **Tutorial (3 lessons).** Step dots at the top (3 dots). Each lesson shows a small 4-cell
   grid with a bouncing ball and a round yellow "Next" button. "Hold to Skip >>" in the
   bottom-right corner (press and hold to skip).
   - Intro card: "Learn how to freestyle rap in 3 easy steps." Button "Let's go!".
   - Lesson 1: "Follow the ball as it bounces to the beat." One row of 4 empty cells. The
     ball bounces cell to cell, and the cell under the ball lights up.
   - Lesson 2: "Land a rhyme at the end of each line. Say the rhyme word right as the ball
     lands on it." Rows scroll upwards. The 4th cell of each row has an orange rhyme word
     (time / rhyme).
   - Lesson 3: "You freestyle the rest! The possibilities are endless!" Two full rows of
     words: `I | write | a | rhyme` and `one | more | last | time`. The rhyme words are
     orange, the other words are cream cells. Button "Let's go!".
3. **Guided first game.** A short coach-mark tour of the menu ("Let's set up your first
   freestyle", "Skip tour"). The first game is forced to **8 bars**. Only 4 beats are visible
   before the first game ("Play your first game to unlock more beats").
4. **Play menu** (main screen). Details in 1.3.
5. **Game screen.** Details in 1.4.
6. **End popup** "Great bars!" with a round "Continue" button, then the **End screen**
   ("Good job!"). Details in 1.5.
7. After the first game, a popup "Streak Increased: One Day Streak" appears, then the full
   menu unlocks (language selector, beat library, 30 word lists, advanced setup, REC).

### 1.2 Core mechanic

- **One cell = one beat** (quarter note) at "Normal" speed. **One row = one bar = 4 cells.**
- A **ball** arcs from cell to cell. It lands exactly on each beat. The cell it lands on
  lights up.
- The **current row is the top visible row.** When the ball moves into the next bar, the
  grid scrolls up by one row. About 5 rows are visible: the current row plus up to 4
  upcoming rows. Upcoming rows show their rhyme words in advance, so the player can plan.
- **Row numbers** appear left and right of each row (small, faint).
- **Count-in.** Before bar 1 there are empty rows numbered `-3, -2, -1` (observed 3 count-in
  rows on the first game). Header: "Get Ready!" and "Your freestyle starts in N", where N
  counts down in beats. Then the header shows only the logo.
- **Rhyme words** fill the cells that the rhyme pattern selects (usually the 4th cell of a
  row). Words in the same rhyme group share a colour. Colours cycle per group: orange,
  cyan, yellow, green, and so on. Example of a first game in AABB: `hard/guard` (orange),
  `shown/zone` (cyan), `bunny/honey` (yellow), `fast/last` (green).
- Empty cells are translucent. The lit cell is a lighter translucent colour.
- **Bottom player bar** during the game: cover, beat title, producer, pause button, progress
  bar with elapsed and total time.
- A back chevron (top-left) exits the game. "Hold to Skip >>" skips forward.
- When the last bar ends: the popup "Great bars!" appears, and the beat keeps playing on
  the end screen.

### 1.3 Play menu

Two panels plus a bottom action bar.

**Panel 1: "1 · Pick your beat"**
- Search box, Sort, Filter, "Full library" (opens a full-screen library).
- Beat list rows: cover square, title, "Producer · BPM · genre tags", heart (favourite),
  "⋮" menu. A "NEW" badge on new beats.
- "YOUR BEAT" card at the bottom: cover, title, producer, "BPM · genres · mood", settings
  gear, scrubber with time, transport controls: shuffle, previous, play/pause, next,
  repeat, random.
- Clicking a beat selects it and starts its preview in the menu.
- Observed tempos: 80–150 BPM. Genres: Boom Bap, Chill Boom Bap, Trap, Chill Trap, Drill,
  Alt.

**Panel 2: "2 · Pick your words"** ("Reset to defaults" link at the top-right)
- **Preview grid:** 4 rows × 4 cells, with sample rhyme words in the rhyme slots (for
  example `graph/laugh` orange, `slide/ride` cyan). Left and right arrows cycle the
  preview.
- **Word list selector:** left arrow, card "🔠 Basic Words, 1 of 30. Tap to see all", right
  arrow. Tapping the card opens the modal "Pick Your Word List" (emoji + name +
  description, a check mark on the selected list, a language dropdown in the header).
- **Fill mode** dropdown. Internal constants (from the bundle):
  - `all`: "All words" (default). Every rhyme slot shows its word. (`ALL_RHYMES_FILLED`)
  - `first`: "First only". Only the first slot of each rhyme group shows its word. The
    player must find the other rhymes. (`OFF_THE_CLIFF`)
  - `last`: "Last only". Only the last slot of each group shows its word, as a
    setup/punchline. (`SETUP_PUNCHLINE`)
  - `none`: "No words".
- **Duration** dropdown: `8 bars`, `16 bars` (default), `32 bars`, `64 bars`, `Full song`.
- **Advanced setup** (collapsible):
  - "ALL RHYME PATTERNS" chips (section 4.2): AABB (default), AAAA, ABAB, AA_A, aAaA, aAbB,
    aBaB, aA_A, _AaA, _A_A_B_B. Plus a hidden "Blank" pattern.
  - Speed (in the bundle): `normal` "Normal", `double` "2x Speed", `half` "0.5x Speed".
  - "MORE CUSTOMIZATIONS": **Blank game** ("Turn off words and rhyme pattern"),
    "Reset to defaults".
- **Bottom bar:** **REC** toggle (records the performance to share it) + large yellow
  **▶ Play** button.

**Word lists in the free version (30):** Basic Words · All 1+2+3 Syllables · 1-Syllable ·
2-Syllable · 3-Syllable · Buzzer Beater · Football Fever · City Lights · Deep End · World
Traveler · Animals & Nature · Mother Nature · Snack Attack · Turn It Up · Mic Check · Player
One · Back Roads · Hero Mode · Crown Me · Drip Check · Crush Hour · Big Dreams · Grind Mode ·
Luxury Living · Dream Big · Rappers Toolkit · Food & Cooking · The 6ix Pack · Bar Exam · Lift
Off.

**Word list data shape (from the bundle):** a list is
`{id, name, description, complexity, difficulty 0-4, wordListType:"Themes", freepaid:"FREE",
words:[{word, familyId}]}`. A **family** = the words that rhyme with each other. Sizes
observed: "2-Syllable Words" has 107 families / 702 words (4–18 words per family). "Rappers
Toolkit" has 79 families / 467 words (4–9 per family). The menu preview list has 8 families
of 4 words. **Every family has 4 or more words.**

### 1.4 Game screen

Covered in 1.2. Additional details:
- The header logo is small and centred. The grid width is about 330 px for 4 cells
  (≈80 px cells, 45 px tall, 4 px gaps, rounded corners).
- The ball is orange with a motion trail, about 20 px. The arc peak is about one row height
  above the cells.
- A watermark under the grid shows the site name. We use our own name.

### 1.5 End screen

- Title "Good job!".
- Left card **STATS:** `DURATION` (m:ss of the freestyle, for example 0:22 for 8 bars at
  88 BPM), `BARS` (8), `DAY STREAK` (1).
- "YOUR BEAT" mini player (the beat keeps playing).
- Right card **WORDS:** every bar of the game, as rows (4 cells + row numbers). The rhyme
  words are coloured. "Scroll for more". "Tap a word to open the Rhyme Dictionary".
- Bottom: big yellow **"Play again ›"** button. A back arrow goes to the menu.
- Rhyme Dictionary (reference): definitions, synonyms, related words, rhymes. **Ours shows
  the rhymes only** (the family of the word, plus words from other lists with the same
  ending).

### 1.6 Streak

Day streak: playing on consecutive local calendar days increases it. A popup announces the
increase.

---

## 2. What we build (scope)

Parity with the free tier, adapted for a party:

| Reference feature | Rimoboy |
|---|---|
| Tutorial (3 lessons) | Yes. Bulgarian, own illustrations, "Пропусни" button (no hold) |
| Guided first game, unlocks | **No.** All features unlocked at once (it is a party) |
| Beat library (licensed audio) | **Bizzle Beats from SoundCloud** (section 8A) as the main list. Plus 6 **synthesized** beats (offline fallback) and **"Твой бийт"** (load your own audio file, set BPM by tap tempo + downbeat offset) |
| Favourites, search, sort, filter | Favourites optional (milestone M8). No search (few beats) |
| Word lists (30) | 7 Bulgarian lists (section 5), more added later |
| Fill modes, durations, patterns, speed, blank game | Yes, all |
| REC | Yes: microphone + beat mixed into one `.webm` file, downloaded from the end screen |
| End screen stats + recap + dictionary | Yes |
| Day streak | Yes (localStorage) |
| Language switcher | No (Bulgarian only) |
| Accounts, paid tier | No |
| Extra for the party | Fullscreen button; keyboard: Space = pause, Esc = exit; big readable words on a TV |

---

## 3. File layout

```
rhyme game bulgarian/
├── BUILD.md          ← this spec (keep it updated)
├── index.html        ← markup + <link> to css + <script> tags, in this order:
├── css/style.css
├── js/words.js       ← window.WORD_LISTS (Bulgarian data, section 5)
├── js/patterns.js    ← window.PATTERNS (section 4.2)
├── js/beats.js       ← window.BEATS definitions + synth engine (section 8)
├── js/audio.js       ← AudioContext, master bus, FileBeat, recorder (sections 8, 10)
├── js/soundcloud.js  ← SCBeat: SoundCloud widget/API wrapper + track catalogue (section 8A)
├── js/menu-beats.js  ← menu beat panel (tabs, list, preview, tempo box, sync); loads AFTER app.js
├── js/menu-words.js  ← menu words panel, settings (rb_settings), Play/REC buttons; loads after menu-beats.js
├── serve.py          ← no-cache local server (start.bat and .claude/launch.json use it)
├── tests/            ← data-check.js (node), audio-check.html, sc-check.html (browser, via server)
├── js/sc-tracks.js   ← window.SC_TRACKS: per-track bpm / dropMs / endMs (GENERATED, section 8A.7)
├── js/drop.js        ← waveform guess of BPM + drop, only for tracks missing from SC_TRACKS
├── tools/            ← dev only: analyze_sc.py (offline audio analysis), bake-sc-tracks.js, sc-analysis.json
├── config.js         ← window.RB_CONFIG = {scClientId:''}; optional, git-ignored, never commit a secret
├── js/chart.js       ← buildChart(), FamilyBag (section 4)
├── js/filebeat.js    ← FileBeat: the user's own audio file (section 8.6)
├── js/rec.js         ← REC: mic + MediaRecorder (section 10)
├── js/game.js        ← game loop, grid render, ball (section 9)
├── js/end.js         ← end screen, streak, rhyme dictionary (sections 7.5–7.7, 9.5)
├── js/tutorial.js    ← tutorial overlay (section 7.2)
└── js/app.js         ← menu, settings, modals, screens, tutorial, streak (sections 6, 7, 11)
```

Use plain `<script src>` tags (no ES modules: `file://` blocks module imports in Chrome).
Each file attaches what it exports to `window` (for example `window.Chart = {buildChart}`).
Script order (actual, after M4): SoundCloud widget API
(`https://w.soundcloud.com/player/api.js`) → words → patterns → audio → beats → sc-tracks →
soundcloud → chart → **app** (defines `window.RB`) → menu-beats → menu-words → **game (M5,
last)**. `config.js` (optional API key, path B) is not used yet.

---

## 4. Game data model and chart generation

### 4.1 Terms

- `cell`: one grid slot = one tick of the ball. At speed `normal` this is one beat.
- `cellDur` (seconds) = `60 / bpm / speedFactor`. speedFactor: normal 1, double 2, half 0.5.
- `COUNTIN_BARS = 2` (8 cells). The reference showed 3 rows labelled −3..−1. We chose 2 to
  shorten the waiting. Change it here if testing shows the players need more time.
- `bars`: the bar count from the Duration setting.
- `totalCells = (COUNTIN_BARS + bars) * 4`. Cell index 0 = first count-in cell. Freestyle
  cell `k` (0-based) = index `COUNTIN_BARS*4 + k`.

### 4.2 Rhyme patterns (`js/patterns.js`)

Exact data from the reference bundle. `beats` are **1-based cell positions inside one
pattern cycle**, `dur` = cycle length in cells. The pattern repeats for the whole game.
`group` = rhyme group inside the cycle. Every group gets a new family and a new colour.

```js
window.PATTERNS = [
  { id:'aabb',  name:'AABB', def:true, dur:16, beats:[[1,4],[1,8],[2,12],[2,16]],
    hint:'Двойки рими в края на всеки бар' },
  { id:'aaaa',  name:'AAAA', dur:16, beats:[[1,4],[1,8],[1,12],[1,16]],
    hint:'Четири бара на една рима' },
  { id:'abab',  name:'ABAB', dur:16, beats:[[1,4],[2,8],[1,12],[2,16]],
    hint:'Кръстосана рима' },
  { id:'aa_a',  name:'AA_A', dur:32, beats:[[1,4],[1,8],[1,16],[2,20],[2,24],[2,32]],
    hint:'Прескочи един бар' },
  { id:'aAaA',  name:'aAaA', dur:16, beats:[[1,2],[1,4],[1,6],[1,8],[2,10],[2,12],[2,14],[2,16]],
    hint:'Двойно темпо: рима на всеки половин бар' },
  { id:'aAbB',  name:'aAbB', dur:16, beats:[[1,2],[1,4],[2,6],[2,8],[3,10],[3,12],[4,14],[4,16]],
    hint:'Двойно темпо, двойки' },
  { id:'aBaB',  name:'aBaB', dur:16, beats:[[1,2],[2,4],[1,6],[2,8],[3,10],[4,12],[3,14],[4,16]],
    hint:'Двойно темпо, кръстосано' },
  { id:'aA_A',  name:'aA_A', dur:16, beats:[[1,2],[1,4],[1,8],[2,10],[2,12],[2,16]],
    hint:'Вътрешна рима в първия ред' },
  { id:'_AaA',  name:'_AaA', dur:16, beats:[[1,4],[1,6],[1,8],[2,12],[2,14],[2,16]],
    hint:'Вътрешна рима във втория ред' },
  { id:'_A_A_B_B', name:'_A_A_B_B', dur:32, beats:[[1,8],[1,16],[2,24],[2,32]],
    hint:'Рима на всеки втори бар' },
];
// "Blank game" = no pattern (pattern = null) and fill = 'none'.
```

The reference stores these as objects `{group, beat}`. The tuple form `[group, beat]` above
is ours. The meaning is the same.

### 4.3 Colours of rhyme groups (cycle in this order)

```
--rhyme-1: #ff7a45  (coral orange)   --rhyme-2: #22c7e8 (cyan)
--rhyme-3: #ffc83d  (gold)           --rhyme-4: #35d48a (green)
--rhyme-5: #ff5fa8  (pink)           --rhyme-6: #9d8bff (violet)
```
Text on a rhyme cell: `#1a1030` (dark), weight 800. Each rhyme cell has a 4 px darker
"lip" at the bottom (`box-shadow: inset 0 -4px 0 rgba(0,0,0,.25)`).

### 4.4 `buildChart(bars, pattern, list, fill)` → `chart[]`

```js
// returns an array of length bars*4 (freestyle cells only; count-in cells are empty)
// item: null | { word, color (0-5), show (bool), famId, group }
function buildChart(bars, pattern, list, fill) {
  const cells = bars * 4, chart = new Array(cells).fill(null);
  if (!pattern || fill === 'none') return chart;
  const bag = new FamilyBag(list.families);
  let colorIdx = 0;
  for (let c0 = 0; c0 < cells; c0 += pattern.dur) {
    const groups = new Map();                        // group -> [beat,...] in cycle order
    for (const [g, b] of pattern.beats) (groups.get(g) || groups.set(g, []).get(g)).push(b);
    for (const [g, slots] of groups) {
      const fam = bag.take(slots.length);            // a family with >= slots.length words
      const words = shuffle([...fam.words]).slice(0, slots.length);
      const color = colorIdx++ % 6;
      slots.forEach((b, i) => {
        const cell = c0 + b - 1;
        if (cell >= cells) return;                   // a pattern cut off at the end
        const show = fill === 'all' || (fill === 'first' && i === 0)
                  || (fill === 'last' && i === slots.length - 1);
        chart[cell] = { word: words[i], color, show, famId: fam.id, group: g };
      });
    }
  }
  return chart;
}
```

**FamilyBag:** shuffles the families once. `take(n)` returns the next family with
`words.length >= n` that was not used yet. When no family is left, reshuffle and start
over. Goal: no family repeats until all families are used.

**A hidden word** (`show:false`) renders as a coloured cell with "?" (the player must find a
rhyme). On the end screen, every word is shown (`show` is ignored).

### 4.5 Duration → bars

`8 | 16 | 32 | 64 | 'full'`. Full: for a synthesized beat = 64 bars. For a user file =
`floor(((buffer.duration - offset) / cellDur - COUNTIN_BARS*4) / 4)`, minimum 4.

---

## 5. Bulgarian word lists (`js/words.js`)

### 5.1 Format

```js
window.WORD_LISTS = [
  { id:'basic', emoji:'🔤', name:'Основни думи',
    desc:'Лесни думи за начало. Идеални за първа игра.',
    families: [ ['там','сам','срам','дам','храм','плам'], ... ] },
  ...
];
// After load, app.js assigns family ids: `${list.id}:${index}`.
// "Микс" (all lists) is generated at runtime: the concatenation of all families. Put it
// second in the picker, like "All 1+2+3 Syllables" in the reference.
```

### 5.2 Rules for a valid Bulgarian rhyme family (important: read before adding words)

1. **The stress decides the rhyme.** Words rhyme when everything from the **stressed vowel to
   the end** sounds the same: `зи́ма / ри́ма` ✔, `годи́на / карти́на` ✔. A wrong stress
   breaks the rhyme: `ма́гия / стихи́я` ✘. `ра́дост` does not rhyme with `мост` ✘.
2. Inside a family, all words have the **same stress position from the end** (all end-stressed,
   or all stressed on the next-to-last syllable, and so on).
3. **Final devoicing is allowed:** `град / брат`, `враг / мрак`, `народ / кот` sound the
   same.
4. Near rhymes (`танц / шанс`, `ясно / страстно`) are allowed only in the advanced lists.
5. **4 words minimum** per family (AAAA and the double-time patterns need 4). The target
   is 5–8.
6. Common, party-safe words. No slurs. Light slang is OK. Avoid words that a beginner does
   not know.
7. No duplicate word inside one list. The same family can appear in two lists only when the
   list themes overlap.
8. For a word with an unclear stress, check it in the Bulgarian Academy of Sciences
   dictionary (`https://ibl.bas.bg/rbe/`) or leave it out.

### 5.3 Draft families (prepared in session 1; review the stresses, then expand each list to 40+ families)

**List `basic`: 🔤 Основни думи.** "Лесни думи за начало. Идеални за първа игра."
```
там сам срам дам храм плам
живот кот пот народ завод пилот
пазар базар товар другар цар жар
бой твой мой рой зной строй
един син бензин магазин камин жасмин
мрак пак знак враг юнак чак
ден мен тен плен зелен студен
цел смел орел отдел предел панел
глас час нас вас бас клас
звук тук лук юмрук бук сук
щит хит бит скрит открит сит
брат град сват млад назад парад
дом гном том ром хром лом
днес лес бес интерес прогрес експрес
нов лов готов любов зов улов
бал кристал финал скандал сигнал канал
скок сок рок висок дълбок поток
гост мост пост прост кост тост
вик миг тик език шик пик
сън вън звън навън
хей пей смей лей грей
говори отвори затвори гори умори повтори
сърце ръце лице яйце крилце
```

**List `two`: 🎵 Двусрични думи.** "Думи с ударение на предпоследната сричка. Малко по-трудно."
```
пари стари фари чари твари
птица жица пица столица царица
слава права лава дава става плава
книга стига вдига мига лига дига
скука кука мука щука тука бука
мило било шило жило гнило
воля роля моля доля
стане хване кане плане остане
знала стала дала спала зала хала
вечно течно млечно речно
ясно гласно властно страстно
битка питка плитка китка
пушка тушка гушка мушка
сладко кратко гладко рядко
лято злато свято блато ято
майка чайка байка лайка
нежна снежна прилежна безбрежна
```

**List `newyear`: 🎆 Нова година.** "Празнични думи за купона в полунощ!"
```
ракети конфети късмети планети монети куплети
нощ полунощ мощ разкош
календар пожар жар дар бар другар
сурвачка играчка закачка задачка крачка
тост гост мост прост пост
снежинка картинка малинка балеринка
салат шоколад парад град брат хлад
грешка усмешка пешка насмешка
желание пожелание обещание признание съзнание призвание
звезда бразда езда гнезда узда
сняг бряг бяг впряг
надежда одежда прежда поглежда нарежда
година картина причина малина лавина машина
шампанско испанско германско океанско
купон шампион сезон балон милион фон
танци шанси нюанси баланси
мечти очи лъчи звучи мълчи личи
```

**List `mic`: 🎤 Рапърски инструменти.** "Думи за истински MC: микрофон, бийт и сцена."
```
микрофон телефон тон фон балкон закон трон
рима зима има взима отнима незабравима
текст контекст претекст подтекст
рап хап кап трап
вдъхновение сражение решение движение мнение значение
дума сума кума шума чума
команда банда веранда лаванда гирлянда пропаганда
перфектно ефектно коректно директно
реална фатална нормална банална тотална легална
двор хор спор простор разговор позор
сцена арена вена хиена антена
стил пил мил бил крокодил
диск риск писк обелиск
квартал метал вокал кристал идеал сериал
план екран ураган роман капитан океан
```

**List `food`: 🍕 Храна и купон.** "За гладни фрийстайлъри и душата на купона."
```
пица птица жица водица столица
торта порта курорта спорта
ракия стихия змия пия крия мия
кош разкош лош грош
бира лира квартира събира разбира напира
калач плач играч бръснач ковач палач
салам бам мадам срам имам
кюфте кафе филе купе дефиле канапе
супа купа лупа трупа група
чаша каша наша ваша плаша Маша
танц шанс транс баланс аванс романс
маса каса раса класа баса
```

**List `hard`: 🔥 Тежка артилерия.** "За напреднали: дълги думи и многосрични рими."
```
невероятно приятно обратно безплатно безвъзвратно необятно
безкрайно случайно потайно трайно нехайно
позиция амбиция традиция интуиция полиция петиция
фантастично практично логично различно трагично енергично
неудържимо непобедимо необходимо невъобразимо любимо търпимо
свобода природа мода порода изгода несгода
поезия амнезия анестезия Полинезия
мистерия материя артерия бактерия истерия серия
независим непоносим незаменим неуловим необясним любим
неизбежно небрежно нежно прилежно безметежно безбрежно
уникален фатален кристален нормален банален реален
```

**List `mix`: 🔢 Микс от всички.** Generated at runtime (section 5.1).

**Lists to add later (themes from the reference, Bulgarian adaptations):** 🌃 Градски нощи
(city), 💘 Любов и раздяла (love), 👑 Корона (flex), 🎮 Геймър, ⚽ Футбол, 🌍 Пътешествия,
🐉 Герои и дракони, 🚀 Космос, 💰 Бачкане и пари, 🌳 Природа. Target: 12+ lists, each with
40+ families.

---

## 6. Visual design (own identity: "midnight party")

- **Name/wordmark:** `РИМО` + `БОЙ`. Font Unbounded 800. `РИМО` in cream `#fff4d6`, `БОЙ`
  in gold `#ffc94a`. Small sparkle ✦ before the name. Do not stack it in three blocks
  (that is the reference logo).
- **Fonts** (Google Fonts, Cyrillic subset):
  `https://fonts.googleapis.com/css2?family=Unbounded:wght@600;800&family=Manrope:wght@400;600;800&display=swap`.
  Unbounded for headings, words in cells and buttons. Manrope for body text. Fallback:
  `system-ui, "Segoe UI", sans-serif`.
- **Colour tokens** (`:root`):
  ```
  --bg-0:#07061a; --bg-1:#120f33; --bg-2:#1c1850;   /* midnight navy */
  --panel:rgba(255,255,255,.05); --panel-line:rgba(255,255,255,.09);
  --text:#f4f1ff; --muted:#a29fc7;
  --gold:#ffc94a; --gold-2:#ff9f1c;                   /* primary CTA gradient */
  --cell:rgba(255,255,255,.07); --cell-lit:rgba(255,255,255,.28);
  --word-cell:#fff4d6;                                /* filled freestyle words */
  --ball:#ffd84a (glow #ff9f1c)
  ```
  Body background: radial gradient `--bg-2` at the top centre → `--bg-0`. Plus a fixed layer
  of slow, faint twinkling stars (CSS only; about 40 small dots with `animation: twinkle`).
- **Primary button:** pill, gold gradient (`--gold` → `--gold-2`), dark text `#1a1030`,
  Unbounded 800, height 56 px, hover lift. **Secondary:** ghost border `--panel-line`.
- **Ball:** a gold disc of 22 px with `box-shadow: 0 0 18px var(--gold-2)` and a trail of 3
  fading clones (previous positions), no image.
- **Cells:** radius 12 px. Empty cells `--cell`. Lit cell `--cell-lit` + scale 1.04 for
  120 ms. Rhyme cells as in section 4.3. Cell height `--rowH` = 64 px on desktop, 52 px on a
  phone, 80 px in TV mode (fullscreen at a width of 1600 px or more).
- **Confetti** on the end screen (canvas, about 120 particles, 3 s, gold/rhyme colours).
- **Motion** (`css/motion.css`, both pages): modals fade the backdrop and rise the dialog;
  floating items (toast, REC note, mini QR) slide from their edge; `<details>` animate height;
  inline panels, screens and phone views animate on entry only. Enter 260 ms, exit 170 ms.
  JS only toggles `.hidden` / `[hidden]` / `[open]`. Reduced motion: fades only. A new popup
  that uses `.overlay` + `.dialog` gets the motion with no extra code.
- Must work at 360 px wide: the menu panels stack, the grid width is `min(640px, 94vw)`,
  no horizontal scroll.

---

## 7. Screens and UI copy (Bulgarian)

### 7.1 Top bar (all screens)
Wordmark (click = go to the menu, when not in a game) · right side: `?` ("Как се играе",
reopens the tutorial) · `⛶` fullscreen toggle ("Цял екран").

### 7.2 Tutorial overlay (first visit; flag `rb_tutorialDone` in localStorage)
- Slide 0: "Научи се да фрийстайлваш в 3 лесни стъпки." Button "Да почваме!".
- Slide 1: "1. Следвай топката: тя подскача в ритъм." A demo row of 4 empty cells. A CSS
  ball bounces across them at 90 BPM (`animation` 4 × 667 ms). Button "Напред".
- Slide 2: "2. Кажи римата точно когато топката падне върху нея." Two demo rows. The 4th
  cells are `рима` and `зима` (orange). Button "Напред".
- Slide 3: "3. Останалото е чист фрийстайл!" Rows `Аз | пиша | тази | рима` and
  `чака | ни | една | зима`. Rhyme words in orange, the others cream. Button "Към играта".
- Step dots at the top. "Пропусни" link at the bottom-right. Esc = skip.

### 7.3 Menu
Two panels. Desktop: two columns (beat 1fr, words 1.2fr). Phone: stacked.

**"1 · Избери бийт"**
- Beat rows: a coloured cover square with the emoji/initial, title, meta
  `Римобой · 90 BPM · Бум бап`. The selected row is highlighted. Click = select + start the
  preview.
- Last row: **"＋ Твой бийт"**: hidden `<input type=file accept="audio/*">`. After a file is
  loaded, show an extra settings box under the list:
  - `BPM` number input (60–200), button **"Тапни темпото"** (tap tempo: the average of the
    last 4 intervals; reset after a gap of more than 2 s),
  - `Начало (сек)` number input, step 0.01: the time of the first downbeat in the file,
  - help text: "Тапвай в ритъм 8 пъти. Начало = секундата на първия удар."
- Card **"ТВОЯТ БИЙТ"**: title, meta, big play/pause preview button, progress bar (synth:
  bar counter; file: m:ss / m:ss).

**"2 · Избери думи"** + link "Нулирай" (reset to defaults)
- Preview grid: 4 rows built with `buildChart(4, pattern, list, fill)`. ‹ › arrows rebuild it
  with new random words.
- List card: `‹  🔤 Основни думи · 1 от 7 · Виж всички  ›`. Click opens the modal
  "Избери списък с думи" (emoji, name, description, family count "42 рими", ✓ on the
  selected list).
- Selects:
  - **"Думи"** (fill): `Всички думи` (default) · `Само първата` · `Само последната` ·
    `Без думи`
  - **"Дължина"**: `8 бара` · `16 бара` (default) · `32 бара` · `64 бара` · `Цялата песен`
- `<details>` **"Разширени настройки"**:
  - "Схема на римите": pattern chips (AABB marked `по подразбиране`); `title` = the hint
    from section 4.2.
  - "Скорост": chips `Нормално` · `2x скорост` · `0.5x скорост`.
  - Toggle **"Празна игра"**: "Без думи и без схема, само бийт и топка".
- Bottom bar: **`● ЗАПИС`** toggle (red when on) + big gold **`▶ Играй`**.

Settings persist in localStorage key `rb_settings`:
`{beatId, listId, fill, duration, patternId, speed, blank, rec}`.

### 7.4 Game screen
- Top: `‹` exit button (confirm with "Да прекратим ли играта?" only when REC is on).
  Centre: wordmark (small). Count-in: "Пригответе се!" / "Започваме след N".
  During the game: "Бар 5 / 16".
- Grid viewport: shows 5 rows. Row numbers left/right (count-in rows: −2, −1; then 1..N).
  Filled rhyme cells show the word (font size auto-shrinks for words longer than 9
  letters: `font-size: clamp(14px, calc(var(--rowH)*.38), 28px)`; above 11 letters, use
  0.8×).
- The ball (section 9.3).
- Bottom player: beat title, meta, ⏸/▶ (Space), progress bar of the freestyle part,
  `0:12 / 0:44`. `● REC` blinking badge when recording.
- Pause overlay: "Пауза" + "Продължи" / "Към менюто".

### 7.5 End screen
- Popup first: **"Страхотни барове!"** + round button "Продължи", over confetti.
- Title **"Браво!"**
- Card **"СТАТИСТИКА"**: `Време` (m:ss of the freestyle part = bars × 4 × cellDur),
  `Барове`, `Поредни дни` (streak, with 🔥).
- If recorded: card **"ТВОЯТ ЗАПИС"**: `<audio controls>` + button "Свали записа"
  (download `rimoboy-YYYY-MM-DD-HHMM.webm`).
- Card **"ДУМИ"**: every bar as a row (all words shown). Hint: "Докосни дума, за да видиш
  още рими."
- Buttons: big gold **"Играй пак ›"** (same settings, new words) · ghost **"Меню"**.
- The beat keeps playing quietly (gain 0.5) on the end screen. It stops on "Меню" or
  "Играй пак" (which restarts the beat).

### 7.6 Rhyme dictionary modal
Title = the word. "Рими:" chips = the other words of its family. Then "Още рими:" = words
from the families of other lists whose last 3 letters match the last 3 letters of the
tapped word. Each chip can be tapped. It opens that word. Close with ✕ or Esc.

### 7.7 Streak popup
After the end popup, when the streak increased today: "🔥 N поредни дни!" (1 day: "Първи
ден от поредицата!"). It disappears after 2.5 s or on tap.

---

## 8. Audio engine (`js/audio.js`, `js/beats.js`)

### 8.1 Context and bus

```
ctx = new AudioContext({latencyHint:'interactive'})   // create on the first user gesture
master (Gain 0.9) → comp (DynamicsCompressor: threshold -10, ratio 4) → ctx.destination
                                                                     → recDest (MediaStreamDestination)
```
`ensureCtx()` creates the context lazily and calls `ctx.resume()`. Call it from click
handlers only.

Shared buffers: `NOISE` (2 s white noise, mono), `CRACKLE` (4 s: faint hiss at 0.01 + about
30 random clicks per second at ±0.3).

### 8.2 Instruments (functions `(t, ..., bus)`)

| Name | Recipe |
|---|---|
| `kick(t,v)` | sine, freq 160 → 42 Hz exp over 0.14 s; gain v → 0.001 exp over 0.45 s; + a 3 ms click (noise, highpass 3 kHz, 0.3) |
| `snare(t,v)` | noise → bandpass 1900 Hz Q 0.8, gain 0.7v → 0.001 in 0.2 s; + triangle 190 Hz, 0.4v → 0 in 0.1 s |
| `clap(t,v)` | 3 noise bursts at t, +0.012, +0.024 (bandpass 1200, 0.02 s each, 0.6v) + tail 0.15 s |
| `hat(t,v,open)` | noise → highpass 7500; closed 0.045 s at 0.22v; open 0.28 s at 0.18v |
| `rim(t,v)` | square 1700 Hz + bandpass, 0.03 s, 0.25v (boom bap ghost notes) |
| `keys(t,notes,dur)` | per note: triangle + sine (+6 cents) → lowpass 2200 Hz; attack 0.01, decay to 0.6 in 0.3 s, release 0.25 s at the end of dur; 0.07 per note |
| `pad(t,notes,dur)` | 2 detuned saws (±8 cents) → lowpass 900 Hz; attack 0.4, release 0.6; 0.035 per note |
| `bass(t,midi,dur)` | sine + 15% triangle; attack 0.005, sustain 0.8, release 0.08; 0.5 |
| `sub808(t,midi,dur,glideFrom?)` | sine through a soft-clip WaveShaper (`tanh(2.5x)`); gain 0.9 → 0.001 exp over dur; optional pitch glide 0.08 s from `glideFrom` |
| `bell(t,midi,dur)` | sine f + sine 2.76f (0.3) + sine 5.4f (0.1); attack 0.002, exp decay 1.2 s; 0.12 |

`mtof(m) = 440 * 2 ** ((m - 69) / 12)`. Every node: `.start(t)`, `.stop(t + len + 0.05)`.

### 8.3 Beat definition format (`window.BEATS`)

```js
{ id, title, genre, emoji, cover:'#hex', bpm, swing /*0..0.25 of a 16th*/,
  lofi:false,                 // true: bus → lowpass 3200 Hz + CRACKLE loop at 0.05
  kick:'x.....x..x......x.....x...x..x..',  // 16 chars per bar; the string loops
  snare:'....x.......x...', clap:'', rim:'', // 'x' = hit, 'o' = soft (0.55)
  hat:'x.x.x.x.x.x.x.x.',     // 'x' closed, 'o' open, 'r' = roll (3 hits in a 16th), 'R' = 4 hits
  chords:[[57,60,64,67],[53,57,60,64],[50,53,57,60],[52,56,59,62]], // one per bar, loops
  keys:'x.......x.......', keysLen:7,      // chord stab rhythm per bar, length in 16ths
  pad:false,                               // true: pad holds each chord for the whole bar
  bass:'x......x..x.....', bassOct:-12,    // root of the chord; length = until the next x
  sub:false,                               // true: sub808 instead of bass (an extra -12)
  bell:[[0,76,4],[6,79,2],[8,81,6]], bellLoop:64 } // [step in loop, midi, len 16ths]
```

### 8.4 Starter beats (all original; tune by ear in M3)

| id | title | genre | BPM | swing | notes |
|---|---|---|---|---|---|
| `sofia` | Софийски нощи | Бум бап | 90 | 0.14 | Am7–Fmaj7–Dm7–E7 keys, rim ghosts, warm bass |
| `panelka` | Панелка | Чил бум бап | 84 | 0.18 | lofi:true, Dm7–Gm7–B♭maj7–A7, pad |
| `snejinka` | Снежинка | Лоуфай | 80 | 0.20 | lofi:true, Fmaj7–Em7–Dm7–Cmaj7, slow bell melody |
| `nazdrave` | Наздраве | Олдскул купон | 100 | 0.05 | C–Am–F–G stabs, clap on 2 and 4, open hats, bright bells |
| `champagne` | Шампанско | Трап | 140 | 0 | half-time: kick `x......x..x.....`, snare step 8, hat rolls `r`/`R`, sub808, Cm–A♭–E♭–B♭ pluck + bell |
| `polunosht` | Полунощ | Дрил | 142 | 0 | sliding sub808 (glides), snare steps 8 and 24 of a 2-bar loop, hats `x..x..x.x..x..x.`, Fm–D♭–B♭m–C pad |

Preview in the menu = the same engine, started at `ctx.currentTime + 0.05`.

### 8.5 Synth scheduler (`class SynthBeat`)

```js
start(when) {          // returns t0 (time of the first count-in cell)
  this.out = gain(0.9) → (lofi ? lowpass → out) → master
  this.sp16 = 60 / bpm / 4; this.t0 = when; this.step = 0;
  this.timer = setInterval(() => this.tick(), 25); this.tick();
  return when;
}
tick() {               // look-ahead scheduling, 0.25 s ahead
  const until = ctx.currentTime + 0.25;
  for (;;) {
    let t = this.t0 + this.step * this.sp16;
    if (t > until) break;
    if (this.step % 2 === 1) t += this.def.swing * this.sp16;
    this.playStep(this.step, t);
    this.step++;
  }
}
stop(fade = 0.4)       // clearInterval; ramp out.gain to 0; disconnect after the fade
setVolume(v, ramp)
```
Speed (2x / 0.5x) **does not change the beat tempo**. It changes only `cellDur` (the ball
and the words).

### 8.6 User file beat (`class FileBeat`)

- Load: `file.arrayBuffer()` → `ctx.decodeAudioData` → keep the `AudioBuffer` in memory (not
  saved across reloads; show "Зареди файла отново" after a reload). Keep the
  `{name, bpm, offset}` settings in localStorage.
- `start(when)`: `BufferSource` → `out` gain → master; `src.start(when, 0)`. Returns
  `t0 = when + offset`. If `offset > 0`, the count-in starts on the first downbeat.
- The preview plays the file from the start.

---

## 8A. SoundCloud beats: Bizzle Beats (`js/soundcloud.js`)

**Source:** `https://soundcloud.com/bizzlebeats` (public profile). The reference app also
uses this producer ("Bizzle Beats", 82–139 BPM, boom bap / chill / trap / alt).

### 8A.1 Two integration paths (implement A first; B is optional)

**A. Widget API (no key, the default).** SoundCloud's official embeddable player:
- A hidden `<iframe id="scw" allow="autoplay"
  src="https://w.soundcloud.com/player/?url=https%3A//soundcloud.com/bizzlebeats/tracks&auto_play=false&show_artwork=true&visual=false">`.
  Keep it off-screen, 1×1 px. Its visible artwork, title and a "SoundCloud" link appear in
  our "ТВОЯТ БИЙТ" card, which links back to the track (attribution).
- `const w = SC.Widget(iframe)`; on `SC.Widget.Events.READY` → `w.getSounds(list => …)`
  gives the tracks (`id, title, permalink_url, artwork_url, duration, genre, bpm?`).
  `getSounds` can return the first page only and can contain placeholder objects without a
  title. Verify this in M3, then re-call after a short wait until the titles are filled in.
  If `/tracks` does not load as a list, try the user URL
  `https://api.soundcloud.com/users/<id>` (find the numeric id via path B or from the page
  source), or embed the producer's playlists.
- Controls: `w.skip(index)` (select a track), `w.seekTo(ms)`, `w.play()`, `w.pause()`,
  `w.setVolume(0-100)`, `w.getPosition(cb)` (ms), events `PLAY`, `PAUSE`, `FINISH`,
  `PLAY_PROGRESS` (`{currentPosition}` in ms, about 4 per second).
- **Do not call `play()` before a user gesture.** Browsers block autoplay. The game's
  "Играй" click is the gesture.

**B. Public API (needs `client_id`).** Gives full track metadata (`bpm`, `genre`, tags,
paging):
`GET https://api.soundcloud.com/resolve?url=https://soundcloud.com/bizzlebeats`, then
`/users/{id}/tracks?limit=200&linked_partitioning=true`, with header
`Authorization: OAuth <token>` from the client-credentials flow. App registration:
`https://soundcloud.com/you/apps`. It can be closed or need approval. **Ask the user to
register the app and paste the client id into `config.js` themselves. Never put a
secret in the repo or in chat. Never scrape a client_id from soundcloud.com.**
Path B is only for metadata. The playback still goes through the widget (path A), so the
terms of use are respected (plays and attribution go to the artist).

### 8A.2 Timing model (the key difference from the synth)

The widget plays in a cross-origin iframe. **Its audio cannot be routed into our
AudioContext.** So we keep our own clock and correct it against `getPosition`:

```js
// after w.play() fires the PLAY event:
//   anchorPerf = performance.now(); anchorPos = currentPositionMs (from getPosition)
// songMs(now) = anchorPos + (now - anchorPerf)               // extrapolated
// every PLAY_PROGRESS event: measured = e.currentPosition;
//   drift = measured - songMs(performance.now());
//   if |drift| > 120 ms: re-anchor (hard), else anchorPos += drift * 0.1 (smooth)
// game time t (s) = (songMs - track.offsetMs) / 1000   → same loop as section 9.3, with G.t0 = 0
```
- `SCBeat.start()` = `seekTo(startMs)` → `play()` → resolves on the first `PLAY` event and
  returns the anchor. The game shows the count-in only after that, so a buffering delay
  does not break the sync.
- **Pause:** `w.pause()` + freeze the clock. **Resume:** `w.play()` → re-anchor on `PLAY`.
- **Buffering stall:** when `PLAY_PROGRESS` stops for more than 600 ms while we are
  playing, freeze the ball (show "Зарежда…") and re-anchor when the progress comes back.
- Add a **"Синхрон" slider (±300 ms)** in the advanced settings. It is applied to
  `songMs` and saved per device (`rb_scLatency`). The widget has an unknown output latency.

### 8A.6 Automatic beat drop + BPM (`js/drop.js`, added 2026-11-24 after M5)

> **Superseded by 8A.7 for every track in `js/sc-tracks.js`.** The waveform guess below is
> now only the fallback for tracks that are not in the table. The timing model (SCBeat
> `leadMs`, `zeroMs`, `fromMs`) and the tap tool are unchanged and still current.

User request: the rapping started before the beat dropped. The widget audio is cross-origin,
so Web Audio cannot analyse it, and downloading audio is not allowed (constraint 1). Each
SoundCloud track has a public `waveform_url`; its `.json` form gives 1800 peak values over
the whole track (50–130 ms each; CORS is open). That envelope is the only input.

- **Drop:** level = median 1-s loudness of the middle 60% of the track. Slide 4-s windows over
  the first 45% (max 70 s); rise = mean(after) − mean(before), relative to the level. Take the
  earliest rise ≥ max(60% of the biggest rise, 0.08) whose after-window is ≥ 0.8 × level
  (later rises are usually a break ending), walk to its local maximum, then refine to the
  biggest 0.45-s step within ±1.5 s. That onset = bar 1. No such rise → drop 0.
- **BPM:** autocorrelation of the detrended envelope, a comb over 32 beat lags (long lags give
  precision despite the coarse values), 70–160 BPM in 0.25 steps; < 80 doubles if close.
  Matched the reference BPM exactly for Moments Like This, Roses, Expectations, Round The
  Bend, Enchanted, Behind The Mask, Florentine, The Frogg; Fresh Air 93 vs 94; Impulse 130 vs
  104 (wrong). The table/user BPM always wins over the estimate.
- Tried and dropped: folding the envelope at the bar length to find the downbeat phase (the
  drops did not line up with it) and a rhythmic-pulse feature (too noisy).
- **Timing model (SCBeat):** `new SCBeat(track, tempo, syncMs, {leadMs})`, `leadMs` = count-in
  length (8 cells × cellDur, so it follows the game speed). `zeroMs = dropMs − leadMs` is
  `time() = 0`; playback starts 2 song bars before it (`fromMs`), or at the user's "Пусни от".
  A drop too early for the count-in moves on by whole song bars (`engine.dropMs`). The ball
  bounces in place during the intro ("Слушай интрото…"). "Цялата песен" = all bars that fit
  after the drop. Without `leadMs` (menu preview) nothing changes.
- **Data:** results `{bpm, dropMs}` per slug in localStorage `rb_scAuto` (`{v: AUTO_V, data}`;
  bump `AUTO_V` in soundcloud.js after changing drop.js). `SCW.analyzeAll()` runs after the
  catalogue loads and emits `analysis` per track. `SCW.tempoFor(slug)` → `{bpm, bpmSrc,
  dropMs, dropSrc, startMs, verified, user, auto}` (user > table > auto per field; an old user
  `offsetMs` counts as `dropMs`). `SCW.saveTempo(slug, {bpm, startMs, dropMs})` stores only the
  fields the user changed; `SCW.clearTempo(slug)`.
- **Tempo box:** BPM, "Пусни от (сек)" (blank = auto), "Дроп (сек)", tap tempo, a line with the
  automatic values, and "Върни автоматичните" (clears the user's values).
- **Correction (same day):** the user reported BLIGHT's drop is at 0:10; the guess was 2.6 s.
  Its intro is as loud as the beat in the peak data, so no loudness rule can see that drop.
  The waveform guess is now only a fallback. Precedence for the drop: user tap > table
  `dropMs` (ear-checked, shared) > waveform guess. Ear tool in the tempo box:
  - **"Тапни дропа и ритъма"** (big button, `pointerdown` for low latency, or the physical
    **T** key on the menu): during the SC preview, the first tap = the drop, then every beat.
    Positions come from `SCW.position()`. `RB.beats.fitTaps(positions, knownBpm)` numbers the
    taps by beat (single-beat intervals; a known BPM is used for numbering when it agrees
    within 15%), fits pos = drop + i × beat by least squares (4 passes), keeps the known BPM
    when the taps agree within 1 BPM, and returns `ok: false` (message "Тапите са неравни")
    when the RMS residual is ≥ 10% of a beat. Simulated: 18,000 runs, ±30–50 ms jitter, 15%
    missed beats → drop error median 5–12 ms, p99 ≤ 42 ms, **no accepted result > 60 ms off**.
  - **"▶ Чуй дропа"** plays from 4 s before the drop (preview `startPreview(fromMs)`).
  - **"Копирай моите настройки"** copies the user's values (`rb_scTempo` + titles) as JSON.
  - `SCW.load` now polls `getSounds()` again (6 × 2.5 s) and appends new tracks (`tracks`
    event): all **21** tracks are listed and analysed.
  - Reference BPMs added to the table: behind-the-mask 86, florentine 89, the-frogg 82,
    impulse 104; `blight: {dropMs: 10000}`.
- Verified 2026-11-24: all 11 listed tracks analysed (no "Настрой темпо" badge left); in a real
  game on Moments Like This (drop 20.675 s, 90 BPM) playback started at 10.0 s, `time()` = 0 at
  15.34 s, so bar 1 = 20.675 s; manual drop override and reset work; synth games unchanged; no
  console errors. **Not checked by ear.**

### 8A.7 Measured beat data (`tools/analyze_sc.py`, rework 2026-11-24)

**Why.** The user reported wrong BPMs, a ball off the beat and missed drops. Causes: the
waveform JSON has ~80 ms per value (too coarse for a beat phase), the BPM came from
autocorrelation (BLIGHT 87.4 instead of 92, Expectations 141 instead of 94) and the drop from
loudness only. **Reverse engineering of the reference** (therhymegame.com web build, the
Expo bundle `App-*.js`, static reading, 2026-11-24): it does **no** beat detection. Every
beat has hand-made metadata `{beatBpm, beatDropMs, beatEndMs}` (bundled example: Roses
88 / 21800 / 152800; the catalogue comes from their backend), it plays its own MP3 and
computes `beat = (positionMs + lagAlignmentMs − beatDropMs) / msPerBeat`. SoundCloud's
API has no beat data (only an optional, usually empty `bpm` integer and the same waveform).
**Decision (user, 2026-11-24):** measure every track once at development time from the real
audio, keep only the numbers. The app itself still only streams through the widget.

**Tool.** `tools/analyze_sc.py` (Python 3.12 venv: `yt-dlp librosa imageio-ffmpeg`):
lists the profile with yt-dlp, downloads each track into a temp folder, analyses it, writes
`tools/sc-analysis.json`, deletes the audio. `--only slug…` for some tracks, `--local DIR`
to re-analyse kept files, `RB_DEBUG=1` prints the drop candidates. Then
`node tools/bake-sc-tracks.js` writes `js/sc-tracks.js` (do not edit it by hand).

**Method** (constant tempo, which DAW-made beats have):
1. HPSS → onset envelopes (percussive full band + 150 Hz–2.2 kHz "snare" band), hop 11.6 ms.
2. Tempo: sweep 60–180 BPM (0.05 steps) of *fold sharpness* (onset envelope folded over one
   beat period; peak / mean). A wrong tempo smears the fold flat. Octave: the reference BPM
   hint when a candidate agrees within 2 %, else the best candidate in 70–160. Fine search
   ±0.1 BPM, snap to the whole BPM when it scores ≥ 97 %. Flags 3:2 / 4:3 rivals.
3. Beat phase: peak of the 48-bin fold (sub-bin parabola); the half-beat alternative wins
   when the snare band is stronger there. (The first version subtracted the half-beat
   position and failed on beats with strong 8th notes: Fresh Air was 175 ms off.)
4. Downbeat: snare backbeat on 2 and 4 gives the bar phase modulo 2; beat 1 vs 3 from section
   changes (4-beat energy steps of any layer), chord change and kick on that beat.
5. Drop = where the drum kit (percussive, hi-hat band, low band) steps up ≥ 1.5× and stays;
   among the beats of the right parity near that step, the one with the biggest *impact*
   (kick onset + broadband onset + bass step + harmony step, + the bar-stats margin, − 0.1
   per beat later). This skips pickups and fills (BLIGHT: hats start at 9.8 s, kick + bass
   at 10.49 s). No step → the drums are in from the start → first sounding downbeat.
6. End = last beat with the full arrangement, rounded down to whole bars after the drop.
7. Timing fix (review): the coarse envelopes (n_fft 2048, centred) lag the real transients
   by ~27 ms, so the first grid was 27 ms late everywhere. Steps 2–6 stay on the coarse grid
   (all its features share the lag); the reported times move by the lag measured per track
   on a fine > 2 kHz flux (n_fft 256, hop 32), calibrated on synthetic clicks. 19 tracks
   measured −22…−35 ms; outliers (eclipse +6, florentine −45) use −27 ms and are flagged.
8. `tools/sc-overrides.json`: reviewed drop corrections in whole beats, applied by the bake
   script (your-eyes −1 beat: bass + chords enter there; 2wenty −2 beats: first full kick +
   808, bar stats agree). The end is re-rounded to whole bars.

**Ground truth / checks:** BLIGHT drop 10.46 s (user by ear: "0:10"); Roses 88 BPM, drop
21.92 s (reviewer's transient: 21.917 s), end 152.8 s (reference game: 88 / 21.8 / 152.8 — its values are rounded); all 12
reference BPM hints confirmed except Fresh Air (93 on SoundCloud vs 94). Analysed durations
match the widget's `duration` within 26 ms (same audio). A reviewer agent measured no BPM
drift (first vs last 60 s within 0.1 ms on 20 tracks; restraint 4.6 ms ≈ 123.995 BPM). In the app (Roses, 16 bars):
`position − time()` = `dropMs − leadMs` ± 4 ms, bar 1 = the drop; full song = 48 bars,
ending at 152.85 s. **Not checked by ear.** `check: true` marks tracks with a flag (tempo
ambiguity, close drop candidates, weak backbeat); hear those first.

**App side.** `SCW.tempoFor()` adds `endMs`, `measured`, `check`, `base`; the waveform
analysis skips measured tracks; user saves now carry `v: 2`, and older `rb_scTempo` entries
(set against the old guesses) are ignored for measured tracks (kept in storage, replaced by
the next tap/edit); a drop typed within 10 ms of the table value is not stored (the input
shows 10 ms steps); `barsFor('full')` falls back to the song end when a user drop is too
close to `endMs`; the bake script warns on overrides for unknown slugs; a full analyzer
run prunes tracks that left the profile; `~` before the BPM only for guesses and `check` tracks; the
tempo box says "Измерено от аудиото: …" and "Върни измерените"; `game.js barsFor('full')`
uses `endMs`. `serve.py` honours `PORT` (the preview tool moves to 8081 when 8080 is busy).

### 8A.3 Per-track tempo data (`js/sc-tracks.js`)

SoundCloud's `bpm` field is usually empty. Keep a hand-filled table keyed by the track
permalink:
```js
window.SC_TRACKS = {
  // 'roses': { bpm: 88, offsetMs: 0, genre: 'Чил бум бап' },   // verify by ear
};
```
- A track that is not in the table appears in the list with a **"Настрой темпо"** badge.
  On selection, the box from 7.3 appears: BPM input + "Тапни темпото" + offset ("Начало
  (сек)"). The values are saved to localStorage `rb_scTempo[permalink]` and override the
  table.
- Offset = ms of the first downbeat that the game counts from. Default 0. Many beats have
  an intro. Let the user set `startMs` (where playback begins, default 0) and `offsetMs`
  (first downbeat ≥ startMs). Store both.
- In M3: fill the table for the top 15 tracks (tap tempo + listen). The BPMs that the
  reference shows for Bizzle Beats can help as hints (section 1.3: Roses 88, Behind the
  Mask 86, Enchanted 92, Florentine 89, Get Through It 88, Impulse 104, Pierce 128, Round
  the Bend 98, The Frogg 82, Tip Toe 139, Argentina Beat 95, Crazy World 91, Expectations
  94, Fresh Air 94, Internalise 95, Let Me Down 97, Mind Over Matter 84, Moments Like This
  90, Roll The Dice 120, Sharp 98, Spell Battle 94). Confirm each value by ear. The
  SoundCloud versions can differ from them.
- **Full song** for SC = `floor(((duration - offsetMs)/1000 / cellDur - COUNTIN_BARS*4) / 4)`.

### 8A.4 UI changes

- Beat panel header tabs: **"Bizzle Beats"** (default) | **"Вградени"** (synth) | **"Твой
  файл"**.
- SC rows: artwork thumbnail (`artwork_url` with `-large` → `-t200x200`), title, meta
  `Bizzle Beats · 88 BPM · <genre>`, a link icon to `permalink_url`. A search box filters
  the titles (the reference has search too).
- Loading state "Зареждам бийтовете от SoundCloud…". Error state (offline or the widget
  failed) → switch to the "Вградени" tab automatically and show a toast.
- The end screen beat card shows "Слушай в SoundCloud ↗".

### 8A.5 Limits to accept and document in the app's help text

- **REC cannot capture the SoundCloud audio directly** (cross-origin iframe). With an SC
  beat, the recording = microphone only. The mic hears the speakers, so the beat is usually
  present anyway. Show this note next to the REC toggle when an SC beat is selected:
  "При SoundCloud бийт записът е само от микрофона." Synthesized and own-file beats
  still record a clean mix.
- The end screen volume dip (section 9.5) uses `w.setVolume(50)`.
- Licensing: streaming via the official embed is within SoundCloud's terms. Downloading,
  re-uploading or stripping attribution is not, and we never do it. Using the beats for a
  private party is fine. For any public or commercial use, the user must check Bizzle
  Beats' own licence terms.

---

## 9. Game loop (`js/game.js`)

### 9.1 Start sequence (click on "Играй")

> Updated after M3a/M4: the Play button (menu-words.js) already checks `RB.beats.current().ready`
> and calls `RB.startGame()`. The engine comes from `RB.beats.makeEngine()`. The SC engine's
> `start()` is async, so always `await` it. `engine.time()` already subtracts the latency.
> The START HERE section has the exact M5 steps.
1. `ensureCtx()`; stop the preview.
2. When REC is on: `await getUserMedia` **before** the beat starts (so the permission prompt
   does not interrupt the count-in). On a refusal, show the toast "Няма достъп до
   микрофона: играем без запис" and continue.
3. Build: `cellDur`, `bars`, `chart` (section 4), render the grid (9.2), `showScreen('game')`.
4. `t0 = engine.start(ctx.currentTime + 0.15)`; start the recorder (section 10).
5. `G = {engine, t0, cellDur, bars, chart, total, countCells, lastIdx:-1, raf}`;
   `requestAnimationFrame(loop)`.

### 9.2 Grid DOM
```
.viewport (overflow hidden; height = 5*rowH + 4*gap)
  .rows (transform: translateY(...); transition: transform 160ms ease-out)
    .row  ×(COUNTIN_BARS + bars)   → [label][cell][cell][cell][cell][label]
```
Cell classes: `cell`, `rhyme c{0-5}` (when the chart has an item), `hidden` (show:false →
"?"), `lit` (current).

### 9.3 Frame loop
```js
function loop() {
  const lat = ctx.outputLatency || ctx.baseLatency || 0;   // visual sync with what you hear
  const t = ctx.currentTime - lat - G.t0;
  const f = t / G.cellDur;                 // float cell position
  const idx = Math.floor(f);
  if (idx !== G.lastIdx) { onCell(idx); G.lastIdx = idx; }
  drawBall(f);
  updateProgress(t);
  if (idx >= G.total) return endGame();
  G.raf = requestAnimationFrame(loop);
}
onCell(idx):  if idx < 0: return
  row = Math.floor(idx / 4); rows.style.transform = `translateY(${-row * (rowH + gap)}px)`
  un-lit the previous cell; light cells[idx]
  header text: idx < countCells → `Започваме след ${countCells - idx}` else `Бар ${row - COUNTIN_BARS + 1} / ${bars}`
drawBall(f):
  const i = Math.floor(f), p = f - i;
  const from = colX[((i % 4) + 4) % 4], to = colX[(((i + 1) % 4) + 4) % 4];
  x = from + (to - from) * easeInOut(p)      // when to < from (row wrap), the ball arcs back left
  y = baseY - arcH * 4 * p * (1 - p)         // lands (p = 0) exactly on the beat; arcH = 1.1 * rowH
  if f < 0: the ball bounces in place over column 0
  trail: keep the last 3 positions, opacity .35/.2/.1
```
`colX` = the centres of the 4 cell columns relative to `.viewport`. Recompute on `resize`.
`baseY` = top of the first visible row − ball radius.

### 9.4 Pause / resume / exit
- Pause: `ctx.suspend()`. `currentTime` freezes, so the scheduler and the loop freeze
  automatically. `recorder.pause()`. Show the overlay.
- Resume: `ctx.resume()`; `recorder.resume()`.
- Exit: `engine.stop(0.2)`, `cancelAnimationFrame`, stop the recorder (discard the data),
  stop the mic tracks, `showScreen('menu')`.
- `visibilitychange` → hidden: auto-pause.

### 9.5 End
`engine.setVolume(0.5, 1)` (keep playing), stop the recorder → blob, `bumpStreak()`, show
the popup + confetti, render the end screen (section 7.5).

---

## 10. Recording (REC)

```js
mic = await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false, noiseSuppression:false, autoGainControl:false}});
micSrc = ctx.createMediaStreamSource(mic); micGain = gain(1.3); micSrc → micGain → recDest   // NOT to the speakers (feedback)
recorder = new MediaRecorder(recDest.stream, {mimeType: pick('audio/webm;codecs=opus','audio/webm','audio/mp4')});
recorder.start(1000); chunks = []; ondataavailable → chunks.push
stop → new Blob(chunks, {type: recorder.mimeType}) → URL.createObjectURL
```
The beat reaches `recDest` through master → comp → recDest. Stop the mic tracks after
`stop`. Revoke the previous blob URL when a new game starts.

---

## 11. Persistence (localStorage, every access wrapped in try/catch)

| Key | Value |
|---|---|
| `rb_settings` | section 7.3 |
| `rb_tutorialDone` | `"1"` |
| `rb_streak` | `{last:"YYYY-MM-DD", count:n}`. Date = `new Date().toLocaleDateString('sv')` (local). Same day: no change; yesterday: +1; otherwise: 1 |
| `rb_fileBeat` | `{name, bpm, offset}` |
| `rb_favs` | array of `"synth:<id>"` / `"sc:<slug>"` (M8) |
| `rb_tv` | `true` / `false`: TV mode (M8) |

---

## 12. Keyboard and accessibility

- Menu: Enter on a focused beat = select; `P` = play.
- Game: Space = pause/resume, Esc = exit (with confirmation when REC is on).
- Modals: Esc closes; focus trap; `aria-modal`.
- Buttons have `aria-label` in Bulgarian. Words in cells stay readable at 3 m (TV mode).
- `prefers-reduced-motion`: no ball trail, no confetti, no star twinkle.

---

## 13. Testing checklist (run in Chrome via `start.bat` / `http://localhost:8080/`, and on a phone)

1. Tutorial: first load shows it; "Пропусни" works; `?` reopens it.
2. Each synth beat previews in the menu without clicks or clipping. The tempo matches the
   BPM label (count 8 bars with a stopwatch: 8 × 4 × 60/BPM).
3. AABB / 16 bars / all words: 16 rows; words in cell 4 of each row; colours pair up
   (rows 1–2, 3–4, …); no family repeats.
4. Each pattern renders its slots exactly at the beats in section 4.2 (check aAaA: cells 2
   and 4 of every row).
5. Fill modes: first/last show exactly one word per group; the other cells show coloured
   "?".
6. Blank game: no words, no colours.
7. Speeds: 2x → the ball moves twice per beat; 0.5x → once every 2 beats; beat tempo
   unchanged.
8. Ball sync: the ball lands on the kick/snare by ear, also on Bluetooth (outputLatency).
9. Pause/resume keeps the sync; Esc exits cleanly; the preview restarts in the menu.
10. REC: the downloaded file has the voice + the beat, and plays in VLC/Chrome.
11. User file beat: load an mp3, tap the tempo, set the offset; the ball lands on the
    downbeats; "Цялата песен" ends before the file ends.
12. End screen: stats correct (8 bars at 88 BPM → 0:22 — matches the reference); the
    dictionary opens and chips navigate; "Играй пак" gives new words.
13. Streak: set `rb_streak.last` to yesterday in DevTools → plays → count +1.
14. 360 px wide: no horizontal scroll; the grid fits; the buttons are reachable.
15. No console errors.
16. SoundCloud: the catalogue loads; 3 tracks play in the game with the ball on the downbeat
    for 32 bars (drift under 50 ms by ear); pause/resume re-syncs; pull the network cable →
    the fallback toast appears and the synth beats work.

---

## 14. Progress checklist (milestones; tick them and keep them in order)

- [x] **M0** Analyse the reference app, write this spec (session 1, 2026-11-23)
- [x] **M1** Skeleton: `index.html`, `css/style.css` (tokens, layout, screens), screen switching, top bar, fullscreen (session 2)
  - The full markup for all screens and modals is already in `index.html` (menu, game, end, list/dict modals, popup, tutorial, toast, confetti canvas, hidden `#scw` iframe). The CSS for all of them is in `style.css`. Later milestones only add JS. Keep the element ids.
  - The `<script>` tags of later milestones are **commented out** at the bottom of `index.html`. Uncomment each one when its file exists.
  - `js/app.js` exposes `window.RB = {$, store, showScreen, toast, openModal, closeModal, screen}`. Its "M1 placeholders" block (Play → game, Exit → end, and so on) must be **replaced** in M4/M5/M6.
  - Dev server: `.claude/launch.json` config `rimoboy` (`python -m http.server 8080`). For the user: `start.bat`. The built-in preview pane shows a `file://` page as a static snapshot without JS, so always test through the server.
- [x] **M2** Data: `js/words.js` (6 lists from 5.3 + mix), `js/patterns.js`; `buildChart` + FamilyBag in `js/chart.js`; quick console test (session 3)
  - `words.js` stores the families as space-separated strings and normalizes them to `{id:'list:i', words:[]}`. It builds the "Микс" list (index 1) at load time. List sizes: basic 23, two 17, newyear 17, mic 15, food 12, hard 11, mix 95 families. M9 still has to grow each list to 40+.
  - `chart.js` exports `window.Chart = {buildChart, renderRows, FamilyBag, shuffle, COLORS}`. `renderRows(container, chart, {countinRows, revealAll, tap})` builds `.row > .lbl + 4×.cell + .lbl`, with classes `rhyme cN`, `long` (>8 letters), `xlong` (>11), `tap` + `data-word`/`data-fam`. M5 (game) and M6 (recap) reuse it.
  - `PATTERNS.byId(id)` falls back to AABB.
  - **`node tests/data-check.js .`** checks for families with fewer than 4 words, duplicates in a list, slot positions of every pattern × fill × length, and one family per group. Run it after every word-list edit (M9). It must print `OK`.
  - `app.js` has a **temporary M2 preview block** (it renders list 0 in AABB, and the arrows reshuffle). Replace it in M4.
  - Known: the mix list can show the same word twice in one game when two lists share a family (тост, гост…). Acceptable.
  - On a phone, the preview cells are about 48 px wide, so long words get an ellipsis there. The game grid is wider. Check this again in M5.
- [x] **M3** Audio: `js/audio.js` (ctx, bus, instruments), `js/beats.js` (6 beats + SynthBeat); menu preview plays (session 4)
  - Globals: `window.RBAudio` (A: `ensure()`, `ctx`, `master`, `comp`, `recDest`, `latency()`, `makeOutput(ctx)`, `buffers(ctx)`, `mtof`). Not `window.Audio`, which would shadow the built-in. `window.Instruments` (signature `I.name(bus, t, ...)`, nodes made on `bus.context`, so they also work in an OfflineAudioContext). `window.BEATS` (+ `BEATS.byId`), `window.SynthBeat`.
  - **Engine interface** (FileBeat in M7 and SCBeat in M3a must match it): `start(when[, ctx, dest]) → t0`, `time()` (seconds since t0, minus the output latency), `setVolume(v, ramp)`, `stop(fade)`. Pause = `ctx.suspend()` for the synth and file engines.
  - Gains were rebalanced after an offline analysis (the first mix had a constant bass that buried the kick, and it clipped). Current values: master 0.8, compressor −12 dB 6:1, kick 0.85, snare noise 0.95, keys 0.05/note, bass 0.2 (decays to 45%), sub808 0.55. The specs in 8.2 are the original starting values. **The code is the source of truth.**
  - The beat patterns in `beats.js` differ slightly from table 8.4 (written out in full). All 6 are untuned by ear. **The user should listen and give feedback.**
  - Test: **`http://localhost:8080/tests/audio-check.html`** renders all beats offline and prints PASS/FAIL (peak < 1, no clipping, the kick pulse is visible). All 6 PASS.
  - `app.js` has a **temporary M3 block**: the "Вградени" tab is forced active, the synth beat list renders, a click selects the beat and starts the preview, and the preview card shows "Бар N" (verified: 140 BPM, t=1.91 s → Бар 2). The other tabs show a toast. Replace it in M4. `window.RB_M3` = debug handle.
- [x] **M3a** SoundCloud: first test the widget on `file://` (otherwise add `start.bat` + local server); `js/soundcloud.js` SCBeat (load the catalogue, select, play/pause, drift-corrected clock); `js/sc-tracks.js` filled for 15 tracks; beat panel tabs; sync slider; offline fallback (session 5)
  - **Findings (tested live, `tests/sc-check.html`):** the widget accepts the profile URL `https://soundcloud.com/bizzlebeats` directly. `getSounds()` returns **11 tracks**, all with titles on the first try: Moments Like This, Roses, Your Eyes, Butterflies, Fresh Air, Expectations, BLIGHT, Warming Up, Round The Bend, Rescue, Enchanted. `bpm` is always `undefined`. PLAY_PROGRESS fires about every 17 ms, and the extrapolated clock vs `getPosition` stays within ±4 ms. **Without a user gesture, SoundCloud pauses itself after about 1 s.** After any click on the page, programmatic `play()` works. `seekTo` is exact. `seekTo()` while paused **fires PLAY_PROGRESS**, so the `playing` state comes only from PLAY/PAUSE events.
  - `file://` was not tested (the preview pane cannot run file:// pages). The app is served by **`serve.py`** (Python, `Cache-Control: no-store`) via `start.bat` and the `.claude/launch.json` config `rimoboy`. The no-cache server matters: the stock `http.server` let the browser keep a stale index.html/app.js, which caused false test failures.
  - `js/soundcloud.js` → `window.SCW` (singleton widget: `load()`, `tracks[] {index, id, slug, title, url, artwork, durationMs, genre}`, `play(index, fromMs)` (async; resolves on real advancing playback), `pause()`, `resume()`, `setVolume(0..1)`, `position()`, `tempoFor(slug)`, `saveTempo(slug, t)`, events via `SCW.on('progress'|'play'|'pause'|'externalPause'|'finish'|'state')`). `window.SCBeat(track, tempo, syncMs)`: `async start() → 0`, `time()` = (songMs − offsetMs − syncMs)/1000, `pause()`, `resume()`, `stalled()`, `setVolume`, `stop()`, `onExternalPause` callback. **The game (M5) must `await engine.start()`** (SC is async; `await` on a number works for synth).
  - `js/sc-tracks.js`: BPM hints from the reference app for 6 tracks (Roses 88, Moments Like This 90, Fresh Air 94, Expectations 94, Round The Bend 98, Enchanted 92), all `verified:false`, offsets 0. **No reference data** for Your Eyes, Butterflies, BLIGHT, Warming Up, Rescue: they show a "Настрой темпо" badge, and Play stays blocked until the user taps a BPM. **TODO (needs ears, the user or a session with audio):** verify BPM + first-downbeat offset for all 11 tracks and set `verified:true`.
  - `js/menu-beats.js` (new file, loads after app.js) = the real beat panel: tabs (Bizzle Beats default / Вградени / Твой файл placeholder), search (SC only), list with artwork, preview card with a SoundCloud link and m:ss progress, tempo box (BPM, Старт, Първи удар, tap tempo with 4–9 taps, saved to `rb_scTempo`), sync slider (`rb_sync`, ±300 ms; negative = ball earlier), selection persisted in `rb_beatSel`. Exposes **`RB.beats = {current(), makeEngine(), stopPreview(), sync}`**. `current().ready/reason` says whether Play may start.
  - Offline fallback verified with **`?offline`** in the URL (a simulation flag in `SCW.load`): toast "Няма интернет: ползвай вградените бийтове." → switches to Вградени.
  - The temporary M3 block was removed from app.js (the beat panel now lives in menu-beats.js). The temporary M2 words preview is still in app.js (M4 replaces it).
- [x] **M4** Menu UI complete: beat list, preview card, words panel, preview grid, list modal, selects, advanced setup, persistence (session 6)
  - New file **`js/menu-words.js`** (loads after menu-beats.js): the words panel, settings and the Play/REC buttons. Settings live in `rb_settings` `{listId, fill, duration, patternId, speed, blank, rec}`, defaults `basic/all/16/aabb/normal/false/false`, sanitized on load. "Нулирай" resets everything except `rec`. Exposes **`RB.settings = {get(), list(), pattern() (null for a blank game), fill() (effective: 'none' when blank), speedFactor(), speedLabel()}`**.
  - **Play** checks `RB.beats.current().ready` (toast with the reason, for example an SC track without BPM). Then it calls **`RB.startGame()`**, which **M5 must define** in game.js. Until then: toast "Играта идва скоро (M5)". The physical key `P` (`e.code==='KeyP'`, so it works on Bulgarian layouts) = Play on the menu.
  - REC toggle: only stored and shown for now (M7 records). `#recNote` appears when REC is on and an SC beat is selected.
  - Blank game disables the fill select (dimmed) and the pattern chips, and the preview becomes empty.
  - `chart.js` got **`Chart.fitCells(container)`** (called by `renderRows`, re-run after rAF and `document.fonts.ready`). It shrinks the font of each word until it fits its cell (min 8 px). In the preview only, rhyme cells get `flex:2.2`, the arrows are hidden at ≤520 px, and a tap on the grid deals new words. Verified: 0 overflowing words over 100 reshuffles × 4 lists at 360 px (smallest font 10 px).
  - CSS rename: the select labels are `.field` (was `.sel`, which clashed with the `.sel` = selected item class and uppercased the chosen list in the modal).
  - app.js: the M1 Play/listCard placeholders and the M2 preview block are removed. **Still placeholders:** `#exitBtn` → menu, `#menuBtn` → menu (M5/M6 replace them).
- [x] **M5** Game screen: grid render, count-in, scroll, ball, header, player bar, pause/exit (session 7)
  - New file **`js/game.js`** (last script). `RB.startGame()` (async): stops the preview, builds the chart (`bars` per the brief; 'full' = synth 64, SC from `durationSec`), shows the game screen, renders with `countinRows: 2`, measures the geometry from the DOM (`colX`, `rowStep`, `padTop` = `#rows.offsetTop`), then starts the engine (SC: "Зарежда…" until `await engine.start()` resolves; a reject → toast + menu). A `token` counter drops a late SC start when the player already left.
  - The frame loop uses only `engine.time()`. `frame()` = one frame (cell lighting, row scroll, header, ball + 3 trails, progress); `loop()` = rAF around it. The trail clones are the ball position 0.05/0.1/0.15 cells earlier (not stored frames), hidden with reduced motion. Arc height = min(1.1 × rowH, padTop − ball size), so the ball never clips at the top on a phone.
  - Rows already played get class `past` (opacity .22). Otherwise they scroll up into the ball area and clutter it.
  - Header: count-in "Пригответе се!" / "Започваме след N" (N = cells left); game "Бар N / M" / list name (or "Празна игра"); SC buffering → "Зарежда…".
  - Pause: `#pauseBtn`, Space (blurs the focused button), `visibilitychange`, SC `onExternalPause`. Esc / `#exitBtn` exit (with `confirm('Да прекратим ли играта?')` only when REC is on). `#quitBtn` → menu. Exit resumes a suspended AudioContext so the menu preview works.
  - The app.js placeholders for `#exitBtn`/`#menuBtn` are removed. `#menuBtn` → `RB.toMenu()`, `#againBtn` → `RB.startGame()`, brand click on the end screen → `RB.toMenu()`.
  - Verified (session 7): synth 90 BPM / 8 bars, cellDur 0.667 s, 0 lit-cell mismatches over 81 hand-driven frames; header and row scroll correct; pause freezes `time()` (delta 0), resume keeps the sync; end → `end` screen with gain 0.45 (0.9 × 0.5), "Меню" stops the beat; all 10 patterns put words exactly on the chart cells (+8 count-in cells, none in the count-in); speeds 2x/0.5x → cellDur 0.333/1.333, meta shows the speed; 360 px: no horizontal scroll, 0 overflowing words (min font 11.6 px); SoundCloud "Roses" (~88 BPM) after a real click: 0 mismatches over 59 frames, pause/resume keeps the sync with `SCW.position()`, Esc stops SoundCloud; no console errors. **Not judged by ear** (ball-on-kick feel, Bluetooth latency).
  - Agent code review fixes (session 7): `SCW.play` no longer trusts `S.playing` right after a `pause()` (new `pausePending` flag; it always sends `play()` then), so "Играй пак" on a SoundCloud beat no longer times out. `SCW.owner`: only the SCBeat that started playback may pause the widget on `stop()`, so a stale start (exit during loading, then Play again) cannot silence the new game. `SCW.playGen`: an older `play()` call rejects with `superseded`. `expectPause` is cleared on `resume()` and FINISH. In game.js: a pause during the start is latched (`pendingPause`) and applied once the beat runs (also when the tab is hidden); held keys (`e.repeat`) are ignored; geometry is re-measured after `document.fonts.ready`; a restart fades the old synth beat in 0.05 s. Re-verified: SC game, SC restart, SC exit-during-load + replay, synth restart, no console errors.
- [x] **M6** End screen: popup, confetti, stats, recap grid, dictionary modal, streak, play again (session 10)
  - New file **`js/end.js`** (loads after game.js). `game.js endGame()` now cancels the rAF, dims the beat (`setVolume(0.5, 1)`), shows the end screen and calls **`RB.onGameEnd(G)`**. `toMenu()` and `startGame()` call **`RB.end.cleanup()`** (it hides the popups and the dictionary and stops the confetti), so every way off the end screen is covered.
  - Stats: `Време` = `G.playSec` rounded to the nearest second (8 bars at 88 BPM = 21.8 s → 0:22). The game player total `#gDur` uses the same rounding now. `Барове` = `G.bars`. `Поредни дни` = `bumpStreak()` (`rb_streak {last, count}`, local `toLocaleDateString('sv')`; same day: no change; yesterday: +1; otherwise, or junk data: 1).
  - The popups reuse `#popup`. First "Страхотни барове!" (🎉, sub line "8 бара · 0:21", button "Продължи", Esc closes it). When the streak changed today, closing it opens the streak popup ("🔥 N поредни дни!" / "Първи ден от поредицата!", no button; it closes on any tap or after 2.5 s). The "Продължи" click calls `stopPropagation()`. Without it, the same click closed the streak popup at once.
  - Confetti on `#confetti`: 120 rotating paper pieces, 3 s with a fade in the last 0.6 s, frame-rate independent, colours from the `--r1..--r6` and `--gold` tokens. None with `prefers-reduced-motion`.
  - Recap: `Chart.renderRows(recap, G.chart, {revealAll: true, tap: true})`. Tap cells get `tabindex=0`, `role=button` and Enter/Space. The hint hides when there are no words (blank game). The words are re-fitted on resize.
  - Dictionary (`RB.end.openDict(word, famId)`): an index over all lists except "Микс" (it reuses the same family objects). "Рими" = the other words of the family. "Още рими" = up to 40 words of other families that end in the same last 3 letters. **Added beyond the spec:** when no word matches 3 letters, it falls back to the last 2 letters (for example "банан" had no "-нан" match; now it shows роман, екран, план…). Chips open their word. Focus goes to ✕, and Tab is trapped in the dialog.
  - Beat card `#eCover/#eTitle/#eMeta/#eLink` (the speed is appended to the meta; the SoundCloud link shows only for SC beats).
  - CSS: at ≤860 px the 3 stats sit in one row, so the word recap starts higher on a phone.
  - Verified (session 10): synth "Софийски нощи" 90 BPM, 8 bars → 0:21, 8 recap rows, 8 tap words; streak with `last` = yesterday and count 3 → 4, and the "4 поредни дни!" popup closes after 2.5 s; same day again → stays 4, no streak popup; `bumpStreak` edge cases (none, old date, yesterday, today, junk); dictionary: рой → бой (chip) → прибой ("Още рими"), Esc closes it; "Играй пак" → new words, popups cleared; "Меню" → `G` null, beat stopped; fake 88 BPM → 0:22; blank chart → hint hidden; 360 px: no horizontal scroll, 0 overflowing words (min font 11 px); no console errors. `node tests/data-check.js .` prints OK.
- [x] **M7** REC recording + user file beat (tap tempo, offset, full song) (session 10)
  - New **`js/filebeat.js`** (after beats.js): `FileBeat(buffer, bpm, offsetSec, {leadSec, fromSec})`. **Timing differs from 8.6 on purpose:** "Начало" is bar 1 of the rapping (like the SoundCloud drop), and the 2-bar count-in plays just before it. When the file has less than a count-in before "Начало", bar 1 moves on by whole bars, so the grid stays on the beat (`rapStart`, `fileStart`). `time()` = seconds since the first count-in cell (latency-corrected); `position()` = file seconds heard now. Pause = `ctx.suspend()` like the synth. `afterRap` = seconds of music after bar 1: "Цялата песен" = `floor(afterRap / bar)` bars; a fixed length longer than the file is cut to the bars the file has (toast "Файлът стига за N бара.").
  - The sync slider applies to files too (`offset + sync`).
  - **"Твой файл" tab** (menu-beats.js): rows "＋ Твой бийт" (opens the hidden `#fileInput`) and the loaded file; after a reload, "Зареди файла отново" (the AudioBuffer is not stored; the same file name keeps its saved BPM and start). A new file is decoded and analysed: `RBFile.envelope` (20 ms peak bins) → `RBDrop.analyze` guesses the BPM and the first downbeat (shown with "~" and a "Предположение от файла" note). `#fileBox`: "Тапни темпото" (the same `fitTaps` line fit as SoundCloud; first tap = start; also the `T` key), `BPM` (60–200), `Начало (сек)`, "▶ Чуй началото" (plays from 4 s before), "Зареди друг файл". Saved in `rb_fileBeat {name, bpm, offset, guess}`. `current()` is `ready` only with a buffer and a BPM in 60–200.
  - New **`js/rec.js`** (`RB.rec`, before game.js). `prepare()`: `getUserMedia` (no echo cancellation, noise suppression or AGC) → gain 1.3 → `RBAudio.recDest` (never the speakers). A generation counter makes a mic that arrives after `discard()` or a newer `prepare()` stop itself. `start()`: `MediaRecorder(recDest.stream)`, mime `audio/webm;codecs=opus` > `audio/webm` > `audio/mp4` > `audio/ogg;codecs=opus`, 1 s chunks kept per recorder. `stop()` releases the mic at once (not in `onstop`, where a new game may already own a new mic).
  - game.js: with REC on, `startGame()` asks for the mic before the beat starts (header "Микрофон…"). Denied or unsupported → toast, the game plays without REC (`G.rec = false`). The recorder starts with the count-in and `#recBadge` shows; pause/resume pause the recorder; `stopEngine()` discards a recording of a game that did not end (exit, also during the mic prompt); `endGame()` sets `G.recP = RB.rec.stop()`. The exit confirm now depends on `G.rec` (a real recording), not on the setting. `startGame()` revokes the previous blob URL.
  - end.js: `#recCard` is hidden on every end screen and shown only when `G.recP` resolves while that game's end screen is still shown. `#recAudio.src` + `#recDl` (`rimoboy-YYYY-MM-DD-HHMM.webm`, `.m4a` for mp4). While the recording plays, the quiet end-screen beat goes to 0; pause/end → back to 0.5.
  - Agent review fixes (session 10): a stale SoundCloud start (stopped while loading) now pauses the widget when no newer engine owns it (soundcloud.js, also hit the menu preview); the last picked file wins when two files load at once (`loadTok`); files over 80 MB or 10 minutes are refused; a file with fewer than 4 bars after its start → toast "Файлът е твърде кратък…" and back to the menu; a negative start from the sync slider keeps its bar phase (`offset mod bar`); tapped BPMs are folded into 60–200 (×2 / ÷2); for synth and file beats the recorder starts in the same task as the beat (0.15 s before the count-in); a recording that finishes after the player left the end screen is revoked. Speed ≠ 1 keeps the music tempo (cells are half or double beats), the same as for synth and SoundCloud.
  - Verified (session 10) with a generated 100 BPM WAV (quiet 4.8 s intro): guess 100 BPM / 4.78 s; preview + progress; game 8 bars, `fileStart` 0, `rapStart` 4.8 s; pause freezes `time()`; "Цялата песен" → 14 bars (35.2 s after the start); reload → "Зареди файла отново", reload of the same file keeps 100 BPM / 4.80 s; tap tool via the `T` key (9 taps, one beat skipped) → 100 BPM. REC with a fake mic (440 Hz): a 24.8 s `audio/webm;codecs=opus` blob, decodes, has sound; the card and the download name show; playing it mutes the beat (gain 0.45 → 0 → 0.45); "Играй пак" with REC records again; exit during REC → no card, mic track `ended`; mic denied → toast "Няма достъп до микрофона: играем без запис.", the game plays, no card. Synth game still starts and runs. 360 px: no horizontal scroll. **Not tested:** a real microphone (the preview browser has none), iOS/Safari `audio/mp4`, SoundCloud + REC (mic only by design).
- [x] **M8** Tutorial overlay, favourites, keyboard, reduced motion, TV mode (session 10)
  - New **`js/tutorial.js`** (loads last). 4 slides with the copy of 7.2 plus own sub lines; 4 step dots; "Пропусни" hidden on the last slide. The demo ball is drawn with JS + rAF (not a CSS animation): it lands on the top edge of cell b at beat b (90 BPM, 667 ms), arcs to the next cell, lights the cell for 20 % of the beat, and the row it has left is dimmed (like the game). Slide 2/3 use 2 rows with a 26 px gap so the ball fits above row 2. Reduced motion: the ball jumps from cell to cell (no arc). Shown on the first visit (`rb_tutorialDone` = `"1"`, set on skip, Esc or "Към играта"); `#helpBtn` reopens it from slide 0. Opening it during a game pauses the game (Space resumes after). Keys: Esc = skip, ← / → = slide; a capture-phase listener stops every other key handler (P, T, Space) while it is open.
  - **Modals (app.js):** `openModal` remembers the focused element and focuses the first button; `closeModal` gives the focus back (or blurs a hidden button). One Tab trap for the top open `.overlay` (list modal, dictionary, popup, pause, tutorial). `[data-close]` and backdrop clicks go through `closeModal`.
  - **Favourites** (menu-beats.js): a ☆/★ button on every synth and SoundCloud row (`aria-pressed`, "Добави в любими" / "Махни от любими"); starred rows come first (order otherwise kept). `rb_favs` = `["synth:<id>", "sc:<slug>"]` (the source prefix keeps ids unique). The star does not select the row; the focus stays on the star after the re-render.
  - **Keyboard:** ↑ / ↓ move between beat rows; Enter selects and keeps the focus on the row; `P` play, `T` tap, Space/Esc in the game were already there. Global `:focus-visible` ring (2 px gold); `:focus` without keyboard shows no ring.
  - **TV mode:** `📺` button in the top bar (`#tvBtn`, `aria-pressed`, toast), saved in `rb_tv`; `?tv` / `?tv=0` in the URL set it. Still automatic in fullscreen at 1600 px or more. A change fires a `resize` event, so game.js and end.js re-fit the words and re-measure the ball.
  - Review fixes (agent review after M8): every `renderList()` (also the background SoundCloud `tracks`/`analysis` re-renders) keeps the keyboard focus on the same row or star; a non-array `rb_favs` no longer breaks menu-beats.js; opening the tutorial stops a menu preview (other tempo than the 90 BPM demo); closing it drops a pause that was only queued while the beat was still starting (`G.pendingPause`), and gives the focus to "Продължи" when the pause overlay is open; TV off while fullscreen ≥ 1600 px says that TV mode stays; `:focus { outline: none }` only where `:focus-visible` is supported.
  - Verified (session 10): first load shows the tutorial, the second load does not; Enter/→/Tab/Shift+Tab/Esc; P is blocked while it is open; "Пропусни" returns the focus to `?`; ball landing x/y = cell centre / cell top on all 8 beats; opened during a game → paused, Space presses the tutorial button and the game stays paused; star → first in the list, saved after reload, row not selected; ↓ ↓ Enter selects the 3rd row with the focus kept; P starts the game; TV on → `--rowH` 84 px, ball columns re-measured, TV off during the game → 64 px re-measured; 360 px: no horizontal scroll, tutorial fits; no new console errors. **Not tested:** a real `prefers-reduced-motion` setting (code path only), a TV.
- [x] **M9** Word list expansion: each list 40+ families; add 4+ theme lists (5.3 "Lists to add later"); stress review (session 10)
  - 4 new theme lists at the end of `RAW` in `js/words.js`: **`love`** 💘 Любов и раздяла (41 families), **`city`** 🌃 Градски нощи (40), **`money`** 💰 Бачкане и пари (42), **`nature`** 🌳 Природа (41). 11 lists in the picker (with "Микс", 496 families). For a final stressed open vowel the consonant before it matches too (`-та́`, `-на́`, `-ни́`…), and no two families of one list share a rhyme.
  - Stress review (own pass + an agent review). Removed or replaced: basic ви́но; newyear the палто́/ма́нто/ло́то/пла́то family, гра́ници, о́чи + мечти́ (among -чи́), другари́ (among -а́ри), the нощ/мощ/разкош family (-ош ≠ -ощ), безкрая; food змия́, ви́но, синтеза → антитеза, та́ва, the нали́вай/разли́вай family → -а́й words, со́лен/пе́чен/ва́рен, я́дем; two the стари/фари family (фари is not a standard plural; 3 words left); hard Я́пония. In the new lists the review caught о́чи, раздели́, пари́/другари́ among -а́ри, ра́бота, къ́ртица, ку́кувица, сняг (= -а́к, merged with мак…), the цвете/плете́ family, ствол (Russian).
  - Kept on purpose: near rhymes in two (`ясно гласно властно страстно`, the т is silent), food (`танц шанс…`) and newyear (`танци шанси…`); the mixed-consonant families with a final stressed е/и (food `кюфте кафе…`, `пюре фрапе…`, newyear `искри звъни…`). **UNSURE, check at ibl.bas.bg:** клаксо́н (city), па́ра "steam" (two `гара пара…`).
  - basic (50) and two (31) were not grown: the good one- and two-syllable rhymes are used up; the theme lists add the volume. The lists were not heard in a real game by a Bulgarian speaker: **the user should play one game with each new list.**
  - Verified: `node tests/data-check.js .` OK; buildChart for every pattern × 64 bars on the 4 new lists (no word repeat in a group); list modal shows 11 lists; picking Природа rebuilds the preview; the dictionary for кукувица (before the fix) found "Още рими" across lists.
  - Done early (2026-11-24, on the user's request): the 6 existing lists grew to newyear 400, mic 400, food 400, hard 401 words. Then, on the user's review, `basic` was pruned to simple words of 1–2 syllables (273 words, 50 families) and `two` to words of exactly 2 syllables (156 words, 32 families). Families left with fewer than 4 words were removed. Keep these two rules when adding words: `basic` = common, 1–2 syllables; `two` = exactly 2 syllables, stress on the first. Stress errors fixed: `отвори/затвори/умори/повтори` (stressed on the next-to-last syllable) left the end-stressed family; `пари` (end-stressed) left `two`; `имам` left `food`; `баса` replaced. Words can repeat across lists (only one list is checked for duplicates). Still open: the new theme lists. Section 5.3 shows the old drafts; `js/words.js` is the source of truth.
- [x] **M10** Full test pass (section 13) + fixes (session 12)
  - **Home tests for the user (the agent cannot do these).** Run `start.bat`, use the party
    laptop, speakers and TV.
    1. Each synth beat: listen to the preview and to start / stop. No clicks, no crackle, and
       you like the sound.
    2. Ball on the beat: play one synth beat, then the same on Bluetooth speakers. The ball
       lands on the kick / snare. If not, move "Синхрон на топката".
    3. SoundCloud: press "▶ Чуй дропа" on the `check` tracks (2wenty, behind-the-mask,
       blight, butterflies, eclipse, florentine, restraint, round-the-bend, the-frogg,
       warming-up, your-eyes). Fix a wrong one with the tap tool. Then play 3 tracks for 32
       bars and listen for drift.
    4. Pull the network (before the app loads, and also during a SoundCloud song). Check what
       happens and that the synth beats still work.
    5. REC with the real microphone: record 16 bars, download, play in VLC and Chrome. Voice
       and beat are both clear, no distortion.
    6. Own file: load a real MP3, tap the tempo, set "Начало". The ball lands on the
       downbeats.
    7. Phone: open the live site. No sideways scroll, all buttons work, a game plays. On an
       iPhone, also try REC.
    8. TV: check TV mode from 3 m.
    9. One game with each new word list (Любов, Градски нощи, Бачкане, Природа).
  - **Section 13 results** (preview browser, 1024 px and 360 px):

    | # | Item | Result |
    |---|---|---|
    | 1 | Tutorial | PASS: first load shows it, "Пропусни" saves the flag, no second show, `?` reopens |
    | 2 | Synth previews, tempo | PASS for tempo (audio clock vs wall clock within 0.2 %) and offline render (peak < 1, no clipped samples). Clicks: user test 1 |
    | 3 | AABB, 16 bars | PASS |
    | 4 | Pattern slots | PASS: all 10 patterns against the 4.2 data (basic and mix), AABB / AAAA / aAaA on the other lists; no mixed colours or families |
    | 5 | Fill modes | PASS |
    | 6 | Blank game | PASS |
    | 7 | Speeds | PASS: cell 0.33 / 0.67 / 1.33 s at 90 BPM, beat unchanged |
    | 8 | Ball sync by ear | NOT TESTED: user test 2 |
    | 9 | Pause, resume, exit | PASS: time frozen while paused, lit cell right after resume, Esc → menu, preview starts again with ▶ |
    | 10 | REC | PASS with a fake mic after 2 fixes (below). Real mic and VLC: user test 5 |
    | 11 | Own file | PASS with a generated WAV: guess 88 BPM, tap tool 87.96 BPM, full song ends before the file does. Real MP3 and ear check: user test 6 |
    | 12 | End screen | PASS: 8 bars at 88 BPM → 0:22, dictionary chips navigate, "Играй пак" gives new words |
    | 13 | Streak | PASS: yesterday, 3 → 4 |
    | 14 | 360 px | FAIL, fixed → PASS |
    | 15 | Console errors | PASS: none |
    | 16 | SoundCloud | PASS for the catalogue (21 tracks), Roses / Warming Up / BLIGHT for 32 bars (engine clock within 6 ms of the wall clock and the widget), pause / resume, `?offline` fallback. By ear and a real network pull: user tests 3, 4 |

  - **Fixes.** (a) At 360 px, long words were cut off in the grid (33 cells in one 64-bar
    "Трудни думи" game). `Chart.fitCells` now puts a word that does not fit at 8 px on two
    lines (class `wrap`, soft hyphen at a syllable break; the break is a simple rule, not a
    dictionary). The recap has narrower labels and gaps at ≤420 px. All 2141 words fit in
    the game and recap cells at 360 px. `textContent` of a wrapped cell contains U+00AD:
    read `dataset.word` instead. (b) The recording reached full scale (peak 1.05): beat and
    mic now go through `RBAudio.recBus` (gain 0.7) and a limiter. Re-test: peak 0.99, no
    clipped samples. (c) The recording player showed no length (`duration` = Infinity):
    end.js seeks once past the end, then back to 0.
  - Skipped (optional): extra SoundCloud help text (the REC note covers the limit the player
    meets) and a separate shareable page (the Vercel site exists).
- [x] **P0–P5** Party mode: QR join, live reactions, audience vote, ranking (section 16.10; decisions in 16.12). P0–P5 done 2026-11-26 (see 16.10: Supabase `rimoboy`, anonymous sign-ins on, 30/hour/IP kept). Open: rehearsal with real phones

---

## 15. Session log

- **2026-11-23, session 1:** Analysed play.therhymegame.com live (tutorial, first game,
  end screen, menu, advanced setup, list picker) and its JS bundle (patterns, fill modes,
  durations, speeds, word list format and sizes). Wrote this spec with the draft Bulgarian
  word families (5.3). No app code yet. Next session: start at M1.
- **2026-11-23, session 1 (later):** User decision: beats come from SoundCloud
  `bizzlebeats` through the API/widget. Added section 8A + milestone M3a. The synth beats
  stay as an offline fallback.
- **2026-11-23, session 2:** M1 done: `index.html`, `css/style.css`, `js/app.js` (shell),
  `start.bat`, `.claude/launch.json`. Verified through the local server: the menu renders,
  the screens switch, 42 stars, no console errors, no horizontal scroll at 360 px and on
  desktop (fixed an overflow of the "Дължина" select). The user asked to stop after M1.
  **Next session: M2** (words.js from 5.3, patterns.js from 4.2, chart.js).
- **2026-11-23, session 3:** M2 done. Data + chart verified with `tests/data-check.js` (OK)
  and in the browser (the preview grid renders AABB rhyme pairs, no console errors, no
  horizontal scroll at 360 px). **Next: M3** (audio.js + beats.js synth engine, preview
  button in the menu).
- **2026-11-23, session 4:** M3 done: `js/audio.js` (context, bus, 10 instruments) and
  `js/beats.js` (6 original beats + SynthBeat look-ahead scheduler). The mix was rebalanced
  after an offline render analysis. `tests/audio-check.html` added (all PASS). The menu
  preview plays/pauses with no console errors. Sound quality is not judged by ear (the agent
  cannot listen). **Next: M3a** (SoundCloud Bizzle Beats: first test the widget, then
  SCBeat with the drift-corrected clock).
- **2026-11-23, session 5:** M3a done. Tested the widget live (11 tracks, ±4 ms clock,
  the autoplay needs a gesture), wrote `soundcloud.js`, `sc-tracks.js`, `menu-beats.js`,
  `serve.py` (no-cache), `tests/sc-check.html`. Fixed a bug where `seekTo` while paused
  faked a "playing" state. Verified: catalogue, preview, engine clock, pause/resume, stop,
  tap tempo + save, offline fallback, no console errors. Open item: verify the BPM/offsets
  of the tracks by ear. **Next: M4** (finish the menu: words panel, list modal, selects,
  advanced setup, settings persistence; replace the M1/M2 placeholders in app.js).
- **2026-11-23, session 6:** M4 done (`js/menu-words.js`, `Chart.fitCells`, `.field`
  rename). Verified: defaults, list arrows + modal (+ Esc), fill/duration/pattern/speed/
  blank, persistence across a reload, reset, REC note for SC, Play guard toasts, 360 px with
  no horizontal scroll, no console errors. **Next: M5** (game.js: `RB.startGame()`, grid,
  count-in, ball, scroll, header, player bar, pause/exit; await `engine.start()`).
- **2026-11-24, session 7:** M5 done (`js/game.js`, `.row.past` CSS, app.js placeholders
  removed). Verified synth + SoundCloud sync, pause/resume, exit, the end hand-off, all
  patterns, speeds, 360 px, no console errors. Code reviewed by an agent; pushed to GitHub
  `lvacavliev/Bulgarianrhymegame`. Then, on the user's request: automatic beat drop + BPM
  from the SoundCloud waveform data (section 8A.6): the rapping now starts on the drop.
  **Next: M6** (end screen).
- **2026-11-24, session 8:** Word lists expanded to 400+ words per list (see the M9 note in
  section 14). `node tests/data-check.js .` prints OK; the app loads the lists with no console
  errors. **Next: M6** (end screen), unchanged.
  Later the same session: pruned `basic` (simple words only) and `two` (2 syllables only).
- **2026-11-24, session 9:** Beat data reworked from the ground up (section 8A.7, user
  request: wrong BPMs, ball off the beat, drops missed). Reverse-engineered the reference web
  build (no detection there: hand-made bpm/drop/end per beat). Wrote `tools/analyze_sc.py`
  (offline librosa analysis of the 21 tracks, audio deleted after) and
  `tools/bake-sc-tracks.js`; `js/sc-tracks.js` is now generated. App: measured data wins
  over the waveform guess, `endMs` limits "Цялата песен", new tempo box texts. Verified in the
  browser (grid lock ± 4 ms, 48-bar full song, user override + reset, no console errors).
  Reviewed by two agents. **Next: M6** (end screen); the user should hear the `check` tracks.
- **2026-11-26, session 10:** M6 done (`js/end.js`, hooks in game.js `endGame`/`toMenu`/
  `startGame`, stats-row CSS for phones). Verified in the browser (see the M6 notes in
  section 14): stats, streak + popup, confetti, recap, dictionary navigation, "Играй пак",
  "Меню", 360 px, no console errors. Fixed one bug found in the test (the streak popup closed
  at once). **Next: M7** (REC + own file beat).
- **2026-11-26, session 10 (later):** M7 done (`js/filebeat.js`, `js/rec.js`, the "Твой
  файл" tab in menu-beats.js, REC in game.js, the record card in end.js). Verified with a
  generated WAV and a fake mic (see the M7 notes in section 14). Reviewed by an agent (1 serious + 5 medium findings fixed, re-tested).
  **Next: M8** (tutorial + polish).
- **2026-11-26, session 10 (M8):** M8 done (`js/tutorial.js`, focus handling and TV toggle
  in app.js, favourites and arrow keys in menu-beats.js, focus ring + tutorial CSS). Verified
  in the browser (see the M8 notes in section 14). **Next: M9** (word lists).
- **2026-11-26, session 10 (M9):** M9 done (4 theme lists, stress fixes in the old lists).
  Two agent reviews (M8 code, M9 words); all confident findings fixed (see the M8 and M9
  notes in section 14). **Next: M10** (full test pass).
- **2026-11-26, session 11:** Scoped party mode (section 16, milestones P0–P5). No code.
  User decisions (16.12): Supabase, both battle formats (duet + 1v1), 1–5 stars, a
  who-rated-whom table, optional rapper names. **Next: M9** (word lists), unchanged; party
  mode starts with P0 (connect the Supabase connector).
- **2026-11-26, session 11 (P4 + P5):** Phone page rewritten (lobby, rename, between,
  results, connection pill, vote end handling) and the vote + results on the TV
  (`js/party-vote.js`, `#partyVote`, history). Agent review fixes: vote/finish guards and a
  share lock in the DB (no vote after the tally), RB004 errcode, startVote failure handling,
  countdown fallback, snapshot vs live votes, no endless finish retries, separate result
  writes bound to their room, exact winner, Space blocked, running votes never dropped,
  resume in `results`, phone rename/vote-stuck/pill/pop fixes. Committed and pushed.
  **Party mode P0–P5 is complete.** Open: a real rehearsal with phones and a TV (16.10).
- **2026-11-26, session 11 (P3):** Battles in the game (`js/party-battle.js`, hooks in
  `game.js`, `#partyFx`). Agent review fixes: the round starts only when the beat plays; turn
  and edge logic no longer depend on seeing one exact cell; failed writes toast and resend;
  `start_round` retries and a failed re-read no longer loses the round number; cancelled
  rounds are marked; flying nodes are recycled when the layer hides; reactions of a guest not
  loaded yet are replayed; hype is rate-limited per guest; queued writes never reach a new
  or closed room; "Нова стая" / "Край на партито" stop a running battle with a toast; the
  1v1 waiting state is cancelled on every way back to the menu. Then committed and pushed.
  **Next: P4** (phone page polish) and **P5** (vote + results).
- **2026-11-26, session 11 (P1 + P2):** Party transport (`party-net.js`), bare phone page,
  load test (21/21 PASS with 20 phones) and the host lobby (`party-host.js`, QR overlay,
  strip, mini QR). Verified in the browser; reviewed by an agent (see 16.10). **Next: P3**
  (battles in the game), or M10.
- **2026-11-26, session 11 (later):** P0 database part done: Supabase project `rimoboy`
  (eu-west-2), `party/schema.sql` applied and RLS-tested in SQL, `js/party-config.js`. Open
  for the user: anonymous sign-ins on, rate limit up, the Vercel URL. **Next: M9**, or P1
  when the user wants party mode first.
- **2026-11-26, session 12 (M10):** M10 done: all of section 13 run in the preview browser
  (see the M10 notes in section 14). Fixed: long words cut off on phones (chart.js, CSS),
  recording at full scale (audio.js, rec.js), recording player without a length (end.js).
  `tests/data-check.js` OK. A party mode session was editing the same folder at the same
  time. **Next:** the user's home tests; party mode.

---

## 16. Party mode (Парти режим): audience voting from phones (scoped 2026-11-26, not built)

### 16.1 Goal

Two rappers battle. Player 1 stands on the **left** of the screen, player 2 on the **right**,
as the audience sees them. The host taps one button. A QR code appears on the TV. People
scan it, type a name, and their phone becomes a remote with a left half and a right half.
During the song they send reactions that fly up on that side of the TV and fill a hype
meter. When the battle ends, every guest gives each rapper 1–5 stars. The ranking and every
guest's score build up live on the TV.

**Design rule: ease of use first.** One tap on the laptop, one scan, one name, no app, no
account for the audience. A new battle with new rappers needs no typing: the default names
"Играч 1" / "Играч 2" are always fine.

### 16.2 Battle formats (user decision 2026-11-26: both)

The host picks the format per battle in the party strip (16.5): **"Дует"** or **"1 на 1"**.

**Дует (duet, one song).** The rappers trade turns inside one game.
`side(bar) = floor((bar - 1) / turnBars) % 2 === 0 ? 'L' : 'R'`. Turn length "4 бара" or
"8 бара" (default 4). `turnBars` = max(setting, pattern cycle in bars), so a rhyme cycle
(for example AA_A, 8 bars) is never split between two rappers. Vote after the song.

**1 на 1 (full song against full song).** Two games, one per rapper. Part 1: the left
rapper raps a whole game. On the end screen, the button "▶ Играч 2 (дясно)" replaces "Играй
пак" and starts part 2 with the same beat and settings and new words (fair: same beat,
same length). Part 2: the right rapper. Vote after part 2. "Меню" between the parts cancels
the battle (no vote).

In both formats, the side that raps now is highlighted on the TV and on the phones. Guests
can react to both sides at any time.

### 16.3 Architecture: Supabase (user decision 2026-11-26)

The site is static on Vercel. Vercel functions cannot keep WebSockets open, and the phones
are on other networks (4G, guest Wi-Fi), so a hosted realtime service relays the messages.
**Supabase** (the user's account, free plan): Postgres tables for everything that must
survive (rooms, people, rounds, votes), Realtime for the live parts, Anonymous Sign-Ins for
the guests. Client: the `supabase-js` v2 UMD build from jsDelivr (plain `<script>`, exposes
`window.supabase`; pin an exact version in P1). No server code: the SQL in 16.7 is the whole
backend.

**Which channel carries what:**

| Data | Path | Why |
|---|---|---|
| Room state (phase, round, part, names, turn, vote end) | `rooms.state` (jsonb). Host updates the row; phones subscribe with Postgres Changes (`id=eq.<room>`) and read the row once on load | Survives reloads; changes are rare (phase or turn changes only) |
| Names | `people` table, via the `join_room` RPC | Late joins and reloads read it |
| Stars | `votes` table, upsert per (room, round, uid, side) | Durable and attributable; the host subscribes with Postgres Changes for the live tally |
| Reactions + hype totals | Realtime **Broadcast** on channel `rb-up-<room>`. **Only the host subscribes.** Phones send with `channel.httpSend()` (REST), so they never receive each other's taps | Ephemeral and frequent. A phone subscribed to the channel would receive every tap of every phone (fan-out of N²) |
| Final hype totals, results | `rounds.hype`, `rounds.results`, written by the host at the end | History and the session ranking |

**The host is the authority.** Only the host updates `rooms` and `rounds`. Phones write only
their own `people` and `votes` rows. The host computes every result.

**Message budget** (measured in P1, section 16.10): a phone sends at
most one broadcast per 800 ms (`RBNet.SEND_MS`), and only when it has new taps. 30 tapping phones ≈ 60
messages/s, about 11 000 per 3-minute song; 40 songs ≈ 0.45 million per party night.

**Unique link per session.** Room id = 6 characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`
(no 0/O/1/I), made with `crypto.getRandomValues` (32^6 ≈ 1 billion). Link:
`<PARTY_BASE>/party.html?r=K7P3QX`. Rooms are separate rows and channels, so any number of
sessions can run at the same time on different laptops. The rows of a room are readable
only by its host and its members (16.7), and joining needs the code, so rooms cannot be
listed.

**Public base URL.** The phones cannot open `localhost`. `PARTY_BASE` = `location.origin`
when the page is served over https from a non-local host (the Vercel site). Otherwise it is
the deployed Vercel URL from `js/party-config.js`. So the host can run the game from
`start.bat`, and the QR still points to the live site. The party files must be deployed (a
push to `main`) before the party.

**Constraint 3 exception:** party mode needs internet on the laptop and on every phone. The
rest of the app keeps working offline. Without a connection or without the config, the
Парти button shows the toast "Парти режимът иска интернет." and nothing else changes.

### 16.4 State model

```
rooms.state = {
  phase: 'lobby' | 'live' | 'between' | 'vote' | 'results' | 'closed',
  round: 3,                       // rounds.round of the current battle
  mode: 'duet' | '1v1',
  part: 1 | 2,                    // 1v1 only: which rapper's song
  left: 'Играч 1', right: 'Иван', // names of this battle
  turn: 'L' | 'R' | null,         // who raps now
  voteEndsAt: <ISO time>          // server time, see below
}
```

- `between` = 1v1 after part 1 (phones show "Следва Играч 2").
- `uid` = the Anonymous Sign-In user id (`auth.uid()`). supabase-js keeps the session in
  `localStorage`, so the same phone rejoins as the same person (name, votes and hype stay).
- Vote countdown: `voteEndsAt` is set with `now()` on the server (an RPC), and each client
  measures its clock offset once from the RPC response, so the countdown agrees everywhere.
  The `votes` policy enforces the end on the server too.
- Broadcast payload phone → host: `{uid, side, emoji, n, totL, totR}`. `n` = new taps since
  the last message (for the animation). `totL`/`totR` = this phone's running totals for the
  round (idempotent, so a lost message or a host reload loses nothing).

### 16.5 Host side (laptop, `index.html`)

**Button.** `🎉 Парти` in the top bar (next to `📺`). The first tap creates the room (the
room id is kept in `sessionStorage`, so a reload keeps the same room) and opens the party
overlay.

**Party overlay** (works on a TV at 3 m):
- A large QR code (about 60 % of the screen height), title "Сканирай и гласувай!", under it
  the short URL and the code `K7P3QX` in big letters (for people who type it).
- "Влезли: N" and the names as chips that pop in when people join. The host can tap a chip
  to hide a name (bad words): the person keeps voting, and the TV shows "Гост" instead.
- "История": the past battles of this room with their results and per-guest stars (16.6).
- Buttons "Затвори" (party stays on), "Нова стая" (new code), "Край на партито"
  (`phase = 'closed'`, the phones show "Партито свърши. Благодарим!").

**Party strip in the menu** (only while party mode is on; above the Play button):
- Format: chips "Дует" / "1 на 1". Duet also shows "Смяна на всеки: 4 бара | 8 бара".
- Room: a QR (84px, 64px on a phone) with "🎉 ПАРТИ", the guest count and "Тапни за кода". The room code is not shown
  in the strip; tapping the QR opens the big party overlay, which shows the code.
- Names (label "Име"): two inputs, **empty by default**, placeholders "Играч 1 (ляво)" / "Играч 2
  (дясно)". An empty input = the default name. The host can type names or skip them.
- After every battle, both inputs are cleared again (the next song has other people).
  (The earlier "Същите рапъри" toggle was removed on 2026-11-27.)
- Play starts the battle: a new `rounds` row, `phase = 'live'`.

**Mini QR.** While party mode is on, a small QR with the code stays in a corner of the menu,
game and end screens, so late guests can join. A tap opens the big overlay again. It can be
hidden.

**Battle in the game** (changes in `game.js`, only when party mode is on):
- Duet: rows get the class `side-L` / `side-R`: a coloured glow on that edge of the row and
  a small name label. Header during the count-in: "Започва ИГРАЧ 1". In the last bar of a
  turn: "Следва ИГРАЧ 2 ▶". 1v1: the whole game has the colour of its side; the header shows
  the rapper's name.
- The left and right colours are two new tokens, not rhyme colours.
- The host updates `state.turn` only when the turn changes, never per frame.
- New hooks: `RB.party.onStart(G)`, `RB.party.onTurn(side)`. The existing `RB.onGameEnd(G)`
  leads to `between` (1v1 part 1) or to the vote. The beat timing code does not change.

**Reactions layer** `#partyFx` (over the game and end screens, `pointer-events: none`):
- Emoji float up in the left or right edge zone, so they do not cover the grid. Animate only
  `transform` and `opacity` (the ball loop must not drop frames). At most 30 nodes at a time,
  recycled. Above that, the host merges them into one burst ("+12 🔥").
- One reaction in five shows the sender's name, and so does the first reaction of each
  person in a battle ("Петя 🔥").
- **Hype meter:** a thin tug-of-war bar under the header, left colour against right colour,
  share of this battle's hype points.
- **Hype calls**, to push the crowd: at 50 / 150 / 300 points on a side a big short text
  flashes on that side ("Залата гори!", "ОГЪН!", "Неудържим!"). When one side has 10 or more
  taps in 2 s, its edge pulses.
- No sound effects (they would get into the REC recording and clash with the beat).

### 16.6 Vote, results and who rated whom

**Vote** (end screen, after "Страхотни барове!"; in 1v1 after part 2):
- RPC `start_vote` → `phase = 'vote'`, `voteEndsAt` = now + 20 s. The TV shows "Гласувайте
  сега!" with a big countdown and two columns (left name, right name).
- **Live:** each column shows its average stars and the vote count, and they grow as the
  votes arrive. Under the columns, a live feed of the votes: "Петя — Играч 1 ★★★★☆ · Играч 2
  ★★★★★". A changed vote updates its line.
- At 0: the host reads the votes, writes `rounds.results` and `rounds.hype`, and `phase =
  'results'`.

**Results:**
- Reveal: the winner's column grows, "ПОБЕДИТЕЛ: ИГРАЧ 1" (or "Равенство!"), confetti
  (`RB.end.confetti()`).
- Ranking: winner = the higher average of stars. Tie on the average → the higher hype total.
  Still a tie → "Равенство!". Hype alone never wins.
- **Who rated whom (user request):** a full table under the reveal: one row per guest, with
  the stars that guest gave the left rapper and the right rapper (an empty cell when a guest
  rated one side only). Sorted by name. On a TV it auto-scrolls when it is longer than the
  screen. Hidden names show as "Гост". The same table is in "История" for past battles (the
  data stays in `votes`).
- Also: **"Топ хайпъри"** (the 3 guests with the most taps) and the **session ranking** of
  the battles of the room (winner name, average stars). Default names ("Играч 1") are not
  merged across battles, because they are different people every time.
- "Нов батъл" → back to the menu with the party strip (names cleared), `phase = 'lobby'`.

**Phones tell the guest that the vote is public:** "Името и оценката ти се виждат на екрана."

### 16.7 Database (SQL migration in `party/schema.sql`)

> Sketch from the scoping. The applied schema is `party/schema.sql`; see the P0 notes in
> 16.10 for what it does differently (RPCs for rooms, people and the round lifecycle).

```sql
create table rooms (
  id text primary key check (id ~ '^[A-HJ-NP-Z2-9]{6}$'),
  host uuid not null default auth.uid(),
  state jsonb not null default '{"phase":"lobby"}',
  created_at timestamptz not null default now()
);
create table people (
  room text not null references rooms on delete cascade,
  uid uuid not null default auth.uid(),
  name text not null check (char_length(btrim(name)) between 1 and 16),
  hidden boolean not null default false,          -- set by the host
  joined_at timestamptz not null default now(),
  seen_at timestamptz not null default now(),
  primary key (room, uid)
);
create table rounds (
  room text not null references rooms on delete cascade,
  round int not null,
  mode text not null check (mode in ('duet','1v1')),
  left_name text not null, right_name text not null,
  started_at timestamptz not null default now(),
  vote_ends_at timestamptz,
  hype jsonb, results jsonb,
  primary key (room, round)
);
create table votes (
  room text not null, round int not null,
  uid uuid not null default auth.uid(),
  side text not null check (side in ('L','R')),
  stars smallint not null check (stars between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (room, round, uid, side),
  foreign key (room, round) references rounds on delete cascade
);
```

**Row Level Security** (on for all 4 tables; anonymous users have the `authenticated` role):
- Helpers, `security definer`, `stable`: `is_host(room)` and `is_member(room)` (a row in
  `people` for `auth.uid()`). They avoid recursive policies.
- `rooms`: insert with `host = auth.uid()`; select if host or member; update if host.
- `people`: no direct insert. RPC `join_room(code, name)` (`security definer`) checks that
  the room exists and is not closed, upserts the caller's row and returns the room state.
  Select if host or member. Update: own row (`name`, `seen_at`) or host (`hidden`).
- `rounds`: insert/update if host; select if host or member.
- `votes`: select if host or member (the table is shown on the TV anyway). Insert/update
  only `uid = auth.uid()`, the caller is a member, the round is the room's current round,
  `state->>'phase' = 'vote'`, and `now() < rounds.vote_ends_at` (+2 s grace).
- RPC `start_vote(room, seconds)` (host only) sets `vote_ends_at` and the state, and returns
  the server time.
- Realtime: add `rooms` and `votes` to the `supabase_realtime` publication. Postgres Changes
  respects RLS, so a phone only gets its own room.

**Auth settings (dashboard):** turn on Anonymous Sign-Ins. **Raise the anonymous sign-in rate
limit** (default 30 per hour per IP): at a party every phone on the same Wi-Fi has the same
public IP, so the 31st guest would be refused.

**Retention:** keep the rooms (the history is a feature). Optional: a `pg_cron` job deletes
rooms older than 30 days.

Privacy: the only personal data is the name a guest types, plus their stars. Both are
visible to the room (host and members) and on the TV. The phone says so before the vote.

### 16.8 Phone side (`party.html`, own small page)

Bulgarian, the same "midnight party" look, no menu, works at 360 px, about 50 KB without
the Supabase script.

1. **Join:** "Как се казваш?" (input, 1–16 characters, kept in `localStorage`) → "Влизам"
   (anonymous sign-in once, then `join_room`). The second time, the name is filled in and
   one tap joins.
2. **Lobby:** "Чакаме батъла…" with the format and the two rapper names.
3. **Live** (`phase = 'live'`): the screen is split into two large tap zones, left and right,
   in the side colours, with the rapper names. The rapper who raps now is highlighted. A tap
   on a zone = one reaction for that side. An emoji row (🔥 😂 🤯 👏 💀) picks what the tap
   sends. Short vibration (`navigator.vibrate(10)`), own tap count shown.
   - Taps are counted at most 6 per second. Every 500 ms, when there are new taps, the phone
     sends one broadcast (16.4).
   - Screen Wake Lock (`navigator.wakeLock`) keeps the screen on during the song.
4. **Between** (1v1): "Следва Играч 2 (дясно)". The tap zones stay.
5. **Vote** (`phase = 'vote'`): "Оцени рапърите", 5 big stars for each side, the countdown and
   the note "Името и оценката ти се виждат на екрана." Each star tap upserts at once (no
   submit button); the guest can change it until the time is up. One side is enough.
6. **Results:** the winner, the two averages, "Ти даде: ★4 / ★5" and "Ти даде 🔥 × 34". Then
   back to the lobby.

Reconnect: supabase-js reconnects by itself. On reconnect and on `visibilitychange` →
visible, the phone reads `rooms.state` again and draws that phase. `people.seen_at` updates
every 30 s. "Влезли" on the TV counts the people seen in the last 2 minutes.

### 16.9 New files

```
party.html               ← phone page
css/party.css            ← phone page styles (shares the tokens of section 6)
js/party-config.js       ← window.RB_PARTY = {url, key, base}; committed. The publishable (anon)
                           key is public by design; RLS protects the data. Never the service_role key.
js/party-net.js          ← the only file that talks to Supabase (host and phone share it)
js/party-host.js         ← RB.party: button, overlay, QR, party strip, battle hooks, reactions, vote, results
js/party-phone.js        ← phone page logic
css/party-host.css       ← host-side styles (strip, overlay, mini QR)
(qrcode-generator@2.0.4, MIT, is loaded from jsDelivr on demand instead of vendored)
party/schema.sql         ← tables, RLS, RPCs, publication (16.7); applied as a migration
tests/party-sim.html     ← ?r=CODE&n=30: 30 fake phones (separate clients with their own
                           storageKey, so each is its own anonymous user)
```

### 16.10 Milestones

- **P0 setup:** *database part done 2026-11-26.* Supabase project **`rimoboy`** (ref
  `gpjwptfyvcvlwvfbsprv`, region `eu-west-2` London, org `rimoboy`, free plan). Migrations
  `party_schema` + `party_drop_unused_delete_policy` applied; **`party/schema.sql` is the
  source of truth** (it wins over the sketch in 16.7). `js/party-config.js` has the URL and
  the publishable key (not loaded by any page yet).
  - What the schema adds to 16.7: rooms are made only by the RPC `create_room()` (server
    random code, max 10 per host per hour); guests write `people` only through
    `join_room(p_room, p_name)` (returns `{room, state, now}`), `touch_room(p_room)` and the
    host's `set_hidden(p_room, p_uid, p_hidden)`; `start_round(p_room, p_mode, p_left,
    p_right)` → round number and `state.phase = 'live'`; `start_vote(p_room, p_seconds)` →
    `{round, voteEndsAt, now}`. The host updates `rooms.state` (turn, part, phase) and
    `rounds.hype/results` directly. `votes` has a foreign key to `people`, so only members
    can vote. Realtime publication: `rooms`, `people`, `votes`. Policy helpers live in the
    unexposed schema `private`.
  - RLS tested in SQL with a fake host, 2 guests and an outsider (rolled back): outsider sees
    0 rooms/people/votes; guest cannot start a round, change the room, hide names or update
    rounds; early vote, late vote, a vote for another uid, a non-member vote and 9 stars are
    refused; upsert changes a vote; `anon` gets nothing. Security advisor: only the expected
    "authenticated can execute SECURITY DEFINER" warning for the 6 RPCs (each checks the
    caller itself). Performance advisor: clean.
  - Dashboard (done by the user 2026-11-26): anonymous sign-ins **on**; the rate limit stays
    at the default 30 per hour per IP (user decision). `RB_PARTY.base` =
    `https://bulgarianrhymegame.vercel.app`.
- **P1 transport spike — done 2026-11-26.** `js/party-net.js` (`window.RBNet`: `available()`,
  `joinUrl(code)`, `normCode(s)`, `baseUrl()`, `SEND_MS` = 800, class `PartyNet({storageKey})` with
  `signIn`, `now()` (server clock from RPC answers), host `createRoom/loadRoom/patchState/
  startRound/startVote/setHidden/saveRound/people/votes/rounds/hostListen`, phone `join/
  readState/watchRoom/sendUp/vote/touch`, `close`). supabase-js **2.119.2** UMD from jsDelivr.
  Bare `party.html` + `js/party-phone.js` + `css/party.css` (join, lobby, tap zones + emoji,
  vote stars, closed/moved messages; P4 polishes it). `tests/party-sim.html?n=20&auto`.
  - Reaction payload (changed from 16.4): one message per batch for both sides,
    `{uid, e, nL, nR, totL, totR, round, at}`. A phone sends only when it has new taps.
  - **Result, 20 simulated phones + a second room: 21/21 PASS.** Joins 0.7 s for all; host
    sees each join live; tap → host median **61 ms** (p95 146, max 168); 195/195 batches
    delivered; ≈39 realtime events/s with all 20 tapping non-stop (free limit 100/s, so about
    45 phones); state change to all phones ≈0.5 s (RPC + Postgres Changes), turn change
    ≈0.75 s (**P3: send the turn about 1 s before the bar starts**); votes reach the host in
    ≈0.5 s; upsert changes a vote; early / late / other-room votes refused (42501); host and
    phone reloads keep the room, the user and the phase; rooms isolated both ways.
  - Manual phone check (375 px): join → lobby → live 1v1 (left zone highlighted) → taps
    reach the host with the right totals → stars saved (L 4, R 5).
  - **Anonymous sign-in limit stays at 30 per hour per IP (user decision 2026-11-26).**
    Guests on one Wi-Fi share an IP, so at most about 30 new phones per hour; a phone that
    already joined keeps its session and needs no new sign-in. The simulator uses 20 phones
    for this reason.
- *P1 original brief:* `party/schema.sql` applied, `party-net.js`, `party-config.js`, a
  bare `party.html`, `tests/party-sim.html`. Pass: 30 simulated phones join one room; a tap
  reaches the host in under 300 ms (median); the phones receive no broadcasts of other
  phones; a vote outside the vote window is refused by RLS; a second room does not see the
  first; a reload of the host or a phone keeps the room. Check the current free-plan Realtime
  quotas.
- **P2 host lobby — done 2026-11-26.** New `js/party-host.js` (`RB.party = {on, code, net,
  people, battle(), afterBattle(), open(), close()}`) and `css/party-host.css`; small edits in
  `index.html` only (🎉 `#partyBtn` in the top bar, `#partyStrip` at the top of the menu,
  `#partyOv` overlay, `#partyMini`, the 3 party scripts after tutorial.js). supabase-js and
  `qrcode-generator@2.0.4` (MIT, from jsDelivr, not vendored) load **only when party mode
  starts**, so the app still works offline.
  - 🎉 → toast "Свързвам парти стаята…" → room → overlay with the QR (own SVG, dark on cream,
    `M` error correction), the URL, the code, "Влезли: N" (seen in the last 2 min) and the
    guest chips (pop-in animation; tap = hide/show on the TV via `set_hidden`; hidden = struck
    through). Esc, ✕, "Затвори" and the backdrop close it; while it is open, P, T and Space do
    nothing (a window capture listener). Opening it during a game pauses the game.
  - Party strip (menu): room button with code + count (opens the overlay), format chips
    "Дует" / "1 на 1", "Смяна на всеки 4 / 8 бара" (duet only), two name inputs (placeholders
    "Играч 1 (ляво)" / "Играч 2 (дясно)"), "Същите рапъри". Saved in `sessionStorage`
    `rb_partyBattle`. `battle()` → `{mode, turnBars, left, right}` with the defaults for empty
    names; `afterBattle()` clears the names unless "Същите рапъри" is on. Enter in a name field
    = Play.
  - Mini QR: top right, on the game and end screens only (the menu has the strip); code only
    at ≤720 px; bigger in TV mode; ✕ hides it until the overlay is opened again.
  - "Нова стая" (confirm) closes the old room with `{phase:'closed', moved:true}` (its phones
    show "Тази стая е затворена. Сканирай новия код.") and makes a new one. "Край на партито"
    (confirm) closes the room, clears the session, hides the strip and the mini QR.
  - Reload: `rb_partyRoom` in `sessionStorage` + the host user in `localStorage`
    (`rb-party-host`) → the same room, guests and hidden flags come back.
  - At ≤420 px the 4 top-bar buttons shrink to 36 px so the brand stays clear.
  - Verified in the browser (1024 px and 360 px): start, QR + URL
    `bulgarianrhymegame.vercel.app/party.html?r=…` from localhost, a guest from a second tab
    appears live, hide → saved in the DB, close/open, strip settings + `battle()` /
    `afterBattle()` / "Същите рапъри", P blocked and Esc closing while open, reload resumes,
    "Нова стая" (old phone sees the moved message), "Край на партито", no horizontal scroll at
    360 px, no new console errors. **Not tested:** scanning the QR with a real phone (needs the
    party files deployed), TV at 3 m.
- **P1 + P2 review (agent, 2026-11-26): 1 serious + 21 medium findings, fixed except where
  noted.** Migration `party_review_fixes` (appended to `party/schema.sql`):
  - **Serious, fixed:** the reaction channel was public, so anyone with the room code (even
    without signing in) could send fake reactions. Now **all 3 channels are private**
    (`config.private`) with RLS on `realtime.messages`: `rb-up-<room>` = members send, only the
    host receives; `rb-db-<room>` = host only; `rb-room-<room>` = host and members. The sim now
    sends forged reactions as a guest of another room and as an unsigned caller (private and
    public topic): none reach the host.
  - DB: names refuse control, zero-width, separator and bidi characters (`people_name_clean`;
    `join_room` strips them; `RBNet.cleanName` does the same on the phone and counts code
    points, so an emoji is never cut); `join_room` caps a room at 150 guests (errcode `P0003`,
    "Стаята е пълна."); a vote update needs an open window on the old row too, and a trigger
    keeps room/round/uid/side fixed (no moving a past vote); new RPC **`finish_vote(p_room)`**
    sets `phase = 'results'` (so `vote_open` is false at once) and returns the tally with
    names `{round, votes:[{uid, name, hidden, side, stars}], now}` — P5 uses it for the
    who-rated-whom table instead of reading the votes at 0 s.
  - Phone: failed reaction sends put the taps back; while live the totals are resent at
    least every 5 s and once more when the phase leaves live (the host always gets the final
    totals); one star upsert in flight per side (the latest tap wins, screen = DB); the wake
    lock tracks its pending request; a rejoin does not stack feeds or timers; timestamps go
    through `RBNet.parseTime` (6-digit fractions cut to 3 for Safari).
  - Host: "Нова стая" makes the new room first and closes the old one after (a failed create
    leaves the old room working); "Край на партито" retries once and keeps the party open with
    an error if the room did not close; `resume()` and `start()` share the busy guard; the
    host syncs its clock on connect (`syncNow()` via `touch_room`); the guest list merges by
    uid (a live join during a reload is kept) and the chips update in place (focus and clicks
    survive heartbeats); supabase-js and qrcode-generator load with **SRI hashes**
    (`party.html` and the sim too).
  - `.vercelignore` keeps `tests/` and `tools/` off the public site.
  - Sim fixed: the "vote before the window" check now runs inside a started round (it used to
    pass on the missing round). Re-run: **23/23 PASS** (tap → host median 62 ms, p95 222 ms;
    ≈42 events/s with 20 phones; turn change 150 ms).
  - Not done, accepted: no CAPTCHA on anonymous sign-ins (the 30/hour/IP limit is the
    brake); late joiners can vote (no "joined before the round" rule); `SEND_MS` stays 800 ms
    (16.3 said 500): at that rate about 45 phones tapping non-stop reach the free 100 events/s.
  - Optional hardening for the user: Supabase dashboard → Realtime → Settings → turn off
    **"Allow public access"**. All party channels are private now, so nothing breaks, and
    public broadcasts to a room topic (which never reach the host) are refused outright.
  - **P3 must:** drop reactions whose `uid` is not in `RB.party.people` or whose `round` is not
    the current one, and use `finishVote()` for the results.
- *P2 original brief:* the Парти button, the room, the QR overlay, names live, hide a name,
  the mini QR, the party strip (format, turn length, names), "Нова стая", "Край на партито".
- **P3 battles in the game — done 2026-11-26.** New `js/party-battle.js` (loads after
  party-host.js) adds the game hooks to `RB.party`; `game.js` only calls them, guarded by
  `G.party` (null without party mode): `beginGame(G, pattern)` after the chart is built (local
  only), `decorate(rowsEl, G)` after `renderRows`, **`onStarted(G)` once the beat really plays**
  (only then `start_round` / part 2 reach the phones, so a game that never starts makes no
  round), `onCell(G, idx)` at the top of `onCell`, `header(G, idx, stall)` in `header()`,
  `onEnd(G)` at the end of `endGame()`, `onStop(G, why)` in `stopEngine(fade, why)` (`why` =
  `'restart'` from `startGame`, `'menu'` otherwise) and `onMenu()` in `toMenu()`.
  - **Дует:** `side(bar)` from `turnBars` = max(strip setting, pattern cycle in bars); when the
    pattern forces a longer turn, a toast says so. Rows get `side-L/R` (coloured row number +
    a thin inner edge on the cells) and the first row of a turn shows the name. Header:
    count-in "Започва ИВАН · N", then "Бар N / M" + "◀ ИВАН" / "МАРИЯ ▶", and "Следва МАРИЯ ▶" in
    the last bar of a turn.
  - **1 на 1:** part 1 = left (header "… · част 1/2"); at its end `phase = 'between'` and
    "Играй пак" becomes "▶ <right> (дясно)"; that button starts part 2 (same settings, new
    words, `phase = 'live', part = 2, turn = 'R'`). "Меню" between the parts cancels.
  - Turns: the phones get the turn of the next bar on its last beat (one beat early); the
    check runs on every cell a frame lands on, so skipped cells (slow frames, 2x speed) never
    lose a turn change. The TV edge glow follows the bar the ball is in.
  - Writes go through one queue (start_round first, then the patches), only for the room
    they were queued for (not after "Нова стая" / "Край на партито", which also stop the
    battle with a toast). A failed write logs, shows "Парти връзката се бави…" (max every
    20 s) and a failed turn patch is resent on the next cell. `start_round` retries once.
  - End: a finished battle saves `rounds.hype = {L, R, by: {uid: {L, R}}}` and sets
    `phase = 'lobby'` (**P5 starts the vote here instead**). Exit mid-game, a game that
    never started, "Меню" between 1v1 parts: `rounds.results = {cancelled: true}` (when the
    round exists) and `phase = 'lobby'`. Names in the strip clear after a finished battle.
  - **Reactions layer** `#partyFx` (fixed, `pointer-events: none`, hidden on the menu): side
    edge glows (the rapping side bright; pulse at 10+ taps in 2 s), flying emoji in the side
    zones (max 30 recycled nodes; more → "+N 🔥" bursts; none with reduced motion), the name
    on a guest's first reaction of the battle and then on every 5th, hype calls "Залата
    гори!" / "ОГЪН!" / "Неудържим!" at 50 / 150 / 300, a tug-of-war hype meter at the top.
    Hidden layers recycle their nodes by hand (no `animationend` there).
  - Reaction checks: the uid must be a guest of the room (an unknown uid is kept and
    replayed after one people reload: a fresh guest's broadcast can beat its people row),
    the round and the phase must match, the emoji must be one of the 5. Totals are monotonic
    per guest and limited by a token bucket (8 points/s, 24 at once): Realtime does not prove
    the uid in a payload, so a guest copying another guest's uid adds at most that.
  - Verified (browser, 20 simulated phones tapping non-stop, synth 90 BPM, 8 bars): header
    texts and row sides as above, turn L → R at bar 5 on the TV and the phones (also with
    frames every 450 ms, i.e. skipped cells), saved hype = the phones' totals exactly (720/619
    and 695/696), reaction handler median 0.4 ms / max 4.9 ms, 0 long tasks, frame cost
    < 0.1 ms; 1v1 part 1 → between → part 2 → lobby; exit mid-game → cancelled + lobby;
    "Меню" between parts → lobby; forged +1000 for another uid → +24; a game without party
    mode is unchanged; no new console errors. **Not tested:** a real TV, real phones (needs
    the deploy), SoundCloud beats in a battle (the hooks are beat-independent), 30 phones
    (the sign-in limit allows about 30 new guests per hour from one IP; 20 were used).
  - Reviewed by an agent: 14 medium findings, all fixed (listed in the session log).
- *P3 original brief:* duet turns and 1v1 parts, row sides, header texts,
  `state.turn`, reactions layer, hype meter, hype calls. Pass: no lost ball frames with 30
  simulated phones tapping.
- **P4 phone page — done 2026-11-26.** `party.html` + `js/party-phone.js` + `css/party.css`
  rewritten. Views: join (also "Смени името" from the lobby, with "Отказ"; a battle or a vote
  closes the form), message, lobby ("Чакаме батъла…", own name, last battle's names), live
  (banner "◀ ИВАН рапира" / "МАРИЯ рапира ▶", the rapping side lit, tap zones with a small
  emoji pop, counts, 5 emoji), between (1v1: "Следва МАРИЯ ▶", tapping still counts), vote
  (countdown, stars per side, "✓ Записано…" from what the database has, stars disabled at 0,
  then "Чакаме резултатите…" with a state poll every 3 s), results (winner, both averages,
  vote counts, "Ти даде: ★★★★ / ★★★★★ · 🔥 × N"), closed / moved. A yellow "Свързвам…" pill
  shows while the live channel is down or the last request failed; then the state is polled
  every 5 s, and a CLOSED channel is made again (supabase-js only rejoins after
  CHANNEL_ERROR / TIMED_OUT). Sign-in errors explain the per-IP limit ("опитай с мобилни
  данни"). Wake lock during live; taps max 6/s; reduced motion: no pops.
- *P4 original brief:* join, lobby, live tap zones and emoji, between, vote, results, wake
  lock, reconnect. Real test: 3 phones (Android + iPhone), on 4G and Wi-Fi, lock and unlock
  during a song.
- **P5 vote + results — done 2026-11-26.** New `js/party-vote.js` (after party-battle.js),
  `#partyVote` overlay, "История на батълите" in the party overlay.
  - A finished battle (duet end, or 1v1 part 2 end) saves `rounds.hype`, then
    `RB.party.startVote(info)` → `start_vote` (20 s, server clock) → overlay "Гласувайте
    сега!" with a big countdown, two live columns (average ★, "N гласа", bar) and a live feed
    of the last 8 voters ("Петя  Иван ★★★★☆  Мария ★★★★★", a changed vote moves up and counts
    once). Focus starts on the title (Space never presses a button); P/T/Space/Esc blocked.
  - At 0 or "Край на гласуването": `finish_vote` (3 tries; on a lasting error the button
    becomes "Покажи резултата") → the server's list is the result → winner by exact average
    (cross-multiplied sums; a tie → more hype; then "Равенство!"; "Няма гласове"), 2 decimals
    when 1 decimal looks equal, confetti, **"Кой как гласува"** (every voter with the stars
    for each rapper, sorted by name, auto-scrolls on a TV), "🔥 Топ хайпъри" (top 3 by taps),
    "👑 Класиране на вечерта" (finished battles, best winner average first). Then
    `rounds.results = {L:{avg,n,sum}, R:…, winner, hype, topHypers, voters}` and
    `rooms.state.results = {winner, L:{avg,n}, R:{avg,n}}` (the phones) in two separate
    writes with one retry each, only for the room the vote belongs to.
  - "Нов батъл" → `phase = 'lobby'` (through the battle write queue) and the menu; "Затвори"
    keeps the results on the phones; the menu or the next battle also moves them to lobby.
    A running vote is never dropped.
  - Host reload: `vote` → the overlay comes back with the votes so far and the same end time;
    `results` without a written result → finish again; `live` / `between` (the game is gone)
    → lobby.
  - DB (migrations `party_vote_fixes`, `party_vote_errcode`, appended to `party/schema.sql`):
    `start_vote` only from `live`/`between` and never on a round with results; `finish_vote`
    only from `vote` (or `results` again); `vote_open` takes a share lock on the room, so
    `finish_vote` (FOR UPDATE) waits for votes being written and later votes are refused —
    no vote can land after the tally. Wrong-phase errcode **`RB004`** (not `P0004`: that is
    ASSERT_FAILURE, which `exception when others` cannot catch — found in the SQL test).
  - Verified (browser): 8 simulated guests + one phone page; live tally exact (29/7 = 4,1;
    a changed vote counted once), reveal "ПОБЕДИТЕЛ: МАРИЯ" 4,0 / 4,3 with the phone's vote in
    it, table of 8 voters (a non-voter is not listed), top hypers, ranking, phone results view,
    "Нов батъл" → lobby, history, host reload during the vote → resumed, early stop, Space
    blocked, rename + cancel, between banner; regression sim 23/23; SQL guard tests.
  - Reviewed by an agent: 16 medium + 4 small findings, all fixed (session log).
  - **Not tested:** real phones and a TV (deployed now: scan the QR), two hosts racing.
- *P5 original brief:* vote phase with live columns and the live vote feed, the reveal, the
  who-rated-whom table, top hypers, the session ranking, "История". Then a full party
  rehearsal with real phones before 2026-12-20, so there is time for fixes before 2026-12-31.

Estimate: P1 + P2 one session, P3 one session, P4 + P5 one or two sessions.

### 16.11 Risks

| Risk | Plan |
|---|---|
| A free Supabase project pauses after 7 days without use | Run a test battle in the week before the party; open the dashboard on 2026-12-31 and check that the project is active |
| Anonymous sign-in limit per IP (same Wi-Fi) | Kept at 30/hour by the user's choice: about 30 new phones per hour on one Wi-Fi; joined phones keep their session. Raise it in the dashboard if a party is bigger |
| Weak Wi-Fi or 4G at the venue | Small, batched messages; test on 4G in P4; the game never waits for the network |
| Realtime quotas | One subscriber per room on the busy channel; budget in 16.3; measured in P1 |
| Bad words in names on the TV | 16-character limit; the host hides a name with one tap |
| Tap spam decides the battle | Hype is only a tiebreak; the stars decide; taps capped at 6/s per phone |
| Guests vote for a friend | Accepted: the votes are public, which keeps it honest and fun |
| The QR points to a stale site | The party files must be on `main` (Vercel) before the party; the overlay shows the URL |
| Phones fall asleep | Wake Lock during the song; on wake the phone redraws from `rooms.state` |
| Reactions make the ball stutter on the laptop | At most 30 nodes, transform/opacity only, merged bursts; checked in P3 |

### 16.12 Decisions (user, 2026-11-26)

1. Backend: **Supabase** (the user has an account).
2. Battle format: **both**, "Дует" (turns inside one song) and "1 на 1" (full song against
   full song), chosen per battle.
3. Rating: **1–5 stars** for each rapper.
4. Results show **who rated which rapper with what score** (16.6).
5. Rapper names: **optional**. The host can type them; empty = "Играч 1" / "Играч 2". The
   names reset after every battle unless "Същите рапъри" is on.
