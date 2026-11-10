# Changelog

## Unreleased (0.2.0)

- **Made with EduGame Kit** (0.3.1). One zip now works as a Kolibri HTML5 app in a channel (added
  through Kolibri Studio, with scoreboards from Kolibri Games under "Scored Games in Learn"), a SCORM
  1.2 package for Moodle and other learning systems, and a RACHEL module, as well as on the Kolibri
  Games games page. The kit's Options button chooses light or dark, and the language.
- **French**, with its own daily words, stats and scoreboard: each language is its own board
  (`en`, `fr`), so French and English players aren't ranked together. French words are typed
  without accents, accented keys count as plain letters, and the word is shown with its accents at
  the end. The on-screen keyboard is AZERTY. The French lists are made from Grammalecte's
  dictionary and FrequencyWords (see NOTICE).
- **Scores:** each daily word now reports that day's points, and the scoreboard adds them up
  (`counts: "total"`, "Every attempt added up" on the games page), rather than reporting the running
  total with "Best attempt".
- **The save is new and small** (it fits SCORM's 4,096 characters): the latest daily word and the
  stats for each language. Progress saved by 0.1.0 on the games page isn't carried over, and 0.1.0's
  scores (on the game's single scoreboard) don't appear on the new language scoreboards.
- The English word lists and daily words are unchanged.
- Sparkle is a **Scored Game** (`"type": "scored"`), one of the three kinds of game in Kolibri
  Games 0.2.0 (Saved, Scored and Server Games), which replace Free-play Games.
- GitHub: the kit's Build and Pages workflows, at a kit release, with Dependabot; browser tests on
  the kit's test page and on the Kolibri Games games page, and a real-Kolibri test.

## 0.1.0

First version.

- One scored word a day, with points that add up on the scoreboard, and unlimited practice words.
- Coach settings for word length (4, 5 or 6 letters), number of guesses (6 or 8), a different
  daily word for each learner or the same for everyone, and turning practice off.
- Works in free play and in class challenges, each with its own daily words and scoreboard.
- Picks up a daily word where the learner left it, and records every guess for coaches.
