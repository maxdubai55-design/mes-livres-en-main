import { gapYears, overlaps, regionAncestors, type RegionId, type StyleId, type YearRange } from "../common/period.js";
import type { HistoricalUsage } from "../module/module.js";

/**
 * Contrôle chronologique (§11.2). Trois verdicts, jamais d'interdiction :
 *   compatible · atypical (possible mais atypique) · improbable (anachronique ou géographiquement improbable)
 */
export type ChronoVerdict = {
  verdict: "compatible" | "atypical" | "improbable" | "unknown";
  reason: string;
  suggestion?: string;
};

export type ProjectContext = { date: YearRange; region?: RegionId; style?: StyleId };

const RANK = { compatible: 0, atypical: 1, improbable: 2, unknown: 3 } as const;

function regionMatches(usage: HistoricalUsage, region?: RegionId): boolean {
  if (!usage.regions || usage.regions.length === 0 || !region) return true;
  const chain = regionAncestors(region);
  return usage.regions.some((r) => chain.includes(r));
}

function evaluateOne(u: HistoricalUsage, ctx: ProjectContext): ChronoVerdict {
  const regionOk = regionMatches(u, ctx.region);
  const styleOk = !u.styles || !ctx.style || u.styles.includes(ctx.style);

  if (overlaps(u.attested, ctx.date)) {
    if (regionOk && styleOk) return { verdict: "compatible", reason: "usage courant à cette période" };
    if (!regionOk)
      return { verdict: "improbable", reason: "usage attesté à cette période, mais pas dans cette région" };
    return { verdict: "atypical", reason: "usage attesté à cette période, rare dans ce style" };
  }
  const early = u.rareBefore && overlaps(u.rareBefore, ctx.date);
  const late = u.rareAfter && overlaps(u.rareAfter, ctx.date);
  if ((early || late) && regionOk)
    return {
      verdict: "atypical",
      reason: early ? "usage précoce, exceptionnel à cette date" : "survivance tardive, rare à cette date",
    };
  const gap = gapYears(u.attested, ctx.date);
  const direction = ctx.date.to < u.attested.from ? "trop tôt" : "trop tard";
  return {
    verdict: "improbable",
    reason: `${direction} d'environ ${gap} ans par rapport à l'usage courant (${u.attested.from}–${u.attested.to})`,
    ...(u.equivalentIfAnachronic ? { suggestion: u.equivalentIfAnachronic } : {}),
  };
}

/** Plusieurs profils d'usage peuvent coexister (ex. par région) : on garde le plus favorable. */
export function checkChronology(usages: HistoricalUsage[], ctx: ProjectContext): ChronoVerdict {
  if (usages.length === 0)
    return { verdict: "unknown", reason: "aucune donnée historique pour cet élément : pas de contrôle possible" };
  return usages
    .map((u) => evaluateOne(u, ctx))
    .reduce((best, v) => (RANK[v.verdict] < RANK[best.verdict] ? v : best));
}
