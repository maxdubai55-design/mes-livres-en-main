import { describe, expect, it } from "vitest";
import { Certainty, weakestCertainty } from "../src/index.js";

describe("Certitude documentaire", () => {
  it("« attesté » sans source est refusé", () => {
    expect(Certainty.safeParse({ level: "attested", provenance: "user", sources: [] }).success).toBe(false);
  });

  it("l'IA ne peut pas produire d'« attesté », même avec source", () => {
    const r = Certainty.safeParse({ level: "attested", provenance: "ai", sources: ["src_plan-1"] });
    expect(r.success).toBe(false);
  });

  it("l'IA peut proposer une hypothèse", () => {
    expect(Certainty.safeParse({ level: "hypothetical", provenance: "ai" }).success).toBe(true);
  });

  it("un ensemble prend la certitude de son élément le plus faible", () => {
    expect(weakestCertainty(["attested", "hypothetical", "very_probable"])).toBe("hypothetical");
    expect(weakestCertainty([])).toBe("attested");
  });
});
