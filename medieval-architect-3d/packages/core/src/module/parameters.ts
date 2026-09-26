import { z } from "zod";
import { DualLabel, MaterialId } from "../common/primitives.js";

/**
 * Définition d'un paramètre de module. Le type détermine le widget :
 * length → poignée + champ numérique ; enum → vignettes ; count → +/- ; etc.
 * `tier` implémente les trois modes (§2.1) : un paramètre « expert » n'apparaît
 * jamais en mode Découverte, mais garde sa valeur par défaut.
 */
export const ParameterTier = z.enum(["discovery", "creation", "expert"]);
export type ParameterTier = z.infer<typeof ParameterTier>;

const base = {
  label: DualLabel,
  tier: ParameterTier,
  /** Paramètre manipulable par une poignée dans la scène (§2.5). */
  handle: z.enum(["height", "width", "length", "radius", "rotation"]).optional(),
  help: z.string().optional(),
};

export const ParameterDef = z.discriminatedUnion("kind", [
  z.object({
    ...base,
    kind: z.literal("length"),
    default: z.number().int(),
    min: z.number().int(),
    max: z.number().int(),
    /** Bornes « habituelles » : hors de cette plage, avertissement mais pas blocage. */
    typicalMin: z.number().int().optional(),
    typicalMax: z.number().int().optional(),
  }),
  z.object({
    ...base,
    kind: z.literal("count"),
    default: z.number().int(),
    min: z.number().int(),
    max: z.number().int(),
  }),
  z.object({
    ...base,
    kind: z.literal("angle"),
    default: z.number().int(),
    min: z.number().int(),
    max: z.number().int(),
  }),
  z.object({ ...base, kind: z.literal("enum"), options: z.array(z.string()).min(1), default: z.string() }),
  z.object({ ...base, kind: z.literal("boolean"), default: z.boolean() }),
  z.object({ ...base, kind: z.literal("material"), slot: z.string(), default: MaterialId }),
  z.object({ ...base, kind: z.literal("ratio"), default: z.number().min(0).max(1) }),
]);
export type ParameterDef = z.infer<typeof ParameterDef>;

export const ParameterValue = z.union([z.number(), z.string(), z.boolean()]);
export type ParameterValue = z.infer<typeof ParameterValue>;

export type ParamIssue = {
  param: string;
  severity: "error" | "warning";
  message: string;
};

/**
 * Valide un jeu de valeurs contre les définitions.
 * - erreur : valeur impossible à construire (hors min/max, type faux) → le générateur refuse ;
 * - avertissement : valeur constructible mais inhabituelle → on laisse faire (§1 : avertir, pas bloquer).
 */
export function checkParameters(
  defs: Record<string, ParameterDef>,
  values: Record<string, ParameterValue>,
): ParamIssue[] {
  const issues: ParamIssue[] = [];
  for (const key of Object.keys(values)) {
    if (!(key in defs)) issues.push({ param: key, severity: "error", message: `paramètre inconnu « ${key} »` });
  }
  for (const [key, def] of Object.entries(defs)) {
    const v = values[key] ?? def.default;
    switch (def.kind) {
      case "length":
      case "count":
      case "angle": {
        if (typeof v !== "number" || !Number.isInteger(v)) {
          issues.push({ param: key, severity: "error", message: "entier attendu" });
          break;
        }
        if (v < def.min || v > def.max) {
          issues.push({ param: key, severity: "error", message: `hors limites [${def.min} ; ${def.max}]` });
          break;
        }
        if (def.kind === "length") {
          if (def.typicalMin !== undefined && v < def.typicalMin)
            issues.push({ param: key, severity: "warning", message: "valeur inhabituellement faible" });
          if (def.typicalMax !== undefined && v > def.typicalMax)
            issues.push({ param: key, severity: "warning", message: "valeur inhabituellement élevée" });
        }
        break;
      }
      case "enum":
        if (typeof v !== "string" || !def.options.includes(v))
          issues.push({ param: key, severity: "error", message: `valeur attendue parmi ${def.options.join(", ")}` });
        break;
      case "boolean":
        if (typeof v !== "boolean") issues.push({ param: key, severity: "error", message: "booléen attendu" });
        break;
      case "material":
        if (typeof v !== "string" || !MaterialId.safeParse(v).success)
          issues.push({ param: key, severity: "error", message: "identifiant de matériau attendu" });
        break;
      case "ratio":
        if (typeof v !== "number" || v < 0 || v > 1)
          issues.push({ param: key, severity: "error", message: "valeur entre 0 et 1 attendue" });
        break;
    }
  }
  return issues;
}

export function resolveParameters(
  defs: Record<string, ParameterDef>,
  values: Record<string, ParameterValue>,
): Record<string, ParameterValue> {
  const out: Record<string, ParameterValue> = {};
  for (const [key, def] of Object.entries(defs)) out[key] = values[key] ?? def.default;
  return out;
}
