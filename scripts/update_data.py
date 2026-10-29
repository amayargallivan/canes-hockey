#!/usr/bin/env python3
"""Fetch Carolina Hurricanes + NHL standings data and save it as JSON in data/.

Run it from the project folder:

    python3 scripts/update_data.py

Uses only Python's standard library, so there is nothing to install.

Safety rule: a data file is only replaced when its fetch AND sanity check both
pass. If the NHL API is down or returns something odd, the last good file stays
in place and the problem is recorded in data/meta.json.
"""

import json
import os
import ssl
import sys
import tempfile
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

TEAM = "CAR"
# Override with NHL_API_BASE=... to test what happens when the API is unreachable.
API_BASE = os.environ.get("NHL_API_BASE", "https://api-web.nhle.com/v1")
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
USER_AGENT = "canes-fan-site/1.0 (fan-made, non-commercial)"


def now_iso():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def ssl_context():
    """Python from python.org on macOS ships without trusted certificates.
    If that's the case, use the Mac's built-in list so HTTPS still verifies."""
    ctx = ssl.create_default_context()
    if not ctx.get_ca_certs() and os.path.exists("/etc/ssl/cert.pem"):
        ctx.load_verify_locations("/etc/ssl/cert.pem")
    return ctx


SSL_CONTEXT = ssl_context()


def fetch_json(path):
    """Download one API endpoint and parse it as JSON."""
    req = urllib.request.Request(f"{API_BASE}/{path}", headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(req, timeout=30, context=SSL_CONTEXT) as resp:
        return json.load(resp)


def read_json(name):
    """Read an existing data file, or return None if it's missing or broken."""
    try:
        return json.loads((DATA_DIR / name).read_text())
    except (OSError, ValueError):
        return None


def write_json(name, payload):
    """Write to a temp file first, then swap it in, so a crash never leaves half a file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=DATA_DIR, suffix=".tmp")
    os.chmod(tmp, 0o644)
    with os.fdopen(fd, "w") as f:
        json.dump(payload, f, indent=1, ensure_ascii=False)
        f.write("\n")
    os.replace(tmp, DATA_DIR / name)


def text(field):
    """The API wraps names like {"default": "Carolina", "fr": "Caroline"}."""
    if isinstance(field, dict):
        return field.get("default", "")
    return field or ""


# ---------- Standings ----------

def build_standings():
    raw = fetch_json("standings/now")
    teams = []
    for t in raw.get("standings", []):
        teams.append({
            "abbrev": text(t["teamAbbrev"]),
            "name": text(t["teamName"]),
            "place": text(t.get("placeName")),
            "common": text(t.get("teamCommonName")),
            "conf": t["conferenceAbbrev"],
            "confName": t["conferenceName"],
            "div": t["divisionAbbrev"],
            "divName": t["divisionName"],
            "divRank": t["divisionSequence"],
            "confRank": t["conferenceSequence"],
            "leagueRank": t["leagueSequence"],
            # 0 = top 3 in division, 1-2 = wild card spots, 3+ = outside
            "wcRank": t["wildcardSequence"],
            "gp": t["gamesPlayed"],
            "w": t["wins"],
            "l": t["losses"],
            "otl": t["otLosses"],
            "pts": t["points"],
            "ptsPct": round(t["pointPctg"], 3),
            "rw": t["regulationWins"],
            "row": t["regulationPlusOtWins"],
            "gf": t["goalFor"],
            "ga": t["goalAgainst"],
            "diff": t["goalDifferential"],
            "l10": f'{t["l10Wins"]}-{t["l10Losses"]}-{t["l10OtLosses"]}',
            "streak": f'{t.get("streakCode", "")}{t.get("streakCount", "")}',
            "clinch": t.get("clinchIndicator", ""),
        })
    if len(teams) != 32 or not any(t["abbrev"] == TEAM for t in teams):
        raise ValueError(f"expected 32 teams including {TEAM}, got {len(teams)}")
    return {"asOf": raw.get("standingsDateTimeUtc"), "teams": teams}


# ---------- Schedule ----------

def team_side(t):
    return {
        "abbrev": t["abbrev"],
        "name": f'{text(t.get("placeName"))} {text(t.get("commonName"))}'.strip(),
        "score": t.get("score"),
    }


def build_schedule():
    raw = fetch_json(f"club-schedule-season/{TEAM}/now")
    games = []
    for g in raw.get("games", []):
        # 2 = regular season, 3 = playoffs. Skip preseason (1).
        if g.get("gameType") not in (2, 3):
            continue
        games.append({
            "id": g["id"],
            "type": g["gameType"],
            "date": g["gameDate"],
            "startUTC": g["startTimeUTC"],
            # FUT/PRE = upcoming, LIVE/CRIT = in progress, FINAL/OFF = finished
            "state": g["gameState"],
            "venue": text(g.get("venue")),
            "home": team_side(g["homeTeam"]),
            "away": team_side(g["awayTeam"]),
            # REG, OT, or SO: tells a regulation loss apart from an overtime loss
            "endedIn": (g.get("gameOutcome") or {}).get("lastPeriodType"),
        })
    if not games:
        raise ValueError("no regular-season games found")
    return {"season": raw.get("currentSeason"), "team": TEAM, "games": games}


# ---------- Player stats ----------

def build_stats(previous):
    raw = fetch_json(f"club-stats/{TEAM}/now")

    # Jersey numbers live in the roster, not the stats feed. If the roster
    # fetch fails, fall back to numbers we saved last time.
    numbers = {p["id"]: p.get("number") for p in (previous or {}).get("skaters", [])}
    try:
        roster = fetch_json(f"roster/{TEAM}/current")
        for group in ("forwards", "defensemen", "goalies"):
            for p in roster.get(group, []):
                numbers[p["id"]] = p.get("sweaterNumber")
    except Exception as e:  # noqa: BLE001 - roster is optional
        print(f"  ! roster unavailable, reusing saved jersey numbers ({e})")

    skaters = [{
        "id": p["playerId"],
        "first": text(p["firstName"]),
        "last": text(p["lastName"]),
        "number": numbers.get(p["playerId"]),
        "pos": p.get("positionCode"),
        "gp": p.get("gamesPlayed", 0),
        "g": p.get("goals", 0),
        "a": p.get("assists", 0),
        "p": p.get("points", 0),
    } for p in raw.get("skaters", [])]
    if not skaters:
        raise ValueError("no skaters in stats response")
    return {"season": raw.get("season"), "skaters": skaters}


# ---------- Main ----------

def main():
    meta = read_json("meta.json") or {}
    sources = meta.get("sources", {})
    jobs = {
        "standings": build_standings,
        "schedule": build_schedule,
        "stats": lambda: build_stats(read_json("stats.json")),
    }

    ok_count = 0
    for name, build in jobs.items():
        status = sources.get(name, {})
        status["lastAttempt"] = now_iso()
        try:
            payload = build()
            write_json(f"{name}.json", payload)
            status.update(ok=True, lastSuccess=status["lastAttempt"], error=None)
            ok_count += 1
            print(f"  ✓ {name}")
        except Exception as e:  # noqa: BLE001 - any failure means "keep the old file"
            status.update(ok=False, error=f"{type(e).__name__}: {e}")
            print(f"  ✗ {name}: kept previous data ({status['error']})")
        sources[name] = status

    meta["lastRun"] = now_iso()
    meta["sources"] = sources
    successes = [s["lastSuccess"] for s in sources.values() if s.get("lastSuccess")]
    meta["lastUpdated"] = max(successes) if successes else None
    write_json("meta.json", meta)

    print(f"Done: {ok_count}/{len(jobs)} sources updated.")
    # Only fail outright if nothing at all worked, so a single hiccup doesn't
    # mark the GitHub Action as broken.
    return 0 if ok_count else 1


if __name__ == "__main__":
    sys.exit(main())
