# Storm Watch: a Carolina Hurricanes fan hub

A fan-made dashboard for the Carolina Hurricanes: record, playoff race, countdown to the next game, recent results, schedule, team leaders, a points-pace chart, full NHL standings, and a build-your-own-jersey toy.

> **Fan-made site. Not affiliated with the NHL or the Carolina Hurricanes.**
> All graphics are original. No official logos, jerseys or mascots are used.

## How it works

```
NHL public API ──► scripts/update_data.py ──► data/*.json ──► index.html (your browser)
                   (run by GitHub Actions
                    4× a day, or by you)
```

The website never talks to the NHL directly. A small Python script downloads the data and saves it as JSON files in `data/`, and the page just reads those files. That keeps the site fast, avoids browser cross-site (CORS) issues, and means a hiccup at the NHL's end never breaks the page.

| File | What's in it |
|---|---|
| `data/standings.json` | All 32 teams: record, points, division/conference/wild-card rank |
| `data/schedule.json` | Every Hurricanes regular-season (and playoff) game, with scores |
| `data/stats.json` | Hurricanes skaters: goals, assists, points, jersey numbers |
| `data/meta.json` | When each file was last refreshed, and any errors |

Data comes from `https://api-web.nhle.com/v1/` (`standings/now`, `club-schedule-season/CAR/now`, `club-stats/CAR/now`, `roster/CAR/current`). No API key needed.

### What if the NHL API fails?

The script only replaces a file when the download **and** a sanity check both pass (for example, standings must have exactly 32 teams). Otherwise it keeps the last good file and writes the error into `data/meta.json`. On the page, any section whose data is missing shows a friendly "Data's on a line change" message while the rest of the page keeps working.

## Run it on your computer

You need Python 3 (already on most Macs). Nothing to install.

```bash
# 1. Grab fresh data
python3 scripts/update_data.py

# 2. Start a tiny local web server
python3 -m http.server 8000

# 3. Open http://localhost:8000 in your browser (Ctrl+C in the terminal stops the server)
```

Why the server? Browsers refuse to let a page opened straight from your disk (`file://…`) load other files like `data/standings.json`. A local server makes it behave like the real website.

## Automatic updates with GitHub Actions

**GitHub Actions** is GitHub's built-in automation. A *workflow* is a recipe file in `.github/workflows/`. Ours, [`update-data.yml`](.github/workflows/update-data.yml), says:

1. **When:** at 04:00, 10:00, 16:00 and 22:00 UTC every day (about midnight, 6am, noon and 6pm Eastern), plus whenever you click **Run workflow**.
2. **What:** start a fresh Linux machine, check out this repo, run `scripts/update_data.py`.
3. **Then:** if anything in `data/` changed, commit it back to the repo as `github-actions[bot]`. GitHub Pages picks up the new commit and the live site updates within a minute or two.

Run it by hand any time:

- On GitHub: **Actions** tab → **Update NHL data** → **Run workflow**
- Or from your terminal: `gh workflow run update-data.yml` then `gh run watch`

Things to know:

- Scheduled runs can start several minutes late when GitHub is busy. That's normal.
- GitHub pauses scheduled workflows in repos with no activity for 60 days. The bot's own data commits count as activity, so this shouldn't happen, but if it does, re-enable it from the Actions tab.
- Because the bot pushes commits, run `git pull` before you start editing on your computer.

## Project layout

```
index.html                  page structure
css/styles.css              colors, fonts, layout, animations
js/app.js                   loads data/*.json and draws each section
js/jersey.js                the generic jersey drawing + jersey builder
assets/svg/                 original SVG art (crossed sticks, puck, rink lines)
scripts/update_data.py      fetches the NHL API → data/
.github/workflows/          the GitHub Actions recipe
data/                       the JSON the site reads (updated by the bot)
```

Plain HTML, CSS and JavaScript, with no build step, so GitHub Pages can serve the files as they are.

## Accessibility & motion

The radar sweep, wind streaks, puck loader and goal-light flash all switch off if your device has **Reduce motion** turned on. The page works at phone width, and standings tables scroll sideways inside their cards.
