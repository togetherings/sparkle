#!/usr/bin/env python3
"""Build Sparkle's word lists: game/words/en.json and game/words/fr.json.

English, from the English Speller Database (SCOWL):

    git clone --depth 1 https://github.com/en-wl/wordlist scowl
    (cd scowl && make)
    python3 tools/build_words.py en scowl

French, from Grammalecte's spelling dictionary (as packaged by wooorm/dictionaries) and the
FrequencyWords list of words used in film subtitles:

    mkdir fr-src && cd fr-src
    curl -fsSLO https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/fr/index.dic
    curl -fsSLO https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/fr/index.aff
    curl -fsSLO https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fr/fr_50k.txt
    cd .. && python3 tools/build_words.py fr fr-src

Two lists for each word length (4, 5 and 6 letters):

* answers: words the game can pick as the secret word, without tools/words/<lang>/not-answers.txt
  and tools/words/<lang>/never.txt.
  - English: everyday words from the "3esl" list (about 3000 core words for English learners) at
    SCOWL's most common size (35), base forms only (so "cat" but not "cats").
  - French: the dictionary's own entries (base forms: "chat", "manger", "petit"), without names,
    among the 20,000 words used most in film subtitles.
* guesses: every other word accepted as a guess, except tools/words/<lang>/never.txt.
  - English: SCOWL size 70 in American, British and Canadian spellings, without abbreviations and
    words SCOWL marks as vulgar or offensive.
  - French: every form of every word in the dictionary (plurals, feminine forms, verb forms).

Words are written without accents (é -> e, œ -> oe), the way they're typed in the game. For French,
"accents" gives how each secret word is really written, to show at the end of a word.

Answers are stored in a fixed shuffled order (by a hash of each word), so the game can walk through
them day by day without repeating.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import unicodedata

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LENGTHS = (4, 5, 6)
WORD = re.compile(r"^[a-z]+$")
FR_MOST_USED = 20000


def plain(word):
    """The word as it's typed in the game: lower case, no accents."""
    word = word.lower().replace("œ", "oe").replace("æ", "ae")
    return "".join(c for c in unicodedata.normalize("NFD", word) if unicodedata.category(c) != "Mn")


def read_list(lang, name):
    words = set()
    with open(os.path.join(HERE, "words", lang, name), encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                words.add(plain(line))
    return words


def fits(word):
    return bool(WORD.match(word)) and len(word) in LENGTHS


# ------------------------------------------------------------------ English

def en_answer_candidates(scowl_dir):
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
            if fits(word):
                found.add(word)
    return found


def en_guess_candidates(scowl_dir):
    cmd = [
        os.path.join(scowl_dir, "scowl"), "--db", os.path.join(scowl_dir, "scowl.db"),
        "word-list", "70", "A,B,Z,C", "1", "--deaccent", "--wo-poses=abbr", "--categories=",
        "--nosuggest", "--nosuggest-suffix", "!",
    ]
    out = subprocess.run(cmd, check=True, capture_output=True, text=True, cwd=scowl_dir).stdout
    return {w for w in out.split() if fits(w)}


def english(scowl_dir):
    never = read_list("en", "never.txt")
    guesses = en_guess_candidates(scowl_dir) - never
    answers = (en_answer_candidates(scowl_dir) & guesses) - read_list("en", "not-answers.txt") - never
    return answers, guesses, {}


# ------------------------------------------------------------------- French

def hunspell_entries(dic_path):
    """(word, [flags]) for each line of a Hunspell .dic file with FLAG long (two-character flags)."""
    with open(dic_path, encoding="utf-8") as f:
        lines = f.read().split("\n")[1:]
    for line in lines:
        line = line.split("\t")[0].strip()
        if not line:
            continue
        word, _, flags = line.partition("/")
        yield word, [flags[i:i + 2] for i in range(0, len(flags) - 1, 2)]


def hunspell_suffixes(aff_path):
    rules = {}
    with open(aff_path, encoding="utf-8") as f:
        for line in f:
            p = line.split()
            if len(p) < 5 or p[0] != "SFX":
                continue
            flag, strip, add, cond = p[1], p[2], p[3], p[4]
            more = ""
            if "/" in add:
                add, more = add.split("/", 1)
            rules.setdefault(flag, []).append((
                "" if strip == "0" else strip,
                "" if add == "0" else add,
                None if cond == "." else re.compile("(?:%s)$" % cond),
                [more[i:i + 2] for i in range(0, len(more) - 1, 2)],
            ))
    return rules


def word_forms(word, flags, rules, depth=0):
    """Every form Hunspell's suffix rules make of a word. Prefix rules in this dictionary only add
    elisions (l', d', qu' ...), which the game has no use for."""
    out = []
    for flag in flags:
        for strip, add, cond, more in rules.get(flag, []):
            if (strip and not word.endswith(strip)) or (cond and not cond.search(word)):
                continue
            form = word[:len(word) - len(strip)] + add
            out.append(form)
            if depth < 1 and more:
                out.extend(word_forms(form, more, rules, depth + 1))
    return out


def french(src):
    rules = hunspell_suffixes(os.path.join(src, "index.aff"))
    rank = {}
    with open(os.path.join(src, "fr_50k.txt"), encoding="utf-8") as f:
        for i, line in enumerate(f):
            if line.split():
                rank.setdefault(line.split()[0], i + 1)
    never = read_list("fr", "never.txt")
    not_answers = read_list("fr", "not-answers.txt")
    guesses = set()
    spelled = {}  # plain answer -> how it's written, the most used spelling first
    for word, flags in hunspell_entries(os.path.join(src, "index.dic")):
        if word != word.lower() or "{}" in flags:  # names, and words the dictionary forbids
            continue
        forms = word_forms(word, flags, rules)
        if "()" not in flags:  # "()": the entry is only a stem, not a word on its own
            forms.append(word)
        guesses.update(p for p in map(plain, forms) if fits(p))
        p = plain(word)
        if "()" not in flags and fits(p) and rank.get(word, FR_MOST_USED + 1) <= FR_MOST_USED:
            spelled.setdefault(p, []).append(word)
    guesses -= never
    answers = set(spelled) - not_answers - never
    accents = {}
    for p in answers:
        best = min(spelled[p], key=lambda w: rank.get(w, FR_MOST_USED + 1))
        if best != p:
            accents[p] = best
    return answers, guesses, accents


# ------------------------------------------------------------------- output

def shuffled(words):
    return sorted(words, key=lambda w: hashlib.sha256(("sparkle:" + w).encode()).hexdigest())


def main():
    if len(sys.argv) != 3 or sys.argv[1] not in ("en", "fr"):
        sys.exit(__doc__)
    lang, src = sys.argv[1], os.path.abspath(sys.argv[2])
    answers_all, guesses_all, accents = english(src) if lang == "en" else french(src)
    data = {"answers": {}, "guesses": {}}
    for n in LENGTHS:
        answers = shuffled(w for w in answers_all if len(w) == n)
        guesses = sorted(w for w in guesses_all if len(w) == n and w not in answers_all)
        # Fixed-width strings with no separators keep the file small.
        data["answers"][str(n)] = "".join(answers)
        data["guesses"][str(n)] = "".join(guesses)
        print("%d letters: %d answers, %d more guesses" % (n, len(answers), len(guesses)))
    if accents:
        data["accents"] = dict(sorted(accents.items()))
    out = os.path.join(ROOT, "game", "words", lang + ".json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(data, f, separators=(",", ":"), ensure_ascii=False)
        f.write("\n")
    print("Wrote %s (%d KB)" % (os.path.relpath(out, ROOT), os.path.getsize(out) // 1024))


if __name__ == "__main__":
    main()
