// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Story tab: fire facts computed from the data, and the Satellite Relay explainer.

const SENSOR_COLOUR = { MODIS: "#fcc419", SNPP: "#4dabf7", NOAA20: "#f8f9fa" };
const RELAY = { mode: "raw", t0: performance.now() };

function renderFacts() {
  const a = App.area;
  const years = completeYears();
  const yearly = a.yearly;
  const total = yearly.reduce((s, y) => s + y.count, 0);
  const worstMonth = a.calendar.reduce((w, c) => (c.count > w.count ? c : w), a.calendar[0]);
  const secs = (new Date(worstMonth.year, worstMonth.month, 0).getDate() * 86400) / worstMonth.count;
  const worstYear = yearly.reduce((w, y) => (y.count > w.count ? y : w), yearly[0]);
  const calmYear = yearly.reduce((w, y) => (y.count < w.count ? y : w), yearly[0]);
  const avg = Array(12).fill(0);
  for (const c of a.calendar) if (years.includes(c.year)) avg[c.month - 1] += c.count;
  const top = avg.map((v, i) => [v, i]).sort((x, y) => y[0] - x[0]).slice(0, 3).map(([, i]) => i).sort((x, y) => x - y);
  const share = top.reduce((s, m) => s + avg[m], 0) / avg.reduce((s, v) => s + v, 0) * 100;
  const l = a.latest;
  const f1 = a.method.factors.modis_to_snpp;
  const card = (big, text) => `<div class="fact-card"><span class="big-num">${big}</span><p>${text}</p></div>`;
  $("facts").innerHTML = [
    card(`${fmt(total / 1e6, 1)} MILLION`, `fire hotspots detected from ${years[0]} to ${years[years.length - 1]}
      (NOAA-20-equivalent).`),
    card(`1 EVERY ${secs < 60 ? `${fmt(secs, 1)} SEC` : `${fmt(secs / 60, 1)} MIN`}`, `In ${MONTHS_LONG[worstMonth.month - 1]}
      ${worstMonth.year}, the worst month on record here, a new fire hotspot was detected about this often.`),
    card(`${fmt(worstYear.count / Math.max(1, calmYear.count), 0)}× WORSE`, `${worstYear.year} had ${fmt(worstYear.count / Math.max(1, calmYear.count), 0)}
      times as many hotspots as the calmest year, ${calmYear.year}.`),
    card(`${fmt(share)}% IN 3 MONTHS`, `${top.map((m) => MONTHS_LONG[m]).join(", ")} hold ${fmt(share)}% of a typical year's fire
      hotspots: the fire season.`),
    card(l.label.toUpperCase(), `${MONTHS_LONG[l.month - 1]} ${l.year}: ${fmt(l.count)} hotspots vs a usual ${fmt(l.median)}
      (${pct(l.anomaly_pct)}).${sinceText(calEntry(l.year, l.month)) ? ` That is ${sinceText(calEntry(l.year, l.month))}.` : ""}`),
    card(`VIIRS SEES ${fmt(f1, 1)}×`, `The newer VIIRS sensor detects about ${fmt(f1, 1)}× as many hotspots as MODIS over
      the same area, because its pixels are 375 m instead of 1 km.`),
  ].join("");
}

function renderRelaySteps() {
  const f = App.area.method.factors;
  const step = (title, text) => `<div><b>${title}</b>${text}</div>`;
  $("relay-steps").innerHTML = [
    step("2000 · MODIS", "Terra and Aqua start the record with 1 km pixels. They catch big fires but miss many small ones."),
    step("2012 · SUOMI NPP", `VIIRS arrives with 375 m pixels and sees about <strong>${fmt(f.modis_to_snpp, 1)}×</strong> more hotspots than MODIS here.`),
    step("2018 · NOAA-20", `A second VIIRS. It sees about <strong>${fmt(f.snpp_to_noaa20, 2)}×</strong> what Suomi NPP sees: our common unit.`),
    step("2026 · HANDOVER", "Suomi NPP stopped on 2 Nov 2026 and MODIS is retiring. We convert all years to NOAA-20 units so they compare fairly."),
  ].join("");
}

// Animated timeline: three satellites over 2000-2027 and the harmonized record they feed.
function drawRelaySats(now) {
  requestAnimationFrame(drawRelaySats);
  const c = $("relay-sats");
  if (!c || $("view-story").hidden || !App.area) return;
  if (c.width !== 960) { c.width = 960; c.height = 230; }
  const ctx = c.getContext("2d");
  const X = (yr) => 60 + (yr - 2000) / 27 * 880;
  ctx.fillStyle = "#0c2016"; ctx.fillRect(0, 0, c.width, c.height);
  // stars
  ctx.fillStyle = "#2f5a3d";
  for (let i = 0; i < 60; i++) ctx.fillRect((i * 97) % 960, (i * 53) % 230, 2, 2);
  const lanes = [
    ["MODIS", 2000.83, 2026.9, 40], ["SNPP", 2012.05, 2026.84, 90], ["NOAA20", 2018.25, 2026.9, 140],
  ];
  const t = reducedMotion ? 2026.9 : 2000 + ((now - RELAY.t0) / 220) % 27;
  ctx.font = "10px 'Press Start 2P', monospace";
  for (const [s, a, b, y] of lanes) {
    ctx.fillStyle = "#1d3f2a"; ctx.fillRect(X(a), y + 6, X(b) - X(a), 6);
    ctx.fillStyle = SENSOR_COLOUR[s]; ctx.fillRect(X(a), y + 6, Math.max(0, Math.min(X(t), X(b)) - X(a)), 6);
    ctx.fillText(s === "SNPP" ? "SUOMI NPP" : s === "NOAA20" ? "NOAA-20" : s, 8, y - 4);
    if (t >= a && t <= b) {
      const bob = reducedMotion ? 0 : Math.round(Math.sin(now / 300 + y) * 2);
      drawSprite(ctx, SPRITES.satellite, X(t) - 19, y - 2 + bob, 3, { ...PAL, g: SENSOR_COLOUR[s] });
    }
  }
  // Harmonized record: which sensor feeds each period.
  const feeds = [["MODIS", 2000.83, 2012.09], ["SNPP", 2012.09, 2018.25], ["NOAA20", 2018.25, 2026.9]];
  ctx.fillStyle = "#ffd43b"; ctx.fillText("HARMONIZED RECORD (NOAA-20 UNITS)", 8, 186);
  for (const [s, a, b] of feeds) {
    ctx.fillStyle = SENSOR_COLOUR[s];
    ctx.fillRect(X(a), 196, Math.max(0, Math.min(X(t), X(b)) - X(a)), 12);
  }
  ctx.fillStyle = "#ff922b"; ctx.fillRect(X(t) - 1, 20, 3, 194);
  ctx.fillStyle = "#a9c4a0";
  for (const yr of [2000, 2005, 2010, 2015, 2020, 2025]) ctx.fillText(String(yr), X(yr) - 18, 226);
}

function drawRelayChart() {
  const c = $("relay-chart");
  const a = App.area;
  c.width = 960; c.height = 320;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#0f2217"; ctx.fillRect(0, 0, c.width, c.height);
  const f = a.method.factors;
  const toN20 = { MODIS: f.modis_to_snpp * f.snpp_to_noaa20, SNPP: f.snpp_to_noaa20, NOAA20: 1 };
  const harm = RELAY.mode === "harm";
  const series = Object.entries(a.raw_yearly).map(([s, rows]) =>
    [s, rows.filter((r) => r.year >= 2001).map((r) => [r.year, harm ? r.count * toN20[s] : r.count])]);
  const years = a.yearly.map((y) => y.year);
  const y0 = years[0], y1 = years[years.length - 1];
  const maxV = Math.max(...series.flatMap(([, r]) => r.map(([, v]) => v)), ...(harm ? a.yearly.map((y) => y.count) : [0]));
  const X = (yr) => 70 + (yr - y0) / Math.max(1, y1 - y0) * 860;
  const Y = (v) => 290 - v / maxV * 260;
  ctx.font = "10px 'Press Start 2P', monospace";
  ctx.fillStyle = "#2f5a3d";
  for (let k = 0; k <= 4; k++) {
    ctx.fillRect(70, Y(maxV * k / 4), 860, 1);
    ctx.fillStyle = "#a9c4a0"; ctx.fillText(fmt(maxV * k / 4 / 1000) + "k", 4, Y(maxV * k / 4) + 4); ctx.fillStyle = "#3a3366";
  }
  if (harm) { // harmonized calendar totals as pixel bars behind the lines
    for (const y of a.yearly) {
      ctx.fillStyle = "rgba(255,146,43,0.35)";
      ctx.fillRect(X(y.year) - 12, Y(y.count), 24, 290 - Y(y.count));
    }
  }
  for (const [s, pts] of series) {
    ctx.fillStyle = SENSOR_COLOUR[s];
    for (let i = 0; i < pts.length; i++) {
      const [yr, v] = pts[i];
      ctx.fillRect(X(yr) - 4, Y(v) - 4, 8, 8);
      if (i) { // straight segment between yearly points
        const [pyr, pv] = pts[i - 1];
        ctx.strokeStyle = SENSOR_COLOUR[s]; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(X(pyr), Y(pv)); ctx.lineTo(X(yr), Y(v)); ctx.stroke();
      }
    }
  }
  ctx.fillStyle = "#a9c4a0";
  for (let yr = y0; yr <= y1; yr += 4) ctx.fillText(String(yr), X(yr) - 18, 314);
  let lx = 640;
  for (const s of ["MODIS", "SNPP", "NOAA20"]) {
    ctx.fillStyle = SENSOR_COLOUR[s]; ctx.fillRect(lx, 12, 10, 10);
    ctx.fillStyle = "#f1f7e9"; ctx.fillText(s === "NOAA20" ? "NOAA-20" : s, lx + 16, 22);
    lx += 100;
  }
  $("relay-caption").innerHTML = harm
    ? "Harmonized: each sensor converted to NOAA-20 units. Where satellites overlap, the lines now agree; the orange bars are the calendar record."
    : `Raw counts: the same fires, but MODIS (gold) counts about ${fmt(f.modis_to_snpp, 1)}× fewer than VIIRS. Joining them without conversion would fake a jump in 2012.`;
}

function setRelayMode(mode) {
  RELAY.mode = mode;
  $("relay-raw").setAttribute("aria-pressed", mode === "raw");
  $("relay-harm").setAttribute("aria-pressed", mode === "harm");
  drawRelayChart();
}

function storyInit() {
  $("relay-raw").addEventListener("click", () => setRelayMode("raw"));
  $("relay-harm").addEventListener("click", () => setRelayMode("harm"));
  requestAnimationFrame(drawRelaySats);
}

function storyOnArea() {
  renderFacts();
  renderRelaySteps();
  drawRelayChart();
}
