/**
 * TTS — browser SpeechSynthesis wrapper (sections 22-27).
 * Kept separate from flashcard logic. No autoplay: callers invoke speakText.
 */
window.APP = window.APP || {};

APP.tts = (function () {

  var supported = 'speechSynthesis' in window;
  var voicesCache = [];

  function refreshVoices() {
    if (!supported) { return; }
    voicesCache = window.speechSynthesis.getVoices() || [];
  }

  if (supported) {
    refreshVoices();
    // Voices load asynchronously on many browsers.
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }

  function isSupported() { return supported; }

  function getAvailableVoices() {
    if (!voicesCache.length) { refreshVoices(); }
    return voicesCache;
  }

  /**
   * Pick the best English voice for the requested accent, with graceful
   * fallback to any English voice (section 24).
   * @param {string} accent 'US' | 'UK'
   */
  function getPreferredEnglishVoice(accent) {
    var voices = getAvailableVoices();
    var lang = APP.config.accentLang[accent] || 'en-US';
    var lower = lang.toLowerCase();

    // 1) exact lang match
    var exact = voices.filter(function (v) { return v.lang && v.lang.toLowerCase() === lower; });
    if (exact.length) { return exact[0]; }

    // 2) same region prefix (en-GB -> en-gb...)
    var region = lower.split('-')[1];
    if (region) {
      var byRegion = voices.filter(function (v) {
        return v.lang && v.lang.toLowerCase().indexOf('en-' + region) === 0;
      });
      if (byRegion.length) { return byRegion[0]; }
    }

    // 3) any English voice
    var anyEnglish = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf('en') === 0; });
    if (anyEnglish.length) { return anyEnglish[0]; }

    return null;
  }

  /** Cancel any current or queued speech. */
  function stopSpeech() {
    if (supported) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * Speak the given text.
   * @param {string} text
   * @param {{accent?: string, rate?: number}} options
   */
  function speakText(text, options) {
    if (!supported || !text) { return false; }
    options = options || {};
    stopSpeech(); // prevent overlapping instances / restart from beginning

    var utter = new SpeechSynthesisUtterance(text);
    utter.rate = options.rate || 1.0;
    var voice = getPreferredEnglishVoice(options.accent || 'US');
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      utter.lang = APP.config.accentLang[options.accent] || 'en-US';
    }
    window.speechSynthesis.speak(utter);
    return true;
  }

  return {
    isSupported: isSupported,
    getAvailableVoices: getAvailableVoices,
    getPreferredEnglishVoice: getPreferredEnglishVoice,
    speakText: speakText,
    stopSpeech: stopSpeech
  };
})();