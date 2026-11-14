// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Pixel map + Fire Time Machine. One map cell = one 0.25° grid cell (about 25 km).
// Fire pixels flicker; the hottest cells grow a flame sprite and throw embers.

const FIRE_RAMP = ["#5c1a0b", "#8f2410", "#c2361b", "#e8590c", "#ff922b", "#ffc234", "#ffe066", "#fff3bf"];
const SPEEDS = [[1, 450], [2, 220], [4, 110]];

const TM = {
  idx: 0, playing: false, speed: 0, timer: null, frame: 0, K: 6,
  canvas: null, ctx: null, base: null, vmax: 1, fires: [], embers: [], played: 0, momentUntil: 0,
  layer: "fires", anom: null, anomCache: new Map(), focus: null,
};
// "Unusual" layer: more fires than usual (warm) or fewer (cool), vs the same month in earlier years.
const MORE_RAMP = ["#ffe8a3", "#ffc234", "#ff922b", "#f03e3e", "#c92a2a", "#7a1010"];
const LESS_RAMP = ["#a5d8ff", "#74c0fc", "#4dabf7", "#1c7ed6"];
const MIN_BASE_YEARS = 5; // same as config.MIN_BASELINE_YEARS

// Per-cell anomaly for grid month i: value, median of the same month in earlier complete years, excess.
function cellAnomaly(i) {
  if (TM.anomCache.has(i)) return TM.anomCache.get(i);
  const g = App.grid, [y, m] = g.months[i].split("-").map(Number);
  const asMap = (k) => { const f = g.fires[k], out = new Map(); for (let j = 0; j < f.length; j += 2) out.set(f[j], f[j + 1]); return out; };
  const years = completeYears().filter((yy) => yy < y);
  const base = years.map((yy) => g.months.indexOf(`${yy}-${String(m).padStart(2, "0")}`)).filter((k) => k >= 0).map(asMap);
  const res = { n: base.length, cells: new Map() };
  if (base.length >= MIN_BASE_YEARS) {
    const now = asMap(i), keys = new Set(now.keys());
    for (const b of base) for (const c of b.keys()) keys.add(c);
    for (const c of keys) {
      const vals = base.map((b) => b.get(c) || 0).sort((a, b) => a - b), h = vals.length >> 1;
      const med = vals.length % 2 ? vals[h] : (vals[h - 1] + vals[h]) / 2;
      const v = now.get(c) || 0;
      if (v || med) res.cells.set(c, { v, med, ex: v - med });
    }
  }
  TM.anomCache.set(i, res);
  return res;
}

// Routine vs unusual for one cell-month. A hotspot is any vegetation fire (wildfire, farm burning, clearing),
// so the cause is never named: only whether this place is burning about as much as in most earlier years.
const ROUTINE_BAND = [0.5, 1.5];   // within 50%-150% of the cell's usual amount = routine
const ROUTINE_COLOUR = "#9a9486";
function burnKind(r) {
  if (!r) return null;
  if (r.med >= 1 && r.v >= ROUTINE_BAND[0] * r.med && r.v <= ROUTINE_BAND[1] * r.med) return "routine";
  if (r.ex >= 1) return "more";
  if (r.ex <= -1) return "less";
  return null;
}
function burnKindText(r, month) {
  const k = burnKind(r), mon = MONTHS[month - 1];
  if (k === "routine") return `<i>Routine:</i> about the usual amount for ${mon} here (usually ${fmt(r.med)})`;
  if (k === "less") return `<i>Quieter</i> than usual for ${mon} here (usually ${fmt(r.med)})`;
  if (k === "more") {
    const usual = r.med < 1 ? "usually almost none" : `usually ${fmt(r.med)}`;
    return r.med < 1 || r.v >= 2 * r.med
      ? `<i>Unusual:</i> far above normal for ${mon} here (${usual}). More likely an uncontrolled fire.`
      : `<i>Above normal</i> for ${mon} here (${usual})`;
  }
  return "";
}

// Cell helpers shared with the season panel.
function cellInArea(cell) { const mask = (App.grid.areas || {})[App.areaId]; return !mask || mask[cell] === "1"; }
function cellPlace(cell) {
  const g = App.grid, col = cell % g.w, row = Math.floor(cell / g.w);
  const lat = g.bbox[3] - (row + 0.5) * g.deg, lon = g.bbox[0] + (col + 0.5) * g.deg;
  const k = (g.cell_name || [])[cell], name = k >= 0 ? g.names[k] : null;
  const where = `${fmt(Math.abs(lat), 1)}°${lat < 0 ? "S" : "N"} ${fmt(lon, 1)}°E`;
  return { name, where, lat, lon };
}
function topUnusual(i, n = 10) {
  const a = cellAnomaly(i);
  return [...a.cells].filter(([c, r]) => r.ex > 0 && cellInArea(c)).sort((p, q) => q[1].ex - p[1].ex).slice(0, n)
    .map(([cell, r]) => ({ cell, ...r, ...cellPlace(cell) }));
}
function setLayer(layer) {
  TM.layer = layer;
  $("layer-fires").setAttribute("aria-pressed", layer === "fires");
  $("layer-unusual").setAttribute("aria-pressed", layer === "unusual");
  $("legend-fires").hidden = layer !== "fires";
  $("legend-unusual").hidden = layer !== "unusual";
  tmGo(TM.idx);
}

// Notes for well-documented events, shown when the Time Machine reaches them.
const MOMENTS = {
  indonesia: { "2015-09": "2015: the Southeast Asian haze crisis", "2019-09": "2019: another severe haze season" },
  riau: { "2015-09": "2015: the Southeast Asian haze crisis" },
  central_kalimantan: { "2015-09": "2015: the Southeast Asian haze crisis" },
};

function tmInit() {
  TM.canvas = $("pixmap");
  TM.ctx = TM.canvas.getContext("2d");
  $("tm-play").addEventListener("click", () => (TM.playing ? tmPause() : tmPlay()));
  $("tm-prev").addEventListener("click", () => { tmPause(); tmGo(TM.idx - 1); });
  $("tm-next").addEventListener("click", () => { tmPause(); tmGo(TM.idx + 1); });
  $("tm-slider").addEventListener("input", (e) => { tmPause(); tmGo(Number(e.target.value)); });
  $("tm-speed").addEventListener("click", () => {
    TM.speed = (TM.speed + 1) % SPEEDS.length;
    $("tm-speed").textContent = `${SPEEDS[TM.speed][0]}×`;
    if (TM.playing) { tmPause(); tmPlay(); }
  });
  $("layer-fires").addEventListener("click", () => setLayer("fires"));
  $("layer-unusual").addEventListener("click", () => setLayer("unusual"));
  TM.canvas.addEventListener("mousemove", tmHover);
  TM.canvas.addEventListener("mouseleave", () => { $("tip").hidden = true; });
  requestAnimationFrame(tmLoop);
}

// The part of the region grid that is drawn: the whole region, or a zoomed window around a province.
function tmComputeView() {
  const g = App.grid;
  if (App.areaId === App.gridRegion) return { x0: 0, y0: 0, w: g.w, h: g.h };
  const [w, s, e, n] = App.area.bbox, pad = 3;
  let x0 = Math.floor((w - g.bbox[0]) / g.deg) - pad, x1 = Math.ceil((e - g.bbox[0]) / g.deg) + pad;
  let y0 = Math.floor((g.bbox[3] - n) / g.deg) - pad, y1 = Math.ceil((g.bbox[3] - s) / g.deg) + pad;
  // Keep a landscape window (at least 2:1) so the map stays short on screen.
  const minW = Math.ceil((y1 - y0) * 2);
  if (x1 - x0 < minW) { const c = (x0 + x1) / 2; x0 = Math.round(c - minW / 2); x1 = x0 + minW; }
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const vw = Math.min(g.w, x1 - x0), vh = Math.min(g.h, y1 - y0);
  x0 = clamp(x0, 0, g.w - vw); y0 = clamp(y0, 0, g.h - vh);
  return { x0, y0, w: vw, h: vh };
}

// Build the static sea/land layer for the current view.
function tmBuildBase() {
  const g = App.grid, v = TM.view;
  TM.K = Math.min(28, Math.max(4, Math.ceil(1100 / v.w)));
  const K = TM.K, W = v.w * K, H = v.h * K;
  TM.canvas.width = W; TM.canvas.height = H;
  TM.base = document.createElement("canvas");
  TM.base.width = W; TM.base.height = H;
  const b = TM.base.getContext("2d");
  const land = (x, y) => g.land[y * g.w + x] === "1";
  const edge = Math.max(1, Math.round(K / 4));
  for (let y = v.y0; y < v.y0 + v.h; y++) {
    for (let x = v.x0; x < v.x0 + v.w; x++) {
      const px = (x - v.x0) * K, py = (y - v.y0) * K, l = land(x, y), dither = (x + y) % 2 === 0;
      b.fillStyle = l ? (dither ? "#2f6b3f" : "#2b6339") : (dither ? "#0f1a3d" : "#0d1736");
      b.fillRect(px, py, K, K);
      if (l) { // coastline highlight on the top and left edges facing the sea
        b.fillStyle = "#4c8f57";
        if (y > 0 && !land(x, y - 1)) b.fillRect(px, py, K, edge);
        if (x > 0 && !land(x - 1, y)) b.fillRect(px, py, edge, K);
      }
    }
  }
  // Colour scale: 99th percentile of all non-zero cell-months in the region, on a log scale.
  const vals = [];
  for (const f of g.fires) for (let j = 1; j < f.length; j += 2) vals.push(f[j]);
  vals.sort((a, c) => a - c);
  TM.vmax = Math.max(2, vals[Math.floor(vals.length * 0.99)] || 2);
}

// Static overlay for the selected area, from the grid's per-area cell mask (cells touching the outline).
function tmBuildOverlay() {
  // The selected province (any-province view) if there is one, else the selected area.
  const g = App.grid, K = TM.K, v = TM.view;
  const mask = (typeof provinceMask === "function" && provinceMask()) || (g.areas || {})[App.areaId];
  TM.overlay = null;
  if (!mask) return;
  const o = document.createElement("canvas");
  o.width = TM.canvas.width; o.height = TM.canvas.height;
  const c = o.getContext("2d");
  const inside = (x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h && mask[y * g.w + x] === "1";
  const t = Math.max(2, Math.round(K / 5));
  for (let y = v.y0; y < v.y0 + v.h; y++) {
    for (let x = v.x0; x < v.x0 + v.w; x++) {
      const px = (x - v.x0) * K, py = (y - v.y0) * K;
      if (!inside(x, y)) { c.fillStyle = "rgba(8, 14, 34, 0.62)"; c.fillRect(px, py, K, K); continue; }
      c.fillStyle = "#ffffff";
      if (!inside(x, y - 1)) c.fillRect(px, py, K, t);
      if (!inside(x, y + 1)) c.fillRect(px, py + K - t, K, t);
      if (!inside(x - 1, y)) c.fillRect(px, py, t, K);
      if (!inside(x + 1, y)) c.fillRect(px + K - t, py, t, K);
    }
  }
  TM.overlay = o;
}

function tmOnArea() {
  TM.view = tmComputeView();
  tmBuildBase();
  tmBuildOverlay();
  const n = App.grid.months.length;
  $("tm-slider").max = n - 1;
  $("tm-area").textContent = `Hotspots · ${App.area.name}`;
  TM.embers = [];
  TM.anomCache = new Map(); TM.focus = null;
  tmGo(n - 1); // start on the latest month
}

function tmGo(i) {
  const g = App.grid;
  TM.idx = Math.max(0, Math.min(g.months.length - 1, i));
  $("tm-slider").value = TM.idx;
  const flat = g.fires[TM.idx];
  TM.fires = [];
  for (let j = 0; j < flat.length; j += 2) TM.fires.push([flat[j], flat[j + 1]]);
  TM.anom = TM.layer === "unusual" ? cellAnomaly(TM.idx) : null;
  TM.marks = TM.layer === "unusual" ? topUnusual(TM.idx, 5).map((r) => r.cell) : [];
  $("unusual-note").textContent = TM.anom && TM.anom.n < MIN_BASE_YEARS
    ? "Not enough earlier years for this month yet (needs 5). Pick a later month." : "";
  const [y, m] = g.months[TM.idx].split("-").map(Number);
  $("tm-month").textContent = `${MONTHS[m - 1].toUpperCase()} ${y}`;
  const e = calEntry(y, m);
  if (e) {
    $("tm-count").textContent = fmt(e.count);
    $("tm-sensor").textContent = `🛰️ ${SENSOR_NAME[e.source]}`;
    $("tm-fact").innerHTML = tmFact(e);
  } else {
    $("tm-count").textContent = "–";
    $("tm-sensor").textContent = "";
    $("tm-fact").textContent = "";
  }
  // Keep the Data Lab calendar's "month on the map" outline in sync.
  document.querySelectorAll("#calendar td.now").forEach((x) => x.classList.remove("now"));
  document.querySelector(`#calendar td[data-y="${y}"][data-m="${m}"]`)?.classList.add("now");
  if (typeof updateViewLink === "function") updateViewLink();
  if (typeof seasonOnMonth === "function") seasonOnMonth();
  if (typeof provinceOnMonth === "function") provinceOnMonth();
  const note = (MOMENTS[App.areaId] || {})[g.months[TM.idx]];
  if (note && TM.playing) tmMoment(`★ ${note}`);
}

function tmFact(e) {
  if (!e.count) return "No fire hotspots detected this month.";
  const secs = (new Date(e.year, e.month, 0).getDate() * 86400) / e.count;
  const every = secs < 60 ? `${fmt(secs, 1)} seconds` : secs < 3600 ? `${fmt(secs / 60)} minutes` : `${fmt(secs / 3600, 1)} hours`;
  const since = sinceText(e);
  const vs = e.median ? ` · ${labelFor(e.anomaly_pct)} (${pct(e.anomaly_pct)} vs usual)` : "";
  return `About one fire hotspot every <strong>${every}</strong>${since ? ` · <strong>${since}</strong>` : ""}${vs}`;
}

function tmMoment(text) {
  const el = $("tm-moment");
  el.textContent = text;
  el.hidden = false;
  TM.momentUntil = performance.now() + 2200;
}

function tmPlay() {
  if (TM.idx >= App.grid.months.length - 1) tmGo(0);
  TM.playing = true;
  TM.played = 0;
  $("tm-play").textContent = "❚❚ PAUSE";
  TM.timer = setInterval(() => {
    if (performance.now() < TM.momentUntil) return; // hold on a moment banner
    if (TM.idx >= App.grid.months.length - 1) { tmPause(); return; }
    tmGo(TM.idx + 1);
    if (++TM.played === 12) award("time_traveller");
  }, SPEEDS[TM.speed][1]);
}

function tmPause() {
  TM.playing = false;
  clearInterval(TM.timer);
  $("tm-play").textContent = "▶ PLAY";
}

function fireColour(v, jitter) {
  const t = Math.min(1, Math.log1p(v) / Math.log1p(TM.vmax)) + jitter;
  return FIRE_RAMP[Math.max(0, Math.min(FIRE_RAMP.length - 1, Math.floor(t * FIRE_RAMP.length)))];
}

function tmLoop(now) {
  requestAnimationFrame(tmLoop);
  if (!TM.base || now - (TM.last || 0) < 90) return; // ~11 fps is enough for pixel flicker
  TM.last = now;
  TM.frame++;
  const { ctx, K } = TM, g = App.grid;
  ctx.drawImage(TM.base, 0, 0);

  const vw = TM.view;
  if (TM.layer === "unusual") {
    tmDrawUnusual(ctx, K, g, vw);
    if (TM.overlay) ctx.drawImage(TM.overlay, 0, 0);
    if (TM.momentUntil && now > TM.momentUntil) { $("tm-moment").hidden = true; TM.momentUntil = 0; }
    return;
  }
  // Fire cells.
  const hot = [];
  for (const [cell, v] of TM.fires) {
    const cx = cell % g.w - vw.x0, cy = Math.floor(cell / g.w) - vw.y0;
    if (cx < 0 || cy < 0 || cx >= vw.w || cy >= vw.h) continue;
    const x = cx * K, y = cy * K;
    const jitter = reducedMotion ? 0 : (((cell * 7 + TM.frame * 13) % 11) - 5) / 60;
    ctx.fillStyle = fireColour(v, jitter);
    ctx.fillRect(x, y, K, K);
    if (v > TM.vmax * 0.5) hot.push([x, y, v, cell]);
  }
  // Flame sprites on the busiest cells (more than half the top of the colour scale; at most 60, for speed).
  hot.sort((a, b) => b[2] - a[2]);
  TM.flames = new Set(hot.slice(0, 60).map((h) => h[3]));
  const s = K / 4;
  for (const [x, y] of hot.slice(0, 60)) {
    drawSprite(ctx, SPRITES.flame[(TM.frame + x) % 3], x + K / 2 - 3.5 * s, y + K - 9 * s, s);
  }
  // Embers rising from hot cells.
  if (!reducedMotion) {
    if (hot.length && TM.embers.length < 80) {
      for (let k = 0; k < 3; k++) {
        const [x, y] = pick(hot.slice(0, 40));
        TM.embers.push({ x: x + Math.random() * K, y, life: 12 + Math.random() * 10 });
      }
    }
    ctx.fillStyle = "#ffb347";
    TM.embers = TM.embers.filter((e) => {
      e.y -= K * 0.35; e.x += (Math.random() - 0.5) * K * 0.3; e.life--;
      ctx.globalAlpha = Math.max(0, e.life / 22);
      ctx.fillRect(Math.round(e.x), Math.round(e.y), Math.max(2, K / 3), Math.max(2, K / 3));
      return e.life > 0;
    });
    ctx.globalAlpha = 1;
  }
  // Selected area: dim everything outside its real border and draw the border as pixel edges.
  if (TM.overlay) ctx.drawImage(TM.overlay, 0, 0);
  if (TM.momentUntil && now > TM.momentUntil) { $("tm-moment").hidden = true; TM.momentUntil = 0; }
}

function tmDrawUnusual(ctx, K, g, vw) {
  const scale = Math.log1p(TM.vmax);
  const pos = (c) => [(c % g.w - vw.x0) * K, (Math.floor(c / g.w) - vw.y0) * K];
  for (const [cell, r] of (TM.anom ? TM.anom.cells : [])) {
    const kind = burnKind(r);
    if (!kind) continue;
    const [x, y] = pos(cell);
    if (x < 0 || y < 0 || x >= vw.w * K || y >= vw.h * K) continue;
    if (kind === "routine") ctx.fillStyle = ROUTINE_COLOUR;
    else {
      const ramp = kind === "more" ? MORE_RAMP : LESS_RAMP;
      const t = Math.min(0.999, Math.log1p(Math.abs(r.ex)) / scale);
      ctx.fillStyle = ramp[Math.floor(t * ramp.length)];
    }
    ctx.fillRect(x, y, K, K);
  }
  // Blinking frames on the top unusual places (and the one picked from the list).
  const on = reducedMotion || TM.frame % 8 < 5, t = Math.max(2, Math.round(K / 5));
  for (const cell of [...TM.marks, TM.focus].filter((c) => c != null)) {
    const [x, y] = pos(cell);
    if (!on && cell !== TM.focus) continue;
    ctx.fillStyle = cell === TM.focus ? "#1e88e5" : "#ffffff";
    const pad = cell === TM.focus ? Math.round(K / 2) : 0;
    ctx.fillRect(x - pad, y - pad, K + 2 * pad, t); ctx.fillRect(x - pad, y + K + pad - t, K + 2 * pad, t);
    ctx.fillRect(x - pad, y - pad, t, K + 2 * pad); ctx.fillRect(x + K + pad - t, y - pad, t, K + 2 * pad);
  }
}

function tmHover(ev) {
  const g = App.grid, r = TM.canvas.getBoundingClientRect();
  const col = TM.view.x0 + Math.floor((ev.clientX - r.left) / r.width * TM.view.w);
  const row = TM.view.y0 + Math.floor((ev.clientY - r.top) / r.height * TM.view.h);
  const cell = row * g.w + col;
  const tip = $("tip"), place = cellPlace(cell);
  const near = `near ${place.name ? `${place.name}, ` : ""}${place.where}`;
  const month = Number(g.months[TM.idx].split("-")[1]);
  const an = cellAnomaly(TM.idx), a = an.n >= MIN_BASE_YEARS ? an.cells.get(cell) : null; // cached per month
  const kind = a ? burnKindText(a, month) : "";
  const pv = typeof Prov !== "undefined" && Prov.data[App.gridRegion];
  const pk = place.name && pv ? pv.names.indexOf(place.name) : -1;
  const open = pk >= 0 && featuredFor(place.name) !== App.areaId ?`<br>📍 Tap or click for the ${place.name} view` : "";
  const cause = "<span class=\"muted\">Satellites see heat, not the cause: wildfire, farm burning or land clearing look alike.</span>";
  if (TM.layer === "unusual") {
    if (!a) { tip.hidden = true; return; }
    if (burnKind(a) === "more" && (a.med < 1 || a.v >= 2 * a.med) && cellInArea(cell)) award("pattern_spotter");
    tip.innerHTML = `<b>${fmt(a.v)} hotspot${fmt(a.v) === "1" ? "" : "s"}</b>, usually ${fmt(a.med)} (${a.ex >= 0 ? "+" : ""}${fmt(a.ex)})<br>${kind}<br>${near}${open}<br>${cause}`;
  } else {
    const f = TM.fires.find(([c]) => c === cell);
    if (!f) { tip.hidden = true; return; }
    const flame = TM.flames && TM.flames.has(cell) ? "<br>🔥 One of the busiest places on the map this month." : "";
    tip.innerHTML = `<b>${fmt(f[1])} hotspot${fmt(f[1]) === "1" ? "" : "s"}</b> this month${flame}${kind ? `<br>${kind}` : ""}<br>${near}${open}<br>${cause}`;
  }
  tip.hidden = false;
  tip.style.left = `${Math.min(window.innerWidth - 270, ev.clientX + 12)}px`;
  tip.style.top = `${ev.clientY + 12}px`;
}
