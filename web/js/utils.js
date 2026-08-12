/**
 * Utils — reusable, side-effect-free helpers for randomization and pooling.
 * These implement the requirements in sections 15-18.
 */
window.APP = window.APP || {};

APP.utils = (function () {

  /**
   * Fisher-Yates unbiased shuffle. Returns a NEW array (does not mutate input),
   * so every session gets a fresh order.
   */
  function shuffleQuestions(questions) {
    var arr = questions.slice();
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  /**
   * All valid questions from a single lesson (already validated by backend).
   */
  function getAllQuestionsFromLesson(lesson) {
    return lesson && lesson.questions ? lesson.questions.slice() : [];
  }

  /**
   * Combine every question from an inclusive lesson-number range into ONE pool.
   * Lessons are NOT processed separately (section 15).
   */
  function getQuestionsFromLessonRange(lessons, fromNumber, toNumber) {
    var lo = Math.min(fromNumber, toNumber);
    var hi = Math.max(fromNumber, toNumber);
    var pool = [];
    lessons.forEach(function (lesson) {
      if (lesson.lessonNumber >= lo && lesson.lessonNumber <= hi) {
        pool = pool.concat(lesson.questions);
      }
    });
    return pool;
  }

  /**
   * Shuffle a pool and take `count` questions with no duplicates.
   * If count exceeds the pool size (or count === 'all'), return the whole pool.
   */
  function getRandomQuestions(pool, count) {
    var shuffled = shuffleQuestions(pool);
    if (count === 'all' || count === null || count === undefined) {
      return shuffled;
    }
    var n = Math.min(parseInt(count, 10), shuffled.length);
    return shuffled.slice(0, n);
  }

  /** Normalize text for word comparison in speech recognition. */
  function normalizeWords(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s']/gu, ' ') // drop punctuation, keep letters/numbers/apostrophe
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);
  }

  return {
    shuffleQuestions: shuffleQuestions,
    getAllQuestionsFromLesson: getAllQuestionsFromLesson,
    getQuestionsFromLessonRange: getQuestionsFromLessonRange,
    getRandomQuestions: getRandomQuestions,
    normalizeWords: normalizeWords
  };
})();