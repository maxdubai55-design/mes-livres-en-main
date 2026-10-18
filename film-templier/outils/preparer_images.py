#!/usr/bin/env python3
"""Prépare chaque image pour la caméra virtuelle.

1. Upscale x4 (Real-ESRGAN « general-x4v3 », sur CPU) : 1122x1402 -> 4488x5608.
2. Détourage du chevalier (isnet-general-use) : sert à séparer deux plans.
3. Fond reconstitué : la bande d'un bord du personnage est repeinte avec le décor
   voisin, pour que le personnage puisse glisser légèrement sur le décor sans trou.

Sorties dans <travail>/hd/ : NN_hd.png, NN_mask.png, NN_plate.png
"""
import argparse
import glob
import os
import time

import cv2
import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F


class SRVGGNetCompact(nn.Module):
    def __init__(self, num_feat=64, num_conv=32, upscale=4):
        super().__init__()
        self.upscale = upscale
        body = [nn.Conv2d(3, num_feat, 3, 1, 1), nn.PReLU(num_feat)]
        for _ in range(num_conv):
            body += [nn.Conv2d(num_feat, num_feat, 3, 1, 1), nn.PReLU(num_feat)]
        body.append(nn.Conv2d(num_feat, 3 * upscale * upscale, 3, 1, 1))
        self.body = nn.ModuleList(body)
        self.up = nn.PixelShuffle(upscale)

    def forward(self, x):
        out = x
        for layer in self.body:
            out = layer(out)
        out = self.up(out)
        return out + F.interpolate(x, scale_factor=self.upscale, mode="nearest")


def upscale4(rgb, model, tile=240, pad=16):
    x = torch.from_numpy(rgb).permute(2, 0, 1).float().div(255)[None]
    _, _, H, W = x.shape
    out = torch.zeros(1, 3, H * 4, W * 4)
    for ty in range(0, H, tile):
        for tx in range(0, W, tile):
            y0, y1 = max(ty - pad, 0), min(ty + tile + pad, H)
            x0, x1 = max(tx - pad, 0), min(tx + tile + pad, W)
            with torch.no_grad():
                o = model(x[:, :, y0:y1, x0:x1])
            h, w = min(tile, H - ty), min(tile, W - tx)
            oy, ox = (ty - y0) * 4, (tx - x0) * 4
            out[:, :, ty * 4:(ty + h) * 4, tx * 4:(tx + w) * 4] = o[:, :, oy:oy + h * 4, ox:ox + w * 4]
    return (out[0].permute(1, 2, 0).clamp(0, 1).numpy() * 255 + 0.5).astype(np.uint8)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    root = os.path.dirname(here)
    ap = argparse.ArgumentParser()
    ap.add_argument("--sources", default=os.path.join(root, "sources"))
    ap.add_argument("--travail", default=os.path.join(root, "travail"))
    ap.add_argument("--seulement", help="préfixe de fichier, ex. 03")
    args = ap.parse_args()

    models = os.path.join(args.travail, "modeles")
    os.environ["U2NET_HOME"] = os.path.join(models, "rembg")
    from rembg import new_session, remove

    out = os.path.join(args.travail, "hd")
    os.makedirs(out, exist_ok=True)
    net = SRVGGNetCompact()
    sd = torch.load(os.path.join(models, "realesr-general-x4v3.pth"), map_location="cpu")
    net.load_state_dict(sd["params"], strict=True)
    net.eval()
    torch.set_num_threads(os.cpu_count() or 4)
    session = new_session("isnet-general-use")

    for path in sorted(glob.glob(os.path.join(args.sources, "*.png"))):
        name = os.path.basename(path)[:2]
        if args.seulement and name != args.seulement:
            continue
        t0 = time.time()
        bgr = cv2.imread(path)
        rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
        hd = upscale4(rgb, net)
        cv2.imwrite(os.path.join(out, f"{name}_hd.png"), cv2.cvtColor(hd, cv2.COLOR_RGB2BGR))

        from PIL import Image
        mask = np.array(remove(Image.fromarray(rgb), session=session, only_mask=True))
        mask = cv2.GaussianBlur(mask, (0, 0), 1.2)
        cv2.imwrite(os.path.join(out, f"{name}_mask.png"), mask)

        # bande intérieure au contour (36 px) repeinte avec le décor voisin
        solid = (mask > 128).astype(np.uint8)
        core = cv2.erode(solid, np.ones((3, 3), np.uint8), iterations=36)
        band = cv2.dilate(solid - core, np.ones((3, 3), np.uint8), iterations=2)
        outside = cv2.dilate(solid, np.ones((3, 3), np.uint8), iterations=8)
        hole = (outside > 0) & (core == 0)
        plate = cv2.inpaint(bgr, (hole * 255).astype(np.uint8), 7, cv2.INPAINT_TELEA)
        plate_hd = cv2.resize(plate, None, fx=4, fy=4, interpolation=cv2.INTER_CUBIC).astype(np.float32)
        hole_hd = cv2.resize(hole.astype(np.float32), None, fx=4, fy=4, interpolation=cv2.INTER_LINEAR)
        hole_hd = cv2.GaussianBlur(hole_hd, (0, 0), 6)[..., None]
        hd_bgr = cv2.cvtColor(hd, cv2.COLOR_RGB2BGR).astype(np.float32)
        # fond net partout, sauf dans la bande repeinte
        plate_hd = (hd_bgr * (1 - hole_hd) + plate_hd * hole_hd).astype(np.uint8)
        cv2.imwrite(os.path.join(out, f"{name}_plate.png"), plate_hd)
        print(f"{name}: {time.time() - t0:.0f}s", flush=True)


if __name__ == "__main__":
    main()
