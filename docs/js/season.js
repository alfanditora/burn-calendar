// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// "This season": is the year running ahead of normal, when is the fire season, does the run-up predict
// the peak, where is it unusual, and (analyst view) a plain-text situation brief.
// Everything follows the month shown on the map and uses only the harmonized data in data/.

const fmtk = (n) => (n >= 1e6 ? `${fmt(n / 1e6, 1)}M` : n >= 1e4 ? `${fmt(n / 1e3)}k` : n >= 1e3 ? `${fmt(n / 1e3, 1)}k` : fmt(n));
const LABEL_ICON = { "Well above normal": "🔥", "Above normal": "🟠", "Normal": "🟢", "Below normal": "🌿", "No baseline": "•" };
const isAnalyst = () => document.body.dataset.mode === "analyst";

// Cumulative monthly counts Jan..upto for a year (null if a month is missing).
function cumulative(year, upto) {
  const out = [];
  let s = 0;
  for (let m = 1; m <= upto; m++) {
    const e = calEntry(year, m);
    if (!e) return null;
    s += e.count; out.push(s);
  }
  return out;
}

function trackerData(y, m) {
  const curves = completeYears().filter((yy) => yy < y).map((yy) => ({ year: yy, c: cumulative(yy, 12) })).filter((r) => r.c);
  const cur = cumulative(y, m);
  if (!cur || curves.length < MIN_BASE_YEARS) return { y, m, cur, enough: false };
  const median = (a) => { const h = a.length >> 1; return a.length % 2 ? a[h] : (a[h - 1] + a[h]) / 2; };
  const band = Array.from({ length: 12 }, (_, k) => {
    const a = curves.map((r) => r.c[k]).sort((p, q) => p - q);
    return { lo: a[0], hi: a[a.length - 1], med: median(a) };
  });
  const worst = curves.reduce((p, q) => (q.c[11] > p.c[11] ? q : p));
  // Closest earlier year so far: smallest mean |log ratio| between the cumulative curves, Jan..m.
  let analog = null, best = Infinity;
  for (const r of curves) {
    let d = 0;
    for (let k = 0; k < m; k++) d += Math.abs(Math.log((cur[k] + 1) / (r.c[k] + 1)));
    if (d < best) { best = d; analog = r; }
  }
  const usual = band[m - 1].med;
  const ratio = usual > 0 ? cur[m - 1] / usual : null;
  return { y, m, cur, curves, band, worst, analog, usual, ratio, enough: true };
}

function ratioText(r) {
  if (r == null) return "no usual level to compare";
  if (r >= 1.5) return `${fmt(r, 1)}× a typical year`;
  if (r <= 0.67) return `${fmt(r * 100)}% of a typical year`;
  return `${pct((r - 1) * 100)} vs a typical year`;
}

function drawTracker(t) {
  // Logical size follows the on-screen width, so the labels stay readable on phones.
  const c = $("tracker"), W = Math.max(360, Math.min(640, c.clientWidth || 640)), H = Math.round(W * 0.47), dpr = 2;
  c.width = W * dpr; c.height = H * dpr;
  const ctx = c.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.font = "17px VT323, monospace";
  if (!t.enough) {
    ctx.fillStyle = "#6b5634";
    ctx.fillText(`Not enough earlier years to compare ${t.y} with (needs ${MIN_BASE_YEARS}).`, 16, 40);
    return;
  }
  const L = 50, R = 46, T = 26, B = 28, pw = W - L - R, ph = H - T - B;
  const ymax = Math.max(t.band[11].hi, ...t.cur) * 1.05;
  const X = (k) => L + (k / 11) * pw, Y = (v) => T + ph - (v / ymax) * ph;
  ctx.strokeStyle = "rgba(122,74,34,0.2)"; ctx.fillStyle = "#6b5634"; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const v = (ymax * i) / 4, yy = Y(v);
    ctx.beginPath(); ctx.moveTo(L, yy); ctx.lineTo(L + pw, yy); ctx.stroke();
    ctx.textAlign = "right"; ctx.fillText(fmtk(v), L - 6, yy + 5);
  }
  ctx.textAlign = "center";
  MONTHS.forEach((mn, k) => { ctx.fillStyle = k === t.m - 1 ? "#c2410c" : "#6b5634"; ctx.fillText(mn, X(k), H - 8); });
  // Shaded range: lowest to highest earlier year.
  ctx.fillStyle = "rgba(122,74,34,0.16)";
  ctx.beginPath();
  t.band.forEach((b, k) => (k ? ctx.lineTo(X(k), Y(b.hi)) : ctx.moveTo(X(k), Y(b.hi))));
  for (let k = 11; k >= 0; k--) ctx.lineTo(X(k), Y(t.band[k].lo));
  ctx.closePath(); ctx.fill();
  const line = (vals, col, w, dash = []) => {
    ctx.strokeStyle = col; ctx.lineWidth = w; ctx.setLineDash(dash);
    ctx.beginPath(); vals.forEach((v, k) => (k ? ctx.lineTo(X(k), Y(v)) : ctx.moveTo(X(k), Y(v)))); ctx.stroke();
    ctx.setLineDash([]);
  };
  line(t.worst.c, "#c92a2a", 2, [3, 4]);
  if (t.analog !== t.worst) line(t.analog.c, "#1c7ed6", 2, [3, 4]);
  line(t.band.map((b) => b.med), "#6b5634", 2.5, [8, 5]);
  line(t.cur, "#c2410c", 5);
  // Labels at the right end, nudged apart so they never overlap.
  const labels = [[String(t.worst.year), t.worst.c[11], "#c92a2a"], ["usual", t.band[11].med, "#6b5634"]];
  if (t.analog !== t.worst) labels.push([String(t.analog.year), t.analog.c[11], "#1c7ed6"]);
  labels.map((l) => [...l, Y(l[1])]).sort((a, b) => a[3] - b[3]).reduce((prev, l) => {
    const yy = Math.max(l[3], prev + 17);
    ctx.fillStyle = l[2]; ctx.textAlign = "left"; ctx.fillText(l[0], L + pw + 6, yy + 5);
    return yy;
  }, -Infinity);
  const k = t.m - 1, px = X(k), py = Y(t.cur[k]);
  ctx.fillStyle = "#c2410c"; ctx.fillRect(px - 6, py - 6, 12, 12);
  ctx.font = "20px VT323, monospace"; ctx.textAlign = k > 7 ? "right" : "left";
  ctx.fillText(`${t.y}: ${fmtk(t.cur[k])}`, px + (k > 7 ? -12 : 12), Math.max(T, py - 10));
}

function seasonPhase(s, m) {
  if (!s) return "";
  if (s.peak_months.includes(m)) return "🔥 in the busiest months of the fire season";
  if (s.season_months.includes(m)) return "inside the fire season";
  const n = (s.season_months[0] - m + 12) % 12;
  return `fire season usually starts in about ${n} month${n === 1 ? "" : "s"}`;
}

function renderWhen(y, m) {
  const s = App.area.season;
  if (!s) { $("season-when").innerHTML = "<h3>When is fire season?</h3><p>Not enough complete years yet.</p>"; return; }
  const max = Math.max(...s.monthly_share_pct);
  const bars = s.monthly_share_pct.map((v, k) => {
    const cls = [s.peak_months.includes(k + 1) ? "peak" : s.season_months.includes(k + 1) ? "in" : "", k + 1 === m ? "now" : ""].join(" ");
    return `<div class="sbar ${cls}" title="${MONTHS[k]}: ${fmt(v, 1)}% of a typical year"><i style="height:${Math.max(3, (v / max) * 100)}%"></i><span>${MONTHS[k][0]}</span></div>`;
  }).join("");
  $("season-when").innerHTML = `<h3>📅 When is fire season?</h3>
    <p>In ${App.area.name}, most fire hotspots (${fmt(s.season_share_pct)}% of a typical year) fall in <b>${s.season_label}</b>.
      The busiest ${s.peak_months.length} months are <b>${s.peak_label}</b>.</p>
    <div class="sbars" aria-hidden="true">${bars}</div>
    <p class="phase">${MONTHS[m - 1]} ${y}: <b>${seasonPhase(s, m)}</b></p>`;
}

// Hindcast counts from the pipeline's per-year table, leaving out the year being described.
function signalStats(e, skipYear) {
  const rows = e.years.filter((r) => r.peak_anomaly_pct != null && r.year !== skipYear);
  const k = { a: 0, b: 0, c: 0, d: 0 };
  for (const r of rows) {
    const l = r.lead_anomaly_pct >= e.above_pct, p = r.peak_anomaly_pct >= e.above_pct;
    k[l ? (p ? "a" : "b") : (p ? "c" : "d")]++;
  }
  const yrs = rows.length ? `${rows[0].year}–${rows[rows.length - 1].year}` : "";
  return { ...k, n: rows.length, base: rows.length ? ((k.a + k.c) / rows.length) * 100 : null,
           yrs: skipYear >= rows[0]?.year && skipYear <= rows[rows.length - 1]?.year ? `${yrs} (other years)` : yrs };
}

// Early signal as plain sentences (also used by the brief).
function signalText(y, m) {
  const e = App.area.early_warning;
  if (!e) return { lines: ["No early signal for this area."], row: null };
  const row = e.years.find((r) => r.year === y);
  const leadEnd = e.lead_months[e.lead_months.length - 1], peakEnd = e.peak_months[e.peak_months.length - 1];
  if (!row) return { lines: [`Not enough earlier years before ${y} to judge its ${e.lead_label}.`], row: null };
  if (m < leadEnd) {
    return { lines: [`The run-up months (${e.lead_label}) of ${y} are not over yet; check after ${MONTHS_LONG[leadEnd - 1]}.`], row: null };
  }
  const la = row.lead_anomaly_pct, up = la >= e.above_pct, k = signalStats(e, y), yrs = k.yrs;
  const lines = [`The run-up, ${e.lead_label} ${y}, was ${pct(la)} vs normal (${labelFor(la).toLowerCase()}).`];
  if (up) {
    lines.push(`In ${yrs}, when ${e.lead_label} was above normal, ${e.peak_label} was above normal too in ` +
      `${k.a} of ${k.a + k.b} years (in all years: ${fmt(k.base)}%).`);
  } else {
    lines.push(`In ${yrs}, when ${e.lead_label} was not above normal, ${e.peak_label} stayed not above normal in ` +
      `${k.d} of ${k.c + k.d} years.`);
  }
  if (m >= peakEnd && row.peak_anomaly_pct != null) {
    const pa = row.peak_anomaly_pct, match = (pa >= e.above_pct) === up;
    lines.push(`Outcome: ${e.peak_label} ${y} was ${pct(pa)} (${labelFor(pa).toLowerCase()}), ${match ? "as the signal suggested" : "unlike the signal"}.`);
  } else {
    lines.push(`Watch ${e.peak_label} ${y}.`);
  }
  return { lines, row, up };
}

function renderSignal(y, m) {
  const e = App.area.early_warning, s = signalText(y, m);
  let html = `<h3>🔮 Early signal</h3>${s.lines.map((l) => `<p>${l}</p>`).join("")}`;
  if (e && isAnalyst()) {
    html += `<table class="ctable"><tr><th></th><th>${e.peak_label} above</th><th>not above</th></tr>
      <tr><th>${e.lead_label} above</th><td>${e.lead_above_peak_above}</td><td>${e.lead_above_peak_not}</td></tr>
      <tr><th>not above</th><td>${e.lead_not_peak_above}</td><td>${e.lead_not_peak_not}</td></tr></table>
      <p class="muted small">Hindcast ${e.years_scored.join("–")}, ${e.n} years. Spearman ρ = ${fmt(e.spearman, 2)},
        one-sided permutation p ${e.p_value < 0.001 ? "&lt; 0.001" : `= ${fmt(e.p_value, 3)}`}. Above normal = at least +${e.above_pct}% vs the
        median of earlier years (what was known at the time). A historical pattern, not a forecast.</p>`;
  } else if (e) {
    html += `<p class="muted small">Based on ${signalStats(e, y).n} other years. A pattern, not a forecast.</p>`;
  }
  $("season-signal").innerHTML = html;
}

function renderUnusual(y, m) {
  const a = cellAnomaly(TM.idx), n = isAnalyst() ? 10 : 3, top = topUnusual(TM.idx, n);
  let html = `<div class="brief-head"><h3>⚠ Where is it unusual? · ${MONTHS[m - 1]} ${y}</h3>
    <button type="button" class="px-btn small" data-show-unusual>SHOW ON MAP</button></div>`;
  if (a.n < MIN_BASE_YEARS) html += `<p>Needs at least ${MIN_BASE_YEARS} earlier years of ${MONTHS_LONG[m - 1]} to compare.</p>`;
  else if (!top.length) html += "<p>No place had more fire hotspots than usual this month. 🌿</p>";
  else if (isAnalyst()) {
    html += `<div class="table-scroll"><table class="utable"><tr><th>#</th><th>Near</th><th>Location</th><th>This month</th><th>Usual</th><th>Extra</th></tr>
      ${top.map((r, i) => `<tr data-cell="${r.cell}" tabindex="0"><td>${i + 1}</td><td>${r.name || "–"}</td><td>${r.where}</td>
        <td>${fmt(r.v)}</td><td>${fmt(r.med)}</td><td><b>+${fmt(r.ex)}</b></td></tr>`).join("")}</table></div>
      <p class="muted small">25 km cells inside ${App.area.name}, ranked by hotspots above the median of the same month in
        ${a.n} earlier years. Click a row to mark it on the map.</p>`;
  } else {
    html += `<ul class="places">${top.map((r) => `<li data-cell="${r.cell}">📍 Near <b>${r.name || r.where}</b>: ${fmt(r.v)} hotspots,
      usually ${r.med < 1 ? "almost none" : `about ${fmt(r.med)}`}</li>`).join("")}</ul>`;
  }
  $("season-unusual").innerHTML = html;
}

function briefText(t, y, m) {
  const a = App.area, e = calEntry(y, m), s = a.season, sig = signalText(y, m), top = topUnusual(TM.idx, 5);
  const L = [`BURN CALENDAR SITUATION BRIEF: ${a.name}, ${MONTHS_LONG[m - 1]} ${y}`,
    "Source: NASA FIRMS (MODIS, VIIRS), harmonized to NOAA-20-equivalent hotspots by Burn Calendar.", ""];
  if (e) L.push(`THIS MONTH: ${fmt(e.count)} hotspots` + (e.median != null ? `; usual ${fmt(e.median)} -> ${labelFor(e.anomaly_pct)} (${pct(e.anomaly_pct)}).` : "."));
  if (t.enough) {
    L.push(`YEAR TO DATE (Jan-${MONTHS[m - 1]}): ${fmt(t.cur[m - 1])} hotspots, ${ratioText(t.ratio)} ` +
      `(median of ${t.curves.length} earlier years: ${fmt(t.usual)}). Closest earlier year so far: ${t.analog.year} ` +
      `(ended with ${fmt(t.analog.c[11])}).`);
  }
  if (s) L.push(`FIRE SEASON: ${fmt(s.season_share_pct)}% of a typical year's hotspots fall in ${s.season_label}; busiest months ${s.peak_label}. Now: ${seasonPhase(s, m).replace("🔥 ", "")}.`);
  L.push(`EARLY SIGNAL: ${sig.lines.join(" ")}`);
  if (top.length) {
    L.push("MOST UNUSUAL PLACES (vs the same month in earlier years):");
    top.forEach((r, i) => L.push(`  ${i + 1}. ${r.name ? `${r.name}, ` : ""}${r.where}: ${fmt(r.v)} hotspots (usual ${fmt(r.med)}, +${fmt(r.ex)})`));
  }
  if (a.trend && a.trend.p_value != null) L.push(`LONG-TERM TREND (${a.trend.years}): ${a.trend.direction}, Mann-Kendall p = ${a.trend.p_value.toFixed(2)}.`);
  L.push("", "CAVEATS: Monthly totals, not a live alert system (for active fires use the NASA FIRMS Fire Map).",
    "Hotspots include agricultural, land-clearing, peat and planned burns, not only wildfires.",
    `Harmonized counts carry about ${fmt(a.method.validation_error_pct, 1)}% cross-validated monthly error. Early signal = historical pattern, not a forecast.`);
  if ($("view-link")) L.push(`LINK: ${$("view-link").textContent}`);
  return L.join("\n");
}

function seasonOnMonth() {
  if (!App.area || !App.grid) return;
  const [y, m] = App.grid.months[TM.idx].split("-").map(Number);
  const t = trackerData(y, m);
  const span = m === 12 ? `all of ${y}` : `${y} so far (Jan–${MONTHS[m - 1]})`;
  $("season-kicker").textContent = `This season · ${App.area.name} · ${MONTHS[m - 1]} ${y}`;
  $("season-title").textContent = isAnalyst() ? "Season check" : `Is ${y} a bad fire year?`;
  if (t.enough) {
    const label = labelFor((t.ratio - 1) * 100);
    $("season-headline").innerHTML = `${LABEL_ICON[label]} <b>${span}: ${fmtk(t.cur[m - 1])} hotspots</b>, ` +
      `${label.toLowerCase()}: <b>${ratioText(t.ratio)}</b> by this point. Most like <b>${t.analog.year}</b> so far.`;
    $("tracker-legend").innerHTML = `<b style="color:#c2410c">━ ${y}</b> · <b>┅ usual</b> (median of ${t.curves.length} earlier years) · ` +
      `shaded: lowest to highest · <b style="color:#c92a2a">┄ ${t.worst.year}</b> biggest year` +
      (t.analog !== t.worst ? ` · <b style="color:#1c7ed6">┄ ${t.analog.year}</b> closest so far` : "");
  } else {
    $("season-headline").textContent = `Not enough earlier years to compare ${y} with yet.`;
    $("tracker-legend").textContent = "";
  }
  drawTracker(t);
  renderWhen(y, m);
  renderSignal(y, m);
  renderUnusual(y, m);
  if (isAnalyst()) $("brief-text").textContent = briefText(t, y, m);
}

function seasonInit() {
  $("season-unusual").addEventListener("click", (ev) => {
    const row = ev.target.closest("[data-cell]");
    if (row) TM.focus = Number(row.dataset.cell);
    if (row || ev.target.closest("[data-show-unusual]")) {
      tmPause();
      setLayer("unusual");
      $("map-panel").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
    }
  });
  $("season-unusual").addEventListener("keydown", (ev) => {
    if (ev.key === "Enter" && ev.target.closest("tr[data-cell]")) ev.target.click();
  });
  $("brief-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("brief-text").textContent); $("brief-copy").textContent = "COPIED ✓"; }
    catch (e) { $("brief-copy").textContent = "SELECT AND COPY"; }
    setTimeout(() => { $("brief-copy").textContent = "COPY TEXT"; }, 2000);
  });
  $("brief-print").addEventListener("click", () => {
    document.body.classList.add("print-brief");
    window.print();
  });
  window.addEventListener("afterprint", () => document.body.classList.remove("print-brief"));
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(seasonOnMonth, 200); });
}
