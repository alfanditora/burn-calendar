# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Render video/booklet.html: a 7-page A4 PDF plus one 300 dpi PNG per page.

Needs the site served at http://localhost:8765/ from docs/ (the pages read data/ and js/ from it).
  python video/render_booklet.py OUT_DIR
"""
import asyncio
import base64
import sys
from pathlib import Path

from playwright.async_api import async_playwright

HERE = Path(__file__).parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else HERE


async def main():
    html = (HERE / "booklet.html").read_text(encoding="utf-8")
    for img in (HERE / "img").glob("*.png"):
        html = html.replace("{{img:%s}}" % img.stem, "data:image/png;base64," + base64.b64encode(img.read_bytes()).decode())
    pages = OUT / "booklet-pages"; pages.mkdir(parents=True, exist_ok=True)
    async with async_playwright() as p:
        browser = await p.chromium.launch(channel="chrome", headless=True)
        page = await browser.new_page(viewport={"width": 1240, "height": 1754}, device_scale_factor=2)
        await page.route("**/__booklet.html", lambda r: r.fulfill(body=html, content_type="text/html"))
        await page.goto("http://localhost:8765/__booklet.html")
        await page.evaluate("() => window.ready")
        await page.wait_for_timeout(300)
        sheets = page.locator(".sheet")
        for i in range(await sheets.count()):
            await sheets.nth(i).screenshot(path=str(pages / f"page-{i + 1}.png"))
        await page.pdf(path=str(OUT / "burn-calendar-booklet-A4.pdf"), width="210mm", height="297mm",
                       print_background=True, scale=210 / 25.4 * 96 / 1240, prefer_css_page_size=False)
        await browser.close()
    print(OUT / "burn-calendar-booklet-A4.pdf", await_count := len(list(pages.glob("page-*.png"))), "pages")


asyncio.run(main())
