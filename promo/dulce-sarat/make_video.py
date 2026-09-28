"""Pub vidéo Dulce Sarat — 20 s, format vertical 1080x1920 (Reels, Stories, TikTok, Shorts).

Usage : python3 make_video.py
Dépendances : pip install pillow numpy imageio-ffmpeg
Polices (Google Fonts, licence OFL) attendues dans ./fonts :
  GreatVibes.ttf, Mont500.ttf, Mont700.ttf
"""
import math
import os
import subprocess
import wave

import imageio_ffmpeg
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
PHOTOS = os.path.join(HERE, "photos")
FONTS = os.path.join(HERE, "fonts")
OUT = os.path.join(HERE, "dulce-sarat-pub-20s.mp4")

W, H, FPS, DUR = 1080, 1920, 30, 20.0
N = int(FPS * DUR)
XFADE = 0.5

# Palette reprise du dépliant et des étiquettes
SLATE = (84, 88, 120)
CREAM = (250, 244, 232)
RED = (200, 30, 45)
INK = (25, 20, 22)

script_font = lambda s: ImageFont.truetype(os.path.join(FONTS, "GreatVibes.ttf"), s)
sans = lambda s: ImageFont.truetype(os.path.join(FONTS, "Mont500.ttf"), s)
sans_b = lambda s: ImageFont.truetype(os.path.join(FONTS, "Mont700.ttf"), s)

# (photo, début, fin, zoom départ, zoom fin, centre départ, centre fin, titre, sous-titre)
SHOTS = [
    ("04-stand-marche.jpg", 0.0, 4.0, 1.00, 1.12, (0.5, 0.45), (0.5, 0.40),
     None, None),
    ("01-sachets-aperitif.jpg", 3.5, 7.5, 1.18, 1.04, (0.45, 0.35), (0.5, 0.45),
     "À l'apéritif", "Cumin, herbes de Provence,\ncurry doux, emmental"),
    ("02-sachets-sucres.jpg", 7.0, 10.5, 1.04, 1.16, (0.5, 0.55), (0.5, 0.45),
     "Côté sucré", "Citron, cannelle,\npépites de chocolat noir"),
    ("06-coffrets-etal.jpg", 10.0, 13.5, 1.15, 1.03, (0.5, 0.30), (0.5, 0.50),
     "Pickles & coffrets", "Légumes du soleil, aubergines,\ncourgettes au curry"),
    ("03-coffret-noel.jpg", 13.0, 16.5, 1.02, 1.14, (0.5, 0.50), (0.5, 0.42),
     "À offrir", "Coffrets gourmands\npour toutes les fêtes"),
]
END_START = 16.0


def ease(t):
    t = min(max(t, 0.0), 1.0)
    return t * t * (3 - 2 * t)


def cover(img):
    """Redimensionne la photo pour couvrir 1080x1920."""
    s = max(W / img.width, H / img.height)
    return img.resize((round(img.width * s), round(img.height * s)), Image.LANCZOS)


def ken_burns(img, t, z0, z1, c0, c1):
    """Zoom et panoramique sous-pixel (transformation affine, pas de saccade)."""
    k = ease(t)
    z = z0 + (z1 - z0) * k
    cx = (c0[0] + (c1[0] - c0[0]) * k) * img.width
    cy = (c0[1] + (c1[1] - c0[1]) * k) * img.height
    sw, sh = W / z, H / z
    cx = min(max(cx, sw / 2), img.width - sw / 2)
    cy = min(max(cy, sh / 2), img.height - sh / 2)
    a = sw / W
    return img.transform((W, H), Image.AFFINE,
                         (a, 0, cx - sw / 2, 0, a, cy - sh / 2), Image.BICUBIC)


def stitch_band(draw, x, y0, y1, cell=10):
    """Frise en point de croix (zigzag rouge et noir) comme sur les étiquettes."""
    period = 16
    for i, y in enumerate(range(y0, y1, cell)):
        p = i % period
        off = p if p < period // 2 else period - p
        for col, dx in ((INK, 0), (RED, 1), (INK, 2)):
            xx = x + (off + dx) * cell
            draw.rectangle([xx, y, xx + cell - 2, y + cell - 2], fill=col)
        if i % 8 == 4:
            fx = x + (7 - off) * cell + 30
            for ddx, ddy in ((0, -1), (-1, 0), (1, 0), (0, 1), (0, 0)):
                draw.rectangle([fx + ddx * cell, y + ddy * cell,
                                fx + ddx * cell + cell - 2, y + ddy * cell + cell - 2], fill=RED)


def text_center(draw, y, text, font, fill, spacing=12, shadow=True):
    bbox = draw.multiline_textbbox((0, 0), text, font=font, spacing=spacing, align="center")
    x = (W - (bbox[2] - bbox[0])) / 2 - bbox[0]
    if shadow:
        draw.multiline_text((x + 3, y + 4), text, font=font, fill=(0, 0, 0, 150),
                            spacing=spacing, align="center")
    draw.multiline_text((x, y), text, font=font, fill=fill, spacing=spacing, align="center")
    return bbox[3] - bbox[1]


def caption_layer(title, sub, a, slide):
    """Bandeau bas : dégradé sombre, titre manuscrit, sous-titre."""
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    grad = np.zeros((H, W, 4), np.uint8)
    ys = np.clip((np.arange(H) - H * 0.50) / (H * 0.40), 0, 1) ** 1.2
    grad[..., 3] = (ys * 225 * a)[:, None]
    layer = Image.fromarray(grad, "RGBA")
    txt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(txt)
    y = int(1400 + 40 * (1 - slide))
    h = text_center(d, y, title, script_font(140), CREAM + (255,))
    d.rectangle([W / 2 - 60, y + h + 55, W / 2 + 60, y + h + 59], fill=RED + (255,))
    text_center(d, y + h + 85, sub, sans(46), CREAM + (255,), spacing=14)
    txt.putalpha(txt.getchannel("A").point(lambda v: int(v * a)))
    return Image.alpha_composite(layer, txt)


def opening_layer(t):
    """Titre d'ouverture sur le stand du marché."""
    a = ease((t - 0.3) / 0.8) * (1 - ease((t - 3.2) / 0.5))
    layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    if a <= 0:
        return layer
    veil = Image.new("RGBA", (W, H), (20, 18, 30, int(150 * a)))
    layer = Image.alpha_composite(layer, veil)
    txt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(txt)
    lift = 30 * (1 - ease((t - 0.3) / 0.8))
    text_center(d, 640 + lift, "Dulce\nSarat", script_font(260), CREAM + (255,), spacing=-40)
    d.rectangle([W / 2 - 80, 1130 + lift, W / 2 + 80, 1135 + lift], fill=RED + (255,))
    text_center(d, 1170 + lift, "BISCUITS  ·  PICKLES", sans_b(54), CREAM + (255,))
    text_center(d, 1260 + lift, "Faits à la main dans l'Aude", sans(44), CREAM + (255,))
    txt.putalpha(txt.getchannel("A").point(lambda v: int(v * a)))
    return Image.alpha_composite(layer, txt)


def end_card(t):
    """Carton final aux couleurs du dépliant."""
    img = Image.new("RGB", (W, H), SLATE)
    arr = np.asarray(img).astype(np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    vign = 1 - 0.35 * (((xx - W / 2) / W) ** 2 + ((yy - H / 2) / H) ** 2) * 2
    img = Image.fromarray(np.clip(arr * vign[..., None], 0, 255).astype(np.uint8))
    d = ImageDraw.Draw(img, "RGBA")
    reveal = ease(t / 0.9)
    stitch_band(d, 40, 0, int(H * reveal), cell=8)

    txt = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    td = ImageDraw.Draw(txt)
    a1 = ease((t - 0.2) / 0.7)
    a2 = ease((t - 0.8) / 0.7)
    text_center(td, 430, "Dulce\nSarat", script_font(270), (255, 255, 255, int(255 * a1)),
                spacing=-40, shadow=False)
    # Pastille « Fabrication artisanale »
    cx, cy, r = W / 2, 1060, 125
    td.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(236, 214, 200, int(255 * a2)))
    td.ellipse([cx - r + 10, cy - r + 10, cx + r - 10, cy + r - 10],
               outline=(90, 60, 50, int(255 * a2)), width=3)
    for line, dy in (("Fabrication", -28), ("artisanale", 26)):
        f = sans_b(30)
        bw = td.textlength(line, font=f)
        td.text((cx - bw / 2, cy + dy - 20), line, font=f, fill=(70, 45, 38, int(255 * a2)))
    a3 = ease((t - 1.3) / 0.7)
    text_center(td, 1270, "Marchés, salons et commandes", sans(42),
                (255, 255, 255, int(255 * a3)), shadow=False)
    text_center(td, 1400, "www.dulce-sarat.fr", sans_b(64),
                (255, 255, 255, int(255 * a3)), shadow=False)
    text_center(td, 1500, "06 15 79 31 67", sans_b(58),
                (255, 255, 255, int(255 * a3)), shadow=False)
    text_center(td, 1620, "Le Bousquet (11140)", sans(40),
                (235, 230, 240, int(230 * a3)), shadow=False)
    return Image.alpha_composite(img.convert("RGBA"), txt).convert("RGB")


def render_frame(i, cache):
    t = i / FPS
    frame = None
    for photo, s, e, z0, z1, c0, c1, title, sub in SHOTS:
        if not (s <= t < e):
            continue
        local = (t - s) / (e - s)
        img = ken_burns(cache[photo], local, z0, z1, c0, c1).convert("RGBA")
        if title:
            a = ease((t - s - 0.35) / 0.5) * (1 - ease((t - e + 0.55) / 0.4))
            if a > 0:
                img = Image.alpha_composite(img, caption_layer(title, sub, a, ease((t - s - 0.35) / 0.6)))
        else:
            img = Image.alpha_composite(img, opening_layer(t))
        fade_in = 1.0 if s == 0 else ease((t - s) / XFADE)
        if frame is None or fade_in >= 1:
            frame = img if frame is None else Image.blend(frame, img, fade_in)
        else:
            frame = Image.blend(frame, img, fade_in)
    if t >= END_START:
        card = end_card(t - END_START).convert("RGBA")
        k = ease((t - END_START) / 0.6)
        frame = card if frame is None else Image.blend(frame, card, k)
    return frame.convert("RGB")


# ---------- Musique : boucle douce synthétisée (pas de droits à gérer) ----------
def make_music(path, sr=44100):
    bpm = 96
    beat = 60 / bpm
    n = int(sr * (DUR + 0.5))
    out = np.zeros(n)
    note = lambda m: 440 * 2 ** ((m - 69) / 12)

    def pluck(freq, start, length, amp):
        # Karplus-Strong : son de guitare / harpe pincée
        i0 = int(start * sr)
        L = int(length * sr)
        if i0 >= n:
            return
        p = int(sr / freq)
        buf = np.random.uniform(-1, 1, p)
        y = np.zeros(L)
        for k in range(L):
            y[k] = buf[k % p]
            buf[k % p] = 0.996 * 0.5 * (buf[k % p] + buf[(k + 1) % p])
        seg = y[: min(L, n - i0)] * amp
        out[i0:i0 + len(seg)] += seg

    # Do - La m - Fa - Sol, arpèges
    chords = [(60, 64, 67, 72), (57, 60, 64, 69), (53, 57, 60, 65), (55, 59, 62, 67)]
    pattern = [0, 1, 2, 3, 2, 1, 2, 3]
    t = 0.0
    bar = 0
    while t < DUR:
        ch = chords[bar % 4]
        pluck(note(ch[0] - 12), t, 2.2, 0.35)
        for j, idx in enumerate(pattern):
            pluck(note(ch[idx] + 12), t + j * beat / 2, 1.2, 0.18)
        t += 4 * beat
        bar += 1
    # Légère « pad » chaude
    tt = np.arange(n) / sr
    for m in (48, 55, 64):
        out += 0.03 * np.sin(2 * math.pi * note(m) * tt) * (0.6 + 0.4 * np.sin(2 * math.pi * 0.1 * tt))
    # Fondus
    env = np.ones(n)
    fi, fo = int(0.8 * sr), int(2.5 * sr)
    env[:fi] = np.linspace(0, 1, fi)
    end = int(DUR * sr)
    env[end - fo:end] = np.linspace(1, 0, fo)
    env[end:] = 0
    out *= env
    out = out / np.max(np.abs(out)) * 0.8
    # Petite réverbération par échos
    rev = out.copy()
    for d, g in ((0.089, 0.25), (0.137, 0.18), (0.211, 0.12)):
        k = int(d * sr)
        rev[k:] += g * out[:-k]
    rev = rev / np.max(np.abs(rev)) * 0.7
    st = np.stack([rev, np.roll(rev, 90)], 1)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((st * 32767).astype(np.int16).tobytes())


def main():
    cache = {}
    for s in SHOTS:
        im = cover(Image.open(os.path.join(PHOTOS, s[0])).convert("RGB"))
        cache[s[0]] = im.filter(ImageFilter.UnsharpMask(radius=2, percent=60, threshold=2))
    audio = os.path.join(HERE, "_music.wav")
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
