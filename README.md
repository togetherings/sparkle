# Sparkle

A word game for [Kolibri Games](https://github.com/togetherings/kolibri-games): guess the hidden
word using letter clues. Each guess lights up its letters:

- **Gold**: the letter is in the word, in this exact spot.
- **Blue**: the letter is in the word, but in a different spot.
- **Grey**: the letter is not in the word (or not again).

Gold and blue are easy to tell apart for people with the common kinds of colour blindness.

## How it works

- **Today's word** counts on the scoreboard. There's one a day, and a learner can't replay it.
- **Practice words** are unlimited and never count. Coaches can turn them off.
- **Points** add up day after day. Playing earns 1 point; solving earns 3, plus 1 for every guess
  left over (8 points for one guess, 3 for six). So the scoreboard rewards coming back every day
  first, and solving well second. Missing a day costs nothing but the points you could have had.
- **The scoreboard** in free play shows everyone's all-time total. For a weekly or monthly
  competition, a coach makes a class challenge: it has its own scoreboard that starts at zero, its
  own daily words, and opens and closes on its own dates.

### Coach settings

| Setting | Choices | Default |
|---|---|---|
| Word length | 4, 5 or 6 letters | 5 |
| Guesses for each word | 6 or 8 | 6 |
| Daily word | A different word for each learner, or the same word for everyone | Different |
| Allow practice words | yes or no | yes |

Leave the platform's "Which attempt counts" setting on **Best attempt** (the game's default):
each daily word reports the learner's running total, so the best attempt is always their latest
total.

### Fair play

- **A different word for each learner** (the default) stops learners copying the answer from the
  person next to them. Choose the same word for everyone when you'd rather they talk about it
  afterwards; that's half the fun of daily word games.
- **The server's clock picks the day**, so changing a tablet's clock doesn't unlock tomorrow's word.
- **Every guess is recorded**, so coaches can see each learner's guesses for each day.
- Like every Kolibri Games game that scores itself, a determined learner with browser developer
  tools could find the word or change their score. The guess records make that easy for a coach
  to spot.

### Word lists

The secret words come from about 3,000 core words for learners of English, at the most common
size of the [English Speller Database](https://github.com/en-wl/wordlist) (SCOWL): 1,265 four-letter,
1,674 five-letter and 2,184 six-letter words, so no learner sees a word twice for over three years.
They leave out swear words, slurs, and words about illness, death, violence, alcohol, drugs,
religion and politics, as well as insults and slang (see `tools/words/`). Guesses can be any of
about 22,000 words in American, British or Canadian spelling, except swear words and slurs.

## Making the game zip

```bash
pip install git+https://github.com/togetherings/kolibri-games   # for kolibri-games-pack
kolibri-games-pack game          # writes dist/org.togetherings.sparkle-<version>.zip
```

An administrator installs the zip on the **Setup** page of Games in Kolibri.

To try it without Kolibri, run the preview server and open the address it prints:

```bash
kolibri-games-preview .          # finds the game/ folder
```

### Live preview on GitHub Pages

Every push to `main` publishes the game to GitHub Pages (`.github/workflows/pages.yml`), at
https://togetherings.github.io/sparkle/. It runs the way any Kolibri Games game does when opened
outside Kolibri: results stay in your own browser, there's no shared scoreboard, and the day
comes from your device's clock. Everyone gets the same daily word there, because every visitor is
the same "Preview player".

To turn it on once: in the repository's **Settings → Pages**, set **Source** to **GitHub Actions**.

## Working on Sparkle

```
game/                 the game (this folder is what goes in the zip)
  kolibri-game.json   manifest: scoring and coach settings
  index.html, style.css
  game.js             screens, Kolibri Games SDK calls
  logic.js            the rules: clues, points, daily words, saved data (no page code)
  words.js            word lists, made by tools/build_words.py
tools/build_words.py  rebuilds game/words.js from SCOWL
tools/words/          words that are never allowed, and words never picked as the answer
tests/                unit tests (Node) and a browser test (Playwright + preview server)
```

```bash
node --test tests/*.test.js                 # unit tests
python3 tests/e2e_preview.py                # browser test (needs kolibri-games and Playwright)
```

To change the word lists, edit the files in `tools/words/`, then rebuild:

```bash
git clone --depth 1 https://github.com/en-wl/wordlist scowl && (cd scowl && make)
python3 tools/build_words.py scowl
```

## Licence

MIT (see LICENSE). The word lists are made from SCOWL; see NOTICE.
