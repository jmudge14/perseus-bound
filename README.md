# Perseus Bound — web edition

A single-page React version of the Perseus Bound solo board game.

## Project layout

```
index.html                  Vite entry page
vite.config.js              Builds everything into ONE self-contained HTML file
src/main.jsx                React bootstrap
src/App.jsx                 Title screen, layout, save/resume, game-over
src/assets/                 ALL artwork (tokens, element cubes, engine parts, icon/dice/background slots).
                            Drop-in replaceable by file name; see src/assets/README.md
src/styles.css              All styling (classes prefixed `pb-` to avoid clashing with blog CSS)
src/game/constants.js       Every number/table from the rulebook (limits, costs, loot table, …)
src/game/engine.js          The rules engine: pure functions, state in → new state out
src/game/share.js           Encode/decode game state in share links (versioned, checksummed)
src/game/score.js           High-score formula for won games
src/game/highscores.js      Personal best scores (this browser)
src/components/ShareModal.jsx   The Share dialog (copy / shorten)
src/components/CreditsModal.jsx The Credits dialog (author, Claude note, source link, open-source licenses)
src/content/credits.js      Credits details: author, GitHub link, bundled licenses
src/content/rulebook.md     The full rulebook shown in the Rules panel's "Full rulebook" tab
src/game/buildInfo.js       Version / build date / commit, filled in at build time
src/game/shorten.js         Link shortening (is.gd via JSONP, no key; swap services here)
src/components/Board.jsx    6×6 star map with planets, ships and reachable squares
src/components/Pieces.jsx   Dice, ship tokens, element cubes
src/components/Panels.jsx   Ship tracker, cargo bay, engine repairs, dice tray, captain's log
src/components/ActionPanel.jsx  Step-by-step turn controls
src/components/TurnTracker.jsx  The 8-step turn bar; hover/click a step for its quick-reference card
src/components/RulesModal.jsx   In-game rules reference
scripts/smoke-test.mjs      Random-play smoke test (used by the build scripts and `npm test`)
scripts/rules-test.mjs      Rulebook scenario tests (used by the build scripts and `npm test`)
build.ps1 / build.sh        Rebuild scripts (Windows / Unix)
dist/perseus-bound.html     The built game: one self-contained file
```

## Building

Requires Node.js 18+ (https://nodejs.org, or `winget install OpenJS.NodeJS.LTS`; npm is included).

**Windows (PowerShell):**
```
.\build.ps1                    # install deps, smoke test, build
.\build.ps1 -SkipTests         # just build
.\build.ps1 -SkipInstall       # reuse node_modules (faster)
.\build.ps1 -Games 200         # longer smoke test
.\build.ps1 -Clean             # delete node_modules and dist first
```
If Windows says "running scripts is disabled", use `powershell -ExecutionPolicy Bypass -File .\build.ps1`
or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once.

**macOS / Linux / Git Bash / WSL:**
```
./build.sh                     # or: sh build.sh
./build.sh --skip-tests --skip-install --games 200 --clean
```

Both scripts do the same thing: check Node, run `npm ci` (or `npm install` if there is no lockfile), run
`scripts/smoke-test.mjs`, run `vite build`, and copy the result to **`dist/perseus-bound.html`**. That file is the
one to upload. Either script exits non-zero if any step fails, so it can be used directly in CI, for example a
GitHub Actions step `run: sh build.sh`.

Other commands:
```
npm run dev      # local dev server with hot reload while editing
npm test         # smoke test (10 random games) + rules test; `node scripts/smoke-test.mjs 500` for more
npm run test:rules  # rules test only: 44 checks checking specific rulebook rules
```

## Publishing

The game is published at **https://mudge.dev/apps/perseus-bound.html**. To update it, upload
`dist/perseus-bound.html` to `/apps/` on the site, replacing the old file.

That address appears in three places; change all three if the game ever moves:
- `PUBLIC_URL` in `src/game/share.js`: share links made from a copy opened straight from disk (`file://`)
  point here, since a `file://` link can't be opened by anyone else. The published page, another host or a
  local dev server uses its own address.
- The `canonical` and `og:url` tags in `index.html` (used by search engines and link previews).
- The examples in this README.

### Version and last-updated date

The title screen shows `v<version> · updated <date>`, and the Credits page shows the full build time. Both are
filled in automatically on every build (see `define` in `vite.config.js`):
- **Version** is `"version"` in `package.json`. Bump it there when you publish a new release.
- **Last updated** is the time the build ran.
- **Commit** (Credits page only) is the short git commit hash, with `+` if there were uncommitted changes. It's
  left out if the build isn't run inside a git repository with at least one commit. When `GITHUB_URL` is set and
  there were no uncommitted changes, it links to that commit on GitHub (the link works once the commit is pushed).

### Embedding in a blog post (optional)

To embed the game in a post so that **share links open the post** (not the game page), use:

```html
<iframe id="perseus-bound" title="Perseus Bound" allow="clipboard-write"
        style="width:100%;height:1150px;border:0"></iframe>
<script>
  // Tell the game which page share links should point to, and pass any incoming share code through.
  var pb = document.getElementById('perseus-bound');
  pb.src = 'https://mudge.dev/apps/perseus-bound.html?shareBase=' +
           encodeURIComponent(location.href.split('#')[0]) + location.hash;
</script>
```

`allow="clipboard-write"` lets the Share dialog copy from inside the iframe. Without it, the link is still shown
for players to copy by hand.

Games auto-save in the browser (localStorage), so players can close the tab and resume.

## Share links

The 🔗 Share button creates a link that lets someone else continue the current game from the same point:

```
https://mudge.dev/apps/perseus-bound.html#s=1.<payload>.<checksum>
```

- `1` is the **share version** (`SHARE_VERSION` in `src/game/share.js`). It is checked before anything else
  is decoded. Links from any other version are rejected with a message that says whether the link is older or
  newer than the game. **Bump it** whenever the packed layout, the enum lists in `share.js`, or the rules
  change in a way that would make an old link load incorrectly.
- `<payload>` is the game state, packed into a compact array, then JSON (UTF-8), then base64url. It includes
  the full board position, this turn's step status (shown in the turn tracker), and the last 5 turns of the
  Captain's Log (at most 80 entries). The dice tray isn't included. Links are typically 2.5–4 KB, under is.gd's 5,000-character limit for Shorten.
- `<checksum>` is an FNV-1a hash of `version.payload`. It catches truncated or mistyped links. It does not stop
  someone from deliberately editing a link.

The game state goes after `#`, so it is never sent to your web server and works on any static host. When
someone opens a share link, the title screen offers to load it. The game warns them first if that would replace
their own saved game. Every field is validated, so a damaged link produces an error message, not a broken game.

**Shorten** sends the full link to [is.gd](https://is.gd/apishorteningreference.php) (free, no API key), shows the
short link in the text box and copies it. is.gd doesn't send CORS headers, so the game uses its JSONP option (a
`<script>` tag with `format=json&callback=…`), which works from any page, including static hosts. Per is.gd's
terms it is only called when the player clicks Shorten, results are cached for the page visit, and links over
5,000 characters aren't sent. If shortening fails, the error message links to is.gd's own page for the same
link, which opens in a new tab with the short link ready to copy. The share code is in the `#` fragment, so
short links rely on is.gd keeping it when it redirects. (TinyURL was tried first, but its API only allows calls
from tinyurl.com.) To use a different service, edit `src/game/shorten.js`.

## High score (digital extra, not in the rulebook)

Won games get a score. In order of importance: fewer turns, then Elements left in the Cargo Bay (minus
Debt), then Ship Resources left. Weights are in `src/game/score.js`:

| | Points |
|---|---|
| Turns | 250,000 ÷ turns (rounded) |
| Each Element in cargo (Debt subtracts) | 10 |
| Each point of Fuel, Air, Food, Hull, Power | 1 |

Turn points have diminishing returns, so no upper bound on game length is needed. Around 70 turns (a
typical win) one turn is worth about 50 points, which equals 5 Elements or 50 resource points. Shorter games
are rewarded more steeply; longer games keep losing points ever more gently but never reach zero. Your top 10 wins are kept in
this browser and shown on the title screen. Finished games (won or lost) can be shared: the link opens a
view-only copy of the final board, cargo and resources, with its score compared to the viewer's best.

## Rules decisions

Where the rulebook and the printed Turn Reference differed or were ambiguous, these were confirmed by the
designer (2026-11-25). The engine follows them, and `scripts/rules-test.mjs` checks most of them.

- **Open-space travel fuel:** distance + 1 (the travel table). "2 per square" was an earlier rule.
- **Hull repair:** 2 Ti → +2 Hull. The rulebook takes precedence over the Turn Reference.
- **"Must land on planet if possible in 3":** outdated and not a rule; enemy movement now handles this.
- **Enemy movement:** the Turn Reference takes precedence: black die = horizontal, white die = vertical.
  All enemies move horizontally first, then vertically. The rulebook deliberately doesn't set an order between
  enemies (it isn't worth tracking at the table); the game moves the closest enemy first.
- **Fleeing:** a successful flee always costs exactly 3 Fuel to move 3 squares (no Power cost). It still
  follows normal movement: it stops at planets, enemies and the map edge, charges solar power on a planet,
  and can lead to another battle. A failed flee deals the 2D6 difference as damage, with no shields.
- **Hull at 0:** you survive at exactly 0, but any further Hull damage destroys you. (The rulebook's Hull
  description says "if your hull is breached"; the battle rules give the exact threshold.)
- **Challenge planet values:** each new planet's die is lowered by 1 as it's placed (1 stays 1), as with the
  physical dice, so the board always shows the real value.
- **Ransom debt:** a battle ransom you can't pay costs 2 Debt, or 4 Debt for Uranium (deliberate: carrying
  Uranium is risky). Borrowing is always 2 Debt per Element, since Uranium can't be borrowed.
- **Scanning:** every yellow die in the pool is placed; occupied coordinates are re-rolled per "Rolling
  Coordinates".

Implementation choices (not rulebook questions):

- A maintenance operation or engine repair ends the turn (one operation per turn).
- You need at least 3 Fuel to attempt to flee (implied by the rules, since a successful flee costs 3 Fuel).
- Small guard rails: Uranium can't be offered in the Uranium trade (allowed by the rules, but never useful),
  "+2 resource" loot is disabled for a full resource, and borrowing (like everything else) is limited by what's
  left in the supply.
- Two-player modes are not implemented yet (they're marked TBD in the rulebook).
