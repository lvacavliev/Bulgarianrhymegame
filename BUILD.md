# Rimoboy (Римобой): Bulgarian freestyle rhyme game. Build specification

> Living document. Every session that works on this project reads this file first, then
> continues from the **Progress checklist** (section 14). Update the checklist and the
> **Session log** (section 15) before you end a session.

---

## START HERE (handoff for a new session, updated after M6, 2026-11-26)

**Status:** M0–M6 done (including M3a). **Next: M7, REC recording + own file beat.** Then
M8 (tutorial, polish), M9 (more words), M10 (full test).

**Read in this order:** this section → section 14 (the checklist, with implementation notes
under each finished milestone: *the code is the source of truth where they differ from
sections 4–9*) → section 10 (REC), 8.6 (FileBeat), 7.3 ("＋ Твой бийт" box), 7.5 (record
card), 8A.5 (REC with SoundCloud = mic only).

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

**What exists (globals, all on `window`):**

| Global | File | What it gives |
|---|---|---|
| `RB` | app.js | `$`, `store.get/set` (safe localStorage), `showScreen('menu'\|'game'\|'end')`, `toast(msg, ms)`, `openModal(id)`, `closeModal(id)`, `screen` (current) |
| `RB.beats` | menu-beats.js | `current()` → `{src:'synth'\|'sc'\|'file', title, meta, cover, artwork, emoji, link, bpm, durationSec, ready, reason, def?, track?, tempo?}`; `makeEngine()`; `stopPreview()`; `sync` (ms) |
| `RB.settings` | menu-words.js | `get()` → `{listId, fill, duration, patternId, speed, blank, rec}`; `list()`; `pattern()`; `fill()`; `speedFactor()`; `speedLabel()` |
| `RB.startGame()` | game.js | async; builds the chart, renders, starts the engine, runs the loop. "Играй пак" calls it too |
| `RB.toMenu()` | game.js | stops the engine (also the quiet end-screen beat), resumes a suspended ctx, shows the menu |
| `RB.game` | game.js | `state` (= `G`: `{engine, beat, settings, cellDur, bars, chart, list, total, playSec, cells, ended, paused, ...}`, null when no game), `pause()`, `resume()`, `exit()`, `frame()` |
| `RB.onGameEnd(G)` | end.js | called by game.js `endGame()` after `showScreen('end')`: stats, streak, recap, beat card, popups, confetti |
| `RB.end` | end.js | `bumpStreak()` → `{count, changed}`, `openDict(word, famId)`, `cleanup()` (game.js calls it in `toMenu`/`startGame`), `confetti()` |
| `WORD_LISTS`, `PATTERNS` (+`byId`) | words.js, patterns.js | data |
| `Chart` | chart.js | `buildChart`, `renderRows(el, chart, {countinRows, revealAll, tap})`, `fitCells(el)`, `FamilyBag`, `shuffle` |
| `RBAudio` | audio.js | `ensure()`, `ctx`, `master`, `recDest` (compressor → MediaStreamDestination, live ctx only), `latency()`, `makeOutput`, `buffers`, `mtof` |
| `BEATS`, `SynthBeat` | beats.js | 6 synth beats; engine |
| `SCW`, `SCBeat` | soundcloud.js | SoundCloud widget singleton; engine |

**Engine interface:** `await engine.start()` (synth: `start(ctx.currentTime + 0.15)`),
`time()` (latency-corrected, seconds since the first count-in cell), `setVolume(v, ramp)`,
`stop(fade)`. Pause: synth `RBAudio.ctx.suspend()/resume()`; SC `engine.pause()/resume()`.

**M7 brief (REC + own file beat):**
1. **FileBeat** (section 8.6): a new class (in beats.js, or a new `js/filebeat.js` loaded
   before menu-beats.js) with the engine interface above. Pause = `ctx.suspend()` like the
   synth. It plays through master, so it reaches `recDest`.
2. **"Твой файл" tab** in menu-beats.js. Today `current()` returns `ready:false,
   reason:'Идва скоро (M7).'` for `src:'file'`, and the start-up code (line ~385) never
   restores the file tab. Add a hidden `<input type=file accept="audio/*">`, decode the file,
   a BPM input (60–200) + "Тапни темпото" (reuse the existing tap-tempo code), "Начало (сек)"
   (first downbeat) and the help text from 7.3. Save `rb_fileBeat {name, bpm, offset}`.
   After a reload, show "Зареди файла отново" (the AudioBuffer is not stored).
   `current()` for a file: title = file name, meta `Твой файл · N BPM`, `durationSec` =
   buffer duration (game.js `barsFor` uses it for "Цялата песен"), `ready` only when a
   buffer and a BPM exist.
3. **REC** (section 10): when `G.settings.rec` is on, ask for the mic in `startGame()`
   *before* the engine starts. A denied mic → toast, and the game plays without REC.
   `micSrc → gain 1.3 → recDest`, never to the speakers. `MediaRecorder(recDest.stream)`,
   mime type per section 10. Start it when the count-in starts and show `#recBadge`
   (game.js `fillPlayer` hides it). Stop it in `endGame()` → blob → `#recCard`
   (`#recAudio.src`, `#recDl.href`, `download = rimoboy-YYYY-MM-DD-HHMM.webm`, or `.m4a`
   for mp4). Stop the mic tracks. Exit mid-game → discard the recording. Revoke the previous
   blob URL on a new game. With SC beats the recording is mic only (8A.5; `#recNote`
   already says so). Hide `#recCard` again when a game without REC ends (end.js
   `onGameEnd` is the place to toggle it).
4. Verify: the file beat plays in the preview and in the game, with the ball on the grid
   (test with a generated WAV click track at a known BPM, made in the scratchpad and not
   committed); "Цялата песен" with a file; REC with a synth beat gives a playable blob with
   sound (check `blob.size`, decode it with `decodeAudioData`); mic denied → the game still
   plays; exit during REC → no record card; 360 px; no console errors. Then tick M7 in
   section 14 and add a session log entry.

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
synth beats are not judged by ear; basic has 273 words (50 families), two 156 (32),
the other 4 lists 400+ each; M9 still adds the new theme lists. Hosting: the user has a Vercel deployment linked to the GitHub repo.

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
├── js/game.js        ← game loop, grid render, ball (section 9)
├── js/end.js         ← end screen, streak, rhyme dictionary (sections 7.5–7.7, 9.5)
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
| `rb_favs` | array of beat ids (M8) |

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
- [ ] **M7** REC recording + user file beat (tap tempo, offset, full song)
- [ ] **M8** Tutorial overlay, favourites, keyboard, reduced motion, TV mode
- [ ] **M9** Word list expansion: each list 40+ families; add 4+ theme lists (5.3 "Lists to add later"); stress review
  - Done early (2026-11-24, on the user's request): the 6 existing lists grew to newyear 400, mic 400, food 400, hard 401 words. Then, on the user's review, `basic` was pruned to simple words of 1–2 syllables (273 words, 50 families) and `two` to words of exactly 2 syllables (156 words, 32 families). Families left with fewer than 4 words were removed. Keep these two rules when adding words: `basic` = common, 1–2 syllables; `two` = exactly 2 syllables, stress on the first. Stress errors fixed: `отвори/затвори/умори/повтори` (stressed on the next-to-last syllable) left the end-stressed family; `пари` (end-stressed) left `two`; `имам` left `food`; `баса` replaced. Words can repeat across lists (only one list is checked for duplicates). Still open: the new theme lists. Section 5.3 shows the old drafts; `js/words.js` is the source of truth.
- [ ] **M10** Full test pass (section 13) + fixes; optional: publish as a shareable page

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
