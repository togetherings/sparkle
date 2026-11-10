/* Sparkle: guess the hidden word using letter clues.
 *
 * Made with EduGame Kit: the save helper (edugame.js) saves and scores the same way wherever
 * the game is played (a Kolibri channel, the Kolibri Games games page, Moodle, a website).
 *
 * Today's word counts on the scoreboard: each finished daily word reports that day's points,
 * and the scoreboard adds them up (scoring.counts "total"). Each language has its own daily
 * words and its own scoreboard: the board is the language ("en", "fr").
 * Practice words never reach the scoreboard. Every daily guess is reported with
 * EduGame.move, so coaches can see how it went on the games page.
 * The learner's save (logic.js, "saved games") keeps the word in progress and the stats. */
(function () {
  "use strict";
  var E = window.EduGame;
  var L = window.SparkleLogic;
  var $ = function (id) { return document.getElementById(id); };

  var REVEAL_MS = 260;
  var LOGO = ["hit", "near", "hit", "miss", "hit", "hit", "hit"];

  var app = {
    info: null,
    ready: false,
    save: L.emptySave(),
    scope: "free",
    who: "",
    lang: "en",
    settings: { length: 5, guesses: 6, word_mode: "each", practice: true },
    today: L.dateKey(new Date()),
    words: {},        // words/<lang>.json, once loaded
    dicts: {},
    lastScreen: "home"
  };
  var game = null; // the word being played

  // ------------------------------------------------------------- helpers

  function t(key, vars) { return E.t(key, vars); }
  function points(n) { return t("points", { n: n }); }
  function guesses(n) { return t("guesses", { n: n }); }

  function words() { return app.words[app.lang]; }

  function dict(n) {
    var k = app.lang + n;
    if (!app.dicts[k]) app.dicts[k] = L.dictionary(words(), n);
    return app.dicts[k];
  }

  function placeKey() { return L.placeKey(app.scope, app.lang); }

  function show(id) {
    ["home", "play", "help"].forEach(function (s) { $(s).hidden = s !== id; });
    if (id !== "help") app.lastScreen = id;
    window.scrollTo(0, 0);
  }

  function setError(text) {
    $("home-error").textContent = text || "";
    $("home-error").hidden = !text;
  }

  var toastTimer = null;
  function toast(text, ms) {
    $("toast").textContent = text || "";
    clearTimeout(toastTimer);
    if (text && ms) toastTimer = setTimeout(function () { $("toast").textContent = ""; }, ms);
  }

  /** Save the learner's progress. The helper writes at once, so this also works as the page closes. */
  function persist() {
    return E.save(JSON.parse(JSON.stringify(app.save))).catch(function (err) {
      console.warn("Sparkle couldn't save:", err && err.message);
    });
  }

  function loadWords(lang) {
    if (app.words[lang]) return Promise.resolve(app.words[lang]);
    return E.load("words/" + lang + ".json").then(function (data) {
      if (!data || !data.answers) throw new Error("The " + lang + " word list is missing.");
      app.words[lang] = data;
      return data;
    });
  }

  /** "2026-11-02" written the way the language writes dates. */
  function dateText(key) {
    var p = key.split("-");
    try {
      return new Date(+p[0], +p[1] - 1, +p[2]).toLocaleDateString(app.lang, { day: "numeric", month: "long" });
    } catch (e) {
      return key;
    }
  }

  // ---------------------------------------------------------------- home

  function renderLogo() {
    var logo = $("logo");
    var name = t("logo");
    logo.innerHTML = "";
    logo.setAttribute("aria-label", name);
    name.split("").forEach(function (ch, i) {
      var s = document.createElement("span");
      s.className = "t " + LOGO[i % LOGO.length];
      s.textContent = ch;
      s.setAttribute("aria-hidden", "true");
      logo.appendChild(s);
    });
  }

  function renderWhere() {
    var info = app.info || {};
    var bits = [];
    var ch = info.challenge;
    if (ch) bits.push(ch.class_name ? t("where.challenge_class", { title: ch.title, "class": ch.class_name }) : t("where.challenge", { title: ch.title }));
    if (info.rules && info.rules.time_limit) bits.push(t("where.minutes", { n: Math.round(info.rules.time_limit / 60) }));
    var role = info.player && info.player.role;
    if ((role === "coach" || role === "admin") && info.rules && info.rules.counts && info.rules.counts !== "total") {
      bits.push(t("where.coach_counts"));
    }
    $("where").textContent = bits.join(" ");
    $("where").hidden = !bits.length;
  }

  function renderHelp() {
    $("help-goal").textContent = t("help.goal", { length: app.settings.length, guesses: app.settings.guesses });
    $("help-points").textContent = t("help.points", { max: L.maxPoints(app.settings.guesses) });
    $("help-accents").hidden = !t("help.accents");
  }

  function renderHome() {
    renderLogo();
    renderWhere();
    renderHelp();
    var key = placeKey();
    var rec = app.save.w[key];
    var btn = $("btn-daily");
    var loaded = app.ready && !!words();
    btn.disabled = !loaded;
    $("btn-practice").disabled = !loaded;
    if (rec && rec.t === app.today && (rec.r === "won" || rec.r === "lost")) {
      $("daily-text").textContent = rec.r === "won"
        ? t("daily.solved", { guesses: guesses(rec.g.length), points: points(rec.p) })
        : t("daily.lost");
      btn.textContent = t("daily.done");
      btn.disabled = true;
    } else if (rec && !rec.r && rec.g && rec.g.length) {
      $("daily-text").textContent = t("daily.so_far", { n: rec.g.length });
      btn.textContent = t("daily.continue");
    } else {
      $("daily-text").textContent = t("daily.new");
      btn.textContent = t("daily.play");
    }
    $("practice-card").hidden = app.settings.practice === false;
    $("btn-exit").hidden = !(app.info && app.info.canExit);

    var st = L.stats(app.save, key, app.today);
    $("st-points").textContent = E.number(st.points);
    $("st-played").textContent = E.number(st.played);
    $("st-solved").textContent = (st.played ? Math.round((100 * st.won) / st.played) : 0) + "%";
    $("st-streak").textContent = E.number(st.streak);

    var list = $("dist");
    list.innerHTML = "";
    var most = Math.max.apply(null, [1].concat(st.dist.filter(Boolean)));
    var todayUsed = rec && rec.t === app.today && rec.r === "won" ? rec.g.length : 0;
    var rows = Math.max(app.settings.guesses, st.dist.length);
    for (var i = 0; i < rows; i++) {
      var n = st.dist[i] || 0;
      var li = document.createElement("li");
      var label = document.createElement("span");
      label.textContent = i + 1;
      var bar = document.createElement("span");
      bar.className = "bar" + (todayUsed === i + 1 ? " today" : "");
      bar.style.width = Math.max(8, Math.round((100 * n) / most)) + "%";
      bar.textContent = n;
      li.appendChild(label);
      li.appendChild(bar);
      list.appendChild(li);
    }
    loadBoard();
  }

  /** The scoreboard for this language. Only the Kolibri Games games page has one to show here
   *  (in Kolibri channels, coaches and learners see it on the games page). */
  function loadBoard() {
    if (!app.ready) return;
    var lang = app.lang;
    E.scoreboard({ board: lang }).then(function (data) {
      if (lang !== app.lang) return;
      // The plugin answers with another board's scoreboard when this one has nobody on it yet.
      var rows = (data && (!data.board || data.board === lang) && data.rows) || [];
      var body = $("board").querySelector("tbody");
      body.innerHTML = "";
      rows.slice(0, 10).forEach(function (r) {
        var tr = document.createElement("tr");
        if (r.me) tr.className = "me";
        var score = r.values && r.values.score !== undefined ? r.values.score : r.score;
        [r.rank, r.me ? t("board.you", { name: r.name }) : r.name, E.number(score)].forEach(function (v, i) {
          var td = document.createElement("td");
          td.textContent = v;
          if (i === 2) td.className = "num";
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      var ch = app.info && app.info.challenge;
      var title = ch ? t("board.title_challenge", { name: ch.title }) : t("board.title");
      $("board-title").textContent = title + " · " + t("board." + lang);
      $("board-wrap").hidden = rows.length === 0;
    }).catch(function () { $("board-wrap").hidden = true; });
  }

  // ------------------------------------------------------------- playing

  function buildGrid() {
    var grid = $("grid");
    grid.innerHTML = "";
    grid.style.setProperty("--rows", game.allowed);
    grid.style.setProperty("--cols", game.secret.length);
    for (var r = 0; r < game.allowed; r++) {
      var row = document.createElement("div");
      row.className = "row";
      row.setAttribute("role", "row");
      for (var c = 0; c < game.secret.length; c++) {
        var cell = document.createElement("div");
        cell.className = "cell";
        cell.setAttribute("role", "gridcell");
        row.appendChild(cell);
      }
      grid.appendChild(row);
    }
  }

  function keyButton(ch) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "key";
    if (ch === "Enter") {
      b.textContent = t("key.enter");
      b.className += " wide";
    } else if (ch === "Backspace") {
      b.innerHTML = "&#9003;";
      b.setAttribute("aria-label", t("key.delete"));
      b.className += " wide";
    } else {
      b.textContent = ch;
    }
    b.dataset.key = ch;
    return b;
  }

  /** The on-screen keyboard, laid out the way the language's keyboards are (AZERTY in French). */
  function buildKeyboard() {
    var kb = $("keyboard");
    kb.innerHTML = "";
    var lines = E.lines("keyboard");
    lines.forEach(function (line, i) {
      var row = document.createElement("div");
      row.className = "krow";
      if (i === lines.length - 1) row.appendChild(keyButton("Enter"));
      line.split("").forEach(function (ch) {
        if (L.plain(ch)) row.appendChild(keyButton(L.plain(ch)));
      });
      if (i === lines.length - 1) row.appendChild(keyButton("Backspace"));
      kb.appendChild(row);
    });
  }

  function rowEl(i) { return $("grid").children[i]; }

  function drawCurrent() {
    var row = rowEl(game.guesses.length);
    if (!row) return;
    for (var i = 0; i < game.secret.length; i++) {
      var cell = row.children[i];
      var ch = game.current[i] || "";
      cell.textContent = ch;
      cell.className = "cell" + (ch ? " filled" : "");
    }
  }

  function clue(m) { return t(m === L.HIT ? "clue.hit" : m === L.NEAR ? "clue.near" : "clue.miss"); }

  function paintRow(i, word, animate, done) {
    var row = rowEl(i);
    var marks = L.mark(word, game.secret);
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var step = animate && !reduce ? REVEAL_MS : 0;
    marks.forEach(function (m, j) {
      var cell = row.children[j];
      cell.textContent = word[j];
      cell.setAttribute("aria-label", word[j].toUpperCase() + ", " + clue(m));
      if (!step) {
        cell.className = "cell " + m;
        return;
      }
      setTimeout(function () { cell.classList.add("flip"); }, j * step);
      setTimeout(function () { cell.className = "cell flip " + m; }, j * step + step * 0.85);
    });
    setTimeout(function () {
      paintKeys();
      if (done) done(marks);
    }, step ? marks.length * step + 250 : 0);
  }

  function paintKeys() {
    var states = L.letterStates(game.guesses, game.secret);
    Array.prototype.forEach.call(document.querySelectorAll(".key"), function (k) {
      var s = states[k.dataset.key];
      k.className = "key" + (k.classList.contains("wide") ? " wide" : "") + (s ? " " + s : "");
    });
  }

  function say(word, marks) {
    $("spoken").textContent = word.toUpperCase() + ": " + marks.map(function (m, i) {
      return word[i].toUpperCase() + " " + clue(m);
    }).join(", ") + ".";
  }

  function openPlay() {
    buildGrid();
    buildKeyboard();
    game.current = "";
    game.guesses.forEach(function (g, i) { paintRow(i, g, false); });
    paintKeys();
    drawCurrent();
    $("result").hidden = true;
    $("keyboard").hidden = false;
    var mode = $("mode");
    mode.textContent = t(game.mode === "daily" ? "mode.daily" : "mode.practice");
    mode.className = "mode" + (game.mode === "daily" ? " scored" : "");
    toast("");
    show("play");
    // The button that started the word is hidden now: let Enter go to the word, not to it.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }

  function dailyFor(date) {
    return L.dailyWord(dict(app.settings.length).answers, date, app.scope,
      app.settings.word_mode === "same" ? "" : app.who);
  }

  function startDaily() {
    setError("");
    var btn = $("btn-daily");
    btn.disabled = true;
    var key = placeKey();
    var lang = app.lang;
    E.start({ board: lang, resume: true }).then(function (res) {
      // On the Kolibri Games games page the server's clock decides which day it is, so
      // changing the device's clock doesn't unlock tomorrow's word. Elsewhere it's the device's.
      var at = res && res.attempt && res.attempt.started_at;
      var date = at ? L.dateKey(new Date(at)) : L.dateKey(new Date());
      if (date > app.today) app.today = date;
      var rec = app.save.w[key];
      // A word left unfinished is carried on, on the day it was started.
      var going = rec && !rec.r && rec.g && rec.g.length && rec.w && rec.t;
      if (going) date = rec.t;
      if (!going && L.playedOn(app.save, key, date)) {
        return E.abandon().then(function () {
          renderHome();
          setError(t("daily.already", { date: dateText(date) }));
        });
      }
      var word;
      if (rec && rec.t === date && !rec.r && rec.w && Array.isArray(rec.g)) {
        word = L.unhide(rec.w);
      } else {
        word = dailyFor(date);
        rec = app.save.w[key] = { t: date, w: L.hide(word), n: app.settings.guesses, g: [], r: "", p: 0 };
        persist();
      }
      game = {
        mode: "daily", key: key, lang: lang, date: date, rec: rec, secret: word, guesses: rec.g.slice(),
        allowed: rec.n || app.settings.guesses, dict: dict(word.length), over: false, busy: false
      };
      openPlay();
      if (game.guesses.length) toast(t("welcome_back"), 2500);
    }).catch(function (err) {
      setError(err.message);
    }).then(function () {
      if (!game || game.mode !== "daily") renderHome();
    });
  }

  function startPractice() {
    var d = dict(app.settings.length);
    var word = L.practiceWord(d.answers, [dailyFor(app.today), game && game.secret]);
    game = { mode: "practice", lang: app.lang, secret: word, guesses: [], allowed: app.settings.guesses, dict: d, over: false, busy: false };
    openPlay();
  }

  function press(key) {
    // Letters can be typed while the last guess is still lighting up, but not
    // while it's being sent, and Enter waits until the clues are shown.
    if (!game || game.over || game.sending || $("play").hidden) return;
    if (key === "Enter") return game.busy ? null : submit();
    if (key === "Backspace") {
      game.current = game.current.slice(0, -1);
      return drawCurrent();
    }
    if (/^[a-z]$/.test(key) && game.current.length < game.secret.length) {
      game.current += key;
      drawCurrent();
    }
  }

  function shake(text) {
    toast(text, 1800);
    var row = rowEl(game.guesses.length);
    row.classList.remove("shake");
    void row.offsetWidth;
    row.classList.add("shake");
  }

  function submit() {
    var guess = game.current;
    if (guess.length < game.secret.length) return shake(t("not_enough"));
    if (!game.dict.isWord(guess)) return shake(t("not_a_word"));
    var marks = L.mark(guess, game.secret);
    var solved = guess === game.secret;
    var report = game.mode === "daily"
      ? E.move("guess", { word: guess, marks: L.code(marks), number: game.guesses.length + 1, language: game.lang })
      : Promise.resolve();
    game.busy = true;
    game.sending = true;
    toast("");
    var playing = game;
    report.then(function () {
      if (game !== playing) return;
      game.sending = false;
      var i = game.guesses.length;
      game.guesses.push(guess);
      game.current = "";
      if (game.mode === "daily") {
        game.rec.g = game.guesses.slice();
        if (!solved && game.guesses.length < game.allowed) persist();
      }
      var last = solved || game.guesses.length >= game.allowed;
      if (last) game.over = true;
      paintRow(i, guess, true, function (m) {
        say(guess, m);
        game.busy = false;
        if (last) end(solved);
      });
    }).catch(function (err) {
      playing.busy = false;
      playing.sending = false;
      toast(err.message);
    });
  }

  function celebrate() {
    var row = rowEl(game.guesses.length - 1);
    row.classList.add("win");
    var box = $("sparks");
    var area = box.getBoundingClientRect();
    var r = row.getBoundingClientRect();
    for (var i = 0; i < 26; i++) {
      var s = document.createElement("span");
      s.className = "spark";
      s.style.left = (r.left - area.left + Math.random() * r.width) + "px";
      s.style.top = (r.top - area.top + r.height / 2) + "px";
      s.style.setProperty("--dx", Math.round((Math.random() - 0.5) * 260) + "px");
      s.style.setProperty("--dy", Math.round(-40 - Math.random() * 200) + "px");
      s.style.animationDelay = Math.round(Math.random() * 200) + "ms";
      box.appendChild(s);
    }
    setTimeout(function () { box.innerHTML = ""; }, 1600);
  }

  function showWord() {
    var text = t("the_word_was", { word: "\u0000" }).split("\u0000");
    var el = $("result-word");
    el.innerHTML = "";
    el.appendChild(document.createTextNode(text[0] || ""));
    var b = document.createElement("b");
    b.textContent = L.shown(app.words[game.lang], game.secret).toUpperCase();
    el.appendChild(b);
    el.appendChild(document.createTextNode(text[1] || ""));
  }

  function end(solved) {
    var used = game.guesses.length;
    if (solved) celebrate();
    var win = E.lines("win");
    $("result-title").textContent = solved ? win[Math.min(used, win.length) - 1] : t("not_this_time");
    showWord();
    $("result-standing").textContent = "";
    $("btn-more").hidden = app.settings.practice === false;

    if (game.mode === "practice") {
      var p = L.addPractice(app.save, game.lang, solved);
      persist();
      $("result-points").textContent = t("practice.result", { won: p.won, played: t("practice_words", { n: p.played }) });
      return showResult();
    }

    var rec = game.rec;
    rec.r = solved ? "won" : "lost";
    rec.p = L.points(solved, used, game.allowed);
    L.addResult(app.save, game.key, game.date, solved, used, rec.p);
    var total = L.stats(app.save, game.key, game.date).points;
    $("result-points").textContent = t("points_today", { points: points(rec.p), total: points(total) });
    $("result-standing").textContent = t("saving");
    showResult();
    persist();
    E.finish({ score: rec.p }, { board: game.lang }).then(function (res) {
      var standing = res && res.platform && res.platform.standing;
      $("result-standing").textContent = standing ? t("standing", { rank: standing.rank, of: standing.of }) : "";
    }).catch(function (err) {
      $("result-standing").textContent = t("not_sent", { error: err.message });
    });
  }

  function showResult() {
    $("keyboard").hidden = true;
    $("result").hidden = false;
    setTimeout(function () {
      if ($("result").scrollIntoView) $("result").scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 50);
  }

  function goHome() {
    game = null;
    renderHome();
    show("home");
  }

  // -------------------------------------------------------------- events

  document.addEventListener("keydown", function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "Enter" || e.key === "Backspace") {
      var focused = document.activeElement;
      if (e.key === "Enter" && focused && focused.tagName === "BUTTON" && !focused.dataset.key) return; // let Enter press a focused button
      if (!$("play").hidden && game && !game.over) {
        e.preventDefault();
        press(e.key);
      }
      return;
    }
    // Accented letters count as the plain letter: "é" types "e".
    var k = L.plain(e.key);
    if (k) press(k);
  });

  $("keyboard").addEventListener("click", function (e) {
    var b = e.target.closest ? e.target.closest(".key") : null;
    if (b) {
      press(b.dataset.key);
      b.blur();
    }
  });

  $("btn-daily").addEventListener("click", startDaily);
  $("btn-practice").addEventListener("click", startPractice);
  $("btn-more").addEventListener("click", startPractice);
  $("btn-home").addEventListener("click", goHome);
  // A daily word in progress is kept (its guesses are saved) and can be continued.
  $("btn-back").addEventListener("click", goHome);
  $("btn-exit").addEventListener("click", function () { E.exit(); });
  function openHelp() { show("help"); }
  $("btn-help").addEventListener("click", openHelp);
  $("btn-help2").addEventListener("click", openHelp);
  $("btn-help-done").addEventListener("click", function () { show(app.lastScreen); });

  E.on("timeup", function () {
    if (!game || game.mode !== "daily" || game.over) return;
    game.over = true;
    game.rec.r = "lost";
    game.rec.p = 0;
    L.addResult(app.save, game.key, game.date, false, game.guesses.length, 0);
    persist();
    $("result-title").textContent = t("time_up");
    $("result-word").textContent = t("time_up.word");
    $("result-points").textContent = t("time_up.points");
    $("result-standing").textContent = "";
    showResult();
  });

  // The language changes the daily word, the word lists, the keyboard and the scoreboard.
  // A daily word in progress is kept for when the learner comes back to that language.
  E.on("languagechange", function (e) {
    app.lang = e.language;
    if (game) game = null;
    show($("help").hidden ? "home" : "help");
    renderHome();
    loadWords(app.lang).then(renderHome).catch(function (err) { setError(err.message); });
  });

  // The page is closing: save once more (Kolibri Learn only keeps saves made before this, which
  // Sparkle makes after every guess).
  E.on("leave", function () { persist(); });

  // ------------------------------------------------------------- startup

  function readSettings(s) {
    s = s || {};
    var length = parseInt(s.length, 10);
    var allowed = parseInt(s.guesses, 10);
    return {
      length: [4, 5, 6].indexOf(length) >= 0 ? length : 5,
      guesses: allowed === 8 ? 8 : 6,
      word_mode: s.word_mode === "same" ? "same" : "each",
      practice: s.practice !== false
    };
  }

  renderLogo();
  E.ready().then(function (info) {
    app.info = info;
    app.save = L.cleanSave(info.save);
    app.settings = readSettings(info.settings);
    app.scope = info.challenge && info.challenge.id != null ? "c" + info.challenge.id : "free";
    app.who = ((info.player && info.player.name) || "").trim().toLowerCase();
    app.lang = info.language;
    app.ready = true;
    renderHome();
    return loadWords(app.lang).then(renderHome);
  }).catch(function (err) {
    setError(err.message);
    renderHome();
  });
})();
