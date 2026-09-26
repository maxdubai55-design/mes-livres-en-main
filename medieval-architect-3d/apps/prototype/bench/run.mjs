// Mesures du lot 0 : lance le build de production, ouvre la scène dans Chromium,
// attend la fin des calculs, relève window.__bench et une capture d'écran.
// Usage : npm run bench [-- --webgl] [-- --headed]
import { execSync } from "node:child_process";
import { preview } from "vite";
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";

const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch {
  ({ chromium } = require(`${execSync("npm root -g").toString().trim()}/playwright`));
}

const args = new Set(process.argv.slice(2));
const step = (m) => console.error(`[${(performance.now() / 1000).toFixed(1)} s] ${m}`);
const server = await preview({ preview: { port: 4173, strictPort: true }, logLevel: "warn" });

const browser = await chromium.launch({
  headless: !args.has("--headed"),
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
});
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  step("ouverture de la page");
  await page.goto(`http://localhost:4173/${args.has("--webgl") ? "?webgl" : ""}`);
  await page.waitForFunction(() => window.__bench?.ready, null, { timeout: 60_000 });
  step("scène prête");
  await page.waitForTimeout(4000); // laisse la mesure d'images/s se stabiliser
  const result = await page.evaluate(() => window.__bench);
  step("capture");
  await page.screenshot({ timeout: 30_000,  path: args.has("--webgl") ? "bench/capture-webgl.png" : "bench/capture.png" }).catch((e) => errors.push(`capture impossible : ${e.message.split("\n")[0]}`));
  const report = { date: new Date().toISOString(), userAgent: await page.evaluate(() => navigator.userAgent), result, errors };
  const out = args.has("--webgl") ? "bench/dernier-resultat-webgl.json" : "bench/dernier-resultat.json";
  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser.close();
  await server.close();
}
