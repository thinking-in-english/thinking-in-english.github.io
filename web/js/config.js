/**
 * Config — app-wide constants and default settings.
 * The API_URL points to the Apps Script backend that reads Google Sheets.
 */
window.APP = window.APP || {};

APP.config = {
  // Apps Script Web App /exec URL. Set this to your own deployment.
  API_URL: 'https://script.google.com/macros/s/AKfycbydXQfuvMUU-u3l31Tqrv9k-yXHNOKuOM7gG8M5aUw3nxcFSeHJzDpnofmsEa0hieHD/exec',

  reviewCountOptions: [20, 30, 50, 100, 'all'],
  defaultReviewCount: 20,

  defaultAccent: 'US',
  defaultRate: 1.0,

  accentLang: {
    US: 'en-US',
    UK: 'en-GB'
  }
};
