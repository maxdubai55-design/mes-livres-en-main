import { RegionId, StyleId, type Connection, type ModuleInstance, type Operation } from "@ma3d/core";
import { parseRequest, plan, type ParseResult } from "@ma3d/generation";
import { Studio, emptyProject, newId } from "../studio";
import { h, modal, svg } from "./dom";
import { WELCOME_ICONS } from "./icons";

export const REGION_LABELS: Record<RegionId, string> = {
  "fr.north": "France du Nord",
  "fr.ile-de-france": "Île-de-France",
  "fr.normandy": "Normandie",
  "fr.occitania": "Occitanie",
  "fr.occitania.languedoc": "Languedoc",
  "es.catalonia": "Catalogne",
  "fr.provence": "Provence",
  "en.england": "Angleterre",
  "hre.empire": "Saint-Empire",
  "it.italy": "Italie",
};
export const STYLE_LABELS: Record<StyleId, string> = {
  romanesque: "Roman",
  "gothic.early": "Gothique primitif",
  "gothic.classic": "Gothique classique",
  "gothic.rayonnant": "Gothique rayonnant",
  "gothic.flamboyant": "Gothique flamboyant",
  "gothic.southern": "Gothique méridional",
  fortification: "Fortification",
};

// --- accueil -----------------------------------------------------------------

export function welcome(
  studio: Studio,
  handlers: { castle: () => void; cathedral: () => void; generate: () => void; open: () => void; learn: () => void; resume?: () => void },
): void {
  const card = (icon: string, title: string, text: string, action: (() => void) | null, disabled = false) =>
    h("button", { class: "wcard", disabled, onclick: () => { dlg.close(); action?.(); } }, svg(icon), h("b", {}, title), h("span", {}, text));
  const box = h("div", { class: "dialog", role: "dialog", "aria-label": "Accueil" },
    h("h1", {}, "Medieval Architect 3D"),
    h("p", { class: "lead" }, "Construisez, générez et vérifiez des châteaux, églises et cathédrales médiévales. Aucune connaissance en CAO n'est nécessaire."),
    handlers.resume ? h("div", { class: "box", style: "margin-bottom:12px;display:flex;align-items:center;gap:12px" },
      h("span", {}, "Un travail non enregistré a été retrouvé."),
      h("button", { class: "btn primary", style: "margin-left:auto", onclick: () => { dlg.close(); handlers.resume!(); } }, "Reprendre"),
    ) : null,
    h("div", { class: "welcome" },
      card(WELCOME_ICONS.castle, "Créer un château", "Enceinte, tours, donjon : à la main, pièce par pièce.", handlers.castle),
      card(WELCOME_ICONS.cathedral, "Créer une cathédrale", "Nef, voûtes, contreforts : l'architecture religieuse.", handlers.cathedral),
      card(WELCOME_ICONS.ruin, "Reconstituer une ruine", "Import de relevés et restitution : prévu après le MVP.", null, true),
      card(WELCOME_ICONS.generate, "Générer un édifice", "Décrivez-le en une phrase, je le construis.", handlers.generate),
      card(WELCOME_ICONS.open, "Ouvrir un projet", "Fichier .medieval3d enregistré.", handlers.open),
      card(WELCOME_ICONS.learn, "Apprendre", "Visite guidée en six étapes, moins de dix minutes.", handlers.learn),
    ),
  );
  const dlg = modal(box);
  void studio;
}

// --- génération --------------------------------------------------------------

const EXAMPLES = [
  "Construis une forteresse royale française du XIIIe siècle sur un éperon rocheux de 120 × 60 m, avec quatre tours rondes, un donjon, une double enceinte, une porte fortifiée et un logis.",
  "Crée une cathédrale gothique du XIIIe siècle d'environ 90 m de longueur, nef à trois vaisseaux, transept, chœur à déambulatoire, cinq chapelles rayonnantes, deux tours de façade et arcs-boutants.",
  "Un petit château du XIe siècle avec quatre tours carrées et un donjon carré.",
  "Château en Languedoc au XIIIe siècle, six tours rondes, donjon, porte fortifiée et logis.",
  "Une église romane du XIIe siècle, nef unique de 35 m, avec un clocher.",
];

/**
 * Génération en trois temps, jamais sans l'accord de l'utilisateur :
 * 1. la phrase est analysée et l'interprétation affichée (compris / supposé / pas encore possible) ;
 * 2. le plan est montré en fantôme ;
 * 3. « Valider » l'ajoute au projet en une seule opération annulable.
 */
export function generateDialog(studio: Studio, after: () => void): void {
  const ta = h("textarea", { placeholder: "Décrivez l'édifice : type, siècle, région, dimensions, nombre de tours…", "aria-label": "Description de l'édifice" });
  const examples = h("div", { class: "examples" }, ...EXAMPLES.map((e) => h("button", { onclick: () => { ta.value = e; analyse(); } }, e.length > 60 ? `${e.slice(0, 58)}…` : e)));
  const result = h("div");
  const replace = h("input", { type: "checkbox", checked: Object.keys(studio.project.modules).length === 0 });
  const go = h("button", { class: "btn primary", disabled: true }, "Générer et montrer");
  let parsed: ParseResult | null = null;

  const analyse = () => {
    if (!ta.value.trim()) return;
    parsed = parseRequest(ta.value);
    const box = (title: string, items: string[], empty: string) => h("div", { class: "box" }, h("h3", {}, title), items.length ? h("ul", {}, ...items.map((i) => h("li", {}, i))) : h("p", { class: "empty", style: "padding:0" }, empty));
    result.replaceChildren(
      h("div", { class: "cols" },
        box("Voici ce que j'ai compris", parsed.understood, "—"),
        box("Ce que j'ai supposé", parsed.assumptions, "Rien : tout était précisé."),
        box("Pas encore possible", parsed.unsupported, "Tout sera construit."),
      ),
    );
    go.disabled = false;
  };
  const ana = h("button", { class: "btn", onclick: analyse }, "Analyser");
  ta.addEventListener("keydown", (e) => e.key === "Enter" && (e.ctrlKey || e.metaKey) && analyse());

  go.addEventListener("click", () => {
    if (!parsed) return;
    dlg.close();
    const spec = parsed.spec;
    const notes = parsed.unsupported;
    let seed = 1;
    const propose = () => {
      const p = plan(spec, { seed, idPrefix: newId("x").slice(2, 8) });
      const ops: Operation[] = [];
      if (replace.checked) {
        for (const id of Object.keys(studio.project.modules)) ops.push({ op: "removeModule", id });
        ops.push({
          op: "setContext",
          context: { date: spec.building.date, ...(spec.building.region ? { region: spec.building.region } : {}), ...(spec.building.style ? { style: spec.building.style } : {}) },
          name: capitalize(spec.building.function ?? labelFor(spec.building.type)),
        });
      }
      for (const m of p.modules as ModuleInstance[]) ops.push({ op: "addModule", module: m });
      for (const c of p.connections as Connection[]) ops.push({ op: "connect", connection: c });
      studio.showPreview(`Générer : ${labelFor(spec.building.type)}`, { op: "batch", label: "Génération", ops }, () => {
        studio.project.spec = spec;
        after();
      });
      studio.lastPlanNotes = [...notes, ...p.notes];
      studio.variant = { again: () => { seed++; propose(); } };
    };
    propose();
  });

  const box = h("div", { class: "dialog", role: "dialog", "aria-label": "Générer un édifice" },
    h("h1", {}, "Générer un édifice"),
    h("p", { class: "lead" }, "Écrivez comme vous parleriez. Je vous montre d'abord ce que j'ai compris, puis le résultat en bleu : rien n'est ajouté sans votre accord."),
    ta,
    h("div", { class: "lead", style: "margin:6px 0 0" }, "Exemples :"),
    examples,
    result,
    h("div", { class: "actions" },
      h("label", { style: "margin-right:auto" }, replace, " Remplacer le projet actuel"),
      h("button", { class: "btn", onclick: () => dlg.close() }, "Annuler"),
      ana,
      go,
    ),
  );
  const dlg = modal(box);
}

const labelFor = (t: string) => ({ castle: "château", fortress: "forteresse", keep_only: "donjon", fortified_gate: "porte", abbey: "abbatiale", church: "église", cathedral: "cathédrale", chapel: "chapelle", fortified_church: "église fortifiée" })[t] ?? t;
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

// --- réglages du projet ------------------------------------------------------

export function projectDialog(studio: Studio): void {
  const p = studio.project;
  const name = h("input", { value: p.name, "aria-label": "Nom" });
  const from = h("input", { type: "number", min: 500, max: 1600, value: p.context.date.from });
  const to = h("input", { type: "number", min: 500, max: 1600, value: p.context.date.to });
  const region = h("select", {}, h("option", { value: "" }, "Non précisée"));
  for (const r of RegionId.options) region.append(h("option", { value: r, selected: r === p.context.region }, REGION_LABELS[r]));
  const style = h("select", {}, h("option", { value: "" }, "Non précisé"));
  for (const s of StyleId.options) style.append(h("option", { value: s, selected: s === p.context.style }, STYLE_LABELS[s]));
  const save = () => {
    const f = Math.min(Number(from.value), Number(to.value)), t = Math.max(Number(from.value), Number(to.value));
    studio.run("Réglages du projet", {
      op: "setContext",
      name: name.value.trim() || "Sans titre",
      context: { date: { from: f, to: t }, ...(region.value ? { region: region.value as RegionId } : {}), ...(style.value ? { style: style.value as StyleId } : {}) },
    });
    dlg.close();
  };
  const dlg = modal(h("div", { class: "dialog", style: "max-width:520px" },
    h("h1", {}, "Projet"),
    h("p", { class: "lead" }, "La période et la région servent au contrôle historique."),
    h("div", { class: "formgrid" },
      h("label", {}, "Nom"), name,
      h("label", {}, "Période : de"), from,
      h("label", {}, "à"), to,
      h("label", {}, "Région"), region,
      h("label", {}, "Style"), style,
    ),
    h("div", { class: "actions" }, h("button", { class: "btn", onclick: () => dlg.close() }, "Annuler"), h("button", { class: "btn primary", onclick: save }, "Enregistrer")),
  ));
}

// --- export image / STL ------------------------------------------------------

export function imageDialog(onExport: (w: number, h: number, transparent: boolean) => void): void {
  const sizes: Array<[string, number, number]> = [["Normale (1920 × 1080)", 1920, 1080], ["Élevée (2560 × 1440)", 2560, 1440], ["Très élevée (3840 × 2160)", 3840, 2160]];
  const sel = h("select", {}, ...sizes.map(([l], i) => h("option", { value: i }, l)), h("option", { value: "custom" }, "Personnalisée"));
  const cw = h("input", { type: "number", value: 2000, min: 200, max: 8000 });
  const ch = h("input", { type: "number", value: 1200, min: 200, max: 8000 });
  const tr = h("input", { type: "checkbox" });
  const dlg = modal(h("div", { class: "dialog", style: "max-width:480px" },
    h("h1", {}, "Prendre une photo"),
    h("p", { class: "lead" }, "L'image reprend le cadrage actuel de la vue."),
    h("div", { class: "formgrid" }, h("label", {}, "Qualité"), sel, h("label", {}, "Largeur"), cw, h("label", {}, "Hauteur"), ch, h("label", {}, "Fond transparent"), tr),
    h("div", { class: "actions" },
      h("button", { class: "btn", onclick: () => dlg.close() }, "Annuler"),
      h("button", {
        class: "btn primary",
        onclick: () => {
          dlg.close();
          const s = sizes[Number(sel.value)];
          onExport(s ? s[1] : Number(cw.value), s ? s[2] : Number(ch.value), tr.checked);
        },
      }, "Enregistrer l'image"),
    ),
  ));
}

export function stlDialog(onExport: (scale: number) => void): void {
  const sel = h("select", {}, ...[50, 100, 200, 500].map((s) => h("option", { value: s, selected: s === 200 }, `1:${s}`)), h("option", { value: "custom" }, "Personnalisée"));
  const custom = h("input", { type: "number", value: 300, min: 10, max: 5000 });
  const dlg = modal(h("div", { class: "dialog", style: "max-width:480px" },
    h("h1", {}, "Exporter pour l'impression 3D"),
    h("p", { class: "lead" }, "Fichier STL en millimètres. Je vérifie que chaque volume est fermé."),
    h("div", { class: "formgrid" }, h("label", {}, "Échelle"), sel, h("label", {}, "1:"), custom),
    h("div", { class: "actions" },
      h("button", { class: "btn", onclick: () => dlg.close() }, "Annuler"),
      h("button", { class: "btn primary", onclick: () => { dlg.close(); onExport(sel.value === "custom" ? Number(custom.value) : Number(sel.value)); } }, "Exporter le STL"),
    ),
  ));
}

// --- aide ----------------------------------------------------------------------

export function helpDialog(): void {
  const rows: Array<[string, string]> = [
    ["Clic gauche", "Sélectionner"],
    ["Clic gauche + glisser", "Tourner autour de la scène"],
    ["Clic droit + glisser", "Se déplacer latéralement"],
    ["Molette", "Zoomer"],
    ["Double-clic / F", "Cadrer l'élément sélectionné"],
    ["G / R", "Mode déplacer / tourner"],
    ["Ctrl + Z / Ctrl + Y", "Annuler / rétablir"],
    ["Ctrl + D", "Dupliquer"],
    ["Suppr", "Supprimer"],
    ["Ctrl + S / Ctrl + O", "Enregistrer / ouvrir"],
    ["Alt (pendant un déplacement)", "Désactiver l'aimantation"],
    ["Échap", "Désélectionner, fermer"],
  ];
  const dlg = modal(h("div", { class: "dialog", style: "max-width:560px" },
    h("h1", {}, "Raccourcis"),
    h("table", { style: "width:100%;border-collapse:collapse;margin-top:8px" }, ...rows.map(([k, v]) => h("tr", {}, h("td", { style: "padding:4px 8px;border-bottom:1px solid var(--line);white-space:nowrap" }, h("b", {}, k)), h("td", { style: "padding:4px 8px;border-bottom:1px solid var(--line)" }, v)))),
    h("p", { class: "lead", style: "margin-top:12px" }, "Couleurs d'aimantation : vert = raccord correct, orange = inhabituel (autorisé), rouge = impossible."),
    h("div", { class: "actions" }, h("button", { class: "btn primary", onclick: () => dlg.close() }, "Fermer")),
  ));
}

// --- tutoriel -------------------------------------------------------------------

const STEPS: Array<{ title: string; text: string; target?: string }> = [
  { title: "Ajouter une tour", text: "Dans la bibliothèque à gauche, cliquez « Tour ronde ». Elle apparaît au centre de la vue.", target: '[data-type="castle.tower.round"]' },
  { title: "La déplacer", text: "Faites glisser une des flèches colorées. Tourner autour de la scène : clic gauche dans le vide et glisser. Zoom : molette." },
  { title: "La régler", text: "À droite, déplacez le curseur « Hauteur » ou tapez une valeur. La tour se recalcule." , target: ".props" },
  { title: "Ajouter un mur et le raccorder", text: "Ajoutez un « Mur d'enceinte », puis approchez son extrémité de la tour : une pastille verte signale un raccord correct. Relâchez.", target: '[data-type="castle.wall.curtain"]' },
  { title: "Lire les contrôles", text: "En bas à droite, les contrôles expliquent chaque problème : pourquoi, quel risque, comment corriger. Le bouton « Corriger » montre la solution en bleu avant de l'appliquer.", target: ".diags" },
  { title: "Enregistrer et exporter", text: "« Enregistrer » garde votre projet (.medieval3d). « Exporter » produit une image, un modèle 3D (GLB) ou un fichier d'impression 3D (STL). Vous savez l'essentiel !", target: "#btn-save" },
];

export function tutorial(): void {
  let i = 0;
  const box = h("div", { class: "tuto", role: "dialog", "aria-live": "polite" });
  const show = () => {
    document.querySelectorAll(".highlight").forEach((e) => e.classList.remove("highlight"));
    const s = STEPS[i]!;
    if (s.target) document.querySelector(s.target)?.classList.add("highlight");
    box.replaceChildren(
      h("div", { class: "step" }, `Étape ${i + 1} sur ${STEPS.length}`),
      h("h3", { style: "margin:4px 0" }, s.title),
      h("p", { style: "margin:4px 0 10px" }, s.text),
      h("div", { class: "row", style: "justify-content:flex-end" },
        h("button", { class: "btn", onclick: close }, "Quitter"),
        i > 0 ? h("button", { class: "btn", onclick: () => { i--; show(); } }, "Précédent") : null,
        h("button", { class: "btn primary", onclick: () => { if (++i >= STEPS.length) close(); else show(); } }, i === STEPS.length - 1 ? "Terminer" : "Suivant"),
      ),
    );
  };
  const close = () => {
    document.querySelectorAll(".highlight").forEach((e) => e.classList.remove("highlight"));
    box.remove();
  };
  document.body.append(box);
  show();
}

export { emptyProject };
