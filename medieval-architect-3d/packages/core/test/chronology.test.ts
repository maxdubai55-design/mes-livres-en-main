import { describe, expect, it } from "vitest";
import { century, checkChronology } from "../src/index.js";
import { hoarding, machicolation, roundTower } from "../src/library/castle.js";

describe("Contrôle chronologique", () => {
  it("tour ronde au XIIIe : compatible", () => {
    expect(checkChronology(roundTower.history, { date: century(13) }).verdict).toBe("compatible");
  });

  it("tour ronde vers 1150 : possible mais atypique", () => {
    expect(checkChronology(roundTower.history, { date: { from: 1150, to: 1150 } }).verdict).toBe("atypical");
  });

  it("tour ronde vers 1050 : improbable (anachronique), avec équivalent proposé", () => {
    const v = checkChronology(roundTower.history, { date: { from: 1050, to: 1050 } });
    expect(v.verdict).toBe("improbable");
    expect(v.suggestion).toBe("castle.tower.square");
    expect(v.reason).toContain("trop tôt");
  });

  it("mâchicoulis de pierre au XIIe : improbable → propose le hourd", () => {
    const v = checkChronology(machicolation.history, { date: { from: 1150, to: 1160 } });
    expect(v.verdict).toBe("improbable");
    expect(v.suggestion).toBe("castle.defense.hoarding");
  });

  it("hourd au XVe : survivance atypique, pas une interdiction", () => {
    expect(checkChronology(hoarding.history, { date: { from: 1420, to: 1420 } }).verdict).toBe("atypical");
  });

  it("sans donnée historique : « inconnu », jamais « compatible » par défaut", () => {
    expect(checkChronology([], { date: century(13) }).verdict).toBe("unknown");
  });

  it("la sous-région hérite de sa région mère", () => {
    const usage = [{ attested: { from: 1200, to: 1300 }, regions: ["fr.occitania" as const], sources: [] }];
    expect(checkChronology(usage, { date: century(13), region: "fr.occitania.languedoc" }).verdict).toBe("compatible");
    expect(checkChronology(usage, { date: century(13), region: "fr.normandy" }).verdict).toBe("improbable");
  });
});
