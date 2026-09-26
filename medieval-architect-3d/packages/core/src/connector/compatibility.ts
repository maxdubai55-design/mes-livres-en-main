import type { ConnectorKind, ResolvedConnector } from "./connector.js";

/**
 * Règles de compatibilité (§4) : vert = compatible, orange = inhabituel, rouge = impossible.
 * Table symétrique : on ne déclare chaque paire qu'une fois.
 */
export type Compatibility = "compatible" | "unusual" | "incompatible";

const RULES: Array<[ConnectorKind, ConnectorKind, Compatibility]> = [
  ["wall.end", "wall.end", "compatible"],
  ["wall.end", "tower.flank", "compatible"],
  ["wall.end", "wall.face", "unusual"], // mur en T : possible, souvent une reprise
  ["wall.face", "buttress.head", "unusual"],
  ["wall.top", "roof.eave", "compatible"],
  ["wall.top", "walkway", "compatible"],
  ["walkway", "walkway", "compatible"],
  ["walkway", "tower.flank", "compatible"],
  ["walkway", "stair.landing", "compatible"],
  ["stair.landing", "floor.level", "compatible"],
  ["support.top", "arch.springer", "compatible"],
  ["wall.face", "arch.springer", "compatible"],
  ["wall.top", "arch.springer", "unusual"],
  ["arch.springer", "arch.springer", "compatible"], // plusieurs arcs retombant sur un même point
  ["flying.head", "wall.face", "compatible"],
  ["flying.foot", "buttress.head", "compatible"],
  ["flying.foot", "wall.face", "unusual"],
  ["support.base", "foundation", "compatible"],
  ["support.base", "floor.level", "unusual"], // pile posée sur plancher bois : à vérifier
  ["foundation", "terrain", "compatible"],
  ["tower.top", "roof.eave", "compatible"],
];

const table = new Map<string, Compatibility>();
for (const [a, b, c] of RULES) {
  table.set(`${a}|${b}`, c);
  table.set(`${b}|${a}`, c);
}

export function kindCompatibility(a: ConnectorKind, b: ConnectorKind): Compatibility {
  return table.get(`${a}|${b}`) ?? "incompatible";
}

export type SnapVerdict = {
  status: Compatibility;
  /** Couleur affichée pendant le déplacement. */
  color: "green" | "orange" | "red";
  reasons: string[];
};

/** Tolérance au-delà de laquelle deux épaisseurs raccordées deviennent « inhabituelles ». */
const SIZE_TOLERANCE = 0.25;

/**
 * Verdict de raccord entre deux connecteurs résolus.
 * Deux « porteurs » face à face ou deux « portés » ne se contredisent pas forcément,
 * mais le chemin de charge devient ambigu : orange.
 */
export function evaluateSnap(a: ResolvedConnector, b: ResolvedConnector): SnapVerdict {
  const reasons: string[] = [];
  let status = kindCompatibility(a.kind, b.kind);
  if (status === "incompatible") {
    reasons.push(`un élément « ${a.kind} » ne se raccorde pas à « ${b.kind} »`);
  } else {
    if (a.size > 0 && b.size > 0) {
      const ratio = Math.abs(a.size - b.size) / Math.max(a.size, b.size);
      if (ratio > SIZE_TOLERANCE) {
        status = "unusual";
        reasons.push(`épaisseurs très différentes (${a.size} mm et ${b.size} mm)`);
      }
    }
    if (a.role !== "neutral" && a.role === b.role) {
      status = "unusual";
      reasons.push("les deux éléments prétendent porter (ou être portés) : chemin de charge ambigu");
    }
  }
  const color = status === "compatible" ? "green" : status === "unusual" ? "orange" : "red";
  return { status, color, reasons };
}
