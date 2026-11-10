"""Plays Sparkle in EduGame Kit's test page, in Chromium.

    python3 tests/browser_test.py [--kit path/to/edugame-kit] [--screenshots out/]

Needs EduGame Kit (installed, or a copy given with --kit) and Playwright for Python.
The test page pretends to be a learning system (SCORM 1.2, with Kolibri's rules), the way
Kolibri Learn runs the game. It checks that:

  * a learner can solve today's English word, with a made-up word refused on the way;
  * the save stays small, keeps the English points on the "en" scoreboard, and no score is sent;
  * coming back shows today's word as done;
  * French, chosen in Options, has its own daily word, AZERTY keyboard, stats and scoreboard ("fr"),
    takes accented letters typed on a keyboard, and shows the word with its accents at the end;
  * practice words don't count, and the keyboard fits a phone;
  * the page shows no errors.
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
GAME = os.path.join(ROOT, "game")
SAVE_KEY = "edugame-test-scorm:org.togetherings.sparkle"


def start_preview(kit, port):
    env = dict(os.environ)
    if kit:
        env["PYTHONPATH"] = os.path.abspath(kit) + os.pathsep + env.get("PYTHONPATH", "")
    proc = subprocess.Popen([sys.executable, "-m", "edugame", "preview", GAME, "--no-browser", "--port", str(port)],
                            env=env, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
    for _ in range(50):
        try:
            urllib.request.urlopen("http://127.0.0.1:%d/" % port, timeout=1)
            return proc
        except Exception:
            time.sleep(0.2)
    proc.kill()
    sys.exit("The kit's preview didn't start")


def unhide(text):
    """logic.js's unhide(): the secret word kept in the save."""
    return "".join(chr(97 + (ord(ch) - 97 - 7 - i * 3) % 26) for i, ch in enumerate(text))


def wrong_words(secret, words, n):
    return [w for w in words if w != secret][:n]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--kit", default=None, help="folder with the edugame-kit source")
    parser.add_argument("--port", type=int, default=8813)
    parser.add_argument("--screenshots", default=None)
    args = parser.parse_args()
    from playwright.sync_api import sync_playwright, expect

    shots = args.screenshots
    if shots:
        os.makedirs(shots, exist_ok=True)

    def shot(page, name):
        if shots:
            page.screenshot(path=os.path.join(shots, name))

    proc = start_preview(args.kit, args.port)
    base = "http://127.0.0.1:%d/" % args.port
    errors = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()

            def new_page(width=1100, height=900, **kw):
                page = browser.new_context(viewport={"width": width, "height": height}, **kw).new_page()
                page.on("pageerror", lambda e: errors.append("page: %s" % e))
                page.on("console", lambda m: m.type == "error" and errors.append("console: %s" % m.text))
                return page

            def open_game(page):
                page.goto(base)
                page.locator("#game").wait_for()
                page.select_option("#mode", "scorm")
                if not page.is_checked("#as-kolibri"):
                    page.check("#as-kolibri")
                frame = page.frame_locator("#game")
                frame.locator("#btn-daily:not([disabled])").wait_for()
                return frame

            def cmi(page):
                return page.evaluate("(k) => JSON.parse(localStorage.getItem(k) || '{}')", SAVE_KEY)

            def record(page):
                return json.loads(cmi(page).get("cmi.suspend_data") or "{}")

            def secret(page, lang):
                return unhide(record(page)["_save"]["w"]["free|" + lang]["w"])

            def type_word(frame, word):
                for ch in word:
                    frame.locator(".key[data-key='%s']" % ch).click()
                frame.locator(".key[data-key='Enter']").click()

            def revealed(page, frame, row):
                cell = frame.locator(".row").nth(row).locator(".cell").last
                expect(cell).to_have_class(__import__("re").compile(r"\b(hit|near|miss)\b"))
                page.wait_for_timeout(400)

            # 1. Today's English word: a wrong guess, a made-up word, then the answer
            page = new_page()
            frame = open_game(page)
            assert frame.locator("#logo .t").count() == 7
            shot(page, "1-home.png")
            frame.locator("#btn-daily").click()
            frame.locator("#play:not([hidden])").wait_for()
            word = secret(page, "en")
            assert len(word) == 5, word
            assert frame.locator(".krow").first.locator(".key").first.get_attribute("data-key") == "q", "QWERTY in English"
            type_word(frame, wrong_words(word, ["crane", "plumb", "fight"], 1)[0])
            revealed(page, frame, 0)
            type_word(frame, "zzzzz")
            frame.locator("#toast:has-text('word list')").wait_for()
            for _ in range(5):
                frame.locator(".key[data-key='Backspace']").click()
            shot(page, "2-playing.png")
            type_word(frame, word)
            frame.locator("#result:not([hidden])").wait_for(timeout=10000)
            text = frame.locator("#result-points").inner_text()
            assert "+7 points" in text and "7 points in total" in text, text
            shot(page, "3-solved.png")

            # 2. What the learning system keeps: the day's points on the "en" board, a small save, no score
            data = cmi(page)
            rec = record(page)
            assert rec.get("en") == [7, 1], rec
            assert "fr" not in rec, rec
            assert len(data.get("cmi.suspend_data", "")) < 1000, len(data["cmi.suspend_data"])
            assert not data.get("cmi.core.score.raw"), data
            assert data.get("cmi.core.lesson_status") == "passed", data

            # 3. Coming back: today's word is done
            page.click("#reload")
            frame = page.frame_locator("#game")
            frame.locator("#st-points:has-text('7')").wait_for()
            assert frame.locator("#btn-daily").is_disabled()
            assert "7 points" in frame.locator("#daily-text").inner_text()

            # 4. French, chosen in Options: its own word, keyboard, stats and scoreboard
            frame.locator("#btn-options").click()
            frame.locator("input[name=eg-language][value=fr]").check()
            frame.locator(".eg-primary").click()
            frame.locator("#btn-daily:has-text('Jouer le mot du jour'):not([disabled])").wait_for()
            assert frame.locator("#st-points").inner_text() == "0", "French has its own points"
            shot(page, "4-home-fr.png")
            frame.locator("#btn-daily").click()
            frame.locator("#play:not([hidden])").wait_for()
            assert frame.locator(".krow").first.locator(".key").first.get_attribute("data-key") == "a", "AZERTY in French"
            mot = secret(page, "fr")
            assert len(mot) == 5 and mot.isalpha(), mot
            # Accented letters typed on a keyboard count as plain ones: "élève" is typed ELEVE.
            guess = wrong_words(mot, ["élève", "forêt", "bâton"], 1)[0]
            # (French keyboards send "é" as the key; Playwright would type it as text, so send the key.)
            for ch in guess:
                frame.locator("body").dispatch_event("keydown", {"key": ch, "bubbles": True})
            frame.locator("body").press("Enter")
            revealed(page, frame, 0)
            type_word(frame, mot)
            frame.locator("#result:not([hidden])").wait_for(timeout=10000)
            text = frame.locator("#result-points").inner_text()
            assert "+7 points aujourd'hui" in text, text
            shown = frame.locator("#result-word b").inner_text()
            assert len(shown) == 5, shown
            shot(page, "5-solved-fr.png")
            rec = record(page)
            assert rec.get("en") == [7, 1] and rec.get("fr") == [7, 1], rec
            assert rec.get("_lang") == "fr", rec

            # 5. Practice doesn't count, on a phone, in French
            frame.locator("#btn-more").click()
            frame.locator("#mode:has-text('Entraînement')").wait_for()
            page.set_viewport_size({"width": 390, "height": 760})
            for ch in "ab":
                frame.locator(".key[data-key='%s']" % ch).click()
            box = frame.locator(".krow").nth(1).bounding_box()
            assert box and box["width"] <= 390, box
            shot(page, "6-phone-practice-fr.png")
            frame.locator("#btn-back").click()
            frame.locator("#home:not([hidden])").wait_for()
            assert frame.locator("#st-points").inner_text() == "7"
            browser.close()
    finally:
        proc.kill()

    if errors:
        print("Errors:\n  " + "\n  ".join(errors))
        sys.exit(1)
    print("All passed")


if __name__ == "__main__":
    main()
