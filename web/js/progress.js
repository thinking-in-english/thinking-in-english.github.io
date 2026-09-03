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
  var prefs = Object.assign({
    includeMastered: false,
    randomOrder: true,
    accent: 'US',
    rate: 1.0,
    voiceURI: null,
    googleApiKey: '',
    googleVoice: ''
  }, loadJSON(PREFS_KEY, {}));

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

  function getRandomOrder() {
    // Default ON when the pref has never been set.
    return prefs.randomOrder !== false;
  }
  function setRandomOrder(v) {
    prefs.randomOrder = !!v;
    save(PREFS_KEY, prefs);
  }

  function getAccent() { return prefs.accent || 'US'; }
  function setAccent(v) { prefs.accent = v; save(PREFS_KEY, prefs); }

  function getRate() { return typeof prefs.rate === 'number' ? prefs.rate : 1.0; }
  function setRate(v) { prefs.rate = v; save(PREFS_KEY, prefs); }

  function getVoiceURI() { return prefs.voiceURI || null; }
  function setVoiceURI(v) { prefs.voiceURI = v || null; save(PREFS_KEY, prefs); }

  function getGoogleApiKey() { return prefs.googleApiKey || ''; }
  function setGoogleApiKey(v) { prefs.googleApiKey = v || ''; save(PREFS_KEY, prefs); }

  function getGoogleVoice() { return prefs.googleVoice || ''; }
  function setGoogleVoice(v) { prefs.googleVoice = v || ''; save(PREFS_KEY, prefs); }

  return {
    isMastered: isMastered,
    markMastered: markMastered,
    unmarkMastered: unmarkMastered,
    countMasteredIn: countMasteredIn,
    filterOutMastered: filterOutMastered,
    resetAll: resetAll,
    getIncludeMastered: getIncludeMastered,
    setIncludeMastered: setIncludeMastered,
    getRandomOrder: getRandomOrder,
    setRandomOrder: setRandomOrder,
    getAccent: getAccent,
    setAccent: setAccent,
    getRate: getRate,
    setRate: setRate,
    getVoiceURI: getVoiceURI,
    setVoiceURI: setVoiceURI,
    getGoogleApiKey: getGoogleApiKey,
    setGoogleApiKey: setGoogleApiKey,
    getGoogleVoice: getGoogleVoice,
    setGoogleVoice: setGoogleVoice
  };
})();
