import {
  LIBRARY_BY_TYPE,
  MATERIALS,
  OPTION_LABELS,
  checkParameters,
  resolveParameters,
  type CertaintyLevel,
  type ParameterDef,
  type ParameterValue,
} from "@ma3d/core";
import { yaw, yawOf } from "@ma3d/geometry/src/transform.js";
import type { Studio, UiMode } from "../studio";
import { h } from "./dom";

const TIER_RANK: Record<UiMode, number> = { discovery: 0, creation: 1, expert: 2 };
const CERT_LABELS: Record<CertaintyLevel, string> = {
  attested: "Attesté",
  very_probable: "Très probable",
  hypothetical: "Hypothétique",
  free_restitution: "Restitution libre",
};

/**
 * Propriétés de l'objet sélectionné (colonne droite).
 * Mode Découverte : paramètres essentiels ; Création et Expert : le reste, replié.
 * Les curseurs appliquent la valeur en direct (aperçu) et l'enregistrent au relâchement.
 */
export function propertiesPanel(studio: Studio, actions: { duplicate: () => void; remove: () => void; frame: () => void }): HTMLElement {
  const root = h("div", { class: "props", "aria-label": "Propriétés" });

  const render = () => {
    root.replaceChildren();
    const m = studio.selected;
    if (!m) {
      const n = Object.keys(studio.project.modules).length;
      root.append(
        h("h2", { style: "padding:0 0 6px" }, "Propriétés"),
        h("p", { class: "empty", style: "padding:0" }, n
          ? "Cliquez sur un élément de la scène pour le modifier."
          : "Commencez par choisir un élément dans la bibliothèque, à gauche, ou par « Générer » un édifice."),
        projectSummary(studio),
      );
      return;
    }
    const def = LIBRARY_BY_TYPE.get(m.type);
    if (!def) {
      root.append(h("p", { class: "empty" }, `Module « ${m.type} » à résoudre : bibliothèque absente.`));
      return;
    }
    const values = resolveParameters(def.parameters, m.params);
    const issues = checkParameters(def.parameters, m.params);
    const rank = TIER_RANK[studio.mode];
    root.append(
      h("div", { class: "title" }, m.name ?? def.label.plain),
      h("div", { class: "subtitle" }, def.label.technical ? `${def.label.plain} (${def.label.technical})` : def.label.plain),
    );

    const simple = h("div");
    const advanced = h("details", { class: "adv" }, h("summary", {}, "Réglages avancés"));
    for (const [key, p] of Object.entries(def.parameters)) {
      const tier = TIER_RANK[p.tier];
      if (tier > rank) continue;
      const target = tier === 0 || (studio.mode === "expert" && tier === 1) ? simple : advanced;
      target.append(field(studio, m.id, key, p, values[key]!, issues.filter((i) => i.param === key)));
    }
    root.append(simple);
    if (advanced.children.length > 1) root.append(advanced);

    // Orientation : degrés, par pas de 15° en mode découverte.
    const angle = Math.round(yawOf(m.transform.rotation));
    const rot = h("input", { type: "number", step: studio.mode === "discovery" ? 15 : 1, value: angle, "aria-label": "Orientation en degrés" });
    rot.addEventListener("change", () => {
      studio.run("Tourner", { op: "setTransform", id: m.id, transform: { position: m.transform.position, rotation: yaw(Number(rot.value)) } });
    });
    root.append(h("div", { class: "field" }, h("label", {}, "Orientation (°)"), rot));

    if (studio.mode !== "discovery") {
      const sel = h("select", { "aria-label": "Niveau de certitude" });
      for (const [k, label] of Object.entries(CERT_LABELS)) sel.append(h("option", { value: k, selected: k === m.certainty.level }, label));
      sel.addEventListener("change", () => {
        const level = sel.value as CertaintyLevel;
        if (level === "attested") {
          const src = prompt("Une donnée attestée doit citer une source. Référence (plan, fouille, publication) :");
          if (!src) return render();
          const id = `src_${src.replace(/[^A-Za-z0-9]/g, "").slice(0, 10) || "saisie"}`;
          studio.run("Certitude", { op: "updateModule", id: m.id, patch: { certainty: { level, provenance: "user", sources: [id], note: src } } });
          return;
        }
        studio.run("Certitude", { op: "updateModule", id: m.id, patch: { certainty: { level, provenance: "user", sources: m.certainty.sources } } });
      });
      root.append(h("div", { class: "field" }, h("label", {}, h("span", { class: `cert ${m.certainty.level}` }), "Certitude documentaire"), sel));
    }

    root.append(
      h("div", { class: "row" },
        h("button", { class: "btn", onclick: actions.frame, title: "Double-clic dans la vue ou touche F" }, "Cadrer"),
        h("button", { class: "btn", onclick: actions.duplicate, title: "Ctrl + D" }, "Dupliquer"),
        h("button", {
          class: "btn",
          onclick: () => {
            studio.run(m.state.lockedByUser ? "Déverrouiller" : "Verrouiller", { op: "updateModule", id: m.id, patch: { state: { ...m.state, lockedByUser: !m.state.lockedByUser } } });
          },
        }, m.state.lockedByUser ? "Déverrouiller" : "Verrouiller"),
        h("button", { class: "btn danger", onclick: actions.remove, disabled: m.state.lockedByUser, title: "Suppr" }, "Supprimer"),
      ),
    );
    if (def.learnMore) {
      root.append(
        h("details", { class: "learn" },
          h("summary", {}, h("b", { style: "display:inline" }, "En savoir plus")),
          h("p", {}, def.learnMore.short),
          h("p", {}, h("b", {}, "Rôle"), def.learnMore.role),
          h("p", {}, h("b", {}, "Période"), def.learnMore.period),
        ),
      );
    }
    if (studio.mode === "expert") {
      const mat = MATERIALS.find((x) => x.id === values.material);
      if (mat?.mechanics) {
        const k = mat.mechanics;
        root.append(h("div", { class: "learn" }, h("b", {}, `Mécanique : ${mat.label.plain}`),
          `Densité ${k.density} kg/m³ · E ${k.youngModulus} MPa · compression ${k.compressiveStrength} MPa · traction ${k.tensileStrength} MPa (valeurs de littérature, non mesurées)`));
      }
    }
  };

  studio.on((r) => (r === "selection" || r === "project" || r === "mode") && render());
  render();
  return root;
}

function field(studio: Studio, id: string, key: string, p: ParameterDef, value: ParameterValue, issues: { severity: string; message: string }[]): HTMLElement {
  const label = h("label", { for: `p-${key}` }, p.label.plain, p.label.technical ? h("span", { class: "tech" }, ` (${p.label.technical})`) : null);
  // Une valeur identique n'est pas une modification : pas d'entrée vide dans l'historique.
  const commit = (v: ParameterValue) => v !== value && studio.run(p.label.plain, { op: "setParam", id, param: key, value: v });
  const wrap = h("div", { class: "field" });
  switch (p.kind) {
    case "length": {
      const num = h("input", { id: `p-${key}`, type: "number", step: 0.1, min: p.min / 1000, max: p.max / 1000, value: (Number(value) / 1000).toFixed(2) });
      const range = h("input", { type: "range", min: p.min, max: Math.min(p.max, (p.typicalMax ?? p.max) * 1.6), step: 100, value: Number(value), "aria-label": p.label.plain });
      num.addEventListener("change", () => commit(Math.round(Number(num.value) * 1000)));
      range.addEventListener("input", () => (num.value = (Number(range.value) / 1000).toFixed(2)));
      range.addEventListener("change", () => commit(Number(range.value)));
      wrap.append(label, h("span", {}, num, " m"), range);
      break;
    }
    case "count":
    case "angle": {
      const num = h("input", { id: `p-${key}`, type: "number", step: 1, min: p.min, max: p.max, value: Number(value) });
      num.addEventListener("change", () => commit(Math.round(Number(num.value))));
      wrap.append(label, num);
      break;
    }
    case "enum": {
      const sel = h("select", { id: `p-${key}` });
      for (const o of p.options) sel.append(h("option", { value: o, selected: o === value }, OPTION_LABELS[o] ?? o));
      sel.addEventListener("change", () => commit(sel.value));
      wrap.append(label, sel);
      break;
    }
    case "boolean": {
      const cb = h("input", { id: `p-${key}`, type: "checkbox", checked: Boolean(value) });
      cb.addEventListener("change", () => commit(cb.checked));
      wrap.append(label, cb);
      break;
    }
    case "material": {
      const sel = h("select", { id: `p-${key}` });
      const family = p.slot === "roof" ? ["roofing", "wood"] : p.slot === "timber" ? ["wood"] : ["stone"];
      for (const mat of MATERIALS.filter((x) => family.includes(x.family))) sel.append(h("option", { value: mat.id, selected: mat.id === value }, mat.label.plain));
      sel.addEventListener("change", () => commit(sel.value));
      wrap.append(label, sel);
      break;
    }
    case "ratio": {
      const range = h("input", { id: `p-${key}`, type: "range", min: 0, max: 1, step: 0.01, value: Number(value) });
      range.addEventListener("change", () => commit(Number(range.value)));
      wrap.append(label, range);
      break;
    }
  }
  for (const i of issues) wrap.append(h("div", { class: i.severity === "error" ? "err" : "warn" }, i.message));
  return wrap;
}

function projectSummary(studio: Studio): HTMLElement {
  const p = studio.project;
  const mods = Object.values(p.modules);
  const byCert = new Map<string, number>();
  for (const m of mods) byCert.set(m.certainty.level, (byCert.get(m.certainty.level) ?? 0) + 1);
  return h("div", { class: "learn" },
    h("b", {}, p.name),
    `Période : ${p.context.date.from}–${p.context.date.to}`,
    h("br"),
    `${mods.length} élément(s), ${p.connections.length} raccord(s)`,
    h("br"),
    ...[...byCert].map(([k, n]) => h("span", {}, h("span", { class: `cert ${k}` }), `${CERT_LABELS[k as CertaintyLevel]} : ${n} `)),
  );
}
