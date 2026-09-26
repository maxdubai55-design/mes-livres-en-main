import type { Manifold } from "manifold-3d";
import { archCurve, archRise, type ArchProfile, type Vec2 } from "../kernel.js";
import { bool, connector, num, segmentsFor, str, type Generator } from "../generator.js";

/**
 * Colonne / pile : base, fût, chapiteau. Posée en (0, 0, 0).
 * Style roman : chapiteau cubique ; gothique : corbeille évasée + tailloir mince.
 */
export const column: Generator = {
  id: "gen.church.column",
  version: 1,
  construct(k, { params, quality }) {
    const h = num(params, "height");
    const d = num(params, "diameter");
    const style = str(params, "style", "romanesque");
    const r = d / 2;
    const seg = segmentsFor(d, quality);
    let baseH = bool(params, "base", true) ? d * 0.35 : 0;
    let capH = bool(params, "capital", true) ? d * 0.6 : 0;
    // colonne trapue : base et chapiteau ne prennent jamais plus de 60 % de la hauteur
    const f = Math.min(1, (0.6 * h) / Math.max(1, baseH + capH));
    baseH = Math.round(baseH * f);
    capH = Math.round(capH * f);
    const parts: Manifold[] = [k.cylinder(h - baseH - capH, r, r, seg, [0, 0, baseH])];
    if (baseH) parts.push(k.cbox(d * 1.3, d * 1.3, baseH));
    if (capH) {
      const z = h - capH;
      if (style === "gothic") {
        parts.push(k.cylinder(capH * 0.75, r, r * 1.35, seg, [0, 0, z]));
        parts.push(k.cbox(d * 1.45, d * 1.45, capH * 0.25, [0, 0, z + capH * 0.75]));
      } else {
        parts.push(k.cylinder(capH * 0.6, r, r * 1.15, seg, [0, 0, z]));
        parts.push(k.cbox(d * 1.35, d * 1.35, capH * 0.4, [0, 0, z + capH * 0.6]));
      }
    }
    return {
      solid: k.union(parts),
      connectors: [
        connector("top", "support.top", "carries", [0, 0, h], [0, 0, 1], d),
        connector("base", "support.base", "is_carried", [0, 0, 0], [0, 0, -1], d),
      ],
    };
  },
};

/** Arc isolé (arc-doubleau, arcade) : portée selon X, centré, naissances en z = 0, épaisseur selon Y. */
export const arch: Generator = {
  id: "gen.church.arch",
  version: 1,
  construct(k, { params }) {
    const span = num(params, "span");
    const band = num(params, "band");
    const depth = num(params, "depth");
    const profile = str(params, "profile", "round") as ArchProfile;
    const inner = archCurve(span, profile, 24);
    const outer = archCurve(span + 2 * band, profile, 24);
    // l'extrados d'un arc surbaissé ou brisé n'est pas concentrique : on le recale sur la même flèche + band
    const lift = archRise(span, profile) + band - archRise(span + 2 * band, profile);
    const outerLifted: Vec2[] = outer.map(([u, v]) => [u, v + lift]);
    const ring: Vec2[] = [...outerLifted, ...inner.slice().reverse()];
    const solid = k.translate(k.rotate(k.extrude(ring, depth), [90, 0, 0]), [0, depth / 2, 0]);
    const rise = archRise(span, profile) + band;
    return {
      solid,
      connectors: [
        connector("springer[0]", "arch.springer", "is_carried", [-span / 2 - band / 2, 0, 0], [0, 0, -1], band),
        connector("springer[1]", "arch.springer", "is_carried", [span / 2 + band / 2, 0, 0], [0, 0, -1], band),
        connector("top", "wall.top", "carries", [0, 0, rise], [0, 0, 1], depth),
      ],
    };
  },
};

/**
 * Voûte d'une travée, spanX × spanY, naissances en z = 0, centrée.
 * - barrel : berceau d'axe X (portée spanY) ;
 * - groin : voûte d'arêtes = intersection de deux berceaux ;
 * - ribbed : voûte d'arêtes + deux nervures diagonales (ogives).
 * Simplification assumée : les voûtains gothiques réels ne sont pas des cylindres ;
 * la forme sert à l'image et au calcul de poussée, pas à la stéréotomie.
 */
export const vault: Generator = {
  id: "gen.church.vault",
  version: 1,
  construct(k, { params }) {
    const sx = num(params, "spanX");
    const sy = num(params, "spanY");
    const t = num(params, "thickness");
    const kind = str(params, "kind", "barrel");
    const profile = str(params, "profile", "round") as ArchProfile;

    // Berceau d'axe X, portée sy : profil (y, z) extrudé le long de X.
    const barrelX = (inset: number) => {
      const curve = archCurve(sy - 2 * inset, profile, 24);
      const pts: Vec2[] = curve;
      return k.extrudeX([[pts[0]![0], -1], ...pts, [pts[pts.length - 1]![0], -1]], sx + 20, -sx / 2 - 10);
    };
    // Berceau d'axe Y, portée sx : même principe, tourné de 90°.
    const barrelY = (inset: number) => {
      const curve = archCurve(sx - 2 * inset, profile, 24);
      const pts: Vec2[] = curve;
      return k.extrudeY([[pts[0]![0], -1], ...pts, [pts[pts.length - 1]![0], -1]], sy + 20, -sy / 2 - 10);
    };
    const shell = (outer: Manifold, inner: Manifold) => k.difference(outer, [inner]);
    const box = k.cbox(sx, sy, Math.max(sx, sy) * 2);

    let solid: Manifold;
    if (kind === "barrel") {
      const outerX = scaleUp(k, barrelX(0), t, "x", sy, archRise(sy, profile));
      solid = k.intersect(shell(outerX, barrelX(0)), box);
    } else {
      const outer = k.union([
        scaleUp(k, barrelX(0), t, "x", sy, archRise(sy, profile)),
        scaleUp(k, barrelY(0), t, "y", sx, archRise(sx, profile)),
      ]);
      const inner = k.union([barrelX(0), barrelY(0)]);
      solid = k.intersect(k.difference(outer, [inner]), box);
      if (kind === "ribbed") {
        const ribs: Manifold[] = [];
        const rise = archRise(Math.min(sx, sy), profile);
        const n = 12;
        for (const dir of [1, -1]) {
          const pts: Manifold[] = [];
          for (let i = 0; i <= n; i++) {
            const s = -0.5 + i / n; // position le long de la diagonale
            const x = s * sx, y = dir * s * sy;
            // hauteur : ellipse passant par les angles (0) et la clé (rise)
            const z = rise * Math.sqrt(Math.max(0, 1 - (2 * s) ** 2)) - 350;
            pts.push(k.cbox(350, 350, 350, [x, y, Math.max(0, z)]));
          }
          for (let i = 0; i < n; i++) ribs.push(k.hull([pts[i]!, pts[i + 1]!]));
        }
        solid = k.union([solid, k.intersect(k.union(ribs), box)]);
      }
    }
    const rise = archRise(Math.min(sx, sy), profile);
    const cx = sx / 2, cy = sy / 2;
    return {
      solid,
      connectors: [
        connector("springer[0]", "arch.springer", "is_carried", [-cx, -cy, 0], [0, 0, -1], t),
        connector("springer[1]", "arch.springer", "is_carried", [cx, -cy, 0], [0, 0, -1], t),
        connector("springer[2]", "arch.springer", "is_carried", [cx, cy, 0], [0, 0, -1], t),
        connector("springer[3]", "arch.springer", "is_carried", [-cx, cy, 0], [0, 0, -1], t),
        connector("keystone", "vault.keystone", "neutral", [0, 0, rise + t], [0, 0, 1], t),
      ],
    };
  },
};

/**
 * Extrados : le berceau agrandi de `t` par mise à l'échelle dans le plan de sa section
 * (axe de l'extrusion inchangé). Approximation suffisante pour une coque mince.
 */
function scaleUp(k: Parameters<Generator["construct"]>[0], m: Manifold, t: number, axis: "x" | "y", span: number, rise: number): Manifold {
  const sSec = (span + 2 * t) / span;
  const sZ = (rise + t) / rise;
  return k.own(m.scale(axis === "x" ? [1, sSec, sZ] : [sSec, 1, sZ]));
}

/**
 * Contrefort à ressauts, avec arc-boutant en option.
 * Le contrefort est posé en (0, 0), plaqué contre un mur situé côté +Y (face du mur en y = 0).
 * L'arc-boutant part du sommet de la culée et franchit `flyerSpan` vers +Y jusqu'à `flyerHeight`.
 */
export const buttress: Generator = {
  id: "gen.church.buttress",
  version: 1,
  construct(k, { params }) {
    const h = num(params, "height");
    const w = num(params, "width");
    const depth = num(params, "depth");
    const steps = Math.max(1, num(params, "steps"));
    const parts: Manifold[] = [];
    // ressauts : chaque étage recule de depth / (steps + 1)
    const stepH = h / steps;
    for (let i = 0; i < steps; i++) {
      const dd = depth * (1 - i / (steps + 1));
      parts.push(k.box([w, dd, stepH + (i < steps - 1 ? 1 : 0)], [-w / 2, -dd, i * stepH]));
    }
    const flyer = bool(params, "flyer");
    const flyerSpan = num(params, "flyerSpan", 6000);
    const flyerHeight = num(params, "flyerHeight", h + 4000);
    if (flyer) {
      // Culée surmontée d'un pinacle, puis demi-arc rampant jusqu'au mur haut.
      const topDepth = depth * (1 - (steps - 1) / (steps + 1));
      parts.push(k.box([w * 0.6, topDepth * 0.6, 2500], [-w * 0.3, -topDepth * 0.8, h]));
      parts.push(k.cylinder(2200, w * 0.3, 0, 8, [0, -topDepth * 0.5, h + 2500]));
      const y0 = 0, y1 = flyerSpan;
      const z0 = h - 1200, z1 = flyerHeight;
      const n = 16;
      const band = 900;
      const upper: Vec2[] = [], lower: Vec2[] = [];
      for (let i = 0; i <= n; i++) {
        const s = i / n;
        const y = y0 + (y1 - y0) * s;
        // intrados en quart d'ellipse, extrados rectiligne (rampant) : la forme classique
        const zi = z0 + (z1 - band - z0) * Math.sin((s * Math.PI) / 2) * 0.85;
        const ze = z0 + band + (z1 - z0) * s;
        lower.push([y, Math.min(zi, ze - 300)]);
        upper.push([y, ze]);
      }
      const profile: Vec2[] = [...lower, ...upper.reverse()];
      parts.push(k.translate(k.rotate(k.extrude(profile, w * 0.6), [90, 0, 90]), [-w * 0.3, 0, 0]));
    }
    return {
      solid: k.union(parts),
      connectors: [
        connector("head", "buttress.head", "carries", [0, 0, h / 2], [0, 1, 0], w),
        connector("base", "foundation", "is_carried", [0, -depth / 2, 0], [0, 0, -1], w),
        ...(flyer ? [connector("flyer", "flying.head", "is_carried", [0, flyerSpan, flyerHeight], [0, 1, 0], w)] : []),
      ],
    };
  },
};

/** Mâchicoulis sur consoles : parapet en encorbellement le long de X, posé sur l'arase (z = 0 ici). */
export const machicolation: Generator = {
  id: "gen.defense.machicolation",
  version: 1,
  construct(k, { params }) {
    const L = num(params, "length");
    const proj = num(params, "projection");
    const courses = num(params, "corbelCourses");
    const parts: Manifold[] = [];
    const spacing = 1200;
    const n = Math.max(2, Math.floor(L / spacing) + 1);
    const corbelH = 350;
    for (let i = 0; i < n; i++) {
      const x = Math.min(L - 300, i * spacing);
      for (let c = 0; c < courses; c++) {
        const reach = (proj * (c + 1)) / courses;
        parts.push(k.box([300, reach + 400, corbelH], [x, -reach, -corbelH * (courses - c)]));
      }
    }
    // parapet porté par les consoles, avec les trous d'assommoir entre elles
    parts.push(k.box([L, 450, 2200], [0, -proj - 50, 0]));
    const solid = k.union(parts);
    return {
      solid,
      connectors: [connector("seat", "wall.top", "is_carried", [L / 2, 0, 0], [0, 0, -1], 450)],
    };
  },
};

/** Hourd : galerie de bois en surplomb avec toit en appentis, le long de X. */
export const hoarding: Generator = {
  id: "gen.defense.hoarding",
  version: 1,
  construct(k, { params }) {
    const L = num(params, "length");
    const proj = num(params, "projection");
    const gallery = k.tag(k.box([L, proj + 600, 2200], [0, -proj, 0]), "timber");
    const roof = k.tag(
      k.extrudeX([[-proj - 300, 2200], [600, 3200], [600, 3450], [-proj - 300, 2450]], L),
      "roof",
    );
    return {
      solid: k.union([gallery, roof]),
      connectors: [connector("seat", "wall.top", "is_carried", [L / 2, 0, 0], [0, 0, -1], proj)],
    };
  },
};
