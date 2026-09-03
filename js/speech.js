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
  function checkSpeech(targetText, accent) {
    return new Promise(function (resolve, reject) {
      if (!supported) { reject(new Error('unsupported')); return; }

      var recog = new SR();
      recog.lang = APP.config.accentLang[accent] || 'en-US';
      recog.interimResults = false;
      // Ask for more guesses so we can pick the one that best matches the target.
      recog.maxAlternatives = 5;

      var settled = false;
      var watchdog = null;
      function done(fn, arg) {
        if (settled) { return; }
        settled = true;
        if (watchdog) { clearTimeout(watchdog); watchdog = null; }
        // Release the mic immediately — like tapping Stop in a recorder app —
        // instead of waiting for iOS to end the session on its own.
        if (activeRecog === recog) { activeRecog = null; }
        try { recog.onresult = null; } catch (e) {}
        try { recog.onerror = null; } catch (e) {}
        try { recog.onend = null; } catch (e) {}
        try { recog.stop(); } catch (e) {}
        try { recog.abort(); } catch (e) {}
        fn(arg);
      }

      recog.onresult = function (event) {
        var alts = event.results[0];
        var best = null;
        for (var i = 0; i < alts.length; i++) {
          var r = compareWords(targetText, alts[i].transcript);
          if (!best || r.matchedCount > best.matchedCount ||
              (r.matchedCount === best.matchedCount && r.status === 'ok')) {
            best = r;
          }
        }
        done(resolve, best);
      };
      recog.onerror = function (event) {
        done(reject, new Error(event.error || 'speech-error'));
      };
      recog.onend = function () {
        // iOS Safari sometimes fires onend without onresult/onerror on the
        // first run after granting permission. Surface it as no-speech.
        done(reject, new Error('no-speech'));
      };

      try {
        activeRecog = recog;
        recog.start();
        // Safety net: if the engine never fires any event (known iOS bug on
        // first run), release and reject after 12s so the mic never lingers.
        watchdog = setTimeout(function () {
          done(reject, new Error('no-speech'));
        }, 12000);
      } catch (e) {
        activeRecog = null;
        done(reject, e);
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
    abort: abort
  };
})();