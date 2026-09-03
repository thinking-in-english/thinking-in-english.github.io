/**
 * Data — loads lessons from the Apps Script JSON endpoint (see APP.config.API_URL).
 * Fetched once on startup and cached in APP.state so no request happens per question.
 */
window.APP = window.APP || {};

APP.data = (function () {

  function fetchOnce(url, timeoutMs) {
    var bust = url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now();
    // Abort if the request hangs — Apps Script /exec sometimes stalls silently.
    var controller = ('AbortController' in window) ? new AbortController() : null;
    var timer = null;
    if (controller) {
      timer = setTimeout(function () { controller.abort(); }, timeoutMs || 12000);
    }
    var opts = { method: 'GET', redirect: 'follow', cache: 'no-store' };
    if (controller) { opts.signal = controller.signal; }
    return fetch(bust, opts)
      .then(function (res) {
        if (timer) { clearTimeout(timer); }
        if (!res.ok) {
          var err = new Error('HTTP ' + res.status + ' from ' + res.url);
          err.status = res.status;
          throw err;
        }
        return res.text().then(function (txt) {
          try { return JSON.parse(txt); }
          catch (e) {
            throw new Error('Backend did not return JSON. First 120 chars: ' + txt.slice(0, 120));
          }
        });
      })
      .catch(function (err) {
        if (timer) { clearTimeout(timer); }
        if (err && err.name === 'AbortError') {
          throw new Error('Backend timed out — check your connection or try again.');
        }
        throw err;
      });
  }

  function loadLessons() {
    var url = APP.config.API_URL;
    if (!url) {
      return Promise.reject(new Error('API_URL is not configured. Edit web/js/config.js.'));
    }
    // Retry up to 3 times with backoff for transient Apps Script errors.
    return fetchOnce(url)
      .catch(function () {
        return new Promise(function (r) { setTimeout(r, 800); })
          .then(function () { return fetchOnce(url); });
      })
      .catch(function () {
        return new Promise(function (r) { setTimeout(r, 1600); })
          .then(function () { return fetchOnce(url); });
      })
      .then(function (payload) {
        APP.state.lessons = (payload && payload.lessons) || [];
        APP.state.loadedAt = payload && payload.loadedAt;
        return APP.state.lessons;
      });
  }

  return { loadLessons: loadLessons };
})();
