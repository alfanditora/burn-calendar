// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Start-up: home screen and modes, player HUD, region buttons, tabs, and wiring every view to the selected area.

// ---------- modes: home (choose), explore (public, gamified), analyst (numbers and data) ----------
const MODES = ["explore", "analyst"];
const mode = () => document.body.dataset.mode;
let exploreTab = "play";

function showTab(name) {
  if (mode() === "analyst") name = "lab";
  else if (name === "lab") name = exploreTab;
  if (name !== "lab") exploreTab = name;
  for (const t of ["play", "story", "lab"]) {
    $(`view-${t}`).hidden = t !== name;
    $(`tab-${t}`)?.setAttribute("aria-selected", t === name);
  }
  document.querySelectorAll(".side-nav button").forEach((b) => b.setAttribute("aria-current", b.dataset.go === name));
  if (name === "story" && App.area) drawRelayChart();
}

// Show a mode; push it to the address bar so Back returns to the home screen.
function setMode(m, push = true) {
  document.body.dataset.mode = m;
  $("home").hidden = m !== "home";
  $("shell").hidden = m === "home";
  closeMenu();
  if (m === "home") {
    if (push) $("home").querySelector(".mode-card button").focus({ preventScroll: true });
  } else {
    $("mode-btn").innerHTML = m === "analyst" ? "<span class=\"hide-xs\">📊</span><span class=\"hide-sm\"> ANALYST</span> ⇄"
      : "<span class=\"hide-xs\">🎮</span><span class=\"hide-sm\"> EXPLORE</span> ⇄";
    $("mode-btn").title = "Switch mode";
    showTab(m === "analyst" ? "lab" : exploreTab);
    seasonOnMonth(); // the season panel shows more detail in the analyst view
  }
  window.scrollTo(0, 0);
  if (push) {
    const q = new URLSearchParams(location.search);
    if (m === "home") { for (const k of ["mode", "tab", "month"]) q.delete(k); } else q.set("mode", m);
    const s = q.toString();
    history.pushState({ mode: m }, "", s ? `?${s}` : location.pathname);
  }
}

// Mode from a link: ?mode=..., or implied by an older deep link (?tab=lab is the analyst view).
function modeFromURL(q) {
  if (MODES.includes(q.get("mode"))) return q.get("mode");
  if (q.get("tab") === "lab") return "analyst";
  if (q.has("area") || q.has("month") || q.has("tab")) return "explore";
  return "home";
}

function renderHomeStats() {
  const cal = App.area.calendar, first = cal[0], last = App.area.latest;
  $("home-stats").innerHTML = [
    `🗓️ ${MONTHS[first.month - 1]} ${first.year} – ${MONTHS[last.month - 1]} ${last.year}`,
    "🛰️ 3 satellite sensors", `📍 ${App.index.length} areas`,
  ].map((s) => `<span>${s}</span>`).join("");
}

// Home: the latest complete month in every area, each a shortcut into Explore.
async function renderHomeNow() {
  const areas = await Promise.all(App.index.map((a) => getJSON(`data/areas/${a.area_id}.json`)));
  $("home-now").innerHTML = `<p class="kicker">Right now · latest complete month</p><div class="now-list">` +
    areas.map((a) => {
      const l = a.latest, s = a.season;
      return `<button type="button" class="now-chip" data-area="${a.area_id}"><b>${a.name.replace(", Indonesia", "")}</b>
        <span class="badge ${BADGE_CLASS[l.label] || "none"}">${l.label}</span>
        <span>${MONTHS[l.month - 1]} ${l.year} · ${pct(l.anomaly_pct)} vs usual${s ? ` · season ${s.season_label}` : ""}</span></button>`;
    }).join("") + "</div>";
}

// Sidebar: a fixed column on desktop, a slide-out drawer on phones and tablets.
const isDrawer = () => window.matchMedia("(max-width: 1023px)").matches;
function openMenu() {
  $("sidebar").classList.add("open"); $("scrim").hidden = false;
  $("menu-btn").setAttribute("aria-expanded", "true");
  $("sidebar").querySelector("button[aria-pressed='true'], button")?.focus();
}
function closeMenu() {
  $("sidebar").classList.remove("open"); $("scrim").hidden = true;
  $("menu-btn").setAttribute("aria-expanded", "false");
}
function go(target) {
  if (isDrawer()) closeMenu();
  const smooth = { behavior: reducedMotion ? "auto" : "smooth" };
  if (target === "home") { setMode("home"); return; }
  if (target === "map") { $("map-panel").scrollIntoView(smooth); return; }
  if (target === "data") { $("data-access").scrollIntoView(smooth); return; }
  if (target === "season") { $("season-panel").scrollIntoView(smooth); return; }
  showTab(target);
  (mode() === "analyst" ? $("view-lab") : document.querySelector(".tabs")).scrollIntoView(smooth);
}

async function main() {
  const q = new URLSearchParams(location.search);
  // Show the right screen at once, before the data arrives.
  setMode(modeFromURL(q), false);
  history.replaceState({ mode: mode() }, "", location.href);
  document.querySelectorAll(".mode-card canvas").forEach((c) => c.replaceWith(Object.assign(iconCanvas(c.dataset.icon), { ariaHidden: "true" })));
  document.querySelectorAll(".mode-card").forEach((card) => card.addEventListener("click", () => setMode(card.dataset.mode)));
  window.addEventListener("popstate", () => setMode(modeFromURL(new URLSearchParams(location.search)), false));
  document.querySelector(".brand").addEventListener("click", (e) => { e.preventDefault(); setMode("home"); });
  $("mode-btn").addEventListener("click", () => setMode("home"));

  Player.load();
  renderHUD();
  animateLogo();
  try {
    App.index = await getJSON("data/areas/index.json");
  } catch (err) {
    document.querySelector("main").innerHTML = `<p class="panel">No data found. Run <code>python pipeline/run_all.py</code>. (${err.message})</p>`;
    return;
  }
  // Put Indonesia first and the second region last.
  App.index.sort((a, b) => (a.area_id === "indonesia" ? -1 : b.area_id === "indonesia" ? 1 : 0));

  $("regions").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-id]");
    if (!b) return;
    Prov.sel = null; // a featured area replaces the province view
    loadArea(b.dataset.id);
    if (isDrawer()) { closeMenu(); $("map-panel").scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth" }); }
  });
  $("menu-btn").addEventListener("click", openMenu);
  $("area-chip").addEventListener("click", openMenu);
  $("menu-close").addEventListener("click", closeMenu);
  $("scrim").addEventListener("click", closeMenu);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });
  document.querySelector(".side-nav").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-go]");
    if (b) go(b.dataset.go);
  });
  for (const t of ["play", "story"]) $(`tab-${t}`).addEventListener("click", () => showTab(t));
  $("hud-badges").addEventListener("click", () => { renderBadgeList(); $("badge-dialog").showModal(); });
  $("hud-share").addEventListener("click", shareCard);
  window.addEventListener("scroll", () => { $("tip").hidden = true; }, { passive: true });

  $("home-now").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-area]");
    if (!b) return;
    await loadArea(b.dataset.area);
    setMode("explore");
  });
  tmInit();
  provinceInit();
  await provinceLoad();
  seasonInit();
  storyInit();
  labInit();
  onAreaChange(renderRegionGroups);
  onAreaChange(tmOnArea);
  onAreaChange(storyOnArea);
  onAreaChange(labOnArea);
  onAreaChange(() => { if (!$("game-stage").hidden) closeStage(); });
  renderHub();
  // Deep links: ?mode=analyst&area=riau&month=2015-09 (older ?tab=play|story|lab links still work)
  const start = App.index.find((a) => a.area_id === q.get("area")) || App.index[0];
  await loadArea(start.area_id);
  renderHomeStats();
  renderHomeNow();
  if (q.get("month") && App.grid.months.includes(q.get("month"))) tmGo(App.grid.months.indexOf(q.get("month")));
  if (["play", "story"].includes(q.get("tab"))) exploreTab = q.get("tab");
  if (mode() !== "home") showTab(exploreTab);
  // Redraw canvas text once the pixel font has loaded.
  document.fonts?.ready.then(() => { if (App.area) { drawRelayChart(); seasonOnMonth(); } });
}

main();
