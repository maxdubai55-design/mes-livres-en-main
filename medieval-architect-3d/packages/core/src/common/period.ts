import { z } from "zod";

/**
 * Datation : intervalle d'années, bornes incluses. Une date précise (1250) est
 * un intervalle [1250, 1250]. On ne stocke jamais « XIIIe siècle » en texte :
 * c'est un intervalle [1201, 1300] avec un libellé calculé.
 */
export const YearRange = z
  .object({ from: z.number().int(), to: z.number().int() })
  .refine((r) => r.from <= r.to, "début postérieur à la fin");
export type YearRange = z.infer<typeof YearRange>;

export function century(n: number): YearRange {
  return { from: (n - 1) * 100 + 1, to: n * 100 };
}

export function overlaps(a: YearRange, b: YearRange): boolean {
  return a.from <= b.to && b.from <= a.to;
}

/** Écart en années entre deux intervalles disjoints (0 s'ils se chevauchent). */
export function gapYears(a: YearRange, b: YearRange): number {
  if (overlaps(a, b)) return 0;
  return a.to < b.from ? b.from - a.to : a.from - b.to;
}

/** Régions (§11.1). Hiérarchie : une sous-région hérite des profils de sa région mère. */
export const RegionId = z.enum([
  "fr.north",
  "fr.ile-de-france",
  "fr.normandy",
  "fr.occitania",
  "fr.occitania.languedoc",
  "es.catalonia",
  "fr.provence",
  "en.england",
  "hre.empire",
  "it.italy",
]);
export type RegionId = z.infer<typeof RegionId>;

export function regionAncestors(r: RegionId): RegionId[] {
  const parts = r.split(".");
  const out: RegionId[] = [];
  for (let i = parts.length; i >= 2; i--) {
    const candidate = parts.slice(0, i).join(".");
    if (RegionId.safeParse(candidate).success) out.push(candidate as RegionId);
  }
  return out;
}

export const StyleId = z.enum([
  "romanesque",
  "gothic.early",
  "gothic.classic",
  "gothic.rayonnant",
  "gothic.flamboyant",
  "gothic.southern", // gothique méridional (Albi, Toulouse) : nef unique, contreforts intérieurs
  "fortification",
]);
export type StyleId = z.infer<typeof StyleId>;
