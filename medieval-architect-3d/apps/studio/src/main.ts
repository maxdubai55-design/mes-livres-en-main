import "./styles.css";
import { LIBRARY_BY_TYPE, type Diagnostic } from "@ma3d/core";
import { SUGGESTIONS, ask } from "./assistant";
import { exportGlb, exportPng, exportStl, openProject, openReport, saveProject } from "./io/files";
import { toModel, Viewport } from "./scene/viewport";
import type { DisplayMode } from "./scene/materials";
import { APP_VERSION, Studio, emptyProject } from "./studio";
import { diagnosticsPanel } from "./ui/diagnostics-panel";
import { generateDialog, helpDialog, imageDialog, projectDialog, stlDialog, tutorial, welcome } from "./ui/dialogs";
import { fill, h, toast } from "./ui/dom";
import { libraryPanel } from "./ui/library-panel";
import { propertiesPanel } from "./ui/properties-panel";

/**
 * Point d'entrée : assemble l'interface (§2.3).
 *  - barre supérieure : Nouveau, Ouvrir, Enregistrer, Annuler, Rétablir, Vue, Analyser, Rendu, Exporter ;
 *  - colonne gauche : bibliothèque ; centre : scène 3D ; colonne droite : propriétés et contrôles ;
 *  - bas : état du projet et « Demander au maître d'œuvre ».
 */

const studio = new Studio();
const app = document.getElementById("app")!;
const params = new URLSearchParams(location.search);

// --- barre supérieure ------------------------------------------------------------

function menu(label: string, items: Array<[string, () => void, string?] | "sep">, id?: string): HTMLElement {
  const wrap = h("div", { class: "menu" });
  const btn = h("button", { class: "tb", "aria-haspopup": "true", id }, label, " ▾");
  const list = h("div", { class: "menu-list", role: "menu" });
  for (const it of items) {
    if (it === "sep") list.append(h("hr"));
    else list.append(h("button", { role: "menuitem", onclick: () => { wrap.classList.remove("open"); it[1](); } }, it[0], it[2] ? h("span", { class: "hint" }, it[2]) : null));
  }
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    const was = wrap.classList.contains("open");
    document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open"));
    if (!was) wrap.classList.add("open");
  });
  wrap.append(btn, list);
  return wrap;
}
document.addEventListener("click", () => document.querySelectorAll(".menu.open").forEach((m) => m.classList.remove("open")));

const undoBtn = h("button", { class: "tb", title: "Annuler (Ctrl+Z)", onclick: () => studio.undo(), "aria-label": "Annuler" }, "↶ Annuler");
const redoBtn = h("button", { class: "tb", title: "Rétablir (Ctrl+Y)", onclick: () => studio.redo(), "aria-label": "Rétablir" }, "↷ Rétablir");
const modeSeg = h("div", { class: "seg", role: "group", "aria-label": "Niveau d'interface" });
for (const [m, label] of [["discovery", "Découverte"], ["creation", "Création"], ["expert", "Expert"]] as const) {
  modeSeg.append(h("button", { "aria-pressed": String(studio.mode === m), "data-mode": m, onclick: () => studio.setMode(m) }, label));
}

const viewportEl = h("div", { class: "viewport" });
const vp = new Viewport(viewportEl, studio);

const newProject = () => {
  if (studio.dirty && Object.keys(studio.project.modules).length && !confirm("Abandonner les modifications non enregistrées ?")) return;
  studio.load(emptyProject());
  Studio.clearAutosave();
};

const topbar = h("header", { class: "topbar" },
  h("span", { class: "brand" }, "Medieval Architect 3D"),
  h("button", { class: "tb", onclick: newProject }, "Nouveau"),
  h("button", { class: "tb", onclick: () => openProject(studio, () => vp.frameAll()), title: "Ctrl+O" }, "Ouvrir"),
  h("button", { class: "tb", id: "btn-save", onclick: () => saveProject(studio, vp), title: "Ctrl+S" }, "Enregistrer"),
  h("span", { class: "sep" }),
  undoBtn,
  redoBtn,
  h("span", { class: "sep" }),
  menu("Vue", [
    ["Réaliste", () => setDisplay("realistic")],
    ["Matériau neutre", () => setDisplay("neutral")],
    ["Fil de fer", () => setDisplay("wireframe")],
    ["Transparent", () => setDisplay("transparent")],
    ["Structure porteuse seule", () => setDisplay("structure")],
    "sep",
    ["Perspective", () => vp.setOrthographic(false)],
    ["Orthographique", () => vp.setOrthographic(true)],
    ["Tout cadrer", () => vp.frameAll(), "Accueil"],
    "sep",
    ["Silhouette humaine (échelle)", () => { humanOn = !humanOn; vp.toggleHuman(humanOn); }],
    ["Aimantation aux raccords", () => { vp.snapEnabled = !vp.snapEnabled; toast(`Aimantation ${vp.snapEnabled ? "activée" : "désactivée"}.`); }],
    ["Aimantation à la grille (0,5 m / 15°)", () => { vp.setGridSnap(!vp.gridSnap); toast(`Grille ${vp.gridSnap ? "activée" : "désactivée"}.`); }],
  ]),
  h("button", { class: "tb", onclick: () => { setDisplay(vp.mode === "analysis" ? "realistic" : "analysis"); studio.runDiagnosticsNow(); }, title: "Colore chaque élément selon les contrôles" }, "Analyser"),
  menu("Rendu", [
    ["Prendre une photo…", () => imageDialog((w, hh, t) => exportPng(vp, studio.project.name, w, hh, t))],
    ["Rapport imprimable", () => openReport(studio, vp)],
  ]),
  menu("Exporter", [
    ["Image PNG…", () => imageDialog((w, hh, t) => exportPng(vp, studio.project.name, w, hh, t))],
    ["Modèle 3D GLB", () => exportGlb(studio, vp)],
    ["Impression 3D STL…", () => stlDialog((s) => exportStl(studio, vp, s))],
  ], "btn-export"),
  h("span", { class: "sep" }),
  h("button", { class: "tb primary", onclick: () => generateDialog(studio, () => setTimeout(() => vp.frameAll(), 300)) }, "✦ Générer"),
  h("button", { class: "tb", onclick: () => projectDialog(studio) }, "Projet"),
  h("span", { class: "spacer" }),
  modeSeg,
  menu("Aide", [
    ["Accueil", () => showWelcome()],
    ["Visite guidée", () => tutorial()],
    ["Raccourcis", () => helpDialog()],
    ["Thème clair / sombre", () => toggleTheme()],
  ]),
);
let humanOn = false;

// --- colonnes --------------------------------------------------------------------

const addFromLibrary = (type: string) => {
  const t = vp.controls?.target;
  const at = t ? toModel(t.clone().setY(0)) : ([0, 0, 0] as [number, number, number]);
  // léger décalage si quelque chose occupe déjà le point visé
  const busy = [...studio.bounds.values()].some((b) => at[0] > b.min[0] && at[0] < b.max[0] && at[1] > b.min[1] && at[1] < b.max[1]);
  if (busy) at[0] += 12000;
  at[0] = Math.round(at[0] / 500) * 500;
  at[1] = Math.round(at[1] / 500) * 500;
  studio.add(type, [at[0], at[1], 0]);
  vp.setGizmoMode("translate");
};

const focusDiag = (d: Diagnostic) => {
  if (d.subjects[0]) studio.select(d.subjects[0]);
  const b = d.subjects[0] ? studio.bounds.get(d.subjects[0]) : undefined;
  if (d.focus) vp.focusModel(d.focus);
  else if (b) vp.frameSelection();
};

const right = h("aside", { class: "panel right" },
  propertiesPanel(studio, {
    duplicate: () => studio.selection && studio.duplicate(studio.selection),
    remove: () => studio.selection && studio.remove(studio.selection),
    frame: () => vp.frameSelection(),
  }),
  diagnosticsPanel(studio, focusDiag),
);

const measure = h("div", { class: "measure", hidden: true });
const opacity = h("div", { class: "opacity" }, "Opacité ", h("input", { type: "range", min: 0.05, max: 0.9, step: 0.05, value: 0.35, oninput: (e: Event) => { vp.materials.setOpacity(Number((e.target as HTMLInputElement).value)); vp.requestRender(); } }));
const snapInfo = h("div", { class: "floating", hidden: true });
const previewBar = h("div", { class: "floating", hidden: true });
const viewcube = h("div", { class: "viewcube", "aria-label": "Vues" },
  ...([["Dessus", "top"], ["Face", "front"], ["Arrière", "back"], ["Gauche", "left"], ["Iso", "iso"], ["Droite", "right"]] as const).map(([l, v]) => h("button", { onclick: () => vp.view(v) }, l)),
);
viewportEl.append(measure, opacity, snapInfo, previewBar, viewcube);

vp.onMeasure = (t) => {
  measure.hidden = !t;
  measure.textContent = t;
};
vp.onSnap = (s) => {
  snapInfo.hidden = !s || s.color === "green";
  if (s && s.color !== "green") snapInfo.textContent = `Raccord inhabituel : ${s.reasons.join(" ; ")}`;
};

// --- barre d'état et assistant ----------------------------------------------------

const status = h("div", { class: "pill" });
const diagSummary = h("div", { class: "pill" });
const perf = h("div", { class: "pill", title: "Moteur de rendu" });
const assistantBtn = h("button", { class: "tb ask", onclick: () => toggleAssistant() }, "💬 Demander au maître d'œuvre");
const statusbar = h("footer", { class: "statusbar" }, status, diagSummary, perf, assistantBtn);

const log = h("div", { class: "log", "aria-live": "polite" });
const input = h("input", { placeholder: "Posez votre question…", "aria-label": "Question au maître d'œuvre" });
const assistant = h("section", { class: "assistant", "aria-label": "Maître d'œuvre" },
  h("header", {}, "Maître d'œuvre", h("button", { onclick: () => toggleAssistant(false), "aria-label": "Fermer" }, "×")),
  log,
  h("div", { class: "quick" }, ...SUGGESTIONS.map((s) => h("button", { onclick: () => askAndShow(s) }, s))),
  h("form", { onsubmit: (e: Event) => { e.preventDefault(); if (input.value.trim()) askAndShow(input.value); input.value = ""; } }, input, h("button", { class: "btn primary" }, "Envoyer")),
);
function toggleAssistant(force?: boolean): void {
  const open = force ?? !assistant.classList.contains("open");
  assistant.classList.toggle("open", open);
  if (open) {
    if (!log.children.length) log.append(h("div", { class: "msg" }, h("span", { class: "bubble" }, "Bonjour. Sélectionnez un élément et posez-moi une question, ou choisissez-en une ci-dessous.")));
    input.focus();
  }
}
function askAndShow(q: string): void {
  const a = ask(studio, q, { focus: focusDiag });
  log.append(h("div", { class: "msg me" }, h("span", { class: "bubble" }, q)));
  const bubble = h("span", { class: "bubble" }, a.text);
  const msg = h("div", { class: "msg" }, bubble);
  if (a.actions?.length) msg.append(h("div", { class: "row" }, ...a.actions.map((x) => h("button", { class: "btn", onclick: x.run }, x.label))));
  log.append(msg);
  log.scrollTop = log.scrollHeight;
}

// --- mise en page -----------------------------------------------------------------

app.append(topbar, h("div", { class: "main" }, libraryPanel(studio, addFromLibrary), viewportEl, right), statusbar);
document.body.append(assistant);

function setDisplay(mode: DisplayMode): void {
  vp.setMode(mode);
  opacity.classList.toggle("show", mode === "transparent");
}

function toggleTheme(): void {
  const r = document.documentElement;
  const dark = r.dataset.theme === "dark" || (!r.dataset.theme && matchMedia("(prefers-color-scheme: dark)").matches);
  r.dataset.theme = dark ? "light" : "dark";
  try {
    localStorage.setItem("ma3d.theme", r.dataset.theme);
  } catch {
    /* rien */
  }
}
try {
  const t = localStorage.getItem("ma3d.theme");
  if (t) document.documentElement.dataset.theme = t;
} catch {
  /* rien */
}

function refreshChrome(): void {
  undoBtn.disabled = !studio.canUndo;
  redoBtn.disabled = false;
  const n = Object.keys(studio.project.modules).length;
  status.textContent = `${studio.project.name} · ${studio.project.context.date.from}–${studio.project.context.date.to} · ${n} élément${n > 1 ? "s" : ""}${studio.dirty ? " · non enregistré" : ""}`;
  modeSeg.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === studio.mode)));
}

function refreshDiagSummary(): void {
  const active = studio.diagnostics.filter((d) => !d.dismissed);
  const count = (s: string) => active.filter((d) => d.severity === s).length;
  fill(diagSummary,
    ...(["critical", "warning", "notice"] as const).map((s) => h("span", { class: "pill", title: s }, h("span", { class: `dot ${s}` }), String(count(s)))),
    active.length === 0 ? h("span", { class: "pill" }, h("span", { class: "dot ok" }), "aucun problème") : null,
  );
  if (vp.mode === "analysis") vp.refreshTints();
}

function refreshPreview(): void {
  const p = studio.preview;
  previewBar.hidden = !p;
  if (!p) return;
  const notes = studio.variant ? studio.lastPlanNotes : [];
  fill(previewBar,
    h("span", {}, h("b", {}, "Aperçu : "), p.label, notes.length ? h("span", { style: "color:var(--muted)" }, ` (${notes.length} remarque${notes.length > 1 ? "s" : ""})`) : null),
    notes.length ? h("button", { class: "btn", onclick: () => toast(notes.join(" · "), 9000) }, "Remarques") : null,
    studio.variant ? h("button", { class: "btn", onclick: () => studio.variant?.again() }, "Autre variante") : null,
    h("button", { class: "btn", onclick: () => studio.cancelPreview() }, "Annuler"),
    h("button", { class: "btn primary", onclick: () => p.onAccept() }, "Valider"),
  );
}

studio.on((r) => {
  if (r === "project") {
    vp.sync();
    refreshChrome();
  } else if (r === "selection") {
    vp.refreshTints();
    vp.updateSelection();
  } else if (r === "diagnostics") refreshDiagSummary();
  else if (r === "mode") refreshChrome();
  else if (r === "preview") {
    vp.sync();
    refreshPreview();
    if (studio.preview && Object.keys(studio.project.modules).length === 0) setTimeout(() => vp.view("iso"), 50);
  }
});

// --- clavier ------------------------------------------------------------------------

document.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  const ctrl = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (ctrl && k === "z" && !e.shiftKey) { e.preventDefault(); studio.undo(); }
  else if (ctrl && (k === "y" || (k === "z" && e.shiftKey))) { e.preventDefault(); studio.redo(); }
  else if (ctrl && k === "s") { e.preventDefault(); saveProject(studio, vp); }
  else if (ctrl && k === "o") { e.preventDefault(); openProject(studio, () => vp.frameAll()); }
  else if (ctrl && k === "d") { e.preventDefault(); if (studio.selection) studio.duplicate(studio.selection); }
  else if (k === "delete" || k === "backspace") { if (studio.selection) studio.remove(studio.selection); }
  else if (k === "escape") { if (studio.preview) studio.cancelPreview(); else studio.select(null); }
  else if (k === "f") vp.frameSelection();
  else if (k === "home") vp.frameAll();
  else if (k === "g") vp.setGizmoMode("translate");
  else if (k === "r") vp.setGizmoMode("rotate");
  else if (k === "alt") vp.snapEnabled = false;
});
document.addEventListener("keyup", (e) => {
  if (e.key === "Alt") vp.snapEnabled = true;
});
addEventListener("beforeunload", (e) => {
  if (studio.dirty && Object.keys(studio.project.modules).length) e.preventDefault();
});

// --- démarrage ----------------------------------------------------------------------

function showWelcome(): void {
  const saved = Studio.readAutosave();
  welcome(studio, {
    castle: () => {
      studio.load(emptyProject("Mon château", [1201, 1300], undefined, "fortification"));
      toast("Commencez par une tour ronde, dans la bibliothèque à gauche.");
    },
    cathedral: () => {
      studio.load(emptyProject("Ma cathédrale", [1201, 1300], "fr.ile-de-france", "gothic.classic"));
      const s = document.querySelector<HTMLInputElement>(".search");
      if (s) {
        s.value = "nef";
        s.dispatchEvent(new Event("input"));
      }
      toast("Commencez par une nef, puis ajoutez voûtes et contreforts.");
    },
    generate: () => generateDialog(studio, () => setTimeout(() => vp.frameAll(), 300)),
    open: () => openProject(studio, () => vp.frameAll()),
    learn: () => tutorial(),
    ...(saved ? { resume: () => { studio.load(saved.project); setTimeout(() => vp.frameAll(), 400); } } : {}),
  });
}

await vp.init(params.has("webgl"));
perf.textContent = `Rendu : ${vp.backend}`;
vp.sync();
refreshChrome();
refreshDiagSummary();
if (!params.has("nowelcome")) showWelcome();

// Accès de test (e2e) et de débogage : lecture seule en usage normal.
(window as unknown as { __ma3d: unknown }).__ma3d = { studio, vp, version: APP_VERSION, defs: LIBRARY_BY_TYPE, emptyProject };
