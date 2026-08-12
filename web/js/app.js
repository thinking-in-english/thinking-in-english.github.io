/**
 * App — bootstrap and event wiring.
 * Loads lesson data once, then hooks up all UI interactions. Uses event
 * delegation for the many data-action buttons to keep listeners minimal.
 */
(function () {

  function init() {
    wireStaticControls();
    wireSettings();
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
      case 'replay':
        if (q) {
          APP.tts.speakText(q.english, {
            accent: APP.state.settings.accent,
            rate: APP.state.settings.rate
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

      // Self assessment (temporary session state only)
      case 'got-it':
        APP.ui.recordAssessment('got');
        flash(target, '✅ Marked as mastered');
        break;
      case 'need-practice':
        APP.ui.recordAssessment('practice');
        flash(target, '🔄 Marked for practice');
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

    accent.value = APP.state.settings.accent;
    speed.value = String(APP.state.settings.rate);

    function open() { drawer.hidden = false; backdrop.hidden = false; }
    function close() { drawer.hidden = true; backdrop.hidden = true; }

    fab.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    accent.addEventListener('change', function () {
      APP.state.settings.accent = accent.value;
    });
    speed.addEventListener('change', function () {
      APP.state.settings.rate = parseFloat(speed.value);
    });
  }

  // Kick off once the DOM is ready.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();