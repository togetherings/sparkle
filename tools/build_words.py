#!/usr/bin/env python3
"""Build game/words.js, Sparkle's word lists, from the English Speller Database (SCOWL).

    git clone --depth 1 https://github.com/en-wl/wordlist scowl
    (cd scowl && make)
    python3 tools/build_words.py scowl

Two lists for each word length (4, 5 and 6 letters):

* answers: words the game can pick as the secret word. Everyday words from the
  "3esl" list (about 3000 core words for English learners) at SCOWL's most
  common size (35), base forms only (so "cat" but not "cats"), without
  tools/words/not-answers.txt and tools/words/never.txt.
* guesses: every other word accepted as a guess. SCOWL size 70 in American,
  British and Canadian spellings, without abbreviations, words SCOWL marks as
  vulgar or offensive, and tools/words/never.txt.

Answers are stored in a fixed shuffled order (by a hash of each word), so the
game can walk through them day by day without repeating.
"""
import hashlib
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
OUT = os.path.join(ROOT, "game", "words.js")
LENGTHS = (4, 5, 6)
WORD = re.compile(r"^[a-z]+$")


def read_list(name):
    words = set()
    with open(os.path.join(HERE, "words", name), encoding="utf-8") as f:
        for line in f:
            line = line.strip().lower()
            if line and not line.startswith("#"):
                words.add(line)
    return words


def answer_candidates(scowl_dir):
    """Base forms tagged [3esl] at size 35, lower case, letters only."""
    found = set()
    path = os.path.join(scowl_dir, "data", "scowl-pre.txt")
    with open(path, encoding="utf-8") as f:
        for line in f:
            head, sep, rest = line.partition(": ")
            if not sep:
                continue
            m = re.match(r"(\d+)", head)
            if not m or int(m.group(1)) > 35 or "[3esl]" not in head:
                continue
            if "[name]" in head or "[upper]" in head:
                continue
            word = rest.split(" <")[0].strip()
            if WORD.match(word) and len(word) in LENGTHS:
                found.add(word)
    return found


def guess_candidates(scowl_dir):
    cmd = [
        os.path.join(scowl_dir, "scowl"), "--db", os.path.join(scowl_dir, "scowl.db"),
        "word-list", "70", "A,B,Z,C", "1", "--deaccent", "--wo-poses=abbr", "--categories=",
        "--nosuggest", "--nosuggest-suffix", "!",
    ]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True, cwd=scowl_dir).stdout
    return {w for w in out.split() if WORD.match(w) and len(w) in LENGTHS}


def shuffled(words):
    return sorted(words, key=lambda w: hashlib.sha256(("sparkle:" + w).encode()).hexdigest())


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    scowl_dir = os.path.abspath(sys.argv[1])
    never = read_list("never.txt")
    not_answers = read_list("not-answers.txt")
    guesses_all = guess_candidates(scowl_dir) - never
    answers_all = (answer_candidates(scowl_dir) & guesses_all) - not_answers - never

    data = {"answers": {}, "guesses": {}}
    for n in LENGTHS:
        answers = shuffled(w for w in answers_all if len(w) == n)
        guesses = sorted(w for w in guesses_all if len(w) == n and w not in answers_all)
        # Fixed-width strings with no separators keep the file small.
        data["answers"][str(n)] = "".join(answers)
        data["guesses"][str(n)] = "".join(guesses)
        print("%d letters: %d answers, %d more guesses" % (n, len(answers), len(guesses)))

    with open(OUT, "w", encoding="utf-8") as f:
        f.write("/* Sparkle's word lists. Made by tools/build_words.py from the English Speller Database\n")
        f.write(" * (SCOWL), Copyright 2000-2026 by Kevin Atkinson; see NOTICE. Don't edit by hand. */\n")
        f.write("window.SPARKLE_WORDS = ")
        json.dump(data, f, separators=(",", ":"))
        f.write(";\n")
    print("Wrote %s (%d KB)" % (os.path.relpath(OUT, ROOT), os.path.getsize(OUT) // 1024))


if __name__ == "__main__":
    main()
