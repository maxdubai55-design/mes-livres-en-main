import type { Manifold } from "manifold-3d";
import type { ResolvedConnector } from "@ma3d/core";
import { bool, connector, num, segmentsFor, str, type Generator } from "../generator.js";
import { coneRoof, pyramidRoof, ringCrenellation, squareCrenellation } from "./parts.js";

/** Épaisseur du sol du rez-de-chaussée, fermant le fût. */
export const GROUND_SLAB = 600;

const SLIT = { width: 150, height: 1600 };

/**
 * Tour ronde (et donjon circulaire). Axe vertical en (0, 0) ; la gorge (côté cour) est du côté +Y.
 * Les planchers ne sont pas modélisés : seuls leurs connecteurs existent.
 */
export const roundTower: Generator = {
  id: "gen.tower.round",
  version: 2,
  construct(k, { params, openings, quality }) {
    const h = num(params, "height");
    const d = num(params, "diameter");
    const t = num(params, "wallThickness");
    const floors = num(params, "floors");
    const openGorge = bool(params, "openGorge");
    const roof = openGorge ? "none" : str(params, "roof", "conical");
    const seg = segmentsFor(d, quality);
    const r = d / 2;
    const ri = Math.max(r - t, 1);

    const parts: Manifold[] = [k.cylinder(h, r, r, seg)];
    const crenellated = bool(params, "crenellated") && roof !== "conical";
    if (crenellated) parts.push(ringCrenellation(k, r, t, h, seg));
    if (roof === "conical") parts.push(coneRoof(k, r, h, d * 0.9, seg));

    const cutters = [k.cylinder(h, ri, ri, seg, [0, 0, GROUND_SLAB])];
    if (openGorge) cutters.push(k.box([2 * ri, r + 10, h + 4000], [-ri, 0, GROUND_SLAB]));
    const slits = num(params, "arrowSlits", 0);
    for (let i = 0; i < slits; i++) {
      const slot = k.box([r + 100, SLIT.width, SLIT.height], [0, -SLIT.width / 2, Math.max(1500, h * 0.4)]);
      // décalage d'un demi-pas : jamais sur un point d'accroche de courtine
      cutters.push(k.rotate(slot, [0, 0, (360 * (i + 0.5)) / slits]));
    }
    for (const o of openings) {
      const slot = k.box([r + 100, o.width, o.height], [0, -o.width / 2, o.sill]);
      cutters.push(k.rotate(slot, [0, 0, o.at]));
    }
    const solid = k.difference(k.union(parts), cutters);

    const connectors: ResolvedConnector[] = [];
    for (let i = 0; i < 4; i++) {
      // flank[1] (+Y) est du côté de la gorge : une tour ouverte n'y a pas de mur où s'accrocher
      if (openGorge && i === 1) continue;
      const a = (i * Math.PI) / 2;
      const dir: [number, number, number] = [Math.cos(a), Math.sin(a), 0];
      connectors.push(connector(`flank[${i}]`, "tower.flank", "neutral", [r * dir[0], r * dir[1], h / 2], dir, t));
    }
    for (let i = 0; i < floors; i++) {
      const z = i === 0 ? GROUND_SLAB : Math.round((i * h) / floors);
      connectors.push(connector(`floor[${i}]`, "floor.level", "carries", [0, 0, z], [0, 0, 1], 0));
    }
    connectors.push(connector("top", "tower.top", "carries", [0, 0, h], [0, 0, 1], t));
    connectors.push(connector("base", "foundation", "is_carried", [0, 0, 0], [0, 0, -1], d));
    return { solid, connectors };
  },
};

/** Tour carrée, donjon quadrangulaire, tour de façade. Centrée sur (0, 0). */
export const squareTower: Generator = {
  id: "gen.tower.square",
  version: 1,
  construct(k, { params }) {
    const h = num(params, "height");
    const w = num(params, "width");
    const t = num(params, "wallThickness");
    const floors = num(params, "floors");
    const roof = str(params, "roof", "pyramid");
    const wi = Math.max(w - 2 * t, 10);

    const parts: Manifold[] = [k.cbox(w, w, h)];
    const crenellated = bool(params, "crenellated") && (roof === "none" || roof === "terrace");
    if (crenellated) parts.push(squareCrenellation(k, w, w, t, h));
    if (roof === "pyramid") parts.push(pyramidRoof(k, w, w, h, 0.45));
    if (roof === "spire") parts.push(pyramidRoof(k, w, w, h, 1.6, 150));

    const cutters = [k.cbox(wi, wi, h, [0, 0, GROUND_SLAB])];
    const slits = num(params, "arrowSlits", 0);
    for (let i = 0; i < slits; i++) {
      const slot = k.box([w / 2 + 100, SLIT.width, SLIT.height], [0, -SLIT.width / 2, Math.max(1500, h * 0.4)]);
      // décalées de 20° : ni au milieu des faces (courtines), ni dans les angles
      cutters.push(k.rotate(slot, [0, 0, (360 * i) / slits + 20]));
    }
    const solid = k.difference(k.union(parts), cutters);

    const connectors: ResolvedConnector[] = [];
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2;
      const dir: [number, number, number] = [Math.round(Math.cos(a)), Math.round(Math.sin(a)), 0];
      connectors.push(connector(`flank[${i}]`, "tower.flank", "neutral", [(w / 2) * dir[0], (w / 2) * dir[1], h / 2], dir, t));
    }
    for (let i = 0; i < floors; i++) {
      const z = i === 0 ? GROUND_SLAB : Math.round((i * h) / floors);
      connectors.push(connector(`floor[${i}]`, "floor.level", "carries", [0, 0, z], [0, 0, 1], 0));
    }
    connectors.push(connector("top", "tower.top", "carries", [0, 0, h], [0, 0, 1], t));
    connectors.push(connector("base", "foundation", "is_carried", [0, 0, 0], [0, 0, -1], w));
    return { solid, connectors };
  },
};
