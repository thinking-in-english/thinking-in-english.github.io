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
  var chunks = [];
  var audioUrl = null;
  var audioEl = null;

  function isSupported() { return supported; }
  function isRecording() { return !!mediaRecorder && mediaRecorder.state === 'recording'; }
  function hasRecording() { return !!audioUrl; }

  /**
   * Start recording. Resolves once the microphone is live.
   */
  function start() {
    if (!supported) { return Promise.reject(new Error('unsupported')); }
    releaseRecording(); // drop any previous take
    return navigator.mediaDevices.getUserMedia({ audio: true }).then(function (s) {
      stream = s;
      chunks = [];
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.ondataavailable = function (e) {
        if (e.data && e.data.size > 0) { chunks.push(e.data); }
      };
      mediaRecorder.start();
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
    if (stream) {
      stream.getTracks().forEach(function (t) { t.stop(); });
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
    if (isRecording()) {
      try { mediaRecorder.stop(); } catch (e) {}
    }
    stopStream();
    releaseRecording();
  }

  return {
    isSupported: isSupported,
    isRecording: isRecording,
    hasRecording: hasRecording,
    start: start,
    stop: stop,
    play: play,
    cleanup: cleanup
  };
})();