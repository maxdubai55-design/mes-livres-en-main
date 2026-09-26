import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { BuildingSpecification, checkSpecReferences } from "../src/index.js";

const load = (f: string) => JSON.parse(readFileSync(new URL(`../examples/${f}`, import.meta.url), "utf8"));

describe("BuildingSpecification", () => {
  it.each(["forteresse-royale-xiii.spec.json", "cathedrale-gothique-xiii.spec.json"])(
    "l'exemple %s du cahier des charges est valide et cohérent",
    (f) => {
      const spec = BuildingSpecification.parse(load(f));
      expect(checkSpecReferences(spec)).toEqual([]);
    },
  );

  it("détecte une relation vers une intention inexistante", () => {
    const spec = BuildingSpecification.parse(load("forteresse-royale-xiii.spec.json"));
    spec.relations.push({ kind: "flanks", from: "tower#1", to: "enceinte.middle#1" });
    expect(checkSpecReferences(spec)).toEqual(["relation flanks : « enceinte.middle#1 » inconnu"]);
  });

  it("refuse une spec sans aucun module", () => {
    const raw = load("forteresse-royale-xiii.spec.json");
    raw.modules = [];
    expect(BuildingSpecification.safeParse(raw).success).toBe(false);
  });

  it("refuse une datation inversée", () => {
    const raw = load("forteresse-royale-xiii.spec.json");
    raw.building.date = { from: 1300, to: 1201 };
    expect(BuildingSpecification.safeParse(raw).success).toBe(false);
  });
});
