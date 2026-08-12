/**
 * SheetService — the data layer that turns the Google Spreadsheet into
 * clean lesson/question JSON for the frontend.
 *
 * Responsibilities (see requirements sections 2-4, 19-21):
 *   - Access the configured spreadsheet.
 *   - Detect which tabs are lessons.
 *   - Read Vietnamese / English columns.
 *   - Drop invalid rows (missing VN, missing EN, empty, header).
 *   - Generate stable unique question IDs.
 *   - Count valid questions dynamically (never assume 20).
 *   - Return lesson metadata + questions as JSON.
 *
 * Nothing here is hardcoded about lesson content or question counts.
 */
var SheetService = (function () {

  // ---- Configuration -------------------------------------------------------

  /**
   * The spreadsheet that holds the lessons.
   * Replace with your own ID, or leave blank to use the container-bound sheet.
   */
  var SPREADSHEET_ID = '1OjvvCTmnW8jE9nD0CccieAPKQvNt6hLqFrVX-t506yg';

  /**
   * A tab is treated as a lesson when its name matches this pattern.
   * Default: starts with "Lesson" followed by a number, e.g. "Lesson 3 - hotel".
   * Adjust if you name your tabs differently.
   */
  var LESSON_NAME_PATTERN = /^\s*lesson\s*\d+/i;

  // ---- Public API ----------------------------------------------------------

  /**
   * Build the full payload for the frontend.
   * @return {{lessons: Array<Object>, loadedAt: string}}
   */
  function getLessons() {
    var ss = openSpreadsheet_();
    var sheets = ss.getSheets();
    var lessons = [];

    for (var i = 0; i < sheets.length; i++) {
      var sheet = sheets[i];
      var name = sheet.getName();
      if (!isLessonTab_(name)) {
        continue;
      }
      var lesson = readLesson_(sheet, name);
      // A lesson with zero valid questions is still listed so the UI can
      // show the "no questions" state and block starting it.
      lessons.push(lesson);
    }

    lessons.sort(function (a, b) {
      return a.lessonNumber - b.lessonNumber;
    });

    return {
      lessons: lessons,
      loadedAt: new Date().toISOString()
    };
  }

  // ---- Internals -----------------------------------------------------------

  function openSpreadsheet_() {
    if (SPREADSHEET_ID && SPREADSHEET_ID.indexOf('YOUR_') !== 0) {
      return SpreadsheetApp.openById(SPREADSHEET_ID);
    }
    var active = SpreadsheetApp.getActiveSpreadsheet();
    if (!active) {
      throw new Error('No spreadsheet configured. Set SPREADSHEET_ID in SheetService.gs.');
    }
    return active;
  }

  function isLessonTab_(name) {
    return LESSON_NAME_PATTERN.test(name);
  }

  /**
   * Parse a lesson tab into metadata + validated questions.
   */
  function readLesson_(sheet, name) {
    var lessonNumber = parseLessonNumber_(name);
    var lessonId = 'lesson-' + (lessonNumber || slug_(name));
    var title = parseLessonTitle_(name);

    var questions = readQuestions_(sheet, lessonId);

    return {
      lessonId: lessonId,
      lessonName: name,
      lessonNumber: lessonNumber,
      title: title,
      questionCount: questions.length, // always equals questions.length
      questions: questions
    };
  }

  /**
   * Read valid Vietnamese/English pairs from a sheet.
   * Header row is skipped. Columns are detected from the header when possible,
   * falling back to the first two columns.
   */
  function readQuestions_(sheet, lessonId) {
    var range = sheet.getDataRange();
    var values = range.getValues();
    var questions = [];

    if (values.length < 2) {
      return questions; // header only or empty
    }

    var cols = detectColumns_(values[0]);
    var seq = 0;

    for (var r = 1; r < values.length; r++) {
      var row = values[r];
      var vietnamese = cleanCell_(row[cols.vi]);
      var english = cleanCell_(row[cols.en]);

      // Valid question = BOTH Vietnamese and English present.
      if (!vietnamese || !english) {
        continue;
      }

      seq++;
      questions.push({
        id: lessonId + '-' + pad_(seq, 3),
        vietnamese: vietnamese,
        english: english
      });
    }

    return questions;
  }

  /**
   * Find the Vietnamese and English column indexes from the header row.
   * Falls back to columns 0 and 1.
   */
  function detectColumns_(header) {
    var vi = -1;
    var en = -1;
    for (var c = 0; c < header.length; c++) {
      var h = String(header[c] || '').toLowerCase();
      if (vi === -1 && (h.indexOf('viet') !== -1 || h.indexOf('việt') !== -1 || h.indexOf('vn') !== -1)) {
        vi = c;
      }
      if (en === -1 && (h.indexOf('eng') !== -1 || h.indexOf('anh') !== -1)) {
        en = c;
      }
    }
    if (vi === -1) { vi = 0; }
    if (en === -1) { en = (vi === 1 ? 0 : 1); }
    return { vi: vi, en: en };
  }

  function cleanCell_(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value).replace(/\s+/g, ' ').trim();
  }

  function parseLessonNumber_(name) {
    var m = name.match(/lesson\s*(\d+)/i);
    return m ? parseInt(m[1], 10) : 0;
  }

  /**
   * "Lesson 3 - clothing store" -> "Clothing Store".
   */
  function parseLessonTitle_(name) {
    var m = name.match(/^\s*lesson\s*\d+\s*[-–—:]?\s*(.*)$/i);
    var raw = m && m[1] ? m[1].trim() : name.trim();
    if (!raw) {
      return name.trim();
    }
    return raw.replace(/\w\S*/g, function (w) {
      return w.charAt(0).toUpperCase() + w.substr(1);
    });
  }

  function slug_(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function pad_(n, width) {
    var s = String(n);
    while (s.length < width) {
      s = '0' + s;
    }
    return s;
  }

  return {
    getLessons: getLessons
  };
})();
