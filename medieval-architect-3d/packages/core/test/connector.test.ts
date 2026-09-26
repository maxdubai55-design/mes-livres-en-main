import { describe, expect, it } from "vitest";
import { IDENTITY_TRANSFORM, evaluateSnap, kindCompatibility, type ResolvedConnector } from "../src/index.js";

const c = (kind: ResolvedConnector["kind"], role: ResolvedConnector["role"] = "neutral", size = 0): ResolvedConnector => ({
  name: "x",
  kind,
  role,
  size,
  frame: IDENTITY_TRANSFORM,
});

describe("Connecteurs", () => {
  it("la table est symétrique", () => {
    expect(kindCompatibility("tower.flank", "wall.end")).toBe(kindCompatibility("wall.end", "tower.flank"));
  });

  it("courtine sur tour : vert", () => {
    expect(evaluateSnap(c("wall.end", "neutral", 2200), c("tower.flank", "neutral", 2500)).color).toBe("green");
  });

  it("épaisseurs trop différentes : orange, avec la raison", () => {
    const v = evaluateSnap(c("wall.end", "neutral", 1000), c("wall.end", "neutral", 3000));
    expect(v.color).toBe("orange");
    expect(v.reasons[0]).toContain("épaisseurs");
  });

  it("naissance de voûte sur pile : vert ; arc-boutant posé sur un mur : orange", () => {
    expect(evaluateSnap(c("support.top", "carries"), c("arch.springer", "is_carried")).color).toBe("green");
    expect(evaluateSnap(c("flying.foot", "is_carried"), c("wall.face", "carries")).color).toBe("orange");
  });

  it("toiture sur fondation : rouge", () => {
    const v = evaluateSnap(c("roof.eave"), c("foundation"));
    expect(v.color).toBe("red");
    expect(v.reasons).toHaveLength(1);
  });
});
