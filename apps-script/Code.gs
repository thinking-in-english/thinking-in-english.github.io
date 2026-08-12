/**
 * ENGLISH REFLEX — Google Apps Script backend (JSON API).
 *
 * The frontend now lives on GitHub Pages (or any static host). This file
 * exposes a single GET endpoint that returns lesson data as JSON, so the
 * Spreadsheet ID stays on the server.
 */

/**
 * doGet — returns { lessons, loadedAt } as JSON.
 * The response is CORS-friendly because Apps Script Web Apps deployed
 * with "Anyone" access are served with permissive headers.
 */
function doGet(e) {
  var payload = SheetService.getLessons();
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
