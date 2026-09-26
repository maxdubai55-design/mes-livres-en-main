import { describe, expect, it } from "vitest";
import { History, OperationError, Project, apply, preview, type ModuleInstance } from "../src/index.js";

const tower = (id: string, extra: Partial<ModuleInstance> = {}): ModuleInstance => ({
  id,
  type: "castle.tower.round",
  definitionVersion: "0.1.0",
  transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
  params: {},
  certainty: { level: "free_restitution", provenance: "user", sources: [] },
  paramCertainty: {},
  state: { lockedByUser: false, hidden: false, aiLocked: false },
  tags: [],
  ...extra,
});

const emptyProject = (): Project =>
  Project.parse({
    schemaVersion: 1,
    id: "p1",
    name: "Essai",
    kind: "creation",
    context: { date: { from: 1250, to: 1250 } },
    settings: {},
    levels: [],
    modules: {},
    connections: [],
    libraryLock: {},
  });

describe("Opérations et historique", () => {
  it("annuler puis rétablir retrouve exactement le même état", () => {
    const p = emptyProject();
    const h = new History(p);
    h.do("ajouter tour", { op: "addModule", module: tower("mod_t001") });
    h.do("hauteur", { op: "setParam", id: "mod_t001", param: "height", value: 24000 });
    const after = structuredClone(p);
    h.undo();
    expect(p.modules.mod_t001?.params.height).toBeUndefined();
    h.undo();
    expect(p.modules).toEqual({});
    h.redo();
    h.redo();
    expect(p).toEqual(after);
  });

  it("supprimer un module retire ses connexions et sous-modules ; annuler restaure tout", () => {
    const p = emptyProject();
    apply(p, { op: "addModule", module: tower("mod_t001") });
    apply(p, { op: "addModule", module: tower("mod_t002") });
    apply(p, { op: "addModule", module: tower("mod_crown1", { type: "castle.defense.hoarding", parent: "mod_t001", slot: "crown" }) });
    apply(p, { op: "connect", connection: { id: "cnx_0001", a: { module: "mod_t001", connector: "flank[0]" }, b: { module: "mod_t002", connector: "flank[1]" }, acknowledged: false } });
    const before = structuredClone(p);

    const inverse = apply(p, { op: "removeModule", id: "mod_t001" });
    expect(Object.keys(p.modules)).toEqual(["mod_t002"]);
    expect(p.connections).toEqual([]);

    apply(p, inverse);
    expect(p.modules).toEqual(before.modules);
    expect(p.connections).toEqual(before.connections);
  });

  it("un lot qui échoue au milieu ne laisse aucune trace", () => {
    const p = emptyProject();
    const before = structuredClone(p);
    expect(() =>
      apply(p, {
        op: "batch",
        label: "correction IA",
        ops: [
          { op: "addModule", module: tower("mod_t001") },
          { op: "setParam", id: "mod_absent", param: "height", value: 1 },
        ],
      }),
    ).toThrow(OperationError);
    expect(p).toEqual(before);
  });

  it("la prévisualisation en fantôme ne modifie pas le projet", () => {
    const p = emptyProject();
    const ghost = preview(p, { op: "addModule", module: tower("mod_t001") });
    expect(Object.keys(ghost.modules)).toEqual(["mod_t001"]);
    expect(p.modules).toEqual({});
  });

  it("conserve au moins 100 niveaux d'annulation", () => {
    const p = emptyProject();
    const h = new History(p, 100);
    h.do("ajouter", { op: "addModule", module: tower("mod_t001") });
    for (let i = 0; i < 150; i++) h.do(`h${i}`, { op: "setParam", id: "mod_t001", param: "height", value: 10000 + i });
    let n = 0;
    while (h.undo()) n++;
    expect(n).toBe(100);
    expect(() => new History(p, 50)).toThrow(RangeError);
  });

  it("changer la période du projet s'annule comme le reste", () => {
    const p = emptyProject();
    const h = new History(p);
    h.do("période", { op: "setContext", context: { date: { from: 1100, to: 1150 }, region: "fr.normandy" }, name: "Falaise" });
    expect(p.context.region).toBe("fr.normandy");
    expect(p.name).toBe("Falaise");
    h.undo();
    expect(p.context).toEqual({ date: { from: 1250, to: 1250 } });
    expect(p.name).toBe("Essai");
  });

  it("mettre à jour un module conserve ses raccords, et s'annule", () => {
    const p = emptyProject();
    apply(p, { op: "addModule", module: tower("mod_t001") });
    apply(p, { op: "addModule", module: tower("mod_t002") });
    apply(p, { op: "connect", connection: { id: "cnx_0001", a: { module: "mod_t001", connector: "flank[0]" }, b: { module: "mod_t002", connector: "flank[2]" }, acknowledged: false } });
    const inv = apply(p, { op: "updateModule", id: "mod_t001", patch: { state: { lockedByUser: true, hidden: false, aiLocked: false }, type: "castle.tower.square" } });
    expect(p.modules.mod_t001?.state.lockedByUser).toBe(true);
    expect(p.connections).toHaveLength(1);
    apply(p, inv);
    expect(p.modules.mod_t001?.type).toBe("castle.tower.round");
    expect(p.modules.mod_t001?.state.lockedByUser).toBe(false);
  });
});
