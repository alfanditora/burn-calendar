# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Narration for the 30-second Space Apps video (one take) + sentence timings for captions.
Follows the official structure: 0:00 who, 0:02 challenge, 0:05 title, 0:10 how it works, 0:20 future."""
import asyncio
import json
import sys
from pathlib import Path

import edge_tts

VOICE = sys.argv[1] if len(sys.argv) > 1 else "en-US-AndrewNeural"
RATE = sys.argv[2] if len(sys.argv) > 2 else "+8%"
OUT = Path(__file__).parent / "voice30"
SENTENCES = [  # (caption, spoken)
    ("Hi, I'm Alfandito from Team Kumar.", "Hi, I'm Alfandito, from Team Kumar."),
    ("Indonesia burns every year, but NASA's fire record is split across satellites.", None),
    ("Burn Calendar joins them into one fire record.", None),
    ("We harmonize 29 million NASA FIRMS hotspots from MODIS and VIIRS.", "We harmonize twenty-nine million NASA FIRMS hotspots, from MODIS and VIIRS."),
    ("Replay 25 years, spot unusual burning, or draw any area.", "Replay twenty-five years, spot unusual burning, or draw any area."),
    ("Next: early warnings for disaster agencies, and peat maps, so communities can act before the smoke.", None),
]


async def main():
    OUT.mkdir(exist_ok=True)
    spoken = " ".join(s or w for w, s in SENTENCES)
    for attempt in range(5):
        try:
            words, audio = [], bytearray()
            async for ch in edge_tts.Communicate(spoken, VOICE, rate=RATE, boundary="WordBoundary").stream():
                if ch["type"] == "audio":
                    audio += ch["data"]
                elif ch["type"] == "WordBoundary":
                    words.append((ch["offset"] / 1e7, (ch["offset"] + ch["duration"]) / 1e7))
            break
        except edge_tts.exceptions.NoAudioReceived:
            await asyncio.sleep(3 * (attempt + 1))
    (OUT / "narration.mp3").write_bytes(bytes(audio))
    out, k = [], 0
    for written, sp in SENTENCES:
        n = len((sp or written).replace("-", " ").split())
        seg = words[k:k + n] or words[-1:]
        out.append((round(seg[0][0], 3), round(seg[-1][1], 3), written))
        k += n
    (OUT / "timings.json").write_text(json.dumps({"voice": VOICE, "rate": RATE, "sentences": out}, indent=1), encoding="utf-8")
    for s in out:
        print(f"{s[0]:6.2f} {s[1]:6.2f}  {s[2]}")


asyncio.run(main())
