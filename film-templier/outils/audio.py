#!/usr/bin/env python3
"""Bande-son du film (30 s) : voix off, cri de charge, musique, bruitages.

La musique est synthétisée (cordes, cors, chœur, timbales) : elle imite un
orchestre, elle ne le remplace pas. Pour une vraie partition, fournir un fichier
avec --musique ; pour votre propre voix, --cri.

Sorties dans <travail>/audio/ : mix.wav, stems, timing.json
"""
import argparse
import json
import os
import subprocess
import wave

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
DUR = 30.0
N = int(SR * DUR)
BPM = 96
BEAT = 60.0 / BPM
BAR = 4 * BEAT  # 2,5 s : 12 mesures = 30 s
rng = np.random.default_rng(1187)

# ---------------------------------------------------------------- outils


def db(x):
    return 10 ** (x / 20.0)


def midi(m):
    return 440.0 * 2 ** ((m - 69) / 12.0)


def bar_t(b, beat=0.0):
    return (b - 1) * BAR + beat * BEAT


def noise(n):
    return rng.standard_normal(n)


def lp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, min(fc, SR * 0.45), "low", fs=SR, output="sos"), x)


def hp(x, fc, order=2):
    return signal.sosfilt(signal.butter(order, fc, "high", fs=SR, output="sos"), x)


def bp(x, lo, hi, order=2):
    return signal.sosfilt(
        signal.butter(order, [lo, min(hi, SR * 0.45)], "band", fs=SR, output="sos"), x)


def peak_norm(x):
    return x / (np.max(np.abs(x)) + 1e-12)


def to_stereo(mono, pan=0.0):
    a = (pan + 1) * np.pi / 4
    return np.stack([mono * np.cos(a), mono * np.sin(a)])


def new_bus():
    return np.zeros((2, N))


def put(bus, sig, t0, gain=1.0, pan=0.0):
    if sig.ndim == 1:
        sig = to_stereo(sig, pan)
    if isinstance(gain, tuple):
        sig = sig * np.linspace(gain[0], gain[1], sig.shape[1])
    else:
        sig = sig * gain
    i0 = int(round(t0 * SR))
    if i0 < 0:
        sig = sig[:, -i0:]
        i0 = 0
    i1 = min(N, i0 + sig.shape[1])
    if i1 <= i0:
        return
    bus[:, i0:i1] += sig[:, : i1 - i0]


def swell(n, a, r):
    e = np.ones(n)
    na, nr = min(n, int(a * SR)), min(n, int(r * SR))
    if na > 0:
        e[:na] = 0.5 - 0.5 * np.cos(np.pi * np.arange(na) / na)
    if nr > 0:
        e[n - nr:] *= 0.5 + 0.5 * np.cos(np.pi * np.arange(nr) / nr)
    return e


def make_ir(t60):
    n = int(t60 * 1.15 * SR)
    t = np.arange(n) / SR
    ir = np.stack([lp(noise(n), 7000) * np.exp(-6.9 * t / t60) for _ in range(2)])
    ir[:, : int(0.022 * SR)] = 0
    ir /= np.sqrt(np.sum(ir ** 2, axis=1, keepdims=True))
    return ir


def reverb(x, ir, wet):
    y = np.stack([signal.fftconvolve(x[c], ir[c])[: x.shape[1]] for c in range(2)])
    return x + wet * y


def hosc(f0, n, K, slope=1.0, vib=0.0, vib_rate=5.5, formants=None, bright=None, detune=0.0):
    """Oscillateur harmonique à bande limitée (somme de sinus)."""
    t = np.arange(n) / SR
    f = np.full(n, f0 * 2 ** (detune / 1200.0))
    if vib:
        f = f * (1 + vib * np.sin(2 * np.pi * vib_rate * t + rng.uniform(0, 6.28)))
    ph = 2 * np.pi * np.cumsum(f) / SR + rng.uniform(0, 6.28)
    out = np.zeros(n)
    kmax = int(min(K, SR * 0.45 / f0))
    for k in range(1, kmax + 1):
        a = k ** (-slope) if bright is None else np.power(float(k), -(slope + 1.5 * (1 - bright)))
        if formants is not None:
            fk = k * f0
            a = a * (0.03 + sum(amp / (1 + ((fk - fc) / bw) ** 2) for fc, bw, amp in formants))
        out += a * np.sin(k * ph)
    return out


# ---------------------------------------------------------------- instruments


def string_note(m, dur, a=0.7, r=0.9, cutoff=3000, vib=0.004, slope=1.1):
    if m < 38:
        m += 12  # pas de sub-grave : inaudible sur la plupart des haut-parleurs
    f, n = midi(m), int((dur + r) * SR)
    s = hosc(f, n, 50, slope, vib, 5.3, detune=-6) + hosc(f, n, 50, slope, vib, 5.6, detune=6)
    return peak_norm(lp(s, cutoff)) * swell(n, a, r)


def spiccato(m, dur=0.09, cutoff=4500):
    f, n = midi(m), int((dur + 0.05) * SR)
    s = lp(hosc(f, n, 30, 1.0), cutoff)
    t = np.arange(n) / SR
    return peak_norm(s) * np.minimum(1, t / 0.006) * np.exp(-t / (dur * 0.7))


def cello_pulse(m, dur=0.26):
    f, n = midi(m), int((dur + 0.08) * SR)
    s = lp(hosc(f, n, 30, 1.1, 0.003), 1800)
    t = np.arange(n) / SR
    return peak_norm(s) * np.minimum(1, t / 0.012) * np.exp(-t / (dur * 0.8))


def horn_note(m, dur, a=0.10, r=0.25, peak=1.0):
    f, n = midi(m), int((dur + r) * SR)
    t = np.arange(n) / SR
    bright = np.clip(0.25 + (peak - 0.25) * np.minimum(1, t / (a + 0.15)), 0, 1)
    s = (hosc(f, n, 40, 1.0, 0.003, 5.0, bright=bright) +
         hosc(f, n, 40, 1.0, 0.003, 5.2, bright=bright, detune=5))
    return peak_norm(lp(s, 4500)) * swell(n, a, r)


VOW_M = [(730, 90, 1.0), (1090, 110, 0.6), (2440, 180, 0.25)]
VOW_F = [(850, 100, 1.0), (1220, 120, 0.55), (2810, 200, 0.22)]


def choir_note(m, dur, a=1.0, r=1.2, female=False):
    f, n = midi(m), int((dur + r) * SR)
    s = sum(hosc(f, n, 45, 0.8, 0.006, 5.4 + rng.uniform(-0.3, 0.3),
                 formants=VOW_F if female else VOW_M, detune=d) for d in (-9, 0, 9))
    s = peak_norm(s) + 0.06 * peak_norm(bp(noise(n), 1200, 5000))
    return peak_norm(s) * swell(n, a, r)


def timpani(f, dur=1.3):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(f * (1 + 0.35 * np.exp(-t / 0.04))) / SR
    body = (np.sin(ph) * np.exp(-t / 0.45) + 0.5 * np.sin(1.5 * ph) * np.exp(-t / 0.25) +
            0.25 * np.sin(2 * ph) * np.exp(-t / 0.18))
    click = lp(hp(noise(n), 600), 3500) * np.exp(-t / 0.012) * 0.8
    return peak_norm(body + click)


def taiko(f=55.0, dur=1.8):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(f * (1 + 0.6 * np.exp(-t / 0.05))) / SR
    body = np.sin(ph) * np.exp(-t / 0.55)
    skin = lp(noise(n), 500) * np.exp(-t / 0.12) * 0.6
    return peak_norm(body + skin)


def boom(dur=2.4):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(50 * (1 + 0.9 * np.exp(-t / 0.08))) / SR
    return peak_norm(np.sin(ph) * np.exp(-t / 0.9) + 0.3 * lp(noise(n), 120) * np.exp(-t / 0.5))


def snare(vel=1.0):
    n = int(0.25 * SR)
    t = np.arange(n) / SR
    s = bp(noise(n), 1500, 7000) * np.exp(-t / 0.07) + 0.5 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05)
    return peak_norm(s) * vel


def crash(dur=4.5):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = hp(noise(n), 3000) * np.exp(-t / 1.5)
    s += 0.5 * lp(hp(noise(n), 700), 2500) * np.exp(-t / 0.5)
    return peak_norm(s)


# ---------------------------------------------------------------- bruitages


def metal_hit(f0, dur=0.6, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ratios, amps, dec = [1, 2.76, 5.40, 8.93, 13.3], [1, .7, .5, .35, .2], [.35, .2, .12, .08, .05]
    s = sum(a * np.sin(2 * np.pi * f0 * r * t + rng.uniform(0, 6.28)) * np.exp(-t / (d * dur / 0.6))
            for r, a, d in zip(ratios, amps, dec))
    click = hp(noise(n), 2000) * np.exp(-t / 0.004)
    return vel * peak_norm(0.5 * peak_norm(s) + 0.8 * click)


def thud(f=60, dur=0.5, vel=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(f * (1 + 0.8 * np.exp(-t / 0.03))) / SR
    return vel * peak_norm(np.sin(ph) * np.exp(-t / 0.12) + 0.4 * lp(noise(n), 300) * np.exp(-t / 0.05))


def whoosh(dur=0.6, lo=800, hi=4000, vel=1.0):
    n = int(dur * SR)
    t = np.linspace(0, 1, n)
    return vel * peak_norm(bp(noise(n), lo, hi) * np.sin(np.pi * t) ** 2)


def hoof(vel=1.0):
    n = int(0.14 * SR)
    t = np.arange(n) / SR
    ph = 2 * np.pi * np.cumsum(170 * (1 - 0.4 * t / 0.14)) / SR
    s = np.sin(ph) * np.exp(-t / 0.035) + 0.7 * lp(hp(noise(n), 1200), 4000) * np.exp(-t / 0.012)
    return vel * peak_norm(s)


def crowd(dur, seed_shift=0):
    """Foule : trois bandes de bruit à modulation lente, façon voix."""
    n = int(dur * SR)
    out = np.zeros(n)
    for lo, hi, g in ((450, 900, 1.0), (900, 1700, 0.8), (1900, 3200, 0.35), (120, 400, 0.6)):
        am = lp(noise(n), 6)
        am = np.clip(am / (np.std(am) + 1e-9) * 0.5 + 1.0, 0.2, 2.0)
        out += g * bp(noise(n), lo, hi) * am
    return peak_norm(out)


def babble(dur, voices=12):
    n = int(dur * SR)
    t = np.arange(n) / SR
    out = np.zeros(n)
    for _ in range(voices):
        f1, f2 = rng.uniform(380, 800), rng.uniform(1000, 2200)
        s = bp(noise(n), f1 * 0.8, f1 * 1.25) + 0.7 * bp(noise(n), f2 * 0.85, f2 * 1.2)
        syl = (0.5 + 0.5 * np.sin(2 * np.pi * rng.uniform(3, 6) * t + rng.uniform(0, 6.28))) ** 1.6
        gate = np.clip(lp(noise(n), 1.2) * 4 + 0.4, 0, 1)
        out += s * syl * gate
    return peak_norm(out)


def crackle(dur, rate, amp=1.0):
    n = int(dur * SR)
    out = np.zeros(n)
    for _ in range(int(rate * dur)):
        i = rng.integers(0, n - 600)
        L = rng.integers(40, 500)
        out[i:i + L] += hp(noise(L), 1500) * np.exp(-np.arange(L) / (L / 4)) * rng.exponential(0.5)
    return amp * out / (np.max(np.abs(out)) + 1e-9)


def rustle(dur, lo=2500, hi=8000, am=22):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = bp(noise(n), lo, hi) * (0.5 + 0.5 * np.abs(np.sin(2 * np.pi * am * t + rng.uniform(0, 6)))) * np.sin(np.pi * t / dur)
    return peak_norm(s)


def shing(dur=0.55):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = hp(noise(n), 3500) * np.minimum(1, t / 0.03) * np.exp(-t / 0.18)
    ring = np.sin(2 * np.pi * 3100 * t) * np.exp(-t / 0.3) * 0.4
    return peak_norm(s + ring)


def creak(dur=1.0):
    n = int(dur * SR)
    t = np.arange(n) / SR
    s = bp(noise(n), 350, 900) * (0.6 + 0.4 * np.sin(2 * np.pi * 11 * t + 1)) * np.minimum(1, t / 0.3)
    return peak_norm(s)


def fade(x, t0, t1, g0, g1):
    """Applique une rampe de gain entre t0 et t1 (secondes) sur un bus complet."""
    i0, i1 = int(t0 * SR), int(t1 * SR)
    g = np.ones(x.shape[1])
    g[:i0] = g0
    g[i0:i1] = np.linspace(g0, g1, i1 - i0)
    g[i1:] = g1
    return x * g


# ---------------------------------------------------------------- voix


def tts_wav(text, model, out, length_scale=1.1, noise_scale=0.55, noise_w=0.6, speaker=None):
    from piper import PiperVoice, SynthesisConfig
    voice = PiperVoice.load(model)
    cfg = SynthesisConfig(speaker_id=speaker, length_scale=length_scale,
                          noise_scale=noise_scale, noise_w_scale=noise_w)
    with wave.open(out, "wb") as w:
        voice.synthesize_wav(text, w, syn_config=cfg)
    sr, x = wavfile.read(out)
    x = x.astype(np.float64) / 32768.0
    return signal.resample_poly(x, SR, sr)


def narrator(x):
    x = hp(x, 70)
    x = x + 0.35 * lp(x, 320)  # un peu de corps dans le grave
    x = np.tanh(1.6 * x) / np.tanh(1.6)
    return peak_norm(x) * 0.85


def cry_voice(x):
    x = np.tanh(3.5 * peak_norm(hp(x, 90))) / np.tanh(3.5)
    x = x + 0.6 * bp(x, 1800, 4500)
    return peak_norm(x)


def pitch_tape(x, ratio):
    """Change hauteur et durée ensemble (effet bande), ratio < 1 = plus grave."""
    from fractions import Fraction
    fr = Fraction(ratio).limit_denominator(100)
    return signal.resample_poly(x, fr.numerator, fr.denominator)


# ---------------------------------------------------------------- partition


def compose_music():
    M = new_bus()
    P = dict(p=0.06, mp=0.12, mf=0.2, f=0.32, ff=0.45)

    def chord(notes, t0, dur, gain, fn=string_note, spread=0.55, **kw):
        for i, m in enumerate(notes):
            pan = -spread + 2 * spread * i / max(1, len(notes) - 1)
            put(M, fn(m, dur, **kw), t0, gain, pan)

    Dm = [50, 57, 62, 65, 69]
    Bb = [46, 53, 58, 62, 65]
    C = [48, 55, 60, 64, 67]
    A = [45, 52, 57, 61, 64]
    Gm = [43, 50, 55, 58, 62]
    DmF = [41, 50, 57, 62, 65]
    D = [50, 57, 62, 66, 69]
    G = [43, 50, 55, 59, 62]

    # -- Mesures 1-2 (0-5 s) : le conseil. Grave tenu, cœur de timbale.
    put(M, string_note(26, 6.0, a=2.0, r=1.0, cutoff=700), 0.0, (0.08, 0.22), 0)
    chord(Dm, 0.6, 4.6, (0.02, 0.15), a=2.2, r=1.2, cutoff=2400)
    for i, t0 in enumerate((2.5, 3.125, 3.75, 4.375)):
        put(M, timpani(73.4), t0, 0.20 + 0.06 * i, 0)
    chord([50, 57], 3.75, 1.5, (0.02, 0.12), fn=horn_note, a=0.9, r=0.8)

    # -- Mesures 3-4 (5-10 s) : la chevauchée. Ostinato aux violoncelles.
    put(M, string_note(26, 2.6, a=0.4, r=0.5, cutoff=700), 5.0, 0.4, 0)
    put(M, string_note(34, 2.7, a=0.4, r=0.5, cutoff=700), 7.5, 0.4, 0)
    chord(Dm, 5.0, 2.5, (0.08, 0.14), a=0.8, r=0.6, cutoff=2800)
    chord(Bb, 7.5, 2.5, (0.12, 0.22), a=0.8, r=0.6, cutoff=3000)
    pat3 = [38, 38, 45, 38, 41, 38, 45, 38]
    pat4 = [46, 46, 53, 46, 50, 46, 53, 46]
    for bar, pat in ((3, pat3), (4, pat4)):
        for i, m in enumerate(pat):
            g = (0.10 + 0.025 * (bar - 3) * 4 + 0.012 * i) * (1.4 if i % 2 == 0 else 1.0)
            put(M, cello_pulse(m), bar_t(bar) + i * BEAT / 2, g, -0.3)
    chord([50, 57, 62], 6.25, 1.2, (0.04, 0.2), fn=horn_note, a=0.8, r=0.5)
    chord([46, 53, 58, 62], 7.5, 2.3, (0.1, 0.25), fn=horn_note, a=0.9, r=0.4)
    for t0 in (5.0, 6.25):
        put(M, timpani(73.4), t0, 0.3, 0)
    for i in range(4):
        put(M, timpani(58.3), 7.5 + i * BEAT, 0.38 + 0.08 * i, 0)

    # -- Mesure 5 (10-12,5 s) : tension sur la dominante, puis coupure nette à 11,75 s.
    put(M, string_note(33, 2.0, a=0.3, r=0.1, cutoff=700), 10.0, 0.45, 0)
    chord(A, 10.0, 1.75, (0.2, 0.34), a=0.3, r=0.05, cutoff=3200)
    chord([69, 76, 81], 10.0, 1.7, (0.05, 0.2), a=1.2, r=0.05, cutoff=5500)
    for i in range(3):
        put(M, timpani(55.0), 10.0 + i * BEAT, 0.6, 0)
    for t0 in (11.25, 11.4, 11.55, 11.65):
        put(M, timpani(55.0), t0, 0.55, 0)
    # roulement de caisse claire en crescendo (doubles-croches)
    t0 = 8.75
    while t0 < 11.74:
        put(M, snare(1.0), t0, 0.05 + 0.20 * (t0 - 8.75) / 3.0, 0.1)
        t0 += BEAT / 4
    put(M, crash(2.0)[::-1], 9.85, 0.35, 0)  # cymbale inversée vers la coupure

    gate = np.ones(N)
    g0, g1 = int(11.76 * SR), int(12.47 * SR)
    gate[g0:g1] = 0
    gate = np.convolve(gate, np.ones(480) / 480, mode="same")
    M *= gate  # coupure avant réverbération : la queue de réverbe sonne dans le silence

    # -- Mesures 6-8 (12,5-20 s) : l'assaut. Tutti.
    put(M, boom(), 12.5, 0.9, 0)
    put(M, crash(), 12.5, 0.5, 0)
    put(M, taiko(55), 12.5, 0.9, 0)
    chord([38, 45, 50, 53, 57, 62], 12.5, 0.9, 0.34, fn=horn_note, a=0.02, r=0.3, spread=0.4)
    put(M, crash(), 15.0, 0.4, 0)
    put(M, boom(), 15.0, 0.55, 0)
    put(M, crash(), 17.5, 0.25, 0)

    plan = [(6, Dm, 38, 50, 73.4), (7, Bb, 34, 46, 58.3), (8, C, 36, 48, 65.4)]
    arp = {6: [50, 57, 62, 57], 7: [46, 53, 58, 53], 8: [48, 55, 60, 55]}
    for bar, pad, bass, cel, tf in plan:
        t0 = bar_t(bar)
        chord(pad, t0, BAR - 0.1, 0.24, a=0.15, r=0.4, cutoff=3600)
        put(M, string_note(bass, BAR, a=0.05, r=0.3, cutoff=800), t0, 0.45, 0)
        for i in range(16):  # doubles-croches
            m = arp[bar][i % 4]
            if bar == 8 and i >= 8:
                m = [45, 52, 57, 52][i % 4]
            put(M, spiccato(m), t0 + i * BEAT / 4, 0.20 if i % 4 == 0 else 0.12, 0.35)
        for i in range(8):  # pulsation grave
            r_ = cel if not (bar == 8 and i >= 4) else 45
            put(M, cello_pulse(r_ - 12 if r_ - 12 >= 38 else r_), t0 + i * BEAT / 2, 0.18, -0.3)
        for i, v in enumerate((1.0, 0.55, 0.85, 0.55)):
            put(M, timpani(tf), t0 + i * BEAT, 0.55 * v, 0)
            if i % 2 == 1:
                put(M, snare(0.9), t0 + i * BEAT, 0.28, 0.1)
        put(M, taiko(tf * 0.75), t0, 0.55, 0)
    # chœur
    for bar, male, fem in ((6, [50, 57], [65, 69, 74]), (7, [46, 53], [62, 65, 70]), (8, [48, 55], [64, 67, 72])):
        t0 = bar_t(bar)
        for m in male:
            put(M, choir_note(m, BAR - 0.3, a=0.35, r=0.5), t0, 0.16, -0.2)
        for m in fem:
            put(M, choir_note(m, BAR - 0.3, a=0.35, r=0.5, female=True), t0, 0.15, 0.25)
    # motif de cuivres
    motif = {
        6: [(0, 62, 1.5), (1.5, 65, 0.5), (2, 69, 1.0), (3, 74, 1.0)],
        7: [(0, 74, 1.5), (1.5, 72, 0.5), (2, 70, 1.0), (3, 74, 1.0)],
        8: [(0, 76, 1.5), (1.5, 74, 0.5), (2, 73, 1.0), (3, 76, 1.0)],
    }
    for bar, notes in motif.items():
        for bt, m, d in notes:
            for oct_, g in ((0, 0.34), (-12, 0.25)):
                put(M, horn_note(m + oct_, d * BEAT - 0.05, a=0.04, r=0.12, peak=1.0), bar_t(bar, bt), g, 0.1)
    # roulement de caisse vers la mesure 9 + cymbale inversée
    t0 = 19.0
    while t0 < 20.0:
        put(M, snare(1.0), t0, 0.12 + 0.2 * (t0 - 19.0), 0.1)
        t0 += BEAT / 4
    put(M, crash(1.6)[::-1], 18.5, 0.3, 0)
    put(M, timpani(55), 19.375, 0.7, 0)

    # -- Mesures 9-10 (20-25 s) : la prière. Violoncelle seul, chœur.
    put(M, timpani(98.0), 20.0, 0.22, 0)
    chord(Gm, 20.0, 2.4, (0.03, 0.09), a=1.4, r=1.0, cutoff=2200)
    chord(DmF, 22.5, 2.3, (0.05, 0.13), a=1.2, r=0.9, cutoff=2400)
    for m in (55, 62):
        put(M, choir_note(m, 2.2, a=1.2, r=1.0), 20.0, 0.10, -0.2)
    for m in (67, 70, 74):
        put(M, choir_note(m, 2.2, a=1.2, r=1.0, female=True), 20.0, 0.09, 0.25)
    for m in (53, 57, 62):
        put(M, choir_note(m, 2.3, a=1.0, r=1.0), 22.5, 0.11, -0.2)
    for m in (65, 69, 74):
        put(M, choir_note(m, 2.3, a=1.0, r=1.0, female=True), 22.5, 0.10, 0.25)
    for t0, m, d in ((20.3, 55, 1.3), (21.7, 58, 0.9), (22.7, 57, 1.3), (24.1, 50, 1.6)):
        put(M, string_note(m, d, a=0.25, r=0.6, cutoff=2200, vib=0.008, slope=0.9), t0, 0.30, -0.1)
    chord(A, 24.4, 0.8, (0.02, 0.2), a=0.5, r=0.1, cutoff=3000)

    # -- Mesures 11-12 (25-30 s) : la table. Ré majeur, cuivres en choral.
    final = 28.75
    prog = [(25.0, 26.25, D, 38, [50, 57, 62, 66]),
            (26.25, 27.5, G, 43, [55, 59, 62, 67]),
            (27.5, final, A, 33, [52, 57, 61, 64]),
            (final, 30.9, D, 38, [50, 57, 62, 66, 69])]
    for t0, t1, pad, bass, hrn in prog:
        d = t1 - t0
        last = t1 > 30
        chord(pad, t0, d - 0.05, 0.26 if not last else 0.30, a=0.3, r=0.25 if not last else 1.0, cutoff=3600)
        put(M, string_note(bass, d, a=0.1, r=0.3 if not last else 1.0, cutoff=800), t0, 0.4, 0)
        chord(hrn, t0, d - 0.05, 0.26 if not last else 0.3, fn=horn_note, a=0.12, r=0.25 if not last else 1.0)
        for m in hrn[:2]:
            put(M, choir_note(m, d, a=0.4, r=0.3 if not last else 1.0), t0, 0.13, -0.2)
        for m in hrn[2:]:
            put(M, choir_note(m + 12 if m < 66 else m, d, a=0.4, r=0.3 if not last else 1.0, female=True), t0, 0.12, 0.25)
    put(M, timpani(73.4), 25.0, 0.55, 0)
    put(M, crash(3.0), 25.0, 0.12, 0)
    for t0 in (26.25, 27.5):
        put(M, timpani(73.4), t0, 0.4, 0)
    put(M, timpani(73.4), final, 0.8, 0)
    put(M, taiko(73.4), final, 0.6, 0)
    put(M, crash(3.5), final, 0.38, 0)
    put(M, boom(), final, 0.35, 0)
    M = M - 0.35 * np.stack([lp(M[c], 150) for c in range(2)])
    M = np.stack([hp(M[c], 35) for c in range(2)])
    return M


def compose_sfx():
    S, H = new_bus(), new_bus()  # S : plein air, H : intérieur (plus de réverbération)

    # -- A : sous la tente (0-5,6 s)
    n = int(5.9 * SR)
    amb = np.stack([lp(noise(n), 180) * 0.05 + bp(noise(n), 200, 1200) * 0.014 *
                    (0.6 + 0.4 * np.sin(2 * np.pi * 0.37 * np.arange(n) / SR)) for _ in range(2)])
    amb *= swell(n, 0.8, 0.8)
    put(H, amb, 0.0, 1.0)
    put(H, crackle(5.8, 7) * 0.02, 0.0, 1.0, 0.1)
    put(H, rustle(0.4, 2500, 6000) * 0.07, 0.9, 1.0, -0.2)
    put(H, metal_hit(2600, 0.5), 2.4, 0.05, 0.3)
    put(H, metal_hit(1800, 0.3), 3.05, 0.12, 0.0)  # la dague sur la carte
    put(H, thud(110, 0.3), 3.05, 0.10, 0.0)
    for t0, v in ((1.7, 0.30), (4.1, 0.40)):
        put(H, thud(42, 0.9), t0, v, 0.2)  # tir de catapulte au loin

    # -- B : la chevauchée (5-10 s)
    n = int(5.4 * SR)
    wind = np.stack([lp(noise(n), 500) * 0.05 * swell(n, 1.0, 1.5) for _ in range(2)])
    put(S, wind, 4.9, 1.0)
    gait = [0.0, 0.26, 0.58, 0.86]
    t0, k = 5.2, 0
    while t0 < 9.9:
        put(S, hoof(1.0 if k % 2 == 0 else 0.75), t0 + gait[k % 4] * 0 + (k % 4) * 0.0, 0.16, -0.25)
        t0 += 0.29 if k % 2 == 0 else 0.29
        k += 1
    t0 = 6.0
    while t0 < 10.0:
        put(S, thud(70, 0.25), t0, 0.07, rng.uniform(-0.8, 0.8))  # pas de la colonne
        t0 += 0.31
    flap = bp(noise(int(3.6 * SR)), 300, 1500) * (0.5 + 0.5 * np.sin(2 * np.pi * 5 * np.arange(int(3.6 * SR)) / SR))
    put(S, flap * 0.02, 6.4, 1.0, 0.5)
    for t0 in np.arange(5.4, 10, 0.33):
        put(S, metal_hit(rng.uniform(2200, 3600), 0.2), t0, 0.012, rng.uniform(-0.6, 0.6))
    put(S, np.stack([lp(noise(int(1.8 * SR)), 700) * 0.09 * swell(int(1.8 * SR), 1.2, 0.05) for _ in range(2)]), 9.95, 1.0)

    # -- C : le cri (12,5-15 s)
    n = int(3.2 * SR)
    roar = crowd(3.2)
    roar_st = np.stack([roar, np.roll(roar, 700)]) * swell(n, 0.5, 1.2)
    put(S, roar_st, 12.45, 0.30)
    put(S, shing(), 12.9, 0.16, -0.4)
    put(S, shing(), 13.1, 0.14, 0.5)
    put(S, shing(), 13.3, 0.12, 0.1)
    for t0 in (14.2, 14.5, 14.75):
        put(S, metal_hit(rng.uniform(500, 1200), 0.5), t0, 0.12, rng.uniform(-0.7, 0.7))

    # -- D : le combat (15-20,2 s)
    dur = 5.3
    n = int(dur * SR)
    fire = np.stack([crackle(dur, 28) * 0.05, crackle(dur, 28) * 0.05])
    put(S, fire, 15.0, 1.0)
    cr = crowd(dur)
    put(S, np.stack([cr, np.roll(cr, 900)]) * swell(n, 0.1, 1.0), 15.0, 0.22)
    t0 = 15.05
    while t0 < 20.0:
        kind = rng.random()
        pan = rng.uniform(-0.9, 0.9)
        if kind < 0.55:
            put(S, metal_hit(rng.uniform(450, 1500), 0.55), t0, rng.uniform(0.07, 0.18), pan)
        elif kind < 0.85:
            put(S, metal_hit(rng.uniform(250, 520), 0.45), t0, rng.uniform(0.08, 0.16), pan)
            put(S, thud(90, 0.2), t0, 0.12, pan)
        else:
            put(S, thud(rng.uniform(55, 95), 0.4), t0, rng.uniform(0.10, 0.2), pan)
        t0 += rng.exponential(0.14) + 0.05
    for t0 in (15.55, 17.05, 18.55):
        put(S, whoosh(0.7, 900, 4500), t0, 0.18, rng.uniform(-0.5, 0.5))  # volées de flèches
    for t0, side in ((16.0, -0.7), (18.2, -0.6)):
        put(S, creak(1.0), t0 - 0.9, 0.12, side)
        put(S, thud(48, 0.9), t0, 0.5, side)  # lancer
        put(S, whoosh(1.2, 200, 900), t0 + 0.1, 0.12, side)
    for t0 in (17.0, 19.2):
        put(S, thud(38, 1.2), t0, 0.55, 0.3)  # impact contre le mur
        put(S, crowd(0.6), t0, 0.10, 0.3)
    put(S, thud(70, 0.3), 18.0, 0.3, 0.6)
    put(S, metal_hit(330, 0.9), 18.0, 0.25, 0.6)  # coup de bouclier

    # -- E : la prière (20-25 s), intérieur
    put(H, np.stack([lp(noise(int(5.4 * SR)), 120) * 0.03 * swell(int(5.4 * SR), 0.8, 0.6) for _ in range(2)]), 20.0, 1.0)
    put(H, crackle(4.8, 8) * 0.03, 20.2, 1.0, -0.2)
    put(H, metal_hit(420, 1.4), 20.9, 0.28, 0.2)  # le casque posé sur la pierre
    put(H, thud(80, 0.3), 20.9, 0.15, 0.2)
    put(H, rustle(0.55, 3000, 8000) * 0.06, 22.0, 1.0, -0.1)  # la maille

    # -- F : la salle (25-30 s)
    dur = 4.6
    n = int(dur * SR)
    bb = babble(dur)
    put(H, np.stack([bb, np.roll(bb, 500)]) * swell(n, 0.6, 0.5), 24.8, 0.17)
    put(H, np.stack([crackle(dur, 10) * 0.025, crackle(dur, 10) * 0.025]), 24.8, 1.0)
    for t0, f in ((25.7, 3100), (26.4, 2700), (27.05, 3500), (27.7, 2900)):
        put(H, metal_hit(f, 0.35), t0, 0.04, rng.uniform(-0.7, 0.7))
    cheer = crowd(1.6)
    put(H, np.stack([cheer, np.roll(cheer, 600)]) * swell(int(1.6 * SR), 0.15, 0.7), 28.7, 0.26)
    for f, dt, v in ((2300, 0.0, 0.12), (3100, 0.02, 0.10), (2750, 0.05, 0.10), (3600, 0.09, 0.07)):
        put(H, metal_hit(f, 0.9), 28.75 + dt, v, rng.uniform(-0.4, 0.4))  # les coupes s'entrechoquent
    return S, H


def build(args):
    work = args.travail
    out = os.path.join(work, "audio")
    os.makedirs(out, exist_ok=True)

    # voix off + cri
    model = os.path.join(args.modeles, "vits-piper-fr_FR-tom-medium", "fr_FR-tom-medium.onnx")
    lines = [
        dict(id="A", text="Trois mois de siège. Les murs tenaient encore.", start=0.9),
        dict(id="B", text="À l'aube, il mena ses hommes jusqu'à la porte.", start=5.5),
        dict(id="E", text="Il en manquait trente à l'appel.", start=21.0),
        dict(id="F", text="À table, on leva quand même les coupes.", end=28.65),
    ]
    VO = new_bus()
    timing = {"lignes": [], "cri": {}}
    for L in lines:
        x = narrator(tts_wav(L["text"], model, os.path.join(out, f"vo_{L['id']}.wav"), length_scale=1.12))
        d = len(x) / SR
        start = L.get("start", L.get("end", 0) - d)
        put(VO, x, start, 0.8, 0.0)
        # on retire le silence de début/fin pour caler les sous-titres sur la parole
        env = np.abs(x) > 0.02
        idx = np.where(env)[0]
        t_in, t_out = start + idx[0] / SR, start + idx[-1] / SR
        timing["lignes"].append(dict(id=L["id"], texte=L["text"], debut=round(t_in, 2), fin=round(t_out, 2)))
        print(f"VO {L['id']}: {t_in:.2f}-{t_out:.2f}s")

    CRY = new_bus()
    cry_start = 11.9
    if args.cri:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", args.cri, "-ac", "1", "-ar", str(SR), "-f", "f32le", "-"],
                             capture_output=True, check=True).stdout
        cry = peak_norm(np.frombuffer(raw, dtype=np.float32).astype(np.float64))
    else:
        cry = tts_wav("À l'assaut !", model, os.path.join(out, "cry_raw.wav"), length_scale=1.25,
                      noise_scale=0.75, noise_w=0.9)
        cry = cry_voice(cry)
    cry = cry * 0.95
    put(CRY, cry, cry_start, 1.0, 0.0)
    for k, (ratio, delay, g, pan) in enumerate(((0.86, 0.22, 0.45, -0.5), (0.93, 0.30, 0.40, 0.5), (0.80, 0.38, 0.35, 0.0))):
        put(CRY, pitch_tape(cry, ratio), cry_start + delay, g, pan)  # la troupe reprend le cri
    cr_idx = np.where(np.abs(cry) > 0.05)[0]
    timing["cri"] = dict(debut=round(cry_start + cr_idx[0] / SR, 2), fin=round(cry_start + cr_idx[-1] / SR, 2))
    print("cri", timing["cri"])

    # musique, bruitages
    if args.musique:
        raw = subprocess.run(["ffmpeg", "-v", "error", "-i", args.musique, "-t", str(DUR), "-ac", "2", "-ar", str(SR),
                              "-f", "f32le", "-"], capture_output=True, check=True).stdout
        a = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).T.astype(np.float64)
        M = new_bus()
        M[:, : min(N, a.shape[1])] = a[:, :N] * 0.5
    else:
        M = compose_music()
    S, H = compose_sfx()

    # coupure nette avant le cri (11,76-12,47 s), appliquée aux bruitages aussi
    gate = np.ones(N)
    gate[int(11.76 * SR):int(12.47 * SR)] = 0
    gate = np.convolve(gate, np.ones(480) / 480, mode="same")
    S, H = S * gate, H * gate

    ir_hall, ir_out, ir_vo = make_ir(2.8), make_ir(1.6), make_ir(1.3)
    M = reverb(M, ir_hall, 0.35)
    S = reverb(S, ir_out, 0.12)
    H = reverb(H, ir_hall, 0.30)
    VO = reverb(VO, ir_vo, 0.14)
    CRY = reverb(CRY, ir_hall, 0.28)

    # le cri se lit dans le silence ; la musique s'efface sous la voix off
    vo_env = lp(np.abs(VO).mean(axis=0), 4)
    vo_env = np.clip(vo_env / 0.08, 0, 1)
    M = M * (1 - 0.55 * vo_env)

    mix = 1.0 * M + 0.9 * S + 0.9 * H + 1.25 * VO + 1.1 * CRY
    mix = fade(mix, 0.0, 0.5, 0.0, 1.0)
    mix = fade(mix, 29.3, 30.0, 1.0, 0.0)
    for name, bus in (("musique", M), ("bruitages", S + H), ("voix", VO), ("cri", CRY)):
        wavfile.write(os.path.join(out, f"stem_{name}.wav"), SR, (bus.T / max(1e-9, np.max(np.abs(bus))) * 0.9).astype(np.float32))
    mix = mix / (np.max(np.abs(mix)) + 1e-9) * 0.9
    raw_path = os.path.join(out, "mix_brut.wav")
    wavfile.write(raw_path, SR, mix.T.astype(np.float32))
    meas = subprocess.run(["ffmpeg", "-hide_banner", "-i", raw_path, "-af", "ebur128", "-f", "null", "-"],
                          capture_output=True, text=True).stderr
    lufs = float(meas.split("Integrated loudness:")[1].split("I:")[1].split("LUFS")[0])
    gain_db = args.lufs - lufs
    print(f"niveau brut {lufs:.1f} LUFS, gain {gain_db:+.1f} dB vers {args.lufs} LUFS")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", raw_path, "-af",
                    f"volume={gain_db}dB,alimiter=limit=0.89:level=disabled", "-ar", str(SR), "-c:a", "pcm_s16le",
                    os.path.join(out, "mix.wav")], check=True)
    with open(os.path.join(out, "timing.json"), "w", encoding="utf-8") as f:
        json.dump(timing, f, ensure_ascii=False, indent=2)
    print("OK ->", os.path.join(out, "mix.wav"))


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    ap = argparse.ArgumentParser()
    ap.add_argument("--travail", default=os.path.join(root, "travail"))
    ap.add_argument("--modeles", default=os.path.join(root, "travail", "modeles"))
    ap.add_argument("--lufs", type=float, default=-16.0, help="niveau sonore intégré visé")
    ap.add_argument("--cri", help="votre propre enregistrement de « À l'assaut ! » (wav/mp3/m4a)")
    ap.add_argument("--musique", help="une partition existante, utilisée à la place de la musique synthétisée")
    build(ap.parse_args())
