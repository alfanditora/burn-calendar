// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Data Lab: calendar, anomaly badge, trend card, method panel and CSV download (the expert view).

function yearRange() { return [Number($("from").value), Number($("to").value)]; }
function filteredCalendar() {
  const [lo, hi] = yearRange();
  return App.area.calendar.filter((c) => c.year >= lo && c.year <= hi);
}

function renderLegend(max) {
  const stops = RAMP.map((c, i) => Math.round(Math.expm1((i / RAMP.length) * Math.log1p(max))));
  $("legend").innerHTML = `<span>0</span><span class="ramp">${RAMP.map((c, i) =>
    `<span style="background:${c}" title="from ${fmt(stops[i])}"></span>`).join("")}</span><span>${fmt(max)}</span>`;
}

function renderCalendar() {
  const byKey = new Map(filteredCalendar().map((c) => [`${c.year}-${c.month}`, c]));
  const max = Math.max(1, ...App.area.calendar.map((c) => c.count || 0));
  const [lo, hi] = yearRange();
  let html = `<thead><tr><th class="year"></th>${MONTHS.map((m) =>
    `<th><span class="long">${m}</span><span class="short">${m[0]}</span></th>`).join("")}<th class="total">Total</th><th class="sensor">Sensor</th></tr></thead><tbody>`;
  for (let y = lo; y <= hi; y++) {
    const cells = []; let total = 0, n = 0; const sensors = new Set();
    for (let m = 1; m <= 12; m++) {
      const c = byKey.get(`${y}-${m}`);
      if (!c) { cells.push(`<td class="cell missing" aria-label="${MONTHS[m - 1]} ${y}: no data"></td>`); continue; }
      total += c.count; n++; sensors.add(c.source);
      cells.push(`<td class="cell${c.count ? "" : " zero"}" tabindex="0" data-y="${y}" data-m="${m}"` +
        `${c.count ? ` style="background:${rampColour(c.count, max)}"` : ""} aria-label="${MONTHS[m - 1]} ${y}: ${fmt(c.count)} hotspots"></td>`);
    }
    html += `<tr><th class="year">${y}</th>${cells.join("")}<td class="total">${n === 12 ? fmt(total) : n ? `${fmt(total)}*` : ""}</td>` +
      `<td class="sensor">${[...sensors].join(" + ")}</td></tr>`;
  }
  $("calendar").innerHTML = html + "</tbody>";
  renderLegend(max);
}

function showCalTip(e) {
  const td = e.target.closest("td.cell[data-y]");
  const tip = $("tip");
  if (!td) { tip.hidden = true; return; }
  const c = calEntry(Number(td.dataset.y), Number(td.dataset.m));
  tip.innerHTML = `<b>${MONTHS[c.month - 1]} ${c.year}</b><br>${fmt(c.count)} hotspots (NOAA-20 units)<br>Sensor: ${SENSOR_NAME[c.source]}` +
    (c.median != null ? `<br>Usual (median): ${fmt(c.median)} (${pct(c.anomaly_pct)})` : "");
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
  const row = (name, label) => {
    const l = links[name] || {}, v = l.validation || {};
    return `<tr><td>${label}</td><td>${fmt(m.factors[name], 3)}</td><td>${l.fit_years ? l.fit_years.join("–") : ""}</td>
      <td>${l.spread != null ? fmt(l.spread * 100) + "%" : "n/a"}${l.unstable ? " (unstable)" : ""}</td>
      <td>${v.monthly_mape_pct != null ? fmt(v.monthly_mape_pct, 1) + "%" : "n/a"}</td>
      <td>${v.yearly_error_pct != null ? fmt(v.yearly_error_pct, 1) + "%" : "n/a"}</td></tr>`;
  };
  const drift = links.modis_to_snpp && links.modis_to_snpp.drift;
  $("method-body").innerHTML = `
    <p>Three sensors are chained into one record in <b>NOAA-20 VIIRS-equivalent hotspots</b>: NOAA-20 where available
      (from Apr 2018), else Suomi NPP × factor, else MODIS × both factors. Each factor is the ratio of total hotspots seen by
      the two sensors over the months both were running.</p>
    <div class="table-scroll"><table>
      <tr><th>Link</th><th>Factor</th><th>Fit years</th><th>Year-to-year spread</th><th>Monthly error</th><th>Yearly error</th></tr>
      ${row("modis_to_snpp", "MODIS → Suomi NPP")}${row("snpp_to_noaa20", "Suomi NPP → NOAA-20")}
    </table></div>
    <p class="muted">Validation: the last two full overlap years are held out, factors are refitted without them, and the
      held-out months are predicted. Monthly error = mean absolute percentage error over months with at least 10 hotspots.
      Headline validation error: <b>${m.validation_error_pct != null ? fmt(m.validation_error_pct, 1) + "%" : "n/a"}</b>.</p>
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
    <p class="muted">NASA FIRMS active fire data: MODIS Collection 6.1 (from Nov 2000), VIIRS Suomi NPP 375 m (Jan 2012 to
      Nov 2026), VIIRS NOAA-20 375 m (from Apr 2018). Notes: ${m.notes}</p>`;
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
  award("data_diver");
}

function labInit() {
  for (const id of ["from", "to"]) $(id).addEventListener("change", () => {
    if (Number($("from").value) > Number($("to").value)) $("to").value = $("from").value;
    renderCalendar();
  });
  $("download").addEventListener("click", downloadCSV);
  $("calendar").addEventListener("mouseover", showCalTip);
  $("calendar").addEventListener("focusin", showCalTip);
  $("calendar").addEventListener("click", showCalTip);
  $("calendar").addEventListener("mouseleave", () => { $("tip").hidden = true; });
}

function labOnArea() {
  const years = [...new Set(App.area.calendar.map((c) => c.year))].sort((a, b) => a - b);
  const opts = years.map((y) => `<option>${y}</option>`).join("");
  $("from").innerHTML = opts; $("to").innerHTML = opts;
  $("from").value = years.find((y) => y >= 2001) ?? years[0];
  $("to").value = years[years.length - 1];
  $("unit").textContent = `Unit: ${App.area.unit}. Pale tan = no hotspots; dashed = no data; * = partial year.`;
  renderCalendar(); renderAnomaly(); renderTrend(); renderMethod();
}
