# Sparkle

A word game for learners: guess the hidden word using letter clues, in English or French. Each
guess lights up its letters:

- **Gold**: the letter is in the word, in this exact spot.
- **Blue**: the letter is in the word, but in a different spot.
- **Grey**: the letter is not in the word (or not again).

Gold and blue are easy to tell apart for people with the common kinds of colour blindness.

Sparkle is a Scored Game made with [EduGame Kit](https://github.com/togetherings/edugame-kit), so the
same zip works as a Kolibri HTML5 app (with scoreboards from
[Kolibri Games](https://github.com/togetherings/kolibri-games)), a SCORM 1.2 package for Moodle and
other learning systems, and a RACHEL module.

**Play it in your browser:** https://togetherings.github.io/sparkle/ (results stay in your browser).

## How it works

- **Today's word** counts on the scoreboard. There's one a day, and a learner can't replay it.
- **Practice words** are unlimited and never count. Coaches can turn them off.
- **Points** add up day after day. Playing earns 1 point; solving earns 3, plus 1 for every guess
  left over (8 points for one guess, 3 for six). So the scoreboard rewards coming back every day
  first, and solving well second. Missing a day costs nothing but the points you could have had.
- **Languages:** English and French, chosen in **Options** (or from Kolibri's language). Each has its
  own daily word, its own stats and **its own scoreboard**, so learners playing in French aren't
  ranked against learners playing in English. A word left half-way in one language waits there.
- **The scoreboards** on the Kolibri Games games page show everyone's all-time total for each
  language. For a weekly or monthly competition, a coach makes a class challenge there: it has its
  own scoreboards that start at zero, its own daily words, and opens and closes on its own dates.

### In French

The secret words are everyday French words (base forms: *chat*, *manger*, *petit*); guesses can be
any form of any word (*chats*, *mangeons*, *petite*). Words are typed without accents (*élève* is
typed ELEVE, *œuf* is OEUF), and accented letters typed on a keyboard count as plain ones. At the
end, the word is shown with its accents. The on-screen keyboard is AZERTY.

### Coach settings (Kolibri Games games page)

| Setting | Choices | Default |
|---|---|---|
| Word length | 4, 5 or 6 letters | 5 |
| Guesses for each word | 6 or 8 | 6 |
| Daily word | A different word for each learner, or the same word for everyone | Different |
| Allow practice words | yes or no | yes |

Elsewhere (Kolibri channels, Moodle, the website) Sparkle uses the defaults. Leave the games page's
"Which attempt counts on the scoreboard" on **Every attempt added up** (the game's default): each
daily word reports that day's points, and the scoreboard adds them up.

### Fair play

- **A different word for each learner** (the default) stops learners copying the answer from the
  person next to them. Choose the same word for everyone when you'd rather they talk about it
  afterwards; that's half the fun of daily word games.
- **On the games page, the server's clock picks the day**, so changing a tablet's clock doesn't
  unlock tomorrow's word. Elsewhere the day comes from the device's clock.
- **Every guess is recorded** on the games page, so coaches can see each learner's guesses for
  each day.
- Like every game that scores itself, a determined learner with browser developer tools could find
  the word or change their score.

### Word lists

**English:** the secret words come from about 3,000 core words for learners of English, at the
most common size of the [English Speller Database](https://github.com/en-wl/wordlist) (SCOWL):
1,265 four-letter, 1,674 five-letter and 2,184 six-letter words, so no learner sees a word twice for
over three years. Guesses can be any of about 22,000 words in American, British or Canadian
spelling, except swear words and slurs.

**French:** the secret words are the words of
[Grammalecte's spelling dictionary](https://grammalecte.net/) among the 20,000 words used most in
film subtitles ([FrequencyWords](https://github.com/hermitdave/FrequencyWords)): 406 four-letter,
815 five-letter and 1,012 six-letter words. Guesses can be any of about 25,000 forms of the
dictionary's words, except swear words and slurs.

In both languages the secret words leave out swear words, slurs, and words about illness, death,
violence, alcohol, drugs, religion and politics, as well as insults, slang, names and words from
other languages (see `tools/words/`).

## Making the game zip

```bash
pip install "edugame-kit @ git+https://github.com/togetherings/edugame-kit"
edugame check game
edugame build game          # dist/sparkle-<version>.zip
edugame preview game        # the kit's test page, to play it as Kolibri Learn or Moodle would
```

Add the zip to a channel in [Kolibri Studio](https://studio.learningequality.org/) (**Add > Upload
files**), like any HTML5 app. See the kit's docs/platforms/ for Kolibri, Moodle and the others.

Every push builds the zips on GitHub (the run's **game-zips** artifact), and publishing a release
attaches them to it. The game's GitHub workflows call the kit's own, at a kit release; Dependabot
opens a pull request when a new kit release comes out (the kit's docs/UPDATING.md).

## Working on Sparkle

```
game/                   the game (this folder is what goes in the zip)
  edugame.json          what the game is: scoring, languages, coach settings
  lang/en.json, fr.json every word the game shows
  index.html, style.css
  game.js               screens, EduGame calls
  logic.js              the rules: clues, points, daily words, the save (no page code)
  words/en.json, fr.json  word lists, made by tools/build_words.py
  tests/kolibri_play.py how edugame kolibri-test plays it (not in the zip)
tools/build_words.py    rebuilds game/words/<language>.json
tools/words/<language>/ words that are never allowed, and words never picked as the answer
tests/                  unit tests (Node), and browser tests (Playwright)
```

```bash
node --test tests/*.test.js           # unit tests
python3 tests/browser_test.py         # the kit's test page, in English and French
python3 tests/games_page_test.py      # the Kolibri Games games page (needs kolibri-games)
edugame kolibri-test game             # a real Kolibri (needs kolibri)
```

To change the word lists, edit the files in `tools/words/`, then rebuild (`tools/build_words.py`
says where to get the sources):

```bash
python3 tools/build_words.py en scowl
python3 tools/build_words.py fr fr-src
```

## Licence

MIT (see LICENSE). The word lists are made from SCOWL, Grammalecte's dictionary and FrequencyWords;
see NOTICE.
