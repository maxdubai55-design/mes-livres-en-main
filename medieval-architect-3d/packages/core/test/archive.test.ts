import { describe, expect, it } from "vitest";
import { strToU8, unzipSync, zipSync } from "fflate";
import { loadArchive, saveArchive } from "../src/index.js";
import { instance, project } from "./fixtures.js";

describe("Archive .medieval3d", () => {
  it("enregistrer puis ouvrir redonne exactement le même projet", async () => {
    const p = project([instance("mod_t001", "castle.tower.round", { params: { height: 21000 } })]);
    const bytes = await saveArchive(p, { appVersion: "test", history: ['{"op":"addModule"}'] });
    const r = await loadArchive(bytes);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.project).toEqual(p);
      expect(r.warnings).toEqual([]);
      expect(r.readOnly).toBe(false);
    }
  });

  it("détecte un fichier modifié après enregistrement", async () => {
    const bytes = await saveArchive(project(), { appVersion: "test" });
    const files = unzipSync(bytes);
    const json = JSON.parse(new TextDecoder().decode(files["project.json"]));
    json.name = "Modifié à la main";
    files["project.json"] = strToU8(JSON.stringify(json));
    const r = await loadArchive(zipSync(files));
    expect(r.ok && r.warnings[0]).toContain("altéré");
  });

  it("refuse proprement un fichier qui n'est pas une archive", async () => {
    const r = await loadArchive(strToU8("pas un zip"));
    expect(r).toEqual({ ok: false, error: expect.stringContaining("pas une archive") });
  });

  it("ouvre en lecture seule un fichier d'une version plus récente", async () => {
    const files = unzipSync(await saveArchive(project(), { appVersion: "test" }));
    const m = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
    m.formatVersion = 99;
    files["manifest.json"] = strToU8(JSON.stringify(m));
    const r = await loadArchive(zipSync(files));
    expect(r.ok && r.readOnly).toBe(true);
  });
});
