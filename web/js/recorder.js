/**
 * Recorder — optional voice recording via MediaRecorder (sections 28-30).
 * Recording is never auto-started and never uploaded; audio stays in memory
 * for the current question only, and resources are released on cleanup.
 */
window.APP = window.APP || {};

APP.recorder = (function () {

  var supported = !!(navigator.mediaDevices &&
                     navigator.mediaDevices.getUserMedia &&
                     window.MediaRecorder);

  var mediaRecorder = null;
  var stream = null;
  var cancelStart = false;  // set by cleanup() to abort in-flight start()
  var autoStopTimer = null; // hard cap on recording duration
  var chunks = [];
  var audioUrl = null;
  var audioEl = null;

  var MAX_RECORD_MS = 60 * 1000; // never keep mic on longer than 60s per take

  function isSupported() { return supported; }
  function isRecording() { return !!mediaRecorder && mediaRecorder.state === 'recording'; }

  /**
   * Start recording. Resolves once the microphone is live.
   */
  function start() {
    if (!supported) { return Promise.reject(new Error('unsupported')); }
    releaseRecording(); // drop any previous take
    cancelStart = false;
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      // If cleanup() ran while getUserMedia was pending, drop the stream now.
      if (cancelStart) {
        s.getTracks().forEach(function (t) { try { t.stop(); } catch (e) {} });
        cancelStart = false;
        throw new Error('cancelled');
      }
      stream = s;
      chunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) { chunks.push(e.data); }
      };
      mediaRecorder.start();
      // Safety cap — if the user forgets to press Stop, the mic won't stay
      // on forever (especially important when the tab is backgrounded).
      if (autoStopTimer) { clearTimeout(autoStopTimer); }
      autoStopTimer = setTimeout(function () {
        try { if (isRecording()) { mediaRecorder.stop(); } } catch (e) {}
        stopStream();
      }, MAX_RECORD_MS);
    });
  }

  /**
   * Stop recording. Resolves with a playable object URL for the take.
   */
  function stop() {
    return new Promise(function (resolve) {
      if (!isRecording()) { resolve(null); return; }
      mediaRecorder.onstop = function () {
        var blob = new Blob(chunks, { type: mediaRecorder.mimeType || 'audio/webm' });
        audioUrl = URL.createObjectURL(blob);
        stopStream();
        resolve(audioUrl);
      };
      mediaRecorder.stop();
    });
  }

  /** Play the current take. */
  function play() {
    if (!audioUrl) { return; }
    if (!audioEl) { audioEl = new Audio(); }
    audioEl.src = audioUrl;
    audioEl.play();
  }

  function stopStream() {
    if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
    if (stream) {
      stream.getTracks().forEach(function (t) {
        try { t.stop(); } catch (e) {}
      });
      stream = null;
    }
    mediaRecorder = null;
  }

  /** Release the stored recording + object URL. */
  function releaseRecording() {
    if (audioEl) { try { audioEl.pause(); } catch (e) {} audioEl.src = ''; }
    if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
    chunks = [];
  }

  /** Full cleanup when leaving a question or session (section 30). */
  function cleanup() {
    // Signal in-flight getUserMedia to release its stream once it resolves.
    cancelStart = true;
    if (isRecording()) {
      try { mediaRecorder.stop(); } catch (e) {}
    }
    stopStream();
    releaseRecording();
  }

  return {
    isSupported: isSupported,
    isRecording: isRecording,
    start: start,
    stop: stop,
    play: play,
    cleanup: cleanup
  };
})();