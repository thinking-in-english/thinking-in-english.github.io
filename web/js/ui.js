/**
 * UI — screen navigation, rendering, and session control.
 *
 * Screens are plain sections in Index.html; showScreen() toggles them.
 * A small nav stack powers the Back button. Session logic lives here but
 * delegates randomization to APP.utils and audio to the tts/recorder/speech
 * modules, keeping concerns separated (section 42).
 */
window.APP = window.APP || {};

APP.ui = (function () {

  var navStack = [];       // screen history for Back
  var currentScreen = null;

  // ---- Screen manager ------------------------------------------------------

  function screenEl(name) {
    return document.getElementById('screen-' + name);
  }

  /**
   * Show a screen. `push` controls whether it enters the Back history.
   */
  function showScreen(name, push) {
    document.querySelectorAll('.screen').forEach(function (s) { s.hidden = true; });
    var el = screenEl(name);
    if (el) { el.hidden = false; }

    if (push !== false && currentScreen && currentScreen !== name) {
      navStack.push(currentScreen);
    }
    currentScreen = name;

    // Re-sync home-screen widgets whenever we land here, so Back preserves state.
    if (name === 'home') {
      var toggle = document.getElementById('includeMasteredToggle');
      if (toggle) { toggle.checked = APP.progress.getIncludeMastered(); }
    }
    // Re-sync the Random-order toggle when returning to the lesson list.
    if (name === 'lessons') {
      var rnd = document.getElementById('randomOrderToggle');
      if (rnd) { rnd.checked = APP.progress.getRandomOrder(); }
    }
    // Settings FAB is only for Home — hide it elsewhere so it doesn't cover content.
    var fab = document.getElementById('settingsFab');
    if (fab) { fab.hidden = name !== 'home'; }
    updateBackButton();
  }

  function updateBackButton() {
    var back = document.getElementById('backBtn');
    if (currentScreen === 'home' || currentScreen === 'loading' || currentScreen === 'error') {
      back.hidden = true;
      return;
    }
    back.hidden = false;
    // Top-level mode entry screens: single Home button (clear nav history).
    if (currentScreen === 'lessons' || currentScreen === 'review' || currentScreen === 'complete') {
      back.innerHTML = '🏠';
      back.setAttribute('aria-label', 'Home');
    } else {
      back.innerHTML = '&#8592;';
      back.setAttribute('aria-label', 'Back');
    }
  }

  /**
   * Back navigation. From top-level mode screens (lessons / review) always goes
   * Home so the button always feels correct even if the history is polluted
   * (e.g. after "Back to Lessons" from the completion screen). Confirms before
   * abandoning an active session (section 39).
   */
  function goBack() {
    if (currentScreen === 'lessons' || currentScreen === 'review' || currentScreen === 'complete') {
      goHome();
      return;
    }
    if (currentScreen === 'session') {
      APP.modal.confirm({
        icon: '👋',
        title: 'Leave this session?',
        message: 'Your progress in this session will be lost. You can always start a new one.',
        okLabel: 'Leave',
        cancelLabel: 'Keep practicing',
        danger: true
      }).then(function (ok) {
        if (!ok) { return; }
        endSessionCleanup();
        if (navStack.length) {
          var prev = navStack.pop();
          showScreen(prev, false);
        } else {
          goHome();
        }
      });
      return;
    }
    if (!navStack.length) { goHome(); return; }
    var prev = navStack.pop();
    showScreen(prev, false);
  }

  // ---- Home / mode selection ----------------------------------------------

  function goHome() {
    navStack = [];
    showScreen('home', false);
  }

  // ---- Practice by Lesson --------------------------------------------------

  function renderLessons() {
    var list = document.getElementById('lessonList');
    list.innerHTML = '';

    if (!APP.state.lessons.length) {
      list.innerHTML = '<p class="muted">No lessons found in the spreadsheet.</p>';
    }

    APP.state.lessons.forEach(function (lesson) {
      var btn = document.createElement('button');
      btn.className = 'lesson-item';
      var include = APP.progress.getIncludeMastered();
      var masteredCount = APP.progress.countMasteredIn(lesson.questions);
      var practicable = include ? lesson.questionCount : lesson.questionCount - masteredCount;
      var empty = lesson.questionCount === 0;
      var allDone = !empty && !include && practicable === 0;
      if (empty) { btn.setAttribute('disabled', 'disabled'); }

      var badgeCls = empty ? ' zero' : (allDone ? ' done' : '');
      var badgeText = empty
        ? '0 questions'
        : (allDone
            ? '🎉 all mastered'
            : (masteredCount > 0
                ? practicable + ' / ' + lesson.questionCount + ' questions'
                : lesson.questionCount + ' questions'));

      var sub = empty
        ? 'No practice questions yet'
        : (allDone
            ? 'Turn on "Include mastered" to review'
            : (masteredCount > 0
                ? masteredCount + ' mastered · tap to practice the rest'
                : 'Tap to practice all questions'));

      btn.innerHTML =
        '<span class="lesson-main">' +
          '<span class="lesson-name">Lesson ' + lesson.lessonNumber + ' — ' + escapeHtml(lesson.title) + '</span>' +
          '<span class="lesson-sub">' + sub + '</span>' +
        '</span>' +
        '<span class="lesson-count' + badgeCls + '">' + badgeText + '</span>';

      if (!empty) {
        btn.addEventListener('click', function () { startLessonSession(lesson.lessonId); });
      }
      list.appendChild(btn);
    });

    showScreen('lessons');
  }

  /**
   * Practice by Lesson: ALL questions, shuffled, no limit (sections 7, 46).
   * When "Include mastered" is OFF, mastered questions are filtered out.
   */
  function startLessonSession(lessonId) {
    var lesson = APP.state.getLessonById(lessonId);
    if (!lesson || lesson.questionCount === 0) {
      APP.modal.notice({
        icon: '📭',
        title: 'No questions yet',
        message: "This lesson doesn't contain any practice questions."
      });
      return;
    }
    var all = APP.utils.getAllQuestionsFromLesson(lesson);
    var pool = APP.progress.getIncludeMastered() ? all : APP.progress.filterOutMastered(all);
    if (!pool.length) {
      APP.modal.notice({
        icon: '🎉',
        title: 'All mastered!',
        message: 'You\'ve marked every question in this lesson as mastered. Turn on "Include mastered questions" on the home screen to review them again.'
      });
      return;
    }
    beginSession({
      mode: 'lesson',
      title: 'Lesson ' + lesson.lessonNumber + ' — ' + lesson.title,
      questions: APP.progress.getRandomOrder() ? APP.utils.shuffleQuestions(pool) : pool.slice()
    });
  }

  // ---- Review Multiple Lessons --------------------------------------------

  function renderReviewSetup() {
    var options = APP.state.lessons.map(function (lesson) {
      return {
        value: lesson.lessonNumber,
        label: 'Lesson ' + lesson.lessonNumber + ' — ' + lesson.title
      };
    });
    var first = APP.state.lessons.length ? APP.state.lessons[0].lessonNumber : 0;
    var last = APP.state.lessons.length ? APP.state.lessons[APP.state.lessons.length - 1].lessonNumber : 0;

    APP.csel.setOptions('reviewFromSel', 'reviewFrom', options, first);
    APP.csel.setOptions('reviewToSel', 'reviewTo', options, last);

    // Reset count controls to defaults.
    var customRadio = document.querySelector('input[name="reviewCountMode"][value="custom"]');
    if (customRadio) { customRadio.checked = true; }
    var customInput = document.getElementById('reviewCustomCount');
    if (customInput) { customInput.value = String(APP.config.defaultReviewCount); }
    document.getElementById('reviewCountError').hidden = true;

    updateReviewAvailable();
    showScreen('review');
  }

  /**
   * Update the dynamic "Available questions" count for the chosen range
   * (section 16). Filters out mastered when the toggle is off.
   */
  function updateReviewAvailable() {
    var from = parseInt(document.getElementById('reviewFrom').value, 10);
    var to = parseInt(document.getElementById('reviewTo').value, 10);
    var pool = APP.utils.getQuestionsFromLessonRange(APP.state.lessons, from, to);
    if (!APP.progress.getIncludeMastered()) {
      pool = APP.progress.filterOutMastered(pool);
    }
    document.getElementById('reviewAvailable').textContent = pool.length;
    return pool;
  }

  /**
   * Review: combine range into one pool, shuffle, take requested amount
   * (sections 13-15, 46). Respects the "Include mastered" toggle.
   */
  function startReviewSession() {
    var from = parseInt(document.getElementById('reviewFrom').value, 10);
    var to = parseInt(document.getElementById('reviewTo').value, 10);
    var errorEl = document.getElementById('reviewCountError');
    errorEl.hidden = true;

    var pool = APP.utils.getQuestionsFromLessonRange(APP.state.lessons, from, to);
    if (!APP.progress.getIncludeMastered()) {
      pool = APP.progress.filterOutMastered(pool);
    }
    if (!pool.length) {
      APP.modal.notice({
        icon: '📭',
        title: 'No questions available',
        message: 'No questions to review in the selected range. Try a wider range or turn on "Include mastered questions".'
      });
      return;
    }

    var mode = (document.querySelector('input[name="reviewCountMode"]:checked') || {}).value || 'custom';
    var count;
    if (mode === 'all') {
      count = 'all';
    } else {
      var input = document.getElementById('reviewCustomCount');
      var n = parseInt(input.value, 10);
      if (!n || n < 1) {
        errorEl.textContent = 'Please enter a number of 1 or more.';
        errorEl.hidden = false;
        input.focus();
        return;
      }
      if (n > pool.length) {
        errorEl.textContent = 'Only ' + pool.length + ' question' + (pool.length === 1 ? '' : 's') +
          ' available. Enter a smaller number or pick "All questions".';
        errorEl.hidden = false;
        input.focus();
        return;
      }
      count = n;
    }

    var questions = APP.utils.getRandomQuestions(pool, count);
    beginSession({
      mode: 'review',
      title: 'Review Lessons ' + Math.min(from, to) + '–' + Math.max(from, to),
      questions: questions
    });
  }

  // ---- Session / flashcard -------------------------------------------------

  function beginSession(session) {
    session.index = 0;
    session.revealed = false;
    session.results = {};
    APP.state.session = session;
    showScreen('session');
    renderCurrentQuestion();
  }

  function currentQuestion() {
    var s = APP.state.session;
    return s ? s.questions[s.index] : null;
  }

  function renderCurrentQuestion() {
    var s = APP.state.session;
    if (!s) { return; }

    // Cleanup previous question's audio (section 30).
    APP.tts.stopSpeech();
    APP.recorder.cleanup();

    var q = s.questions[s.index];
    var total = s.questions.length;

    document.getElementById('progressText').textContent =
      'Question ' + (s.index + 1) + ' / ' + total;
    document.getElementById('progressFill').style.width =
      ((s.index) / total * 100) + '%';

    document.getElementById('viPrompt').textContent = q.vietnamese;
    var viEl = document.getElementById('viPrompt');
    viEl.classList.remove('collapsed', 'subdued');
    document.getElementById('backToQuestionBtn').hidden = true;
    document.getElementById('enAnswer').textContent = q.english;

    // Reset to hidden-answer state.
    s.revealed = false;
    document.getElementById('answerBlock').hidden = true;

    var primary = document.getElementById('primaryActionBtn');
    primary.textContent = 'Show Answer';
    primary.dataset.action = 'show-answer';
    // Skip appears pre-reveal so users can jump ahead without seeing the answer.
    var skip = document.getElementById('skipToNextBtn');
    if (skip) {
      skip.hidden = false;
      skip.textContent = isLastQuestion() ? 'Finish' : 'Skip →';
    }

    resetPreCheckUI();
    resetRecordingUI();
  }

  function revealAnswer() {
    var s = APP.state.session;
    if (!s || s.revealed) { return; }
    s.revealed = true;
    document.getElementById('answerBlock').hidden = false;
    document.getElementById('preCheckBlock').hidden = true;
    // Hide VN prompt; user can return to the question via Back to question.
    var viEl = document.getElementById('viPrompt');
    viEl.classList.add('collapsed');
    document.getElementById('backToQuestionBtn').hidden = false;

    // TTS availability note (non-blocking).
    document.getElementById('ttsWarn').hidden = APP.tts.isSupported();
    document.getElementById('recWarn').hidden = APP.recorder.isSupported();

    // More info button only when this question has extra content.
    var q = currentQuestion();
    document.getElementById('moreInfoControls').hidden = !(q && q.moreInfo);

    // Sync mastered toggle to current state (persistent across sessions).
    updateMasteredButton();

    var primary = document.getElementById('primaryActionBtn');
    primary.textContent = isLastQuestion() ? 'Finish' : 'Next →';
    primary.dataset.action = 'next';
    var skip = document.getElementById('skipToNextBtn');
    if (skip) { skip.hidden = true; }
  }

  function isLastQuestion() {
    var s = APP.state.session;
    return s && s.index >= s.questions.length - 1;
  }

  function nextQuestion() {
    var s = APP.state.session;
    if (!s) { return; }
    if (isLastQuestion()) {
      completeSession();
      return;
    }
    s.index++;
    renderCurrentQuestion();
  }

  function recordAssessment(kind) {
    var q = currentQuestion();
    if (!q) { return; }
    APP.state.session.results[q.id] = kind;
    if (kind === 'got') {
      APP.progress.markMastered(q.id);
    } else if (kind === 'practice') {
      APP.progress.unmarkMastered(q.id);
    }
  }

  /**
   * Flip the Mastered state for the current question and refresh the button.
   * @return {boolean} the new mastered state
   */
  function toggleMastered() {
    var q = currentQuestion();
    if (!q) { return false; }
    var nowMastered = !APP.progress.isMastered(q.id);
    setMasteredForCurrent(nowMastered);
    return nowMastered;
  }

  /** Apply a mastered value to the current question and sync UI + storage. */
  function setMasteredForCurrent(on) {
    var q = currentQuestion();
    if (!q) { return; }
    if (on) {
      APP.progress.markMastered(q.id);
      APP.state.session.results[q.id] = 'got';
    } else {
      APP.progress.unmarkMastered(q.id);
      delete APP.state.session.results[q.id];
    }
    updateMasteredButton();
  }

  function updateMasteredButton() {
    var input = document.getElementById('masteredInput');
    if (!input) { return; }
    var q = currentQuestion();
    input.checked = q ? APP.progress.isMastered(q.id) : false;
  }

  /**
   * Return from the answer view to the pre-reveal question state on the same
   * question, so the user can try Speak & Check again.
   */
  function backToQuestion() {
    var s = APP.state.session;
    if (!s) { return; }
    APP.tts.stopSpeech();
    APP.recorder.cleanup();
    s.revealed = false;
    document.getElementById('answerBlock').hidden = true;
    document.getElementById('preCheckBlock').hidden = false;
    document.getElementById('viPrompt').classList.remove('collapsed', 'subdued');
    document.getElementById('backToQuestionBtn').hidden = true;
    var primary = document.getElementById('primaryActionBtn');
    primary.textContent = 'Show Answer';
    primary.dataset.action = 'show-answer';
    var skip = document.getElementById('skipToNextBtn');
    if (skip) {
      skip.hidden = false;
      skip.textContent = isLastQuestion() ? 'Finish' : 'Skip →';
    }
    resetPreCheckUI();
  }

  // ---- Completion ----------------------------------------------------------

  function completeSession() {
    var s = APP.state.session;
    var total = s.questions.length;
    endSessionCleanup();

    document.getElementById('completeCount').textContent =
      total + ' / ' + total + ' questions completed.';

    var got = 0;
    Object.keys(s.results).forEach(function (id) {
      if (s.results[id] === 'got') { got++; }
    });
    document.getElementById('completeStats').innerHTML =
      '<span class="stat-pill">✅ Newly mastered: ' + got + '</span>';

    // Adapt the secondary button to where the user came from.
    var secondary = document.getElementById('completeSecondaryBtn');
    if (secondary) {
      if (s.mode === 'review') {
        secondary.textContent = 'Back to Review';
        secondary.dataset.action = 'back-to-review';
      } else {
        secondary.textContent = 'Back to Lessons';
        secondary.dataset.action = 'back-to-lessons';
      }
    }

    // Keep the finished session available for "Practice Again".
    APP.state.lastSession = { mode: s.mode, title: s.title, sourceQuestions: s.questions.slice() };
    showScreen('complete');
  }

  function practiceAgain() {
    var last = APP.state.lastSession;
    if (!last) { goHome(); return; }
    // Review mode is always random. Lesson mode follows the Random-order pref.
    var keepOrder = last.mode === 'lesson' && !APP.progress.getRandomOrder();
    var questions = keepOrder
      ? last.sourceQuestions.slice()
      : APP.utils.shuffleQuestions(last.sourceQuestions);
    beginSession({
      mode: last.mode,
      title: last.title,
      questions: questions
    });
  }

  function endSessionCleanup() {
    APP.tts.stopSpeech();
    APP.recorder.cleanup();
  }

  // ---- Recording UI helpers ------------------------------------------------

  function resetRecordingUI() {
    show('[data-action="record"]', true);
    show('[data-action="stop-record"]', false);
    show('[data-action="play-recording"]', false);
    show('[data-action="record-again"]', false);
    document.getElementById('recStatus').hidden = true;
  }

  function onRecordStart() {
    APP.recorder.start().then(function () {
      show('[data-action="record"]', false);
      show('[data-action="record-again"]', false);
      show('[data-action="play-recording"]', false);
      show('[data-action="stop-record"]', true);
      document.getElementById('recStatus').hidden = false;
    }).catch(function () {
      document.getElementById('recWarn').hidden = false;
    });
  }

  function onRecordStop() {
    APP.recorder.stop().then(function () {
      show('[data-action="stop-record"]', false);
      document.getElementById('recStatus').hidden = true;
      show('[data-action="play-recording"]', true);
      show('[data-action="record-again"]', true);
    });
  }

  // ---- Pre-reveal Speak & Check -------------------------------------------

  function resetPreCheckUI() {
    var block = document.getElementById('preCheckBlock');
    block.hidden = false;
    document.getElementById('preCheckWarn').hidden = APP.speech.isSupported();
    var btn = document.getElementById('speakCheckBtn');
    btn.disabled = !APP.speech.isSupported();
    btn.textContent = '🎤 Speak & Check';
    var box = document.getElementById('preCheckResult');
    box.hidden = true;
    box.className = 'sr-result';
    box.innerHTML = '';
  }

  /**
   * Called from the pre-reveal Speak & Check button.
   * On full match: auto-advance after a short confirmation.
   * Otherwise: show feedback and let the user retry or Show Answer.
   */
  function onSpeakCheck() {
    var q = currentQuestion();
    if (!q) { return; }
    if (!APP.speech.isSupported()) {
      document.getElementById('preCheckWarn').hidden = false;
      return;
    }

    var btn = document.getElementById('speakCheckBtn');
    var box = document.getElementById('preCheckResult');
    btn.disabled = true;
    btn.textContent = '🎧 Listening…';
    box.hidden = false;
    box.className = 'sr-result';
    box.innerHTML = 'Speak the English sentence now.';

    APP.speech.checkSpeech(q.english, APP.state.settings.accent)
      .then(function (r) {
        btn.disabled = false;
        btn.textContent = '🎤 Try Again';
        if (r.status === 'ok') {
          handlePreCheckCorrect(q, r);
        } else {
          renderPreCheckFeedback(r);
        }
      })
      .catch(function (err) {
        btn.disabled = false;
        btn.textContent = '🎤 Try Again';
        box.className = 'sr-result miss';
        box.innerHTML = '<div class="sr-head">' + speechErrorTitle(err) + '</div>' +
                        '<div>' + speechErrorHint(err) + '</div>';
      });
  }

  function speechErrorTitle(err) {
    var code = (err && err.message) || 'unknown';
    if (code === 'no-speech') { return '🤫 Nothing heard'; }
    if (code === 'not-allowed' || code === 'service-not-allowed') { return '🎙️ Microphone blocked'; }
    if (code === 'audio-capture') { return '🎙️ No microphone found'; }
    if (code === 'network') { return '📡 Network issue'; }
    if (code === 'aborted') { return '⏹ Stopped'; }
    return '✗ Couldn\'t capture your speech';
  }

  function speechErrorHint(err) {
    var code = (err && err.message) || 'unknown';
    if (code === 'no-speech') {
      return 'Speak a bit louder and closer to the microphone, then try again.';
    }
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      return 'Google Apps Script iframes block microphone access. See tip below or use Show Answer instead.';
    }
    if (code === 'audio-capture') {
      return 'Please connect a microphone and reload the app.';
    }
    if (code === 'network') {
      return 'Speech recognition needs internet. Check your connection and try again.';
    }
    return 'Try again, or use Show Answer to continue.';
  }

  function handlePreCheckCorrect(q, r) {
    var box = document.getElementById('preCheckResult');
    box.className = 'sr-result ok';
    var hint = q.moreInfo
      ? '<div class="muted" style="font-size:12px;margin-top:6px">💡 Tap Show Answer to read more.</div>'
      : '';
    // Only show what was heard when it wasn't a perfect match, so the user can
    // see which words to work on.
    var heard = r.recognizedText ? String(r.recognizedText).trim() : '';
    var heardLine = (heard && r.matchedCount < r.expectedCount)
      ? '<div style="margin-top:6px;font-size:13px">Heard: "<em>' + escapeHtml(heard) + '</em>"</div>'
      : '';
    var missLine = (r.missing && r.missing.length)
      ? '<div class="muted" style="font-size:12px;margin-top:4px">Missed: ' + escapeHtml(r.missing.join(', ')) + '</div>'
      : '';
    box.innerHTML =
      '<div class="sr-head">✓ Correct!</div>' +
      '<div>' + r.matchedCount + ' / ' + r.expectedCount + ' words recognized.</div>' +
      heardLine +
      missLine +
      '<div style="margin-top:6px;font-weight:600">Correct answer: ' + escapeHtml(q.english) + '</div>' +
      hint;
  }

  function renderPreCheckFeedback(r) {
    var box = document.getElementById('preCheckResult');
    var cls, head;
    if (r.status === 'partial') { cls = 'partial'; head = '△ Almost — try again'; }
    else { cls = 'miss'; head = '✗ Not quite — try again'; }
    box.className = 'sr-result ' + cls;
    var heard = r.recognizedText ? String(r.recognizedText).trim() : '';
    box.innerHTML =
      '<div class="sr-head">' + head + '</div>' +
      '<div>' + r.matchedCount + ' / ' + r.expectedCount + ' expected words recognized.</div>' +
      (heard ? '<div style="margin-top:6px;font-size:13px">Heard: "<em>' + escapeHtml(heard) + '</em>"</div>' : '');
  }

  // ---- Small DOM helpers ---------------------------------------------------

  function show(selector, visible) {
    var el = document.querySelector(selector);
    if (el) { el.hidden = !visible; }
  }
  function optionEl(value, label) {
    var o = document.createElement('option');
    o.value = value; o.textContent = label;
    return o;
  }
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  /**
   * Show the More info popup for the current question. Content from the sheet
   * is escaped (no arbitrary HTML) but newlines are preserved as <br>.
   */
  function showMoreInfo() {
    var q = currentQuestion();
    if (!q || !q.moreInfo) { return; }
    var html = escapeHtml(q.moreInfo).replace(/\n/g, '<br>');
    APP.modal.notice({
      icon: '💡',
      title: 'Read more',
      html: html,
      scrollable: true,
      okLabel: 'Close'
    });
  }

  return {
    showScreen: showScreen,
    goBack: goBack,
    goHome: goHome,
    renderLessons: renderLessons,
    renderReviewSetup: renderReviewSetup,
    updateReviewAvailable: updateReviewAvailable,
    startReviewSession: startReviewSession,
    revealAnswer: revealAnswer,
    nextQuestion: nextQuestion,
    recordAssessment: recordAssessment,
    toggleMastered: toggleMastered,
    setMasteredForCurrent: setMasteredForCurrent,
    backToQuestion: backToQuestion,
    practiceAgain: practiceAgain,
    endSessionCleanup: endSessionCleanup,
    currentQuestion: currentQuestion,
    onRecordStart: onRecordStart,
    onRecordStop: onRecordStop,
    onSpeakCheck: onSpeakCheck,
    showMoreInfo: showMoreInfo,
    resetRecordingUI: resetRecordingUI
  };
})();