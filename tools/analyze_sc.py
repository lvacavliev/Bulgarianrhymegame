"""Rimoboy: offline beat analysis for the Bizzle Beats SoundCloud tracks.

Developer tool only. The app itself never downloads audio: it streams through the
official SoundCloud widget. This script fetches each track once into a temporary folder,
measures it, writes only numbers (BPM, beat drop, end of the beat), and deletes the audio.

Why: the widget audio is cross-origin, so the browser cannot analyse it, and SoundCloud's
public waveform (1800 peak values, ~80 ms each) is too coarse for a beat grid. The
reference game works the same way: every beat has hand-made bpm / drop / end metadata.

Usage (from a venv with yt-dlp, librosa, imageio-ffmpeg):
    python tools/analyze_sc.py --out tools/sc-analysis.json            # all tracks
    python tools/analyze_sc.py --out x.json --only roses blight        # some slugs
    python tools/analyze_sc.py --out x.json --keep-audio DIR           # keep files (debug)
Then: node tools/bake-sc-tracks.js tools/sc-analysis.json  (writes js/sc-tracks.js)

Method (one constant tempo, which DAW-made beats have; details in BUILD.md 8A.7):
 1. HPSS -> onset envelopes (percussive full band + 150 Hz-2.2 kHz snare band), hop 11.6 ms.
 2. Tempo: sweep 60-180 BPM of fold sharpness (envelope folded over one beat; peak/mean).
    Octave by the reference hint (within 2 %) or the best in 70-160; fine search; snap to
    the whole BPM when it scores >= 97 %. 3:2 / 4:3 rivals are flagged.
 3. Beat phase: peak of a 48-bin fold; the half-beat alternative wins when the snare band
    is stronger there.
 4. Downbeat: snare backbeat (2 and 4) -> phase mod 2; 1 vs 3 from section changes, chord
    change and kick.
 5. Drop: where the drum kit steps up >= 1.5x and stays; among nearby beats the biggest
    impact (kick + broadband onset + bass step + harmony step, small bar-stats bonus, small
    penalty for later beats). No step -> the first sounding downbeat.
 6. End: the last full beat, rounded down to whole bars after the drop.
 7. Timing: steps 2-6 run on coarse envelopes that lag the transients by ~27 ms; the
    reported times move by the lag measured on a fine > 2 kHz flux (1.45 ms), calibrated on
    synthetic clicks; outliers fall back to -27 ms (flagged).
"""
import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile

import numpy as np
import librosa
import scipy.ndimage

PROFILE = 'https://soundcloud.com/bizzlebeats/tracks'
SR = 22050
HOP = 256

# Reference BPMs for the same producer (BUILD.md 8A.3). Hints for the tempo octave only.
HINTS = {
    'roses': 88, 'behind-the-mask': 86, 'enchanted': 92, 'florentine': 89, 'get-through-it': 88,
    'impulse': 104, 'pierce': 128, 'round-the-bend': 98, 'the-frogg': 82, 'tip-toe': 139,
    'argentina-beat': 95, 'crazy-world': 91, 'expectations': 94, 'freshair': 94, 'fresh-air': 94,
    'internalise': 95, 'let-me-down': 97, 'mind-over-matter': 84, 'moments-like-this': 90,
    'roll-the-dice': 120, 'sharp': 98, 'spell-battle': 94,
}


def ffmpeg_exe():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which('ffmpeg')


def list_tracks():
    out = subprocess.run([sys.executable, '-m', 'yt_dlp', '--flat-playlist', '-J', PROFILE],
                         capture_output=True, text=True, check=True).stdout
    data = json.loads(out)
    tracks = []
    for e in data.get('entries', []):
        url = e.get('url') or e.get('webpage_url')
        if not url:
            continue
        slug = url.split('?')[0].rstrip('/').split('/')[-1]
        tracks.append({'slug': slug, 'url': url, 'title': e.get('title')})
    return tracks


def download(url, folder):
    ff = ffmpeg_exe()
    cmd = [sys.executable, '-m', 'yt_dlp', '-q', '--no-progress', '-f', 'bestaudio',
           '-x', '--audio-format', 'wav', '-o', os.path.join(folder, 'track.%(ext)s'), url]
    if ff:
        cmd[4:4] = ['--ffmpeg-location', ff]
    subprocess.run(cmd, check=True)
    for f in os.listdir(folder):
        if f.startswith('track.'):
            return os.path.join(folder, f)
    raise RuntimeError('download failed')


def load_audio(path):
    # decode through ffmpeg to raw float32 mono (no audioread dependency)
    ff = ffmpeg_exe()
    raw = subprocess.run([ff, '-v', 'quiet', '-i', path, '-f', 'f32le', '-ac', '1', '-ar', str(SR), '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()


def interp(a, x):
    """linear interpolation of a[] at float indices x (0 outside)"""
    x = np.asarray(x, dtype=np.float64)
    i = np.floor(x).astype(int)
    f = x - i
    ok = (i >= 0) & (i + 1 < len(a))
    out = np.zeros_like(x)
    out[ok] = a[i[ok]] * (1 - f[ok]) + a[i[ok] + 1] * f[ok]
    return out


def fold(env, T, i0, i1, nb):
    """Mean of env folded over one beat period T (frames) into nb bins, from frame i0 to i1."""
    n = int((i1 - i0) / T) - 1
    if n < 8:
        return np.ones(nb)
    base = i0 + np.arange(n) * T
    return interp(env, base[None, :] + (np.arange(nb) * T / nb)[:, None]).mean(axis=1)


def sharpness(env, fps, bpm, i0, i1, nb=24):
    """How strongly onsets line up on a grid of this tempo (peak / mean of the fold).
    A wrong tempo smears the fold flat; the right one (or a multiple) gives a sharp peak."""
    p = fold(env, 60.0 / bpm * fps, i0, i1, nb)
    return float(p.max() / (p.mean() + 1e-9))


def onset_env(B):
    e = librosa.onset.onset_strength(S=librosa.power_to_db(B ** 2), sr=SR, hop_length=HOP)
    e = scipy.ndimage.gaussian_filter1d(e, 1.0)
    return e / (np.percentile(e, 99) + 1e-9)


FINE_HOP = 32


def fine_env(y):
    """High-band (> 2 kHz) spectral flux at 1.45 ms resolution, for transient timing."""
    Sf = np.abs(librosa.stft(y, n_fft=256, hop_length=FINE_HOP, center=False))
    Sf = Sf[int(2000 / (SR / 256)):]
    db = librosa.amplitude_to_db(Sf, ref=np.max)
    flux = np.maximum(0, np.diff(db, axis=1)).mean(axis=0)
    return np.r_[0, flux]


def transient_offset(env_f, beats_s, win=0.06):
    """Fold the fine flux around every beat time (+-win s) and return
    the offset (s) of its peak. Same function is used on synthetic clicks for calibration."""
    ffps = SR / FINE_HOP
    offs = np.arange(-win, win, 1 / ffps)
    idx = (np.asarray(beats_s)[None, :] + offs[:, None]) * ffps
    prof = interp(env_f, idx).mean(axis=1)
    return float(offs[int(np.argmax(prof))])


_BIAS = None


def fine_bias():
    """Peak offset of the fine flux on clicks at known times (the pipeline's own latency)."""
    global _BIAS
    if _BIAS is None:
        rng = np.random.default_rng(1)
        y = (rng.standard_normal(SR * 30) * 0.002).astype(np.float32)
        times = np.arange(1.0, 29.0, 0.6377)
        for t in times:
            a = int(t * SR)
            n = int(0.03 * SR)
            y[a:a + n] += (rng.standard_normal(n) * np.exp(-np.arange(n) / (0.004 * SR))).astype(np.float32)
        _BIAS = transient_offset(fine_env(y), times)
    return _BIAS


def analyze(y, slug):
    dur = len(y) / SR
    fps = SR / HOP
    flags = []
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
    H, P = librosa.decompose.hpss(S, margin=1.0)
    lo = int(150 / (SR / 2048)) + 1                  # bins below ~150 Hz (kick, 808)
    mid_hi = int(2200 / (SR / 2048)) + 1             # ~150 Hz - 2.2 kHz (snare body)
    e_all = onset_env(P)
    e_mid = onset_env(P[lo:mid_hi])
    e_tempo = e_all + e_mid

    # region with sound (skip silence at both ends) for the tempo search
    rms = np.sqrt((S ** 2).mean(axis=0))
    loud = np.where(rms > 0.3 * np.median(rms))[0]
    if dur < 20 or len(loud) < fps * 10:
        raise ValueError('track too short or silent for a beat analysis')
    i0, i1 = int(loud[0]), int(loud[-1])

    # --- 1. tempo: sweep 60-180 BPM, peaks of fold sharpness ---
    grid = np.arange(60, 180, 0.05)
    sc = np.array([sharpness(e_tempo, fps, b, i0, i1) for b in grid])
    peaks = [i for i in range(1, len(sc) - 1) if sc[i] >= sc[i - 1] and sc[i] >= sc[i + 1]]
    peaks = sorted(peaks, key=lambda i: -sc[i])
    cands = [(float(grid[i]), float(sc[i])) for i in peaks[:8]]
    hint = HINTS.get(slug)
    best_in = max((c for c in cands if 70 <= c[0] <= 160), key=lambda c: c[1], default=cands[0])
    chosen = best_in
    if hint:
        near = [c for c in cands if abs(c[0] - hint) / hint < 0.02]
        if near and near[0][1] >= 0.6 * best_in[1]:
            chosen = max(near, key=lambda c: c[1])
        else:
            flags.append(f'reference hint {hint} BPM not found in the audio')
    # a strong rival that is not x2 / x0.5 of the choice = ambiguous metre (3:2, 4:3)
    for c in cands:
        ratio = c[0] / chosen[0]
        if 70 <= c[0] <= 160 and c[1] >= 0.85 * chosen[1] and min(abs(ratio - 2), abs(ratio - 0.5), abs(ratio - 1)) > 0.03:
            flags.append(f'tempo ambiguous: {c[0]:.2f} BPM scores {c[1]:.2f} vs {chosen[1]:.2f}')
    # fine search, then snap to a whole BPM when that is (almost) as good: DAW beats are
    # usually made at a whole tempo
    fine = np.arange(chosen[0] - 0.1, chosen[0] + 0.1, 0.002)
    fs = np.array([sharpness(e_tempo, fps, b, i0, i1, 48) for b in fine])
    bpm = float(fine[int(np.argmax(fs))])
    whole = float(round(bpm))
    if abs(whole - bpm) < 0.1 and sharpness(e_tempo, fps, whole, i0, i1, 48) >= 0.97 * fs.max():
        bpm = whole
    tempo_score = sharpness(e_tempo, fps, bpm, i0, i1, 48)
    T = 60.0 / bpm * fps
    beat_s = 60.0 / bpm

    # --- 2. beat phase: peak of the 48-bin fold, half-beat choice by the snare band ---
    NB = 48
    pa = fold(e_tempo, T, 0, len(e_tempo), NB)
    pm = fold(e_mid, T, 0, len(e_mid), NB)
    j = int(np.argmax(pa))
    other = (j + NB // 2) % NB

    def win(p, c):
        return max(p[(c + d) % NB] for d in (-2, -1, 0, 1, 2))
    if win(pm, other) > win(pm, j) and win(pa, other) > 0.5 * pa[j]:
        j = int(max(((other + d) % NB for d in (-2, -1, 0, 1, 2)), key=lambda b_: pa[b_]))
    # sub-bin peak (parabola through the neighbours)
    a, b, c = pa[(j - 1) % NB], pa[j], pa[(j + 1) % NB]
    den = a - 2 * b + c
    sub = 0.5 * (a - c) / den if den != 0 else 0.0
    phase = ((j + max(-0.5, min(0.5, sub))) * T / NB) % T     # frames, first grid beat
    # The coarse onset envelopes (n_fft 2048, centred frames) lag the real transients by
    # tens of ms (reviewer 2026-11-24: the grid was ~27 ms late on every track). All coarse
    # features below share that lag, so the analysis stays on the coarse grid; only the
    # reported times move by `shift`, measured on the actual transients (> 2 kHz) with a
    # fine flux, calibrated on synthetic clicks.
    env_f = fine_env(y)
    grid_s = (phase + np.arange(int((len(e_tempo) - phase) / T)) * T) / fps
    shift = transient_offset(env_f, grid_s[(grid_s > 5) & (grid_s < dur - 5)]) - fine_bias()
    grid_shift_ms = shift * 1000
    # 19 of 21 tracks measured -22..-35 ms; an outlier means the fold locked onto another
    # transient (an off-beat hat, a swung 16th), so use the typical lag and flag it
    if not -0.037 <= shift <= -0.018:
        flags.append(f'grid shift {grid_shift_ms:.0f} ms is unusual, used -27 ms')
        shift = -0.027

    # --- 3. per-beat features on the grid ---
    nbeats = int((len(e_tempo) - phase) / T)
    bt = (phase + np.arange(nbeats) * T) / fps
    rms_low = np.sqrt((S[:lo] ** 2).mean(axis=0))
    rms_perc = np.sqrt((P ** 2).mean(axis=0))

    def per_beat(x):
        out = np.zeros(nbeats)
        for k in range(nbeats):
            a_ = int(round(bt[k] * fps))
            b_ = int(round((bt[k] + beat_s) * fps))
            out[k] = x[a_:max(a_ + 1, b_)].mean()
        return out

    rms_b = per_beat(rms)
    sounding = rms_b > 0.3 * np.median(rms_b)

    def norm(f):
        # "body" level = 70th percentile of the sounding beats (robust to long intros,
        # breakdowns and outros, which a plain median of the middle part is not)
        return f / (np.percentile(f[sounding], 70) + 1e-9)
    hi_b = int(5000 / (SR / 2048))
    rms_hi = np.sqrt((P[hi_b:] ** 2).mean(axis=0))
    feat = {'rms': norm(rms_b), 'low': norm(per_beat(rms_low)), 'perc': norm(per_beat(rms_perc)),
            'hi': norm(per_beat(rms_hi)), 'harm': norm(per_beat(np.sqrt((H ** 2).mean(axis=0))))}
    F = (feat['rms'] + feat['low'] + feat['perc']) / 3      # whole arrangement, ~1 in the body
    D = (feat['perc'] + feat['hi'] + feat['low']) / 3       # drum kit, ~1 in the body
    full = F > 0.6

    # onset strength right at each beat (+-35 ms)
    r35 = int(round(0.035 * fps))

    def at_beat(e):
        return np.array([e[max(0, int(round(t * fps)) - r35):int(round(t * fps)) + r35 + 1].max() for t in bt])
    snare_b = at_beat(e_mid)

    def m(v, p, mask=None):
        idx = np.arange(p % 4, nbeats, 4)
        idx = idx[(full if mask is None else mask)[idx]]
        return float(v[idx].mean()) if len(idx) else 0.0

    def win_mean(v, a_, b_):
        a_, b_ = max(0, a_), min(len(v), b_)
        return float(v[a_:b_].mean()) if b_ > a_ else 0.0

    # --- 4. downbeat ("1"). Snare backbeat (2 and 4) gives the phase modulo 2. Beat 1 vs 3:
    # section changes (4-beat energy steps in any layer), chord changes and kick land on 1.
    backbeat = [m(snare_b, p + 1) + m(snare_b, p + 3) - m(snare_b, p) - m(snare_b, p + 2) for p in range(2)]
    pair = int(np.argmax(backbeat))
    if abs(backbeat[0] - backbeat[1]) < 0.1:
        flags.append(f'weak backbeat {np.round(backbeat, 3).tolist()}')
    nov = np.zeros(nbeats)
    for v in feat.values():
        lv = np.log(v + 0.05)
        for k in range(4, nbeats - 4):
            nov[k] += abs(lv[k:k + 4].mean() - lv[k - 4:k].mean())
    chroma = librosa.feature.chroma_stft(S=H ** 2, sr=SR, hop_length=HOP)
    cb = np.stack([chroma[:, int(round(t * fps)):int(round((t + beat_s) * fps)) + 1].mean(axis=1) for t in bt], axis=1)
    hch = np.r_[0, np.linalg.norm(np.diff(cb, axis=1), axis=0)]
    kick_b = at_beat(onset_env(S[:lo]))
    allb = np.ones(nbeats, dtype=bool)

    def z(v):
        return (v - v[sounding].mean()) / (v[sounding].std() + 1e-9)
    down_score = [m(z(nov), p, allb) + 0.5 * m(z(hch), p) + 0.5 * m(z(kick_b), p) for p in (pair, pair + 2)]
    down = (pair if down_score[0] >= down_score[1] else pair + 2) % 4
    if abs(down_score[0] - down_score[1]) < 0.1:
        flags.append(f'downbeat 1 vs 3 uncertain {np.round(down_score, 2).tolist()}')

    # --- 5. drop = the downbeat where the drum kit comes in ---
    # Ground truth: BLIGHT's melodic intro is as loud as the beat; hats start on a pickup at
    # 9.8 s and kick + bass hit at 10.5 s (by ear: 0:10). Roses has bass from 0:11, but the
    # reference game puts its drop at 21.8 s, where the drums come in. So: find where the
    # drum level steps up clearly, then take the beat with the biggest impact there (kick
    # onset + bass step + broadband onset), which skips pickups and fills.
    lim = int(np.searchsorted(bt, min(dur * 0.45, 75)))
    d_body = float(np.percentile(D[sounding], 70))
    dw = np.array([win_mean(D, k, k + 4) for k in range(nbeats)])
    ratio = np.array([dw[k] / max(dw[k - 4], 0.05 * d_body) if k >= 4 else 0.0 for k in range(nbeats)])
    steps = [k for k in range(4, lim) if ratio[k] >= 1.5 and dw[k] >= 0.5 * d_body
             and win_mean(D, k, k + 8) >= 0.5 * d_body]
    e_broad = onset_env(S)
    broad_b = at_beat(e_broad)
    low_b = feat['low']
    low_step = np.array([win_mean(low_b, k, k + 2) - win_mean(low_b, k - 2, k) for k in range(nbeats)])
    harm_b = feat['harm']
    harm_step = np.array([win_mean(harm_b, k, k + 2) - win_mean(harm_b, k - 2, k) for k in range(nbeats)])
    impact = z(kick_b) + z(broad_b) + z(low_step) + z(harm_step)
    # the bar statistics add their margin to the beats on their preferred downbeat
    bonus = min(0.5, 1.5 * abs(down_score[0] - down_score[1]))   # capped: a hint, not a veto
    weak_bb = abs(backbeat[0] - backbeat[1]) < 0.1
    drop_k, best_rise = None, 0.0
    if steps:
        k0 = steps[0]
        # window: a build-up can start the drum step up to 2 bars before the real entry
        cand = [k for k in range(max(1, k0 - 4), min(nbeats - 1, k0 + 9)) if weak_bb or k % 2 == pair]
        # later entries pay 0.4 per bar after the step: the first clear entry is the drop
        cscore = {k: impact[k] + (bonus if k % 4 == down else 0.0) - 0.1 * max(0, k - k0) for k in cand}
        ranked = sorted(cand, key=lambda k: -cscore[k])
        drop_k = ranked[0]
        if len(ranked) > 1 and cscore[ranked[0]] - cscore[ranked[1]] < 1.0:
            flags.append(f'drop uncertain: {bt[ranked[1]] + shift:.2f} s scores close to {bt[drop_k] + shift:.2f} s')
        if os.environ.get('RB_DEBUG'):
            for k in cand:
                print(f'    cand {bt[k]:6.2f} kick {z(kick_b)[k]:5.2f} broad {z(broad_b)[k]:5.2f} low {z(low_step)[k]:5.2f} '
                      f'harm {z(harm_step)[k]:5.2f} bonus {bonus if k % 4 == down else 0:4.2f} ratio {ratio[k]:4.2f} k0 {bt[k0]:6.2f}')
        best_rise = float(ratio[k0])
        if drop_k % 4 != down:
            flags.append(f'drop sets the downbeat (bar stats preferred the other half bar {np.round(down_score, 2).tolist()})')
    intro = drop_k is not None and bt[drop_k] >= 1.0
    if not intro:
        # the drums are in from the start: bar 1 = the first sounding downbeat
        k = int(np.argmax(sounding))
        while k % 4 != down and k + 1 < nbeats:
            k += 1
        drop_k = k
    drop_s = float(bt[drop_k]) + shift      # true time of the downbeat transient

    # --- 6. end: last full beat, whole bars after the drop ---
    full_idx = np.where(F > 0.5)[0]
    last = int(full_idx[-1]) if len(full_idx) else nbeats - 1
    bars = max(1, (last + 1 - drop_k) // 4)
    end_s = drop_s + bars * 4 * beat_s

    # --- quality: share of strong transients (top 20 % of fine-flux peaks) within 20 ms of
    # the 16th-note grid (fine flux, bias-corrected like the grid itself) ---
    ffps = SR / FINE_HOP
    pk = librosa.util.peak_pick(env_f, pre_max=20, post_max=20, pre_avg=100, post_avg=100, delta=0.5, wait=40)
    if len(pk):
        pk = pk[env_f[pk] >= np.percentile(env_f[pk], 80)]
        pos = (pk / ffps - fine_bias() - drop_s) / (beat_s / 4)   # drop_s is already corrected
        on_grid = float(np.mean(np.abs(pos - np.round(pos)) * beat_s / 4 < 0.02))
    else:
        on_grid = None
    if tempo_score < 2.5:
        flags.append(f'low tempo confidence {tempo_score:.2f}')

    return {
        'bpm': round(bpm, 3), 'dropMs': int(round(drop_s * 1000)), 'endMs': int(round(end_s * 1000)),
        'durationMs': int(round(dur * 1000)), 'intro': bool(intro),
        'tempoScore': round(tempo_score, 2), 'gridShiftMs': round(grid_shift_ms, 1), 'onGrid': None if on_grid is None else round(on_grid, 3),
        'backbeat': [round(v, 3) for v in backbeat], 'downScore': [round(v, 2) for v in down_score], 'riseMax': round(best_rise, 3),
        'hint': hint, 'candidates': [[round(c[0], 2), round(c[1], 2)] for c in cands[:5]], 'flags': flags,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--out', required=True)
    ap.add_argument('--only', nargs='*')
    ap.add_argument('--keep-audio', help='debug: copy the audio into this folder')
    ap.add_argument('--local', help='debug: analyse files <slug>.wav from this folder, no download')
    args = ap.parse_args()
    results = {}
    if os.path.exists(args.out):
        with open(args.out, encoding='utf-8') as f:
            results = json.load(f)
    if args.local:
        tracks = [{'slug': os.path.splitext(f)[0], 'url': None, 'title': results.get(os.path.splitext(f)[0], {}).get('title')}
                  for f in sorted(os.listdir(args.local))]
    else:
        tracks = list_tracks()
    print(f'{len(tracks)} tracks', flush=True)
    if not args.only and not args.local:
        # a full run: tracks no longer on the profile leave the table
        gone = set(results) - {t['slug'] for t in tracks}
        for slug in gone:
            print(f'{slug:18s} removed (not on the profile any more)', flush=True)
            del results[slug]
    for t in tracks:
        if args.only and t['slug'] not in args.only:
            continue
        tmp = tempfile.mkdtemp(prefix='rb_sc_')
        try:
            path = os.path.join(args.local, t['slug'] + '.wav') if args.local else download(t['url'], tmp)
            y = load_audio(path)
            r = analyze(y, t['slug'])
            r['title'] = t['title']
            results[t['slug']] = r
            print(f"{t['slug']:18s} {r['bpm']:7.2f} BPM  drop {r['dropMs']/1000:6.2f}s  end {r['endMs']/1000:6.1f}s  "
                  f"score {r['tempoScore']}  grid {r['onGrid']}  {'; '.join(r['flags'])}", flush=True)
            if args.keep_audio and not args.local:
                os.makedirs(args.keep_audio, exist_ok=True)
                shutil.copy(path, os.path.join(args.keep_audio, t['slug'] + os.path.splitext(path)[1]))
        except Exception as e:  # keep going with the other tracks
            old = ' (keeping the previous result)' if t['slug'] in results else ''
            print(f"{t['slug']:18s} FAILED: {e}{old}", flush=True)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)   # the audio never stays on disk
        with open(args.out, 'w', encoding='utf-8') as f:
            json.dump(results, f, indent=1, ensure_ascii=False)


if __name__ == '__main__':
    main()
