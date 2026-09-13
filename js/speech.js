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
  // iOS Safari's speech audio session can go stale after the page has been
  // backgrounded for a while (e.g. phone locked) — recognition afterwards
  // sometimes throws 'audio-capture' or, worse, silently "hears" garbage
  // words unrelated to what was said. Priming resets this. We keep priming
  // before every attempt until a recognition actually succeeds, since one
  // priming pass isn't always enough. See notifyReturnedFromBackground().
  var needsWarmup = false;

  function isSupported() { return supported; }

  /** Mark the audio session as possibly needing a reset before the next
   * checkSpeech() attempt (kept true across attempts until one succeeds). */
  function markNeedsWarmup() { needsWarmup = true; }

  /**
   * Called by app.js when the tab regains visibility, with how long it was
   * hidden. A long hide (screen lock, app switch) marks the audio session as
   * possibly stale so checkSpeech() primes it before every attempt until a
   * recognition with real matched words succeeds.
   */
  function notifyReturnedFromBackground(hiddenMs) {
    if (hiddenMs > 8000) { markNeedsWarmup(); }
  }

  /**
   * Briefly acquire and release the raw mic via getUserMedia. This forces
   * WebKit to re-negotiate the audio route at a lower level than
   * SpeechRecognition does on its own, which plain SpeechRecognition priming
   * doesn't always achieve. Never rejects — best effort only.
   */
  function primeGetUserMedia() {
    return new Promise(function (resolve) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { resolve(); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        stream.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        resolve();
      }).catch(function () { resolve(); });
    });
  }

  /**
   * Quick throwaway recognition session (start, then abort almost
   * immediately) used only to make WebKit re-establish a fresh audio route
   * before the real attempt. Never rejects — best effort only.
   */
  function primeSpeechRecognition() {
    return new Promise(function (resolve) {
      if (!supported) { resolve(); return; }
      var done = false;
      function finishPriming() { if (done) { return; } done = true; resolve(); }
      try {
        var recog = new SR();
        recog.onend = finishPriming;
        recog.onerror = finishPriming;
        recog.start();
        setTimeout(function () {
          try { recog.abort(); } catch (e) {}
          setTimeout(finishPriming, 150);
        }, 250);
      } catch (e) {
        finishPriming();
      }
    });
  }

  /** Run both priming steps in sequence before a real attempt. */
  function primeMic() {
    return primeGetUserMedia().then(primeSpeechRecognition);
  }

  // Force-stop any in-flight recognition so the browser releases the mic.
  // iOS Safari can ignore a single abort(), so we detach handlers and call
  // both stop() and abort().
  function abort() {
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
   * @return {Promise<Object>} comparison result (see below) or rejects.
   */
  function checkSpeech(targetText, accent, onDebug) {
    return new Promise(function (resolve, reject) {
      if (!supported) { reject(new Error('unsupported')); return; }

      function dbg(msg) {
        if (typeof onDebug === 'function') {
          try { onDebug(msg); } catch (e) {}
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
        fn(arg);
      }

      function finalizeWithHeard() {
        var text = recognizedSoFar.trim();
        if (!text) { finish(reject, new Error('no-speech')); return; }
        // A real transcript came back — the audio route is working again, so
        // stop priming future attempts. (If it was still stale we'd expect
        // an error or garbage/empty text, not a normal finalize.)
        needsWarmup = false;
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
        };

        recog.onerror = function (event) {
          if (settled) { return; }
          var code = event.error || 'speech-error';
          dbg('error: ' + code);
          // Explicit abort (e.g. app backgrounded) — stop for good, no retry.
          if (code === 'aborted') { finish(reject, new Error(code)); return; }
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

      if (needsWarmup) {
        // Don't clear the flag yet — only finalizeWithHeard() on a real
        // success does, so we keep priming every attempt until one works.
        dbg('priming stale audio session…');
        primeMic().then(begin);
      } else {
        begin();
      }
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