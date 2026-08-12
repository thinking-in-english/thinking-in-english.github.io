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
    updateBackButton();
  }

  function updateBackButton() {
    var back = document.getElementById('backBtn');
    var canGoBack = navStack.length > 0 && currentScreen !== 'loading' && currentScreen !== 'error';
    back.hidden = !canGoBack;
  }

  /**
   * Back navigation. Confirms before abandoning an active session (section 39).
   */
  function goBack() {
    if (!navStack.length) { return; }
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
        var prev = navStack.pop();
        showScreen(prev, false);
      });
      return;
    }
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
      var empty = lesson.questionCount === 0;
      if (empty) { btn.setAttribute('disabled', 'disabled'); }

      btn.innerHTML =
        '<span class="lesson-main">' +
          '<span class="lesson-name">Lesson ' + lesson.lessonNumber + ' — ' + escapeHtml(lesson.title) + '</span>' +
          '<span class="lesson-sub">' + (empty ? 'No practice questions yet' : 'Tap to practice all questions') + '</span>' +
        '</span>' +
        '<span class="lesson-count' + (empty ? ' zero' : '') + '">' + lesson.questionCount + ' questions</span>';

      if (!empty) {
        btn.addEventListener('click', function () { startLessonSession(lesson.lessonId); });
      }
      list.appendChild(btn);
    });

    showScreen('lessons');
  }

  /**
   * Practice by Lesson: ALL questions, shuffled, no limit (sections 7, 46).
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
    var questions = APP.utils.shuffleQuestions(APP.utils.getAllQuestionsFromLesson(lesson));
    beginSession({
      mode: 'lesson',
      title: 'Lesson ' + lesson.lessonNumber + ' — ' + lesson.title,
      questions: questions
    });
  }

  // ---- Review Multiple Lessons --------------------------------------------

  function renderReviewSetup() {
    var fromSel = document.getElementById('reviewFrom');
    var toSel = document.getElementById('reviewTo');
    fromSel.innerHTML = '';
    toSel.innerHTML = '';

    APP.state.lessons.forEach(function (lesson) {
      var label = 'Lesson ' + lesson.lessonNumber + ' — ' + lesson.title;
      fromSel.appendChild(optionEl(lesson.lessonNumber, label));
      toSel.appendChild(optionEl(lesson.lessonNumber, label));
    });

    if (APP.state.lessons.length) {
      fromSel.value = APP.state.lessons[0].lessonNumber;
      toSel.value = APP.state.lessons[APP.state.lessons.length - 1].lessonNumber;
    }
    document.getElementById('reviewCount').value = String(APP.config.defaultReviewCount);

    updateReviewAvailable();
    showScreen('review');
  }

  /**
   * Update the dynamic "Available questions" count for the chosen range
   * (section 16).
   */
  function updateReviewAvailable() {
    var from = parseInt(document.getElementById('reviewFrom').value, 10);
    var to = parseInt(document.getElementById('reviewTo').value, 10);
    var pool = APP.utils.getQuestionsFromLessonRange(APP.state.lessons, from, to);
    document.getElementById('reviewAvailable').textContent = pool.length;
    return pool;
  }

  /**
   * Review: combine range into one pool, shuffle, take requested amount
   * (sections 13-15, 46).
   */
  function startReviewSession() {
    var from = parseInt(document.getElementById('reviewFrom').value, 10);
    var to = parseInt(document.getElementById('reviewTo').value, 10);
    var countRaw = document.getElementById('reviewCount').value;
    var count = countRaw === 'all' ? 'all' : parseInt(countRaw, 10);

    var pool = APP.utils.getQuestionsFromLessonRange(APP.state.lessons, from, to);
    if (!pool.length) {
      APP.modal.notice({
        icon: '📭',
        title: 'No questions available',
        message: 'The selected lesson range has no practice questions.'
      });
      return;
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
    document.getElementById('enAnswer').textContent = q.english;

    // Reset to hidden-answer state.
    s.revealed = false;
    document.getElementById('answerBlock').hidden = true;

    var primary = document.getElementById('primaryActionBtn');
    primary.textContent = 'Show Answer';
    primary.dataset.action = 'show-answer';

    resetPreCheckUI();
    resetRecordingUI();
    resetSpeechUI();
  }

  function revealAnswer() {
    var s = APP.state.session;
    if (!s || s.revealed) { return; }
    s.revealed = true;
    document.getElementById('answerBlock').hidden = false;
    document.getElementById('preCheckBlock').hidden = true;

    // TTS availability note (non-blocking).
    document.getElementById('ttsWarn').hidden = APP.tts.isSupported();
    document.getElementById('recWarn').hidden = APP.recorder.isSupported();
    document.getElementById('srWarn').hidden = APP.speech.isSupported();

    var primary = document.getElementById('primaryActionBtn');
    primary.textContent = isLastQuestion() ? 'Finish' : 'Next →';
    primary.dataset.action = 'next';
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
    if (q) { APP.state.session.results[q.id] = kind; }
  }

  // ---- Completion ----------------------------------------------------------

  function completeSession() {
    var s = APP.state.session;
    var total = s.questions.length;
    endSessionCleanup();

    document.getElementById('completeCount').textContent =
      total + ' / ' + total + ' questions completed.';

    var got = 0, practice = 0;
    Object.keys(s.results).forEach(function (id) {
      if (s.results[id] === 'got') { got++; }
      else if (s.results[id] === 'practice') { practice++; }
    });
    document.getElementById('completeStats').innerHTML =
      '<span class="stat-pill">✅ Got it: ' + got + '</span>' +
      '<span class="stat-pill">🔁 Need practice: ' + practice + '</span>';

    // Keep the finished session available for "Practice Again".
    APP.state.lastSession = { mode: s.mode, title: s.title, sourceQuestions: s.questions.slice() };
    showScreen('complete');
  }

  function practiceAgain() {
    var last = APP.state.lastSession;
    if (!last) { goHome(); return; }
    // Fresh shuffle of the same question set (section 18).
    beginSession({
      mode: last.mode,
      title: last.title,
      questions: APP.utils.shuffleQuestions(last.sourceQuestions)
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

  // ---- Speech recognition UI helpers --------------------------------------

  function resetSpeechUI() {
    var box = document.getElementById('srResult');
    box.hidden = true;
    box.className = 'sr-result';
    box.innerHTML = '';
  }

  function onCheckSpeech() {
    var q = currentQuestion();
    if (!q) { return; }
    var box = document.getElementById('srResult');
    box.hidden = false;
    box.className = 'sr-result';
    box.innerHTML = '🎧 Listening… speak now.';

    APP.speech.checkSpeech(q.english, APP.state.settings.accent)
      .then(function (r) { renderSpeechResult(r); })
      .catch(function (err) {
        box.className = 'sr-result miss';
        box.innerHTML = '<div class="sr-head">' + speechErrorTitle(err) + '</div>' +
                        '<div>' + speechErrorHint(err) + '</div>';
      });
  }

  function renderSpeechResult(r) {
    var box = document.getElementById('srResult');
    var head, cls;
    if (r.status === 'ok') {
      cls = 'ok'; head = '✓ Great!';
    } else if (r.status === 'partial') {
      cls = 'partial'; head = '△ Almost there';
    } else {
      cls = 'miss'; head = '✗ Keep practicing';
    }
    box.className = 'sr-result ' + cls;
    var html =
      '<div class="sr-head">' + head + '</div>' +
      '<div>' + r.matchedCount + ' / ' + r.expectedCount + ' expected words recognized.</div>';
    if (r.missing.length) {
      html += '<div>Missing word' + (r.missing.length > 1 ? 's' : '') + ': ' +
              r.missing.map(function (w) { return '<code>' + escapeHtml(w) + '</code>'; }).join(', ') +
              '</div>';
    }
    html += '<div class="muted" style="font-size:12px;margin-top:6px">Speech match only — not a pronunciation score.</div>';
    box.innerHTML = html;
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
    box.innerHTML =
      '<div class="sr-head">✓ Correct!</div>' +
      '<div>' + r.matchedCount + ' / ' + r.expectedCount + ' words recognized.</div>' +
      '<div style="margin-top:6px;font-weight:600">' + escapeHtml(q.english) + '</div>' +
      '<div class="muted" style="font-size:12px;margin-top:6px">Moving to next question…</div>';
    APP.state.session.results[q.id] = 'got';
    setTimeout(function () { nextQuestion(); }, 1400);
  }

  function renderPreCheckFeedback(r) {
    var box = document.getElementById('preCheckResult');
    var cls, head;
    if (r.status === 'partial') { cls = 'partial'; head = '△ Almost — try again'; }
    else { cls = 'miss'; head = '✗ Not quite — try again'; }
    box.className = 'sr-result ' + cls;
    box.innerHTML =
      '<div class="sr-head">' + head + '</div>' +
      '<div>' + r.matchedCount + ' / ' + r.expectedCount + ' expected words recognized.</div>' +
      '<div class="muted" style="font-size:12px;margin-top:6px">Speech match only — not a pronunciation score.</div>';
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
    practiceAgain: practiceAgain,
    endSessionCleanup: endSessionCleanup,
    currentQuestion: currentQuestion,
    onRecordStart: onRecordStart,
    onRecordStop: onRecordStop,
    onCheckSpeech: onCheckSpeech,
    onSpeakCheck: onSpeakCheck
  };
})();