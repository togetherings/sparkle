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

  /** The word lists for one length: {answers: [...], isWord(w)}. */
  function dictionary(data, n) {
    var answers = split(data.answers[n] || "", n);
    var valid = new Set(answers.concat(split(data.guesses[n] || "", n)));
    return { length: n, answers: answers, isWord: function (w) { return valid.has(w); } };
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

  /** Saved data looks like:
   *  {v: 1,
   *   scopes: {"free": {days: {"2026-11-02": {w, n, g: [...], r: "won"|"lost"|"", p}}}, "c12": {...}},
   *   practice: {played, won, dist: [count solved in 1, 2, ...]}}
   */
  function emptyState() {
    return { v: 1, scopes: {}, practice: { played: 0, won: 0, dist: [] } };
  }

  function cleanState(saved) {
    var s = saved && typeof saved === "object" && saved.v === 1 ? saved : emptyState();
    s.scopes = s.scopes && typeof s.scopes === "object" ? s.scopes : {};
    s.practice = s.practice && typeof s.practice === "object" ? s.practice : { played: 0, won: 0, dist: [] };
    if (!Array.isArray(s.practice.dist)) s.practice.dist = [];
    return s;
  }

  function scopeOf(state, scope) {
    var sc = state.scopes[scope];
    if (!sc || typeof sc !== "object" || typeof sc.days !== "object") sc = state.scopes[scope] = { days: {} };
    return sc;
  }

  /** Total points in one scope: what the scoreboard shows. */
  function total(sc) {
    var sum = 0;
    Object.keys(sc.days).forEach(function (k) {
      var d = sc.days[k];
      if (d && (d.r === "won" || d.r === "lost")) sum += d.p || 0;
    });
    return sum;
  }

  /** Numbers for the stats panel. */
  function stats(sc, today) {
    var keys = Object.keys(sc.days).filter(function (k) {
      var d = sc.days[k];
      return d && (d.r === "won" || d.r === "lost");
    }).sort();
    var won = 0;
    var dist = [];
    keys.forEach(function (k) {
      var d = sc.days[k];
      if (d.r === "won") {
        won += 1;
        var used = d.c || (d.g ? d.g.length : 0);
        dist[used - 1] = (dist[used - 1] || 0) + 1;
      }
    });
    // Days played in a row, up to today (or yesterday, if today isn't played yet).
    var streak = 0;
    var day = sc.days[today] && sc.days[today].r ? today : addDays(today, -1);
    while (sc.days[day] && (sc.days[day].r === "won" || sc.days[day].r === "lost")) {
      streak += 1;
      day = addDays(day, -1);
    }
    var best = 0;
    var run = 0;
    var prev = null;
    keys.forEach(function (k) {
      run = prev && addDays(prev, 1) === k ? run + 1 : 1;
      best = Math.max(best, run);
      prev = k;
    });
    return { played: keys.length, won: won, dist: dist, streak: streak, bestStreak: best, points: total(sc) };
  }

  /** Forget the guesses of old days (keeping the result and points), so saved
   * data stays well under Kolibri Games' 64 KB limit. */
  function prune(sc, today, keepDays) {
    var cutoff = addDays(today, -(keepDays || 45));
    Object.keys(sc.days).forEach(function (k) {
      var d = sc.days[k];
      if (k < cutoff && d && d.g && (d.r === "won" || d.r === "lost")) {
        d.c = d.g.length;
        delete d.g;
        delete d.w;
      }
    });
  }

  return {
    HIT: HIT, NEAR: NEAR, MISS: MISS,
    split: split, dictionary: dictionary, mark: mark, code: code, letterStates: letterStates,
    points: points, maxPoints: maxPoints, hash: hash, dateKey: dateKey, dayNumber: dayNumber, addDays: addDays,
    dailyWord: dailyWord, practiceWord: practiceWord, hide: hide, unhide: unhide,
    emptyState: emptyState, cleanState: cleanState, scopeOf: scopeOf, total: total, stats: stats, prune: prune
  };
});
