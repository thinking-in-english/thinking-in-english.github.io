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
    // Cache-bust so the browser doesn't reuse an old redirect target that may have expired.
    var bust = url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
    return fetch(bust, { method: 'GET', redirect: 'follow', cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) {
          throw new Error('HTTP ' + res.status + ' from ' + res.url);
        }
        return res.text().then(function (txt) {
          try {
            return JSON.parse(txt);
          } catch (e) {
            throw new Error('Backend did not return JSON. First 120 chars: ' + txt.slice(0, 120));
          }
        });
      })
      .then(function (payload) {
        APP.state.lessons = (payload && payload.lessons) || [];
        APP.state.loadedAt = payload && payload.loadedAt;
        return APP.state.lessons;
      });
  }

  return { loadLessons: loadLessons };
})();
