import { bool, connector, num, str, type Generator, type OpeningCut } from "../generator.js";
import { openingTemplate, throughOpeningX, wallCrenellation, type OpeningKind } from "./parts.js";

/**
 * Mur droit / courtine.
 * Repère : le mur court de x = 0 à x = longueur ; épaisseur centrée sur y = 0 à l'arase ;
 * face extérieure côté −Y ; le talus (fruit) élargit la base vers l'extérieur.
 */
export const straightWall: Generator = {
  id: "gen.wall.straight",
  version: 3,
  construct(k, { params, openings }) {
    const L = num(params, "length");
    const h = num(params, "height");
    const t = num(params, "thickness");
    const batter = num(params, "batter", 0);

    const profile: [number, number][] = [
      [-t / 2 - batter, 0],
      [t / 2, 0],
      [t / 2, h],
      [-t / 2, h],
    ];
    let body = k.extrudeX(profile, L);
    if (bool(params, "crenellated")) body = k.union([body, wallCrenellation(k, L, t, h)]);

    const all: OpeningCut[] = [...openings];
    const tpl = openingTemplate(str(params, "openingType", "none") as OpeningKind, h);
    const count = num(params, "openingCount", 0);
    if (tpl && count > 0) {
      // Les ouvertures s'adaptent au mur : jamais plus larges que 70 % de l'entraxe,
      // et toujours un linteau d'au moins 30 cm au-dessus. Trop petites, elles sont omises.
      const spacing = L / (count + 1);
      const width = Math.min(tpl.width, spacing * 0.7);
      const sill = Math.min(tpl.sill, h * 0.5);
      const height = Math.min(tpl.height, h - sill - 300);
      if (width >= 100 && height >= 300)
        for (let i = 0; i < count; i++) all.push({ ...tpl, width: Math.round(width), height: Math.round(height), sill: Math.round(sill), at: Math.round(spacing * (i + 1)) });
    }

    const solid = k.difference(body, all.map((o) => throughOpeningX(k, o, (t + batter) * 2)));
    return {
      solid,
      connectors: [
        connector("start", "wall.end", "neutral", [0, 0, h / 2], [-1, 0, 0], t),
        connector("end", "wall.end", "neutral", [L, 0, h / 2], [1, 0, 0], t),
        connector("top", "wall.top", "carries", [L / 2, 0, h], [0, 0, 1], t),
        connector("outer", "wall.face", "carries", [L / 2, -t / 2 - batter / 2, h / 2], [0, -1, 0], 0),
        connector("inner", "wall.face", "carries", [L / 2, t / 2, h / 2], [0, 1, 0], 0),
        connector("base", "foundation", "is_carried", [L / 2, -batter / 2, 0], [0, 0, -1], t + batter),
      ],
    };
  },
};
