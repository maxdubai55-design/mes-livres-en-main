import type { Manifold } from "manifold-3d";
import type { ResolvedConnector } from "@ma3d/core";
import { archOpening, type Vec2 } from "../kernel.js";
import { bool, connector, num, segmentsFor, str, type Generator } from "../generator.js";
import { GROUND_SLAB } from "./tower.js";
import { gableRoof, openingTemplate, throughOpeningX, wallCrenellation } from "./parts.js";

/**
 * Porte fortifiée (châtelet). Corps rectangulaire largeur × profondeur, centré en X,
 * face extérieure côté −Y, passage voûté traversant selon Y, deux tours semi-circulaires
 * en option sur la face extérieure. Les courtines s'accrochent sur les flancs ±X.
 */
export const gatehouse: Generator = {
  id: "gen.gate",
  version: 1,
  construct(k, { params, quality }) {
    const w = num(params, "width");
    const d = num(params, "depth");
    const h = num(params, "height");
    const pw = num(params, "passageWidth");
    const ph = num(params, "passageHeight");
    const parts: Manifold[] = [k.cbox(w, d, h)];
    if (bool(params, "crenellated")) {
      // crénelage sur la façade extérieure : mur fictif le long de X, épaisseur d
      parts.push(k.translate(wallCrenellation(k, w, d, h), [-w / 2, 0, 0]));
    }
    if (bool(params, "flankingTowers")) {
      const r = Math.min(w * 0.22, d * 0.6);
      const seg = segmentsFor(2 * r, quality);
      for (const sx of [-1, 1]) {
        const cx = sx * (w / 2 - r);
        const tower = k.cylinder(h + 1500, r, r, seg, [cx, -d / 2, 0]);
        // on ne garde que la moitié qui déborde vers l'extérieur
        parts.push(k.intersect(tower, k.box([2 * r + 2, r + 2, h + 1502], [cx - r - 1, -d / 2 - r - 1, -1])));
      }
    }
    const passage = k.translate(
      k.rotate(k.extrude(archOpening(pw, ph, "round", 16), d + 4000), [90, 0, 0]),
      [0, (d + 4000) / 2, 0],
    );
    const solid = k.difference(k.union(parts), [passage]);
    return {
      solid,
      connectors: [
        connector("flank[0]", "tower.flank", "neutral", [w / 2, 0, h / 2], [1, 0, 0], d),
        connector("flank[2]", "tower.flank", "neutral", [-w / 2, 0, h / 2], [-1, 0, 0], d),
        connector("top", "tower.top", "carries", [0, 0, h], [0, 0, 1], d),
        connector("base", "foundation", "is_carried", [0, 0, 0], [0, 0, -1], w),
      ],
    };
  },
};

/**
 * Bâtiment rectangulaire à toit à deux pans : logis, grande salle, écuries.
 * Le long de X (0 → longueur), largeur centrée en Y. Fenêtres réparties sur la face +Y (côté cour).
 */
export const hall: Generator = {
  id: "gen.building.hall",
  version: 2,
  construct(k, { params }) {
    const L = num(params, "length");
    const w = num(params, "width");
    const h = num(params, "height");
    const t = num(params, "wallThickness");
    const windows = num(params, "windows", 0);
    const parts: Manifold[] = [k.box([L, w, h], [0, -w / 2, 0])];
    if (str(params, "roof", "gable") === "gable") parts.push(gableRoof(k, L, w, h, 50, 400));
    // Murs trop épais pour la taille du bâtiment : bloc plein plutôt qu'une géométrie dégénérée.
    const hollow = L - 2 * t >= 800 && w - 2 * t >= 800 && h - GROUND_SLAB >= 800;
    const cutters: Manifold[] = hollow ? [k.box([L - 2 * t, w - 2 * t, h - GROUND_SLAB], [t, -w / 2 + t, GROUND_SLAB])] : [];
    const win = openingTemplate("window", h)!;
    const spacing = L / (windows + 1);
    const ww = Math.min(win.width, spacing * 0.7);
    const wh = Math.min(win.height, h - win.sill - 300);
    if (hollow && ww >= 300 && wh >= 300)
      for (let i = 0; i < windows; i++) {
        const o = { ...win, width: ww, height: wh, at: Math.round(spacing * (i + 1)) };
        cutters.push(k.translate(throughOpeningX(k, o, t * 2), [0, w / 2 - t / 2, 0]));
      }
    const door = openingTemplate("door", h)!;
    const dh = Math.min(door.height, h - 300);
    if (hollow) cutters.push(k.translate(throughOpeningX(k, { ...door, width: Math.min(door.width, L * 0.5), height: dh, at: L / 2 }, t * 2), [0, -w / 2 + t / 2, 0]));
    // le vide intérieur ne doit pas percer le toit
    const solid = k.difference(k.union(parts), cutters);
    return {
      solid,
      connectors: [
        connector("start", "wall.end", "neutral", [0, 0, h / 2], [-1, 0, 0], w),
        connector("end", "wall.end", "neutral", [L, 0, h / 2], [1, 0, 0], w),
        connector("base", "foundation", "is_carried", [L / 2, 0, 0], [0, 0, -1], w),
      ],
    };
  },
};

/**
 * Fût d'église (nef ou bras de transept) le long de X, de 0 à longueur.
 * Vaisseau central de largeur intérieure `width`, bas-côtés éventuels,
 * fenêtres hautes et basses par travée, portail et rose en façade (x = 0),
 * extrémité est ouverte si une abside ou un chœur s'y raccorde.
 * Piliers et voûtes sont des modules séparés, placés par l'utilisateur ou le planificateur.
 */
export const nave: Generator = {
  id: "gen.church.nave",
  version: 1,
  construct(k, { params, quality }) {
    const L = num(params, "length");
    const W = num(params, "width");
    const H = num(params, "height");
    const t = num(params, "wallThickness");
    const bays = Math.max(1, num(params, "bays"));
    const aisles = bool(params, "aisles");
    const aw = aisles ? num(params, "aisleWidth") : 0;
    const ah = aisles ? num(params, "aisleHeight") : 0;
    const facade = bool(params, "facade", true);
    const eastOpen = bool(params, "eastOpen", true);
    const arch = str(params, "archProfile", "round") as "round" | "pointed";

    const outerHalf = W / 2 + t;
    const parts: Manifold[] = [k.box([L, 2 * outerHalf, H], [0, -outerHalf, 0])];
    const cutters: Manifold[] = [];
    const xStart = facade ? t : -10;
    const xEnd = eastOpen ? L + 10 : L - t;
    // vide du vaisseau central
    cutters.push(k.box([xEnd - xStart, W, H - GROUND_SLAB + 1], [xStart, -W / 2, GROUND_SLAB]));

    if (aisles) {
      const aOuter = outerHalf + aw + t;
      for (const sy of [-1, 1]) {
        const y0 = sy < 0 ? -aOuter : outerHalf - t;
        parts.push(k.box([L, aw + 2 * t, ah], [0, y0, 0]));
        parts.push(sy < 0
          ? leanTo(k, L, -aOuter - 300, -outerHalf, ah, ah + aw * 0.5)
          : leanTo(k, L, aOuter + 300, outerHalf, ah, ah + aw * 0.5));
        // vide du bas-côté, ouvert sur le vaisseau central (grandes arcades = vide continu ;
        // les piles sont des modules « colonne » séparés)
        const iy0 = sy < 0 ? -outerHalf - aw : W / 2;
        cutters.push(k.box([xEnd - xStart, aw + t + (outerHalf - W / 2 - t) + 1, ah - GROUND_SLAB - 600], [xStart, iy0, GROUND_SLAB]));
      }
    }
    parts.push(gableRoof(k, L, 2 * outerHalf, H, 50, 300));

    // Fenêtres : hautes (au-dessus des bas-côtés) et basses (dans les bas-côtés), une par travée.
    const bay = L / bays;
    // les fenêtres hautes doivent s'ouvrir au-dessus du toit des bas-côtés
    const highSill = aisles ? ah + aw * 0.5 + 900 : H * 0.45;
    const highH = Math.max(2000, (H - highSill) * 0.7);
    for (let b = 0; b < bays; b++) {
      const at = Math.round(bay * (b + 0.5));
      const high = { at, shape: "round_arch" as const, width: Math.min(2400, bay * 0.35), height: highH, sill: highSill };
      for (const sy of [-1, 1]) {
        cutters.push(k.translate(archCut(k, high, t * 3, arch), [0, sy * (W / 2 + t / 2), 0]));
        if (aisles) {
          const low = { at, shape: "round_arch" as const, width: Math.min(1800, bay * 0.3), height: ah * 0.45, sill: ah * 0.3 };
          cutters.push(k.translate(archCut(k, low, t * 3, arch), [0, sy * (outerHalf + aw + t / 2), 0]));
        }
      }
    }
    if (facade) {
      // portail et rose, percés dans la façade (plan x = 0), extrudés selon X
      const portal = archOpening(Math.min(4500, W * 0.4), Math.min(9000, H * 0.4), arch, 16);
      cutters.push(k.translate(k.rotate(k.extrude(portal, t * 3), [90, 0, 90]), [-t, 0, 0]));
      const rose = Math.min(W * 0.35, 6000) / 2;
      const seg = segmentsFor(rose * 2, quality);
      cutters.push(k.translate(k.rotate(k.cylinder(t * 3, rose, rose, seg), [0, 90, 0]), [-t, 0, H * 0.72]));
    }
    const solid = k.difference(k.union(parts), cutters);

    const connectors: ResolvedConnector[] = [
      connector("west", "wall.end", "neutral", [0, 0, H / 2], [-1, 0, 0], 2 * outerHalf),
      connector("east", "wall.end", "neutral", [L, 0, H / 2], [1, 0, 0], 2 * outerHalf),
      connector("base", "foundation", "is_carried", [L / 2, 0, 0], [0, 0, -1], 2 * outerHalf),
    ];
    for (let b = 0; b <= bays; b++) {
      const x = Math.round(bay * b);
      connectors.push(connector(`bay[${b}].north`, "wall.face", "carries", [x, outerHalf, H * 0.75], [0, 1, 0], t));
      connectors.push(connector(`bay[${b}].south`, "wall.face", "carries", [x, -outerHalf, H * 0.75], [0, -1, 0], t));
    }
    return { solid, connectors };
  },
};

function leanTo(k: Parameters<Generator["construct"]>[0], L: number, yLow: number, yHigh: number, zLow: number, zHigh: number): Manifold {
  const th = 300;
  const profile: Vec2[] = [[yLow, zLow], [yHigh, zHigh], [yHigh, zHigh + th], [yLow, zLow + th]];
  return k.tag(k.extrudeX(profile, L), "roof");
}

function archCut(
  k: Parameters<Generator["construct"]>[0],
  o: { width: number; height: number; sill: number; at: number },
  depth: number,
  profile: "round" | "pointed",
): Manifold {
  const outline = archOpening(o.width, o.height, profile, 12);
  const s = k.extrude(outline, depth);
  return k.translate(k.rotate(s, [90, 0, 0]), [o.at, depth / 2, o.sill]);
}

/**
 * Abside semi-circulaire (et chapelle rayonnante). Demi-cylindre creux côté +X,
 * ouvert côté −X pour se raccorder à la nef ou au chœur, demi-cône de toiture.
 */
export const apse: Generator = {
  id: "gen.church.apse",
  version: 1,
  construct(k, { params, quality }) {
    const d = num(params, "diameter");
    const h = num(params, "height");
    const t = num(params, "wallThickness");
    const windows = num(params, "windows", 0);
    const r = d / 2;
    const seg = segmentsFor(d, quality);
    const half = (m: Manifold, z0: number, z1: number) =>
      k.intersect(m, k.box([r + 2000, 2 * r + 4000, z1 - z0], [0, -r - 2000, z0]));
    const parts: Manifold[] = [half(k.cylinder(h, r, r, seg), -1, h + 1)];
    if (bool(params, "roof", true)) parts.push(k.tag(half(k.cylinder(d * 0.55, r + 300, 0, seg, [0, 0, h]), h - 1, h + d), "roof"));
    const cutters: Manifold[] = [half(k.cylinder(h, r - t, r - t, seg, [0, 0, GROUND_SLAB]), GROUND_SLAB - 1, h)];
    // l'intersection laisse un vide à x ∈ [0, r − t] : on prolonge vers −X pour ouvrir le côté nef
    cutters.push(k.box([2000, 2 * (r - t), h - GROUND_SLAB], [-1000, -(r - t), GROUND_SLAB]));
    for (let i = 0; i < windows; i++) {
      const a = -90 + (180 * (i + 1)) / (windows + 1);
      const ww = Math.min(1400, (Math.PI * r) / (windows + 1) * 0.4);
      const slot = k.box([r + 500, ww, h * 0.45], [0, -ww / 2, h * 0.3]);
      cutters.push(k.rotate(slot, [0, 0, a]));
    }
    const solid = k.difference(k.union(parts), cutters);
    const connectors: ResolvedConnector[] = [
      connector("west", "wall.end", "neutral", [0, 0, h / 2], [-1, 0, 0], d),
      connector("base", "foundation", "is_carried", [r / 2, 0, 0], [0, 0, -1], d),
    ];
    return { solid, connectors };
  },
};
