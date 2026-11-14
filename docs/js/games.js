// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Game hub: four short games built only on real harmonized numbers from the area JSON.

const GAMES = [
  { id: "hl", icon: "higherLower", title: "HIGHER OR LOWER", desc: "Two real months. Which one burned more? 3 lives.", start: () => hlStart() },
  { id: "spot", icon: "calendar", title: "SPOT THE DISASTER YEAR", desc: "Six mystery years as pixel strips. Tap the worst.", start: () => spotStart() },
  { id: "quest", icon: "flag", title: "FIRE SEASON QUEST", desc: "One level per region. Find the 3 peak fire months.", start: () => questMenu() },
  { id: "normal", icon: "question", title: "NORMAL OR NOT?", desc: "10 rounds: more or fewer fires than usual?", start: () => normalStart() },
];

// Calendar colours (shared with the Data Lab): fixed ranges, so a colour means the same count in every area.
const BINS = [
  [0, "#cfe8b0", "0"], [1, "#fde68a", "1–9"], [10, "#fbbf24", "10–99"], [100, "#f97316", "100–999"],
  [1000, "#dc2626", "1k–10k"], [10000, "#991b1b", "10k–100k"], [100000, "#4a0d0d", "100k+"],
];
function binColour(count) {
  let c = BINS[0][1]; // below 1 = no fires
  for (const [lo, col] of BINS) if (lo > 0 && count >= lo) c = col;
  return c;
}
const rampColour = (count) => binColour(Math.round(count));

function renderHub() {
  const hub = $("game-hub");
  hub.innerHTML = "";
  for (const g of GAMES) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "game-card";
    const best = Player.data.best[g.id];
    b.innerHTML = `<span></span><span><h3>${g.title}</h3><p>${g.desc}</p>${best != null ? `<p class="best">Best: ${best}</p>` : ""}</span>`;
    b.firstChild.appendChild(iconCanvas(g.icon));
    b.addEventListener("click", g.start);
    hub.appendChild(b);
  }
}

function stage(html) {
  const s = $("game-stage");
  s.hidden = false;
  s.innerHTML = html;
  s.querySelector("[data-close]")?.addEventListener("click", closeStage);
  s.querySelector("[data-share]")?.addEventListener("click", shareCard);
  s.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "start" });
  return s;
}
function closeStage() { $("game-stage").hidden = true; renderHub(); }
const backBtn = `<button type="button" class="px-btn small" data-close>◀ BACK</button>`;

function finishGame(id, score, better = (a, b) => a > b) {
  const prev = Player.data.best[id];
  if (prev == null || better(score, prev)) Player.data.best[id] = score;
  Player.save();
  award("first_spark");
}

function countUp(el, value) {
  if (reducedMotion) { el.textContent = fmt(value); return; }
  let i = 0;
  const steps = 12;
  const t = setInterval(() => {
    i++;
    el.textContent = fmt(value * i / steps);
    if (i >= steps) clearInterval(t);
  }, 40);
}

const monthName = (c) => `${MONTHS[c.month - 1]} ${c.year}`;

// ---------- 1. Higher or Lower ----------
const HL = { lives: 3, streak: 0, best: 0, xp: 0 };

function hlStart() {
  Object.assign(HL, { lives: 3, streak: 0, best: 0, xp: 0 });
  hlRound();
}

function hlRound() {
  const pool = App.area.calendar.filter((c) => c.count > 0);
  let a, b;
  do { a = pick(pool); b = pick(pool); }
  while (a === b || Math.max(a.count, b.count) / Math.max(1, Math.min(a.count, b.count)) < 1.15);
  const s = stage(`
    <div class="stage-head">${backBtn}<span class="hearts">${"❤️".repeat(HL.lives)}${"🖤".repeat(3 - HL.lives)}</span>
      <span class="score">STREAK ${HL.streak}</span></div>
    <p class="kicker">Higher or Lower · ${App.area.name}</p>
    <p class="question">Which month had <b>more</b> fire hotspots?</p>
    <div class="duel">
      <button type="button" class="pick" data-i="0"><span class="kicker">${MONTHS_LONG[a.month - 1]}</span><span class="big-num">${a.year}</span><span class="n"></span></button>
      <span class="vs">VS</span>
      <button type="button" class="pick" data-i="1"><span class="kicker">${MONTHS_LONG[b.month - 1]}</span><span class="big-num">${b.year}</span><span class="n"></span></button>
    </div>
    <div class="result" id="hl-result"></div>`);
  const pair = [a, b];
  s.querySelectorAll(".pick").forEach((btn) => btn.addEventListener("click", () => {
    const i = Number(btn.dataset.i), win = pair[i].count > pair[1 - i].count;
    s.querySelectorAll(".pick").forEach((x, k) => {
      x.disabled = true;
      const n = x.querySelector(".n");
      n.innerHTML = `<span class="big-num"></span>hotspots · ${SENSOR_NAME[pair[k].source]}`;
      countUp(n.querySelector(".big-num"), pair[k].count);
      x.classList.add(pair[k].count > pair[1 - k].count ? "right" : "wrong");
    });
    if (win) {
      HL.streak++; HL.best = Math.max(HL.best, HL.streak);
      const gain = 10 + 2 * HL.streak; HL.xp += gain; addXP(gain);
      if (HL.streak >= 5) award("on_fire");
    } else { HL.lives--; HL.streak = 0; }
    s.querySelector(".hearts").textContent = "❤️".repeat(HL.lives) + "🖤".repeat(3 - HL.lives);
    s.querySelector(".score").textContent = `STREAK ${HL.streak}`;
    const ratio = Math.max(a.count, b.count) / Math.max(1, Math.min(a.count, b.count));
    $("hl-result").innerHTML = `<p class="line ${win ? "ok" : "no"}">${win ? "CORRECT!" : "NOPE!"}</p>
      <p>${monthName(pair[0].count > pair[1].count ? pair[0] : pair[1])} had ${fmt(ratio, 1)}× as many hotspots.</p>
      <button type="button" class="px-btn primary" id="hl-next">${HL.lives > 0 ? "NEXT ▶" : "SEE RESULT"}</button>`;
    $("hl-next").addEventListener("click", () => (HL.lives > 0 ? hlRound() : hlOver()));
  }));
}

function hlOver() {
  finishGame("hl", HL.best);
  stage(`<div class="stage-head">${backBtn}</div>
    <p class="kicker">Game over</p><p class="question">Best streak: <b>${HL.best}</b> · +${HL.xp} XP</p>
    <p class="muted">Data: NASA FIRMS, harmonized to NOAA-20 units.</p>
    <button type="button" class="px-btn primary" id="hl-again">PLAY AGAIN</button> <button type="button" class="px-btn" data-share>📤 SHARE</button>`);
  $("hl-again").addEventListener("click", hlStart);
}

// ---------- 2. Spot the Disaster Year ----------
const SPOT = { round: 0, right: 0, xp: 0 };

function spotStart() { Object.assign(SPOT, { round: 0, right: 0, xp: 0 }); spotRound(); }

function spotRound() {
  const years = completeYears();
  const chosen = [];
  while (chosen.length < Math.min(6, years.length)) {
    const y = pick(years);
    if (!chosen.includes(y)) chosen.push(y);
  }
  const total = (y) => App.area.calendar.filter((c) => c.year === y).reduce((s, c) => s + c.count, 0);
  const worst = chosen.reduce((w, y) => (total(y) > total(w) ? y : w), chosen[0]);
  const strip = (y) => MONTHS.map((_, m) => `<i style="background:${rampColour(calEntry(y, m + 1).count)}"></i>`).join("");
  const s = stage(`
    <div class="stage-head">${backBtn}<span class="score">ROUND ${SPOT.round + 1}/3 · ${SPOT.right} ✓</span></div>
    <p class="kicker">Spot the Disaster Year · ${App.area.name}</p>
    <p class="question">Each strip is one year, January to December. Green = no fires; darker red = more fires. Which year burned <b>most</b>?</p>
    <div class="levels">${chosen.map((y, i) => `<button type="button" class="pick" data-y="${y}">
      <span class="kicker">MYSTERY ${"ABCDEF"[i]}</span><span class="strip">${strip(y)}</span><span class="n"></span></button>`).join("")}</div>
    <div class="result" id="spot-result"></div>`);
  s.querySelectorAll(".pick").forEach((btn) => btn.addEventListener("click", () => {
    const ok = Number(btn.dataset.y) === worst;
    s.querySelectorAll(".pick").forEach((x) => {
      const y = Number(x.dataset.y);
      x.disabled = true;
      x.querySelector(".n").innerHTML = `<span class="big-num">${y}</span>${fmt(total(y))} hotspots`;
      if (y === worst) x.classList.add("right"); else if (x === btn) x.classList.add("wrong");
    });
    SPOT.round++;
    if (ok) { SPOT.right++; SPOT.xp += 20; addXP(20); }
    const last = SPOT.round >= 3;
    $("spot-result").innerHTML = `<p class="line ${ok ? "ok" : "no"}">${ok ? "WELL SPOTTED!" : "NOT QUITE!"}</p>
      <p>${worst} burned most of these years, with ${fmt(total(worst))} hotspots.</p>
      <button type="button" class="px-btn primary" id="spot-next">${last ? "SEE RESULT" : "NEXT ▶"}</button>`;
    $("spot-next").addEventListener("click", () => (last ? spotOver() : spotRound()));
  }));
}

function spotOver() {
  if (SPOT.right === 3) award("haze_hunter");
  finishGame("spot", `${SPOT.right}/3`, (a, b) => parseInt(a, 10) > parseInt(b, 10));
  stage(`<div class="stage-head">${backBtn}</div>
    <p class="kicker">Result</p><p class="question">You spotted <b>${SPOT.right} of 3</b> disaster years · +${SPOT.xp} XP</p>
    <p class="muted">Big fire years often follow drought, for example during El Niño. Explore them in the Time Machine above.</p>
    <button type="button" class="px-btn primary" id="spot-again">PLAY AGAIN</button> <button type="button" class="px-btn" data-share>📤 SHARE</button>`);
  $("spot-again").addEventListener("click", spotStart);
}

// ---------- 3. Fire Season Quest ----------
async function questMenu() {
  const levels = App.index;
  const s = stage(`<div class="stage-head">${backBtn}</div>
    <p class="kicker">Fire Season Quest</p>
    <p class="question">Every region burns at a different time of year. Pick a level.</p>
    <div class="levels">${levels.map((a, i) => {
      const st = Player.data.stars[a.area_id] || 0;
      return `<button type="button" class="pick" data-id="${a.area_id}"><span class="kicker">LEVEL ${i + 1}</span>
        <span class="big-num" style="font-size:0.52rem">${a.name}</span><span class="stars">${"★".repeat(st)}${"☆".repeat(3 - st)}</span></button>`;
    }).join("")}</div>`);
  s.querySelectorAll(".pick").forEach((b) => b.addEventListener("click", () => questLevel(b.dataset.id)));
}

async function questLevel(id) {
  const area = await getJSON(`data/areas/${id}.json`);
  const picks = new Set();
  const s = stage(`<div class="stage-head">${backBtn}<span class="score">PICK 3</span></div>
    <p class="kicker">Fire Season Quest · ${area.name}</p>
    <p class="question">Which 3 months have the most fire hotspots in a typical year?</p>
    <div class="months-grid">${MONTHS.map((m, i) => `<button type="button" data-m="${i}" aria-pressed="false">${m}</button>`).join("")}</div>
    <button type="button" class="px-btn primary" id="q-check" disabled>REVEAL</button>
    <div class="result" id="q-result"></div>`);
  s.querySelector(".months-grid").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-m]");
    if (!b || b.disabled) return;
    const m = Number(b.dataset.m);
    if (picks.has(m)) picks.delete(m); else if (picks.size < 3) picks.add(m);
    s.querySelectorAll(".months-grid button").forEach((x) => x.setAttribute("aria-pressed", picks.has(Number(x.dataset.m))));
    $("q-check").disabled = picks.size !== 3;
  });
  $("q-check").addEventListener("click", () => {
    const years = new Set(completeYears(area));
    const avg = Array(12).fill(0);
    for (const c of area.calendar) if (years.has(c.year)) avg[c.month - 1] += c.count / years.size;
    const top = avg.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, 3).map(([, i]) => i);
    const hits = top.filter((m) => picks.has(m)).length;
    const share = top.reduce((t, m) => t + avg[m], 0) / avg.reduce((t, v) => t + v, 0) * 100;
    const mx = Math.max(...avg);
    s.querySelectorAll(".months-grid button").forEach((b) => {
      b.disabled = true;
      if (top.includes(Number(b.dataset.m)) && picks.has(Number(b.dataset.m))) b.classList.add("hit");
    });
    $("q-check").hidden = true;
    const prev = Player.data.stars[id] || 0;
    Player.data.stars[id] = Math.max(prev, hits);
    addXP(15 * hits);
    if (hits === 3) award("season_master");
    finishGame("quest", Object.values(Player.data.stars).reduce((a, b) => a + b, 0) + " ★");
    const yrs = [...years];
    $("q-result").innerHTML = `<p class="line ${hits ? "ok" : "no"}">${"★".repeat(hits)}${"☆".repeat(3 - hits)} · ${hits} OF 3</p>
      <div class="bars" aria-hidden="true">${avg.map((v, i) => `<div class="${top.includes(i) ? "top" : ""}" style="height:${Math.max(2, v / mx * 100)}%"></div>`).join("")}</div>
      <div class="bar-labels" aria-hidden="true">${MONTHS.map((m) => `<span>${m[0]}</span>`).join("")}</div>
      <p>Peak months: <b>${top.slice().sort((a, b) => a - b).map((m) => MONTHS[m]).join(", ")}</b>, holding ${fmt(share)}% of a typical
        year's hotspots (average ${yrs[0]}–${yrs[yrs.length - 1]}). Data: NASA FIRMS, harmonized.</p>
      <button type="button" class="px-btn primary" id="q-menu">LEVELS ▶</button>`;
    $("q-menu").addEventListener("click", questMenu);
  });
}

// ---------- 4. Normal or Not? ----------
const NN = { round: 0, right: 0, xp: 0 };

function normalStart() { Object.assign(NN, { round: 0, right: 0, xp: 0 }); normalRound(); }

function normalRound() {
  const pool = App.area.calendar.filter((c) => c.median > 0 && c.anomaly_pct != null && Math.abs(c.anomaly_pct) >= 5);
  const c = pick(pool);
  const s = stage(`
    <div class="stage-head">${backBtn}<span class="score">ROUND ${NN.round + 1}/10 · ${NN.right} ✓</span></div>
    <p class="kicker">Normal or Not? · ${App.area.name}</p>
    <p class="question"><b>${MONTHS_LONG[c.month - 1]} ${c.year}</b>: more or fewer fire hotspots than a usual ${MONTHS_LONG[c.month - 1]}?</p>
    <div class="duel">
      <button type="button" class="pick" data-g="above"><span class="big-num">🔥 MORE</span>than usual</button>
      <span class="vs">OR</span>
      <button type="button" class="pick" data-g="below"><span class="big-num">💧 FEWER</span>than usual</button>
    </div>
    <div class="result" id="nn-result"></div>`);
  s.querySelectorAll(".pick").forEach((btn) => btn.addEventListener("click", () => {
    const truth = c.count > c.median ? "above" : "below";
    const ok = btn.dataset.g === truth;
    s.querySelectorAll(".pick").forEach((x) => { x.disabled = true; x.classList.add(x.dataset.g === truth ? "right" : "wrong"); });
    NN.round++;
    if (ok) { NN.right++; NN.xp += 10; addXP(10); }
    const label = labelFor(c.anomaly_pct);
    const last = NN.round >= 10;
    $("nn-result").innerHTML = `<p class="line ${ok ? "ok" : "no"}">${ok ? "CORRECT!" : "NOT THIS TIME!"}
      <span class="badge ${BADGE_CLASS[label]}">${label}</span></p>
      <p>${fmt(c.count)} hotspots vs a usual ${fmt(c.median)} (median of earlier years): ${pct(c.anomaly_pct)}.
        Sensor: ${SENSOR_NAME[c.source]}.</p>
      <button type="button" class="px-btn primary" id="nn-next">${last ? "SEE RESULT" : "NEXT ▶"}</button>`;
    $("nn-next").addEventListener("click", () => (last ? normalOver() : normalRound()));
  }));
}

function normalOver() {
  if (NN.right >= 8) award("sharp_eye");
  finishGame("normal", `${NN.right}/10`, (a, b) => parseInt(a, 10) > parseInt(b, 10));
  const rank = NN.right >= 9 ? "Fire Scientist" : NN.right >= 7 ? "Satellite Scout" : NN.right >= 5 ? "Hotspot Hunter" : "Rookie Ranger";
  stage(`<div class="stage-head">${backBtn}</div>
    <p class="kicker">Result</p><p class="question"><b>${NN.right} of 10</b> · rank: <b>${rank}</b> · +${NN.xp} XP</p>
    <p class="muted">"Usual" is the median of the same month in all earlier complete years.</p>
    <button type="button" class="px-btn primary" id="nn-again">PLAY AGAIN</button> <button type="button" class="px-btn" data-share>📤 SHARE</button>`);
  $("nn-again").addEventListener("click", normalStart);
}
