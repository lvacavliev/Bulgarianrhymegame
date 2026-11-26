/* Rimoboy: REC recording (M7). Spec: BUILD.md section 10.
   The beat reaches RBAudio.recDest through master → compressor → recDest. The mic goes
   mic → gain 1.3 → recDest, never to the speakers (feedback). A SoundCloud beat plays in a
   cross-origin iframe, so with SC the recording is the mic only (section 8A.5).
   RB.rec:
     prepare()  → Promise; asks for the mic (rejects: 'unsupported' | the getUserMedia error)
     start()    starts the MediaRecorder (call when the count-in starts)
     pause() / resume()
     stop()     → Promise<{blob, url, ext, mime} | null>; releases the mic
     discard()  drops a running recording and releases the mic (exit mid-game)
     revoke()   frees the blob URL of the last recording (a new game starts)
   Loads after audio.js and app.js. */
(function () {
  'use strict';
  const A = window.RBAudio;
  const R = { mic: null, micSrc: null, micGain: null, recorder: null, url: null, gen: 0 };

  function pickMime() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    for (const m of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']) {
      if (MediaRecorder.isTypeSupported(m)) return m;
    }
    return '';
  }
  const extFor = (type) => (/mp4|aac|m4a/.test(type) ? 'm4a' : /ogg/.test(type) ? 'ogg' : 'webm');

  function releaseMic() {
    try { if (R.micGain) R.micGain.disconnect(); } catch (e) { /* gone */ }
    try { if (R.micSrc) R.micSrc.disconnect(); } catch (e) { /* gone */ }
    if (R.mic) R.mic.getTracks().forEach((t) => t.stop());
    R.mic = R.micSrc = R.micGain = null;
  }

  async function prepare() {
    discard();
    A.ensure();
    if (!window.MediaRecorder || !A.recDest || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error('unsupported');
    }
    const gen = ++R.gen;
    const mic = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    // discard() or a newer prepare() ran while the prompt was open: drop this mic
    if (gen !== R.gen) { mic.getTracks().forEach((t) => t.stop()); throw new Error('superseded'); }
    R.mic = mic;
    R.micSrc = A.ctx.createMediaStreamSource(mic);
    R.micGain = A.ctx.createGain();
    R.micGain.gain.value = 1.3;
    R.micSrc.connect(R.micGain);
    R.micGain.connect(A.recDest);
  }

  function start() {
    if (R.recorder) discard();
    const mime = pickMime();
    const rec = mime ? new MediaRecorder(A.recDest.stream, { mimeType: mime }) : new MediaRecorder(A.recDest.stream);
    const chunks = []; // per recorder: a late stop of an old game never mixes with a new one
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.rbChunks = chunks;
    rec.start(1000);
    R.recorder = rec;
  }

  function pause() { if (R.recorder && R.recorder.state === 'recording') R.recorder.pause(); }
  function resume() { if (R.recorder && R.recorder.state === 'paused') R.recorder.resume(); }

  function stop() {
    const rec = R.recorder;
    R.recorder = null;
    if (!rec) { releaseMic(); return Promise.resolve(null); }
    return new Promise((resolve) => {
      const done = () => {
        const chunks = rec.rbChunks || [];
        const type = rec.mimeType || (chunks[0] && chunks[0].type) || 'audio/webm';
        const blob = new Blob(chunks, { type });
        if (!blob.size) { resolve(null); return; }
        revoke();
        R.url = URL.createObjectURL(blob);
        resolve({ blob, url: R.url, ext: extFor(type), mime: type });
      };
      rec.onstop = done;
      try { if (rec.state !== 'inactive') rec.stop(); else done(); } catch (e) { resolve(null); }
      // release the mic now (not in onstop): a new game may already own a new mic then
      releaseMic();
    });
  }

  function discard() {
    R.gen++; // a pending prepare() gives up its mic
    const rec = R.recorder;
    R.recorder = null;
    if (rec) {
      rec.ondataavailable = null;
      rec.onstop = null;
      try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { /* ignore */ }
    }
    releaseMic();
  }

  function revoke() {
    if (R.url) URL.revokeObjectURL(R.url);
    R.url = null;
  }

  window.RB.rec = {
    prepare, start, pause, resume, stop, discard, revoke,
    get recording() { return !!R.recorder; },
  };
})();
