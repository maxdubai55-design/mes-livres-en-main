import { describe, expect, it } from "vitest";
import { LIBRARY_BY_TYPE, Project, runDiagnostics, type AABB, type ModuleInstance } from "@ma3d/core";
import { GeometryCache, worldBounds } from "@ma3d/geometry";
import { parseRequest, plan } from "../src/index.js";

const CASTLE = "Construis une forteresse royale française du XIIIe siècle sur un éperon rocheux de 120 × 60 m, avec quatre tours rondes, un donjon, une double enceinte, une porte fortifiée et un logis.";
const CATHEDRAL = "Crée une cathédrale gothique du XIIIe siècle d'environ 90 m de longueur, nef à trois vaisseaux, transept, chœur à déambulatoire, cinq chapelles rayonnantes, deux tours de façade et arcs-boutants.";

const cache = new GeometryCache();
async function bounds(mods: ModuleInstance[]): Promise<Map<string, AABB>> {
  const out = new Map<string, AABB>();
  for (const m of mods) {
    const g = await cache.get(LIBRARY_BY_TYPE.get(m.type)!, m.params);
    out.set(m.id, worldBounds(m.transform, g.mesh.bounds));
  }
  return out;
}

function asProject(p: ReturnType<typeof plan>, year: [number, number]): Project {
  return Project.parse({
    schemaVersion: 1, id: "t", name: "t", kind: "creation", context: { date: { from: year[0], to: year[1] } }, settings: {}, levels: [],
    modules: Object.fromEntries(p.modules.map((m) => [m.id, m])), connections: p.connections, libraryLock: {},
  });
}

describe("Analyse des demandes", () => {
  it("forteresse du cahier des charges", () => {
    const r = parseRequest(CASTLE);
    expect(r.spec.building).toMatchObject({ type: "fortress", date: { from: 1201, to: 1300 }, region: "fr.ile-de-france" });
    expect(r.spec.overall).toEqual({ length: 120000, width: 60000 });
    expect(r.spec.terrain?.kind).toBe("spur");
    const types = r.spec.modules.map((m) => `${m.type}×${m.count}`);
    expect(types).toEqual(expect.arrayContaining(["castle.tower.round×4", "castle.keep.round×1", "castle.entrance.gate×1", "castle.residential.hall×1"]));
    expect(r.spec.modules.some((m) => m.ref.startsWith("enceinte.outer"))).toBe(true);
    expect(r.unsupported.join()).toContain("Relief");
  });

  it("cathédrale du cahier des charges", () => {
    const r = parseRequest(CATHEDRAL);
    expect(r.spec.building).toMatchObject({ type: "cathedral", style: "gothic.classic" });
    expect(r.spec.overall.length).toBe(90000);
    const byRef = Object.fromEntries(r.spec.modules.map((m) => [m.ref, m]));
    expect(byRef["nave#1"]?.params.aisles).toBe(true);
    expect(byRef["chapel.radiating#1"]?.count).toBe(5);
    expect(byRef["tower.facade#1"]?.count).toBe(2);
    expect(byRef["buttress#1"]?.params.flyer).toBe(true);
    expect(byRef["transept#1"]).toBeDefined();
    expect(r.unsupported.join()).toContain("Déambulatoire");
  });

  it.each([
    ["un château vers 1150", { from: 1140, to: 1160 }],
    ["une église romane du XIe siècle", { from: 1001, to: 1100 }],
    ["un château de la fin du XIIe siècle", { from: 1167, to: 1200 }],
    ["château du début du XIVe siècle", { from: 1301, to: 1333 }],
    ["chapelle en 1320", { from: 1320, to: 1320 }],
  ])("date : « %s »", (text, date) => {
    expect(parseRequest(text).spec.building.date).toEqual(date);
  });

  it("avant 1190, tours et donjon carrés par défaut, et c'est dit", () => {
    const r = parseRequest("un château vers 1100 avec un donjon");
    expect(r.spec.modules.find((m) => m.ref === "tower#1")?.type).toBe("castle.tower.square");
    expect(r.spec.modules.find((m) => m.ref === "keep#1")?.type).toBe("castle.keep.square");
    expect(r.assumptions.join()).toMatch(/carré/);
  });

  it("une demande vague produit quand même une spec valide, avec ses hypothèses", () => {
    const r = parseRequest("fais-moi quelque chose de joli");
    expect(r.spec.modules.length).toBeGreaterThan(0);
    expect(r.assumptions.length).toBeGreaterThanOrEqual(2);
  });

  it("gothique en Languedoc → gothique méridional", () => {
    expect(parseRequest("une cathédrale gothique en Languedoc au XIIIe siècle").spec.building.style).toBe("gothic.southern");
  });
});

describe("Planification", () => {
  it.each([
    [CASTLE, [1201, 1300]],
    ["un petit château du XIIe siècle avec quatre tours carrées et un donjon", [1101, 1200]],
    ["château avec six tours rondes et une porte, vers 1250", [1240, 1260]],
    ["château en Languedoc au XIIIe siècle, huit tours, donjon, logis", [1201, 1300]],
    [CATHEDRAL, [1201, 1300]],
    ["une église romane du XIe siècle, nef unique de 30 m de long", [1001, 1100]],
    ["une abbatiale romane du XIIe siècle à trois vaisseaux avec transept et un clocher", [1101, 1200]],
  ] as const)("« %s » : ni collision, ni élément suspendu, ni alerte critique", async (text, year) => {
    const p = plan(parseRequest(text).spec, { seed: 3 });
    expect(p.modules.length).toBeGreaterThan(5);
    for (const m of p.modules) {
      const def = LIBRARY_BY_TYPE.get(m.type)!;
      for (const [k, v] of Object.entries(m.params)) {
        const pd = def.parameters[k];
        expect(pd, `${m.type}.${k}`).toBeDefined();
        if (pd && (pd.kind === "length" || pd.kind === "count")) {
          expect(v, `${m.name} ${k}`).toBeGreaterThanOrEqual(pd.min);
          expect(v, `${m.name} ${k}`).toBeLessThanOrEqual(pd.max);
        }
      }
    }
    const project = asProject(p, [year[0], year[1]]);
    const d = runDiagnostics({ project, defs: LIBRARY_BY_TYPE, bounds: await bounds(p.modules) });
    const bad = d.filter((x) => x.rule === "ARC-001" || x.rule === "ARC-002" || x.severity === "critical");
    expect(bad.map((x) => `${x.rule} ${x.problem}`)).toEqual([]);
  });

  it("même graine → même plan ; autre graine → proportions différentes, même composition", () => {
    const spec = parseRequest(CASTLE).spec;
    expect(plan(spec, { seed: 7 })).toEqual(plan(spec, { seed: 7 }));
    const a = plan(spec, { seed: 7 }), b = plan(spec, { seed: 8 });
    expect(a.modules.map((m) => m.type)).toEqual(b.modules.map((m) => m.type));
    expect(a.modules.map((m) => m.params)).not.toEqual(b.modules.map((m) => m.params));
  });

  it("la forteresse : 2 enceintes, 8 tours, porte raccordée des deux côtés, donjon, logis", () => {
    const p = plan(parseRequest(CASTLE).spec);
    const count = (t: string) => p.modules.filter((m) => m.type === t).length;
    expect(count("castle.tower.round")).toBe(8);
    expect(count("castle.keep.round")).toBe(1);
    expect(count("castle.entrance.gate")).toBe(1);
    expect(count("castle.residential.hall")).toBe(1);
    const gate = p.modules.find((m) => m.type === "castle.entrance.gate")!;
    expect(p.connections.filter((c) => c.a.module === gate.id || c.b.module === gate.id)).toHaveLength(2);
    // Toute courtine est raccordée à ses deux extrémités.
    for (const w of p.modules.filter((m) => m.type === "castle.wall.curtain")) {
      const ends = p.connections.flatMap((c) => [c.a, c.b]).filter((e) => e.module === w.id).map((e) => e.connector).sort();
      expect(ends).toEqual(["end", "start"]);
    }
  });

  it("la certitude des éléments générés n'est jamais « attesté »", () => {
    for (const text of [CASTLE, CATHEDRAL]) for (const m of plan(parseRequest(text).spec).modules) expect(m.certainty.level).toBe("free_restitution");
  });
});
