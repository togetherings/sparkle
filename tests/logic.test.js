/* Run with: node --test tests/ */
"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const L = require("../game/logic.js");

function loadWords(lang) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "game", "words", (lang || "en") + ".json"), "utf8"));
}

function readList(lang, name) {
  return fs.readFileSync(path.join(__dirname, "..", "tools", "words", lang, name), "utf8")
    .split("\n").map((s) => s.trim()).filter((s) => s && !s.startsWith("#"))
    .map((s) => s.toLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae").normalize("NFD").replace(/[\u0300-\u036f]/g, ""));
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

test("English word lists", () => {
  const data = loadWords("en");
  for (const n of [4, 5, 6]) {
    const d = L.dictionary(data, n);
    assert.ok(d.answers.length > 1000, n + "-letter answers");
    for (const w of d.answers) {
      assert.match(w, new RegExp("^[a-z]{" + n + "}$"));
      assert.ok(d.isWord(w));
    }
  }
  const five = L.dictionary(data, 5);
  for (const w of ["crane", "about", "zebra", "color"]) assert.ok(five.isWord(w), w);
  for (const w of ["xqzvb", "shitt"]) assert.ok(!five.isWord(w), w);
  for (const w of readList("en", "never.txt")) {
    if (w.length >= 4 && w.length <= 6) assert.ok(!L.dictionary(data, w.length).isWord(w), w + " must not be accepted");
  }
});

test("French word lists: plain letters, every form accepted, accents shown at the end", () => {
  const data = loadWords("fr");
  const notAnswers = new Set(readList("fr", "not-answers.txt"));
  for (const n of [4, 5, 6]) {
    const d = L.dictionary(data, n);
    assert.ok(d.answers.length > 400, n + "-letter answers");
    for (const w of d.answers) {
      assert.match(w, new RegExp("^[a-z]{" + n + "}$"));
      assert.ok(d.isWord(w));
      assert.ok(!notAnswers.has(w), w + " is never the secret word");
    }
  }
  // Plurals, feminine forms and verb forms are guesses; accents are typed as plain letters.
  for (const w of ["chat", "chats", "petite", "mangez", "eleve", "foret", "oeuf", "garcon", "noeud"]) {
    assert.ok(L.dictionary(data, w.length).isWord(w), w);
  }
  for (const w of ["xqzv", "zzzzz", "abcdef"]) assert.ok(!L.dictionary(data, w.length).isWord(w), w);
  for (const w of readList("fr", "never.txt")) {
    if (w.length >= 4 && w.length <= 6) assert.ok(!L.dictionary(data, w.length).isWord(w), w + " must not be accepted");
  }
  assert.strictEqual(L.shown(data, "foret"), "forêt");
  assert.strictEqual(L.shown(data, "garcon"), "garçon");
  assert.strictEqual(L.shown(data, "chat"), "chat");
  assert.strictEqual(L.shown(loadWords("en"), "crane"), "crane");
});

test("typed letters lose their accents", () => {
  assert.strictEqual(L.plain("É"), "e");
  assert.strictEqual(L.plain("ç"), "c");
  assert.strictEqual(L.plain("a"), "a");
  assert.strictEqual(L.plain("Enter"), "");
  assert.strictEqual(L.plain("1"), "");
});

test("hiding words in saved games", () => {
  for (const w of ["spark", "zebra", "aaaaaa", "zzzz"]) {
    assert.notStrictEqual(L.hide(w), w);
    assert.strictEqual(L.unhide(L.hide(w)), w);
  }
});

test("stats: points, days in a row, guesses needed, each language on its own", () => {
  const save = L.cleanSave(null);
  const en = L.placeKey("free", "en");
  const fr = L.placeKey("free", "fr");
  L.addResult(save, en, "2026-10-30", true, 2, 7);
  L.addResult(save, en, "2026-10-31", false, 6, 1);
  L.addResult(save, en, "2026-11-01", true, 3, 6);
  L.addResult(save, fr, "2026-11-01", true, 1, 8);
  let st = L.stats(save, en, "2026-11-02");
  assert.strictEqual(st.points, 14);
  assert.strictEqual(st.played, 3);
  assert.strictEqual(st.won, 2);
  assert.strictEqual(st.streak, 3);
  assert.strictEqual(st.bestStreak, 3);
  assert.deepStrictEqual(st.dist, [0, 1, 1]);
  assert.strictEqual(L.stats(save, fr, "2026-11-02").points, 8);
  assert.ok(L.playedOn(save, en, "2026-11-01"));
  assert.ok(!L.playedOn(save, en, "2026-11-02"));
  // A missed day breaks the run, but not the best.
  assert.strictEqual(L.stats(save, en, "2026-11-03").streak, 0);
  L.addResult(save, en, "2026-11-04", true, 1, 8);
  st = L.stats(save, en, "2026-11-04");
  assert.strictEqual(st.streak, 1);
  assert.strictEqual(st.bestStreak, 3);
  assert.strictEqual(st.points, 22);
  // Practice counts on its own, for each language.
  assert.deepStrictEqual(L.addPractice(save, "fr", true), { played: 1, won: 1 });
  assert.deepStrictEqual(L.addPractice(save, "fr", false), { played: 2, won: 1 });
  // A save that isn't Sparkle's (or an old one) starts afresh.
  assert.deepStrictEqual(L.cleanSave({ v: 1, scopes: {} }), L.emptySave());
});

test("the save stays small: a year of play in many places fits SCORM's 4,096 characters", () => {
  const save = L.cleanSave(null);
  let day = "2026-01-01";
  for (let i = 0; i < 365; i++) {
    for (const scope of ["free", "c1", "c2", "c3", "c4", "c5", "c6", "c7"]) {
      for (const lang of ["en", "fr"]) {
        const key = L.placeKey(scope, lang);
        save.w[key] = { t: day, w: L.hide("sparkl"), n: 8, g: ["crane", "slate", "spark", "spare", "spart", "sparx", "sparq"], r: "won", p: 3 };
        L.addResult(save, key, day, true, 7, 3);
      }
    }
    day = L.addDays(day, 1);
  }
  assert.ok(Object.keys(save.s).length <= 6);
  assert.ok(JSON.stringify(save).length < 2500, JSON.stringify(save).length);
});
