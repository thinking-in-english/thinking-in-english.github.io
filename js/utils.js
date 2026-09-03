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

  // Contractions the speech recognizer sometimes outputs one form and the
  // target sentence uses the other. Expand to the long form on both sides.
  var CONTRACTIONS = {
    "i'm": "i am", "you're": "you are", "he's": "he is", "she's": "she is",
    "it's": "it is", "we're": "we are", "they're": "they are",
    "i've": "i have", "you've": "you have", "we've": "we have", "they've": "they have",
    "i'll": "i will", "you'll": "you will", "he'll": "he will", "she'll": "she will",
    "we'll": "we will", "they'll": "they will", "it'll": "it will",
    "i'd": "i would", "you'd": "you would", "he'd": "he would", "she'd": "she would",
    "we'd": "we would", "they'd": "they would",
    "don't": "do not", "doesn't": "does not", "didn't": "did not",
    "won't": "will not", "wouldn't": "would not", "can't": "cannot",
    "couldn't": "could not", "shouldn't": "should not",
    "isn't": "is not", "aren't": "are not", "wasn't": "was not", "weren't": "were not",
    "hasn't": "has not", "haven't": "have not", "hadn't": "had not",
    "let's": "let us", "that's": "that is", "there's": "there is",
    "here's": "here is", "what's": "what is", "who's": "who is",
    "where's": "where is", "how's": "how is", "when's": "when is",
    "'em": "them"
  };

  // Digit word ↔ number. We canonicalize to digits.
  var NUMBER_WORDS = {
    zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5',
    six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
    eleven: '11', twelve: '12', thirteen: '13', fourteen: '14',
    fifteen: '15', sixteen: '16', seventeen: '17', eighteen: '18',
    nineteen: '19', twenty: '20', thirty: '30', forty: '40',
    fifty: '50', sixty: '60', seventy: '70', eighty: '80', ninety: '90',
    hundred: '100', thousand: '1000'
  };

  // Common homophones — collapse each group to the first member.
  var HOMOPHONE_GROUPS = [
    ['to', 'too', 'two'],
    ['your', "you're"],
    ['their', 'there', "they're"],
    ['hear', 'here'],
    ['wear', 'where'],
    ['for', 'four'],
    ['by', 'buy', 'bye'],
    ['no', 'know'],
    ['our', 'hour'],
    ['sea', 'see'],
    ['son', 'sun'],
    ['flower', 'flour'],
    ['through', 'thru']
  ];
  var HOMOPHONE_MAP = {};
  HOMOPHONE_GROUPS.forEach(function (g) {
    g.forEach(function (w) { HOMOPHONE_MAP[w] = g[0]; });
  });

  /**
   * Normalize text for word comparison in speech recognition:
   *   1. lowercase, strip punctuation
   *   2. expand contractions (I'm → i am)
   *   3. digit words → digits (five → 5)
   *   4. collapse homophones (too/two/to → to)
   */
  function normalizeWords(text) {
    var raw = String(text || '')
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s']/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .split(' ')
      .filter(Boolean);

    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var w = raw[i];
      if (CONTRACTIONS[w]) {
        CONTRACTIONS[w].split(' ').forEach(function (x) { out.push(x); });
      } else {
        out.push(w);
      }
    }
    return out.map(function (w) {
      if (NUMBER_WORDS[w]) { return NUMBER_WORDS[w]; }
      if (HOMOPHONE_MAP[w]) { return HOMOPHONE_MAP[w]; }
      return w;
    });
  }

  /** Levenshtein edit distance between two strings (for fuzzy word matching). */
  function levenshtein(a, b) {
    var m = a.length, n = b.length;
    if (!m) { return n; }
    if (!n) { return m; }
    var dp = new Array(n + 1);
    for (var j = 0; j <= n; j++) { dp[j] = j; }
    for (var i = 1; i <= m; i++) {
      var prev = dp[0];
      dp[0] = i;
      for (var k = 1; k <= n; k++) {
        var cur = dp[k];
        var cost = a.charAt(i - 1) === b.charAt(k - 1) ? 0 : 1;
        dp[k] = Math.min(dp[k] + 1, dp[k - 1] + 1, prev + cost);
        prev = cur;
      }
    }
    return dp[n];
  }

  return {
    shuffleQuestions: shuffleQuestions,
    getAllQuestionsFromLesson: getAllQuestionsFromLesson,
    getQuestionsFromLessonRange: getQuestionsFromLessonRange,
    getRandomQuestions: getRandomQuestions,
    normalizeWords: normalizeWords,
    levenshtein: levenshtein
  };
})();