# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Assemble the 30-second Space Apps video (the rules allow 30 s or less).
python assemble30.py FFMPEG_BIN_DIR -> burn-calendar-30s.mp4
0:00 who · 0:03 challenge · 0:08 title · 0:11 how it works (NASA data, real app) · 0:22 future."""
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).parent
FF = Path(sys.argv[1])
FFMPEG = str(FF / "ffmpeg.exe")
FPS, NAVY, VOICE_AT = 30, "0x0d1736", 0.2
TAG = "fontfile=fonts/PressStart2P-Regular.ttf:fontsize=22:fontcolor=white:box=1:boxcolor=0xc2410c:boxborderw=14"
# (kind, name, seconds, clip offset, tag)
TIMELINE = [
    ("card", "intro", 2.9, 0, None),
    ("card", "problem30", 5.3, 0, None),
    ("card", "title30", 3.0, 0, None),
    ("card", "chain30", 2.8, 0, None),
    ("clip", "calendar", 2.8, 1.2, "REAL APP · ONE RECORD FROM NASA FIRMS (MODIS + VIIRS)"),
    ("clip", "timemachine", 1.8, 4.8, "REAL APP · REPLAY 25 YEARS"),
    ("clip", "modes", 1.5, 9.4, "REAL APP · ROUTINE OR UNUSUAL?"),
    ("clip", "modes", 2.3, 18.7, "REAL APP · DRAW ANY AREA", 1.35),
    ("card", "future", 7.5, 0, None),
]


def run(args):
    r = subprocess.run(args, cwd=HERE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if r.returncode:
        raise SystemExit(r.stderr[-2500:])


def main():
    seg_dir = HERE / "segments30"; seg_dir.mkdir(exist_ok=True)
    files = []
    for k, (kind, name, d, off, tag, *sp) in enumerate(TIMELINE):
        speed = sp[0] if sp else 1.0
        vf = []
        if kind == "card":
            src = ["-framerate", str(FPS), "-i", f"cards/{name}/frame_%05d.jpg"]
        else:
            src = ["-f", "concat", "-safe", "0", "-i", f"clips/{name}/frames.txt"]
            vf += [f"fps={FPS}", f"trim=start={off},setpts=(PTS-STARTPTS)/{speed}", "scale=1920:1080,setsar=1",
                   f"drawtext={TAG}:text='{tag}':x=w-tw-36:y=26"]
        vf += [f"tpad=stop_mode=clone:stop_duration={d}", f"trim=duration={d:.3f},setpts=PTS-STARTPTS"]
        if k == 0:
            vf.append(f"fade=t=in:st=0:d=0.3:color={NAVY}")
        if k == len(TIMELINE) - 1:
            vf.append(f"fade=t=out:st={d - 0.8:.2f}:d=0.8:color=black")
        out = seg_dir / f"{k:02d}_{name}.mp4"
        run([FFMPEG, "-y", *src, "-vf", ",".join(vf), "-r", str(FPS), "-c:v", "libx264", "-preset", "medium",
             "-crf", "16", "-pix_fmt", "yuv420p", "-an", str(out)])
        files.append(out)
    T = sum(t[2] for t in TIMELINE)
    (seg_dir / "list.txt").write_text("".join(f"file '{p.name}'\n" for p in files))
    run([FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", "segments30/list.txt", "-c", "copy", "video30.mp4"])

    # Captions, one per sentence (long ones split at a word boundary).
    sents = json.loads((HERE / "voice30" / "timings.json").read_text(encoding="utf-8"))["sentences"]
    ts = lambda s: f"0:{int(s // 60):02d}:{s % 60:05.2f}"
    ev = []
    for a, b, text in sents:
        parts = [text]
        if len(text) > 58:
            words, acc = text.split(), 0
            for i, w in enumerate(words):
                acc += len(w) + 1
                if acc >= len(text) / 2:
                    parts = [" ".join(words[:i + 1]), " ".join(words[i + 1:])]
                    break
        pos = a
        for p in parts:
            d = (b - a) * len(p) / sum(len(q) for q in parts)
            ev.append((VOICE_AT + pos, VOICE_AT + pos + d, p))
            pos += d
    ass = ["[Script Info]", "ScriptType: v4.00+", "PlayResX: 1920", "PlayResY: 1080", "", "[V4+ Styles]",
           "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
           "Style: Cap,VT323,64,&H00FFFFFF,&H00FFFFFF,&H1036170D,&H00000000,0,0,0,0,100,100,1,0,3,14,0,2,120,120,40,1",
           "", "[Events]", "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text"]
    # each caption ends when the next starts, so two never show at once
    ends = [min(b + 0.12, ev[i + 1][0] if i + 1 < len(ev) else T) for i, (a, b, _) in enumerate(ev)]
    ass += [f"Dialogue: 0,{ts(a)},{ts(e)},Cap,,0,0,0,,{t}" for (a, b, t), e in zip(ev, ends)]
    (HERE / "captions30.ass").write_text("\n".join(ass) + "\n", encoding="utf-8")

    ms = int(VOICE_AT * 1000)
    filt = (f"[1:a]aresample=44100,aformat=channel_layouts=stereo,adelay={ms}|{ms}[v];"
            f"[2:a]volume='if(gt(t,{T - 2.9:.2f}),0.55,0.2)':eval=frame,atrim=0:{T:.2f}[mu];"
            f"[v][mu]amix=inputs=2:normalize=0:duration=longest,atrim=0:{T:.2f},afade=t=out:st={T - 0.8:.2f}:d=0.8,alimiter=limit=0.95[a]")
    vf = ("subtitles=captions30.ass:fontsdir=fonts,"
          "drawtext=fontfile=fonts/PressStart2P-Regular.ttf:fontsize=18:fontcolor=0xffd43b:text='AI NARRATION':"
          "x=w-tw-40:y=40:enable='between(t,0.3,2.9)'")
    run([FFMPEG, "-y", "-i", "video30.mp4", "-i", "voice30/narration.mp3", "-i", "music30.wav",
         "-filter_complex", filt, "-map", "0:v", "-map", "[a]", "-vf", vf, "-c:v", "libx264", "-preset", "slow",
         "-crf", "17", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart",
         "-t", f"{T:.2f}", "burn-calendar-30s.mp4"])
    print(f"burn-calendar-30s.mp4: {T:.1f} s")


main()
