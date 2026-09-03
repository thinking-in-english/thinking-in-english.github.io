/**
 * App — bootstrap and event wiring.
 * Loads lesson data once, then hooks up all UI interactions. Uses event
 * delegation for the many data-action buttons to keep listeners minimal.
 */
(function () {

  function init() {
    wireStaticControls();
    wireSettings();
    wireProgress();
    loadData();
  }

  // ---- Data loading with loading / error / retry states --------------------

  function loadData() {
    APP.ui.showScreen('loading', false);
    var loadingText = document.getElementById('loadingText');
    if (loadingText) { loadingText.textContent = 'Loading lessons…'; }
    // If the fetch takes unusually long, tell the user it's still trying so
    // they don't think the app is frozen.
    var slowHint = setTimeout(function () {
      if (loadingText) { loadingText.textContent = 'Still loading… backend may be slow.'; }
    }, 8000);
    APP.data.loadLessons()
      .then(function () {
        clearTimeout(slowHint);
        APP.ui.goHome();
      })
      .catch(function (err) {
        clearTimeout(slowHint);
        var msg = (err && err.message) ? err.message : 'Unable to load lessons.';
        document.getElementById('errorText').textContent = msg || 'Unable to load lessons.';
        APP.ui.showScreen('error', false);
      });
  }

  // ---- Static / persistent controls ---------------------------------------

  function wireStaticControls() {
    document.getElementById('backBtn').addEventListener('click', APP.ui.goBack);
    document.getElementById('retryBtn').addEventListener('click', loadData);

    // Home mode cards + all data-action buttons via delegation.
    document.getElementById('app').addEventListener('click', onActionClick);

    // Review setup: recompute availability when range changes.
    document.getElementById('reviewFrom').addEventListener('change', APP.ui.updateReviewAvailable);
    document.getElementById('reviewTo').addEventListener('change', APP.ui.updateReviewAvailable);
    document.getElementById('startReviewBtn').addEventListener('click', APP.ui.startReviewSession);

    // Typing in the custom count auto-selects the "Enter a number" radio.
    var customInput = document.getElementById('reviewCustomCount');
    if (customInput) {
      customInput.addEventListener('focus', function () {
        var r = document.querySelector('input[name="reviewCountMode"][value="custom"]');
        if (r) { r.checked = true; }
        document.getElementById('reviewCountError').hidden = true;
      });
      customInput.addEventListener('input', function () {
        document.getElementById('reviewCountError').hidden = true;
      });
    }
    document.querySelectorAll('input[name="reviewCountMode"]').forEach(function (r) {
      r.addEventListener('change', function () {
        document.getElementById('reviewCountError').hidden = true;
      });
    });

    // Mastered toggle: syncs to persistent progress on change.
    var mInput = document.getElementById('masteredInput');
    if (mInput) {
      mInput.addEventListener('change', function () {
        APP.ui.setMasteredForCurrent(mInput.checked);
      });
    }

    // Warn before accidental page unload during a session.
    window.addEventListener('beforeunload', function (e) {
      if (APP.state.session && currentScreenIsSession()) {
        APP.ui.endSessionCleanup();
        e.preventDefault();
        e.returnValue = '';
      }
    });

    // Release the mic (recorder + speech) only when the app is backgrounded.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { releaseMic(); }
    });
    window.addEventListener('pagehide', function () { releaseMic(); });
  }

  function releaseMic() {
    try { APP.recorder.cleanup(); } catch (e) {}
    try { APP.speech.abort(); } catch (e) {}
    try { APP.tts.stopSpeech(); } catch (e) {}
    var ui = APP.ui;
    if (ui && typeof ui.resetRecordingUI === 'function') {
      try { ui.resetRecordingUI(); } catch (e) {}
    }
  }

  function currentScreenIsSession() {
    var s = document.getElementById('screen-session');
    return s && !s.hidden;
  }

  /**
   * Central handler for every [data-action] button.
   */
  function onActionClick(evt) {
    var target = evt.target.closest('[data-action]');
    if (!target) { return; }
    var action = target.dataset.action;
    var q = APP.ui.currentQuestion();

    switch (action) {
      case 'go-practice-lessons':
        APP.ui.renderLessons();
        break;
      case 'go-review-setup':
        APP.ui.renderReviewSetup();
        break;

      // Flashcard primary button toggles between reveal and next.
      case 'show-answer':
        APP.ui.revealAnswer();
        break;
      case 'next':
        APP.ui.nextQuestion();
        break;
      // Skip to next without revealing the answer.
      case 'skip-next':
        APP.ui.nextQuestion();
        break;

      // Pre-reveal Speak & Check
      case 'speak-check':
        APP.ui.onSpeakCheck();
        break;

      // TTS
      case 'listen':
        if (q) {
          APP.tts.speakText(q.english, {
            accent: APP.state.settings.accent,
            rate: APP.state.settings.rate,
            voiceURI: APP.state.settings.voiceURI,
            googleApiKey: APP.state.settings.googleApiKey,
            googleVoice: APP.state.settings.googleVoice
          });
        }
        break;

      // Recording
      case 'record':
        APP.ui.onRecordStart();
        break;
      case 'stop-record':
        APP.ui.onRecordStop();
        break;
      case 'play-recording':
        APP.recorder.play();
        break;
      case 'record-again':
        APP.ui.onRecordStart();
        break;

      // More info popup (shown only when this question has extra content)
      case 'more-info':
        APP.ui.showMoreInfo();
        break;

      // Return from the answer view back to the pre-reveal question state.
      case 'back-to-question':
        APP.ui.backToQuestion();
        break;

      // Completion
      case 'practice-again':
        APP.ui.practiceAgain();
        break;
      case 'back-to-lessons':
        APP.ui.renderLessons();
        break;
      case 'back-to-review':
        APP.ui.renderReviewSetup();
        break;
    }
  }

  // Brief visual confirmation on assessment buttons.
  function flash(btn, text) {
    var original = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = original; }, 900);
  }

  // ---- Settings drawer (speed + voice) ------------------------------------

  function wireSettings() {
    var fab = document.getElementById('settingsFab');
    var drawer = document.getElementById('settingsDrawer');
    var backdrop = document.getElementById('drawerBackdrop');
    var closeBtn = document.getElementById('closeDrawerBtn');
    var speed = document.getElementById('speedSelect');
    var voice = document.getElementById('voiceSelect');
    var googleKeyInput = document.getElementById('googleApiKeyInput');
    var googleVoiceField = document.getElementById('googleVoiceField');
    var googleVoiceSel = document.getElementById('googleVoiceSelect');

    speed.value = String(APP.state.settings.rate);
    googleKeyInput.value = APP.state.settings.googleApiKey || '';

    function open() {
      populateVoices();
      populateGoogleVoices();
      updateGoogleVisibility();
      drawer.hidden = false; backdrop.hidden = false;
    }
    function close() {
      APP.tts.stopSpeech();  // stop any voice preview still playing
      drawer.hidden = true; backdrop.hidden = true;
    }

    fab.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    speed.addEventListener('change', function () {
      var r = parseFloat(speed.value);
      APP.state.settings.rate = r;
      APP.progress.setRate(r);
    });
    voice.addEventListener('change', function () {
      var v = voice.value || null;
      APP.state.settings.voiceURI = v;
      APP.progress.setVoiceURI(v);
      previewVoice();
    });

    googleKeyInput.addEventListener('change', function () {
      var k = (googleKeyInput.value || '').trim();
      APP.state.settings.googleApiKey = k;
      APP.progress.setGoogleApiKey(k);
      updateGoogleVisibility();
    });
    googleVoiceSel.addEventListener('change', function () {
      var v = googleVoiceSel.value || '';
      APP.state.settings.googleVoice = v;
      APP.progress.setGoogleVoice(v);
      previewVoice();
    });

    function updateGoogleVisibility() {
      var hasKey = !!(APP.state.settings.googleApiKey || '').trim();
      googleVoiceField.hidden = !hasKey;
    }

    function previewVoice() {
      APP.tts.speakText('Hello. This is a preview of the English voice.', {
        accent: APP.state.settings.accent,
        rate: APP.state.settings.rate,
        voiceURI: APP.state.settings.voiceURI,
        googleApiKey: APP.state.settings.googleApiKey,
        googleVoice: APP.state.settings.googleVoice
      });
    }

    function populateVoices() {
      var voices = APP.tts.listEnglishVoices();
      var current = APP.state.settings.voiceURI || '';
      var options = [{ value: '', label: 'Auto (best available)' }].concat(
        voices.map(function (v) {
          return { value: v.voiceURI, label: APP.tts.getVoiceLabel(v) };
        })
      );
      var currentStillAvailable = current && voices.some(function (v) { return v.voiceURI === current; });
      APP.csel.setOptions('voiceSel', 'voiceSelect', options, currentStillAvailable ? current : '');
    }

    function populateGoogleVoices() {
      var voices = APP.tts.listGoogleVoices();
      var current = APP.state.settings.googleVoice || '';
      var options = [{ value: '', label: 'Off (use device voice)' }].concat(
        voices.map(function (v) { return { value: v.id, label: v.label }; })
      );
      APP.csel.setOptions('googleVoiceSel', 'googleVoiceSelect', options, current);
    }

    // iOS Safari may reveal Enhanced/Premium voices only after the first
    // utterance; re-populate the picker live when the voice list changes.
    APP.tts.onVoicesChanged(function () {
      if (!drawer.hidden) { populateVoices(); }
    });

    document.getElementById('resetProgressBtn').addEventListener('click', function () {
      APP.modal.confirm({
        icon: '🗑️',
        title: 'Reset progress?',
        message: 'This clears every "Mastered" mark. Questions you\'ve mastered will appear again on your next practice.',
        okLabel: 'Reset',
        cancelLabel: 'Cancel',
        danger: true
      }).then(function (ok) {
        if (!ok) { return; }
        APP.progress.resetAll();
        close();
        APP.modal.notice({ icon: '✅', title: 'Progress reset', message: 'All mastered marks have been cleared.' });
      });
    });
  }

  // ---- Home-screen "Include mastered questions" toggle --------------------

  function wireProgress() {
    var toggle = document.getElementById('includeMasteredToggle');
    toggle.checked = APP.progress.getIncludeMastered();
    toggle.addEventListener('change', function () {
      APP.progress.setIncludeMastered(toggle.checked);
    });

    var randomToggle = document.getElementById('randomOrderToggle');
    if (randomToggle) {
      randomToggle.checked = APP.progress.getRandomOrder();
      randomToggle.addEventListener('change', function () {
        APP.progress.setRandomOrder(randomToggle.checked);
      });
    }
  }

  // Kick off once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();