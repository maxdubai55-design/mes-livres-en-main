import { z } from "zod";
import { DiagnosticId, ModuleInstanceId, ModuleTypeId, Vec3 } from "../common/primitives.js";
import { ParameterValue } from "../module/parameters.js";

/**
 * Diagnostics (§11–§13, §22.3). Un seul format pour les quatre domaines,
 * qui restent strictement séparés par le champ `domain`.
 */
export const DiagnosticDomain = z.enum(["history", "architecture", "structure", "fabrication"]);
export type DiagnosticDomain = z.infer<typeof DiagnosticDomain>;

/**
 * Échelle unique à quatre niveaux, projetée sur les vocabulaires de chaque domaine :
 *   history      : ok = compatible · notice = possible mais atypique · warning/critical = anachronique ou improbable
 *   structure    : ok = vert · notice = jaune · warning = orange · critical = rouge
 */
export const Severity = z.enum(["ok", "notice", "warning", "critical"]);
export type Severity = z.infer<typeof Severity>;

/** Niveau d'analyse qui a produit le diagnostic (§14.1). Affiché dans le rapport. */
export const AnalysisTier = z.enum(["rules", "simplified", "fem"]);

/** Correction proposée : une liste d'opérations appliquées en fantôme avant validation. */
export const Fix = z.object({
  label: z.string(),
  effort: z.enum(["light", "moderate", "major"]), // SOLUTIONS : de la plus légère à la plus importante
  operations: z.array(
    z.discriminatedUnion("op", [
      z.object({ op: z.literal("setParam"), module: ModuleInstanceId, param: z.string(), value: ParameterValue }),
      z.object({ op: z.literal("replaceType"), module: ModuleInstanceId, newType: ModuleTypeId }),
      z.object({ op: z.literal("addModule"), type: ModuleTypeId, near: ModuleInstanceId, params: z.record(z.string(), ParameterValue), at: Vec3.optional() }),
      z.object({ op: z.literal("move"), module: ModuleInstanceId, delta: Vec3 }),
    ]),
  ),
});
export type Fix = z.infer<typeof Fix>;

export const Diagnostic = z.object({
  id: DiagnosticId,
  /** Code stable de la règle : sert aux tests, aux traductions et au mode « ignorer cette règle ». */
  rule: z.string().regex(/^[A-Z]{3}-\d{3}$/), // ex. ARC-012, HIS-003, STR-021
  domain: DiagnosticDomain,
  severity: Severity,
  tier: AnalysisTier,
  subjects: z.array(ModuleInstanceId).min(1),
  focus: Vec3.optional(), // où cadrer la caméra (bouton « Montrer »)
  // Format d'explication imposé (§12.1)
  problem: z.string(),
  why: z.string(),
  risk: z.string(),
  fixes: z.array(Fix),
  /** « Continuer ainsi » : l'utilisateur a vu et assume. Le diagnostic reste dans le rapport. */
  dismissed: z.boolean().default(false),
  /** Rappel systématique pour le domaine structure (§13, §14.1). */
  disclaimer: z.string().optional(),
});
export type Diagnostic = z.infer<typeof Diagnostic>;

export const STRUCTURE_DISCLAIMER =
  "Estimation de plausibilité structurelle. Ne remplace pas l'avis d'un ingénieur qualifié.";

/**
 * Contrat d'une règle de diagnostic. Une règle est une fonction pure du projet :
 * pas d'accès à la scène, pas d'effet de bord → testable unitairement.
 */
export interface DiagnosticRule<Ctx> {
  code: string;
  domain: DiagnosticDomain;
  tier: z.infer<typeof AnalysisTier>;
  run(ctx: Ctx): Omit<Diagnostic, "id" | "dismissed">[];
}

/** Tri par gravité puis par domaine : ordre du panneau et du rapport. */
export function sortDiagnostics<T extends Pick<Diagnostic, "severity" | "domain">>(list: T[]): T[] {
  const sev: Severity[] = ["critical", "warning", "notice", "ok"];
  const dom: DiagnosticDomain[] = ["structure", "architecture", "history", "fabrication"];
  return [...list].sort(
    (a, b) => sev.indexOf(a.severity) - sev.indexOf(b.severity) || dom.indexOf(a.domain) - dom.indexOf(b.domain),
  );
}
