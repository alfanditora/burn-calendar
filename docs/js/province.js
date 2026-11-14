// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Grouped area list, the any-province view and "draw your own area".
// Provinces: monthly hotspots from grid/{region}_provinces.json (same harmonized points as the area calendar).
// Drawn areas: the sum of the map's 0.25° squares inside the box (same harmonized counts as the map).

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
const DEFAULT_MIN_PEAK_MEDIAN = 10; // used for drawn areas if no province file (same as config.py)

// sel = a province {region, i}; box = a drawn area {region, x0, y0, x1, y1} in grid cells (inclusive).
const Prov = { data: {}, sel: null, box: null, drag: null, justDrew: 0, drawMode: false, maskCache: new Map() };

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
    return `<button type="button" data-id="${id}" aria-pressed="${id === App.areaId && !Prov.sel && !Prov.box}">${label}${why ? `<small>${why}</small>` : ""}</button>`;
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

// Cells of the selected province or drawn area on the current map ("1"/"0" per cell), for the map overlay.
function provinceMask() {
  const g = App.grid;
  if (Prov.box && Prov.box.region === App.gridRegion) {
    const b = Prov.box, key = `box:${b.region}:${b.x0},${b.y0},${b.x1},${b.y1}`;
    if (!Prov.maskCache.has(key)) {
      let s = "";
      for (let c = 0; c < g.w * g.h; c++) { const x = c % g.w, y = Math.floor(c / g.w); s += x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1 ? "1" : "0"; }
      Prov.maskCache.set(key, s);
    }
    return Prov.maskCache.get(key);
  }
  if (!Prov.sel || Prov.sel.region !== App.gridRegion) return null;
  const key = `${Prov.sel.region}:${Prov.sel.i}`;
  if (!Prov.maskCache.has(key)) {
    const name = Prov.data[Prov.sel.region].names[Prov.sel.i];
    const k = g.names.indexOf(name);
    Prov.maskCache.set(key, g.cell_name.map((c) => (c === k ? "1" : "0")).join(""));
  }
  return Prov.maskCache.get(key);
}

async function openProvince(region, i, scroll = false) {
  if (!Prov.data[region] || i < 0) return;
  if (App.areaId !== region) await loadArea(region); // whole-country map, so the province is in view
  Prov.sel = { region, i }; Prov.box = null;
  provinceRedraw();
  if (scroll) $("province-panel").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
}

function openBox(b) {
  Prov.box = { region: App.gridRegion, ...b }; Prov.sel = null;
  provinceRedraw();
}

function closeProvince() {
  if (!Prov.sel && !Prov.box) return;
  Prov.sel = null; Prov.box = null;
  provinceRedraw();
}

function provinceRedraw() {
  renderRegionGroups();
  if (App.grid && TM.view) tmBuildOverlay();
  provinceOnMonth();
  if (typeof updateViewLink === "function") updateViewLink();
}

// ---------- drawn area: geometry and monthly series ----------
function boxBounds(b, g = App.grid) {   // [west, south, east, north] in degrees
  return [g.bbox[0] + b.x0 * g.deg, g.bbox[3] - (b.y1 + 1) * g.deg, g.bbox[0] + (b.x1 + 1) * g.deg, g.bbox[3] - b.y0 * g.deg];
}
function boxFromBounds(w, s, e, n, g = App.grid) {  // degrees -> cells (squares the box touches)
  const cx = (lon) => Math.max(0, Math.min(g.w - 1, Math.floor((lon - g.bbox[0]) / g.deg)));
  const cy = (lat) => Math.max(0, Math.min(g.h - 1, Math.floor((g.bbox[3] - lat) / g.deg)));
  return { x0: cx(Math.min(w, e)), x1: cx(Math.max(w, e) - 1e-9), y0: cy(Math.max(s, n)), y1: cy(Math.min(s, n) + 1e-9) };
}
const degText = (v, pos, neg) => `${fmt(Math.abs(v), 2)}°${v < 0 ? neg : pos}`;
function boxTitle(b) {
  const [w, s, e, n] = boxBounds(b);
  return `${degText(s, "N", "S")} to ${degText(n, "N", "S")}, ${degText(w, "E", "W")} to ${degText(e, "E", "W")}`;
}
function boxSeries(b) {
  const g = App.grid;
  return g.fires.map((flat) => {
    let sum = 0;
    for (let j = 0; j < flat.length; j += 2) {
      const c = flat[j], x = c % g.w, y = Math.floor(c / g.w);
      if (x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1) sum += flat[j + 1];
    }
    return sum;
  });
}

// The selection shown in the panel: a province or a drawn area, as one monthly series.
function currentSeries() {
  if (!App.grid) return null;
  const p = Prov.data[App.gridRegion];
  if (Prov.box && Prov.box.region === App.gridRegion) {
    const b = Prov.box, g = App.grid, nx = b.x1 - b.x0 + 1, ny = b.y1 - b.y0 + 1;
    const lat = Math.abs(g.bbox[3] - (b.y0 + b.y1 + 1) / 2 * g.deg) * Math.PI / 180;
    const km = (n, d) => Math.round(n * g.deg * 111 * d / 5) * 5;
    return {
      kind: "box", title: "Your area", sub: `${boxTitle(b)} · ${nx * ny === 1 ? "1 square" : `${nx} × ${ny} squares`}, about ${fmt(km(nx, Math.cos(lat)))} × ${fmt(km(ny, 1))} km`,
      months: g.months, counts: boxSeries(b), min: p ? p.min_peak_median : DEFAULT_MIN_PEAK_MEDIAN,
      file: `area_${boxBounds(b).map((v) => v.toFixed(2)).join("_")}`,
      note: `Sum of the map's 0.25° squares (about 25 km) inside the box, in NOAA-20 units using the ${App.area.name} sensor factors (no per-area factor); each square is rounded to whole hotspots, and the box follows square edges, not borders, so it can include sea or a neighbouring country. Season, early-signal and unusual-place analysis are only for the featured areas; the panels below still show ${App.area.name}.`,
    };
  }
  if (Prov.sel && Prov.sel.region === App.gridRegion && p) {
    const { region, i } = Prov.sel;
    return {
      kind: "province", title: provName(region, i), sub: "", i, p,
      months: p.months, counts: p.counts[i], min: p.min_peak_median,
      file: `province_${p.names[i].toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      note: `${p.method} Season, early-signal and unusual-place analysis are only for the featured areas; the panels below still show ${p.parent_name}.`,
    };
  }
  return null;
}

// Statistics for one monthly series, with the same rules as the areas (earlier complete years, >= 5).
const median = (v) => { const s = [...v].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
function seriesStats(months, counts, min) {
  const byYear = new Map();
  months.forEach((ym, k) => {
    const [y, m] = ym.split("-").map(Number);
    if (!byYear.has(y)) byYear.set(y, new Array(12).fill(null));
    byYear.get(y)[m - 1] = counts[k];
  });
  const complete = [...byYear].filter(([, v]) => v.every((x) => x != null)).map(([y]) => y);
  const typical = Array.from({ length: 12 }, (_, m) => complete.length ? median(complete.map((y) => byYear.get(y)[m])) : 0);
  const peakMedian = Math.max(...typical);
  return { byYear, complete, typical, enough: complete.length >= MIN_BASE_YEARS && peakMedian >= min };
}

function provinceOnMonth() {
  const panel = $("province-panel"), cur = currentSeries();
  if (!cur) { panel.hidden = true; return; }
  const ym = App.grid.months[TM.idx], k = cur.months.indexOf(ym), [y, m] = ym.split("-").map(Number);
  const v = k >= 0 ? cur.counts[k] : null;
  const st = seriesStats(cur.months, cur.counts, cur.min);
  panel.hidden = false;
  $("prov-kicker").textContent = cur.kind === "box" ? "Draw your own area · counts only" : "Province view · counts only";
  $("prov-title").textContent = cur.title;
  $("prov-sub").textContent = cur.sub;
  $("prov-sub").hidden = !cur.sub;

  // This month: count, usual (median of the same month in earlier complete years), rank among provinces.
  const earlier = st.complete.filter((yy) => yy < y).map((yy) => st.byYear.get(yy)[m - 1]);
  const usual = earlier.length >= MIN_BASE_YEARS ? median(earlier) : null;
  let rankText = "";
  if (cur.kind === "province" && k >= 0 && v) {
    const ranked = cur.p.counts.map((c, j) => [c[k] || 0, j]).sort((a, b) => b[0] - a[0]);
    rankText = ` · <b>#${ranked.findIndex(([, j]) => j === cur.i) + 1}</b> of ${cur.p.names.length} ${cur.p.country === "AUS" ? "states" : "provinces"} this month`;
  }
  let vs;
  if (v == null) vs = "No data for this month.";
  else if (!st.enough) vs = `Too few fires here for "usual" and fire-season comparisons: the busiest month usually has fewer than ${cur.min} hotspots, so one or two fires would swing every percentage. The counts are still real.`;
  else if (usual == null) vs = "Not enough earlier years for this month yet (needs 5).";
  else {
    const a = usual > 0 ? (v - usual) / usual * 100 : null;
    vs = a == null ? `Usually none in ${MONTHS[m - 1]}.` : `<span class="badge ${BADGE_CLASS[labelFor(a)]}">${labelFor(a)}</span> ${pct(a)} vs a usual ${MONTHS[m - 1]} (${fmt(usual)}).`;
  }
  $("prov-now").innerHTML = `<p class="prov-big"><b>${fmt(v)}</b> hotspots in ${MONTHS[m - 1]} ${y}${rankText}</p><p>${vs}</p>`;

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

  const feat = cur.kind === "province" ? featuredFor(cur.p.names[cur.i]) : null;
  $("prov-featured").hidden = !feat;
  if (feat) $("prov-featured").dataset.id = feat;
  $("prov-note").textContent = cur.note;
}

function provinceCSV() {
  const cur = currentSeries();
  if (!cur) return;
  const head = cur.kind === "box"
    ? `# ${boxTitle(Prov.box)}; sum of 0.25 degree map squares; NOAA-20-equivalent hotspots\nmonth,hotspots_noaa20_equivalent`
    : "month,hotspots_noaa20_equivalent";
  const lines = cur.months.map((ym, k) => `${ym},${cur.counts[k] == null ? "" : cur.counts[k]}`);
  const blob = new Blob([[head, ...lines].join("\n") + "\n"], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `burn-calendar_${cur.file}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

// ---------- drawing on the map ----------
function cellAt(ev) {
  const g = App.grid, r = TM.canvas.getBoundingClientRect();
  const x = TM.view.x0 + Math.floor((ev.clientX - r.left) / r.width * TM.view.w);
  const y = TM.view.y0 + Math.floor((ev.clientY - r.top) / r.height * TM.view.h);
  return { x: Math.max(0, Math.min(g.w - 1, x)), y: Math.max(0, Math.min(g.h - 1, y)) };
}
const dragBox = (d) => ({ x0: Math.min(d.a.x, d.b.x), x1: Math.max(d.a.x, d.b.x), y0: Math.min(d.a.y, d.b.y), y1: Math.max(d.a.y, d.b.y) });

function setDrawMode(on) {
  Prov.drawMode = on;
  $("draw-btn").setAttribute("aria-pressed", on);
  TM.canvas.classList.toggle("drawing", on);
  $("draw-note").textContent = on ? "Drag on the map to draw a box (or tap one square). Esc to cancel." : "";
}

// Live outline while dragging (called from the map's render loop).
function drawBoxPreview(ctx, K) {
  if (!Prov.drag) return;
  const b = dragBox(Prov.drag), v = TM.view, t = Math.max(2, Math.round(K / 5));
  const x = (b.x0 - v.x0) * K, y = (b.y0 - v.y0) * K, w = (b.x1 - b.x0 + 1) * K, h = (b.y1 - b.y0 + 1) * K;
  ctx.fillStyle = "rgba(255, 224, 102, 0.25)"; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = "#ffe066";
  ctx.fillRect(x, y, w, t); ctx.fillRect(x, y + h - t, w, t); ctx.fillRect(x, y, t, h); ctx.fillRect(x + w - t, y, t, h);
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
  $("draw-btn").addEventListener("click", () => setDrawMode(!Prov.drawMode));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && Prov.drawMode) { Prov.drag = null; setDrawMode(false); } });

  // Draw: pointer down, drag, up (mouse, pen or finger; the canvas does not scroll the page while drawing).
  TM.canvas.addEventListener("pointerdown", (ev) => {
    if (!Prov.drawMode || !App.grid) return;
    ev.preventDefault();
    TM.canvas.setPointerCapture(ev.pointerId);
    const c = cellAt(ev);
    Prov.drag = { a: c, b: c };
  });
  TM.canvas.addEventListener("pointermove", (ev) => { if (Prov.drag) Prov.drag.b = cellAt(ev); });
  const finish = () => {
    if (!Prov.drag) return;
    const b = dragBox(Prov.drag);
    Prov.drag = null; Prov.justDrew = Date.now();
    setDrawMode(false);
    openBox(b);
    $("province-panel").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest" });
  };
  TM.canvas.addEventListener("pointerup", finish);
  TM.canvas.addEventListener("pointercancel", () => { Prov.drag = null; });

  // Tap or click a map cell (outside draw mode): open its province.
  TM.canvas.addEventListener("click", (ev) => {
    if (Prov.drawMode || Date.now() - Prov.justDrew < 500) return; // the click that ends a drag
    const g = App.grid, p = Prov.data[App.gridRegion];
    if (!g || !p) return;
    const { x, y } = cellAt(ev), k = g.cell_name[y * g.w + x];
    if (k == null || k < 0 || featuredFor(g.names[k]) === App.areaId) return; // already showing it in full
    const i = p.names.indexOf(g.names[k]);
    if (i >= 0) openProvince(App.gridRegion, i);
  });
}
