/* Sparkle: guess the hidden word using letter clues.
 *
 * Today's word counts on the scoreboard. Each learner's saved data (KG.getState)
 * keeps their days; every finished daily word reports the learner's running
 * total of points as the attempt's score, and the scoreboard counts each
 * learner's best attempt, which is always their latest total.
 * Practice words are played in the page only and never reach the scoreboard.
 * Every daily guess is reported with KG.move, so coaches can see how it went. */
(function () {
  "use strict";
  var KG = window.KolibriGames;
  var L = window.SparkleLogic;
  var WORDS = window.SPARKLE_WORDS;
  var $ = function (id) { return document.getElementById(id); };

  var KEYS = ["qwertyuiop", "asdfghjkl", "+zxcvbnm-"];
  var REVEAL_MS = 260;
  var WIN_WORDS = ["Brilliant!", "Sparkling!", "Great job!", "Well done!", "Nice!", "Phew!", "Just in time!", "Just in time!"];

  var app = {
    info: null,
    state: L.emptyState(),
    scope: "free",
    who: "",
    settings: { length: 5, guesses: 6, word_mode: "each", practice: true },
    today: L.dateKey(new Date()),
    dicts: {},
    lastScreen: "home",
    saving: Promise.resolve()
  };
  var game = null; // the word being played

  // ------------------------------------------------------------- helpers

  function dict(n) {
    if (!app.dicts[n]) app.dicts[n] = L.dictionary(WORDS, n);
    return app.dicts[n];
  }

  function scope() { return L.scopeOf(app.state, app.scope); }

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

  function plural(n, one, many) { return n + " " + (n === 1 ? one : many); }

  /** Save this learner's data. Saves run one after another, newest last. */
  function save() {
    var data = JSON.parse(JSON.stringify(app.state));
    app.saving = app.saving.then(function () { return KG.setState(data); }).catch(function (err) {
      console.warn("Sparkle couldn't save:", err && err.message);
    });
    return app.saving;
  }

  // ---------------------------------------------------------------- home

  function renderHome() {
    var sc = scope();
    var rec = sc.days[app.today];
    var btn = $("btn-daily");
    btn.disabled = false;
    if (rec && (rec.r === "won" || rec.r === "lost")) {
      var used = rec.g ? rec.g.length : rec.c;
      $("daily-text").textContent = (rec.r === "won"
        ? "You solved it in " + plural(used, "guess", "guesses") + " and earned " + plural(rec.p, "point", "points") + "."
        : "You earned 1 point for playing.") + " Come back tomorrow for a new word.";
      btn.textContent = "Done for today";
      btn.disabled = true;
    } else if (rec && rec.g && rec.g.length) {
      $("daily-text").textContent = "You've made " + plural(rec.g.length, "guess", "guesses") + " so far. Keep going!";
      btn.textContent = "Continue today's word";
    } else {
      $("daily-text").textContent = "A new word every day. It counts on the scoreboard.";
      btn.textContent = "Play today's word";
    }
    $("practice-card").hidden = app.settings.practice === false;

    var st = L.stats(sc, app.today);
    $("st-points").textContent = st.points;
    $("st-played").textContent = st.played;
    $("st-solved").textContent = st.played ? Math.round((100 * st.won) / st.played) + "%" : "0%";
    $("st-streak").textContent = st.streak;

    var list = $("dist");
    list.innerHTML = "";
    var most = Math.max.apply(null, [1].concat(st.dist.filter(Boolean)));
    var todayUsed = rec && rec.r === "won" ? (rec.g ? rec.g.length : rec.c) : 0;
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

  function loadBoard() {
    KG.scoreboard().then(function (data) {
      var rows = (data && data.rows) || [];
      var body = $("board").querySelector("tbody");
      body.innerHTML = "";
      rows.slice(0, 10).forEach(function (r) {
        var tr = document.createElement("tr");
        if (r.me) tr.className = "me";
        [r.rank, r.name + (r.me ? " (you)" : ""), r.score].forEach(function (v, i) {
          var td = document.createElement("td");
          td.textContent = v;
          if (i === 2) td.className = "num";
          tr.appendChild(td);
        });
        body.appendChild(tr);
      });
      var ch = app.info && app.info.challenge;
      $("board-title").textContent = ch ? "Scoreboard for " + ch.title : "Scoreboard";
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

  function buildKeyboard() {
    var kb = $("keyboard");
    kb.innerHTML = "";
    KEYS.forEach(function (line) {
      var row = document.createElement("div");
      row.className = "krow";
      line.split("").forEach(function (ch) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = "key";
        if (ch === "+") {
          b.textContent = "Enter";
          b.className += " wide";
          b.dataset.key = "Enter";
        } else if (ch === "-") {
          b.innerHTML = "&#9003;";
          b.setAttribute("aria-label", "Delete letter");
          b.className += " wide";
          b.dataset.key = "Backspace";
        } else {
          b.textContent = ch;
          b.dataset.key = ch;
        }
        row.appendChild(b);
      });
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

  function paintRow(i, word, animate, done) {
    var row = rowEl(i);
    var marks = L.mark(word, game.secret);
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var step = animate && !reduce ? REVEAL_MS : 0;
    marks.forEach(function (m, j) {
      var cell = row.children[j];
      cell.textContent = word[j];
      cell.setAttribute("aria-label", word[j].toUpperCase() + ", " + (m === L.HIT ? "right spot" : m === L.NEAR ? "wrong spot" : "not in the word"));
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
      return word[i].toUpperCase() + (m === L.HIT ? " right spot" : m === L.NEAR ? " wrong spot" : " not in the word");
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
    mode.textContent = game.mode === "daily" ? "Today's word · counts" : "Practice · doesn't count";
    mode.className = "mode" + (game.mode === "daily" ? " scored" : "");
    toast("");
    show("play");
  }

  function startDaily() {
    setError("");
    var btn = $("btn-daily");
    btn.disabled = true;
    KG.start({ resume: true }).then(function (res) {
      // The server's clock decides which day it is, so changing the device's
      // clock doesn't unlock tomorrow's word. An attempt left unfinished
      // belongs to the day it was started.
      var at = res && res.attempt && res.attempt.started_at;
      var date = at ? L.dateKey(new Date(at)) : L.dateKey(new Date());
      if (date > app.today) app.today = date;
      var sc = scope();
      var rec = sc.days[date];
      if (rec && (rec.r === "won" || rec.r === "lost")) {
        return KG.abandon().then(function () {
          renderHome();
          setError("You've already played the word for " + date + ". Come back tomorrow!");
        });
      }
      var word;
      if (rec && rec.w && rec.g) {
        word = L.unhide(rec.w);
      } else {
        word = L.dailyWord(dict(app.settings.length).answers, date, app.scope,
          app.settings.word_mode === "same" ? "" : app.who);
        rec = sc.days[date] = { w: L.hide(word), n: app.settings.guesses, g: [], r: "", p: 0 };
        save();
      }
      game = {
        mode: "daily", date: date, rec: rec, secret: word, guesses: rec.g.slice(),
        allowed: rec.n || app.settings.guesses, dict: dict(word.length), over: false, busy: false
      };
      openPlay();
      if (res && res.resumed && game.guesses.length) toast("Welcome back! Your guesses are still here.", 2500);
    }).catch(function (err) {
      setError(err.message);
    }).then(function () {
      if (!game || game.mode !== "daily") renderHome();
    });
  }

  function startPractice() {
    var d = dict(app.settings.length);
    var todays = L.dailyWord(d.answers, app.today, app.scope, app.settings.word_mode === "same" ? "" : app.who);
    var word = L.practiceWord(d.answers, [todays, game && game.secret]);
    game = { mode: "practice", secret: word, guesses: [], allowed: app.settings.guesses, dict: d, over: false, busy: false };
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
    if (guess.length < game.secret.length) return shake("Not enough letters");
    if (!game.dict.isWord(guess)) return shake("That word isn't in the word list");
    var marks = L.mark(guess, game.secret);
    var solved = guess === game.secret;
    var report = game.mode === "daily"
      ? KG.move("guess", { word: guess, marks: L.code(marks), number: game.guesses.length + 1 })
      : Promise.resolve();
    game.busy = true;
    game.sending = true;
    toast("");
    report.then(function () {
      game.sending = false;
      var i = game.guesses.length;
      game.guesses.push(guess);
      game.current = "";
      if (game.mode === "daily") {
        game.rec.g = game.guesses.slice();
        if (!solved && game.guesses.length < game.allowed) save();
      }
      var last = solved || game.guesses.length >= game.allowed;
      if (last) game.over = true;
      paintRow(i, guess, true, function (m) {
        say(guess, m);
        game.busy = false;
        if (last) end(solved);
      });
    }).catch(function (err) {
      game.busy = false;
      game.sending = false;
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

  function end(solved) {
    var used = game.guesses.length;
    if (solved) celebrate();
    $("result-title").textContent = solved ? WIN_WORDS[Math.min(used, WIN_WORDS.length) - 1] : "Not this time";
    $("result-word").innerHTML = "";
    $("result-word").appendChild(document.createTextNode("The word was "));
    var b = document.createElement("b");
    b.textContent = game.secret.toUpperCase();
    $("result-word").appendChild(b);
    $("result-word").appendChild(document.createTextNode("."));
    $("result-standing").textContent = "";
    $("btn-more").hidden = app.settings.practice === false;

    if (game.mode === "practice") {
      var p = app.state.practice;
      p.played = (p.played || 0) + 1;
      if (solved) {
        p.won = (p.won || 0) + 1;
        p.dist[used - 1] = (p.dist[used - 1] || 0) + 1;
      }
      save();
      $("result-points").textContent = "Practice words don't count. You've solved " + p.won + " of " +
        plural(p.played, "practice word", "practice words") + ".";
      return showResult();
    }

    var rec = game.rec;
    var sc = scope();
    rec.r = solved ? "won" : "lost";
    rec.p = L.points(solved, used, game.allowed);
    L.prune(sc, game.date);
    var totalPoints = L.total(sc);
    $("result-points").textContent = "+" + plural(rec.p, "point", "points") + " today. You have " +
      plural(totalPoints, "point", "points") + " in total.";
    $("result-standing").textContent = "Saving your result…";
    showResult();
    save().then(function () {
      return KG.finish({
        score: totalPoints,
        detail: { date: game.date, word: game.secret, guesses: game.guesses.slice(), solved: solved, points: rec.p, total: totalPoints }
      });
    }).then(function (res) {
      var note = "";
      if (res.attempt && res.attempt.practice) {
        note = "Ask your coach to set “Which attempt counts” to “Best attempt”, so your new total shows on the scoreboard.";
      } else if (res.standing) {
        note = "You're number " + res.standing.rank + " of " + res.standing.of + " on the scoreboard.";
      }
      $("result-standing").textContent = note;
    }).catch(function (err) {
      $("result-standing").textContent = "Couldn't send your result to the scoreboard (" + err.message +
        "). It's kept, and will be added with your next word.";
    });
  }

  function showResult() {
    $("keyboard").hidden = true;
    $("result").hidden = false;
    setTimeout(function () {
      $("btn-home").focus({ preventScroll: true });
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
      if (document.activeElement && document.activeElement.tagName === "BUTTON" && !document.activeElement.dataset.key) {
        if (e.key === "Enter") return; // let Enter press a focused button
      }
      if (!$("play").hidden && game && !game.over) {
        e.preventDefault();
        press(e.key);
      }
      return;
    }
    var k = (e.key || "").toLowerCase();
    if (/^[a-z]$/.test(k)) press(k);
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
  $("btn-back").addEventListener("click", function () {
    // A daily word in progress is kept (guesses are saved) and can be continued.
    goHome();
  });
  $("btn-exit").addEventListener("click", function () { KG.exit(); });
  function openHelp() { show("help"); $("btn-help-done").focus(); }
  $("btn-help").addEventListener("click", openHelp);
  $("btn-help2").addEventListener("click", openHelp);
  $("btn-help-done").addEventListener("click", function () { show(app.lastScreen); });

  KG.on("timeup", function () {
    if (!game || game.mode !== "daily" || game.over) return;
    game.over = true;
    game.rec.r = "lost";
    game.rec.p = L.points(false, game.guesses.length, game.allowed);
    save();
    $("result-title").textContent = "Time's up";
    $("result-word").textContent = "You ran out of time for today's word.";
    $("result-points").textContent = "You still earn 1 point for playing. It reaches the scoreboard with your next word.";
    $("result-standing").textContent = "";
    showResult();
  });

  // ------------------------------------------------------------- startup

  function readSettings(s) {
    s = s || {};
    var length = parseInt(s.length, 10);
    var guesses = parseInt(s.guesses, 10);
    return {
      length: [4, 5, 6].indexOf(length) >= 0 ? length : 5,
      guesses: guesses >= 3 && guesses <= 10 ? guesses : 6,
      word_mode: s.word_mode === "same" ? "same" : "each",
      practice: s.practice !== false
    };
  }

  Promise.all([KG.ready(), KG.getState().catch(function () { return null; })]).then(function (out) {
    var info = out[0];
    app.info = info;
    app.state = L.cleanState(out[1]);
    app.settings = readSettings(info.settings);
    app.scope = info.challenge && info.challenge.id != null ? "c" + info.challenge.id : "free";
    app.who = ((info.player && info.player.name) || "").trim().toLowerCase();

    $("help-length").textContent = app.settings.length;
    $("help-guesses").textContent = app.settings.guesses;
    $("help-max").textContent = L.maxPoints(app.settings.guesses);

    var bits = [];
    if (info.challenge) bits.push("Class challenge: " + info.challenge.title + (info.challenge.class_name ? " (" + info.challenge.class_name + ")" : "") + ".");
    if (info.rules && info.rules.time_limit) bits.push("You have " + plural(Math.round(info.rules.time_limit / 60), "minute", "minutes") + " for each word.");
    if (info.preview) bits.push("Preview: results stay in this browser.");
    var role = info.player && info.player.role;
    if ((role === "coach" || role === "admin") && info.rules && info.rules.counts === "first") {
      bits.push("For coaches: Sparkle adds up points day after day, so set “Which attempt counts” to “Best attempt”.");
    }
    $("where").textContent = bits.join(" ");
    $("where").hidden = !bits.length;
    renderHome();
  }).catch(function (err) {
    setError(err.message);
    renderHome();
  });
})();
