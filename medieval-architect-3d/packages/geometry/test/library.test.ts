import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { LIBRARY, resolveParameters, type ModuleDefinition, type ParameterDef, type ParameterValue } from "@ma3d/core";
import { GENERATORS, run } from "../src/index.js";

/** Générateur fast-check d'une valeur valide pour un paramètre. */
function arb(p: ParameterDef): fc.Arbitrary<ParameterValue> {
  switch (p.kind) {
    case "length":
    case "count":
    case "angle":
      return fc.integer({ min: p.min, max: p.max });
    case "enum":
      return fc.constantFrom(...p.options);
    case "boolean":
      return fc.boolean();
    case "ratio":
      return fc.double({ min: 0, max: 1, noNaN: true });
    case "material":
      return fc.constant(p.default);
  }
}

function expandDeclared(def: ModuleDefinition): Set<string> {
  const names = new Set<string>();
  for (const c of def.connectors) {
    const m = /^(.*)\[(\d+)\.\.(\d+)\](.*)$/.exec(c.name);
    if (!m) names.add(c.name);
    else for (let i = Number(m[2]); i <= Number(m[3]); i++) names.add(`${m[1]}[${i}]${m[4]}`);
  }
  return names;
}

/**
 * Dimensions « raisonnables » : on borne les tirages aléatoires aux plages typiques quand elles existent,
 * et on évite les combinaisons absurdes que l'interface empêche déjà (murs plus épais que la tour).
 */
function sensible(def: ModuleDefinition, v: Record<string, ParameterValue>): boolean {
  const n = (k: string) => Number(v[k]);
  if ("wallThickness" in v && "diameter" in v && n("wallThickness") * 2 >= n("diameter") - 1000) return false;
  if ("wallThickness" in v && "width" in v && n("wallThickness") * 2 >= n("width") - 1000) return false;
  if (def.type.startsWith("church.nave") || def.type === "church.transept") {
    if (n("aisleHeight") >= n("height") - 2000) return false;
    if (n("length") / n("bays") < 2500) return false;
  }
  if ("passageWidth" in v && n("passageWidth") >= n("width") * 0.6) return false;
  if ("passageHeight" in v && n("passageHeight") >= n("height") - 1000) return false;
  if ("windows" in v && "length" in v && n("windows") * 2500 > n("length")) return false;
  if (def.type === "castle.residential.hall" && n("wallThickness") * 2 >= n("width") - 1500) return false;
  if (def.type === "church.buttress" && n("flyerHeight") <= n("height")) return false;
  return true;
}

describe.each(LIBRARY.map((d) => [d.type, d] as const))("%s", (_type, def) => {
  it("a un générateur enregistré", () => {
    expect(GENERATORS[def.generator]).toBeDefined();
  });

  it("valeurs par défaut : solide fermé, groupes de matériaux cohérents, connecteurs déclarés", async () => {
    const g = await run(GENERATORS[def.generator]!, { params: resolveParameters(def.parameters, {}), openings: [] });
    expect(g.watertight).toBe(true);
    expect(g.triangles).toBeGreaterThan(0);
    const declared = expandDeclared(def);
    for (const c of g.connectors) expect(declared.has(c.name), c.name).toBe(true);
    const total = g.mesh.groups.reduce((s, x) => s + x.count, 0);
    expect(total).toBe(g.mesh.indices.length);
    const slots = new Set(Object.values(def.parameters).flatMap((p) => (p.kind === "material" ? [p.slot] : [])));
    for (const grp of g.mesh.groups) expect(slots.has(grp.slot), `groupe ${grp.slot} sans paramètre matériau`).toBe(true);
  });

  it("paramètres aléatoires dans les bornes : toujours un solide fermé", async () => {
    const entries = Object.entries(def.parameters);
    await fc.assert(
      fc.asyncProperty(
        fc.record(Object.fromEntries(entries.map(([k, p]) => [k, arb(p)]))).filter((v) => sensible(def, v)),
        async (v) => {
          const g = await run(GENERATORS[def.generator]!, { params: resolveParameters(def.parameters, v), openings: [] });
          expect(g.watertight).toBe(true);
          expect(g.volumeMm3).toBeGreaterThan(0);
        },
      ),
      { numRuns: Number(process.env.FC_RUNS ?? 12) },
    );
  });

  it("la basse qualité n'augmente jamais le nombre de triangles", async () => {
    const params = resolveParameters(def.parameters, {});
    const hi = await run(GENERATORS[def.generator]!, { params, openings: [], quality: "high" });
    const lo = await run(GENERATORS[def.generator]!, { params, openings: [], quality: "low" });
    expect(lo.triangles).toBeLessThanOrEqual(hi.triangles);
    expect(lo.watertight).toBe(true);
  });
});
