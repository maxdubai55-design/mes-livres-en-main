import { LIBRARY, checkChronology, type ModuleDefinition } from "@ma3d/core";
import type { Studio } from "../studio";
import { h, svg } from "./dom";
import { ICONS } from "./icons";

const GROUPS: Array<[string, (d: ModuleDefinition) => boolean]> = [
  ["Enceintes et tours", (d) => ["fortification.wall", "fortification.tower", "fortification.keep"].includes(d.category)],
  ["Entrées et défenses", (d) => ["fortification.entrance", "fortification.defense"].includes(d.category)],
  ["Bâtiments", (d) => d.category === "residential"],
  ["Plan de l'église", (d) => ["religious.plan", "religious.tower"].includes(d.category)],
  ["Structure", (d) => ["religious.support", "religious.arch", "religious.vault", "religious.buttressing"].includes(d.category)],
];

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Bibliothèque visuelle (colonne gauche). Un clic ajoute le module au centre de la vue.
 * Les éléments anachroniques pour la période du projet restent disponibles, mais sont signalés.
 */
export function libraryPanel(studio: Studio, onAdd: (type: string) => void): HTMLElement {
  const root = h("aside", { class: "panel", "aria-label": "Bibliothèque" });
  const search = h("input", { class: "search", type: "search", placeholder: "Rechercher (tour, voûte, porte…)", "aria-label": "Rechercher un module" });
  const list = h("div");
  root.append(h("h2", {}, "Bibliothèque"), search, list);

  const render = () => {
    const q = fold(search.value.trim());
    list.replaceChildren();
    for (const [title, test] of GROUPS) {
      const defs = LIBRARY.filter(test).filter(
        (d) => !q || fold(`${d.label.plain} ${d.label.technical ?? ""} ${d.type}`).includes(q),
      );
      if (!defs.length) continue;
      list.append(h("div", { class: "cat" }, title));
      const cards = h("div", { class: "cards" });
      for (const d of defs) {
        const v = checkChronology(d.history, studio.project.context);
        const off = v.verdict === "improbable";
        const card = h(
          "button",
          {
            class: `card${off ? " anachronic" : ""}`,
            title: `${d.learnMore?.short ?? d.label.plain}${off ? `\n⚠ ${v.reason}` : ""}`,
            "data-type": d.type,
            onclick: () => onAdd(d.type),
          },
          svg(ICONS[d.type] ?? ICONS["castle.wall.curtain"]!),
          h("span", {}, d.label.plain),
          d.label.technical ? h("span", { class: "tech" }, d.label.technical) : null,
          off ? h("span", { class: "badge" }, "hors période") : null,
        );
        cards.append(card);
      }
      list.append(cards);
    }
    if (!list.children.length) list.append(h("p", { class: "empty" }, "Aucun module ne correspond."));
  };
  search.addEventListener("input", render);
  studio.on((r) => r === "project" && render());
  render();
  return root;
}
