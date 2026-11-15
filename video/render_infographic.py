# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Render video/infographic.html to an A4 PNG at 300 dpi (2480 x 3508 px) and a PDF.

Needs the site served at http://localhost:8765/ from docs/ (the page reads data/ and js/ from it).
  python video/render_infographic.py OUT_DIR
"""
import asyncio
import base64
import sys
from pathlib import Path

from playwright.async_api import async_playwright

HERE = Path(__file__).parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE


async def main():
    html = (HERE / "infographic.html").read_text(encoding="utf-8")
    for img in (HERE / "img").glob("*.png"):   # screenshots of the app, embedded as data URIs
        html = html.replace("{{img:%s}}" % img.stem, "data:image/png;base64," + base64.b64encode(img.read_bytes()).decode())
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1240, "height": 1754}, device_scale_factor=2)
        await page.route("**/__infographic.html", lambda r: r.fulfill(body=html, content_type="text/html"))
        await page.goto("http://localhost:8765/__infographic.html")
        await page.evaluate("() => window.ready")
        await page.wait_for_timeout(300)
        png = OUT / "burn-calendar-project-A4.png"
        await page.screenshot(path=str(png), full_page=False)
        await page.pdf(path=str(OUT / "burn-calendar-project-A4.pdf"), width="210mm", height="297mm",
                       print_background=True, page_ranges="1", scale=210 / 25.4 * 96 / 1240)
        await browser.close()
    print(png)


asyncio.run(main())
