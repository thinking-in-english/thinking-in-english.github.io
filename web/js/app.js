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
    APP.data.loadLessons()
      .then(function () {
        APP.ui.goHome();
      })
      .catch(function (err) {
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
            voiceURI: APP.state.settings.voiceURI
          });
        }
        break;
      case 'listen-slow':
        if (q) {
          APP.tts.speakText(q.english, {
            accent: APP.state.settings.accent,
            rate: 0.75,
            voiceURI: APP.state.settings.voiceURI
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

      // Show / hide the Vietnamese prompt after the answer is revealed.
      case 'toggle-vi':
        APP.ui.toggleViPrompt();
        break;

      // Completion
      case 'practice-again':
        APP.ui.practiceAgain();
        break;
      case 'back-to-lessons':
        APP.ui.renderLessons();
        break;
    }
  }

  // Brief visual confirmation on assessment buttons.
  function flash(btn, text) {
    var original = btn.textContent;
    btn.textContent = text;
    setTimeout(function () { btn.textContent = original; }, 900);
  }

  // ---- Settings drawer (accent + speed) -----------------------------------

  function wireSettings() {
    var fab = document.getElementById('settingsFab');
    var drawer = document.getElementById('settingsDrawer');
    var backdrop = document.getElementById('drawerBackdrop');
    var closeBtn = document.getElementById('closeDrawerBtn');
    var accent = document.getElementById('accentSelect');
    var speed = document.getElementById('speedSelect');
    var voice = document.getElementById('voiceSelect');

    accent.value = APP.state.settings.accent;
    speed.value = String(APP.state.settings.rate);

    function open() {
      populateVoices();  // voices load asynchronously; refresh each time
      drawer.hidden = false; backdrop.hidden = false;
    }
    function close() { drawer.hidden = true; backdrop.hidden = true; }

    fab.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    accent.addEventListener('change', function () {
      APP.state.settings.accent = accent.value;
      APP.progress.setAccent(accent.value);
    });
    speed.addEventListener('change', function () {
      var r = parseFloat(speed.value);
      APP.state.settings.rate = r;
      APP.progress.setRate(r);
    });
    voice.addEventListener('change', function () {
      var v = voice.value || null;
      APP.state.settings.voiceURI = v;
      APP.progress.setVoiceURI(v);
    });

    function populateVoices() {
      var voices = APP.tts.listEnglishVoices();
      var current = APP.state.settings.voiceURI || '';
      var currentStillAvailable = current && voices.some(function (v) { return v.voiceURI === current; });
      voice.innerHTML = '<option value="">Auto (best available)</option>' +
        voices.map(function (v) {
          var sel = v.voiceURI === current ? ' selected' : '';
          var label = v.name + ' (' + v.lang + ')';
          return '<option value="' + v.voiceURI.replace(/"/g, '&quot;') + '"' + sel + '>' + label + '</option>';
        }).join('');
      if (!currentStillAvailable) { voice.value = ''; }
    }

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
  }

  // Kick off once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();