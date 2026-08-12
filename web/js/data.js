/**
 * Data — loads lessons from the Apps Script JSON endpoint (see APP.config.API_URL).
 * Fetched once on startup and cached in APP.state so no request happens per question.
 */
window.APP = window.APP || {};

APP.data = (function () {

  function loadLessons() {
    var url = APP.config.API_URL;
    if (!url) {
      return Promise.reject(new Error('API_URL is not configured. Edit web/js/config.js.'));
    }
    return fetch(url, { method: 'GET', redirect: 'follow' })
      .then(function (res) {
        if (!res.ok) { throw new Error('HTTP ' + res.status); }
        return res.json();
      })
      .then(function (payload) {
        APP.state.lessons = (payload && payload.lessons) || [];
        APP.state.loadedAt = payload && payload.loadedAt;
        return APP.state.lessons;
      });
  }

  return { loadLessons: loadLessons };
})();
