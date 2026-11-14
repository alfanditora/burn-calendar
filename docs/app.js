// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Burn Calendar web app: reads data/areas/*.json written by pipeline/run_all.py. No server, no API calls.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Sequential palette (ColorBrewer YlOrRd, colour-blind safe for ordered data), light = few, dark = many.
const RAMP = ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026", "#800026"];
const SENSOR_NAME = { MODIS: "MODIS (Terra/Aqua)", SNPP: "VIIRS Suomi NPP", NOAA20: "VIIRS NOAA-20" };
const BADGE_CLASS = {
  "Well above normal": "well-above", "Above normal": "above", "Normal": "normal",
  "Below normal": "below", "No baseline": "none",
};

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => n == null ? "n/a" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d });
const pct = (n) => n == null ? "n/a" : `${n > 0 ? "+" : ""}${fmt(n)}%`;

const state = { index: [], area: null, map: null, layers: {} };

async function getJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return r.json();
}

// ---------- colour scale (log, because fire seasons span 0 to tens of thousands) ----------
function colourFor(count, max) {
  if (!count) return null;
  const t = Math.log1p(count) / Math.log1p(max);
  return RAMP[Math.min(RAMP.length - 1, Math.floor(t * RAMP.length))];
}

function renderLegend(max) {
  const stops = RAMP.map((c, i) => Math.round(Math.expm1((i / RAMP.length) * Math.log1p(max))));
  $("legend").innerHTML =
    `<span>0</span><span class="ramp">${RAMP.map((c, i) =>
      `<span style="background:${c}" title="from ${fmt(stops[i])}"></span>`).join("")}</span>` +
    `<span>${fmt(max)}</span>`;
}

// ---------- calendar ----------
function yearRange() {
  return [Number($("from").value), Number($("to").value)];
}

function filteredCalendar() {
  const [lo, hi] = yearRange();
  return state.area.calendar.filter((c) => c.year >= lo && c.year <= hi);
}

function renderCalendar() {
  const rows = filteredCalendar();
  const byKey = new Map(rows.map((c) => [`${c.year}-${c.month}`, c]));
  const max = Math.max(1, ...state.area.calendar.map((c) => c.count || 0)); // fixed scale across filters
  const [lo, hi] = yearRange();

  let html = `<thead><tr><th class="year"></th>${MONTHS.map((m) => `<th><span class="long">${m}</span><span class="short">${m[0]}</span></th>`).join("")}<th class="total">Total</th><th class="sensor">Sensor</th></tr></thead><tbody>`;
  for (let y = lo; y <= hi; y++) {
    const cells = [];
    let total = 0, n = 0;
    const sensors = new Set();
    for (let m = 1; m <= 12; m++) {
      const c = byKey.get(`${y}-${m}`);
      if (!c) { cells.push(`<td class="cell missing" aria-label="${MONTHS[m - 1]} ${y}: no data"></td>`); continue; }
      total += c.count; n++; sensors.add(c.source);
      const col = colourFor(c.count, max);
      cells.push(`<td class="cell${col ? "" : " zero"}" tabindex="0" data-y="${y}" data-m="${m}"` +
        `${col ? ` style="background:${col}"` : ""} aria-label="${MONTHS[m - 1]} ${y}: ${fmt(c.count)} hotspots"></td>`);
    }
    const totalTxt = n === 12 ? fmt(total) : n ? `${fmt(total)}*` : "";
    html += `<tr><th class="year">${y}</th>${cells.join("")}<td class="total">${totalTxt}</td>` +
      `<td class="sensor">${[...sensors].join(" + ")}</td></tr>`;
  }
  $("calendar").innerHTML = html + "</tbody>";
  renderLegend(max);
}

function showTip(e) {
  const td = e.target.closest("td.cell[data-y]");
  const tip = $("tip");
  if (!td) { tip.hidden = true; return; }
  const c = state.area.calendar.find((r) => r.year == td.dataset.y && r.month == td.dataset.m);
  tip.innerHTML = `<strong>${MONTHS[c.month - 1]} ${c.year}</strong><br>${fmt(c.count)} hotspots (NOAA-20 units)` +
    `<br>Sensor: ${SENSOR_NAME[c.source] || c.source}` +
    (c.median != null ? `<br>Median of earlier years: ${fmt(c.median)} (${pct(c.anomaly_pct)})` : "");
  tip.hidden = false;
  const r = td.getBoundingClientRect();
  tip.style.left = `${Math.min(window.innerWidth - 270, r.left)}px`;
  tip.style.top = `${r.bottom + 6}px`;
}

// ---------- cards ----------
function renderAnomaly() {
  const l = state.area.latest;
  if (!l) { $("anomaly").innerHTML = "<p>No recent month available.</p>"; return; }
  $("anomaly").innerHTML = `
    <p class="kicker">Latest complete month · ${MONTHS[l.month - 1]} ${l.year}</p>
    <span class="badge ${BADGE_CLASS[l.label] || "none"}">${l.label}</span>
    <p class="big">${fmt(l.count)} hotspots</p>
    <p class="muted">Median for ${MONTHS[l.month - 1]} in earlier years: ${fmt(l.median)}
      (${pct(l.anomaly_pct)}). Sensor: ${SENSOR_NAME[l.source] || l.source}.</p>`;
}

function renderTrend() {
  const t = state.area.trend;
  if (!t || t.p_value == null) { $("trend").innerHTML = "<p>Not enough complete years for a trend test.</p>"; return; }
  const start = t.years.split("-")[0];
  const words = { increasing: "has been rising", decreasing: "has been falling", "no trend": "shows no clear trend" }[t.direction];
  const slope = t.slope_per_year > 0 ? `+${fmt(t.slope_per_year)}` : fmt(t.slope_per_year);
  $("trend").innerHTML = `
    <p class="kicker">Long-term trend · ${t.years}</p>
    <p class="big" style="font-size:1.2rem">Fire activity ${words} since ${start}</p>
    <p class="muted">Mann-Kendall test on yearly totals: p = ${t.p_value.toFixed(2)}
      ${t.p_value < 0.05 ? "(significant at 5%)" : "(not significant at 5%)"}.
      Sen's slope: ${slope} hotspots per year.</p>`;
}

function renderMethod() {
  const m = state.area.method;
  const links = m.links || {};
  const linkRow = (name, label) => {
    const l = links[name] || {};
    const v = l.validation || {};
    return `<tr><td>${label}</td><td>${fmt(m.factors[name], 3)}</td><td>${l.fit_years ? l.fit_years.join("–") : ""}</td>
      <td>${l.spread != null ? fmt(l.spread * 100) + "%" : "n/a"}${l.unstable ? " (unstable)" : ""}</td>
      <td>${v.monthly_mape_pct != null ? fmt(v.monthly_mape_pct, 1) + "%" : "n/a"}</td>
      <td>${v.yearly_error_pct != null ? fmt(v.yearly_error_pct, 1) + "%" : "n/a"}</td></tr>`;
  };
  const drift = links.modis_to_snpp && links.modis_to_snpp.drift;
  $("method-body").innerHTML = `
    <p>Three sensors are chained into one record in <strong>NOAA-20 VIIRS-equivalent hotspots</strong>:
      NOAA-20 is used where available (from Apr 2018), else Suomi NPP × factor, else MODIS × both factors.
      Each factor is the ratio of total hotspots seen by the two sensors over the months both were running.</p>
    <div class="table-scroll"><table>
      <tr><th>Link</th><th>Factor</th><th>Fit years</th><th>Year-to-year spread</th><th>Monthly error</th><th>Yearly error</th></tr>
      ${linkRow("modis_to_snpp", "MODIS → Suomi NPP")}
      ${linkRow("snpp_to_noaa20", "Suomi NPP → NOAA-20")}
    </table></div>
    <p class="muted">Validation: the last two full overlap years are held out, factors are refitted without them,
      and the held-out months are predicted. Monthly error is the mean absolute percentage error over months with at
      least 10 hotspots. Headline validation error: <strong>${m.validation_error_pct != null ? fmt(m.validation_error_pct, 1) + "%" : "n/a"}</strong>.</p>
    ${drift ? `<p class="muted">Orbit-drift check (MODIS → Suomi NPP): ratio ${fmt(drift.early_ratio, 3)} in 2012–2018 vs
      ${fmt(drift.late_ratio, 3)} in 2019–2025 (${fmt(drift.diff_pct, 1)}% apart).
      ${drift.used_early_only ? "Above 20%, so only 2012–2018 was used." : "Within 20%, so all overlap years were used."}</p>` : ""}
    <h3>Limits</h3>
    <ul>
      <li>Converted counts are estimates; the factor can vary by region and season.</li>
      <li>Hotspots are satellite fire detections, not burned area; small or short fires can be missed.</li>
      <li>Areas are bounding boxes, so they include some land beyond the named region.</li>
      <li>Volcanoes, gas flares and other static sources are removed using FIRMS type flags.</li>
      <li>The most recent months use near-real-time (NRT) data, which FIRMS later replaces with standard data.</li>
    </ul>
    <h3>Data</h3>
    <p class="muted">NASA FIRMS active fire data: MODIS Collection 6.1 (from Nov 2000), VIIRS Suomi NPP 375 m
      (Jan 2012 to Nov 2026), VIIRS NOAA-20 375 m (from Apr 2018). Notes: ${m.notes}</p>`;
}

// ---------- CSV ----------
function downloadCSV() {
  const a = state.area;
  const head = "area_id,year,month,harmonized_count_noaa20_units,source_sensor,median_same_month,anomaly_pct";
  const lines = filteredCalendar().map((c) =>
    [a.area_id, c.year, c.month, c.count, c.source, c.median ?? "", c.anomaly_pct ?? ""].join(","));
  const blob = new Blob([[head, ...lines].join("\n") + "\n"], { type: "text/csv" });
  const link = document.createElement("a");
  const [lo, hi] = yearRange();
  link.href = URL.createObjectURL(blob);
  link.download = `burn-calendar_${a.area_id}_${lo}-${hi}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ---------- map ----------
function initMap() {
  state.map = L.map("map", { scrollWheelZoom: false });
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 10, attribution: "© OpenStreetMap contributors",
  }).addTo(state.map);
  for (const a of state.index) {
    const [w, s, e, n] = a.bbox;
    state.layers[a.area_id] = L.rectangle([[s, w], [n, e]], { weight: 1, fillOpacity: 0.05 })
      .bindTooltip(a.name).on("click", () => selectArea(a.area_id)).addTo(state.map);
  }
}

function highlightMap() {
  for (const [id, layer] of Object.entries(state.layers)) {
    const on = id === state.area.area_id;
    layer.setStyle({ color: on ? "#b5361b" : "#6b6560", weight: on ? 2.5 : 1, fillOpacity: on ? 0.12 : 0.03 });
  }
  const [w, s, e, n] = state.area.bbox;
  state.map.fitBounds([[s, w], [n, e]], { padding: [10, 10] });
}

// ---------- games (public view; real numbers from the area JSON only) ----------
const game = { picks: new Set(), normal: null, score: 0, played: 0 };

// Same thresholds as pipeline/config.py ANOMALY_LABELS.
function labelFor(p) {
  if (p == null) return "No baseline";
  if (p >= 50) return "Well above normal";
  if (p >= 15) return "Above normal";
  if (p >= -15) return "Normal";
  return "Below normal";
}

function completeYears() {
  const n = new Map();
  for (const c of state.area.calendar) n.set(c.year, (n.get(c.year) || 0) + 1);
  return [...n].filter(([, k]) => k === 12).map(([y]) => y);
}

function monthlyAverages() {
  const years = new Set(completeYears());
  const sums = Array(12).fill(0);
  for (const c of state.area.calendar) if (years.has(c.year)) sums[c.month - 1] += c.count;
  return { avg: sums.map((s) => s / years.size), years: [...years].sort((a, b) => a - b) };
}

function initSeasonGame() {
  game.picks.clear();
  document.querySelectorAll(".g-area").forEach((e) => { e.textContent = state.area.name; });
  $("season-picks").innerHTML = MONTHS.map((m, i) =>
    `<button type="button" data-m="${i}" aria-pressed="false">${m}</button>`).join("");
  $("season-check").disabled = true;
  $("season-check").hidden = false;
  $("season-result").innerHTML = "";
}

function toggleSeasonPick(e) {
  const b = e.target.closest("button[data-m]");
  if (!b || b.disabled) return;
  const m = Number(b.dataset.m);
  if (game.picks.has(m)) game.picks.delete(m);
  else if (game.picks.size < 3) game.picks.add(m);
  document.querySelectorAll("#season-picks button").forEach((x) =>
    x.setAttribute("aria-pressed", game.picks.has(Number(x.dataset.m))));
  $("season-check").disabled = game.picks.size !== 3;
}

function revealSeason() {
  const { avg, years } = monthlyAverages();
  const top = avg.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, i]) => i);
  const hits = top.filter((m) => game.picks.has(m)).length;
  const share = top.reduce((s, m) => s + avg[m], 0) / avg.reduce((s, v) => s + v, 0) * 100;
  const max = Math.max(...avg);
  document.querySelectorAll("#season-picks button").forEach((b) => {
    b.disabled = true;
    if (top.includes(Number(b.dataset.m)) && game.picks.has(Number(b.dataset.m))) b.classList.add("hit");
  });
  const names = top.slice().sort((a, b) => a - b).map((m) => MONTHS[m]);
  $("season-check").hidden = true;
  $("season-result").innerHTML = `
    <p class="result-line">You found ${hits} of 3${hits === 3 ? ". Perfect!" : hits ? "." : ". Try another area!"}</p>
    <div class="bars" aria-hidden="true">${avg.map((v, i) =>
      `<div class="${top.includes(i) ? "top" : ""}" style="height:${Math.max(2, v / max * 100)}%"></div>`).join("")}</div>
    <div class="bar-labels" aria-hidden="true">${MONTHS.map((m) => `<span>${m[0]}</span>`).join("")}</div>
    <p class="muted">Average hotspots per month, ${years[0]}–${years[years.length - 1]}. The busiest months are
      ${names.join(", ")}, holding ${fmt(share)}% of a typical year's hotspots.
      Data: NASA FIRMS, harmonized to NOAA-20 units.</p>
    <button type="button" class="link-btn" id="season-again">Play again</button>`;
  $("season-again").addEventListener("click", initSeasonGame);
}

function nextNormalQuestion() {
  const pool = state.area.calendar.filter((c) =>
    c.median != null && c.median > 0 && c.anomaly_pct != null && c.count !== c.median);
  game.normal = pool[Math.floor(Math.random() * pool.length)];
  const c = game.normal;
  $("normal-question").innerHTML = `<strong>${MONTHS[c.month - 1]} ${c.year}</strong> in ${state.area.name}:
    more or fewer fire hotspots than a usual ${MONTHS[c.month - 1]}?`;
  $("normal-result").innerHTML = "";
  document.querySelectorAll("#game-normal .choice button").forEach((b) => { b.disabled = false; });
}

function answerNormal(e) {
  const b = e.target.closest("button[data-guess]");
  if (!b || b.disabled) return;
  const c = game.normal;
  const truth = c.count > c.median ? "above" : "below";
  const right = b.dataset.guess === truth;
  game.played++; if (right) game.score++;
  document.querySelectorAll("#game-normal .choice button").forEach((x) => { x.disabled = true; });
  $("normal-result").innerHTML = `
    <p class="result-line">${right ? "Correct!" : "Not this time."}
      <span class="badge ${BADGE_CLASS[labelFor(c.anomaly_pct)]}">${labelFor(c.anomaly_pct)}</span></p>
    <p class="muted">${fmt(c.count)} hotspots, against a median of ${fmt(c.median)} for ${MONTHS[c.month - 1]} in earlier years
      (${pct(c.anomaly_pct)}). Sensor: ${SENSOR_NAME[c.source] || c.source}. Data: NASA FIRMS.</p>
    <button type="button" class="link-btn" id="normal-next">Next month</button>`;
  $("normal-next").addEventListener("click", nextNormalQuestion);
  $("normal-score").textContent = `Score: ${game.score} of ${game.played}`;
}

function initGames() {
  initSeasonGame();
  game.score = 0; game.played = 0;
  $("normal-score").textContent = "";
  nextNormalQuestion();
}

// ---------- wiring ----------
function fillYears() {
  const years = [...new Set(state.area.calendar.map((c) => c.year))].sort((a, b) => a - b);
  const opts = years.map((y) => `<option>${y}</option>`).join("");
  $("from").innerHTML = opts; $("to").innerHTML = opts;
  $("from").value = years.find((y) => y >= 2001) ?? years[0];
  $("to").value = years[years.length - 1];
}

async function selectArea(id) {
  state.area = await getJSON(`data/areas/${id}.json`);
  $("area").value = id;
  $("unit").textContent = `Unit: ${state.area.unit}. Grey = no hotspots; dashed = no data. * = partial year.`;
  fillYears();
  renderCalendar(); renderAnomaly(); renderTrend(); renderMethod(); highlightMap(); initGames();
}

async function main() {
  try {
    state.index = await getJSON("data/areas/index.json");
  } catch (err) {
    document.querySelector("main").innerHTML =
      `<p class="card">No data found. Run <code>python pipeline/run_all.py</code> first. (${err.message})</p>`;
    return;
  }
  $("area").innerHTML = state.index.map((a) => `<option value="${a.area_id}">${a.name}</option>`).join("");
  initMap();
  $("area").addEventListener("change", (e) => selectArea(e.target.value));
  for (const id of ["from", "to"]) $(id).addEventListener("change", () => {
    if (Number($("from").value) > Number($("to").value)) $("to").value = $("from").value;
    renderCalendar();
  });
  $("download").addEventListener("click", downloadCSV);
  $("season-picks").addEventListener("click", toggleSeasonPick);
  $("season-check").addEventListener("click", revealSeason);
  $("game-normal").querySelector(".choice").addEventListener("click", answerNormal);
  $("calendar").addEventListener("mouseover", showTip);
  $("calendar").addEventListener("focusin", showTip);
  $("calendar").addEventListener("click", showTip);   // tap on touch screens
  $("calendar").addEventListener("mouseleave", () => { $("tip").hidden = true; });
  window.addEventListener("scroll", () => { $("tip").hidden = true; }, { passive: true });
  await selectArea(state.index[0].area_id);
}

main();
