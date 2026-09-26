// Test de bout en bout : pilote l'application construite dans Chromium, comme un utilisateur.
// Usage : npm run e2e -w @ma3d/studio   (options : --headed, --keep pour garder les captures)
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { preview } from "vite";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(`${execSync("npm root -g").toString().trim()}/playwright`));
}

const args = new Set(process.argv.slice(2));
const OUT = "e2e/resultats";
mkdirSync(OUT, { recursive: true });
const results = [];
const t0 = performance.now();
const step = async (name, fn) => {
  const s = performance.now();
  try {
    const detail = await fn();
    results.push({ name, ok: true, ms: Math.round(performance.now() - s), ...(detail ? { detail } : {}) });
    console.log(`✓ ${name}${detail ? ` — ${JSON.stringify(detail)}` : ""}`);
  } catch (e) {
    results.push({ name, ok: false, error: String(e).split("\n")[0] });
    console.log(`✗ ${name} — ${String(e).split("\n")[0]}`);
  }
};

const server = await preview({ preview: { port: 4174, strictPort: true }, logLevel: "warn" });
const browser = await chromium.launch({ headless: !args.has("--headed"), args: ["--enable-unsafe-webgpu", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
const S = (fn, arg) => page.evaluate(fn, arg);
const count = () => S(() => Object.keys(window.__ma3d.studio.project.modules).length);
const settled = () => page.waitForFunction(() => {
  const s = window.__ma3d.studio;
  return Object.keys(s.project.modules).every((id) => s.bounds.has(id));
}, null, { timeout: 90_000 });
const download = async (trigger) => {
  const [d] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), trigger()]);
  const path = `${OUT}/${d.suggestedFilename()}`;
  await d.saveAs(path);
  return { file: d.suggestedFilename(), octets: statSync(path).size, path };
};
const menuItem = async (menu, item) => {
  await page.getByRole("button", { name: menu }).first().click();
  await page.getByRole("menuitem", { name: item }).click();
};

try {
  await step("chargement de l'application", async () => {
    await page.goto("http://localhost:4174/?nowelcome");
    await page.waitForFunction(() => window.__ma3d?.vp?.renderer, null, { timeout: 60_000 });
    return { rendu: await S(() => window.__ma3d.vp.backend) };
  });

  await step("écran d'accueil : six cartes, dont une désactivée", async () => {
    await page.getByRole("button", { name: "Aide" }).click();
    await page.getByRole("menuitem", { name: "Accueil" }).click();
    const n = await page.locator(".wcard").count();
    const disabled = await page.locator(".wcard:disabled").count();
    await page.keyboard.press("Escape");
    if (n !== 6 || disabled !== 1) throw new Error(`${n} cartes, ${disabled} désactivée(s)`);
  });

  await step("ajouter une tour ronde depuis la bibliothèque", async () => {
    await page.locator('[data-type="castle.tower.round"]').click();
    await settled();
    if ((await count()) !== 1) throw new Error("pas de module");
  });

  await step("régler la hauteur au clavier (25 m)", async () => {
    await page.locator("#p-height").fill("25");
    await page.locator("#p-height").press("Enter");
    await page.locator("#p-height").dispatchEvent("change");
    const h = await S(() => window.__ma3d.studio.selected.params.height);
    if (h !== 25000) throw new Error(`hauteur = ${h}`);
  });

  await step("annuler / rétablir", async () => {
    await page.locator("canvas").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.getByRole("button", { name: "Annuler" }).click();
    const a = await S(() => Object.values(window.__ma3d.studio.project.modules)[0]?.params.height);
    await page.getByRole("button", { name: "Rétablir" }).click();
    const b = await S(() => Object.values(window.__ma3d.studio.project.modules)[0]?.params.height);
    if (a !== undefined || b !== 25000) throw new Error(`${a} → ${b}`);
  });

  await step("dupliquer (Ctrl+D) puis contrôles : deux tours superposées ? non, décalées", async () => {
    await S(() => window.__ma3d.studio.select(Object.keys(window.__ma3d.studio.project.modules)[0]));
    await page.locator("body").press("Control+d");
    await settled();
    if ((await count()) !== 2) throw new Error(`${await count()} modules`);
  });

  await step("anachronisme : tour ronde en 1050 → avertissement historique", async () => {
    await S(() => window.__ma3d.studio.run("période", { op: "setContext", context: { date: { from: 1050, to: 1050 } } }));
    await S(() => window.__ma3d.studio.runDiagnosticsNow());
    const rules = await S(() => window.__ma3d.studio.diagnostics.map((d) => d.rule));
    if (!rules.includes("HIS-001")) throw new Error(JSON.stringify(rules));
    await page.locator(".diag", { hasText: "anachronique" }).first().click();
    await page.getByRole("button", { name: /Remplacer par/ }).first().click();
    await page.getByRole("button", { name: "Valider" }).click();
    const types = await S(() => Object.values(window.__ma3d.studio.project.modules).map((m) => m.type));
    if (!types.includes("castle.tower.square")) throw new Error(JSON.stringify(types));
    return { correction: "tour ronde → tour carrée, via l'aperçu en fantôme" };
  });

  await step("aimantation : un mur approché d'une tour s'y raccorde (point vert)", async () => {
    await S(() => window.__ma3d.studio.load(window.__ma3d.emptyProject()));
    await page.locator('[data-type="castle.tower.round"]').click();
    await settled();
    const tower = await S(() => window.__ma3d.studio.selection);
    await page.locator('[data-type="castle.wall.curtain"]').click();
    await settled();
    // On place le début du mur à 1,2 m du flanc est de la tour (rayon 4,5 m), comme au bout d'un glisser.
    const res = await S(() => {
      const { vp, studio } = window.__ma3d;
      const id = studio.selection;
      const rec = vp.recs.get(id);
      rec.group.position.set(5.7, 0, -0.8);
      vp.onGizmoMove();
      const snap = vp.snap && { color: vp.snap.color, mine: vp.snap.mine, theirs: vp.snap.theirs };
      vp.commitGizmo();
      return { snap, pos: studio.project.modules[id].transform.position, connections: studio.project.connections.length };
    });
    if (res.snap?.color !== "green" || res.connections !== 1) throw new Error(JSON.stringify(res));
    if (res.pos[0] !== 4500 || res.pos[1] !== 0 || res.pos[2] !== 0) throw new Error(`position ${res.pos}`);
    void tower;
    return res;
  });

  await step("générer la forteresse du cahier des charges", async () => {
    await page.getByRole("button", { name: "✦ Générer" }).click();
    await page.locator(".examples button").first().click();
    await page.getByLabel("Remplacer le projet actuel").check();
    const g0 = performance.now();
    await page.getByRole("button", { name: "Générer et montrer" }).click();
    await page.getByRole("button", { name: "Valider" }).click();
    await settled();
    const ms = Math.round(performance.now() - g0);
    await S(() => window.__ma3d.studio.runDiagnosticsNow());
    const d = await S(() => window.__ma3d.studio.diagnostics.filter((x) => !x.dismissed).map((x) => `${x.severity} ${x.rule}`));
    await S(() => window.__ma3d.vp.view("iso"));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/forteresse.png` });
    return { modules: await count(), msJusquaGeometrieComplete: ms, diagnostics: d };
  });

  await step("vue Analyse", async () => {
    await page.getByRole("button", { name: "Analyser" }).click();
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/forteresse-analyse.png` });
    await page.getByRole("button", { name: "Analyser" }).click();
  });

  await step("assistant : « Peux-tu corriger mon projet ? »", async () => {
    await page.getByRole("button", { name: /maître d'œuvre/ }).click();
    await page.locator(".assistant .quick button", { hasText: "corriger" }).click();
    const txt = await page.locator(".assistant .msg:not(.me) .bubble").last().textContent();
    await page.locator(".assistant header button").click();
    return { réponse: txt.slice(0, 120) };
  });

  let saved;
  await step("enregistrer (.medieval3d)", async () => {
    saved = await download(() => page.getByRole("button", { name: "Enregistrer" }).click());
    return saved;
  });

  await step("exporter en GLB", async () => download(() => menuItem("Exporter", "Modèle 3D GLB")));

  await step("exporter une image PNG 1920 × 1080", async () => {
    return download(async () => {
      await menuItem("Exporter", "Image PNG…");
      await page.getByRole("button", { name: "Enregistrer l'image" }).click();
    });
  });

  await step("exporter en STL 1:200", async () => {
    return download(async () => {
      await menuItem("Exporter", "Impression 3D STL…");
      await page.getByRole("button", { name: "Exporter le STL" }).click();
    });
  });

  await step("nouveau projet puis réouverture du fichier enregistré", async () => {
    const before = await count();
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Nouveau" }).click();
    if ((await count()) !== 0) throw new Error("projet non vidé");
    const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.getByRole("button", { name: "Ouvrir" }).click()]);
    await chooser.setFiles(saved.path);
    await page.waitForFunction((n) => Object.keys(window.__ma3d.studio.project.modules).length === n, before, { timeout: 30_000 });
    return { modules: before };
  });

  await step("générer la cathédrale du cahier des charges", async () => {
    await page.getByRole("button", { name: "✦ Générer" }).click();
    await page.locator(".examples button").nth(1).click();
    await page.getByLabel("Remplacer le projet actuel").check();
    const g0 = performance.now();
    await page.getByRole("button", { name: "Générer et montrer" }).click();
    await page.getByRole("button", { name: "Valider" }).click();
    await settled();
    const ms = Math.round(performance.now() - g0);
    await S(() => window.__ma3d.studio.runDiagnosticsNow());
    const d = await S(() => window.__ma3d.studio.diagnostics.filter((x) => !x.dismissed).map((x) => `${x.severity} ${x.rule}`));
    await S(() => window.__ma3d.vp.view("iso"));
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/cathedrale.png` });
    await menuItem("Vue", "Transparent");
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/cathedrale-transparente.png` });
    await menuItem("Vue", "Réaliste");
    const stats = await S(() => ({ ...window.__ma3d.vp.stats, requêtesGéométrie: window.__ma3d.vp.store.requests }));
    return { modules: await count(), msJusquaGeometrieComplete: ms, diagnostics: d, ...stats };
  });

  await step("aucune erreur JavaScript pendant la session", async () => {
    const real = errors.filter((e) => !/favicon|GroupMarkerNotSet|swiftshader|WebGPU/i.test(e));
    if (real.length) throw new Error(real.slice(0, 3).join(" | "));
  });
} finally {
  await browser.close();
  await server.close();
}

const failed = results.filter((r) => !r.ok);
writeFileSync(`${OUT}/rapport.json`, JSON.stringify({ date: new Date().toISOString(), dureeS: Math.round((performance.now() - t0) / 1000), results, errors }, null, 2));
console.log(`\n${results.length - failed.length}/${results.length} étapes réussies en ${Math.round((performance.now() - t0) / 1000)} s.`);
process.exit(failed.length ? 1 : 0);
