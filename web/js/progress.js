/**
 * Progress — persists Mastered marks and user preferences in localStorage.
 *
 * Storage keys:
 *   - englishReflex.mastered.v1   : { [questionId]: 1 }
 *   - englishReflex.prefs.v1      : { includeMastered: bool }
 *
 * The frontend uses this to filter out mastered questions from future sessions
 * unless the "Include mastered questions" toggle is on.
 */
window.APP = window.APP || {};

APP.progress = (function () {
  var MASTERED_KEY = 'englishReflex.mastered.v1';
  var PREFS_KEY = 'englishReflex.prefs.v1';

  var mastered = loadJSON(MASTERED_KEY, {});
  var prefs = Object.assign({ includeMastered: false }, loadJSON(PREFS_KEY, {}));

  function loadJSON(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      if (!raw) { return fallback; }
      var obj = JSON.parse(raw);
      return (obj && typeof obj === 'object') ? obj : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, obj) {
    try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {}
  }

  // ---- Mastered marks -----------------------------------------------------

  function isMastered(id) { return !!mastered[id]; }
  function markMastered(id) { mastered[id] = 1; save(MASTERED_KEY, mastered); }
  function unmarkMastered(id) { delete mastered[id]; save(MASTERED_KEY, mastered); }

  function countMasteredIn(questions) {
    var n = 0;
    for (var i = 0; i < questions.length; i++) {
      if (mastered[questions[i].id]) { n++; }
    }
    return n;
  }

  function filterOutMastered(questions) {
    return questions.filter(function (q) { return !mastered[q.id]; });
  }

  function resetAll() {
    mastered = {};
    save(MASTERED_KEY, mastered);
  }

  // ---- Preferences --------------------------------------------------------

  function getIncludeMastered() { return !!prefs.includeMastered; }
  function setIncludeMastered(v) {
    prefs.includeMastered = !!v;
    save(PREFS_KEY, prefs);
  }

  return {
    isMastered: isMastered,
    markMastered: markMastered,
    unmarkMastered: unmarkMastered,
    countMasteredIn: countMasteredIn,
    filterOutMastered: filterOutMastered,
    resetAll: resetAll,
    getIncludeMastered: getIncludeMastered,
    setIncludeMastered: setIncludeMastered
  };
})();
