// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Share card: a 1200x630 pixel-style image with the player's rank, badges, the current map frame and a fact.
// Drawn in the browser from real data; no AI-generated imagery.

const SITE_URL = "alfanditora.github.io/burn-calendar";

function shareCanvas() {
  const c = document.createElement("canvas");
  c.width = 1200; c.height = 630;
  const ctx = c.getContext("2d");
  const title = "'Press Start 2P', monospace", body = "'VT323', monospace";
  // leaf background with diagonal stripes, wooden frame
  ctx.fillStyle = "#8fd35a"; ctx.fillRect(0, 0, 1200, 630);
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  for (let x = -630; x < 1200; x += 32) { ctx.beginPath(); ctx.moveTo(x, 630); ctx.lineTo(x + 630, 0); ctx.lineTo(x + 646, 0); ctx.lineTo(x + 16, 630); ctx.fill(); }
  ctx.fillStyle = "#7a4a22"; ctx.fillRect(24, 24, 1152, 582);
  ctx.fillStyle = "#f7e9cb"; ctx.fillRect(32, 32, 1136, 566);

  // header
  drawSprite(ctx, SPRITES.flame[0], 56, 50, 6);
  ctx.fillStyle = "#c2410c"; ctx.font = `30px ${title}`; ctx.fillText("BURN CALENDAR", 112, 96);
  ctx.fillStyle = "#6b5634"; ctx.font = `24px ${body}`; ctx.fillText("25 years of satellite fire data in one pixel atlas", 112, 132);

  // current map frame
  const mapW = 640, mapH = Math.round(mapW * TM.canvas.height / TM.canvas.width);
  ctx.fillStyle = "#7a4a22"; ctx.fillRect(52, 168, mapW + 8, mapH + 8);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(TM.canvas, 56, 172, mapW, mapH);
  ctx.fillStyle = "#2d2a12"; ctx.font = `16px ${title}`;
  ctx.fillText(`${$("tm-month").textContent} · ${App.area.name}`.toUpperCase().slice(0, 40), 56, 172 + mapH + 40);
  ctx.font = `22px ${body}`; ctx.fillStyle = "#c2410c";
  ctx.fillText(`${$("tm-count").textContent} fire hotspots this month`, 56, 172 + mapH + 74);

  // player panel
  const l = levelInfo(Player.data.xp);
  ctx.fillStyle = "#ebd3a5"; ctx.fillRect(730, 168, 410, 300);
  ctx.fillStyle = "#c2410c"; ctx.font = `16px ${title}`; ctx.fillText(`LV ${l.level}`, 754, 210);
  ctx.fillStyle = "#2d2a12"; ctx.font = `30px ${body}`; ctx.fillText(l.name, 754, 252);
  ctx.fillStyle = "#79c046"; ctx.fillRect(754, 270, 360, 18);
  ctx.fillStyle = "#ffd43b"; ctx.fillRect(754, 270, 360 * l.pct / 100, 18);
  ctx.fillStyle = "#2d2a12"; ctx.font = `20px ${body}`; ctx.fillText(`${fmt(Player.data.xp)} XP`, 754, 318);
  const got = Object.keys(BADGES).filter((id) => Player.data.badges[id]);
  ctx.fillText(`Badges: ${got.length}/${Object.keys(BADGES).length}`, 754, 352);
  ctx.font = `34px ${body}`;
  got.slice(0, 8).forEach((id, i) => ctx.fillText(BADGES[id][0], 754 + i * 46, 404));
  const hl = Player.data.best.hl;
  ctx.font = `20px ${body}`;
  if (hl != null) ctx.fillText(`Best Higher-or-Lower streak: ${hl}`, 754, 446);

  // footer
  ctx.fillStyle = "#2d2a12"; ctx.font = `18px ${body}`;
  ctx.fillText("Can you beat my score? Play at", 730, 512);
  ctx.fillStyle = "#c2410c"; ctx.font = `11px ${title}`; ctx.fillText(SITE_URL, 730, 544);
  ctx.fillStyle = "#6b5634"; ctx.font = `16px ${body}`;
  ctx.fillText("Data: NASA FIRMS (MODIS, VIIRS), harmonized to NOAA-20 units", 56, 580);
  return c;
}

async function shareCard() {
  await document.fonts?.ready;
  const c = shareCanvas();
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const file = new File([blob], "burn-calendar-card.png", { type: "image/png" });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Burn Calendar", text: `My Burn Calendar rank. Play at https://${SITE_URL}/` });
      return;
    }
  } catch (e) { if (e.name === "AbortError") return; }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "burn-calendar-card.png";
  a.click();
  URL.revokeObjectURL(a.href);
  toast("📤 CARD SAVED", "Your share card was downloaded as an image.");
}
