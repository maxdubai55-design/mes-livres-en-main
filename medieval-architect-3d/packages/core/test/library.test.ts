import { describe, expect, it } from "vitest";
import { Material, ModuleDefinition, checkParameters, resolveParameters } from "../src/index.js";
import { LIBRARY, MATERIALS, roundTower } from "../src/library/index.js";

describe("Bibliothèque", () => {
  it.each(LIBRARY.map((d) => [d.type, d] as const))("%s respecte le schéma ModuleDefinition", (_t, def) => {
    expect(() => ModuleDefinition.parse(def)).not.toThrow();
  });

  it("chaque valeur par défaut est dans ses bornes (un module neuf ne naît jamais en erreur)", () => {
    for (const def of LIBRARY) {
      const issues = checkParameters(def.parameters, {});
      expect(issues.filter((i) => i.severity === "error"), def.type).toEqual([]);
    }
  });

  it.each(MATERIALS.map((m) => [m.id, m] as const))("le matériau %s respecte le schéma Material", (_id, m) => {
    expect(() => Material.parse(m)).not.toThrow();
  });

  it("chaque matériau par défaut d'un module existe au catalogue", () => {
    const ids = new Set(MATERIALS.map((m) => m.id));
    for (const def of LIBRARY)
      for (const [k, p] of Object.entries(def.parameters))
        if (p.kind === "material") expect(ids.has(p.default), `${def.type}.${k}`).toBe(true);
  });

  it("les types proposés en remplacement existent", () => {
    const types = new Set(LIBRARY.map((d) => d.type));
    for (const def of LIBRARY)
      for (const h of def.history) if (h.equivalentIfAnachronic) expect(types.has(h.equivalentIfAnachronic), def.type).toBe(true);
  });

  it("l'historique par valeur de paramètre ne vise que des paramètres et valeurs existants", () => {
    for (const def of LIBRARY)
      for (const [param, byValue] of Object.entries(def.paramHistory)) {
        const p = def.parameters[param];
        expect(p, `${def.type}.${param}`).toBeDefined();
        for (const v of Object.keys(byValue)) {
          if (p!.kind === "enum") expect(p!.options).toContain(v);
          if (p!.kind === "boolean") expect(["true", "false"]).toContain(v);
        }
      }
  });
});

describe("Paramètres", () => {
  const defs = roundTower.parameters;

  it("valeur inhabituelle : avertissement, pas erreur", () => {
    const issues = checkParameters(defs, { diameter: 20000 });
    expect(issues).toEqual([{ param: "diameter", severity: "warning", message: "valeur inhabituellement élevée" }]);
  });

  it("valeur impossible : erreur", () => {
    expect(checkParameters(defs, { floors: 12 })[0]?.severity).toBe("error");
  });

  it("longueur non entière refusée (tout est en mm entiers)", () => {
    expect(checkParameters(defs, { height: 18000.5 })[0]?.message).toBe("entier attendu");
  });

  it("paramètre inconnu signalé", () => {
    expect(checkParameters(defs, { colour: "red" })[0]?.message).toContain("inconnu");
  });

  it("résolution : les valeurs absentes prennent le défaut", () => {
    const r = resolveParameters(defs, { height: 25000 });
    expect(r.height).toBe(25000);
    expect(r.diameter).toBe(9000);
    expect(r.roof).toBe("conical");
  });
});
