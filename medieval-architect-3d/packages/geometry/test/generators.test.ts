import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { resolveParameters, type ModuleDefinition } from "@ma3d/core";
import { LIBRARY, curtainWall, roundTower as towerDef } from "@ma3d/core";
import { GeometryCache, roundTower, run, straightWall, type OpeningCut } from "../src/index.js";
import { distanceToMesh } from "../src/testing.js";

const wallParams = (p: Record<string, number> = {}) => resolveParameters(curtainWall.parameters, { crenellated: false, ...p });
const towerParams = (p: Record<string, number | boolean | string> = {}) => resolveParameters(towerDef.parameters, { crenellated: false, arrowSlits: 0, ...p });

/** Connecteurs censés se trouver sur la surface extérieure du solide. */
const SURFACE_KINDS = new Set(["wall.end", "wall.face", "wall.top", "tower.flank", "foundation"]);

function expandDeclared(def: ModuleDefinition): Set<string> {
  const names = new Set<string>();
  for (const c of def.connectors) {
    const m = /^(.*)\[(\d+)\.\.(\d+)\]$/.exec(c.name);
    if (!m) names.add(c.name);
    else for (let i = Number(m[2]); i <= Number(m[3]); i++) names.add(`${m[1]}[${i}]`);
  }
  return names;
}

describe("Mur droit", () => {
  it("valeurs par défaut : solide étanche, sans trou, volume exact", async () => {
    const g = await run(straightWall, { params: wallParams(), openings: [] });
    expect(g.watertight).toBe(true);
    expect(g.genus).toBe(0);
    expect(g.volumeMm3).toBeCloseTo(20000 * 2200 * 9000, -3);
  });

  it("le talus ajoute un prisme triangulaire côté extérieur", async () => {
    const g = await run(straightWall, { params: wallParams({ batter: 1000 }), openings: [] });
    expect(g.volumeMm3).toBeCloseTo(20000 * 9000 * (2200 + 500), -3);
  });

  it("critère du lot 0 : dix ouvertures, toujours étanche, dix trous traversants", async () => {
    const openings: OpeningCut[] = Array.from({ length: 10 }, (_, i) => ({
      shape: i % 3 === 0 ? "round_arch" : i % 3 === 1 ? "rect" : "slit",
      at: 1500 + i * 1900,
      width: i % 3 === 2 ? 150 : 1000,
      height: i % 3 === 2 ? 1400 : 2200,
      sill: i % 3 === 0 ? 0 : 1500,
    }));
    const g = await run(straightWall, { params: wallParams(), openings });
    expect(g.watertight).toBe(true);
    expect(g.genus).toBe(10 - openings.filter((o) => o.sill === 0).length);
  });

  it("une ouverture rectangulaire retire exactement son volume", async () => {
    const plain = await run(straightWall, { params: wallParams(), openings: [] });
    const cut = await run(straightWall, {
      params: wallParams(),
      openings: [{ shape: "rect", at: 10000, width: 1000, height: 2000, sill: 1000 }],
    });
    expect(plain.volumeMm3 - cut.volumeMm3).toBeCloseTo(1000 * 2000 * 2200, -3);
  });
});

describe("Tour ronde", () => {
  it("valeurs par défaut : étanche, volume conforme au calcul analytique à 1 % près", async () => {
    const p = towerParams({ roof: "none" });
    const g = await run(roundTower, { params: p, openings: [] });
    const r = 4500, ri = 2000, h = 18000, slab = 600;
    const expected = Math.PI * (r * r - ri * ri) * (h - slab) + Math.PI * r * r * slab;
    expect(g.watertight).toBe(true);
    expect(Math.abs(g.volumeMm3 - expected) / expected).toBeLessThan(0.01);
  });

  it("ouverte à la gorge : toujours étanche, plus légère, sans toiture", async () => {
    const closed = await run(roundTower, { params: towerParams({ roof: "none" }), openings: [] });
    const open = await run(roundTower, { params: towerParams({ openGorge: true }), openings: [] });
    expect(open.watertight).toBe(true);
    expect(open.volumeMm3).toBeLessThan(closed.volumeMm3);
  });

  it("archères : un trou par percement", async () => {
    const slits: OpeningCut[] = [0, 90, 180, 270].map((a) => ({ shape: "slit", at: a + 45, width: 150, height: 1500, sill: 5000 }));
    const g = await run(roundTower, { params: towerParams({ roof: "none" }), openings: slits });
    expect(g.watertight).toBe(true);
    expect(g.genus).toBe(4);
  });

  it("un connecteur d'étage par niveau", async () => {
    const g = await run(roundTower, { params: towerParams({ floors: 5 }), openings: [] });
    expect(g.connectors.filter((c) => c.kind === "floor.level")).toHaveLength(5);
  });
});

describe("Propriétés sur des paramètres aléatoires", () => {
  const within = (def: ModuleDefinition, key: string) => {
    const p = def.parameters[key]!;
    if (p.kind !== "length" && p.kind !== "count") throw new Error(key);
    return fc.integer({ min: p.min, max: p.max });
  };

  it("mur : tout jeu de paramètres dans les bornes donne un solide étanche dont les connecteurs touchent la surface", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          length: within(curtainWall, "length"),
          height: within(curtainWall, "height"),
          thickness: within(curtainWall, "thickness"),
          batter: within(curtainWall, "batter"),
        }),
        async (p) => {
          const g = await run(straightWall, { params: wallParams(p), openings: [] });
          expect(g.watertight).toBe(true);
          for (const c of g.connectors.filter((c) => SURFACE_KINDS.has(c.kind)))
            expect(distanceToMesh(c.frame.position, g.mesh), c.name).toBeLessThan(1);
        },
      ),
      { numRuns: 60 },
    );
  });

  it("tour : tout jeu de paramètres dans les bornes donne un solide étanche dont les connecteurs touchent la surface", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          height: within(towerDef, "height"),
          diameter: within(towerDef, "diameter"),
          wallThickness: within(towerDef, "wallThickness"),
          floors: within(towerDef, "floors"),
          openGorge: fc.boolean(),
          roof: fc.constantFrom("none", "conical", "terrace"),
        }),
        async (p) => {
          const g = await run(roundTower, { params: towerParams(p), openings: [] });
          expect(g.watertight).toBe(true);
          for (const c of g.connectors.filter((c) => SURFACE_KINDS.has(c.kind)))
            expect(distanceToMesh(c.frame.position, g.mesh), c.name).toBeLessThan(1);
        },
      ),
      { numRuns: 40 },
    );
  });

  it("les connecteurs produits sont tous déclarés dans la définition", async () => {
    for (const [def, gen, params] of [
      [curtainWall, straightWall, wallParams()],
      [towerDef, roundTower, towerParams({ floors: 8 })],
    ] as const) {
      const declared = expandDeclared(def);
      const g = await run(gen, { params, openings: [] });
      for (const c of g.connectors) expect(declared.has(c.name), `${def.type} : ${c.name}`).toBe(true);
      const kinds = new Map(def.connectors.map((d) => [d.name.replace(/\[.*$/, ""), d.kind]));
      for (const c of g.connectors) expect(c.kind).toBe(kinds.get(c.name.replace(/\[.*$/, "")));
    }
  });
});

describe("Cache géométrique", () => {
  it("mêmes paramètres dans un autre ordre : un seul calcul", async () => {
    const cache = new GeometryCache();
    const a = await cache.get(towerDef, { height: 20000, diameter: 8000 });
    const b = await cache.get(towerDef, { diameter: 8000, height: 20000 });
    expect(b).toBe(a);
    expect([cache.hits, cache.misses]).toEqual([1, 1]);
  });

  it("une valeur explicite égale au défaut partage l'entrée du défaut", async () => {
    const cache = new GeometryCache();
    await cache.get(towerDef, {});
    await cache.get(towerDef, { height: 18000 });
    expect(cache.misses).toBe(1);
  });

  it("paramètre modifié : nouveau calcul ; taille bornée", async () => {
    const cache = new GeometryCache(3);
    for (const h of [10000, 11000, 12000, 13000]) await cache.get(towerDef, { height: h });
    expect(cache.misses).toBe(4);
    expect(cache.size).toBe(3);
  });

  it("générateur inconnu : erreur explicite", async () => {
    const def = { ...LIBRARY[0]!, generator: "gen.inexistant" };
    await expect(new GeometryCache().get(def, {})).rejects.toThrow("générateur inconnu");
  });
});
