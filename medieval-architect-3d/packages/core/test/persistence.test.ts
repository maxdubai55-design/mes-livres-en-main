import { describe, expect, it } from "vitest";
import { CURRENT_FORMAT_VERSION, planMigrations, sortDiagnostics } from "../src/index.js";

describe("Format de fichier", () => {
  it("un fichier à jour n'a pas de migration", () => {
    expect(planMigrations(CURRENT_FORMAT_VERSION, [])).toEqual([]);
  });

  it("un fichier plus récent que l'application est signalé", () => {
    expect(planMigrations(CURRENT_FORMAT_VERSION + 1, [])).toBe("newer");
  });
});

describe("Diagnostics", () => {
  it("tri : gravité d'abord, puis structure avant histoire", () => {
    const sorted = sortDiagnostics([
      { severity: "notice", domain: "history" },
      { severity: "critical", domain: "history" },
      { severity: "critical", domain: "structure" },
    ]);
    expect(sorted.map((d) => `${d.severity}/${d.domain}`)).toEqual([
      "critical/structure",
      "critical/history",
      "notice/history",
    ]);
  });
});
