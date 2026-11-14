// Generated with assistance from Claude Code (Anthropic), reviewed by the team.
// Pixel sprites drawn from text patterns (our own art; no external images).
// Each character is one pixel; "." is transparent; letters map to palette colours.

const PAL = {
  y: "#ffd43b", o: "#ff922b", r: "#f03e3e", w: "#fff3bf", W: "#ffffff",
  b: "#4dabf7", B: "#1c7ed6", g: "#ced4da", G: "#fcc419", h: "#868e96", d: "#ff6b6b", k: "#1a1033",
};

const SPRITES = {
  flame: [
    ["...y...", "..yy...", "..yoy..", ".yooy..", ".yoory.", "yoorroy", "yorrroy", ".orrro.", "..ooo.."],
    ["...y...", "...yy..", "..yoy..", "..yooy.", ".yrooy.", "yorrooy", "yorrroy", ".orrro.", "..ooo.."],
    ["..y....", "..yy...", ".yoy...", ".yooy..", ".yooryy", "yoorroy", "yorrroy", ".orrro.", "..ooo.."],
  ],
  satellite: ["bbb...d...bbb", "bbb..ggg..bbb", "bbbhggggghbbb", "bbb..ggg..bbb", "bbb...W...bbb"],
  higherLower: ["...yy...", "..yyyy..", ".yyyyyy.", "...yy...", "...rr...", ".rrrrrr.", "..rrrr..", "...rr..."],
  calendar: [".r....r.", "wrwwwwrw", "rrrrrrrr", "wwwwwwww", "wkwkwowk", "wwwwwwww", "wkwowkwk", "wwwwwwww"],
  flag: [".r......", ".rrr....", ".rrrrr..", ".rrr....", ".r......", ".w......", ".w......", "www....."],
  question: ["..yyyy..", ".yy..yy.", ".....yy.", "....yy..", "...yy...", "...yy...", "........", "...yy..."],
};

function drawSprite(ctx, rows, x, y, s, palette = PAL) {
  for (let r = 0; r < rows.length; r++) {
    for (let c = 0; c < rows[r].length; c++) {
      const col = palette[rows[r][c]];
      if (!col) continue;
      ctx.fillStyle = col;
      ctx.fillRect(Math.round(x + c * s), Math.round(y + r * s), Math.ceil(s), Math.ceil(s));
    }
  }
}

// Draw an icon into a small canvas element (used by game cards).
function iconCanvas(name, size = 8) {
  const c = document.createElement("canvas");
  c.width = size; c.height = size;
  drawSprite(c.getContext("2d"), SPRITES[name], 0, 0, 1);
  return c;
}

// Animated flame in the header.
function animateLogo() {
  const c = $("logo-flame"), ctx = c.getContext("2d");
  let f = 0;
  const draw = () => {
    ctx.clearRect(0, 0, c.width, c.height);
    drawSprite(ctx, SPRITES.flame[f % 3], 1, 2, 1);
    f++;
  };
  draw();
  if (!reducedMotion) setInterval(draw, 180);
}
