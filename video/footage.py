# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Record real footage of the Burn Calendar app (served locally) for the pitch video.

Uses the installed Chrome through Playwright and the DevTools screencast, so every frame is the real
app with real data. Headless Chrome draws no mouse pointer, so a pixel-art cursor is injected that
follows the real mouse events. Output: clips/<name>/frame_NNNNN.jpg + frames.txt (ffconcat with
per-frame durations, so pauses keep their real length).
"""
import asyncio
import base64
import sys
from pathlib import Path

from playwright.async_api import async_playwright

BASE = "http://localhost:8765/"
OUT = Path(__file__).parent / "clips"
VIEW = {"width": 1440, "height": 810}   # x 4/3 = 1920 x 1080 frames, larger text than a 1920 viewport
SCALE = 4 / 3

CURSOR_JS = r"""
(() => {
  const c = document.createElement('div');
  c.id = 'px-cursor';
  c.innerHTML = '<svg width="30" height="42" viewBox="0 0 10 14" shape-rendering="crispEdges"><polygon points="0,0 0,12 3,9 5,13 7,12 5,8 9,8" fill="#ffffff" stroke="#14213d" stroke-width="1" stroke-linejoin="miter"/></svg>';
  Object.assign(c.style, {position: 'fixed', left: '-50px', top: '-50px', zIndex: 99999, pointerEvents: 'none'});
  const attach = () => document.body.appendChild(c);
  if (document.body) attach(); else document.addEventListener('DOMContentLoaded', attach);
  document.addEventListener('pointermove', (e) => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  document.addEventListener('pointerdown', (e) => {
    const r = document.createElement('div');
    Object.assign(r.style, {position: 'fixed', left: (e.clientX - 18) + 'px', top: (e.clientY - 18) + 'px', width: '36px', height: '36px',
      border: '4px solid #ffb347', zIndex: 99998, pointerEvents: 'none', transition: 'all 380ms ease-out', opacity: '1'});
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      Object.assign(r.style, {transform: 'scale(2)', opacity: '0'});
    }));
    setTimeout(() => r.remove(), 450);
  }, true);
})();
"""


class Recorder:
    def __init__(self, page, name):
        self.page, self.dir = page, OUT / name
        self.frames = []
        self.marks = []

    async def start(self):
        self.dir.mkdir(parents=True, exist_ok=True)
        for f in self.dir.glob("*"):
            f.unlink()
        self.cdp = await self.page.context.new_cdp_session(self.page)
        self.cdp.on("Page.screencastFrame", lambda ev: asyncio.ensure_future(self._frame(ev)))
        await self.cdp.send("Page.startScreencast", {"format": "jpeg", "quality": 92,
                                                     "maxWidth": 1920, "maxHeight": 1080, "everyNthFrame": 1})

    async def _frame(self, ev):
        n = len(self.frames)
        path = self.dir / f"frame_{n:05d}.jpg"
        path.write_bytes(base64.b64decode(ev["data"]))
        self.frames.append((path.name, ev["metadata"]["timestamp"]))
        await self.cdp.send("Page.screencastFrameAck", {"sessionId": ev["sessionId"]})

    def mark(self, name):
        import time
        self.marks.append((name, time.time()))

    async def stop(self, tail=0.4):
        await asyncio.sleep(tail)
        await self.cdp.send("Page.stopScreencast")
        await asyncio.sleep(0.3)
        lines = ["ffconcat version 1.0"]
        for i, (name, ts) in enumerate(self.frames):
            nxt = self.frames[i + 1][1] if i + 1 < len(self.frames) else ts + 0.1
            lines += [f"file {name}", f"duration {max(0.001, nxt - ts):.4f}"]
        lines.append(f"file {self.frames[-1][0]}")
        (self.dir / "frames.txt").write_text("\n".join(lines) + "\n")
        span = self.frames[-1][1] - self.frames[0][1]
        print(f"{self.dir.name}: {len(self.frames)} frames, {span:.1f} s")
        for name, t in self.marks:
            print(f"   {name}: {t - self.frames[0][1]:.2f} s")


MOUSE = {"x": 720.0, "y": 600.0}


async def move(page, x, y, steps=24):
    """Glide the mouse in real time (Playwright's own steps are instant, so the cursor would jump).
    `steps` sets the length: about steps/40 seconds, eased in and out."""
    x0, y0, n = MOUSE["x"], MOUSE["y"], max(2, int(steps * 1.5))
    for i in range(1, n + 1):
        t = i / n
        e = t * t * (3 - 2 * t)
        await page.mouse.move(x0 + (x - x0) * e, y0 + (y - y0) * e)
        await asyncio.sleep(1 / 60)
    MOUSE["x"], MOUSE["y"] = x, y


async def click_el(page, selector, steps=24, pause=0.25):
    # Smoothly bring the target on screen first (a click outside the viewport does nothing).
    inview = await page.evaluate(f"""() => {{ const r = document.querySelector({selector!r}).getBoundingClientRect();
      return r.top >= 60 && r.bottom <= innerHeight - 20; }}""")
    if not inview:
        await page.evaluate(f"() => document.querySelector({selector!r}).scrollIntoView({{behavior: 'smooth', block: 'center'}})")
        await asyncio.sleep(1.0)
    box = await page.locator(selector).first.bounding_box()
    await move(page, box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps)
    await asyncio.sleep(pause)
    await page.mouse.down(); await asyncio.sleep(0.06); await page.mouse.up()


async def open_page(ctx, url):
    page = await ctx.new_page()
    await page.add_init_script(CURSOR_JS)
    await page.goto(BASE + url)
    await page.wait_for_function("() => typeof App !== 'undefined' && App.grid && document.fonts.status === 'loaded'")
    await asyncio.sleep(1.2)
    return page


async def clip_timemachine(ctx):
    """Indonesia 2015: the time machine plays into the haze crisis."""
    page = await open_page(ctx, "?mode=explore&area=indonesia&month=2015-01")
    await page.evaluate("() => { document.getElementById('fnav').hidden = true; window.scrollTo(0, document.getElementById('map-panel').offsetTop - 70); }")
    await page.mouse.move(1100, 700); MOUSE.update(x=1100, y=700)
    await asyncio.sleep(0.5)
    rec = Recorder(page, "timemachine"); await rec.start()
    await asyncio.sleep(0.4)
    await click_el(page, "#tm-play", steps=20)
    await asyncio.sleep(7.5)
    await rec.stop()
    await page.close()


async def clip_calendar(ctx):
    """Analyst View: scroll from the anomaly and trend cards down through the 2001-2026 calendar."""
    page = await open_page(ctx, "?mode=analyst&area=indonesia")
    await page.evaluate("() => { document.getElementById('fnav').hidden = true; window.scrollTo(0, document.getElementById('anomaly').getBoundingClientRect().top + scrollY - 90); }")
    await page.mouse.move(1300, 760); MOUSE.update(x=1300, y=760)
    await asyncio.sleep(0.6)
    rec = Recorder(page, "calendar"); await rec.start()
    await asyncio.sleep(0.8)
    target = await page.evaluate("() => document.getElementById('calendar').getBoundingClientRect().bottom + scrollY - innerHeight + 30")
    start = await page.evaluate("() => scrollY")
    steps = 90
    for i in range(1, steps + 1):  # eased scroll, about 3.6 s
        t = i / steps
        e = t * t * (3 - 2 * t)
        await page.evaluate(f"() => window.scrollTo(0, {start + (target - start) * e})")
        await asyncio.sleep(0.04)
    await asyncio.sleep(2.0)
    await rec.stop()
    await page.close()


async def clip_modes(ctx):
    """Home -> Explore, Routine or unusual?, draw your own area over Kalimantan, the area's panel."""
    page = await open_page(ctx, "?v=video")
    await page.mouse.move(720, 700); MOUSE.update(x=720, y=700)
    await asyncio.sleep(0.4)
    rec = Recorder(page, "modes"); await rec.start()
    await asyncio.sleep(1.0)
    await click_el(page, ".mode-card[data-mode=explore] button", steps=30, pause=0.5)
    await asyncio.sleep(0.6)
    await page.evaluate("() => { window.scrollTo({top: document.getElementById('map-panel').offsetTop - 70, behavior: 'smooth'}); }")
    await asyncio.sleep(2.6)
    await click_el(page, "#layer-unusual", steps=30, pause=0.4)
    rec.mark("unusual")
    await asyncio.sleep(4.6)
    await click_el(page, "#layer-fires", steps=16, pause=0.2)
    await asyncio.sleep(0.5)
    await click_el(page, "#draw-btn", steps=20, pause=0.3)
    await asyncio.sleep(0.5)
    # Drag a box over southern and central Kalimantan (grid cells -> page coordinates).
    box = await page.evaluate("""() => {
      const g = App.grid, r = TM.canvas.getBoundingClientRect();
      const px = (lon, lat) => [r.left + ((lon - g.bbox[0]) / g.deg - TM.view.x0) / TM.view.w * r.width,
                                r.top + ((g.bbox[3] - lat) / g.deg - TM.view.y0) / TM.view.h * r.height];
      return [...px(110.6, 0.4), ...px(116.0, -3.6)];
    }""")
    await move(page, box[0], box[1], steps=20)
    await asyncio.sleep(0.2)
    await page.mouse.down()
    rec.mark("drag_start")
    await move(page, box[2], box[3], steps=60)
    await asyncio.sleep(0.15)
    await page.mouse.up()
    rec.mark("drag_end")
    await asyncio.sleep(2.2)
    rec.mark("scroll_panel")
    await page.evaluate("() => window.scrollTo({top: document.getElementById('province-panel').offsetTop - 80, behavior: 'smooth'})")
    await asyncio.sleep(3.2)
    await rec.stop()
    await page.close()


async def main(which):
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        ctx = await browser.new_context(viewport=VIEW, device_scale_factor=SCALE)
        clips = {"timemachine": clip_timemachine, "calendar": clip_calendar, "modes": clip_modes}
        for name in which or clips:
            await clips[name](ctx)
        await browser.close()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:]))
