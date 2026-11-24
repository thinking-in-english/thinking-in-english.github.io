/**
 * Speech — OPTIONAL basic speech-to-text word matching (sections 31-34).
 *
 * IMPORTANT: this is NOT pronunciation scoring. It only checks whether the
 * spoken words were recognized as the expected English words. Labels use
 * "Words Recognized" / "Speech Match" wording, never "Pronunciation Score".
 */
window.APP = window.APP || {};

APP.speech = (function () {

  var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  var supported = !!SR;
  var activeRecog = null;

  function isSupported() { return supported; }

  // No-ops kept for callers that still invoke them; priming via getUserMedia
  // was found to DEGRADE recognition on iOS (it competes with the recognizer
  // for the mic), so we no longer do it.
  function markNeedsWarmup() {}
  function notifyReturnedFromBackground() {}

  // Keep a getUserMedia stream open for the WHOLE recognition (iOS/iPadOS).
  // WebKit bug 317741 — the speech-recognition mic source doesn't keep the
  // audio session active by itself, so after the page has played audio
  // (Google TTS) iOS captures in a degraded session (words dropped/misheard)
  // until Safari is killed. A live getUserMedia capture does keep the session
  // active. Never open-then-close the mic around recognition (old priming /
  // "reset route" tricks): the close deactivates the session again, and if it
  // lands while recognition starts it fails with 'audio-capture'.
  // Off elsewhere: Android/desktop don't have the bug, and a parallel capture
  // could contend with the recognizer. Override with ?holdmic=1 / ?holdmic=0.
  function isIOS() {
    var ua = navigator.userAgent || '';
    return /iPad|iPhone|iPod/.test(ua) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  }
  var holdMicParam = /[?&]holdmic=([01])\b/.exec(window.location.search);
  var HOLD_MIC = holdMicParam ? holdMicParam[1] === '1' : isIOS();
  var heldStream = null;
  var abortGen = 0; // bumped by abort() so a pending getUserMedia won't start recognition

  function releaseHeldMic() {
    if (!heldStream) { return; }
    var s = heldStream;
    heldStream = null;
    s.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
  }

  // Force-stop any in-flight recognition so the browser releases the mic.
  // iOS Safari can ignore a single abort(), so we detach handlers and call
  // both stop() and abort().
  function abort() {
    abortGen++;
    releaseHeldMic();
    if (!activeRecog) { return; }
    var r = activeRecog;
    activeRecog = null;
    try { r.onresult = null; } catch (e) {}
    try { r.onerror = null; } catch (e) {}
    try { r.onend = null; } catch (e) {}
    try { r.stop(); } catch (e) {}
    try { r.abort(); } catch (e) {}
  }

  /**
   * Listen once and compare against the target sentence.
   * @param {string} targetText Expected English sentence.
   * @param {string} accent 'US' | 'UK' — selects recognition language.
   * @param {function(string)} [onDebug] debug trace sink.
   * @param {function()} [onReady] called once, when the recognizer is
   *     actually capturing audio — only then should the user start speaking.
   * @param {function(string, number)} [onHeard] called on every interim
   *     result with the text so far and how many ms of silence will end it.
   * @return {Promise<Object>} comparison result (see below) or rejects.
   */
  function checkSpeech(targetText, accent, onDebug, onReady, onHeard) {
    return new Promise(function (resolve, reject) {
      if (!supported) { reject(new Error('unsupported')); return; }

      function dbg(msg) {
        if (typeof onDebug === 'function') {
          try { onDebug(msg); } catch (e) {}
        }
      }

      var readyFired = false;
      var readyFallbackTimer = null;
      function fireReady(why) {
        if (readyFired || settled) { return; }
        readyFired = true;
        if (readyFallbackTimer) { clearTimeout(readyFallbackTimer); readyFallbackTimer = null; }
        dbg('ready (' + why + ')');
        if (typeof onReady === 'function') {
          try { onReady(); } catch (e) {}
        }
      }

      // We implement our own "voice activity detection" instead of relying on
      // the browser's built-in end-of-speech guess (which is short, fixed,
      // and unreliable on iOS Safari). This lets short answers finish quickly
      // and long ones (or a long prompt read before answering) get more time.
      var SILENCE_MS = 4000;        // pause this long after last speech = done talking
      var START_GRACE_MS = 20000;   // time allowed to start talking (reading time)
      var HARD_CAP_MS = 30000;      // absolute safety net so mic never lingers

      var settled = false;
      var hasSpeech = false;
      var recognizedSoFar = '';
      var priorText = ''; // accumulated from earlier sessions if iOS cuts one short mid-sentence
      var lastSpeechAt = 0;
      var silenceTimer = null;
      var hardCapTimer = null;
      var firstStartedAt = 0;
      var currentRecog = null;
      var captureRetried = false;
      var gen = abortGen;

      function clearTimers() {
        if (silenceTimer) { clearTimeout(silenceTimer); silenceTimer = null; }
        if (hardCapTimer) { clearTimeout(hardCapTimer); hardCapTimer = null; }
      }

      function finish(fn, arg) {
        if (settled) { return; }
        settled = true;
        clearTimers();
        if (activeRecog === currentRecog) { activeRecog = null; }
        var recog = currentRecog;
        if (recog) {
          try { recog.onresult = null; } catch (e) {}
          try { recog.onerror = null; } catch (e) {}
          try { recog.onend = null; } catch (e) {}
          try { recog.stop(); } catch (e) {}
          try { recog.abort(); } catch (e) {}
        }
        releaseHeldMic();
        fn(arg);
      }

      function finalizeWithHeard() {
        var text = recognizedSoFar.trim();
        if (!text) { finish(reject, new Error('no-speech')); return; }
        finish(resolve, compareWords(targetText, text));
      }

      // Reset every time new speech comes in — user is only "done" once this
      // much silence follows their last word.
      function scheduleSilenceCheck() {
        if (silenceTimer) { clearTimeout(silenceTimer); }
        silenceTimer = setTimeout(finalizeWithHeard, SILENCE_MS);
      }

      function startAttempt() {
        var recog = new SR();
        currentRecog = recog;
        recog.lang = APP.config.accentLang[accent] || 'en-US';
        dbg('start lang=' + recog.lang);
        // Interim results let us see speech as it happens so we can run our
        // own silence timer; continuous keeps the session alive across
        // natural pauses instead of the browser ending it after the first one.
        recog.interimResults = true;
        recog.continuous = true;
        recog.maxAlternatives = 1;

        // 'audiostart' = capture really began. 'start' can come a bit
        // earlier, so it only arms a short fallback for engines that never
        // fire 'audiostart'.
        recog.onaudiostart = function () { fireReady('audiostart'); };
        recog.onstart = function () {
          if (readyFired || readyFallbackTimer) { return; }
          readyFallbackTimer = setTimeout(function () {
            readyFallbackTimer = null;
            fireReady('start+fallback');
          }, 400);
        };

        recog.onresult = function (event) {
          hasSpeech = true;
          lastSpeechAt = Date.now();
          var parts = [];
          for (var i = 0; i < event.results.length; i++) {
            parts.push(event.results[i][0].transcript);
          }
          var thisSessionText = parts.join(' ');
          recognizedSoFar = (priorText ? priorText + ' ' : '') + thisSessionText;
          dbg('result: "' + thisSessionText + '" → acc: "' + recognizedSoFar + '"');
          scheduleSilenceCheck();
          if (typeof onHeard === 'function') {
            try { onHeard(recognizedSoFar, SILENCE_MS); } catch (e) {}
          }
        };

        recog.onerror = function (event) {
          if (settled) { return; }
          var code = event.error || 'speech-error';
          dbg('error: ' + code);
          // Explicit abort (e.g. app backgrounded) — stop for good, no retry.
          if (code === 'aborted') { finish(reject, new Error(code)); return; }
          // Mic grabbed from under us (e.g. the audio session flipped while
          // recognition was starting) — reopen the mic and retry once.
          if (code === 'audio-capture' && !hasSpeech && !captureRetried) {
            captureRetried = true;
            dbg('audio-capture → reopen mic + retry once');
            try { recog.onresult = null; recog.onerror = null; recog.onend = null; } catch (e) {}
            try { recog.abort(); } catch (e) {}
            setTimeout(function () {
              if (settled) { return; }
              if (HOLD_MIC) { releaseHeldMic(); acquireMicThen(startAttempt); }
              else { startAttempt(); }
            }, 300);
            return;
          }
          var fatal = (code === 'not-allowed' || code === 'service-not-allowed' ||
                       code === 'network' || code === 'audio-capture');
          if (hasSpeech) {
            // A fatal error won't be fixed by retrying — score what we have.
            // Otherwise (e.g. transient 'no-speech') let onend below decide.
            if (fatal) { finalizeWithHeard(); }
            return;
          }
          if (fatal) { finish(reject, new Error(code)); return; }
          // 'no-speech' with nothing captured yet — let onend decide whether
          // to retry (still within the reading-time grace window).
        };

        recog.onend = function () {
          if (settled) { return; }
          if (hasSpeech) {
            // iOS sometimes ends the session mid-sentence (well before our
            // own silence timer would fire) — that's a cutoff bug, not the
            // user finishing. Only finalize if a real pause has elapsed;
            // otherwise keep the accumulated text and start a fresh session.
            var gap = Date.now() - lastSpeechAt;
            if (gap >= SILENCE_MS - 150) {
              dbg('end: real pause (' + gap + 'ms) → finalize');
              finalizeWithHeard();
            } else {
              dbg('end: mid-speech cutoff (' + gap + 'ms) → restart+append');
              priorText = recognizedSoFar;
              setTimeout(startAttempt, 150);
            }
            return;
          }
          // Hasn't started talking yet — likely still reading the prompt.
          // Restart a fresh session if there's still grace time left.
          if (Date.now() - firstStartedAt < START_GRACE_MS) {
            dbg('end: no speech yet → restart (reading grace)');
            setTimeout(startAttempt, 300);
            return;
          }
          dbg('end: grace expired, giving up');
          finish(reject, new Error('no-speech'));
        };

        try {
          activeRecog = recog;
          recog.start();
        } catch (e) {
          dbg('start threw: ' + e.message);
          finish(reject, e);
        }
      }

      function begin() {
        firstStartedAt = Date.now();
        hardCapTimer = setTimeout(function () {
          if (hasSpeech) { finalizeWithHeard(); }
          else { finish(reject, new Error('no-speech')); }
        }, HARD_CAP_MS);
        startAttempt();
      }

      // Without a held mic, give a just-stopped Listen/TTS a moment to settle
      // so the mic doesn't catch its tail. With a held mic, opening it
      // (~1s on iOS) already covers that.
      var SETTLE_MS = 500;

      // Open the held mic, then run next(). Falls back to plain recognition
      // if getUserMedia fails; rejects with 'aborted' if abort() ran meanwhile.
      function acquireMicThen(next) {
        dbg('holdmic=on: opening mic');
        navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
          if (settled || gen !== abortGen) {
            stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
            finish(reject, new Error('aborted'));
            return;
          }
          heldStream = stream;
          var track = stream.getAudioTracks()[0];
          dbg('holdmic: mic live (' + (track ? track.readyState : 'no track') + ')');
          next();
        }).catch(function (err) {
          dbg('holdmic: getUserMedia failed (' + ((err && err.name) || err) + ') → normal');
          if (settled) { return; }
          if (gen !== abortGen) { finish(reject, new Error('aborted')); return; }
          next();
        });
      }

      if (!HOLD_MIC || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        dbg('holdmic=off');
        setTimeout(function () {
          if (settled) { return; }
          if (gen !== abortGen) { finish(reject, new Error('aborted')); return; }
          begin();
        }, SETTLE_MS);
        return;
      }

      releaseHeldMic();
      acquireMicThen(begin);
    });
  }

  /**
   * Compare expected vs recognized words.
   * @return {{
   *   status: 'ok'|'partial'|'miss',
   *   recognizedText: string,
   *   expectedCount: number,
   *   matchedCount: number,
   *   missing: string[]
   * }}
   */
  // A word passes when its edit distance to a candidate is at most this many
  // characters — scaled by word length so short words are stricter.
  var PASS_RATIO = 0.8; // 80% of expected words matched → treat as correct

  function fuzzyTolerance(word) {
    // 1 edit for words up to 4 chars, then ~30% of length (min 1, max 3).
    if (word.length <= 4) { return 1; }
    return Math.max(1, Math.min(3, Math.floor(word.length * 0.3)));
  }

  function compareWords(targetText, recognizedText) {
    var expected = APP.utils.normalizeWords(targetText);
    var recognized = APP.utils.normalizeWords(recognizedText);
    var used = new Array(recognized.length);
    var matched = 0;
    var fuzzy = 0;
    var missing = [];

    // Exact matches first (multiset), then fuzzy matches for the rest.
    expected.forEach(function (w) {
      var idx = -1;
      for (var i = 0; i < recognized.length; i++) {
        if (!used[i] && recognized[i] === w) { idx = i; break; }
      }
      if (idx >= 0) { used[idx] = true; matched++; return; }

      var tol = fuzzyTolerance(w);
      var bestIdx = -1, bestDist = Infinity;
      for (var j = 0; j < recognized.length; j++) {
        if (used[j]) { continue; }
        var d = APP.utils.levenshtein(w, recognized[j]);
        if (d <= tol && d < bestDist) { bestDist = d; bestIdx = j; }
      }
      if (bestIdx >= 0) { used[bestIdx] = true; matched++; fuzzy++; return; }

      missing.push(w);
    });

    var ratio = expected.length ? matched / expected.length : 0;
    var status;
    if (expected.length === 0) {
      status = 'miss';
    } else if (matched === expected.length || ratio >= PASS_RATIO) {
      status = 'ok';
    } else if (matched > 0) {
      status = 'partial';
    } else {
      status = 'miss';
    }

    return {
      status: status,
      recognizedText: recognizedText,
      expectedCount: expected.length,
      matchedCount: matched,
      fuzzyCount: fuzzy,
      missing: missing
    };
  }

  return {
    isSupported: isSupported,
    checkSpeech: checkSpeech,
    compareWords: compareWords,
    abort: abort,
    notifyReturnedFromBackground: notifyReturnedFromBackground,
    markNeedsWarmup: markNeedsWarmup
  };
})();