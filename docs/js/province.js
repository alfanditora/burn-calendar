// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Grouped area list and the any-province view: monthly hotspots for every province or state, from
// grid/{region}_provinces.json (same harmonized points as the area calendar, the area's own factor).

// Featured areas: the full analysis. Why each one is featured is shown under its name.
const AREA_GROUPS = [
  { region: "indonesia", title: "Indonesia", pick: "Any province", areas: [
    ["indonesia", "Whole country", ""],
    ["riau", "Riau", "haze from peat fires"],
    ["central_kalimantan", "Central Kalimantan", "2015 & 2019 peat crises"],
  ] },
  { region: "north_australia", title: "Australia", pick: "Any state (northern part)", areas: [
    ["north_australia", "Northern Australia", "savanna burning, for comparison"],
  ] },
];

const Prov = { data: {}, sel: null, maskCache: new Map() };

async function provinceLoad() {
  await Promise.all(GRID_REGIONS.map(async (r) => {
    try { Prov.data[r] = await getJSON(`data/grid/${r}_provinces.json`); } catch (e) { /* older data: no province file */ }
  }));
}

const provName = (r, i) => Prov.data[r].names[i] + (Prov.data[r].country === "AUS" ? " (northern part)" : "");

function renderRegionGroups() {
  const used = new Set();
  const btn = (id, label, why) => {
    used.add(id);
    return `<button type="button" data-id="${id}" aria-pressed="${id === App.areaId && !Prov.sel}">${label}${why ? `<small>${why}</small>` : ""}</button>`;
  };
  const groups = AREA_GROUPS.map((g) => {
    const areas = g.areas.filter(([id]) => App.index.some((a) => a.area_id === id));
    if (!areas.length) return "";
    const [first, ...focus] = areas;
    const p = Prov.data[g.region];
    const opts = p ? p.names.map((n, i) => [n, i]).sort((a, b) => a[0].localeCompare(b[0]))
      .map(([n, i]) => `<option value="${i}" ${Prov.sel && Prov.sel.region === g.region && Prov.sel.i === i ? "selected" : ""}>${n}</option>`).join("") : "";
    return `<div class="region-group"><p class="rg-title">${g.title}</p>${btn(...first)}
      ${focus.length ? `<p class="rg-sub">Focus provinces</p>${focus.map((a) => btn(...a)).join("")}` : ""}
      ${p ? `<label class="rg-sub" for="prov-${g.region}">${g.pick}</label>
        <select id="prov-${g.region}" class="prov-select" data-region="${g.region}"><option value="">Choose…</option>${opts}</select>` : ""}
    </div>`;
  }).join("");
  // Any area not in a group still gets a button.
  const rest = App.index.filter((a) => !used.has(a.area_id)).map((a) => btn(a.area_id, a.name, "")).join("");
  $("regions").innerHTML = groups + (rest ? `<div class="region-group">${rest}</div>` : "");
}

// The featured area that is this province, if any ("Riau" -> riau).
function featuredFor(name) {
  const a = App.index.find((x) => x.name.replace(/ Province|, Indonesia/g, "") === name);
  return a ? a.area_id : null;
}

// Cells of the selected province on the current map ("1"/"0" per cell), for the map overlay.
function provinceMask() {
  if (!Prov.sel || Prov.sel.region !== App.gridRegion) return null;
  const key = `${Prov.sel.region}:${Prov.sel.i}`;
  if (!Prov.maskCache.has(key)) {
    const g = App.grid, name = Prov.data[Prov.sel.region].names[Prov.sel.i];
    const k = g.names.indexOf(name);
    Prov.maskCache.set(key, g.cell_name.map((c) => (c === k ? "1" : "0")).join(""));
  }
  return Prov.maskCache.get(key);
}

async function openProvince(region, i, scroll = false) {
  if (!Prov.data[region] || i < 0) return;
  if (App.areaId !== region) await loadArea(region); // whole-country map, so the province is in view
  Prov.sel = { region, i };
  provinceRedraw();
  if (scroll) $("province-panel").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
}

function closeProvince() {
  if (!Prov.sel) return;
  Prov.sel = null;
  provinceRedraw();
}

function provinceRedraw() {
  renderRegionGroups();
  if (App.grid && TM.view) tmBuildOverlay();
  provinceOnMonth();
}

// Statistics for one province series, with the same rules as the areas (earlier complete years, >= 5).
const median = (v) => { const s = [...v].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
function provStats(p, i) {
  const counts = p.counts[i], byYear = new Map();
  p.months.forEach((ym, k) => {
    const [y, m] = ym.split("-").map(Number);
    if (!byYear.has(y)) byYear.set(y, new Array(12).fill(null));
    byYear.get(y)[m - 1] = counts[k];
  });
  const complete = [...byYear].filter(([, v]) => v.every((x) => x != null)).map(([y]) => y);
  const typical = Array.from({ length: 12 }, (_, m) => complete.length ? median(complete.map((y) => byYear.get(y)[m])) : 0);
  const peakMedian = Math.max(...typical);
  return { byYear, complete, typical, enough: complete.length >= MIN_BASE_YEARS && peakMedian >= p.min_peak_median };
}

function provinceOnMonth() {
  const panel = $("province-panel");
  if (!Prov.sel || Prov.sel.region !== App.gridRegion || !App.grid) { panel.hidden = true; return; }
  const { region, i } = Prov.sel, p = Prov.data[region], name = p.names[i];
  const ym = App.grid.months[TM.idx], k = p.months.indexOf(ym), [y, m] = ym.split("-").map(Number);
  const v = k >= 0 ? p.counts[i][k] : null;
  const st = provStats(p, i);
  panel.hidden = false;
  $("prov-title").textContent = provName(region, i);

  // This month: count, usual (median of the same month in earlier complete years), rank among provinces.
  const earlier = st.complete.filter((yy) => yy < y).map((yy) => st.byYear.get(yy)[m - 1]);
  const usual = earlier.length >= MIN_BASE_YEARS ? median(earlier) : null;
  const ranked = k >= 0 ? p.counts.map((c, j) => [c[k] || 0, j]).sort((a, b) => b[0] - a[0]) : [];
  const rank = ranked.findIndex(([, j]) => j === i) + 1;
  let vs;
  if (v == null) vs = "No data for this month.";
  else if (!st.enough) vs = `Too few fires here for "usual" and fire-season comparisons: the busiest month usually has fewer than ${p.min_peak_median} hotspots, so one or two fires would swing every percentage. The counts are still real.`;
  else if (usual == null) vs = "Not enough earlier years for this month yet (needs 5).";
  else {
    const a = usual > 0 ? (v - usual) / usual * 100 : null;
    vs = a == null ? `Usually none in ${MONTHS[m - 1]}.` : `<span class="badge ${BADGE_CLASS[labelFor(a)]}">${labelFor(a)}</span> ${pct(a)} vs a usual ${MONTHS[m - 1]} (${fmt(usual)}).`;
  }
  $("prov-now").innerHTML = `<p class="prov-big"><b>${fmt(v)}</b> hotspots in ${MONTHS[m - 1]} ${y}${v ? ` · <b>#${rank}</b> of ${p.names.length} ${p.country === "AUS" ? "states" : "provinces"} this month` : ""}</p><p>${vs}</p>`;

  // Typical year (monthly medians over complete years) and yearly totals.
  let html = "";
  if (st.enough) {
    const max = Math.max(...st.typical) || 1;
    let best = 0, bestSum = -1;
    for (let s = 0; s <= 9; s++) { const sum = st.typical[s] + st.typical[s + 1] + st.typical[s + 2]; if (sum > bestSum) { bestSum = sum; best = s; } }
    const peak = [best + 1, best + 2, best + 3];
    html += `<h3>📅 Typical year</h3><p>Busiest 3 months: <b>${MONTHS[best]}–${MONTHS[best + 2]}</b>
      (${fmt(bestSum / st.typical.reduce((a, b) => a + b, 0) * 100)}% of a typical year).</p>
      <div class="sbars" aria-hidden="true">${st.typical.map((t, j) => `<div class="sbar ${peak.includes(j + 1) ? "peak" : ""} ${j + 1 === m ? "now" : ""}" title="${MONTHS[j]}: usually ${fmt(t)}"><i style="height:${Math.max(3, t / max * 100)}%"></i><span>${MONTHS[j][0]}</span></div>`).join("")}</div>`;
  }
  const years = [...st.byYear.keys()].sort((a, b) => a - b);
  const totals = years.map((yy) => st.byYear.get(yy).reduce((s, x) => s + (x || 0), 0));
  const tmax = Math.max(...totals) || 1;
  html += `<h3>📈 Year by year</h3><div class="ybars" aria-hidden="true">${years.map((yy, j) =>
    `<div class="ybar ${yy === y ? "now" : ""} ${st.complete.includes(yy) ? "" : "part"}" title="${yy}: ${fmt(totals[j])}${st.complete.includes(yy) ? "" : " (part of the year)"}"><i style="height:${Math.max(2, totals[j] / tmax * 100)}%"></i></div>`).join("")}</div>
    <p class="muted small ylabels"><span>${years[0]}</span><span>${years[years.length - 1]}</span></p>`;
  $("prov-charts").innerHTML = html;

  const feat = featuredFor(name);
  $("prov-featured").hidden = !feat;
  if (feat) $("prov-featured").dataset.id = feat;
  $("prov-note").textContent = `${p.method} Season, early-signal and unusual-place analysis are only for the featured areas; the panels below still show ${p.parent_name}.`;
}

function provinceCSV() {
  if (!Prov.sel) return;
  const { region, i } = Prov.sel, p = Prov.data[region];
  const lines = p.months.map((ym, k) => `${ym},${p.counts[i][k] == null ? "" : p.counts[i][k]}`);
  const blob = new Blob([["month,hotspots_noaa20_equivalent", ...lines].join("\n") + "\n"], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `burn-calendar_province_${p.names[i].toLowerCase().replace(/[^a-z0-9]+/g, "-")}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function provinceInit() {
  $("regions").addEventListener("change", (e) => {
    const s = e.target.closest(".prov-select");
    if (!s) return;
    if (s.value === "") { closeProvince(); return; }
    openProvince(s.dataset.region, Number(s.value), true);
    if (isDrawer()) closeMenu();
  });
  $("prov-close").addEventListener("click", closeProvince);
  $("prov-csv").addEventListener("click", provinceCSV);
  $("prov-featured").addEventListener("click", (e) => { closeProvince(); loadArea(e.currentTarget.dataset.id); });
  // Tap or click a map cell: open its province.
  TM.canvas.addEventListener("click", (ev) => {
    const g = App.grid, p = Prov.data[App.gridRegion];
    if (!g || !p) return;
    const r = TM.canvas.getBoundingClientRect();
    const col = TM.view.x0 + Math.floor((ev.clientX - r.left) / r.width * TM.view.w);
    const row = TM.view.y0 + Math.floor((ev.clientY - r.top) / r.height * TM.view.h);
    const k = g.cell_name[row * g.w + col];
    if (k == null || k < 0 || featuredFor(g.names[k]) === App.areaId) return; // already showing it in full
    const i = p.names.indexOf(g.names[k]);
    if (i >= 0) openProvince(App.gridRegion, i);
  });
}
