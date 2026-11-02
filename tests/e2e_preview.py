"""
Browser test: plays Sparkle through the real Kolibri Games page, SDK and sandbox,
using the Kolibri Games preview server. Needs Playwright with Chromium, and the
kolibri-games package (pip install, or a checkout on PYTHONPATH).

    python3 tests/e2e_preview.py [--screenshots DIR]
"""
import argparse
import os
import re
import tempfile
import threading
from http.server import ThreadingHTTPServer

from playwright.sync_api import expect

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GAME = "#/play/f-org.togetherings.sparkle"


def serve(port):
    os.environ["KOLIBRI_GAMES_PATH"] = ROOT  # finds the game/ folder
    os.environ["KOLIBRI_HOME"] = tempfile.mkdtemp(prefix="sparkle-e2e-")
    os.environ["KOLIBRI_GAMES_DEV_QUIET"] = "1"
    from kolibri_games import devserver, registry

    registry.discover(refresh=True)
    server = ThreadingHTTPServer(("127.0.0.1", port), devserver.Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server


def game_frame(page):
    frames = [f for f in page.frames if f != page.main_frame]
    for f in frames:
        if "sparkle" in (f.url or "").lower():
            return f
    return frames[0]


def saved_word(page):
    """Today's secret word, read from the learner's saved data (as a coach could)."""
    f = game_frame(page)
    return f.evaluate(
        """() => KolibriGames.getState().then(s => {
             const sc = s.scopes.free; const k = Object.keys(sc.days).sort().pop();
             return SparkleLogic.unhide(sc.days[k].w); })"""
    )


def type_word(frame, word, keyboard=True):
    for ch in word:
        if keyboard:
            frame.locator(".key[data-key='%s']" % ch).click()
        else:
            frame.locator("body").press(ch)
    frame.locator(".key[data-key='Enter']").click()


def revealed(page, frame, row):
    """Wait until every clue in a row is showing (and the game takes Enter again)."""
    expect(frame.locator(".row").nth(row).locator(".cell").last).to_have_class(re.compile(r"\b(hit|near|miss)\b"))
    page.wait_for_timeout(400)


def wrong_words(secret, n):
    out = []
    for w in ["crane", "plumb", "fight", "dowdy", "jokes", "waltz", "nymph", "sixty", "brick"]:
        if w != secret and len(out) < n:
            out.append(w)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--screenshots", default=None)
    parser.add_argument("--port", type=int, default=8798)
    args = parser.parse_args()
    from playwright.sync_api import sync_playwright

    shots = args.screenshots
    if shots:
        os.makedirs(shots, exist_ok=True)
    serve(args.port)
    base = "http://127.0.0.1:%d/" % args.port
    errors = []

    def shot(page, name):
        if shots:
            page.screenshot(path=os.path.join(shots, name))

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(viewport={"width": 1000, "height": 900})
        page.on("pageerror", lambda e: errors.append("page: %s" % e))
        page.on("console", lambda m: m.type == "error" and errors.append("console: %s" % m.text))

        # Amina: the games page lists Sparkle
        page.goto(base + "?as=amina")
        page.locator(".game", has_text="Sparkle").wait_for()
        page.goto(base + GAME)
        frame = page.frame_locator("iframe.game-frame")
        frame.locator("#btn-daily:not([disabled])").wait_for()
        shot(page, "1-home.png")

        # Today's word: one wrong guess (typed on a real keyboard), then the answer
        frame.locator("#btn-daily").click()
        frame.locator("#play:not([hidden])").wait_for()
        secret = saved_word(page)
        assert len(secret) == 5, secret
        miss = wrong_words(secret, 1)[0]
        game_frame(page).locator("body").press_sequentially(miss)
        game_frame(page).locator("body").press("Enter")
        revealed(page, frame, 0)
        # A made-up word is refused and doesn't use a guess
        type_word(frame, "zzzzz")
        frame.locator("#toast:has-text('word list')").wait_for()
        for _ in range(5):
            frame.locator(".key[data-key='Backspace']").click()
        shot(page, "2-playing.png")
        type_word(frame, secret)
        frame.locator("#result:not([hidden])").wait_for(timeout=10000)
        frame.locator("#result-standing:has-text('number 1')").wait_for(timeout=10000)
        assert "+7 points" in frame.locator("#result-points").inner_text(), frame.locator("#result-points").inner_text()
        shot(page, "3-solved.png")

        # Back home: today's word is done, stats and scoreboard show 7 points
        frame.locator("#btn-home").click()
        frame.locator("#btn-daily[disabled]").wait_for()
        assert frame.locator("#st-points").inner_text() == "7"
        frame.locator("#board tbody tr.me").wait_for()
        assert "7" in frame.locator("#board tbody tr.me").inner_text()

        # Practice: lose a word on purpose; it doesn't change the points
        frame.locator("#btn-practice").click()
        frame.locator("#mode:has-text('Practice')").wait_for()
        for i, w in enumerate(wrong_words("", 6)):
            type_word(frame, w)
            revealed(page, frame, i)
        frame.locator("#result:not([hidden])").wait_for(timeout=10000)
        assert "don't count" in frame.locator("#result-points").inner_text()
        frame.locator("#btn-home").click()
        frame.locator("#home:not([hidden])").wait_for()
        assert frame.locator("#st-points").inner_text() == "7"

        # Ben: his own word; he leaves after one guess and comes back to it
        page.goto(base + "?as=ben")
        page.goto(base + GAME)
        frame = page.frame_locator("iframe.game-frame")
        frame.locator("#btn-daily:not([disabled])").click()
        frame.locator("#play:not([hidden])").wait_for()
        ben_secret = saved_word(page)
        assert ben_secret != secret, "each learner gets their own word"
        type_word(frame, wrong_words(ben_secret, 1)[0])
        revealed(page, frame, 0)
        page.wait_for_timeout(400)  # let the saved data reach the server
        page.reload()
        frame = page.frame_locator("iframe.game-frame")
        frame.locator("#btn-daily:has-text('Continue')").click()
        revealed(page, frame, 0)  # the guess he made before leaving is still there
        type_word(frame, ben_secret)
        frame.locator("#result:not([hidden])").wait_for(timeout=10000)
        assert "+7 points" in frame.locator("#result-points").inner_text()
        frame.locator("#btn-home").click()
        frame.locator("#board tbody tr").nth(1).wait_for()
        rows = frame.locator("#board tbody tr").all_inner_texts()
        assert len(rows) == 2, rows
        shot(page, "4-scoreboard.png")

        # Phone-sized screen
        page.set_viewport_size({"width": 390, "height": 760})
        frame.locator("#btn-practice").click()
        frame.locator("#play:not([hidden])").wait_for()
        # The preview server's own bar sits over the bottom of the page; real
        # Kolibri doesn't have it, so hide it and tap every key on screen.
        page.evaluate("""() => { for (const el of document.querySelectorAll('body *')) {
            if (getComputedStyle(el).position === 'fixed' && el.textContent.includes('Preview server')) el.style.display = 'none'; } }""")
        type_word(frame, wrong_words("", 1)[0])
        revealed(page, frame, 0)
        for ch in "pl":
            frame.locator(".key[data-key='%s']" % ch).click()
        shot(page, "5-phone.png")
        browser.close()

    if errors:
        raise SystemExit("Errors in the page:\n" + "\n".join(errors))
    print("Sparkle browser test passed.")


if __name__ == "__main__":
    main()
