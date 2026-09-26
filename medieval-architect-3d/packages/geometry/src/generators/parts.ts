import type { Manifold } from "manifold-3d";
import { archOpening, type ArchProfile, type Scope, type Vec2 } from "../kernel.js";
import type { OpeningCut } from "../generator.js";

/**
 * Pièces communes aux générateurs : couronnement crénelé, toitures, ouvertures.
 * Dimensions usuelles (mm), tirées des ordres de grandeur courants :
 * parapet ~1 m au-dessus du chemin de ronde, merlons ~1,5 m, créneaux ~0,9 m.
 */
export const CRENEL = { parapet: 1000, merlonHeight: 1600, merlonWidth: 1400, gap: 900 };

/** Épaisseur du parapet pour un mur d'épaisseur t : laisse toujours un chemin de ronde. */
export function parapetThickness(t: number): number {
  return Math.max(100, Math.min(600, t / 2 - 50));
}

/** Parapet crénelé le long de X (0 → L), côté extérieur (−Y) d'un mur d'épaisseur t, posé en z = h. */
export function wallCrenellation(k: Scope, L: number, t: number, h: number): Manifold {
  const pt = parapetThickness(t);
  const y0 = -t / 2;
  const parts = [k.box([L, pt, CRENEL.parapet], [0, y0, h])];
  const step = CRENEL.merlonWidth + CRENEL.gap;
  const n = Math.max(1, Math.floor((L + CRENEL.gap) / step));
  const used = n * step - CRENEL.gap;
  const x0 = (L - used) / 2;
  for (let i = 0; i < n; i++) {
    parts.push(k.box([CRENEL.merlonWidth, pt, CRENEL.merlonHeight], [x0 + i * step, y0, h + CRENEL.parapet]));
  }
  return k.union(parts);
}

/** Couronne crénelée circulaire de rayon extérieur r, posée en z = h. */
export function ringCrenellation(k: Scope, r: number, t: number, h: number, segments: number): Manifold {
  const pt = parapetThickness(t);
  const H = CRENEL.parapet + CRENEL.merlonHeight;
  const ring = k.difference(k.cylinder(H, r, r, segments, [0, 0, h]), [k.cylinder(H + 2, r - pt, r - pt, segments, [0, 0, h - 1])]);
  const n = Math.max(4, Math.round((2 * Math.PI * r) / (CRENEL.merlonWidth + CRENEL.gap)));
  const cuts: Manifold[] = [];
  for (let i = 0; i < n; i++) {
    const slot = k.box([r + 200, CRENEL.gap, CRENEL.merlonHeight + 10], [0, -CRENEL.gap / 2, h + CRENEL.parapet]);
    cuts.push(k.rotate(slot, [0, 0, (360 * (i + 0.5)) / n]));
  }
  return k.difference(ring, cuts);
}

/** Couronne crénelée carrée (côtés wx × wy, centrée), posée en z = h. */
export function squareCrenellation(k: Scope, wx: number, wy: number, t: number, h: number): Manifold {
  const pt = parapetThickness(t);
  const H = CRENEL.parapet + CRENEL.merlonHeight;
  const ring = k.difference(k.cbox(wx, wy, H, [0, 0, h]), [k.cbox(wx - 2 * pt, wy - 2 * pt, H + 2, [0, 0, h - 1])]);
  const cuts: Manifold[] = [];
  const step = CRENEL.merlonWidth + CRENEL.gap;
  for (const [len, other, horizontal] of [[wx, wy, true], [wy, wx, false]] as const) {
    const n = Math.max(1, Math.floor((len - CRENEL.merlonWidth) / step));
    for (let i = 0; i < n; i++) {
      const c = -len / 2 + CRENEL.merlonWidth + CRENEL.gap / 2 + i * step;
      if (c + CRENEL.gap / 2 > len / 2 - CRENEL.merlonWidth / 2) break;
      const z = h + CRENEL.parapet;
      if (horizontal) cuts.push(k.cbox(CRENEL.gap, other + 200, CRENEL.merlonHeight + 10, [c, 0, z]));
      else cuts.push(k.cbox(other + 200, CRENEL.gap, CRENEL.merlonHeight + 10, [0, c, z]));
    }
  }
  return k.difference(ring, cuts);
}

/**
 * Toit à deux pans le long de X, de x0 à x0 + L, sur une largeur w (centrée en Y),
 * égout en z = h, débord `eave`, pente `pitchDeg`. Étiqueté « toit ».
 */
export function gableRoof(k: Scope, L: number, w: number, h: number, pitchDeg = 45, eave = 400, x0 = 0): Manifold {
  const half = w / 2 + eave;
  const rise = half * Math.tan((pitchDeg * Math.PI) / 180);
  const profile: Vec2[] = [[-half, h], [half, h], [0, h + rise]];
  return k.tag(k.extrudeX(profile, L + 2 * eave, x0 - eave), "roof");
}

/** Toit en appentis (un seul pan) le long de X, montant de y = yLow vers y = yHigh. */
export function leanToRoof(k: Scope, L: number, yLow: number, yHigh: number, zLow: number, zHigh: number, x0 = 0): Manifold {
  const th = 300;
  const profile: Vec2[] = [[yLow, zLow], [yHigh, zHigh], [yHigh, zHigh + th], [yLow, zLow + th]];
  return k.tag(k.extrudeX(profile, L, x0), "roof");
}

/** Toit pyramidal sur un plan wx × wy centré, base en z = h. `ratio` = hauteur / plus grand côté. */
export function pyramidRoof(k: Scope, wx: number, wy: number, h: number, ratio: number, eave = 300): Manifold {
  const hx = wx / 2 + eave, hy = wy / 2 + eave;
  const base: Vec2[] = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
  const s = k.extrude(base, Math.max(wx, wy) * ratio, 0);
  return k.tag(k.translate(s, [0, 0, h]), "roof");
}

/** Toit conique sur un cercle de rayon r, base en z = h. */
export function coneRoof(k: Scope, r: number, h: number, height: number, segments: number, eave = 300): Manifold {
  return k.tag(k.cylinder(height, r + eave, 0, segments, [0, 0, h]), "roof");
}

export type OpeningKind = "none" | "door" | "window" | "arrow_slit";

/** Gabarits d'ouvertures par type, rapportés à la hauteur du mur. */
export function openingTemplate(kind: OpeningKind, wallHeight: number): Omit<OpeningCut, "at"> | null {
  switch (kind) {
    case "door":
      return { shape: "round_arch", width: 1600, height: 3000, sill: 0 };
    case "window":
      return { shape: "round_arch", width: 1000, height: 1800, sill: Math.round(wallHeight * 0.5) };
    case "arrow_slit":
      return { shape: "slit", width: 150, height: 1600, sill: Math.max(1200, Math.round(wallHeight * 0.35)) };
    default:
      return null;
  }
}

/** Solide à soustraire pour une ouverture traversant un mur orienté selon X, épaisseur centrée sur Y = 0. */
export function throughOpeningX(k: Scope, o: OpeningCut, depth: number, profile: ArchProfile = "round"): Manifold {
  const through = depth + 400;
  if (o.shape === "round_arch") {
    const outline = archOpening(o.width, o.height, profile, 12).map(([u, v]) => [u, v] as Vec2);
    // Contour dans le plan (x, z), extrudé selon Y : on extrude selon Z puis on couche.
    const s = k.extrude(outline, through);
    return k.translate(k.rotate(s, [90, 0, 0]), [o.at, through / 2, o.sill]);
  }
  return k.box([o.width, through, o.height], [o.at - o.width / 2, -through / 2, o.sill]);
}
