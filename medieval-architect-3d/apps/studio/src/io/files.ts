import { LIBRARY_BY_TYPE, loadArchive, saveArchive, sortDiagnostics, type Project } from "@ma3d/core";
import type * as THREE from "three/webgpu";
import { APP_VERSION, type Studio } from "../studio";
import type { Viewport } from "../scene/viewport";
import { download, h, toast } from "../ui/dom";

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase() || "projet";

/** Enregistre le projet au format .medieval3d, avec une vignette. */
export async function saveProject(studio: Studio, vp: Viewport): Promise<void> {
  let thumbnail: Uint8Array | undefined;
  try {
    thumbnail = new Uint8Array(await (await vp.snapshot(480, 270, false)).arrayBuffer());
  } catch {
    /* vignette facultative */
  }
  const bytes = await saveArchive(studio.project, { appVersion: APP_VERSION, history: studio.log, ...(thumbnail ? { thumbnail } : {}) });
  download(new Blob([bytes as BlobPart], { type: "application/zip" }), `${slug(studio.project.name)}.medieval3d`);
  studio.dirty = false;
  toast("Projet enregistré.");
}

export function openProject(studio: Studio, after: () => void): void {
  const input = h("input", { type: "file", accept: ".medieval3d,application/zip", style: "display:none" });
  input.addEventListener("change", async () => {
    const f = input.files?.[0];
    input.remove();
    if (!f) return;
    const r = await loadArchive(new Uint8Array(await f.arrayBuffer()));
    if (!r.ok) return toast(r.error, 6000);
    studio.load(r.project);
    for (const w of r.warnings) toast(w, 6000);
    after();
    toast(`« ${r.project.name} » ouvert.`);
  });
  document.body.append(input);
  input.click();
}

export async function exportGlb(studio: Studio, vp: Viewport): Promise<void> {
  const { GLTFExporter } = await import("three/addons/exporters/GLTFExporter.js");
  const { scene } = await vp.exportScene(studio.project);
  const data = await new GLTFExporter().parseAsync(scene as unknown as THREE.Object3D, { binary: true });
  download(new Blob([data as ArrayBuffer], { type: "model/gltf-binary" }), `${slug(studio.project.name)}.glb`);
  toast("Modèle GLB exporté (géométrie, positions, matériaux).");
}

export async function exportStl(studio: Studio, vp: Viewport, scale: number): Promise<void> {
  const { STLExporter } = await import("three/addons/exporters/STLExporter.js");
  const { scene, notWatertight } = await vp.exportScene(studio.project);
  // Impression 3D : millimètres à l'échelle choisie (1:100 → 1 m réel = 10 mm imprimés).
  scene.scale.setScalar(1000 / scale);
  scene.updateMatrixWorld(true);
  const data = new STLExporter().parse(scene as unknown as THREE.Object3D, { binary: true }) as DataView;
  download(new Blob([data.buffer as ArrayBuffer], { type: "model/stl" }), `${slug(studio.project.name)}-1-${scale}.stl`);
  toast(notWatertight.length ? `STL exporté. Attention, volumes non fermés : ${notWatertight.join(", ")}` : `STL exporté à l'échelle 1:${scale}, tous les volumes sont fermés.`, 5000);
}

export async function exportPng(vp: Viewport, name: string, w: number, h2: number, transparent: boolean): Promise<void> {
  const blob = await vp.snapshot(w, h2, transparent);
  download(blob, `${slug(name)}-${w}x${h2}.png`);
  toast(`Image ${w} × ${h2} enregistrée.`);
}

/** Rapport imprimable : modules, certitude, diagnostics (acceptés compris). */
export function openReport(studio: Studio, vp: Viewport): void {
  const p: Project = studio.project;
  const mods = Object.values(p.modules);
  const cert: Record<string, string> = { attested: "Attesté", very_probable: "Très probable", hypothetical: "Hypothétique", free_restitution: "Restitution libre" };
  const rows = mods.map((m) => {
    const d = LIBRARY_BY_TYPE.get(m.type);
    const b = studio.bounds.get(m.id);
    const dims = b ? `${((b.max[0] - b.min[0]) / 1000).toFixed(1)} × ${((b.max[1] - b.min[1]) / 1000).toFixed(1)} × ${((b.max[2] - b.min[2]) / 1000).toFixed(1)} m` : "";
    return `<tr><td>${esc(m.name ?? d?.label.plain ?? m.type)}</td><td>${esc(d?.label.technical ?? "")}</td><td>${dims}</td><td>${cert[m.certainty.level]}</td></tr>`;
  });
  const diags = sortDiagnostics(studio.diagnostics).map(
    (d) => `<li><b>[${d.rule}] ${esc(d.problem)}</b>${d.dismissed ? " <i>(accepté par l'utilisateur)</i>" : ""}<br>Pourquoi : ${esc(d.why)}<br>Risque : ${esc(d.risk)}${d.disclaimer ? `<br><small>${esc(d.disclaimer)}</small>` : ""}</li>`,
  );
  vp.snapshot(1600, 900, false).then((blob) => {
    const img = URL.createObjectURL(blob);
    const w = window.open("", "_blank");
    if (!w) return toast("Autorisez les fenêtres surgissantes pour afficher le rapport.");
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Rapport — ${esc(p.name)}</title>
<style>body{font:14px/1.5 system-ui,sans-serif;max-width:900px;margin:24px auto;padding:0 16px;color:#222}h1{margin-bottom:0}table{border-collapse:collapse;width:100%}td,th{border-bottom:1px solid #ddd;padding:4px 6px;text-align:left}img{width:100%;border-radius:8px}small{color:#666}</style></head><body>
<h1>${esc(p.name)}</h1><p>Période : ${p.context.date.from}–${p.context.date.to}${p.context.region ? ` · Région : ${esc(p.context.region)}` : ""}${p.context.style ? ` · Style : ${esc(p.context.style)}` : ""}<br>Rapport généré le ${new Date().toLocaleString("fr-FR")} par Medieval Architect 3D ${APP_VERSION}.</p>
<img src="${img}" alt="Vue du projet">
<h2>Éléments (${mods.length})</h2><table><tr><th>Élément</th><th>Terme technique</th><th>Dimensions</th><th>Certitude</th></tr>${rows.join("")}</table>
<h2>Contrôles (${diags.length})</h2><ul>${diags.join("") || "<li>Aucun problème détecté.</li>"}</ul>
<p><small>Les contrôles structurels sont des estimations de plausibilité, pas une certification d'ingénierie. Les données historiques de la bibliothèque sont des fourchettes indicatives, non encore validées par un historien.</small></p>
<script>setTimeout(()=>print(),600)</script></body></html>`);
    w.document.close();
  });
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
