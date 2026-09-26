import { checkChronology, type ProjectContext } from "../history/chronology.js";
import type { ModuleDefinition, ModuleInstance } from "../module/module.js";
import { resolveParameters, type ParameterValue } from "../module/parameters.js";
import type { Project } from "../project/project.js";
import { STRUCTURE_DISCLAIMER, type Diagnostic, type Fix, type Severity } from "./diagnostic.js";

/**
 * Règles de diagnostic du MVP. Fonctions pures : elles lisent le projet, les définitions
 * et les boîtes englobantes (calculées par le moteur géométrique), et rendent des diagnostics.
 */

export type AABB = { min: [number, number, number]; max: [number, number, number] };

export type DiagnosticContext = {
  project: Project;
  defs: Map<string, ModuleDefinition>;
  /** Boîte englobante monde de chaque instance (mm). Une instance sans boîte est ignorée par les règles spatiales. */
  bounds: Map<string, AABB>;
};

type Draft = Omit<Diagnostic, "id" | "dismissed">;

const volume = (b: AABB) => (b.max[0] - b.min[0]) * (b.max[1] - b.min[1]) * (b.max[2] - b.min[2]);

function overlap(a: AABB, b: AABB): AABB | null {
  const min: [number, number, number] = [0, 0, 0];
  const max: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    min[i] = Math.max(a.min[i]!, b.min[i]!);
    max[i] = Math.min(a.max[i]!, b.max[i]!);
    if (max[i]! <= min[i]!) return null;
  }
  return { min, max };
}

function center(b: AABB): [number, number, number] {
  return [(b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2, (b.min[2] + b.max[2]) / 2];
}

function params(ctx: DiagnosticContext, m: ModuleInstance): Record<string, ParameterValue> {
  const def = ctx.defs.get(m.type);
  return def ? resolveParameters(def.parameters, m.params) : m.params;
}

function label(ctx: DiagnosticContext, m: ModuleInstance): string {
  return m.name ?? ctx.defs.get(m.type)?.label.plain ?? m.type;
}

function connected(p: Project, a: string, b: string): boolean {
  return p.connections.some((c) => (c.a.module === a && c.b.module === b) || (c.a.module === b && c.b.module === a));
}

const visible = (m: ModuleInstance) => !m.state.hidden;

// --- HIS : histoire ------------------------------------------------------------

function chronology(ctx: DiagnosticContext): Draft[] {
  const out: Draft[] = [];
  const pctx: ProjectContext = { date: ctx.project.context.date, region: ctx.project.context.region, style: ctx.project.context.style };
  const period = `${pctx.date.from}–${pctx.date.to}`;
  for (const m of Object.values(ctx.project.modules).filter(visible)) {
    const def = ctx.defs.get(m.type);
    if (!def) continue;
    const v = checkChronology(def.history, pctx);
    if (v.verdict === "atypical" || v.verdict === "improbable") {
      const fixes: Fix[] = v.suggestion
        ? [{ label: `Remplacer par : ${ctx.defs.get(v.suggestion)?.label.plain ?? v.suggestion}`, effort: "moderate", operations: [{ op: "replaceType", module: m.id, newType: v.suggestion }] }]
        : [];
      out.push({
        rule: v.verdict === "improbable" ? "HIS-001" : "HIS-002",
        domain: "history",
        severity: v.verdict === "improbable" ? "warning" : "notice",
        tier: "rules",
        subjects: [m.id],
        problem: `${label(ctx, m)} : ${v.verdict === "improbable" ? "anachronique ou improbable" : "possible mais atypique"} pour la période ${period}.`,
        why: v.reason + (def.history[0]?.note ? `. ${def.history[0].note}` : ""),
        risk: "La reconstitution perd en vraisemblance historique. Rien n'empêche de garder l'élément dans une création libre.",
        fixes,
      });
    }
    const values = resolveParameters(def.parameters, m.params);
    for (const [param, byValue] of Object.entries(def.paramHistory)) {
      const usages = byValue[String(values[param])];
      if (!usages) continue;
      const pv = checkChronology(usages, pctx);
      if (pv.verdict !== "atypical" && pv.verdict !== "improbable") continue;
      const pdef = def.parameters[param];
      const alt = pdef?.kind === "enum" ? pdef.options.find((o) => o !== values[param] && !byValue[o]) : pdef?.kind === "boolean" ? !values[param] : undefined;
      out.push({
        rule: pv.verdict === "improbable" ? "HIS-003" : "HIS-004",
        domain: "history",
        severity: pv.verdict === "improbable" ? "warning" : "notice",
        tier: "rules",
        subjects: [m.id],
        problem: `${label(ctx, m)} : « ${pdef?.label.plain ?? param} » ${pv.verdict === "improbable" ? "est anachronique" : "est atypique"} pour ${period}.`,
        why: pv.reason + (usages[0]?.note ? `. ${usages[0].note}` : ""),
        risk: "Détail d'époque discutable dans une reconstitution.",
        fixes: alt !== undefined ? [{ label: "Revenir à une forme d'époque", effort: "light", operations: [{ op: "setParam", module: m.id, param, value: alt }] }] : [],
      });
    }
  }
  return out;
}

// --- ARC : architecture ------------------------------------------------------------

/** Élément suspendu : rien sous lui, et il n'est pas posé au sol. */
function floating(ctx: DiagnosticContext): Draft[] {
  const out: Draft[] = [];
  const TOL = 150;
  const all = Object.values(ctx.project.modules).filter(visible);
  for (const m of all) {
    const b = ctx.bounds.get(m.id);
    const def = ctx.defs.get(m.type);
    if (!b || !def || b.min[2] <= TOL) continue;
    // Posé sur quelque chose ? Une autre boîte dont le dessus atteint notre base et qui chevauche en plan.
    const below = all.filter((o) => {
      if (o.id === m.id) return false;
      const ob = ctx.bounds.get(o.id);
      if (!ob) return false;
      const planOverlap = ob.min[0] < b.max[0] && ob.max[0] > b.min[0] && ob.min[1] < b.max[1] && ob.max[1] > b.min[1];
      return planOverlap && ob.max[2] >= b.min[2] - TOL && ob.min[2] < b.min[2];
    });
    if (below.length > 0 || connectedToAnything(ctx.project, m.id)) continue;
    out.push({
      rule: "ARC-001",
      domain: "architecture",
      severity: def.structuralRole === "non_structural" ? "notice" : "critical",
      tier: "rules",
      subjects: [m.id],
      focus: center(b).map(Math.round) as [number, number, number],
      problem: `${label(ctx, m)} flotte à ${(b.min[2] / 1000).toFixed(1)} m du sol sans rien pour la porter.`,
      why: "Toute construction transmet son poids vers le bas jusqu'au terrain. Ici, le chemin s'interrompt.",
      risk: "Impossible à construire tel quel.",
      fixes: [{ label: "Poser au sol", effort: "light", operations: [{ op: "move", module: m.id, delta: [0, 0, -Math.round(b.min[2])] }] }],
    });
  }
  return out;
}

function connectedToAnything(p: Project, id: string): boolean {
  return p.connections.some((c) => c.a.module === id || c.b.module === id);
}

/** Deux éléments qui s'interpénètrent sans être raccordés. */
function collisions(ctx: DiagnosticContext): Draft[] {
  const out: Draft[] = [];
  const all = Object.values(ctx.project.modules).filter((m) => visible(m) && !m.parent);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i]!, b = all[j]!;
      const ba = ctx.bounds.get(a.id), bb = ctx.bounds.get(b.id);
      if (!ba || !bb || connected(ctx.project, a.id, b.id)) continue;
      const o = overlap(ba, bb);
      if (!o) continue;
      const ratio = volume(o) / Math.min(volume(ba), volume(bb));
      if (ratio < 0.15) continue; // simple contact ou léger encastrement : toléré
      // Éléments qui se logent normalement l'un dans l'autre (colonne sous voûte, voûte dans une nef).
      const cats = [ctx.defs.get(a.type)?.category, ctx.defs.get(b.type)?.category];
      const nests = (x?: string, y?: string) =>
        (x === "religious.plan" && (y === "religious.support" || y === "religious.vault" || y === "religious.arch")) ||
        (x === "religious.vault" && y === "religious.support") ||
        // couronnements (mâchicoulis, hourds) : posés sur l'arase, ils l'enveloppent en partie
        (x === "fortification.defense" && (y === "fortification.wall" || y === "fortification.tower" || y === "fortification.keep")) ||
        // contreforts plaqués contre les murs d'une nef
        (x === "religious.buttressing" && (y === "religious.plan" || y === "religious.buttressing"));
      if (nests(cats[0], cats[1]) || nests(cats[1], cats[0])) continue;
      out.push({
        rule: "ARC-002",
        domain: "architecture",
        severity: "warning",
        tier: "rules",
        subjects: [a.id, b.id],
        focus: center(o).map(Math.round) as [number, number, number],
        problem: `${label(ctx, a)} et ${label(ctx, b)} se traversent (${Math.round(ratio * 100)} % du plus petit).`,
        why: "Deux maçonneries ne peuvent pas occuper le même espace. Un raccord voulu passe par les points d'accroche.",
        risk: "Volumes incohérents en coupe, métrés faux, export 3D sale.",
        fixes: [{
          label: `Écarter ${label(ctx, b)}`,
          effort: "light",
          operations: [{ op: "move", module: b.id, delta: separation(ba, bb) }],
        }],
      });
    }
  }
  return out;
}

/** Plus petit déplacement horizontal qui sépare b de a. */
function separation(a: AABB, b: AABB): [number, number, number] {
  const candidates: [number, number, number][] = [
    [a.max[0] - b.min[0] + 200, 0, 0],
    [a.min[0] - b.max[0] - 200, 0, 0],
    [0, a.max[1] - b.min[1] + 200, 0],
    [0, a.min[1] - b.max[1] - 200, 0],
  ];
  return candidates.reduce((best, c) => (Math.abs(c[0] + c[1]) < Math.abs(best[0] + best[1]) ? c : best)).map(Math.round) as [number, number, number];
}

/** Mur trop ajouré : la part de vide affaiblit la maçonnerie. */
function openings(ctx: DiagnosticContext): Draft[] {
  const out: Draft[] = [];
  const WIDTH: Record<string, number> = { door: 1600, window: 1000, arrow_slit: 150 };
  for (const m of Object.values(ctx.project.modules).filter(visible)) {
    if (m.type !== "castle.wall.curtain") continue;
    const p = params(ctx, m);
    const w = WIDTH[String(p.openingType)] ?? 0;
    const n = Number(p.openingCount ?? 0);
    const L = Number(p.length);
    if (!w || !n) continue;
    const ratio = (w * n) / L;
    if (ratio <= 0.35) continue;
    const maxN = Math.floor((0.3 * L) / w);
    out.push({
      rule: "ARC-003",
      domain: "architecture",
      severity: ratio > 0.5 ? "critical" : "warning",
      tier: "rules",
      subjects: [m.id],
      problem: `${label(ctx, m)} est percé à ${Math.round(ratio * 100)} % de sa longueur.`,
      why: "Entre deux ouvertures, le trumeau porte tout le poids du mur au-dessus. Trop étroit, il s'écrase.",
      risk: "Fissuration des trumeaux, affaissement des linteaux ; brèche facile en cas de siège.",
      fixes: [{ label: `Réduire à ${maxN} ouverture(s)`, effort: "light", operations: [{ op: "setParam", module: m.id, param: "openingCount", value: maxN }] }],
    });
  }
  return out;
}

/** Courtine dont une extrémité n'est raccordée à rien alors qu'une tour est juste à côté. */
function unconnectedEnds(ctx: DiagnosticContext): Draft[] {
  const out: Draft[] = [];
  const all = Object.values(ctx.project.modules).filter(visible);
  for (const m of all) {
    if (m.type !== "castle.wall.curtain") continue;
    const b = ctx.bounds.get(m.id);
    if (!b) continue;
    const used = new Set(ctx.project.connections.flatMap((c) => [c.a, c.b]).filter((e) => e.module === m.id).map((e) => e.connector));
    if (used.has("start") && used.has("end")) continue;
    const near = all.find((o) => {
      if (o.id === m.id) return false;
      const cat = ctx.defs.get(o.type)?.category;
      if (cat !== "fortification.tower" && cat !== "fortification.entrance" && cat !== "fortification.keep") return false;
      const ob = ctx.bounds.get(o.id);
      return ob && overlap(grow(b, 1500), ob) && !connected(ctx.project, m.id, o.id);
    });
    if (!near) continue;
    out.push({
      rule: "ARC-004",
      domain: "architecture",
      severity: "notice",
      tier: "rules",
      subjects: [m.id, near.id],
      problem: `${label(ctx, m)} touche ${label(ctx, near)} sans y être raccordé.`,
      why: "Le raccord assure la continuité du chemin de ronde et la liaison des maçonneries.",
      risk: "Chemin de ronde interrompu ; joint vertical fragile entre les deux maçonneries.",
      fixes: [],
    });
  }
  return out;
}

const grow = (b: AABB, d: number): AABB => ({ min: [b.min[0] - d, b.min[1] - d, b.min[2] - d], max: [b.max[0] + d, b.max[1] + d, b.max[2] + d] });

// --- STR : plausibilité structurelle ----------------------------------------------

function slenderness(ctx: DiagnosticContext): Draft[] {
  const out: Draft[] = [];
  for (const m of Object.values(ctx.project.modules).filter(visible)) {
    const def = ctx.defs.get(m.type);
    if (!def) continue;
    const p = params(ctx, m);
    const h = Number(p.height);
    let base = 0, param = "", kind = "";
    if (typeof p.diameter === "number" && (def.category === "fortification.tower" || def.category === "fortification.keep")) {
      base = p.diameter; param = "diameter"; kind = "tour";
    } else if (typeof p.width === "number" && (def.category === "fortification.tower" || def.category === "fortification.keep" || def.category === "religious.tower")) {
      base = p.width; param = "width"; kind = "tour";
    } else if (m.type === "castle.wall.curtain") {
      base = Number(p.thickness); param = "thickness"; kind = "mur";
    } else if (m.type === "church.support.column") {
      base = Number(p.diameter); param = "diameter"; kind = "colonne";
    }
    if (!base || !h) continue;
    // Seuils : ordres de grandeur des édifices conservés (et non calcul de flambement).
    const limits: Record<string, [number, number]> = { tour: [4, 6], mur: [10, 16], colonne: [12, 18] };
    const [warn, crit] = limits[kind]!;
    const ratio = h / base;
    if (m.type === "church.tower.facade" && ratio < 7) continue;
    if (ratio <= warn) continue;
    const sev: Severity = ratio > crit ? "critical" : "warning";
    out.push({
      rule: "STR-001",
      domain: "structure",
      severity: sev,
      tier: "rules",
      subjects: [m.id],
      problem: `${label(ctx, m)} est très élancé(e) : hauteur ${ratio.toFixed(1)} fois ${kind === "mur" ? "l'épaisseur" : "la largeur"}.`,
      why: `Au-delà d'environ ${warn} pour un(e) ${kind}, la maçonnerie devient sensible au moindre défaut d'aplomb, au vent et aux tassements.`,
      risk: sev === "critical" ? "Basculement ou flambement probable." : "Fissures, déversement avec le temps.",
      fixes: [
        { label: "Épaissir", effort: "light", operations: [{ op: "setParam", module: m.id, param, value: Math.round(h / (warn * 0.9)) }] },
        { label: "Réduire la hauteur", effort: "moderate", operations: [{ op: "setParam", module: m.id, param: "height", value: Math.round(base * warn * 0.95) }] },
      ],
      disclaimer: STRUCTURE_DISCLAIMER,
    });
  }
  return out;
}

/** Voûte sans appui sous ses naissances. */
function vaultSupports(ctx: DiagnosticContext): Draft[] {
  const out: Draft[] = [];
  const all = Object.values(ctx.project.modules).filter(visible);
  for (const v of all) {
    if (v.type !== "church.vault" && v.type !== "church.arch") continue;
    const b = ctx.bounds.get(v.id);
    if (!b) continue;
    const springZ = b.min[2];
    const supports = all.filter((o) => {
      if (o.id === v.id) return false;
      const cat = ctx.defs.get(o.type)?.category;
      if (!["religious.support", "religious.plan", "fortification.wall", "religious.buttressing", "fortification.tower"].includes(cat ?? "")) return false;
      const ob = ctx.bounds.get(o.id);
      if (!ob) return false;
      const planOverlap = ob.min[0] < b.max[0] + 300 && ob.max[0] > b.min[0] - 300 && ob.min[1] < b.max[1] + 300 && ob.max[1] > b.min[1] - 300;
      return planOverlap && ob.max[2] >= springZ - 400;
    });
    if (supports.length > 0 && springZ > 150) continue;
    if (springZ <= 150 && v.type === "church.vault") {
      out.push({
        rule: "STR-003",
        domain: "structure",
        severity: "warning",
        tier: "rules",
        subjects: [v.id],
        problem: `${label(ctx, v)} est posée au sol : ses naissances sont à 0 m.`,
        why: "Une voûte naît au sommet de murs ou de piles.",
        risk: "Volume sans usage ; probablement une voûte oubliée à monter.",
        fixes: [],
        disclaimer: STRUCTURE_DISCLAIMER,
      });
      continue;
    }
    const c = center(b);
    const corners: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    out.push({
      rule: "STR-002",
      domain: "structure",
      severity: "critical",
      tier: "rules",
      subjects: [v.id],
      focus: c.map(Math.round) as [number, number, number],
      problem: `${label(ctx, v)} n'a aucun appui sous ses naissances.`,
      why: "Chemin des charges : voûte → arc → pile → fondation → terrain. Ici il s'arrête à la voûte.",
      risk: "Effondrement immédiat au décintrement.",
      fixes: [{
        label: "Ajouter une colonne sous chaque naissance",
        effort: "moderate",
        operations: corners.map(([dx, dy]) => ({
          op: "addModule" as const,
          type: "church.support.column",
          near: v.id,
          params: { height: Math.round(springZ), diameter: 1200 },
          at: [Math.round(dx < 0 ? b.min[0] : b.max[0]), Math.round(dy < 0 ? b.min[1] : b.max[1]), 0] as [number, number, number],
        })),
      }],
      disclaimer: STRUCTURE_DISCLAIMER,
    });
  }
  return out;
}

/** Voûte haute et large sans contrebutement proche : la poussée n'est pas reprise. */
function thrust(ctx: DiagnosticContext): Draft[] {
  const out: Draft[] = [];
  const all = Object.values(ctx.project.modules).filter(visible);
  const buttresses = all.filter((m) => ctx.defs.get(m.type)?.category === "religious.buttressing");
  for (const v of all) {
    if (v.type !== "church.vault") continue;
    const b = ctx.bounds.get(v.id);
    if (!b) continue;
    const p = params(ctx, v);
    const span = Math.min(Number(p.spanX), Number(p.spanY));
    const springZ = b.min[2];
    if (springZ < 12000 || span < 8000) continue;
    const near = buttresses.filter((m) => {
      const bb = ctx.bounds.get(m.id);
      return bb && overlap(grow(b, 9000), bb);
    });
    if (near.length >= 2) continue;
    out.push({
      rule: "STR-004",
      domain: "structure",
      severity: "warning",
      tier: "rules",
      subjects: [v.id],
      focus: center(b).map(Math.round) as [number, number, number],
      problem: `${label(ctx, v)} (${(span / 1000).toFixed(1)} m de portée, naissances à ${(springZ / 1000).toFixed(1)} m) n'est pas contrebutée.`,
      why: "Une voûte pousse ses appuis vers l'extérieur. Plus elle est haute et large, plus cette poussée doit être reprise par des contreforts ou des arcs-boutants.",
      risk: "Déversement des murs, ouverture de la voûte à la clé.",
      fixes: [],
      disclaimer: STRUCTURE_DISCLAIMER,
    });
  }
  return out;
}

export const RULES: Array<{ code: string; run: (ctx: DiagnosticContext) => Draft[] }> = [
  { code: "HIS", run: chronology },
  { code: "ARC-001", run: floating },
  { code: "ARC-002", run: collisions },
  { code: "ARC-003", run: openings },
  { code: "ARC-004", run: unconnectedEnds },
  { code: "STR-001", run: slenderness },
  { code: "STR-002/003", run: vaultSupports },
  { code: "STR-004", run: thrust },
];

/**
 * Exécute toutes les règles. Les diagnostics écartés par l'utilisateur (« Continuer ainsi »)
 * restent présents mais marqués, pour figurer au rapport.
 */
export function runDiagnostics(ctx: DiagnosticContext): Diagnostic[] {
  const dismissed = ctx.project.dismissedDiagnostics;
  const out: Diagnostic[] = [];
  let n = 0;
  for (const r of RULES) {
    for (const d of r.run(ctx)) {
      n++;
      const isDismissed = dismissed.some((x) => x.rule === d.rule && x.subjects.join() === d.subjects.join());
      out.push({ ...d, id: `diag_${String(n).padStart(4, "0")}`, dismissed: isDismissed });
    }
  }
  return out;
}
