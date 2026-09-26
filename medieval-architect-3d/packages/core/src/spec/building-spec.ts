import { z } from "zod";
import { Certainty } from "../common/certainty.js";
import { RegionId, StyleId, YearRange } from "../common/period.js";
import { Millimetres, ModuleTypeId, PositiveMm } from "../common/primitives.js";
import { ParameterValue } from "../module/parameters.js";

/**
 * BuildingSpecification (§9) — l'intention, pas la géométrie.
 *
 * Produite par l'IA à partir d'une phrase, ou par l'utilisateur via l'assistant
 * « Générer un édifice ». Consommée par le Planificateur, qui la traduit en
 * ModuleInstance + Connection. Elle reste stockée dans le projet : c'est elle
 * qu'on régénère quand l'utilisateur verrouille une partie et demande « complète le reste ».
 *
 * Les éléments de la spec sont des « intentions de module » : un type, un rôle,
 * des paramètres partiels (le reste est choisi par le Planificateur), des relations.
 */

export const BuildingType = z.enum([
  "castle",
  "fortress",
  "keep_only",
  "fortified_gate",
  "abbey",
  "church",
  "cathedral",
  "chapel",
  "fortified_church",
]);

export const Terrain = z.object({
  kind: z.enum(["flat", "slope", "spur", "hilltop", "plain_by_river", "imported"]),
  support: z.enum(["rock", "very_compact", "medium", "loose"]).default("medium"),
  footprint: z.object({ length: PositiveMm, width: PositiveMm }).optional(),
  maxSlopePercent: z.number().min(0).max(200).optional(),
  heightfieldRef: z.string().optional(), // asset importé
});

/** Référence symbolique entre intentions : "tower#1", "curtain.outer#3". */
const IntentRef = z.string().regex(/^[a-z][a-z0-9.-]*#\d+$/);

export const ModuleIntent = z.object({
  ref: IntentRef,
  type: ModuleTypeId,
  /** Rôle sémantique qui guide le Planificateur : "outer_enceinte", "main_gate", "façade_tower"… */
  role: z.string().optional(),
  params: z.record(z.string(), ParameterValue).default({}),
  count: z.number().int().positive().default(1),
  /** Contrainte de placement exprimée qualitativement ; le Planificateur la résout. */
  placement: z
    .object({
      zone: z.enum(["center", "perimeter", "corner", "axis", "facade", "apse", "free"]).optional(),
      relativeTo: IntentRef.optional(),
      spacing: Millimetres.optional(),
    })
    .optional(),
  certainty: Certainty.optional(),
});
export type ModuleIntent = z.infer<typeof ModuleIntent>;

export const Relation = z.object({
  kind: z.enum(["connects", "encloses", "flanks", "above", "carries", "buttresses", "aligned_with"]),
  from: IntentRef,
  to: IntentRef,
});

export const Constraint = z.object({
  domain: z.enum(["history", "architecture", "structure", "user"]),
  /** strict : le Planificateur rejette une solution qui la viole ; soft : pénalité de score. */
  strength: z.enum(["strict", "soft"]),
  statement: z.string(), // lisible, montré à l'utilisateur
  /** Forme machine optionnelle, ex. { param: "height", op: "<=", value: 30000, target: "tower#*" } */
  rule: z.record(z.string(), z.unknown()).optional(),
});

export const GenerationMode = z.enum(["free", "historically_constrained", "variants", "partial", "complete_locked"]);

export const BuildingSpecification = z.object({
  schemaVersion: z.literal(1),
  building: z.object({
    type: BuildingType,
    name: z.string().optional(),
    date: YearRange,
    region: RegionId.optional(),
    style: StyleId.optional(),
    function: z.string().optional(), // "forteresse royale", "cathédrale épiscopale"…
  }),
  overall: z.object({
    length: PositiveMm.optional(),
    width: PositiveMm.optional(),
    height: PositiveMm.optional(),
  }),
  terrain: Terrain.optional(),
  levels: z.array(z.object({ name: z.string(), elevation: Millimetres })).default([]),
  modules: z.array(ModuleIntent).min(1),
  relations: z.array(Relation).default([]),
  constraints: z.array(Constraint).default([]),
  generation: z.object({
    mode: GenerationMode,
    variants: z.number().int().min(1).max(8).default(1),
    seed: z.number().int().optional(), // reproductibilité
    /** Instances existantes que la génération ne doit pas toucher (§9.1 « Verrouillage »). */
    lockedInstances: z.array(z.string()).default([]),
    /** Pour le mode partial : ce qu'on génère seulement. */
    scope: z.array(z.string()).optional(),
  }),
  /** Ce que l'IA a déduit sans que l'utilisateur l'ait dit : montré avant génération. */
  assumptions: z.array(z.string()).default([]),
  /** Texte d'origine, pour traçabilité. */
  prompt: z.string().optional(),
});
export type BuildingSpecification = z.infer<typeof BuildingSpecification>;

/**
 * Vérifications de cohérence interne qui ne relèvent pas du typage :
 * références orphelines, doublons de ref.
 */
export function checkSpecReferences(spec: BuildingSpecification): string[] {
  const errors: string[] = [];
  const refs = new Set<string>();
  for (const m of spec.modules) {
    if (refs.has(m.ref)) errors.push(`référence dupliquée : ${m.ref}`);
    refs.add(m.ref);
  }
  const known = (r: string) => refs.has(r);
  for (const rel of spec.relations) {
    if (!known(rel.from)) errors.push(`relation ${rel.kind} : « ${rel.from} » inconnu`);
    if (!known(rel.to)) errors.push(`relation ${rel.kind} : « ${rel.to} » inconnu`);
  }
  for (const m of spec.modules) {
    const rt = m.placement?.relativeTo;
    if (rt && !known(rt)) errors.push(`${m.ref} : placement relatif à « ${rt} » inconnu`);
  }
  return errors;
}
