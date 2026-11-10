/* Sparkle's rules, with no page or Kolibri code, so they can be tested on their own
 * (node --test tests/). Loaded in the page as window.SparkleLogic. */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.SparkleLogic = factory();
})(this, function () {
  "use strict";

  var HIT = "hit";   // right letter, right place
  var NEAR = "near"; // in the word, somewhere else
  var MISS = "miss"; // not in the word (or no more of it)

  /** Split a fixed-width string from words.js into words. */
  function split(text, n) {
    var out = [];
    for (var i = 0; i + n <= text.length; i += n) out.push(text.slice(i, i + n));
    return out;
  }

  /** The word lists for one length (data is words/<language>.json): {answers: [...], isWord(w)}. */
  function dictionary(data, n) {
    var answers = split(data.answers[n] || "", n);
    var valid = {};
    answers.concat(split(data.guesses[n] || "", n)).forEach(function (w) { valid[w] = true; });
    return { length: n, answers: answers, isWord: function (w) { return valid[w] === true; } };
  }

  /** How a secret word is really written ("cote" -> "côte" in French). */
  function shown(data, word) {
    return (data && data.accents && data.accents[word]) || word;
  }

  /** A letter as it's typed in the game: "É" -> "e", "ç" -> "c". Anything else -> "". */
  function plain(ch) {
    ch = String(ch || "").toLowerCase();
    if (ch.normalize) ch = ch.normalize("NFD").replace(/[̀-ͯ]/g, "");
    return /^[a-z]$/.test(ch) ? ch : "";
  }

  /** Colour each letter of a guess, the usual way: exact matches first, then
   * other letters left to right while unmatched copies remain in the secret word. */
  function mark(guess, secret) {
    var result = new Array(guess.length);
    var left = {};
    for (var i = 0; i < guess.length; i++) {
      if (guess[i] === secret[i]) result[i] = HIT;
      else left[secret[i]] = (left[secret[i]] || 0) + 1;
    }
    for (var j = 0; j < guess.length; j++) {
      if (result[j]) continue;
      if (left[guess[j]] > 0) {
        result[j] = NEAR;
        left[guess[j]] -= 1;
      } else {
        result[j] = MISS;
      }
    }
    return result;
  }

  /** "hit,near,miss" -> "HNM", for moves and saved games. */
  function code(marks) {
    return marks.map(function (m) { return m === HIT ? "H" : m === NEAR ? "N" : "M"; }).join("");
  }

  /** The best thing known about each letter, for colouring the keyboard. */
  function letterStates(guesses, secret) {
    var rank = { miss: 1, near: 2, hit: 3 };
    var states = {};
    guesses.forEach(function (g) {
      mark(g, secret).forEach(function (m, i) {
        var ch = g[i];
        if (!states[ch] || rank[m] > rank[states[ch]]) states[ch] = m;
      });
    });
    return states;
  }

  /** Points for one daily word. Playing earns 1; solving earns 3, plus 1 for
   * every guess left over. With 6 guesses: 8 points in 1 guess ... 3 in 6. */
  function points(solved, used, allowed) {
    if (!solved) return 1;
    return 3 + Math.max(0, allowed - used);
  }

  function maxPoints(allowed) { return 3 + allowed - 1; }

  /** FNV-1a: a small, stable string hash. */
  function hash(text) {
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  /** "2026-11-02" for a Date, in the device's own time zone. */
  function dateKey(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  var EPOCH = Date.UTC(2026, 0, 1);

  /** Days since 1 January 2026 for "YYYY-MM-DD". */
  function dayNumber(key) {
    var p = key.split("-");
    return Math.round((Date.UTC(+p[0], +p[1] - 1, +p[2]) - EPOCH) / 86400000);
  }

  function addDays(key, days) {
    var p = key.split("-");
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + days));
    return d.getUTCFullYear() + "-" + pad(d.getUTCMonth() + 1) + "-" + pad(d.getUTCDate());
  }

  function mod(a, n) { return ((a % n) + n) % n; }

  /** The daily word. The answers are already in a shuffled order, so each
   * player walks through them one day at a time, from a starting point set by
   * where they play (free play or a challenge) and, when every learner gets
   * their own word, who they are. Nobody sees the same word twice until the
   * list runs out (over three years for the shortest list). */
  function dailyWord(answers, key, scope, who) {
    var offset = hash("sparkle|" + scope + "|" + (who || "")) % answers.length;
    return answers[mod(dayNumber(key) + offset, answers.length)];
  }

  /** A random word for practice, avoiding the ones given. */
  function practiceWord(answers, avoid, random) {
    random = random || Math.random;
    for (var tries = 0; tries < 20; tries++) {
      var w = answers[Math.floor(random() * answers.length)];
      if (!avoid || avoid.indexOf(w) < 0) return w;
    }
    return answers[0];
  }

  /** Light disguise for the word kept in saved games, so it isn't plain to read. */
  function hide(word) {
    return word.split("").map(function (ch, i) {
      return String.fromCharCode(97 + mod(ch.charCodeAt(0) - 97 + 7 + i * 3, 26));
    }).join("");
  }

  function unhide(text) {
    return text.split("").map(function (ch, i) {
      return String.fromCharCode(97 + mod(ch.charCodeAt(0) - 97 - 7 - i * 3, 26));
    }).join("");
  }

  // ------------------------------------------------------------ saved games

  /** The learner's save (EduGame.save), kept small for SCORM's 4,096 characters:
   *  {v: 2,
   *   w: {"free|en": {t: "2026-11-02", w: hidden word, n: guesses allowed, g: [...], r: "" | "won" | "lost", p}},
   *   s: {"free|en": [played, won, streak, best streak, last day played (dayNumber), points, solved in 1, in 2, ...]},
   *   x: {en: [practice played, practice solved]}}
   *  Each key is a place to play ("free", or "c<challenge id>" on the Kolibri Games games page) and a
   *  language: each language has its own daily words, stats and scoreboard. "w" keeps only the
   *  latest daily word of each. */
  var MAX_PLACES = 6;

  function emptySave() {
    return { v: 2, w: {}, s: {}, x: {} };
  }

  function isObject(o) { return !!o && typeof o === "object" && !Array.isArray(o); }

  function cleanSave(saved) {
    var s = isObject(saved) && saved.v === 2 ? saved : emptySave();
    ["w", "s", "x"].forEach(function (k) { if (!isObject(s[k])) s[k] = {}; });
    return s;
  }

  function placeKey(scope, lang) { return scope + "|" + lang; }

  function num(n) { return typeof n === "number" && isFinite(n) ? n : 0; }

  /** Numbers for the stats panel, as of today ("YYYY-MM-DD"). */
  function stats(save, key, today) {
    var a = Array.isArray(save.s[key]) ? save.s[key] : [];
    var last = a.length > 4 ? num(a[4]) : -1;
    var day = dayNumber(today);
    return {
      played: num(a[0]),
      won: num(a[1]),
      // Days played in a row, up to today (or yesterday, if today isn't played yet).
      streak: a.length > 4 && day - last <= 1 ? num(a[2]) : 0,
      bestStreak: num(a[3]),
      last: last,
      points: num(a[5]),
      dist: a.slice(6).map(num)
    };
  }

  /** Has the daily word of this day (or a later one) been played already? */
  function playedOn(save, key, date) {
    var a = save.s[key];
    return Array.isArray(a) && a.length > 4 && num(a[4]) >= dayNumber(date);
  }

  /** A finished daily word: its result goes into the stats. */
  function addResult(save, key, date, solved, used, points) {
    var st = stats(save, key, date);
    var day = dayNumber(date);
    var streak = st.last === day - 1 ? st.streak + 1 : 1;
    var a = [st.played + 1, st.won + (solved ? 1 : 0), streak, Math.max(st.bestStreak, streak), day, st.points + points];
    var dist = st.dist.slice();
    if (solved) {
      while (dist.length < used) dist.push(0);
      dist[used - 1] += 1;
    }
    save.s[key] = a.concat(dist);
    prune(save);
  }

  /** A finished practice word: {played, won} in that language. */
  function addPractice(save, lang, solved) {
    var p = Array.isArray(save.x[lang]) ? save.x[lang] : [0, 0];
    save.x[lang] = [num(p[0]) + 1, num(p[1]) + (solved ? 1 : 0)];
    return { played: save.x[lang][0], won: save.x[lang][1] };
  }

  /** Keep the places played most lately (free play, each challenge, in each language), so the
   *  save stays small. */
  function prune(save, keep) {
    keep = keep || MAX_PLACES;
    function lastDay(k) {
      var rec = save.w[k];
      var a = save.s[k];
      return Math.max(rec && rec.t ? dayNumber(rec.t) : -1, Array.isArray(a) && a.length > 4 ? num(a[4]) : -1);
    }
    var keys = Object.keys(save.s).concat(Object.keys(save.w)).filter(function (k, i, all) { return all.indexOf(k) === i; });
    keys.sort(function (a, b) { return lastDay(b) - lastDay(a); });
    keys.slice(keep).forEach(function (k) {
      delete save.s[k];
      delete save.w[k];
    });
  }

  return {
    HIT: HIT, NEAR: NEAR, MISS: MISS,
    split: split, dictionary: dictionary, mark: mark, code: code, letterStates: letterStates,
    points: points, maxPoints: maxPoints, hash: hash, dateKey: dateKey, dayNumber: dayNumber, addDays: addDays,
    dailyWord: dailyWord, practiceWord: practiceWord, hide: hide, unhide: unhide,
    emptySave: emptySave, cleanSave: cleanSave, placeKey: placeKey, stats: stats, playedOn: playedOn,
    addResult: addResult, addPractice: addPractice, prune: prune, plain: plain, shown: shown
  };
});
