/* =========================================================
   Storm Watch: loads data/*.json and fills in the page.
   Each section renders on its own, so if one data file is
   missing the rest of the page still works.
   ========================================================= */
(function () {
  "use strict";

  const TEAM = "CAR";
  const SEASON_GAMES = 82;
  const PLAYOFF_PACE = 96; // roughly what it takes to make the playoffs
  const ET = "America/New_York";

  // Two colors per team for name badges (no logos).
  const TEAM_COLORS = {
    ANA: ["#F47A38", "#B9975B"], BOS: ["#FFB81C", "#000000"], BUF: ["#003087", "#FFB81C"],
    CGY: ["#C8102E", "#F1BE48"], CAR: ["#CE1126", "#000000"], CHI: ["#CF0A2C", "#000000"],
    COL: ["#6F263D", "#236192"], CBJ: ["#002654", "#CE1126"], DAL: ["#006847", "#8F8F8C"],
    DET: ["#CE1126", "#FFFFFF"], EDM: ["#041E42", "#FF4C00"], FLA: ["#C8102E", "#041E42"],
    LAK: ["#111111", "#A2AAAD"], MIN: ["#154734", "#A6192E"], MTL: ["#AF1E2D", "#192168"],
    NSH: ["#FFB81C", "#041E42"], NJD: ["#CE1126", "#000000"], NYI: ["#00539B", "#F47D30"],
    NYR: ["#0038A8", "#CE1126"], OTT: ["#C52032", "#C2912C"], PHI: ["#F74902", "#000000"],
    PIT: ["#000000", "#FCB514"], SJS: ["#006D75", "#EA7200"], SEA: ["#001628", "#99D9D9"],
    STL: ["#002F87", "#FCB514"], TBL: ["#002868", "#FFFFFF"], TOR: ["#00205B", "#FFFFFF"],
    UTA: ["#69B3E7", "#010101"], VAN: ["#00205B", "#00843D"], VGK: ["#B4975A", "#333F42"],
    WSH: ["#041E42", "#C8102E"], WPG: ["#041E42", "#004C97"],
  };

  const fmtDate = new Intl.DateTimeFormat("en-US", { timeZone: ET, weekday: "short", month: "short", day: "numeric" });
  const fmtTime = new Intl.DateTimeFormat("en-US", { timeZone: ET, hour: "numeric", minute: "2-digit" });
  const fmtStamp = (iso) => `${fmtDate.format(new Date(iso))} · ${fmtTime.format(new Date(iso))} ET`;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Small helpers ----------

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function need(data) {
    if (!data) throw new Error("data unavailable");
    return data;
  }

  function ordinal(n) {
    const s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function pct(x) {
    return x.toFixed(3).replace(/^0/, "");
  }

  function signed(n) {
    return n > 0 ? `+${n}` : String(n);
  }

  // Pick black or white text so badges stay readable on any team color.
  function inkFor(hex) {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#111" : "#fff";
  }

  function badge(abbrev) {
    const [c1, c2] = TEAM_COLORS[abbrev] || ["#333333", "#777777"];
    return `<span class="badge" style="--badge-1:${c1};--badge-2:${c2};--badge-ink:${inkFor(c1)}">${esc(abbrev)}</span>`;
  }

  async function loadJSON(name) {
    const res = await fetch(`data/${name}.json`, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
    return res.json();
  }

  function friendly(el) {
    const what = el.dataset.section || "data";
    el.innerHTML = `
      <div class="friendly-error" role="status">
        <svg aria-hidden="true"><use href="assets/svg/sprite.svg#puck"/></svg>
        <div><strong>Data's on a line change.</strong>The ${esc(what)} couldn't load right now. Check back soon!</div>
      </div>`;
  }

  // Render one section; on any problem show the friendly message instead.
  function section(id, render) {
    const el = document.getElementById(id);
    if (!el) return;
    try {
      render(el);
    } catch (err) {
      console.warn(`[${id}]`, err);
      friendly(el);
    }
  }

  // ---------- Game helpers ----------

  const isFinal = (g) => g.state === "FINAL" || g.state === "OFF";
  const isLive = (g) => g.state === "LIVE" || g.state === "CRIT";

  function sideOf(g) {
    const home = g.home.abbrev === TEAM;
    return { home, us: home ? g.home : g.away, them: home ? g.away : g.home };
  }

  function result(g) {
    const { home, us, them } = sideOf(g);
    const won = us.score > them.score;
    const extra = g.endedIn === "OT" || g.endedIn === "SO";
    return {
      home, us, them,
      outcome: won ? "W" : extra ? "OT" : "L",
      points: won ? 2 : extra ? 1 : 0,
      score: `${us.score}-${them.score}${extra ? ` ${g.endedIn}` : ""}`,
    };
  }

  function teamRecord(standings, abbrev) {
    const t = standings && standings.teams.find((x) => x.abbrev === abbrev);
    return t ? `${t.w}-${t.l}-${t.otl}` : "";
  }

  // ---------- Sections ----------

  function renderUpdated(meta, standings) {
    const el = document.getElementById("last-updated");
    if (meta && meta.lastUpdated) {
      const stale = Object.values(meta.sources || {}).some((s) => !s.ok);
      el.textContent = `Last updated ${fmtStamp(meta.lastUpdated)}${stale ? " · some data may be a little behind" : ""}`;
    } else {
      el.textContent = "Last update time unavailable";
    }
    const fine = document.getElementById("standings-updated");
    if (fine && standings && standings.asOf) fine.textContent = `Standings as of ${fmtStamp(standings.asOf)}. Dashed red line = playoff cutoff.`;
  }

  function renderScoreboard(el, standings) {
    const c = need(standings).teams.find((t) => t.abbrev === TEAM);
    need(c);
    const tile = (label, value, sub = "", cls = "", wide = false) => `
      <div class="score-tile${wide ? " wide" : ""}">
        <span class="score-label">${label}</span>
        <span class="score-value ${cls}">${value}</span>
        ${sub ? `<span class="score-sub">${sub}</span>` : ""}
      </div>`;
    el.innerHTML = [
      tile("Record", `${c.w}-${c.l}-${c.otl}`, "W-L-OTL", "", true),
      tile("Points", c.pts, `${c.row} ROW`),
      tile("Points %", pct(c.ptsPct)),
      tile("Metro", ordinal(c.divRank), "Division rank", "white"),
      tile("East", ordinal(c.confRank), "Conference rank", "white"),
      tile("Played", c.gp, "of 82 games", "amber"),
      tile("Remaining", Math.max(0, SEASON_GAMES - c.gp), "games left", "amber"),
      tile("Streak", esc(c.streak || "—"), `Last 10: ${esc(c.l10)}`),
    ].join("");
  }

  function renderPlayoffRace(el, standings) {
    const east = need(standings).teams.filter((t) => t.conf === "E");
    const c = need(east.find((t) => t.abbrev === TEAM));
    const wc2 = east.find((t) => t.wcRank === 2);
    const firstOut = east.find((t) => t.wcRank === 3);
    const inNow = c.wcRank <= 2;
    // In: compare to the first team out. Out: compare to the last team in.
    const rival = need(inNow ? firstOut : wc2);
    const diff = c.pts - rival.pts;

    const headline = inNow
      ? `${signed(diff)} PTS`
      : diff === 0 ? "TIED" : `${diff} PTS`;
    const status = c.wcRank === 0
      ? `In a playoff spot: ${ordinal(c.divRank)} in the Metropolitan`
      : inNow ? `Holding Wild Card #${c.wcRank}` : "Outside the playoff picture, for now";
    const versus = inNow
      ? `above ${esc(rival.common)} (${rival.abbrev}), the first team out`
      : `${diff === 0 ? "with" : "behind"} ${esc(rival.common)} (${rival.abbrev}) for the last wild card`;
    const gpGap = rival.gp - c.gp;
    const hand = gpGap > 0 ? ` Canes have ${gpGap} game${gpGap > 1 ? "s" : ""} in hand.`
      : gpGap < 0 ? ` ${rival.abbrev} has ${-gpGap} game${gpGap < -1 ? "s" : ""} in hand.` : "";

    // Ice bar: position everything on a points scale across the East.
    const pts = east.map((t) => t.pts);
    const lo = Math.min(...pts), hi = Math.max(Math.max(...pts), lo + 10);
    const pos = (p) => ((p - lo) / (hi - lo)) * 92 + 4; // keep 4% padding on each side
    const left = Math.min(pos(c.pts), pos(rival.pts)), right = Math.max(pos(c.pts), pos(rival.pts));

    const race = east.filter((t) => t.wcRank >= 1).sort((a, b) => a.wcRank - b.wcRank).slice(0, 5);
    const raceRows = race.map((t) => `
      ${t.wcRank === 3 ? '<li class="cutline" aria-hidden="true"></li>' : ""}
      <li class="${t.abbrev === TEAM ? "is-canes" : ""}">
        <span class="muted">${t.wcRank <= 2 ? `WC${t.wcRank}` : "Out"}</span>
        ${badge(t.abbrev)} ${esc(t.common)}
        <span class="pts">${t.pts} pts</span>
      </li>`).join("");

    el.innerHTML = `
      <p class="race-headline ${inNow ? "in" : "out"}">${headline}</p>
      <p class="race-status">${status}, ${versus}.${hand}</p>
      <div class="race-bar" role="img" aria-label="Canes ${c.pts} points; ${rival.abbrev} ${rival.pts} points at the playoff line">
        <div class="race-gap ${inNow ? "in" : "out"}" style="left:${left}%;width:${right - left}%"></div>
        <div class="race-cut" style="left:${pos(rival.pts)}%"></div>
        <span class="race-cut-label" style="left:${pos(rival.pts)}%">${inNow ? "First out" : "Last in"}: ${rival.abbrev} ${rival.pts}</span>
        <div class="race-puck" style="left:${pos(c.pts)}%"></div>
        <span class="race-canes-label" style="left:${pos(c.pts)}%">Canes ${c.pts}</span>
      </div>
      <h3 class="score-label" style="text-align:left;margin-bottom:8px">East wild card race</h3>
      <ul class="race-list">${raceRows}</ul>`;
  }

  let countdownTimer = null;

  function renderNextGame(el, schedule, standings) {
    const games = need(schedule).games;
    const next = games.find((g) => !isFinal(g));
    if (!next) {
      el.innerHTML = `<p class="muted">No games on the schedule right now. See you next season!</p>`;
      return;
    }
    const { home, them } = sideOf(next);
    const start = new Date(next.startUTC);
    const sideHtml = (t) => `
      <div>
        ${badge(t.abbrev)}
        <span class="team-name">${esc(t.name)}</span>
        <span class="team-rec">${teamRecord(standings, t.abbrev) || "&nbsp;"}</span>
      </div>`;

    const h2h = games.filter((g) => isFinal(g) && sideOf(g).them.abbrev === them.abbrev);
    const h2hHtml = h2h.length
      ? `<ul class="result-list">${h2h.map(resultRow).join("")}</ul>`
      : `<p class="muted" style="margin:0">First meeting of the season.</p>`;

    el.innerHTML = `
      <div id="countdown"></div>
      <div class="matchup">
        ${sideHtml(next.away)}
        <span class="at" aria-label="at">@</span>
        ${sideHtml(next.home)}
      </div>
      <p class="game-meta"><strong>${fmtDate.format(start)} · ${fmtTime.format(start)} ET</strong><br>
        ${home ? "Home" : "Away"} · ${esc(next.venue)}</p>
      <div class="h2h"><h3>This season vs ${esc(them.abbrev)}</h3>${h2hHtml}</div>`;

    const cd = el.querySelector("#countdown");
    function tick() {
      const ms = start - Date.now();
      if (isLive(next) || ms <= 0) {
        const score = next.away.score != null && isLive(next) ? ` ${next.away.abbrev} ${next.away.score} – ${next.home.score} ${next.home.abbrev}` : "";
        cd.innerHTML = `<p class="countdown-live">Puck has dropped!${esc(score)}</p>`;
        clearInterval(countdownTimer);
        return;
      }
      const s = Math.floor(ms / 1000);
      const parts = [[Math.floor(s / 86400), "Days"], [Math.floor(s / 3600) % 24, "Hrs"], [Math.floor(s / 60) % 60, "Min"], [s % 60, "Sec"]];
      cd.innerHTML = `<div class="countdown" role="timer" aria-label="Time until puck drop">${parts
        .map(([v, l]) => `<div><b>${String(v).padStart(2, "0")}</b><span>${l}</span></div>`).join("")}</div>`;
    }
    clearInterval(countdownTimer);
    tick();
    countdownTimer = setInterval(tick, 1000);
  }

  function resultRow(g) {
    const r = result(g);
    const d = new Date(g.startUTC);
    return `
      <li>
        <span class="chip ${r.outcome}" aria-label="${r.outcome === "W" ? "Win" : r.outcome === "OT" ? "Overtime loss" : "Loss"}">${r.outcome}</span>
        <span class="ha">${r.home ? "vs" : "@"}</span>
        <span>${badge(r.them.abbrev)} ${esc(r.them.name)}</span>
        <span class="when"><span class="result-score">${esc(r.score)}</span><br>${fmtDate.format(d)}</span>
      </li>`;
  }

  function renderLastFive(el, schedule) {
    const done = need(schedule).games.filter(isFinal);
    if (!done.length) {
      el.innerHTML = `<p class="muted">No games played yet this season.</p>`;
      return;
    }
    el.innerHTML = `<ul class="result-list">${done.slice(-5).reverse().map(resultRow).join("")}</ul>`;
  }

  function renderUpcoming(el, schedule) {
    const upcoming = need(schedule).games.filter((g) => !isFinal(g)).slice(0, 10);
    if (!upcoming.length) {
      el.innerHTML = `<p class="muted">Nothing on the schedule right now.</p>`;
      return;
    }
    el.innerHTML = `<ul class="sched-list">${upcoming.map((g) => {
      const { home, them } = sideOf(g);
      const d = new Date(g.startUTC);
      return `
        <li>
          <span class="ha">${home ? "vs" : "@"}</span>
          <span>${badge(them.abbrev)} ${esc(them.name)}</span>
          <span class="when">${fmtDate.format(d)}<br>${fmtTime.format(d)} ET</span>
        </li>`;
    }).join("")}</ul>`;
  }

  function renderLeaders(el, stats) {
    const skaters = need(stats).skaters;
    if (!skaters.length) throw new Error("no skaters");
    const cats = [["g", "Goals"], ["a", "Assists"], ["p", "Points"]];
    el.innerHTML = cats.map(([key, label]) => {
      const ranked = [...skaters].sort((x, y) => y[key] - x[key] || y.p - x.p || x.gp - y.gp);
      const [top, second] = ranked;
      const num = top.number != null ? String(top.number) : "";
      return `
        <div class="leader">
          ${window.Jersey.svg({ color: "red", number: num, label: `Jersey number ${num}` })}
          <div>
            <span class="stat-name">${label}</span>
            <span class="player">${esc(top.first)} ${esc(top.last)}${num ? ` <span class="muted">#${esc(num)}</span>` : ""}</span>
            <span class="stat-value">${top[key]}</span>
            ${second ? `<div class="runner-up">Next: ${esc(second.last)}${second.number != null ? ` #${second.number}` : ""} · ${second[key]}</div>` : ""}
          </div>
        </div>`;
    }).join("");
  }

  function renderPace(el, schedule) {
    const done = need(schedule).games.filter(isFinal);
    if (!done.length) {
      el.innerHTML = `<p class="muted">The chart starts after the first game.</p>`;
      return;
    }
    let total = 0;
    const series = done.map((g, i) => {
      const r = result(g);
      total += r.points;
      return { n: i + 1, pts: total, r, date: new Date(g.startUTC) };
    });
    const last = series[series.length - 1];
    const projected = Math.round((last.pts / last.n) * SEASON_GAMES);

    el.innerHTML = `
      <p class="pace-summary">On pace for <strong>${projected} points</strong> over ${SEASON_GAMES} games.
        A playoff spot usually takes about ${PLAYOFF_PACE}.</p>
      <div class="chart-wrap"><svg role="img" aria-label="Cumulative points: ${last.pts} after ${last.n} games, on pace for ${projected}"></svg><div class="chart-tip" hidden></div></div>`;
    const svg = el.querySelector("svg");
    const tip = el.querySelector(".chart-tip");
    const wrap = el.querySelector(".chart-wrap");

    function draw() {
      const W = Math.max(wrap.clientWidth, 280), H = W < 500 ? 220 : 280;
      const m = { l: 34, r: 16, t: 14, b: 26 };
      const yMax = Math.ceil(Math.max(PLAYOFF_PACE, projected, 100) / 20) * 20;
      const x = (n) => m.l + (n / SEASON_GAMES) * (W - m.l - m.r);
      const y = (p) => H - m.b - (p / yMax) * (H - m.t - m.b);

      const yTicks = [];
      for (let v = 0; v <= yMax; v += 20) yTicks.push(v);
      const xTicks = [0, 20, 40, 60, 82];
      const line = series.map((d, i) => `${i ? "L" : "M"}${x(d.n).toFixed(1)} ${y(d.pts).toFixed(1)}`).join(" ");

      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.innerHTML = `
        <g class="grid">${yTicks.map((v) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}"/>`).join("")}</g>
        <g class="axis">
          ${yTicks.map((v) => `<text x="${m.l - 8}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
          ${xTicks.map((v) => `<text x="${x(v)}" y="${H - 6}" text-anchor="middle">${v === 0 ? "Game 0" : v}</text>`).join("")}
        </g>
        <line x1="${x(0)}" y1="${y(0)}" x2="${x(SEASON_GAMES)}" y2="${y(PLAYOFF_PACE)}" stroke="#A2AAAD" stroke-width="1.5" stroke-dasharray="6 5"/>
        <text x="${x(SEASON_GAMES)}" y="${y(PLAYOFF_PACE) + 16}" text-anchor="end" fill="#a8adb3" font-size="11">Playoff pace (${PLAYOFF_PACE})</text>
        <line x1="${x(last.n)}" y1="${y(last.pts)}" x2="${x(SEASON_GAMES)}" y2="${y(projected)}" stroke="#ff3b52" stroke-opacity=".45" stroke-width="2" stroke-dasharray="2 5" stroke-linecap="round"/>
        <text x="${x(SEASON_GAMES)}" y="${y(projected) - 8}" text-anchor="end" fill="#f2f3f4" font-size="11" font-weight="700">Projected ${projected}</text>
        <path d="${line}" fill="none" stroke="#ff3b52" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${x(last.n)}" cy="${y(last.pts)}" r="5" fill="#ff3b52" stroke="#141416" stroke-width="2"/>
        <g class="hover" visibility="hidden">
          <line class="cross" y1="${m.t}" y2="${H - m.b}" stroke="#d9dee1" stroke-opacity=".5"/>
          <circle class="dot" r="5" fill="#ff3b52" stroke="#141416" stroke-width="2"/>
        </g>
        <rect x="${m.l}" y="0" width="${W - m.l - m.r}" height="${H}" fill="transparent" style="cursor:crosshair"/>`;

      const hover = svg.querySelector(".hover");
      const cross = svg.querySelector(".cross");
      const dot = svg.querySelector(".dot");
      const hit = svg.querySelector("rect");

      function show(evt) {
        const box = svg.getBoundingClientRect();
        const px = ((evt.clientX - box.left) / box.width) * W;
        const n = Math.round(((px - m.l) / (W - m.l - m.r)) * SEASON_GAMES);
        const d = series[Math.min(Math.max(n, 1), series.length) - 1];
        cross.setAttribute("x1", x(d.n)); cross.setAttribute("x2", x(d.n));
        dot.setAttribute("cx", x(d.n)); dot.setAttribute("cy", y(d.pts));
        hover.setAttribute("visibility", "visible");
        tip.hidden = false;
        tip.style.left = `${(x(d.n) / W) * 100}%`;
        tip.style.top = `${(y(d.pts) / H) * box.height}px`;
        tip.innerHTML = `<strong>Game ${d.n}: ${d.pts} pts</strong><br>${d.r.outcome} ${esc(d.r.score)} ${d.r.home ? "vs" : "@"} ${esc(d.r.them.abbrev)} · ${fmtDate.format(d.date)}`;
      }
      function hide() {
        hover.setAttribute("visibility", "hidden");
        tip.hidden = true;
      }
      hit.addEventListener("pointermove", show);
      hit.addEventListener("pointerdown", show);
      hit.addEventListener("pointerleave", hide);
    }

    draw();
    let t;
    new ResizeObserver(() => { clearTimeout(t); t = setTimeout(draw, 120); }).observe(wrap);
  }

  // ---------- Standings ----------

  const COLS = [
    ["gp", "GP"], ["w", "W"], ["l", "L"], ["otl", "OTL"], ["pts", "PTS"], ["ptsPct", "P%"],
    ["rw", "RW"], ["gf", "GF"], ["ga", "GA"], ["diff", "DIFF"], ["l10", "L10"], ["streak", "STRK"],
  ];

  function teamRow(t, rank, extraClass = "") {
    const cells = COLS.map(([k]) => {
      let v = t[k];
      if (k === "ptsPct") v = pct(v);
      if (k === "diff") v = signed(v);
      return `<td class="${k}">${esc(v)}</td>`;
    }).join("");
    const cls = [t.abbrev === TEAM ? "is-canes" : "", extraClass].filter(Boolean).join(" ");
    return `
      <tr${cls ? ` class="${cls}"` : ""}>
        <td class="rank">${rank}</td>
        <td class="team"><span class="team-cell">${badge(t.abbrev)} ${esc(t.common)}${t.clinch ? ` <span class="clinch">${esc(t.clinch)}</span>` : ""}</span></td>
        ${cells}
      </tr>`;
  }

  function table(title, body) {
    return `
      <div class="card table-card">
        <h3>${esc(title)}</h3>
        <div class="table-scroll">
          <table>
            <thead><tr><th class="rank" scope="col">#</th><th class="team" scope="col">Team</th>${COLS.map(([, h]) => `<th scope="col">${h}</th>`).join("")}</tr></thead>
            <tbody>${body}</tbody>
          </table>
        </div>
      </div>`;
  }

  const subhead = (label) => `<tr class="subhead"><td colspan="${COLS.length + 2}">${esc(label)}</td></tr>`;

  function renderStandings(el, standings, view) {
    const teams = need(standings).teams;
    const divOrder = { M: 0, A: 1, C: 2, P: 3 }; // Metro first
    if (view === "wildcard") {
      el.innerHTML = `<div class="standings-grid">${["E", "W"].map((conf) => {
        const ct = teams.filter((t) => t.conf === conf);
        const divs = [...new Set(ct.map((t) => t.div))].sort((a, b) => divOrder[a] - divOrder[b]);
        let body = divs.map((d) => {
          const top = ct.filter((t) => t.div === d && t.wcRank === 0).sort((a, b) => a.divRank - b.divRank);
          return subhead(top[0] ? top[0].divName : d) + top.map((t, i) => teamRow(t, i + 1)).join("");
        }).join("");
        const wc = ct.filter((t) => t.wcRank > 0).sort((a, b) => a.wcRank - b.wcRank);
        body += subhead("Wild Card") + wc.map((t) => teamRow(t, t.wcRank, t.wcRank === 2 ? "cutline" : "")).join("");
        return table(`${ct[0].confName} Conference`, body);
      }).join("")}</div>`;
    } else {
      const divs = [...new Set(teams.map((t) => t.div))].sort((a, b) => divOrder[a] - divOrder[b]);
      el.innerHTML = `<div class="standings-grid">${divs.map((d) => {
        const dt = teams.filter((t) => t.div === d).sort((a, b) => a.divRank - b.divRank);
        return table(`${dt[0].divName} Division`, dt.map((t) => teamRow(t, t.divRank, t.divRank === 3 ? "cutline" : "")).join(""));
      }).join("")}</div>`;
    }
  }

  function setupTabs(standings) {
    const tabs = [document.getElementById("tab-division"), document.getElementById("tab-wildcard")];
    const panel = document.getElementById("standings");
    let saved = "division";
    try { saved = localStorage.getItem("standings-view") || "division"; } catch (e) { /* storage blocked */ }

    function select(view, focus) {
      tabs.forEach((tab) => {
        const on = tab.id === `tab-${view}`;
        tab.setAttribute("aria-selected", on);
        tab.tabIndex = on ? 0 : -1;
        if (on && focus) tab.focus();
      });
      panel.setAttribute("aria-labelledby", `tab-${view}`);
      try { localStorage.setItem("standings-view", view); } catch (e) { /* storage blocked */ }
      section("standings", (el) => renderStandings(el, standings, view));
    }

    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(tab.id.replace("tab-", "")));
      tab.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const other = tabs[(i + 1) % tabs.length];
        select(other.id.replace("tab-", ""), true);
      });
    });
    select(saved === "wildcard" ? "wildcard" : "division");
  }

  // ---------- Storm Surge ----------

  function maybeCelebrate(schedule) {
    if (!schedule) return;
    const done = schedule.games.filter(isFinal);
    const last = done[done.length - 1];
    if (!last) return;
    const r = result(last);
    if (r.outcome !== "W") return;
    const surge = document.getElementById("surge");
    document.getElementById("surge-detail").textContent =
      `Canes beat the ${r.them.name} ${r.us.score}-${r.them.score} on ${fmtDate.format(new Date(last.startUTC))}`;
    surge.hidden = false;
    if (!reducedMotion) surge.classList.add("flash");
  }

  // ---------- Go ----------

  async function main() {
    const names = ["standings", "schedule", "stats", "meta"];
    const results = await Promise.allSettled(names.map(loadJSON));
    const [standings, schedule, stats, meta] = results.map((r, i) => {
      if (r.status === "rejected") console.warn(`Couldn't load ${names[i]}.json`, r.reason);
      return r.status === "fulfilled" ? r.value : null;
    });

    renderUpdated(meta, standings);
    maybeCelebrate(schedule);
    section("scoreboard", (el) => renderScoreboard(el, standings));
    section("playoff-race", (el) => renderPlayoffRace(el, standings));
    section("next-game", (el) => renderNextGame(el, schedule, standings));
    section("last-five", (el) => renderLastFive(el, schedule));
    section("upcoming", (el) => renderUpcoming(el, schedule));
    section("leaders", (el) => renderLeaders(el, stats));
    section("pace", (el) => renderPace(el, schedule));
    setupTabs(standings);
  }

  main();
})();
