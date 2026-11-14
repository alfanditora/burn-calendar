// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Data Lab: calendar, anomaly badge, trend card, method panel and CSV download (the expert view).

function yearRange() { return [Number($("from").value), Number($("to").value)]; }
function filteredCalendar() {
  const [lo, hi] = yearRange();
  return App.area.calendar.filter((c) => c.year >= lo && c.year <= hi);
}

function renderLegend() {
  $("legend").innerHTML = `<span class="lg-label">Hotspots per month:</span>` + BINS.map(([, col, label]) =>
    `<span class="lg-item"><i style="background:${col}"></i>${label}</span>`).join("");
}

const SENSOR_SHORT = { MODIS: "MODIS", SNPP: "S-NPP", NOAA20: "N-20" };

function renderCalendar() {
  const byKey = new Map(filteredCalendar().map((c) => [`${c.year}-${c.month}`, c]));
  const [lo, hi] = yearRange();
  const shown = App.grid ? App.grid.months[TM.idx] : null;
  const totals = [];
  for (let y = lo; y <= hi; y++) totals.push(MONTHS.reduce((t, _, m) => t + ((byKey.get(`${y}-${m + 1}`) || {}).count || 0), 0));
  const maxTotal = Math.max(1, ...totals);
  let html = `<thead><tr><th class="year">Year</th>${MONTHS.map((m) =>
    `<th><span class="long">${m}</span><span class="short">${m[0]}</span></th>`).join("")}<th class="total">Year total</th><th class="sensor">Sensor</th></tr></thead><tbody>`;
  for (let y = lo; y <= hi; y++) {
    const cells = []; let n = 0; const sensors = new Set();
    for (let m = 1; m <= 12; m++) {
      const c = byKey.get(`${y}-${m}`);
      if (!c) { cells.push(`<td class="cell missing" aria-label="${MONTHS[m - 1]} ${y}: no data"></td>`); continue; }
      n++; sensors.add(c.source);
      const now = shown === `${y}-${String(m).padStart(2, "0")}` ? " now" : "";
      cells.push(`<td class="cell${now}" tabindex="0" data-y="${y}" data-m="${m}" style="background:${rampColour(c.count)}"` +
        ` aria-label="${MONTHS[m - 1]} ${y}: ${fmt(c.count)} hotspots"></td>`);
    }
    const total = totals[y - lo];
    html += `<tr><th class="year">${y}</th>${cells.join("")}<td class="total"><span class="tbar" style="width:${Math.round(total / maxTotal * 100)}%"></span>` +
      `<span class="tval">${n === 12 ? fmt(total) : n ? `${fmt(total)}*` : ""}</span></td>` +
      `<td class="sensor">${[...sensors].map((s) => `<span class="chip ${s}">${SENSOR_SHORT[s]}</span>`).join("")}</td></tr>`;
  }
  $("calendar").innerHTML = html + "</tbody>";
  renderLegend();
}

function showCalTip(e) {
  const td = e.target.closest("td.cell[data-y]");
  const tip = $("tip");
  if (!td) { tip.hidden = true; return; }
  const c = calEntry(Number(td.dataset.y), Number(td.dataset.m));
  tip.innerHTML = `<b>${MONTHS_LONG[c.month - 1]} ${c.year}</b><br>${fmt(c.count)} hotspots (NOAA-20 units)<br>Sensor: ${SENSOR_NAME[c.source]}` +
    (c.median != null ? `<br>Usual (median): ${fmt(c.median)} (${pct(c.anomaly_pct)}, ${labelFor(c.anomaly_pct)})` : "") +
    `<br><i>Tap to show this month on the map</i>`;
  tip.hidden = false;
  const r = td.getBoundingClientRect();
  tip.style.left = `${Math.min(window.innerWidth - 270, r.left)}px`;
  tip.style.top = `${r.bottom + 6}px`;
}

function renderAnomaly() {
  const l = App.area.latest;
  $("anomaly").innerHTML = `
    <p class="kicker">Latest complete month · ${MONTHS[l.month - 1]} ${l.year}</p>
    <span class="badge ${BADGE_CLASS[l.label] || "none"}">${l.label}</span>
    <p class="big">${fmt(l.count)} hotspots</p>
    <p class="muted">Median for ${MONTHS[l.month - 1]} in earlier years: ${fmt(l.median)} (${pct(l.anomaly_pct)}).
      Sensor: ${SENSOR_NAME[l.source]}. Recent months use near-real-time data.</p>`;
}

function renderTrend() {
  const t = App.area.trend;
  if (!t || t.p_value == null) { $("trend").innerHTML = "<p>Not enough complete years for a trend test.</p>"; return; }
  const words = { increasing: "has been rising", decreasing: "has been falling", "no trend": "shows no clear trend" }[t.direction];
  const slope = t.slope_per_year > 0 ? `+${fmt(t.slope_per_year)}` : fmt(t.slope_per_year);
  $("trend").innerHTML = `
    <p class="kicker">Long-term trend · ${t.years}</p>
    <p class="big">Fire activity ${words} since ${t.years.split("-")[0]}</p>
    <p class="muted">Mann-Kendall test on yearly totals: p = ${t.p_value.toFixed(2)}
      ${t.p_value < 0.05 ? "(significant at 5%)" : "(not significant at 5%)"}. Sen's slope: ${slope} hotspots per year.</p>`;
}

function renderMethod() {
  const m = App.area.method, links = m.links || {};
  const p1 = (x) => (x != null ? fmt(x, 1) + "%" : "n/a");
  const parentName = (id) => (App.index.find((a) => a.area_id === id) || {}).name || id;
  const row = (name, label) => {
    const l = links[name] || {}, v = l.validation || {}, cv = l.cross_validation || {};
    const from = l.factor_source ? `<br><span class="muted small">from ${parentName(l.factor_source)} (own ${fmt(l.own_factor, 2)} was unstable)</span>` : "";
    return `<tr><td>${label}</td><td>${fmt(m.factors[name], 3)}${from}</td><td>${l.fit_years ? l.fit_years.join("–") : ""}</td>
      <td>${l.spread != null ? fmt(l.spread * 100) + "%" : "n/a"}${l.unstable ? " (unstable)" : ""}</td>
      <td><b>${p1(cv.monthly_wape_pct)}</b> / ${p1(cv.yearly_wape_pct)}</td>
      <td>${p1(v.monthly_mape_pct)} / ${p1(v.yearly_error_pct)}</td></tr>`;
  };
  const drift = links.modis_to_snpp && links.modis_to_snpp.drift;
  $("method-body").innerHTML = `
    <p>Three sensors are chained into one record in <b>NOAA-20 VIIRS-equivalent hotspots</b>: NOAA-20 where available
      (from Apr 2018), else Suomi NPP × factor, else MODIS × both factors. Each factor is the ratio of total hotspots seen by
      the two sensors over the months both were running.</p>
    <div class="table-scroll"><table>
      <tr><th>Link</th><th>Factor</th><th>Fit years</th><th>Year-to-year spread</th><th>Cross-validated error<br>(monthly / yearly)</th><th>Last 2 years held out<br>(monthly / yearly)</th></tr>
      ${row("modis_to_snpp", "MODIS → Suomi NPP")}${row("snpp_to_noaa20", "Suomi NPP → NOAA-20")}
    </table></div>
    <p class="muted">Validation: <b>cross-validated error</b> holds out each overlap year in turn, fits the factor on the
      other years, predicts the held-out year and weights errors by the number of fires (sum of errors ÷ sum of observed
      hotspots). The <b>last-2-years</b> check holds out only the two most recent overlap years (mean absolute
      percentage error over months with at least 10 hotspots); it overstates error where those years were quiet.
      Headline validation error: <b>${p1(m.validation_error_pct)}</b> (worse of the two links).
      If a province's own ratio is unstable, the factor of its parent area is used instead.</p>
    ${drift ? `<p class="muted">Orbit-drift check (MODIS → Suomi NPP): ratio ${fmt(drift.early_ratio, 3)} in 2012–2018 vs
      ${fmt(drift.late_ratio, 3)} in 2019–2025 (${fmt(drift.diff_pct, 1)}% apart).
      ${drift.used_early_only ? "Above 20%, so only 2012–2018 was used." : "Within 20%, so all overlap years were used."}</p>` : ""}
    <h3>Season, early signal and unusual places</h3>
    <p class="muted">${App.area.season ? App.area.season.method : ""} ${App.area.early_warning ? App.area.early_warning.method : ""}
      Season tracker: hotspots from January to the month on the map, against the same months in earlier complete years
      (median, lowest and highest); "most like" = the earlier year with the closest cumulative curve so far.
      Unusual places: each 25 km cell's hotspots minus the median of the same month in earlier complete years
      (at least 5), ranked by the extra hotspots; names from Natural Earth admin-1. On the map a cell is
      "routine" when it has 50–150% of its usual amount (usual at least 1), and "far above normal" at 2× usual or more
      (or any hotspots where there are usually almost none). Routine vs unusual is the only distinction made: FIRMS
      cannot tell a wildfire from farm burning, land clearing or a planned burn.</p>
    <h3>Limits</h3>
    <ul>
      <li>Converted counts are estimates; the factor can vary by region and season.</li>
      <li>Hotspots are satellite fire detections, not burned area; small or short fires can be missed.</li>
      <li>Hotspots are not only wildfires: they include agricultural, land-clearing, peat and planned (prescribed) burns.</li>
      <li>Areas follow real borders from Natural Earth (1:10m). Northern Australia is defined as Australian land north of 20°S. Hotspots exactly on a border or coastline can fall either side.</li>
      <li>Volcanoes, gas flares and other static sources are removed using FIRMS type flags.</li>
      <li>The most recent months use near-real-time (NRT) data, which FIRMS later replaces with standard data.</li>
    </ul>
    <h3>Data</h3>
    <p class="muted">NASA FIRMS active fire data: MODIS Collection 6.1 (from Nov 2000), VIIRS Suomi NPP 375 m (Jan 2012 to
      Nov 2026), VIIRS NOAA-20 375 m (from Apr 2018). Notes: ${m.notes}</p>`;
}

// Open data: the static files behind this view, ready for scripts, spreadsheets and GIS.
function renderDataAccess() {
  const id = App.areaId, abs = (p) => new URL(p, location.href).href;
  const files = [
    [`data/areas/${id}.csv`, "Every month: raw count per sensor, harmonized count, sensor used, median, anomaly %, percentile rank."],
    [`data/areas/${id}.json`, "The same series plus the trend test, the latest month and the method and validation details."],
    [`data/grid/${App.gridRegion}.json`, "The 0.25° (about 25 km) monthly grid behind the map, in NOAA-20 units."],
    ["data/areas/index.json", "The list of areas with their bounding boxes."],
  ];
  $("data-access").innerHTML = `
    <p class="kicker">Open data</p>
    <h2>Use this data in your own tools</h2>
    <p class="muted">Static files, free to use, no key needed. Data: NASA FIRMS (MODIS, VIIRS), harmonized by Burn Calendar.</p>
    <ul class="file-list">${files.map(([p, d]) => `<li><a href="${p}" download>${p.replace(/^data\/(areas\/)?/, "")}</a> ${d}</li>`).join("")}</ul>
    <p class="muted">Python:</p>
    <pre class="code">import pandas as pd
df = pd.read_csv("${abs(files[0][0])}")</pre>
    <div class="share-link">
      <p class="muted">Link to this view (area and the month on the map):</p>
      <code id="view-link"></code>
      <button type="button" class="px-btn small" id="copy-link">COPY LINK</button>
    </div>`;
  updateViewLink();
  $("copy-link").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("view-link").textContent); $("copy-link").textContent = "COPIED ✓"; }
    catch (e) { $("copy-link").textContent = "SELECT AND COPY"; }
    setTimeout(() => { if ($("copy-link")) $("copy-link").textContent = "COPY LINK"; }, 2000);
  });
}
function updateViewLink() {
  if (!$("view-link") || !App.grid) return;
  const u = new URL(location.pathname, location.origin);
  u.search = new URLSearchParams({ mode: "analyst", area: App.areaId, month: App.grid.months[TM.idx] }).toString();
  $("view-link").textContent = u.href;
}

function downloadCSV() {
  const a = App.area;
  const head = "area_id,year,month,harmonized_count_noaa20_units,source_sensor,median_same_month,anomaly_pct";
  const lines = filteredCalendar().map((c) => [a.area_id, c.year, c.month, c.count, c.source, c.median ?? "", c.anomaly_pct ?? ""].join(","));
  const blob = new Blob([[head, ...lines].join("\n") + "\n"], { type: "text/csv" });
  const link = document.createElement("a");
  const [lo, hi] = yearRange();
  link.href = URL.createObjectURL(blob);
  link.download = `burn-calendar_${a.area_id}_${lo}-${hi}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function labInit() {
  for (const id of ["from", "to"]) $(id).addEventListener("change", () => {
    if (Number($("from").value) > Number($("to").value)) $("to").value = $("from").value;
    renderCalendar();
  });
  $("download").addEventListener("click", downloadCSV);
  $("calendar").addEventListener("mouseover", showCalTip);
  $("calendar").addEventListener("focusin", showCalTip);
  $("calendar").addEventListener("click", (e) => {
    const td = e.target.closest("td.cell[data-y]");
    if (!td) return;
    const key = `${td.dataset.y}-${String(td.dataset.m).padStart(2, "0")}`;
    tmPause(); tmGo(App.grid.months.indexOf(key));
    document.querySelectorAll("#calendar td.now").forEach((x) => x.classList.remove("now"));
    td.classList.add("now");
    $("tip").hidden = true;
    $("map-panel").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" });
  });
  $("calendar").addEventListener("mouseleave", () => { $("tip").hidden = true; });
}

function labOnArea() {
  const years = [...new Set(App.area.calendar.map((c) => c.year))].sort((a, b) => a - b);
  const opts = years.map((y) => `<option>${y}</option>`).join("");
  $("from").innerHTML = opts; $("to").innerHTML = opts;
  $("from").value = years.find((y) => y >= 2001) ?? years[0];
  $("to").value = years[years.length - 1];
  $("unit").innerHTML = `Each square is one month, coloured by its number of fire hotspots (${App.area.unit}). ` +
    `Green = no fires · dashed = no data · * = partial year · outlined = the month on the map. Tap a month to see it on the map.`;
  const l = App.area.latest;
  $("care-latest").textContent = `${MONTHS_LONG[l.month - 1]} ${l.year}`;
  renderCalendar(); renderAnomaly(); renderTrend(); renderMethod(); renderDataAccess();
}
