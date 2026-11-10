"""
Play steps for `edugame kolibri-test` (never put in the game's zip): the learner starts today's
word, makes one guess and leaves; coming back, the word carries on with that guess.
"""


def first_visit(game):
    game.check(game.wait_for("!document.getElementById('btn-daily').disabled"), "the home screen is ready")
    game.click("#btn-daily")
    game.check(game.wait_for("!document.getElementById('play').hidden"), "today's word opened")
    word = "chats" if game.js("EduGame.language()") == "fr" else "crane"
    for ch in word:
        game.click(".key[data-key='%s']" % ch)
    game.click(".key[data-key='Enter']")
    game.check(game.wait_for("/\\b(hit|near|miss)\\b/.test(document.querySelector('.row .cell:last-child').className)"),
               "the guess %s lit up" % word)
    game.data["solved"] = game.wait_for("!document.getElementById('result').hidden", timeout=2)
    game.expect_complete = game.data["solved"]   # only a finished word counts as done


def came_back(game):
    game.check(game.wait_for("!document.getElementById('btn-daily').disabled || %s" % ("true" if game.data["solved"] else "false")),
               "the home screen is ready")
    if game.data["solved"]:
        game.check(game.wait_for("document.getElementById('st-points').textContent !== '0'"), "came back to the day's points")
        return
    game.check(game.wait_for("/\\b1\\b/.test(document.getElementById('daily-text').textContent)"),
               "came back to: %s" % game.text("#daily-text"))
    game.click("#btn-daily")
    game.check(game.wait_for("/\\b(hit|near|miss)\\b/.test(document.querySelector('.row .cell:last-child').className)"),
               "the guess made before leaving is still there")
