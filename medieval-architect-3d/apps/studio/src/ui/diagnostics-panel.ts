import { LIBRARY_BY_TYPE, fixToOperation, sortDiagnostics, type Diagnostic } from "@ma3d/core";
import { newId, type Studio } from "../studio";
import { h } from "./dom";

const DOMAIN: Record<Diagnostic["domain"], string> = {
  history: "Histoire",
  architecture: "Architecture",
  structure: "Structure",
  fabrication: "Fabrication",
};

/**
 * Liste des diagnostics, format PROBLÈME / POURQUOI / RISQUE / SOLUTIONS.
 * Boutons : Montrer (cadre la caméra), Corriger (aperçu en fantôme, puis validation),
 * Continuer ainsi (l'avertissement reste au rapport, grisé).
 */
export function diagnosticsPanel(studio: Studio, focus: (d: Diagnostic) => void): HTMLElement {
  const root = h("section", { class: "diags", "aria-label": "Diagnostics" });
  let open: string | null = null;
  let onlySelection = false;

  const render = () => {
    root.replaceChildren();
    const sel = studio.selection;
    let list = sortDiagnostics(studio.diagnostics);
    if (onlySelection && sel) list = list.filter((d) => d.subjects.includes(sel));
    const active = list.filter((d) => !d.dismissed);
    const head = h("h2", { style: "display:flex;align-items:center;gap:8px" }, `Contrôles (${active.length})`);
    if (sel) {
      const cb = h("input", { type: "checkbox", checked: onlySelection, "aria-label": "Seulement la sélection" });
      cb.addEventListener("change", () => {
        onlySelection = cb.checked;
        render();
      });
      head.append(h("label", { style: "margin-left:auto;text-transform:none;letter-spacing:0;font-weight:400" }, cb, " sélection"));
    }
    root.append(head);
    if (!list.length) {
      root.append(h("p", { class: "empty" }, Object.keys(studio.project.modules).length ? "Aucun problème détecté." : "Les contrôles historiques, architecturaux et structurels s'afficheront ici."));
      return;
    }
    for (const d of list) {
      const key = `${d.rule}|${d.subjects.join()}`;
      const el = h("article", { class: `diag ${d.severity}${d.dismissed ? " dismissed" : ""}${open === key ? " open" : ""}`, tabindex: 0 });
      el.append(
        h("div", { class: "dom" }, `${DOMAIN[d.domain]} · ${d.rule}${d.dismissed ? " · accepté" : ""}`),
        h("div", {}, d.problem),
      );
      const more = h("div", { class: "more" },
        h("p", {}, h("b", {}, "POURQUOI ? "), d.why),
        h("p", {}, h("b", {}, "RISQUE : "), d.risk),
        d.disclaimer ? h("p", { class: "disc" }, d.disclaimer) : null,
      );
      const row = h("div", { class: "row" });
      row.append(h("button", { class: "btn", onclick: (e: Event) => { e.stopPropagation(); focus(d); } }, "Montrer"));
      for (const f of d.fixes) {
        row.append(h("button", {
          class: "btn primary",
          title: `Effort : ${f.effort === "light" ? "léger" : f.effort === "moderate" ? "moyen" : "important"}`,
          onclick: (e: Event) => {
            e.stopPropagation();
            const op = fixToOperation(studio.project, LIBRARY_BY_TYPE, f, () => newId());
            studio.showPreview(f.label, op);
          },
        }, f.label));
      }
      if (!d.dismissed) row.append(h("button", { class: "btn", onclick: (e: Event) => { e.stopPropagation(); studio.dismiss(d); } }, "Continuer ainsi"));
      more.append(row);
      el.append(more);
      el.addEventListener("click", () => {
        open = open === key ? null : key;
        if (d.subjects[0]) studio.select(d.subjects[0]);
        render();
      });
      root.append(el);
    }
  };
  studio.on((r) => (r === "diagnostics" || r === "selection") && render());
  render();
  return root;
}
