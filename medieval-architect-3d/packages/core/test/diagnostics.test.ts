import { describe, expect, it } from "vitest";
import { LIBRARY_BY_TYPE, apply, fixToOperation, runDiagnostics, type AABB, type DiagnosticContext } from "../src/index.js";
import { instance, project } from "./fixtures.js";

const box = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): AABB => ({ min: [x0, y0, z0], max: [x1, y1, z1] });

function ctx(p: ReturnType<typeof project>, bounds: Record<string, AABB>): DiagnosticContext {
  return { project: p, defs: LIBRARY_BY_TYPE, bounds: new Map(Object.entries(bounds)) };
}
const rules = (ds: { rule: string }[]) => ds.map((d) => d.rule).sort();
let n = 0;
const newId = () => `mod_new${String(++n).padStart(3, "0")}`;

describe("Règles historiques", () => {
  it("HIS-001 : tour ronde en 1050, remplacement proposé par une tour carrée", () => {
    const p = project([instance("mod_t001", "castle.tower.round")], 1050);
    const d = runDiagnostics(ctx(p, {}));
    expect(rules(d)).toEqual(["HIS-001"]);
    const op = fixToOperation(p, LIBRARY_BY_TYPE, d[0]!.fixes[0]!, newId);
    apply(p, op);
    expect(p.modules.mod_t001?.type).toBe("castle.tower.square");
  });

  it("HIS-003 : voûte d'ogives en 1050 → proposition de revenir à une forme d'époque", () => {
    const p = project([instance("mod_v001", "church.vault", { params: { kind: "ribbed" } })], 1050);
    const d = runDiagnostics(ctx(p, {}));
    expect(rules(d)).toEqual(["HIS-003"]);
    expect(d[0]!.fixes[0]!.operations[0]).toMatchObject({ op: "setParam", param: "kind", value: "barrel" });
  });

  it("aucun diagnostic historique pour un château cohérent en 1250", () => {
    const p = project([instance("mod_t001", "castle.tower.round"), instance("mod_w001", "castle.wall.curtain")], 1250);
    expect(runDiagnostics(ctx(p, {}))).toEqual([]);
  });

  it("arc-boutant en 1100 : improbable", () => {
    const p = project([instance("mod_b001", "church.buttress", { params: { flyer: true } })], 1100);
    expect(rules(runDiagnostics(ctx(p, {})))).toEqual(["HIS-003"]);
  });
});

describe("Règles architecturales", () => {
  it("ARC-001 : un mur suspendu à 5 m est signalé, la correction le pose au sol", () => {
    const p = project([instance("mod_w001", "castle.wall.curtain", { transform: { position: [0, 0, 5000], rotation: [0, 0, 0, 1] } })]);
    const d = runDiagnostics(ctx(p, { mod_w001: box(0, -1100, 5000, 20000, 1100, 14000) }));
    expect(rules(d)).toEqual(["ARC-001"]);
    apply(p, fixToOperation(p, LIBRARY_BY_TYPE, d[0]!.fixes[0]!, newId));
    expect(p.modules.mod_w001?.transform.position).toEqual([0, 0, 0]);
  });

  it("ARC-001 : pas d'alerte si l'élément repose sur un autre", () => {
    const p = project([instance("mod_w001", "castle.wall.curtain"), instance("mod_m001", "castle.defense.machicolation")], 1350);
    const d = runDiagnostics(ctx(p, { mod_w001: box(0, -1100, 0, 20000, 1100, 9000), mod_m001: box(0, -1000, 8000, 12000, 400, 11000) }));
    expect(rules(d)).toEqual([]);
  });

  it("ARC-002 : deux tours superposées ; tolérance pour un simple contact", () => {
    const p = project([instance("mod_t001", "castle.tower.round"), instance("mod_t002", "castle.tower.round")]);
    expect(rules(runDiagnostics(ctx(p, { mod_t001: box(0, 0, 0, 9000, 9000, 18000), mod_t002: box(2000, 0, 0, 11000, 9000, 18000) })))).toEqual(["ARC-002"]);
    expect(rules(runDiagnostics(ctx(p, { mod_t001: box(0, 0, 0, 9000, 9000, 18000), mod_t002: box(8800, 0, 0, 17800, 9000, 18000) })))).toEqual([]);
  });

  it("ARC-002 : un raccord déclaré n'est pas une collision", () => {
    const p = project([instance("mod_t001", "castle.tower.round"), instance("mod_w001", "castle.wall.curtain")]);
    p.connections.push({ id: "cnx_0001", a: { module: "mod_t001", connector: "flank[0]" }, b: { module: "mod_w001", connector: "start" }, acknowledged: false });
    const d = runDiagnostics(ctx(p, { mod_t001: box(0, 0, 0, 9000, 9000, 18000), mod_w001: box(3000, 3000, 0, 20000, 6000, 9000) }));
    expect(rules(d)).toEqual([]);
  });

  it("ARC-003 : mur trop percé", () => {
    const p = project([instance("mod_w001", "castle.wall.curtain", { params: { length: 10000, openingType: "door", openingCount: 4 } })]);
    const d = runDiagnostics(ctx(p, {}));
    expect(rules(d)).toEqual(["ARC-003"]);
    expect(d[0]!.severity).toBe("critical");
  });
});

describe("Règles structurelles", () => {
  it("STR-001 : tour de 40 m pour 6 m de diamètre, avec avertissement de non-certification", () => {
    const p = project([instance("mod_t001", "castle.tower.round", { params: { height: 40000, diameter: 6000 } })]);
    const d = runDiagnostics(ctx(p, {}));
    expect(rules(d)).toEqual(["STR-001"]);
    expect(d[0]!.severity).toBe("critical");
    expect(d[0]!.disclaimer).toContain("ingénieur");
  });

  it("STR-002 : voûte en l'air sans appui → corriger ajoute quatre colonnes", () => {
    const p = project([instance("mod_v001", "church.vault", { transform: { position: [0, 0, 10000], rotation: [0, 0, 0, 1] } })]);
    const d = runDiagnostics(ctx(p, { mod_v001: box(-3250, -5000, 10000, 3250, 5000, 15400) }));
    const s = d.find((x) => x.rule === "STR-002")!;
    expect(s.severity).toBe("critical");
    apply(p, fixToOperation(p, LIBRARY_BY_TYPE, s.fixes[0]!, newId));
    expect(Object.values(p.modules).filter((m) => m.type === "church.support.column")).toHaveLength(4);
  });

  it("STR-002 : pas d'alerte si des colonnes portent la voûte", () => {
    const p = project([instance("mod_v001", "church.vault"), instance("mod_c001", "church.support.column")]);
    const d = runDiagnostics(ctx(p, { mod_v001: box(-3250, -5000, 8000, 3250, 5000, 13000), mod_c001: box(-3850, -5600, 0, -2650, -4400, 8000) }));
    expect(rules(d)).not.toContain("STR-002");
  });

  it("STR-004 : grande voûte haute sans contrefort", () => {
    const p = project([instance("mod_v001", "church.vault", { params: { spanX: 9000, spanY: 12000 } }), instance("mod_c001", "church.support.column")]);
    const d = runDiagnostics(ctx(p, { mod_v001: box(-4500, -6000, 20000, 4500, 6000, 26000), mod_c001: box(-5000, -6500, 0, -4000, -5500, 20000) }));
    expect(rules(d)).toContain("STR-004");
  });

  it("« Continuer ainsi » est conservé", () => {
    const p = project([instance("mod_t001", "castle.tower.round", { params: { height: 40000, diameter: 6000 } })]);
    p.dismissedDiagnostics.push({ rule: "STR-001", subjects: ["mod_t001"] });
    expect(runDiagnostics(ctx(p, {}))[0]!.dismissed).toBe(true);
  });
});

describe("Règles restantes : chacune a un cas qui la déclenche", () => {
  it("HIS-002 : mâchicoulis en 1250 → possible mais atypique (notice)", () => {
    const d = runDiagnostics(ctx(project([instance("mod_m001", "castle.defense.machicolation")], 1250), {}));
    expect(d.map((x) => `${x.rule}/${x.severity}`)).toEqual(["HIS-002/notice"]);
  });

  it("HIS-004 : porte à tours de flanquement en 1170 → atypique", () => {
    const d = runDiagnostics(ctx(project([instance("mod_g001", "castle.entrance.gate", { params: { flankingTowers: true } })], 1170), {}));
    expect(rules(d)).toEqual(["HIS-004"]);
  });

  it("ARC-004 : courtine qui touche une tour sans raccord ; rien une fois raccordée", () => {
    const p = project([instance("mod_t001", "castle.tower.round"), instance("mod_w001", "castle.wall.curtain")]);
    const b = { mod_t001: box(-4500, -4500, 0, 4500, 4500, 18000), mod_w001: box(5000, -1100, 0, 25000, 1100, 9000) };
    expect(rules(runDiagnostics(ctx(p, b)))).toEqual(["ARC-004"]);
    p.connections.push({ id: "cnx_0001", a: { module: "mod_w001", connector: "start" }, b: { module: "mod_t001", connector: "flank[0]" }, acknowledged: false });
    expect(rules(runDiagnostics(ctx(p, b)))).toEqual([]);
  });

  it("STR-003 : voûte posée au sol", () => {
    const p = project([instance("mod_v001", "church.vault")]);
    expect(rules(runDiagnostics(ctx(p, { mod_v001: box(-3250, -5000, 0, 3250, 5000, 5400) })))).toEqual(["STR-003"]);
  });
});

