// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Core: data loading, shared helpers, player progress (XP, levels, badges), toasts.
// Every number shown in the app comes from data/areas/*.json and data/grid/*.json (NASA FIRMS, harmonized).

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
  "October", "November", "December"];
const SENSOR_NAME = { MODIS: "MODIS (Terra/Aqua)", SNPP: "VIIRS Suomi NPP", NOAA20: "VIIRS NOAA-20" };
const BADGE_CLASS = {
  "Well above normal": "well-above", "Above normal": "above", "Normal": "normal",
  "Below normal": "below", "No baseline": "none",
};
const GRID_REGIONS = ["indonesia", "north_australia"];

const $ = (id) => document.getElementById(id);
const fmt = (n, d = 0) => n == null ? "n/a" : Number(n).toLocaleString("en-US", { maximumFractionDigits: d });
const pct = (n) => n == null ? "n/a" : `${n > 0 ? "+" : ""}${fmt(n)}%`;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Same thresholds as pipeline/config.py ANOMALY_LABELS.
function labelFor(p) {
  if (p == null) return "No baseline";
  if (p >= 50) return "Well above normal";
  if (p >= 15) return "Above normal";
  if (p >= -15) return "Normal";
  return "Below normal";
}

// ---------- data ----------
const App = { index: [], area: null, areaId: null, grid: null, gridRegion: null, cache: {}, listeners: [] };

async function getJSON(url) {
  if (!App.cache[url]) {
    App.cache[url] = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url}: ${r.status}`);
      return r.json();
    });
  }
  return App.cache[url];
}

function regionOf(areaId) {
  const a = App.index.find((x) => x.area_id === areaId);
  for (const r of GRID_REGIONS) {
    const g = App.index.find((x) => x.area_id === r);
    if (g && a.bbox[0] >= g.bbox[0] && a.bbox[1] >= g.bbox[1] && a.bbox[2] <= g.bbox[2] && a.bbox[3] <= g.bbox[3]) return r;
  }
  return GRID_REGIONS[0];
}

async function loadArea(id) {
  const region = regionOf(id);
  const [area, grid] = await Promise.all([getJSON(`data/areas/${id}.json`), getJSON(`data/grid/${region}.json`)]);
  App.area = area; App.areaId = id; App.grid = grid; App.gridRegion = region;
  Player.data.regions[region] = true;
  if (Object.keys(Player.data.regions).length >= 2) award("globe_trotter");
  Player.save();
  document.querySelectorAll(".area-name").forEach((e) => { e.textContent = area.name; });
  App.listeners.forEach((f) => f());
}
const onAreaChange = (f) => App.listeners.push(f);

// Helpers on the current area's calendar.
function completeYears(area = App.area) {
  const n = new Map();
  for (const c of area.calendar) n.set(c.year, (n.get(c.year) || 0) + 1);
  return [...n].filter(([, k]) => k === 12).map(([y]) => y).sort((a, b) => a - b);
}
function calEntry(year, month, area = App.area) {
  return area.calendar.find((c) => c.year === year && c.month === month);
}
// "the highest October since 2015" style comparison, from the data.
function sinceText(entry, area = App.area) {
  const earlier = area.calendar.filter((c) => c.month === entry.month && c.year < entry.year);
  if (earlier.length < 3) return "";
  const higher = earlier.filter((c) => c.count >= entry.count).map((c) => c.year);
  if (!higher.length) return `the most fires for ${MONTHS_LONG[entry.month - 1]} on record (since ${earlier[0].year})`;
  const last = Math.max(...higher);
  if (entry.year - last >= 3) return `the most fires for ${MONTHS_LONG[entry.month - 1]} since ${last}`;
  return "";
}

// ---------- player progress (saved in this browser only) ----------
const LEVELS = [
  [0, "Rookie Ranger"], [120, "Smoke Spotter"], [320, "Hotspot Hunter"], [650, "Satellite Scout"], [1100, "Fire Scientist"],
];
const BADGES = {
  first_spark: ["🔥", "First Spark", "Finish your first game"],
  on_fire: ["⚡", "On Fire", "Reach a streak of 5 in Higher or Lower"],
  haze_hunter: ["🌫️", "Disaster Detective", "Spot the worst year 3 times in a row"],
  globe_trotter: ["🌏", "Globe Trotter", "Explore both Indonesia and Northern Australia"],
  season_master: ["📅", "Season Master", "Find all 3 peak fire months of a region"],
  time_traveller: ["⏳", "Time Traveller", "Watch the Time Machine play through a whole year"],
  pattern_spotter: ["🔎", "Pattern Spotter", "On the Routine or unusual? map, find a place burning far above its normal"],
  sharp_eye: ["🎯", "Sharp Eye", "Score 8 of 10 in Normal or Not?"],
};

const Player = {
  data: { xp: 0, badges: {}, best: {}, regions: {}, stars: {} },
  load() {
    try { Object.assign(this.data, JSON.parse(localStorage.getItem("burncal-player") || "{}")); } catch (e) { /* private mode */ }
  },
  save() {
    try { localStorage.setItem("burncal-player", JSON.stringify(this.data)); } catch (e) { /* ignore */ }
  },
};

function levelInfo(xp) {
  let i = 0;
  while (i + 1 < LEVELS.length && xp >= LEVELS[i + 1][0]) i++;
  const cur = LEVELS[i][0], next = LEVELS[i + 1] ? LEVELS[i + 1][0] : cur;
  return { level: i + 1, name: LEVELS[i][1], pct: next > cur ? (xp - cur) / (next - cur) * 100 : 100 };
}

function renderHUD() {
  const l = levelInfo(Player.data.xp);
  $("hud-level").textContent = `LV ${l.level}`;
  $("hud-rank").textContent = l.name;
  $("hud-xp").style.width = `${l.pct}%`;
  $("hud-xpbar").setAttribute("aria-valuenow", Math.round(l.pct));
  $("hud-badges").textContent = `🏅 ${Object.keys(BADGES).filter((b) => Player.data.badges[b]).length}/${Object.keys(BADGES).length}`;
  $("side-level").textContent = `LV ${l.level}`;
  $("side-rank").textContent = l.name;
  $("side-xp").style.width = `${l.pct}%`;
  $("side-xptext").textContent = `${fmt(Player.data.xp)} XP`;
}

function addXP(n) {
  const before = levelInfo(Player.data.xp).level;
  Player.data.xp += n;
  Player.save();
  renderHUD();
  const after = levelInfo(Player.data.xp);
  if (after.level > before) toast("LEVEL UP!", `You are now a ${after.name}.`);
}

function award(id) {
  if (Player.data.badges[id]) return;
  Player.data.badges[id] = Date.now();
  Player.save();
  renderHUD();
  const [icon, name, desc] = BADGES[id];
  toast(`${icon} BADGE UNLOCKED`, `${name}: ${desc}`);
}

function toast(title, text) {
  if (document.body.dataset.mode !== "explore") return; // no game pop-ups in the analyst view
  const box = $("toasts");
  while (box.children.length >= 2) box.firstChild.remove(); // at most two at a time
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.innerHTML = `<b>${title}</b>${text}`;
  t.addEventListener("click", () => t.remove()); // tap to dismiss
  box.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

function renderBadgeList() {
  $("badge-list").innerHTML = Object.entries(BADGES).map(([id, [icon, name, desc]]) =>
    `<div class="badge-item ${Player.data.badges[id] ? "" : "locked"}"><b>${icon} ${name}</b>${desc}</div>`).join("");
}
