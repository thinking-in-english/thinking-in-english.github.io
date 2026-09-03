/**
 * TTS — browser SpeechSynthesis wrapper (sections 22-27).
 * Kept separate from flashcard logic. No autoplay: callers invoke speakText.
 */
window.APP = window.APP || {};

APP.tts = (function () {

  var supported = 'speechSynthesis' in window;
  var voicesCache = [];
  var voicesChangedCb = null;

  function refreshVoices() {
    if (!supported) { return; }
    voicesCache = window.speechSynthesis.getVoices() || [];
  }

  // Let callers (e.g. the settings dropdown) react when the voice list grows.
  // iOS Safari often reveals Enhanced/Premium voices only after the first
  // utterance, so the list can change after the app has already loaded.
  function onVoicesChanged(cb) { voicesChangedCb = cb; }

  function notifyVoicesChanged() {
    refreshVoices();
    if (typeof voicesChangedCb === 'function') {
      try { voicesChangedCb(); } catch (e) {}
    }
  }

  if (supported) {
    refreshVoices();
    // Voices load asynchronously on many browsers.
    window.speechSynthesis.onvoiceschanged = notifyVoicesChanged;
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
    stopGoogle();
  }

  /**
   * Speak the given text.
   * @param {string} text
   * @param {{accent?: string, rate?: number, voiceURI?: string, googleApiKey?: string, googleVoice?: string}} options
   */
  function speakText(text, options) {
    if (!text) { return false; }
    options = options || {};

    // If the user has configured Google Cloud TTS, prefer it — much more
    // natural than the built-in browser voices on iOS.
    if (options.googleApiKey && options.googleVoice) {
      googleSpeak(text, options).catch(function (err) {
        // Fall back to built-in TTS so a bad key doesn't leave the user silent.
        try { console.warn('[tts] Google failed, falling back:', err); } catch (e) {}
        localSpeak(text, options);
      });
      return true;
    }
    return localSpeak(text, options);
  }

  function localSpeak(text, options) {
    if (!supported) { return false; }
    var voice = findVoice(options.voiceURI) || getPreferredEnglishVoice(options.accent || 'US');
    var lang = voice ? voice.lang : (APP.config.accentLang[options.accent] || 'en-US');
    var rate = options.rate || 1.0;

    // Split at sentence/clause punctuation so the engine inserts a natural
    // pause between chunks — otherwise many voices read straight through
    // commas and periods, sounding flat and robotic.
    var chunks = splitIntoClauses(text);

    function makeUtter(str) {
      var u = new SpeechSynthesisUtterance(str);
      u.rate = rate;
      if (voice) { u.voice = voice; }
      u.lang = lang;
      return u;
    }

    function speakAll() {
      chunks.forEach(function (c) { window.speechSynthesis.speak(makeUtter(c)); });
    }

    // Chrome bug: speak() right after cancel() sometimes never fires. Only
    // delay when we actually need to interrupt, otherwise call directly so
    // iOS Safari keeps the user-gesture link and plays on the first press.
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      stopSpeech();
      setTimeout(speakAll, 60);
    } else {
      speakAll();
    }
    // iOS Safari may only expose Enhanced/Premium voices after the first
    // utterance — re-read the list shortly after so the picker can update.
    setTimeout(notifyVoicesChanged, 400);
    return true;
  }

  // ---- Google Cloud TTS ---------------------------------------------------
  // Uses the user's own API key so the app owner is never billed. Audio is
  // cached per (voice, rate, text) so the same sentence is only fetched once
  // per session.

  // Curated English voice list (Neural2 & WaveNet — the natural-sounding tiers).
  var GOOGLE_VOICES = [
    { id: 'en-US-Neural2-F', label: 'US Female · Neural2', lang: 'en-US' },
    { id: 'en-US-Neural2-C', label: 'US Female · Neural2 (warm)', lang: 'en-US' },
    { id: 'en-US-Neural2-D', label: 'US Male · Neural2', lang: 'en-US' },
    { id: 'en-US-Neural2-J', label: 'US Male · Neural2 (deep)', lang: 'en-US' },
    { id: 'en-US-Wavenet-F', label: 'US Female · WaveNet', lang: 'en-US' },
    { id: 'en-US-Wavenet-D', label: 'US Male · WaveNet', lang: 'en-US' },
    { id: 'en-GB-Neural2-A', label: 'UK Female · Neural2', lang: 'en-GB' },
    { id: 'en-GB-Neural2-C', label: 'UK Female · Neural2 (warm)', lang: 'en-GB' },
    { id: 'en-GB-Neural2-B', label: 'UK Male · Neural2', lang: 'en-GB' },
    { id: 'en-GB-Neural2-D', label: 'UK Male · Neural2 (deep)', lang: 'en-GB' },
    { id: 'en-GB-Wavenet-A', label: 'UK Female · WaveNet', lang: 'en-GB' },
    { id: 'en-GB-Wavenet-B', label: 'UK Male · WaveNet', lang: 'en-GB' },
    { id: 'en-AU-Neural2-A', label: 'AU Female · Neural2', lang: 'en-AU' },
    { id: 'en-AU-Neural2-B', label: 'AU Male · Neural2', lang: 'en-AU' }
  ];

  function listGoogleVoices() { return GOOGLE_VOICES.slice(); }
  function findGoogleVoice(id) {
    for (var i = 0; i < GOOGLE_VOICES.length; i++) {
      if (GOOGLE_VOICES[i].id === id) { return GOOGLE_VOICES[i]; }
    }
    return null;
  }

  var googleAudioCache = {}; // key -> objectURL
  var googleAudio = null;    // currently playing HTMLAudioElement

  function stopGoogle() {
    if (googleAudio) {
      try { googleAudio.pause(); } catch (e) {}
      googleAudio.src = '';
      googleAudio = null;
    }
  }

  function googleSpeak(text, options) {
    var voiceId = options.googleVoice;
    var voice = findGoogleVoice(voiceId);
    if (!voice) { return Promise.reject(new Error('unknown-voice')); }
    var rate = options.rate || 1.0;
    var cacheKey = voiceId + '|' + rate + '|' + text;

    var urlPromise = googleAudioCache[cacheKey]
      ? Promise.resolve(googleAudioCache[cacheKey])
      : fetchGoogleAudio(text, voice, rate, options.googleApiKey).then(function (url) {
          googleAudioCache[cacheKey] = url;
          return url;
        });

    return urlPromise.then(function (url) {
      stopSpeech();
      stopGoogle();
      googleAudio = new Audio(url);
      googleAudio.playbackRate = 1.0; // rate already baked into the audio
      return googleAudio.play();
    });
  }

  function fetchGoogleAudio(text, voice, rate, apiKey) {
    var endpoint = 'https://texttospeech.googleapis.com/v1/text:synthesize?key=' + encodeURIComponent(apiKey);
    var body = {
      input: { text: text },
      voice: { languageCode: voice.lang, name: voice.id },
      audioConfig: { audioEncoding: 'MP3', speakingRate: rate }
    };
    return fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) { return r.text().then(function (t) { throw new Error('http ' + r.status + ': ' + t); }); }
      return r.json();
    }).then(function (data) {
      if (!data || !data.audioContent) { throw new Error('empty-audio'); }
      return 'data:audio/mp3;base64,' + data.audioContent;
    });
  }

  function isGoogleEnabled(options) {
    return !!(options && options.googleApiKey && options.googleVoice);
  }

  /**
   * Break text into speakable clauses, keeping the trailing punctuation so
   * intonation is preserved. Queued as separate utterances, the boundaries
   * become audible pauses.
   */
  function splitIntoClauses(text) {
    var parts = String(text).match(/[^.!?;,:]+[.!?;,:]*\s*/g);
    if (!parts) { return [String(text)]; }
    var chunks = parts
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
    return chunks.length ? chunks : [String(text)];
  }

  return {
    isSupported: isSupported,
    getAvailableVoices: getAvailableVoices,
    getPreferredEnglishVoice: getPreferredEnglishVoice,
    listEnglishVoices: listEnglishVoices,
    getVoiceLabel: getVoiceLabel,
    findVoice: findVoice,
    speakText: speakText,
    stopSpeech: stopSpeech,
    onVoicesChanged: onVoicesChanged,
    listGoogleVoices: listGoogleVoices,
    findGoogleVoice: findGoogleVoice,
    isGoogleEnabled: isGoogleEnabled
  };
})();