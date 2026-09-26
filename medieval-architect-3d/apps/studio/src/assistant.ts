import {
  LIBRARY,
  LIBRARY_BY_TYPE,
  OPTION_LABELS,
  checkChronology,
  fixToOperation,
  resolveParameters,
  sortDiagnostics,
  type Diagnostic,
  type Operation,
} from "@ma3d/core";
import { newId, type Studio } from "./studio";

/**
 * Assistant « Maître d'œuvre ».
 *
 * Fonctionne sans connexion ni clé d'API : il répond à partir de ce que le logiciel sait
 * réellement (diagnostics calculés, bibliothèque, données chronologiques). Il n'invente rien :
 * hors de son périmètre, il le dit et propose les questions qu'il sait traiter.
 * Il ne modifie jamais le projet sans passer par l'aperçu en fantôme et la validation.
 */

export type Answer = {
  text: string;
  actions?: Array<{ label: string; run: () => void }>;
};

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export const SUGGESTIONS = [
  "Pourquoi cet élément est-il en rouge ?",
  "Peux-tu corriger mon projet ?",
  "Comment faire une voûte plus haute ?",
  "Quelle toiture conviendrait ici ?",
  "Comment aurait-on construit ceci vers 1250 ?",
  "Qu'aurait-il pu y avoir ici vers 1300 ?",
];

export function ask(studio: Studio, question: string, actions: { focus: (d: Diagnostic) => void }): Answer {
  const q = fold(question);
  const sel = studio.selected;
  const def = sel ? LIBRARY_BY_TYPE.get(sel.type) : undefined;
  const name = sel ? sel.name ?? def?.label.plain ?? "cet élément" : null;
  const diags = sortDiagnostics(studio.diagnostics.filter((d) => !d.dismissed));
  const mine = sel ? diags.filter((d) => d.subjects.includes(sel.id)) : diags;
  const year = /\b(1[0-5]\d\d|[5-9]\d\d)\b/.exec(q)?.[1];

  const fixActions = (d: Diagnostic) =>
    d.fixes.map((f) => ({
      label: f.label,
      run: () => studio.showPreview(f.label, fixToOperation(studio.project, LIBRARY_BY_TYPE, f, () => newId())),
    }));
  const explain = (d: Diagnostic) => `${d.problem}\nPourquoi : ${d.why}\nRisque : ${d.risk}${d.disclaimer ? `\n(${d.disclaimer})` : ""}`;

  // Pourquoi rouge / quel problème
  if (/pourquoi|rouge|orange|jaune|probleme|erreur|alerte|ne va pas|qu.est.ce qui/.test(q) && !/voute|toit/.test(q)) {
    if (!mine.length)
      return { text: sel ? `Je ne vois aucun problème sur ${name}. Les couleurs de la vue « Analyse » reflètent les contrôles : vert = plausible.` : "Aucun problème détecté dans le projet pour l'instant." };
    const d = mine[0]!;
    return {
      text: `${mine.length > 1 ? `${mine.length} points à voir. Le plus important :\n` : ""}${explain(d)}`,
      actions: [{ label: "Montrer", run: () => actions.focus(d) }, ...fixActions(d)],
    };
  }

  // Corriger
  if (/corrig|repar|arrange|ameliore/.test(q)) {
    const fixable = mine.filter((d) => d.fixes.length);
    if (!fixable.length)
      return { text: mine.length ? "Les points relevés n'ont pas de correction automatique : ils demandent un choix de votre part. Ouvrez-les dans la liste « Contrôles »." : "Rien à corriger : aucun problème détecté." };
    // Regroupe la première correction de chaque diagnostic dans un seul lot, prévisualisé en fantôme.
    const ops: Operation[] = fixable.map((d) => fixToOperation(studio.project, LIBRARY_BY_TYPE, d.fixes[0]!, () => newId()));
    return {
      text: `Je propose ${fixable.length} correction(s), la plus légère à chaque fois :\n${fixable.map((d) => `• ${d.fixes[0]!.label} — ${d.problem}`).join("\n")}\nJe vous les montre en bleu ; rien n'est appliqué sans votre accord.`,
      actions: [{ label: "Voir en fantôme", run: () => studio.showPreview("Corrections proposées", { op: "batch", label: "Corrections proposées", ops }) }],
    };
  }

  // Voûte plus haute
  if (/voute/.test(q) && /haut|plus haute|elever|monter/.test(q)) {
    const tips = [
      "Deux leviers : monter les naissances (les appuis) ou changer la forme de l'arc.",
      "• Arc brisé plutôt que plein cintre : pour la même portée, la clé monte d'environ 70 % (0,87 × portée au lieu de 0,5).",
      "• Monter les murs ou les piles qui portent la voûte, puis la voûte elle-même.",
      "• Plus haut veut dire plus de poussée à reprendre : prévoir contreforts ou arcs-boutants.",
    ];
    const act: Answer["actions"] = [];
    if (sel?.type === "church.vault" && resolveParameters(def!.parameters, sel.params).profile !== "pointed") {
      act.push({ label: "Passer en arc brisé", run: () => studio.showPreview("Arc brisé", { op: "setParam", id: sel.id, param: "profile", value: "pointed" }) });
    }
    if (sel?.type === "church.nave") {
      const h = Number(resolveParameters(def!.parameters, sel.params).height);
      act.push({ label: `Monter la nef à ${Math.round((h * 1.2) / 1000)} m`, run: () => studio.showPreview("Nef plus haute", { op: "setParam", id: sel.id, param: "height", value: Math.round(h * 1.2) }) });
    }
    return { text: tips.join("\n"), actions: act };
  }

  // Toiture
  if (/toit|toiture|couverture|ardoise|tuile/.test(q)) {
    const r = studio.project.context.region ?? "";
    const south = r.startsWith("fr.occitania") || r === "fr.provence" || r === "es.catalonia" || r === "it.italy";
    const lines = south
      ? ["Dans le Midi : toits à faible pente en tuile canal, ou tours terminées en terrasse crénelée, sans toit apparent."]
      : ["Au nord de la Loire : toits pentus en ardoise ou en tuile plate ; tours coiffées d'un toit conique ou en poivrière."];
    const act: Answer["actions"] = [];
    if (sel && def && "roof" in def.parameters) {
      const p = def.parameters.roof!;
      const want = south ? (p.kind === "enum" && p.options.includes("terrace") ? "terrace" : p.kind === "enum" && p.options.includes("none") ? "none" : undefined) : p.kind === "enum" && p.options.includes("conical") ? "conical" : p.kind === "enum" && p.options.includes("pyramid") ? "pyramid" : undefined;
      if (want) act.push({ label: `Toit : ${OPTION_LABELS[want] ?? want}`, run: () => studio.showPreview("Toiture", { op: "setParam", id: sel.id, param: "roof", value: want }) });
      if ("roofMaterial" in def.parameters) {
        const mat = south ? "roofing.tile.canal" : "roofing.slate";
        act.push({ label: south ? "Tuile canal" : "Ardoise", run: () => studio.showPreview("Couverture", { op: "setParam", id: sel.id, param: "roofMaterial", value: mat }) });
      }
    } else lines.push("Sélectionnez une tour ou un bâtiment pour que je propose une toiture adaptée.");
    if (!r) lines.push("(Région du projet non précisée : réglez-la dans « Projet » pour des conseils plus sûrs.)");
    return { text: lines.join("\n"), actions: act };
  }

  // Qu'aurait-il pu y avoir ici vers …
  if (/aurait.il pu|qu.y avait|il y avait|pourrait-on ajouter|quoi ajouter/.test(q)) {
    const y = Number(year ?? studio.project.context.date.from);
    const ctx = { date: { from: y, to: y }, region: studio.project.context.region };
    const ok = LIBRARY.filter((d) => checkChronology(d.history, ctx).verdict === "compatible");
    const castle = ok.filter((d) => d.type.startsWith("castle."));
    const church = ok.filter((d) => d.type.startsWith("church."));
    const list = (xs: typeof ok) => xs.map((d) => d.label.plain.toLowerCase()).join(", ");
    return {
      text: `Vers ${y}, éléments courants selon la bibliothèque :\n• Fortification : ${list(castle) || "—"}\n• Édifices religieux : ${list(church) || "—"}\nCes listes viennent des fourchettes de la bibliothèque, qui restent à faire valider par un historien.`,
    };
  }

  // Comment aurait-on construit … vers 1250
  if (/comment (aurait|construi|batir)|a l.epoque|vers \d{3,4}|en \d{3,4}/.test(q)) {
    if (!sel || !def) return { text: "Sélectionnez d'abord l'élément dont vous parlez : je vous dirai s'il est d'époque et comment il était bâti." };
    const y = Number(year ?? studio.project.context.date.from);
    const v = checkChronology(def.history, { date: { from: y, to: y }, region: studio.project.context.region });
    const verdict = v.verdict === "compatible" ? "tout à fait d'époque" : v.verdict === "atypical" ? "possible mais atypique" : v.verdict === "improbable" ? "peu plausible" : "non documenté dans la bibliothèque";
    const lm = def.learnMore;
    const act: Answer["actions"] = [];
    const eq = def.history.find((hh) => hh.equivalentIfAnachronic)?.equivalentIfAnachronic;
    if (v.verdict === "improbable" && eq)
      act.push({ label: `Remplacer par : ${LIBRARY_BY_TYPE.get(eq)?.label.plain}`, run: () => studio.showPreview("Remplacement d'époque", { op: "updateModule", id: sel.id, patch: { type: eq, definitionVersion: LIBRARY_BY_TYPE.get(eq)!.version } }) });
    return {
      text: `${def.label.plain} vers ${y} : ${verdict}. ${v.reason}.\n${lm ? `${lm.short}\nRôle : ${lm.role}\nPériode : ${lm.period}` : ""}`,
      actions: act,
    };
  }

  if (/aide|comment (ajouter|faire|placer|deplacer)|debut|commencer/.test(q)) {
    return {
      text: [
        "• Ajouter : cliquez un élément dans la bibliothèque (à gauche).",
        "• Déplacer : faites glisser les flèches ; tourner : touche R, puis l'anneau.",
        "• Raccorder : approchez un mur d'une tour ; le point vert signale un raccord correct.",
        "• Régler : les curseurs à droite (hauteur, diamètre…).",
        "• Tout générer d'un coup : bouton « Générer » en haut.",
        "• Annuler : Ctrl+Z. Enregistrer : Ctrl+S.",
      ].join("\n"),
    };
  }

  return {
    text: "Je ne sais pas encore répondre à cette question. Voici ce que je sais faire :\n" + SUGGESTIONS.map((s) => `• ${s}`).join("\n"),
  };
}
