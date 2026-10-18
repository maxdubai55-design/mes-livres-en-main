#!/usr/bin/env python3
"""Rendu du film : caméra virtuelle sur six images, bandes scope 2,39:1, 4K 24 i/s.

Chaque plan est une trajectoire de fenêtre (centre x, centre y, largeur) dans l'image source,
avec secousses à main levée calées sur les impacts sonores. Le chevalier est détouré : le décor
bouge un peu moins que lui quand la caméra avance, ce qui donne de la profondeur.

  python3 rendu.py --t 3,12.2,16      # images fixes de contrôle (demi-résolution)
  python3 rendu.py --film             # film complet
"""
import argparse
import json
import math
import multiprocessing as mp
import os
import subprocess

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy.interpolate import PchipInterpolator

FPS = 24
DUR = 30.0
W4K, H4K = 3840, 2160
SCOPE = 2.39
SRC_W, SRC_H = 1122, 1402

# t en secondes ; clés = (t, centre x, centre y, largeur de fenêtre) en pixels de l'image source.
# La hauteur de fenêtre vaut largeur / 2,39. par : part de profondeur entre chevalier et décor.
SHOTS = [
    dict(img="01", t_in=0.0, par=0.45, flick=0.025, hand=(0.8, 0.05), kicks=[(4.1, 2.0)],
         keys=[(0.0, 561, 1135, 1122), (1.4, 561, 1100, 1090), (3.3, 575, 700, 930), (5.4, 585, 405, 800)]),
    dict(img="02", t_in=4.7, par=0.40, flick=0.0, hand=(1.0, 0.07), bob=2.5,
         keys=[(4.7, 330, 870, 640), (6.0, 340, 840, 650), (8.0, 480, 560, 780), (9.2, 590, 400, 810), (10.3, 600, 345, 820)]),
    dict(img="03", t_in=9.7, par=0.50, flick=0.03, hand=(0.6, 0.04),
         kicks=[(11.97, 2.5), (12.5, 14.0), (14.2, 3.0), (14.5, 3.0)], hand_after=(12.5, 2.4, 0.18),
         keys=[(9.7, 561, 252, 1122), (10.8, 566, 300, 1090), (11.7, 585, 535, 700), (12.5, 585, 535, 690),
               (12.65, 575, 470, 960), (13.4, 560, 470, 1010), (15.0, 470, 400, 1070)]),
    dict(img="04", t_in=15.0, par=0.35, flick=0.035, hand=(2.6, 0.22),
         kicks=[(15.0, 12.0), (16.0, 7.0), (17.0, 12.0), (18.0, 8.0), (18.2, 7.0), (19.2, 12.0)],
         keys=[(15.0, 380, 330, 700), (16.3, 420, 380, 740), (17.2, 540, 385, 760), (18.2, 540, 420, 780),
               (19.2, 500, 900, 900), (20.0, 480, 1080, 900)]),
    dict(img="05", t_in=20.0, par=0.4, flick=0.03, hand=(0.4, 0.02), kicks=[(20.9, 1.5)],
         keys=[(20.0, 561, 300, 1122), (21.8, 560, 372, 900), (23.2, 565, 395, 880), (24.5, 720, 870, 760), (25.6, 790, 1010, 620)]),
    dict(img="06", t_in=24.6, par=0.25, flick=0.03, hand=(0.5, 0.03), kicks=[(28.75, 3.0)],
         keys=[(24.6, 358, 330, 700), (26.5, 440, 385, 880), (28.8, 561, 520, 1122), (30.0, 561, 535, 1122)]),
]
# (instant, durée de fondu) ; None = coupe franche
TRANSITIONS = [(5.0, 0.6), (10.0, 0.5), (15.0, None), (20.0, None), (25.0, 0.8)]
FLASHES = [(12.5, 0.38), (15.0, 0.55), (28.75, 0.14)]


def smoothstep(x):
    x = min(1.0, max(0.0, x))
    return x * x * (3 - 2 * x)


class Film:
    def __init__(self, travail, scale):
        self.travail = travail
        self.scale = scale
        self.OW, self.OH = int(W4K * scale), int(round(W4K * scale / SCOPE / 2) * 2)
        self.CW, self.CH = int(W4K * scale), int(H4K * scale)
        self.bar = (self.CH - self.OH) // 2
        self.cache = {}
        self.paths = [self._make_path(s) for s in SHOTS]
        self.build_look()
        with open(os.path.join(travail, "audio", "timing.json"), encoding="utf-8") as f:
            self.timing = json.load(f)
        self.build_subtitles()

    # ---------------------------------------------------------------- caméra
    @staticmethod
    def _make_path(shot):
        k = np.array(shot["keys"], dtype=float)
        return (PchipInterpolator(k[:, 0], k[:, 1]), PchipInterpolator(k[:, 0], k[:, 2]),
                PchipInterpolator(k[:, 0], np.log(k[:, 3])), k[0, 0], k[-1, 0])

    def window(self, i, t):
        shot = SHOTS[i]
        fx, fy, fw, t0, t1 = self.paths[i]
        tc = min(max(t, t0), t1)
        cx, cy, w = float(fx(tc)), float(fy(tc)), float(math.exp(fw(tc)))
        # secousses : somme de sinus incommensurables + coups synchronisés sur les impacts
        a, rot_a = shot["hand"]
        if "hand_after" in shot and t >= shot["hand_after"][0]:
            a, rot_a = shot["hand_after"][1], shot["hand_after"][2]
        ph = i * 1.7
        dx = a * (0.6 * math.sin(2 * math.pi * 1.3 * t + ph) + 0.3 * math.sin(2 * math.pi * 3.1 * t + 2 * ph) +
                  0.1 * math.sin(2 * math.pi * 6.7 * t + 3 * ph))
        dy = a * (0.6 * math.sin(2 * math.pi * 1.1 * t + 1 + ph) + 0.3 * math.sin(2 * math.pi * 2.9 * t + 2 + ph) +
                  0.1 * math.sin(2 * math.pi * 7.3 * t + ph))
        rot = rot_a * math.sin(2 * math.pi * 0.9 * t + ph) + 0.4 * rot_a * math.sin(2 * math.pi * 2.3 * t)
        if "bob" in shot:
            dy += shot["bob"] * math.sin(2 * math.pi * 1.7 * t)
            dx += 0.4 * shot["bob"] * math.sin(2 * math.pi * 0.85 * t)
        for tk, amp in shot.get("kicks", []):
            if t >= tk:
                e = math.exp(-(t - tk) / 0.13)
                dx += amp * e * math.cos(2 * math.pi * 8.5 * (t - tk))
                dy += 0.8 * amp * e * math.sin(2 * math.pi * 8.5 * (t - tk) + 0.6)
        return cx + dx, cy + dy, w, rot

    def affine(self, cx, cy, w, rot):
        h = w / SCOPE
        cx = min(max(cx, w / 2 + 6), SRC_W - w / 2 - 6)
        cy = min(max(cy, h / 2 + 6), SRC_H - h / 2 - 6)
        s = self.OW / (w * 4.0)
        th = math.radians(rot)
        A = np.array([[math.cos(th) * s, -math.sin(th) * s], [math.sin(th) * s, math.cos(th) * s]])
        tr = np.array([self.OW / 2, self.OH / 2]) - A @ np.array([cx * 4, cy * 4])
        return np.hstack([A, tr[:, None]])

    # ---------------------------------------------------------------- images
    def load(self, i):
        if i not in self.cache:
            if len(self.cache) >= 2:
                self.cache.pop(next(iter(self.cache)))
            n = SHOTS[i]["img"]
            d = os.path.join(self.travail, "hd")
            hd = cv2.imread(os.path.join(d, f"{n}_hd.png"))
            plate = cv2.imread(os.path.join(d, f"{n}_plate.png"))
            mask = cv2.imread(os.path.join(d, f"{n}_mask.png"), 0)
            mask = cv2.resize(mask, (hd.shape[1], hd.shape[0]), interpolation=cv2.INTER_LINEAR)
            self.cache[i] = (hd, plate, mask)
        return self.cache[i]

    def shot_pic(self, i, t):
        hd, plate, mask = self.load(i)
        cx, cy, w, rot = self.window(i, t)
        flags = cv2.INTER_CUBIC
        Mf = self.affine(cx, cy, w, rot)
        fg = cv2.warpAffine(hd, Mf, (self.OW, self.OH), flags=flags, borderMode=cv2.BORDER_REFLECT)
        par = SHOTS[i]["par"]
        if par <= 0:
            return fg
        w_ref = max(k[3] for k in SHOTS[i]["keys"])
        s, s_ref = self.OW / w, self.OW / w_ref
        s_bg = s_ref * (s / s_ref) ** (1 - par)
        Mb = self.affine(cx, cy, self.OW / s_bg, rot)
        bg = cv2.warpAffine(plate, Mb, (self.OW, self.OH), flags=flags, borderMode=cv2.BORDER_REFLECT)
        a = cv2.warpAffine(mask, Mf, (self.OW, self.OH), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
        a3 = cv2.merge([a, a, a])
        return cv2.add(cv2.multiply(fg, a3, scale=1 / 255), cv2.multiply(bg, 255 - a3, scale=1 / 255))

    # ---------------------------------------------------------------- étalonnage
    def build_look(self):
        x = np.linspace(0, 1, 256)
        y = 0.72 * x + 0.28 * (x * x * (3 - 2 * x))
        y = 0.012 + 0.985 * y
        r = np.clip(y * 1.012, 0, 1)
        g = np.clip(y * 1.0, 0, 1)
        b = np.clip(y * 0.985 + 0.012 * (1 - y), 0, 1)
        self.lut = np.stack([b, g, r], axis=1)[:, None, :]  # ordre BGR
        self.lut = (self.lut * 255 + 0.5).astype(np.uint8)
        yy, xx = np.mgrid[0:self.OH, 0:self.OW].astype(np.float32)
        r2 = ((xx - self.OW / 2) / (self.OW / 2)) ** 2 + ((yy - self.OH / 2) / (self.OH / 2)) ** 2
        v = 1 - 0.30 * np.clip(r2 / 2, 0, 1) ** 1.1
        self.vig = cv2.merge([(v * 255).astype(np.uint8)] * 3)
        rng = np.random.default_rng(24)
        self.grain = []
        for _ in range(8):
            n = rng.normal(0, 2.6, (self.OH // 2, self.OW // 2)).astype(np.float32)
            n = cv2.resize(cv2.GaussianBlur(n, (0, 0), 0.6), (self.OW, self.OH), interpolation=cv2.INTER_LINEAR)
            pos, neg = np.clip(n, 0, 255).astype(np.uint8), np.clip(-n, 0, 255).astype(np.uint8)
            self.grain.append((cv2.merge([pos] * 3), cv2.merge([neg] * 3)))

    def grade(self, pic, k):
        pic = cv2.LUT(pic, self.lut)
        small = cv2.resize(pic, (self.OW // 16, self.OH // 16), interpolation=cv2.INTER_AREA)
        hi = cv2.subtract(small, 195)
        hi = cv2.GaussianBlur(hi, (0, 0), 2.2)
        hi = cv2.resize(hi, (self.OW, self.OH), interpolation=cv2.INTER_LINEAR)
        pic = cv2.addWeighted(pic, 1.0, hi, 1.1, 0)  # halo des flammes et des bougies
        pic = cv2.multiply(pic, self.vig, scale=1 / 255)
        gp, gn = self.grain[k % 8]
        return cv2.subtract(cv2.add(pic, gp), gn)

    # ---------------------------------------------------------------- sous-titres
    def build_subtitles(self):
        sc = self.scale
        f_norm = ImageFont.truetype("/usr/share/fonts/truetype/liberation/LiberationSerif-Italic.ttf", int(84 * sc))
        f_cry = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", int(150 * sc))
        self.subs = []
        for L in self.timing["lignes"]:
            self.subs.append((L["debut"] - 0.12, L["fin"] + 0.35, self.text_strip(L["texte"], f_norm, (232, 226, 214))))
        c = self.timing["cri"]
        self.subs.append((c["debut"] + 0.05, 14.1, self.text_strip("À L'ASSAUT !", f_cry, (240, 236, 228))))

    def text_strip(self, text, font, color):
        img = Image.new("RGB", (self.CW, self.bar), (0, 0, 0))
        d = ImageDraw.Draw(img)
        l, t, r, b = d.textbbox((0, 0), text, font=font)
        d.text(((self.CW - (r - l)) // 2 - l, (self.bar - (b - t)) // 2 - t), text, font=font, fill=color)
        return cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

    # ---------------------------------------------------------------- image finale
    def luminance(self, t):
        g = smoothstep(t / 0.9)  # ouverture au noir
        if 19.6 <= t < 20.0:
            g = min(g, 1 - smoothstep((t - 19.6) / 0.4))
        elif 20.0 <= t < 20.7:
            g = min(g, smoothstep((t - 20.0) / 0.7))
        if t >= 29.2:
            g = min(g, 1 - smoothstep((t - 29.2) / 0.8))
        return g

    def frame(self, n):
        t = n / FPS
        k = n
        # quel plan ? fondu autour des transitions
        idx = 0
        for tt, _ in TRANSITIONS:
            if t >= tt:
                idx += 1
        blend = None
        for j, (tt, d) in enumerate(TRANSITIONS):
            if d and tt - d / 2 <= t < tt + d / 2:
                blend = (j, smoothstep((t - (tt - d / 2)) / d))
                idx = j
        pic = self.shot_pic(idx, t)
        if blend:
            nxt = self.shot_pic(idx + 1, t)
            pic = cv2.addWeighted(pic, 1 - blend[1], nxt, blend[1], 0)
        pic = self.grade(pic, k)
        fl = 0.0
        shot_i = idx + 1 if blend and blend[1] > 0.5 else idx
        flick = SHOTS[shot_i]["flick"]
        if flick:
            fl = flick * (math.sin(2 * math.pi * 7.3 * t + 1) * 0.5 + math.sin(2 * math.pi * 12.9 * t + 4) * 0.3 +
                          math.sin(2 * math.pi * 3.1 * t) * 0.2)
        pic = cv2.convertScaleAbs(pic, alpha=max(0.0, self.luminance(t) * (1 + fl)))
        for tf, amp in FLASHES:
            if t >= tf:
                f = amp * math.exp(-(t - tf) / 0.07)
                if f > 0.01:
                    pic = cv2.add(pic, (int(255 * f),) * 3)
        canvas = np.zeros((self.CH, self.CW, 3), np.uint8)
        canvas[self.bar:self.bar + self.OH] = pic
        for t0, t1, strip in self.subs:
            if t0 <= t <= t1:
                a = min(1.0, (t - t0) / 0.2, (t1 - t) / 0.3)
                bot = canvas[self.CH - self.bar:]
                canvas[self.CH - self.bar:] = cv2.addWeighted(bot, 1.0, strip, max(0.0, a) * 0.92, 0)
        return canvas


# ---------------------------------------------------------------- multi-processus
_film = None


def _init(travail, scale):
    global _film
    cv2.setNumThreads(1)
    _film = Film(travail, scale)


def _render(n):
    return _film.frame(n).tobytes()


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    ap = argparse.ArgumentParser()
    ap.add_argument("--travail", default=os.path.join(root, "travail"))
    ap.add_argument("--t", help="instants à contrôler, ex. 3,12.2,16")
    ap.add_argument("--scale", type=float, default=0.5)
    ap.add_argument("--film", action="store_true")
    ap.add_argument("--sortie", default=os.path.join(root, "sortie", "film_4k.mp4"))
    ap.add_argument("--crf", type=int, default=20)
    ap.add_argument("--audio", default=None)
    ap.add_argument("--procs", type=int, default=4)
    a = ap.parse_args()

    if a.t:
        film = Film(a.travail, a.scale)
        for ts in a.t.split(","):
            t = float(ts)
            img = film.frame(int(round(t * FPS)))
            p = os.path.join(a.travail, f"controle_{t:06.2f}.png")
            cv2.imwrite(p, img)
            print(p)
        return

    if a.film:
        audio = a.audio or os.path.join(a.travail, "audio", "mix.wav")
        os.makedirs(os.path.dirname(a.sortie), exist_ok=True)
        n_frames = int(DUR * FPS)
        film_scale = 1.0
        enc = subprocess.Popen([
            "ffmpeg", "-y", "-v", "error", "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{W4K}x{H4K}",
            "-r", str(FPS), "-i", "-", "-i", audio,
            "-vf", "scale=out_color_matrix=bt709:out_range=tv", "-c:v", "libx264", "-preset", "slow", "-crf", str(a.crf), "-maxrate", "40M", "-bufsize", "80M",
            "-pix_fmt", "yuv420p", "-profile:v", "high", "-color_primaries", "bt709", "-color_trc", "bt709",
            "-colorspace", "bt709", "-movflags", "+faststart",
            "-c:a", "aac", "-b:a", "256k", "-t", str(DUR), a.sortie], stdin=subprocess.PIPE)
        with mp.Pool(a.procs, initializer=_init, initargs=(a.travail, film_scale)) as pool:
            batch = a.procs * 2
            for s in range(0, n_frames, batch):
                for buf in pool.map(_render, range(s, min(n_frames, s + batch))):
                    enc.stdin.write(buf)
                print(f"{min(n_frames, s + batch)}/{n_frames}", flush=True)
        enc.stdin.close()
        enc.wait()
        print("OK ->", a.sortie)


if __name__ == "__main__":
    main()
