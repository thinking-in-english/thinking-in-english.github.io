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

  function isSupported() { return supported; }

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
      recog.maxAlternatives = 1;

      recog.onresult = function (event) {
        var transcript = event.results[0][0].transcript;
        resolve(compareWords(targetText, transcript));
      };
      recog.onerror = function (event) {
        reject(new Error(event.error || 'speech-error'));
      };
      recog.onend = function () { /* no-op; result/error already handled */ };

      try {
        recog.start();
      } catch (e) {
        reject(e);
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
  function compareWords(targetText, recognizedText) {
    var expected = APP.utils.normalizeWords(targetText);
    var recognized = APP.utils.normalizeWords(recognizedText);
    var recognizedSet = {};
    recognized.forEach(function (w) { recognizedSet[w] = true; });

    var matched = 0;
    var missing = [];
    expected.forEach(function (w) {
      if (recognizedSet[w]) { matched++; }
      else { missing.push(w); }
    });

    var status;
    if (expected.length > 0 && matched === expected.length) {
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
      missing: missing
    };
  }

  return {
    isSupported: isSupported,
    checkSpeech: checkSpeech,
    compareWords: compareWords
  };
})();