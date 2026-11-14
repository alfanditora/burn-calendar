# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Render the animated scenes in cards.html to JPEG frames (30 fps), frame-exact via render(scene, t).

  python render_cards.py preview            stills at a few times per scene -> preview/
  python render_cards.py frames NAME:SECS ...  frames -> cards/NAME/frame_00000.jpg
"""
import asyncio
import sys
from pathlib import Path

from playwright.async_api import async_playwright

HERE = Path(__file__).parent
URL = "http://localhost:8765/__cards.html"   # served at the app's origin so /data and /js load
FPS = 30
PREVIEW30 = {"intro": [2.5], "problem30": [1.2, 4.8], "title30": [2.8], "chain30": [2.6], "future": [2.6, 7.0]}
PREVIEW = {"title": [1.0, 5.0], "problem": [5.0, 10.0, 20.0], "chain": [4.0, 10.5, 14.0],
           "method": [3.0, 11.0, 17.0], "findings": [5.0, 9.0, 17.0], "close": [6.0, 15.0]}


async def page_ready(p):
    browser = await p.chromium.launch(channel="chrome", headless=True)
    page = await browser.new_page(viewport={"width": 1920, "height": 1080})
    html = (HERE / "cards.html").read_text(encoding="utf-8")
    await page.route("**/__cards.html", lambda route: route.fulfill(body=html, content_type="text/html"))
    await page.goto(URL)
    await page.evaluate("() => window.ready")
    return browser, page


async def main(args):
    async with async_playwright() as p:
        browser, page = await page_ready(p)
        if args[0] in ("preview", "preview30"):
            out = HERE / "preview"; out.mkdir(exist_ok=True)
            for scene, times in (PREVIEW30 if args[0] == 'preview30' else PREVIEW).items():
                for t in times:
                    await page.evaluate(f"() => render('{scene}', {t})")
                    await page.screenshot(path=str(out / f"{scene}_{t:04.1f}.jpg"), type="jpeg", quality=85)
        else:
            for spec in args[1:]:
                scene, secs = spec.split(":")
                out = HERE / "cards" / scene; out.mkdir(parents=True, exist_ok=True)
                for f in out.glob("*.jpg"):
                    f.unlink()
                n = round(float(secs) * FPS)
                for i in range(n):
                    await page.evaluate(f"() => render('{scene}', {i / FPS})")
                    await page.screenshot(path=str(out / f"frame_{i:05d}.jpg"), type="jpeg", quality=92)
                print(scene, n, "frames")
        await browser.close()


asyncio.run(main(sys.argv[1:]))
