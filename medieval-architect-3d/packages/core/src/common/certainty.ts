import { z } from "zod";
import { SourceId } from "./primitives.js";

/**
 * Niveau de certitude documentaire (§16.1). Porté par chaque instance de module
 * et par chaque paramètre qui le demande. Ne disparaît jamais d'un export ou d'un rapport.
 */
export const CertaintyLevel = z.enum([
  "attested", // vert : attesté par une source ou un vestige
  "very_probable", // bleu
  "hypothetical", // orange
  "free_restitution", // violet
]);
export type CertaintyLevel = z.infer<typeof CertaintyLevel>;

export const CERTAINTY_COLORS: Record<CertaintyLevel, string> = {
  attested: "green",
  very_probable: "blue",
  hypothetical: "orange",
  free_restitution: "purple",
};

/** Qui a produit l'information : cela conditionne le niveau maximal admissible. */
export const Provenance = z.enum(["user", "ai", "generator", "import"]);
export type Provenance = z.infer<typeof Provenance>;

export const Certainty = z
  .object({
    level: CertaintyLevel,
    provenance: Provenance,
    sources: z.array(SourceId).default([]),
    note: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    // Principe non négociable : une IA ne présente jamais une hypothèse comme un fait.
    if (c.level === "attested" && c.sources.length === 0) {
      ctx.addIssue({
        code: "custom",
        message: "« attesté » exige au moins une source référencée",
        path: ["sources"],
      });
    }
    if (c.provenance === "ai" && c.level === "attested") {
      ctx.addIssue({
        code: "custom",
        message: "une proposition de l'IA ne peut pas être marquée « attestée » sans validation utilisateur",
        path: ["level"],
      });
    }
  });
export type Certainty = z.infer<typeof Certainty>;

/** Certitude par défaut d'un élément créé librement par l'utilisateur hors reconstitution. */
export const DEFAULT_CREATION_CERTAINTY: Certainty = {
  level: "free_restitution",
  provenance: "user",
  sources: [],
};

const ORDER: CertaintyLevel[] = ["attested", "very_probable", "hypothetical", "free_restitution"];

/** La certitude d'un ensemble est celle de son élément le moins sûr. */
export function weakestCertainty(levels: CertaintyLevel[]): CertaintyLevel {
  return levels.reduce<CertaintyLevel>(
    (worst, l) => (ORDER.indexOf(l) > ORDER.indexOf(worst) ? l : worst),
    "attested",
  );
}
