# Generated with assistance from Claude Code (Anthropic), reviewed by the team.
"""Original 8-bit background music for the pitch video, synthesized from scratch (no samples, no
licensed material): pulse-wave arpeggio, triangle bass, noise hi-hats, a soft kick, and a short lead
motif for the intro and the ending.  python music.py SECONDS -> music.wav (44.1 kHz stereo)
"""
import sys
import wave
from pathlib import Path

import numpy as np

SR = 44100
T = float(sys.argv[1]) if len(sys.argv) > 1 else 126.0
BPM = 112
BEAT = 60 / BPM
N = int(T * SR)
t_all = np.arange(N) / SR

# A minor -> F -> C -> G, one bar each: hopeful but serious.
CHORDS = [(57, 60, 64), (53, 57, 60), (48, 52, 55), (55, 59, 62)]   # MIDI note numbers
LEAD = [76, 74, 72, 74, 76, 79, 76, 72]                             # intro / outro motif (8ths)

hz = lambda m: 440.0 * 2 ** ((m - 69) / 12)


def pulse(f, n, duty=0.25):
    ph = (np.arange(n) * f / SR) % 1.0
    return np.where(ph < duty, 1.0, -1.0)


def tri(f, n):
    ph = (np.arange(n) * f / SR) % 1.0
    return 4 * np.abs(ph - 0.5) - 1


def env(n, a=0.004, d=0.12, s=0.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / a) * (s + (1 - s) * np.exp(-t / d))
    return e


L = np.zeros(N); Rr = np.zeros(N)


def add(sig, start, gain, pan=0.0):
    i = int(start * SR)
    if i >= N:
        return
    sig = sig[: N - i]
    L[i:i + len(sig)] += sig * gain * (1 - pan)
    Rr[i:i + len(sig)] += sig * gain * (1 + pan)


intro, outro = 3.0, T - 4.2
bar = 4 * BEAT
t = 0.0
k = 0
while t < T:
    chord = CHORDS[(k // 16) % 4]   # 16 sixteenths per bar
    s16 = BEAT / 4
    # arpeggio (pulse wave, 16ths)
    note = [chord[0] + 12, chord[1] + 12, chord[2] + 12, chord[0] + 24][k % 4]
    n = int(s16 * SR * 0.9)
    add(pulse(hz(note), n, 0.25) * env(n, d=0.07), t, 0.05, pan=0.25 if k % 2 else -0.25)
    if t >= intro - 0.01:
        # bass (triangle, 8ths: root / octave)
        if k % 2 == 0:
            m = chord[0] - 12 + (12 if (k // 2) % 2 else 0)
            n = int(BEAT / 2 * SR * 0.95)
            add(tri(hz(m), n) * env(n, d=0.25, s=0.3), t, 0.16)
        # hats on off-beat 8ths
        if k % 4 == 2:
            n = int(0.05 * SR)
            add(np.random.default_rng(k).uniform(-1, 1, n) * env(n, a=0.001, d=0.012), t, 0.05)
        # kick on beats 1 and 3
        if k % 8 == 0:
            n = int(0.18 * SR)
            tt = np.arange(n) / SR
            f = 40 + 90 * np.exp(-tt / 0.03)
            add(np.sin(2 * np.pi * np.cumsum(f) / SR) * env(n, a=0.002, d=0.08), t, 0.22)
    t += s16
    k += 1

# Lead motif in the intro and over the ending.
for start in (0.2, outro):
    for j, m in enumerate(LEAD * 2):
        ts = start + j * BEAT / 2
        if ts > T - 0.6:
            break
        n = int(BEAT / 2 * SR * 0.85)
        add(pulse(hz(m), n, 0.5) * env(n, d=0.18, s=0.25), ts, 0.07)

mix = np.stack([L, Rr], axis=1)
fade = np.ones(N); fo = int(2.5 * SR); fade[-fo:] = np.linspace(1, 0, fo)
mix *= fade[:, None]
mix /= max(1e-9, np.abs(mix).max()) / 0.8
out = Path(__file__).parent / "music.wav"
with wave.open(str(out), "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32767).astype("<i2").tobytes())
print(out, f"{T:.1f} s")
