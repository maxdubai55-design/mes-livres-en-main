import {
  BuildingSpecification,
  century,
  type ModuleIntent,
  type RegionId,
  type StyleId,
  type YearRange,
} from "@ma3d/core";

/**
 * Analyseur de demandes en français → BuildingSpecification.
 *
 * Choix assumé : un analyseur à règles, pas un modèle de langage. Il est déterministe,
 * fonctionne hors ligne et sans clé d'API, et chaque déduction est traçable. Il ne comprend
 * que le vocabulaire qu'il connaît ; ce qu'il ne comprend pas est signalé, jamais inventé.
 * Un modèle de langage pourra le remplacer derrière la même sortie (la spec validée par zod).
 */

export type ParseResult = {
  spec: BuildingSpecification;
  /** Ce qui a été compris, en clair, pour l'écran « Voici ce que j'ai compris ». */
  understood: string[];
  /** Ce qui a été supposé faute d'indication. */
  assumptions: string[];
  /** Éléments demandés que le générateur ne sait pas encore construire. */
  unsupported: string[];
};

const NUMBERS: Record<string, number> = {
  un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9, dix: 10,
  onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16,
};

const ROMAN: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };

function romanToInt(s: string): number {
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const v = ROMAN[s[i]!] ?? 0;
    const next = ROMAN[s[i + 1]!] ?? 0;
    total += v < next ? -v : v;
  }
  return total;
}

/** Normalise : minuscules, apostrophes droites, espaces simples, sans accents pour la recherche. */
function fold(s: string): string {
  return s
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/[×]/g, " x ")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

const NUM = `(\\d+|${Object.keys(NUMBERS).join("|")})`;
const toNum = (s: string) => (/^\d+$/.test(s) ? Number(s) : NUMBERS[s] ?? 0);

function parseDate(raw: string, t: string): { date?: YearRange; label?: string } {
  // Siècle en chiffres romains : « XIIIe siècle », « fin du XIIe », « début du XIVe siècle »
  const roman = /((?:[Dd][ée]but|[Mm]ilieu|[Ff]in))?\s*(?:du\s+)?\b([IVXL]{1,6})\s*(?:ème|eme|e|ᵉ)(?![a-zà-ÿ])/.exec(raw);
  if (roman) {
    const c = romanToInt(roman[2]!);
    if (c >= 5 && c <= 16) {
      const r = century(c);
      const part = roman[1]?.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      if (part === "debut") return { date: { from: r.from, to: r.from + 32 }, label: `début du ${roman[2]}e siècle` };
      if (part === "milieu") return { date: { from: r.from + 33, to: r.from + 65 }, label: `milieu du ${roman[2]}e siècle` };
      if (part === "fin") return { date: { from: r.from + 66, to: r.to }, label: `fin du ${roman[2]}e siècle` };
      return { date: r, label: `${roman[2]}e siècle` };
    }
  }
  const arabic = /\b(\d{1,2})\s*(?:e|eme)\s*siecle/.exec(t);
  if (arabic) {
    const c = Number(arabic[1]);
    if (c >= 5 && c <= 16) return { date: century(c), label: `${c}e siècle` };
  }
  const year = /\b(vers|en|autour de|de)?\s*(1[0-5]\d\d|[5-9]\d\d)\b/.exec(t);
  if (year) {
    const y = Number(year[2]);
    const approx = year[1] === "vers" || year[1] === "autour de";
    return { date: approx ? { from: y - 10, to: y + 10 } : { from: y, to: y }, label: approx ? `vers ${y}` : `${y}` };
  }
  return {};
}

const REGIONS: Array<[RegExp, RegionId, string]> = [
  [/languedoc|carcassonne|albigeois|cathare/, "fr.occitania.languedoc", "Languedoc"],
  [/occitan|toulouse|midi/, "fr.occitania", "Occitanie"],
  [/normand/, "fr.normandy", "Normandie"],
  [/ile-de-france|ile de france|paris|royale? francais|domaine royal/, "fr.ile-de-france", "Île-de-France (domaine royal)"],
  [/provence|provencal/, "fr.provence", "Provence"],
  [/catalan|catalogne/, "es.catalonia", "Catalogne"],
  [/anglais|angleterre|england/, "en.england", "Angleterre"],
  [/italie|italien/, "it.italy", "Italie"],
  [/empire|germanique|allemand|rhenan/, "hre.empire", "Saint-Empire"],
  [/nord de la france|picard|flandre|champagne/, "fr.north", "France du Nord"],
];

type Kind = "castle" | "church";

function kindOf(t: string): { kind: Kind; type: BuildingSpecification["building"]["type"]; label: string } | null {
  if (/cathedrale/.test(t)) return { kind: "church", type: "cathedral", label: "cathédrale" };
  if (/abbatiale|abbaye/.test(t)) return { kind: "church", type: "abbey", label: "abbatiale" };
  if (/chapelle(?! rayonnante)/.test(t) && !/eglise/.test(t)) return { kind: "church", type: "chapel", label: "chapelle" };
  if (/eglise/.test(t)) return { kind: "church", type: "church", label: "église" };
  if (/forteresse|citadelle/.test(t)) return { kind: "castle", type: "fortress", label: "forteresse" };
  if (/chateau|castrum|place forte|fort\b/.test(t)) return { kind: "castle", type: "castle", label: "château" };
  if (/donjon/.test(t)) return { kind: "castle", type: "keep_only", label: "donjon" };
  return null;
}

export function parseRequest(text: string): ParseResult {
  const t = fold(text);
  const understood: string[] = [];
  const assumptions: string[] = [];
  const unsupported: string[] = [];
  const modules: ModuleIntent[] = [];

  let k = kindOf(t);
  if (!k) {
    k = { kind: "castle", type: "castle", label: "château" };
    assumptions.push("Type d'édifice non reconnu : je pars sur un château.");
  }
  understood.push(`Édifice : ${k.label}`);

  const { date: parsedDate, label: dateLabel } = parseDate(text, t);
  let date = parsedDate;
  if (!date) {
    date = century(13);
    assumptions.push("Date non précisée : XIIIe siècle retenu.");
  } else understood.push(`Période : ${dateLabel}`);

  let region: RegionId | undefined;
  for (const [re, id, label] of REGIONS) {
    if (re.test(t)) {
      region = id;
      understood.push(`Région : ${label}`);
      break;
    }
  }

  const southern = region?.startsWith("fr.occitania") || region === "fr.provence" || region === "es.catalonia";
  let style: StyleId;
  if (k.kind === "castle") style = "fortification";
  else if (/roman/.test(t)) style = "romanesque";
  else if (/(gothique|style|art) flamboyant\b/.test(t)) style = "gothic.flamboyant";
  else if (/(gothique|style|art) rayonnant\b/.test(t)) style = "gothic.rayonnant";
  else if (/gothique meridional/.test(t) || (southern && /gothique/.test(t))) style = "gothic.southern";
  else if (/gothique/.test(t)) style = date.from >= 1190 ? "gothic.classic" : "gothic.early";
  else {
    style = date.to < 1140 ? "romanesque" : date.from >= 1190 ? "gothic.classic" : "gothic.early";
    assumptions.push(`Style déduit de la date : ${style.startsWith("gothic") ? "gothique" : "roman"}.`);
  }
  if (k.kind === "church") understood.push(`Style : ${style.startsWith("gothic") ? "gothique" : "roman"}`);

  // Dimensions : « 120 x 60 m », « 90 m de long », « d'environ 90 m de longueur »
  let length: number | undefined, width: number | undefined;
  const rect = /(\d+(?:[.,]\d+)?)\s*(?:m\s*)?x\s*(\d+(?:[.,]\d+)?)\s*m\b/.exec(t);
  if (rect) {
    length = Math.round(parseFloat(rect[1]!.replace(",", ".")) * 1000);
    width = Math.round(parseFloat(rect[2]!.replace(",", ".")) * 1000);
    understood.push(`Emprise : ${rect[1]} × ${rect[2]} m`);
  } else {
    const len = /(\d+(?:[.,]\d+)?)\s*m(?:etres)?\s*(?:de\s*)?(?:long|longueur)/.exec(t);
    if (len) {
      length = Math.round(parseFloat(len[1]!.replace(",", ".")) * 1000);
      understood.push(`Longueur : ${len[1]} m`);
    }
  }

  let terrain: BuildingSpecification["terrain"];
  if (/eperon/.test(t)) terrain = { kind: "spur", support: "rock" };
  else if (/colline|hauteur|butte/.test(t)) terrain = { kind: "hilltop", support: "rock" };
  else if (/riviere|fleuve|plaine/.test(t)) terrain = { kind: "plain_by_river", support: "medium" };
  if (terrain) {
    understood.push(`Site : ${{ spur: "éperon rocheux", hilltop: "colline", plain_by_river: "plaine / bord de rivière" }[terrain.kind as "spur"]}`);
    if (terrain.kind !== "plain_by_river") unsupported.push("Relief du terrain : le site est noté, mais le terrain reste plat pour l'instant.");
  }

  if (k.kind === "castle") {
    const towers = new RegExp(`${NUM}\\s+tours?\\s*(rondes?|carrees?|circulaires?|quadrangulaires?)?`).exec(t);
    const early = date.to < 1190;
    let shape: "round" | "square" = early ? "square" : "round";
    let n = 4;
    if (towers) {
      n = toNum(towers[1]!);
      if (towers[2]) shape = /ronde|circulaire/.test(towers[2]) ? "round" : "square";
      understood.push(`${n} tour${n > 1 ? "s" : ""} ${shape === "round" ? "ronde" : "carrée"}${n > 1 ? "s" : ""}`);
    } else if (/tours? rondes?/.test(t)) {
      shape = "round";
      understood.push("Tours rondes");
    } else if (/tours? carrees?/.test(t)) {
      shape = "square";
      understood.push("Tours carrées");
    } else {
      assumptions.push(`Nombre de tours non précisé : 4 tours ${shape === "round" ? "rondes" : "carrées"}${early ? " (date antérieure à 1190)" : ""}.`);
    }
    n = Math.max(0, Math.min(16, n));
    if (n > 0) modules.push({ ref: "tower#1", type: shape === "round" ? "castle.tower.round" : "castle.tower.square", count: n, params: {}, placement: { zone: "corner" } });

    const double = /double enceinte|deux enceintes|enceinte double/.test(t);
    modules.push({ ref: "enceinte.inner#1", type: "castle.wall.curtain", role: "inner_enceinte", count: 1, params: {}, placement: { zone: "perimeter" } });
    if (double) {
      modules.push({ ref: "enceinte.outer#1", type: "castle.wall.curtain", role: "outer_enceinte", count: 1, params: {}, placement: { zone: "perimeter" } });
      understood.push("Double enceinte");
    }
    if (/donjon|tour maitresse/.test(t)) {
      const keepShape = /donjon (carre|quadrangulaire|rectangulaire)/.test(t) ? "square" : /donjon (rond|circulaire|cylindrique)/.test(t) ? "round" : date.from >= 1190 ? "round" : "square";
      modules.push({ ref: "keep#1", type: keepShape === "round" ? "castle.keep.round" : "castle.keep.square", role: "keep", count: 1, params: {}, placement: { zone: "free" } });
      understood.push(`Donjon ${keepShape === "round" ? "rond" : "carré"}`);
      if (!/donjon (carre|quadrangulaire|rectangulaire|rond|circulaire|cylindrique)/.test(t))
        assumptions.push(`Forme du donjon déduite de la date : ${keepShape === "round" ? "ronde (après 1190)" : "carrée (avant 1190)"}.`);
    }
    if (/porte|chatelet|entree fortifiee/.test(t)) {
      modules.push({ ref: "gate#1", type: "castle.entrance.gate", role: "main_gate", count: 1, params: { flankingTowers: date.from >= 1180 }, placement: { zone: "axis" } });
      understood.push("Porte fortifiée");
    } else assumptions.push("Aucune porte demandée : j'en place une au sud, un château doit avoir une entrée.");
    if (!modules.some((m) => m.ref === "gate#1"))
      modules.push({ ref: "gate#1", type: "castle.entrance.gate", role: "main_gate", count: 1, params: { flankingTowers: date.from >= 1180 }, placement: { zone: "axis" } });
    if (/logis|grande salle|residence|aula/.test(t)) {
      modules.push({ ref: "hall#1", type: "castle.residential.hall", count: 1, params: {}, placement: { zone: "perimeter" } });
      understood.push("Logis");
    }
    if (/machicoulis/.test(t)) unsupported.push("Mâchicoulis : à ajouter à la main depuis la bibliothèque (pas encore placés automatiquement).");
    if (/hourd/.test(t)) unsupported.push("Hourds : à ajouter à la main depuis la bibliothèque.");
    if (/fosse|douve/.test(t)) unsupported.push("Fossés et douves : pas encore disponibles.");
    if (/chapelle/.test(t)) unsupported.push("Chapelle castrale : pas encore placée automatiquement.");
  } else {
    const gothic = style.startsWith("gothic");
    const aisles =
      /trois vaisseaux|3 vaisseaux|bas-cotes|collateraux|bas cotes/.test(t) ? true : /nef unique|un seul vaisseau/.test(t) ? false : k.type === "cathedral";
    if (/cinq vaisseaux|5 vaisseaux|doubles bas-cotes/.test(t)) unsupported.push("Doubles bas-côtés : un seul bas-côté de chaque côté est généré.");
    if (!/vaisseau|bas-cote|collateral|nef unique/.test(t)) assumptions.push(aisles ? "Nef à bas-côtés (usage pour une cathédrale)." : "Nef unique.");
    const bays = new RegExp(`${NUM}\\s+travees`).exec(t);
    const nave: ModuleIntent = { ref: "nave#1", type: "church.nave", count: 1, params: { aisles, archProfile: gothic ? "pointed" : "round" } };
    if (bays) {
      nave.params.bays = toNum(bays[1]!);
      understood.push(`${bays[1]} travées`);
    }
    modules.push(nave);
    understood.push(aisles ? "Nef à trois vaisseaux" : "Nef unique");
    if (/transept/.test(t)) {
      modules.push({ ref: "transept#1", type: "church.transept", count: 1, params: {}, placement: { zone: "axis", relativeTo: "nave#1" } });
      understood.push("Transept");
    }
    modules.push({ ref: "apse#1", type: "church.apse", count: 1, params: {}, placement: { zone: "apse" } });
    understood.push("Chœur terminé par une abside");
    if (/deambulatoire/.test(t)) unsupported.push("Déambulatoire : non modélisé ; l'abside est simple, les chapelles s'y greffent directement.");
    const chapels = new RegExp(`${NUM}\\s+chapelles rayonnantes`).exec(t);
    if (chapels || /chapelles rayonnantes/.test(t)) {
      const n = chapels ? toNum(chapels[1]!) : 3;
      modules.push({ ref: "chapel.radiating#1", type: "church.chapel.radiating", count: Math.min(7, n), params: {}, placement: { zone: "apse", relativeTo: "apse#1" } });
      understood.push(`${Math.min(7, n)} chapelles rayonnantes`);
    }
    const towersM = new RegExp(`${NUM}\\s+tours?\\s+(?:de\\s+)?facade`).exec(t);
    if (towersM || /tours? de facade|clocher/.test(t)) {
      const n = towersM ? Math.min(2, toNum(towersM[1]!)) : /deux tours|2 tours/.test(t) ? 2 : 1;
      modules.push({ ref: "tower.facade#1", type: "church.tower.facade", count: n, params: {}, placement: { zone: "facade" } });
      understood.push(`${n} tour${n > 1 ? "s" : ""} de façade`);
    }
    const flyers = /arcs?-boutants?|arcs? boutants?/.test(t);
    modules.push({ ref: "buttress#1", type: "church.buttress", count: 1, params: { flyer: flyers && aisles }, placement: { relativeTo: "nave#1" } });
    if (flyers) understood.push(aisles ? "Arcs-boutants" : "Arcs-boutants demandés, mais sans bas-côtés : contreforts simples");
    if (/voute/.test(t) || gothic) understood.push(gothic ? "Voûtes d'ogives" : "Voûtes");
  }

  const spec = BuildingSpecification.parse({
    schemaVersion: 1,
    prompt: text,
    building: { type: k.type, date, ...(region ? { region } : {}), style },
    overall: { ...(length ? { length } : {}), ...(width ? { width } : {}) },
    ...(terrain ? { terrain } : {}),
    modules,
    relations: [],
    constraints: [{ domain: "history", strength: "soft", statement: `Éléments compatibles avec ${dateLabel ?? "le XIIIe siècle"}.` }],
    generation: { mode: "historically_constrained", variants: 1 },
    assumptions,
  });
  return { spec, understood, assumptions, unsupported };
}
