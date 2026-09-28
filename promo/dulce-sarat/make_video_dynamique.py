"""Pub vidéo Dulce Sarat — version dynamique, 20 s, 1080x1920, montage calé sur 120 BPM.

Usage : python3 make_video_dynamique.py
Réutilise les polices, la palette et les utilitaires de make_video.py.
"""
import math
import os
import subprocess
import wave

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from make_video import (CREAM, FONTS, H, INK, PHOTOS, RED, SLATE, W, cover, ease,
                        sans, sans_b, script_font, stitch_band, text_center)

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "dulce-sarat-pub-20s-dynamique.mp4")
FPS, DUR = 30, 20.0
N = int(FPS * DUR)
BPM = 120
BEAT = 60 / BPM

P_APE, P_SUC, P_NOEL, P_STAND, P_ETAL = (
    "01-sachets-aperitif.jpg", "02-sachets-sucres.jpg", "03-coffret-noel.jpg",
    "04-stand-marche.jpg", "06-coffrets-etal.jpg")

# Plans : (début, durée, photo, zoom, centre x, centre y, mot, titre manuscrit)
# Le centre est donné en fraction de la photo source ; zoom 1 = photo entière.
SHOTS = [
    (1.5, 0.5, P_STAND, 1.05, 0.50, 0.45, "FAIT", None),
    (2.0, 0.5, P_STAND, 1.9, 0.50, 0.25, "MAIN", None),
    (2.5, 0.5, P_STAND, 1.7, 0.50, 0.38, "DANS L'AUDE", None),
    (3.0, 1.0, P_APE, 1.05, 0.50, 0.45, None, "À l'apéritif"),
    (4.0, 0.5, P_APE, 1.9, 0.15, 0.36, "CUMIN", None),
    (4.5, 0.5, P_APE, 1.9, 0.44, 0.33, "HERBES DE\nPROVENCE", None),
    (5.0, 0.5, P_APE, 1.9, 0.74, 0.30, "CURRY DOUX", None),
    (5.5, 1.0, P_SUC, 1.05, 0.50, 0.50, None, "Côté sucré"),
    (6.5, 0.5, P_SUC, 1.8, 0.50, 0.70, "CITRON", None),
    (7.0, 0.5, P_SUC, 1.8, 0.25, 0.25, "CANNELLE", None),
    (7.5, 0.5, P_SUC, 1.8, 0.78, 0.26, "CHOCOLAT", None),
    (8.0, 0.5, P_STAND, 1.9, 0.38, 0.73, "COOKIES", None),
    (8.5, 1.0, P_STAND, 1.6, 0.50, 0.27, None, "Pickles de légumes"),
    (9.5, 0.5, P_ETAL, 1.9, 0.62, 0.12, "FAITS MAISON", None),
    (10.0, 1.0, P_ETAL, 1.05, 0.50, 0.45, None, "Coffrets"),
    (11.0, 0.5, P_ETAL, 1.8, 0.25, 0.31, "À OFFRIR", None),
    (11.5, 0.5, P_ETAL, 1.8, 0.50, 0.53, "À PARTAGER", None),
    (12.0, 1.5, P_NOEL, 1.05, 0.50, 0.45, None, "Pour les fêtes"),
    # Récapitulatif en rafale, un plan par demi-temps
    (13.5, 0.25, P_APE, 1.7, 0.42, 0.72, None, None),
    (13.75, 0.25, P_SUC, 1.6, 0.75, 0.30, None, None),
    (14.0, 0.25, P_STAND, 1.8, 0.50, 0.25, None, None),
    (14.25, 0.25, P_APE, 1.8, 0.85, 0.72, None, None),
    (14.5, 0.25, P_ETAL, 1.6, 0.50, 0.53, None, None),
    (14.75, 0.25, P_SUC, 1.6, 0.30, 0.72, None, None),
    (15.0, 0.25, P_NOEL, 1.4, 0.50, 0.40, None, None),
    (15.25, 0.25, P_STAND, 1.1, 0.50, 0.45, None, None),
]
FLASHES = [1.5, 3.0, 5.5, 8.5, 10.0, 12.0, 13.5, 15.5]
END_START = 15.5


def ease_out_back(t, s=2.2):
    t = min(max(t, 0.0), 1.0) - 1
    return 1 + t * t * ((s + 1) * t + s)


def ease_out(t):
    t = min(max(t, 0.0), 1.0)
    return 1 - (1 - t) ** 3


def shot_image(img, local_t, dur, zoom, cx, cy, idx):
    """Plan avec « punch-in » à la coupe, dérive continue et léger glissé latéral."""
    punch = 0.14 * (1 - ease_out(local_t / 0.22))
    drift = 0.07 * local_t
    z = zoom * (1 + punch + drift)
    direction = 1 if idx % 2 else -1
    slide = direction * 0.04 * (1 - ease_out(local_t / 0.2))
    sw, sh = W / z, H / z
    x = (cx + slide) * img.width
    y = cy * img.height
    x = min(max(x, sw / 2), img.width - sw / 2)
    y = min(max(y, sh / 2), img.height - sh / 2)
    a = sw / W
    out = img.transform((W, H), Image.AFFINE,
                        (a, 0, x - sw / 2, 0, a, y - sh / 2), Image.BICUBIC)
    # Flou de mouvement sur les 3 premières images du plan
    if local_t < 0.1:
        k = int(28 * (1 - local_t / 0.1))
        if k > 2:
            arr = np.asarray(out).astype(np.float32)
            acc = np.zeros_like(arr)
            steps = 6
            for s in range(steps):
                acc += np.roll(arr, direction * int(k * s / steps), axis=1)
            out = Image.fromarray((acc / steps).astype(np.uint8))
    return out


_word_cache = {}


def word_sticker(word):
    """Mot en capitales sur étiquette rouge, comme un tampon."""
    if word in _word_cache:
        return _word_cache[word]
    size = 118 if "\n" not in word else 100
    f = sans_b(size)
    tmp = ImageDraw.Draw(Image.new("RGBA", (1, 1)))
    while True:
        bb = tmp.multiline_textbbox((0, 0), word, font=f, spacing=6, align="center")
        if bb[2] - bb[0] <= 860:
            break
        size -= 6
        f = sans_b(size)
    tw, th = int(bb[2] - bb[0]), int(bb[3] - bb[1])
    px, py = 46, 30
    im = Image.new("RGBA", (tw + 2 * px + 20, th + 2 * py + 20), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.rounded_rectangle([14, 16, tw + 2 * px + 14, th + 2 * py + 16], 18, fill=(0, 0, 0, 110))
    d.rounded_rectangle([4, 4, tw + 2 * px + 4, th + 2 * py + 4], 18, fill=RED + (255,))
    d.multiline_text((4 + px - bb[0], 4 + py - bb[1]), word, font=f, fill=CREAM + (255,),
                     spacing=6, align="center")
    _word_cache[word] = im
    return im


def paste_scaled(base, sticker, cx, cy, scale, alpha=1.0, angle=0.0):
    s = sticker
    if angle:
        s = s.rotate(angle, resample=Image.BICUBIC, expand=True)
    w, h = max(1, int(s.width * scale)), max(1, int(s.height * scale))
    s = s.resize((w, h), Image.BICUBIC)
    if alpha < 1:
        s.putalpha(s.getchannel("A").point(lambda v: int(v * alpha)))
    base.alpha_composite(s, (int(cx - w / 2), int(cy - h / 2)))


def bottom_gradient(strength):
    g = np.zeros((H, W, 4), np.uint8)
    ys = np.clip((np.arange(H) - H * 0.5) / (H * 0.4), 0, 1) ** 1.2
    g[..., 3] = (ys * 220 * strength)[:, None]
    return Image.fromarray(g, "RGBA")


_title_cache = {}


def title_sticker(title):
    if title not in _title_cache:
        im = Image.new("RGBA", (W, 340), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        text_center(d, 40, title, script_font(170 if len(title) < 14 else 140), CREAM + (255,))
        _title_cache[title] = im
    return _title_cache[title]


def intro(t):
    """0 → 1,5 s : logo qui rebondit sur fond ardoise, frise qui descend."""
    img = Image.new("RGBA", (W, H), SLATE + (255,))
    d = ImageDraw.Draw(img)
    stitch_band(d, 40, 0, int(H * ease_out(t / 0.5)), cell=8)
    stitch_band(d, W - 150, H - int(H * ease_out(t / 0.5)), H, cell=8)
    logo = Image.new("RGBA", (W, 700), (0, 0, 0, 0))
    text_center(ImageDraw.Draw(logo), 20, "Dulce\nSarat", script_font(260), CREAM + (255,),
                spacing=-40)
    if t > 0.05:
        paste_scaled(img, logo, W / 2, 800, ease_out_back((t - 0.05) / 0.35) * 1.0 + 0.001)
    if t > 0.5:
        k = ease_out((t - 0.5) / 0.25)
        tag = Image.new("RGBA", (W, 120), (0, 0, 0, 0))
        text_center(ImageDraw.Draw(tag), 20, "BISCUITS  ·  PICKLES", sans_b(62), CREAM + (255,),
                    shadow=False)
        img.alpha_composite(Image.eval(tag, lambda v: v), (int(-300 * (1 - k)), 1180))
    if t > 1.0:
        paste_scaled(img, word_sticker("FABRICATION ARTISANALE"), W / 2, 1400,
                     ease_out_back((t - 1.0) / 0.25) * 0.62 + 0.001, angle=-4)
    return img


def end_card(t):
    img = Image.new("RGBA", (W, H), SLATE + (255,))
    d = ImageDraw.Draw(img)
    stitch_band(d, 40, 0, H, cell=8)
    pulse = 1 + 0.025 * max(0.0, math.cos(2 * math.pi * t / BEAT)) ** 8
    logo = Image.new("RGBA", (W, 700), (0, 0, 0, 0))
    text_center(ImageDraw.Draw(logo), 20, "Dulce\nSarat", script_font(250), (255, 255, 255, 255),
                spacing=-40, shadow=False)
    paste_scaled(img, logo, W / 2 + 30, 650, ease_out_back(t / 0.35) * pulse + 0.001)
    lines = [
        (0.5, "BISCUITS · PICKLES · COFFRETS", sans_b(46), 1080),
        (1.0, "www.dulce-sarat.fr", sans_b(70), 1260),
        (1.5, "06 15 79 31 67", sans_b(64), 1370),
        (2.0, "Marchés, salons et commandes", sans(42), 1500),
        (2.0, "Le Bousquet (11140)", sans(40), 1570),
    ]
    for start, txt, f, y in lines:
        if t < start:
            continue
        k = ease_out((t - start) / 0.25)
        layer = Image.new("RGBA", (W, 130), (0, 0, 0, 0))
        text_center(ImageDraw.Draw(layer), 10, txt, f, (255, 255, 255, 255), shadow=False)
        layer.putalpha(layer.getchannel("A").point(lambda v: int(v * k)))
        img.alpha_composite(layer, (30, int(y + 50 * (1 - k))))
    return img


def render_frame(i, cache):
    t = i / FPS
    if t < 1.5:
        frame = intro(t)
    elif t >= END_START:
        frame = end_card(t - END_START)
    else:
        frame = None
        for idx, (s, dur, photo, z, cx, cy, word, title) in enumerate(SHOTS):
            if s <= t < s + dur:
                local = t - s
                frame = shot_image(cache[photo], local, dur, z, cx, cy, idx).convert("RGBA")
                if word:
                    frame.alpha_composite(bottom_gradient(0.6))
                    sc = ease_out_back(local / 0.18)
                    paste_scaled(frame, word_sticker(word), W / 2, 1480,
                                 max(sc, 0.001), angle=-3 if idx % 2 else 3)
                if title:
                    frame.alpha_composite(bottom_gradient(1.0))
                    k = ease_out(local / 0.3)
                    st = title_sticker(title)
                    st2 = st.copy()
                    st2.putalpha(st.getchannel("A").point(lambda v: int(v * k)))
                    frame.alpha_composite(st2, (int(160 * (1 - k)), 1340))
                break
        if frame is None:
            frame = Image.new("RGBA", (W, H), INK + (255,))
    # Flash blanc aux changements de partie
    for f in FLASHES:
        if f <= t < f + 0.15:
            a = 1 - (t - f) / 0.15
            frame = Image.blend(frame, Image.new("RGBA", (W, H), (255, 250, 240, 255)), 0.75 * a)
    return frame.convert("RGB")


# ---------------- Musique : 120 BPM, batterie + basse + arpèges ----------------
def make_music(path, sr=44100):
    n = int(sr * (DUR + 0.5))
    out = np.zeros(n)
    note = lambda m: 440 * 2 ** ((m - 69) / 12)
    rng = np.random.default_rng(7)

    def add(sig, start):
        i0 = int(start * sr)
        if i0 >= n:
            return
        seg = sig[: n - i0]
        out[i0:i0 + len(seg)] += seg

    def kick():
        L = int(0.35 * sr)
        tt = np.arange(L) / sr
        f = 45 + 110 * np.exp(-tt * 30)
        return np.sin(2 * math.pi * np.cumsum(f) / sr) * np.exp(-tt * 9) * 0.9

    def clap():
        L = int(0.2 * sr)
        tt = np.arange(L) / sr
        nz = rng.uniform(-1, 1, L)
        nz = np.diff(np.concatenate([[0], nz]))
        env = np.exp(-tt * 22) * (1 + 0.6 * (np.sin(2 * math.pi * 90 * tt) > 0))
        return nz * env * 0.35

    def hat(open_=False):
        L = int((0.18 if open_ else 0.05) * sr)
        tt = np.arange(L) / sr
        nz = np.diff(np.concatenate([[0], rng.uniform(-1, 1, L)]))
        return nz * np.exp(-tt * (18 if open_ else 70)) * 0.16

    def pluck(freq, length, amp):
        L = int(length * sr)
        p = max(2, int(sr / freq))
        buf = rng.uniform(-1, 1, p)
        y = np.empty(L)
        for k in range(L):
            j = k % p
            y[k] = buf[j]
            buf[j] = 0.995 * 0.5 * (buf[j] + buf[(j + 1) % p])
        return y * amp

    def bass(freq, length):
        L = int(length * sr)
        tt = np.arange(L) / sr
        s = np.sin(2 * math.pi * freq * tt) + 0.3 * np.sin(4 * math.pi * freq * tt)
        return np.tanh(1.6 * s) * np.exp(-tt * 3) * 0.32

    chords = [(60, 64, 67), (57, 60, 64), (53, 57, 60), (55, 59, 62)]
    arp = [0, 1, 2, 1]
    bar_len = 4 * BEAT
    nbars = int(math.ceil(DUR / bar_len))
    kick_s, clap_s, hat_c, hat_o = kick(), clap(), hat(), hat(True)
    for b in range(nbars):
        ch = chords[b % 4]
        t0 = b * bar_len
        for q in range(16):  # doubles-croches
            tq = t0 + q * BEAT / 4
            if tq >= DUR:
                break
            if q % 4 == 0 and tq >= 1.5:
                add(kick_s, tq)
            if q % 8 == 4 and tq >= 3.0:
                add(clap_s, tq)
            if q % 2 == 0 and tq >= 1.5:
                add(hat_o if q % 4 == 2 else hat_c, tq)
            if tq >= 0.0:
                m = ch[arp[q % 4]] + (12 if q // 4 % 2 else 24)
                add(pluck(note(m), 0.4, 0.12), tq)
            if q % 2 == 0 and tq >= 1.5:
                add(bass(note(ch[0] - 24), BEAT / 2 * 0.95), tq)
    # Montée (bruit filtré) avant la rafale finale, puis impact sur le carton
    L = int(1.0 * sr)
    tt = np.arange(L) / sr
    riser = np.diff(np.concatenate([[0], rng.uniform(-1, 1, L)])) * (tt / 1.0) ** 2 * 0.25
    add(riser, 12.5)
    add(kick_s * 1.2, END_START)
    add(clap_s * 1.5, END_START)
    # Fondu de sortie
    env = np.ones(n)
    end = int(DUR * sr)
    fo = int(1.2 * sr)
    env[end - fo:end] = np.linspace(1, 0, fo)
    env[end:] = 0
    out *= env
    out = np.tanh(out * 1.3)
    # Coupe au-dessus de 15 kHz : sinon l'encodeur AAC le fait et crée des pics > 0 dB
    spec = np.fft.rfft(out)
    freqs = np.fft.rfftfreq(len(out), 1 / sr)
    spec *= np.clip((16000 - freqs) / 1000, 0, 1)
    out = np.fft.irfft(spec, len(out))
    out = out / np.max(np.abs(out)) * 0.8
    st = np.stack([out, np.roll(out, 60)], 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((st * 32767).astype(np.int16).tobytes())


def main():
    cache = {}
    for p in {s[2] for s in SHOTS}:
        im = cover(Image.open(os.path.join(PHOTOS, p)).convert("RGB"))
        cache[p] = im.filter(ImageFilter.UnsharpMask(radius=2, percent=70, threshold=2))
    audio = os.path.join(HERE, "_music_dyn.wav")
    make_music(audio)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    proc = subprocess.Popen(
        [ff, "-y", "-loglevel", "error",
         "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{W}x{H}", "-r", str(FPS), "-i", "-",
         "-i", audio,
         "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p",
         "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", OUT],
        stdin=subprocess.PIPE)
    for i in range(N):
        proc.stdin.write(render_frame(i, cache).tobytes())
        if i % 60 == 0:
            print(f"image {i}/{N}")
    proc.stdin.close()
    proc.wait()
    os.remove(audio)
    print("OK ->", OUT)


if __name__ == "__main__":
    main()
