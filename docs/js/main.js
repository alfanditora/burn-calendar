// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Start-up: player HUD, region buttons, tabs, and wiring every view to the selected area.

function showTab(name) {
  for (const t of ["play", "story", "lab"]) {
    $(`tab-${t}`).setAttribute("aria-selected", t === name);
    $(`view-${t}`).hidden = t !== name;
  }
  if (name === "story" && App.area) drawRelayChart();
}

function renderRegions() {
  $("regions").innerHTML = App.index.map((a) =>
    `<button type="button" data-id="${a.area_id}" aria-pressed="${a.area_id === App.areaId}">${a.name}</button>`).join("");
}

async function main() {
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
    if (b) loadArea(b.dataset.id);
  });
  for (const t of ["play", "story", "lab"]) $(`tab-${t}`).addEventListener("click", () => showTab(t));
  $("hud-badges").addEventListener("click", () => { renderBadgeList(); $("badge-dialog").showModal(); });
  $("hud-share").addEventListener("click", shareCard);
  window.addEventListener("scroll", () => { $("tip").hidden = true; }, { passive: true });

  tmInit();
  storyInit();
  labInit();
  onAreaChange(renderRegions);
  onAreaChange(tmOnArea);
  onAreaChange(storyOnArea);
  onAreaChange(labOnArea);
  onAreaChange(() => { if (!$("game-stage").hidden) closeStage(); });
  renderHub();
  // Deep links: ?area=riau&month=2015-09&tab=story
  const q = new URLSearchParams(location.search);
  const start = App.index.find((a) => a.area_id === q.get("area")) || App.index[0];
  await loadArea(start.area_id);
  if (q.get("month") && App.grid.months.includes(q.get("month"))) tmGo(App.grid.months.indexOf(q.get("month")));
  if (["play", "story", "lab"].includes(q.get("tab"))) showTab(q.get("tab"));
  // Redraw canvas text once the pixel font has loaded.
  document.fonts?.ready.then(() => { if (App.area) drawRelayChart(); });
}

main();
