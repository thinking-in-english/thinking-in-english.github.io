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
   * Prefers voices with "Google", "Neural", "Natural", "Premium" or "Enhanced"
   * in the name since those sound noticeably less robotic than the default.
   * @param {string} accent 'US' | 'UK'
   */
  function getPreferredEnglishVoice(accent) {
    var voices = getAvailableVoices();
    var lang = APP.config.accentLang[accent] || 'en-US';
    var lower = lang.toLowerCase();
    var qualityRe = /(google|neural|natural|premium|enhanced|siri|samantha|alex|serena|karen|daniel)/i;

    function best(list) {
      var good = list.filter(function (v) { return qualityRe.test(v.name); });
      return good[0] || list[0] || null;
    }

    // 1) exact lang match
    var exact = voices.filter(function (v) { return v.lang && v.lang.toLowerCase() === lower; });
    if (exact.length) { return best(exact); }

    // 2) same region prefix (en-GB -> en-gb...)
    var region = lower.split('-')[1];
    if (region) {
      var byRegion = voices.filter(function (v) {
        return v.lang && v.lang.toLowerCase().indexOf('en-' + region) === 0;
      });
      if (byRegion.length) { return best(byRegion); }
    }

    // 3) any English voice
    var anyEnglish = voices.filter(function (v) { return v.lang && v.lang.toLowerCase().indexOf('en') === 0; });
    if (anyEnglish.length) { return best(anyEnglish); }

    return null;
  }

  /** Return all English voices for a settings picker, sorted with quality first. */
  // Old macOS/iOS novelty voices that are actually sound effects rather than
  // usable speech (Bad News, Bells, Boing, etc.). We hide these from the picker.
  var NOVELTY_NAMES = new Set([
    'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos',
    'deranged', 'good news', 'hysterical', 'jester', 'organ', 'pipe organ',
    'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox'
  ]);

  function isRealSpeechVoice(v) {
    return v && v.name && !NOVELTY_NAMES.has(v.name.trim().toLowerCase());
  }

  /**
   * Detect the quality tier from voiceURI so we can distinguish duplicate names
   * (e.g. "Samantha" appears once as Compact and again as Enhanced on iOS).
   * @return {'Premium'|'Enhanced'|'Neural'|'Natural'|'Siri'|'Google'|'Compact'|''}
   */
  function getVoiceQualityTag(v) {
    if (!v) { return ''; }
    var s = ((v.voiceURI || '') + ' ' + (v.name || '')).toLowerCase();
    if (s.indexOf('premium') !== -1) { return 'Premium'; }
    if (s.indexOf('enhanced') !== -1) { return 'Enhanced'; }
    if (s.indexOf('neural') !== -1) { return 'Neural'; }
    if (s.indexOf('natural') !== -1) { return 'Natural'; }
    if (s.indexOf('google') !== -1) { return 'Google'; }
    if (s.indexOf('siri') !== -1) { return 'Siri'; }
    if (s.indexOf('compact') !== -1) { return 'Compact'; }
    return '';
  }

  /** Human-readable label for the settings dropdown. */
  function getVoiceLabel(v) {
    var tag = getVoiceQualityTag(v);
    return v.name + ' (' + v.lang + ')' + (tag ? ' · ' + tag : '');
  }

  function listEnglishVoices() {
    var voices = getAvailableVoices().filter(function (v) {
      return v.lang && v.lang.toLowerCase().indexOf('en') === 0 && isRealSpeechVoice(v);
    });
    // Deduplicate identical (name + lang + quality) — some iOS versions list
    // the same voice more than once via slightly different voiceURIs.
    var seen = new Set();
    voices = voices.filter(function (v) {
      var key = v.name.toLowerCase() + '|' + v.lang.toLowerCase() + '|' + getVoiceQualityTag(v);
      if (seen.has(key)) { return false; }
      seen.add(key);
      return true;
    });
    // Sort by quality first (Premium/Enhanced/Neural/... > plain), then by name.
    var qualityOrder = { Premium: 0, Enhanced: 1, Neural: 2, Natural: 3, Google: 4, Siri: 5, Compact: 8, '': 9 };
    voices.sort(function (a, b) {
      var qa = qualityOrder[getVoiceQualityTag(a)];
      var qb = qualityOrder[getVoiceQualityTag(b)];
      if (qa !== qb) { return qa - qb; }
      return a.name.localeCompare(b.name);
    });
    return voices;
  }

  /** Look up a voice by its voiceURI (or name). */
  function findVoice(voiceURI) {
    if (!voiceURI) { return null; }
    var voices = getAvailableVoices();
    return voices.find(function (v) { return v.voiceURI === voiceURI || v.name === voiceURI; }) || null;
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

    var utter = new SpeechSynthesisUtterance(text);
    utter.rate = options.rate || 1.0;
    var voice = findVoice(options.voiceURI) || getPreferredEnglishVoice(options.accent || 'US');
    if (voice) {
      utter.voice = voice;
      utter.lang = voice.lang;
    } else {
      utter.lang = APP.config.accentLang[options.accent] || 'en-US';
    }
    // Chrome bug: speak() right after cancel() sometimes never fires. Only
    // delay when we actually need to interrupt, otherwise call directly so
    // iOS Safari keeps the user-gesture link and plays on the first press.
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      stopSpeech();
      setTimeout(function () { window.speechSynthesis.speak(utter); }, 60);
    } else {
      window.speechSynthesis.speak(utter);
    }
    return true;
  }

  return {
    isSupported: isSupported,
    getAvailableVoices: getAvailableVoices,
    getPreferredEnglishVoice: getPreferredEnglishVoice,
    listEnglishVoices: listEnglishVoices,
    getVoiceLabel: getVoiceLabel,
    findVoice: findVoice,
    speakText: speakText,
    stopSpeech: stopSpeech
  };
})();