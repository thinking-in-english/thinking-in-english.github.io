/**
 * State — the single source of truth for runtime data.
 *
 * Holds:
 *   - the lessons loaded once from the backend (kept in memory, section 21),
 *   - the current practice/review session,
 *   - user settings (accent + speed) for the session.
 *
 * No spreadsheet requests happen per question; everything is served from here.
 */
window.APP = window.APP || {};

APP.state = {
  // Loaded once from google.script.run.api_getLessons().
  lessons: [],
  loadedAt: null,

  // Active session (null when not practicing).
  session: null,

  // Settings kept for the current session — restored from persisted prefs.
  settings: {
    accent: APP.progress ? APP.progress.getAccent() : APP.config.defaultAccent,
    rate: APP.progress ? APP.progress.getRate() : APP.config.defaultRate,
    voiceURI: APP.progress ? APP.progress.getVoiceURI() : null
  }
};

/** Find a lesson by its id. */
APP.state.getLessonById = function (id) {
  return APP.state.lessons.find(function (l) { return l.lessonId === id; }) || null;
};