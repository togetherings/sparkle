/* Run with: node --test tests/ */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../game/logic.js");

function loadWords() {
  const text = fs.readFileSync(path.join(__dirname, "..", "game", "words.js"), "utf8");
  return JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
}

const marks = (g, s) => L.code(L.mark(g, s));

test("marks exact, near and missing letters", () => {
  assert.strictEqual(marks("crane", "crane"), "HHHHH");
  assert.strictEqual(marks("react", "crane"), "NNHNM");
  assert.strictEqual(marks("plumb", "crane"), "MMMMM");
});

test("repeated letters only light up as often as they appear", () => {
  // One E in "abide": the first E lights up, the second doesn't.
  assert.strictEqual(marks("speed", "abide"), "MMNMN");
  // Letters in the right spot are matched first, so an earlier copy gets nothing.
  assert.strictEqual(marks("lolly", "hello"), "MNHHM");
  assert.strictEqual(marks("allay", "apple"), "HNMMM");
  assert.strictEqual(marks("geese", "sheep"), "MNHNM");
  assert.strictEqual(marks("abbey", "babes"), "NNHHM");
  assert.strictEqual(marks("sassy", "class"), "NNMHM");
  assert.strictEqual(marks("llama", "hello"), "NNMMM");
  assert.strictEqual(marks("eerie", "eagle"), "HMMMH");
});

test("keyboard colours keep the best clue for each letter", () => {
  const s = L.letterStates(["react", "crane"], "crane");
  assert.strictEqual(s.c, "hit");
  assert.strictEqual(s.t, "miss");
  const t = L.letterStates(["eerie"], "eagle");
  assert.strictEqual(t.e, "hit");
  assert.strictEqual(t.r, "miss");
});

test("points reward solving, and solving quickly", () => {
  assert.strictEqual(L.points(true, 1, 6), 8);
  assert.strictEqual(L.points(true, 6, 6), 3);
  assert.strictEqual(L.points(false, 6, 6), 1);
  assert.strictEqual(L.points(true, 1, 8), 10);
  assert.strictEqual(L.maxPoints(6), 8);
});

test("dates", () => {
  assert.strictEqual(L.dayNumber("2026-01-01"), 0);
  assert.strictEqual(L.dayNumber("2026-11-02"), 305);
  assert.strictEqual(L.addDays("2026-02-28", 1), "2026-03-01");
  assert.strictEqual(L.addDays("2026-03-01", -1), "2026-02-28");
  assert.strictEqual(L.dateKey(new Date(2026, 10, 2, 23, 59)), "2026-11-02");
});

test("daily words: one a day, no repeats, and different for each learner", () => {
  const answers = L.dictionary(loadWords(), 5).answers;
  const seen = new Set();
  let day = "2026-11-02";
  for (let i = 0; i < 365; i++) {
    seen.add(L.dailyWord(answers, day, "free", ""));
    day = L.addDays(day, 1);
  }
  assert.strictEqual(seen.size, 365);
  const a = L.dailyWord(answers, "2026-11-02", "free", "amina");
  assert.strictEqual(a, L.dailyWord(answers, "2026-11-02", "free", "amina"));
  const names = ["amina", "bao", "carlos", "dina", "eli", "fatima", "gus", "hana"];
  const words = new Set(names.map((n) => L.dailyWord(answers, "2026-11-02", "free", n)));
  assert.ok(words.size >= 7, "learners mostly get different words");
  assert.notStrictEqual(L.dailyWord(answers, "2026-11-02", "free", ""), L.dailyWord(answers, "2026-11-02", "c7", ""));
});

test("word lists", () => {
  const data = loadWords();
  for (const n of [4, 5, 6]) {
    const d = L.dictionary(data, n);
    assert.ok(d.answers.length > 1000, n + "-letter answers");
    for (const w of d.answers) {
      assert.match(w, new RegExp("^[a-z]{" + n + "}$"));
      assert.ok(d.isWord(w));
    }
  }
  const five = L.dictionary(data, 5);
  for (const w of ["crane", "about", "zebra", "colour", "color"].filter((w) => w.length === 5)) assert.ok(five.isWord(w), w);
  for (const w of ["xqzvb", "shitt"]) assert.ok(!five.isWord(w), w);
  const never = fs.readFileSync(path.join(__dirname, "..", "tools", "words", "never.txt"), "utf8")
    .split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"));
  for (const w of never) {
    if (w.length >= 4 && w.length <= 6) assert.ok(!L.dictionary(data, w.length).isWord(w), w + " must not be accepted");
  }
});

test("hiding words in saved games", () => {
  for (const w of ["spark", "zebra", "aaaaaa", "zzzz"]) {
    assert.notStrictEqual(L.hide(w), w);
    assert.strictEqual(L.unhide(L.hide(w)), w);
  }
});

test("totals, stats and pruning", () => {
  const state = L.cleanState(null);
  const sc = L.scopeOf(state, "free");
  sc.days["2026-10-30"] = { g: ["crane", "spark"], r: "won", p: 7, n: 6 };
  sc.days["2026-10-31"] = { g: ["a", "b", "c", "d", "e", "f"], r: "lost", p: 1, n: 6 };
  sc.days["2026-11-01"] = { g: ["a", "b", "c"], r: "won", p: 6, n: 6 };
  sc.days["2026-11-02"] = { g: ["a"], r: "", p: 0, n: 6 }; // in progress: not counted yet
  assert.strictEqual(L.total(sc), 14);
  const st = L.stats(sc, "2026-11-02");
  assert.strictEqual(st.played, 3);
  assert.strictEqual(st.won, 2);
  assert.strictEqual(st.streak, 3);
  assert.strictEqual(st.bestStreak, 3);
  assert.deepStrictEqual([st.dist[1], st.dist[2]], [1, 1]);
  L.prune(sc, "2026-12-31", 45);
  assert.strictEqual(sc.days["2026-10-30"].g, undefined);
  assert.strictEqual(sc.days["2026-10-30"].c, 2);
  assert.strictEqual(L.stats(sc, "2026-12-31").dist[1], 1);
  assert.strictEqual(L.total(sc), 14);
});

test("a year of play stays well under the 64 KB saved-data limit", () => {
  const state = L.cleanState(null);
  const sc = L.scopeOf(state, "free");
  let day = "2026-01-01";
  for (let i = 0; i < 365; i++) {
    sc.days[day] = { w: L.hide("spark"), n: 6, g: ["crane", "slate", "spark", "spare", "spart", "sparx"].slice(0, 6), r: "won", p: 3 };
    day = L.addDays(day, 1);
  }
  L.prune(sc, day);
  assert.ok(JSON.stringify(state).length < 20000);
});
