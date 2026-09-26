import { z } from "zod";
import { Certainty } from "../common/certainty.js";
import { YearRange, RegionId, StyleId } from "../common/period.js";
import { DualLabel, LevelId, ModuleInstanceId, ModuleTypeId, Transform } from "../common/primitives.js";
import { ConnectorDecl } from "../connector/connector.js";
import { ParameterDef, ParameterValue } from "./parameters.js";

/**
 * ModuleArchitectural — deux objets distincts :
 *  - ModuleDefinition : le « type » (tour ronde), livré par une bibliothèque, versionné ;
 *  - ModuleInstance   : une tour ronde posée dans un projet, avec ses valeurs.
 * La géométrie n'est ni dans l'un ni dans l'autre : elle est recalculée par le
 * générateur désigné, à partir des paramètres résolus (§4 : « pas un maillage figé »).
 */

export const ModuleCategory = z.enum([
  "fortification.wall",
  "fortification.tower",
  "fortification.keep",
  "fortification.defense",
  "fortification.entrance",
  "circulation",
  "residential",
  "terrain.defense",
  "religious.plan",
  "religious.support",
  "religious.arch",
  "religious.vault",
  "religious.buttressing",
  "religious.facade",
  "religious.tower",
  "opening",
  "roof",
  "carpentry",
  "decor",
  "ironwork",
]);

/** Rôle structurel : sert au mode « structure porteuse uniquement » et au moteur structurel. */
export const StructuralRole = z.enum(["bearing", "thrusting", "bracing", "carried", "non_structural"]);

/**
 * Plage d'usage historique d'un type de module, par style/région.
 * Source de vérité du contrôle chronologique (§11) : jamais codée dans un générateur.
 */
export const HistoricalUsage = z.object({
  attested: YearRange, // période d'usage courant
  rareBefore: YearRange.optional(), // usage précoce, exceptionnel
  rareAfter: YearRange.optional(), // survivance
  regions: z.array(RegionId).optional(), // absent = toutes régions du périmètre
  styles: z.array(StyleId).optional(),
  equivalentIfAnachronic: ModuleTypeId.optional(), // proposition de remplacement
  note: z.string().optional(),
  sources: z.array(z.string()).default([]),
});
export type HistoricalUsage = z.infer<typeof HistoricalUsage>;

export const ModuleDefinition = z.object({
  type: ModuleTypeId,
  /** Version sémantique de la définition ; les projets stockent la version utilisée. */
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  label: DualLabel,
  category: ModuleCategory,
  structuralRole: StructuralRole,
  generator: z.string(), // identifiant du générateur géométrique enregistré
  parameters: z.record(z.string(), ParameterDef),
  connectors: z.array(ConnectorDecl),
  /** Sous-modules que l'instance peut porter (ouvertures, couronnement, toiture…). */
  slots: z
    .array(z.object({ name: z.string(), accepts: z.array(ModuleCategory), max: z.number().int().positive() }))
    .default([]),
  history: z.array(HistoricalUsage).default([]),
  /**
   * Datation d'une valeur de paramètre : un arc est d'époque, un arc *brisé* au XIe siècle ne l'est pas.
   * Clé = nom du paramètre, puis valeur sérialisée ("pointed", "true").
   */
  paramHistory: z.record(z.string(), z.record(z.string(), z.array(HistoricalUsage))).default({}),
  learnMore: z
    .object({ short: z.string(), role: z.string(), period: z.string(), example: z.string().optional() })
    .optional(),
});
export type ModuleDefinition = z.infer<typeof ModuleDefinition>;

export const ModuleState = z.object({
  lockedByUser: z.boolean().default(false), // verrouillage (§4) — aussi « zone verrouillée » pour l'IA
  hidden: z.boolean().default(false),
  aiLocked: z.boolean().default(false), // l'IA n'a pas le droit de le modifier
});

export const ModuleInstance = z.object({
  id: ModuleInstanceId,
  type: ModuleTypeId,
  definitionVersion: z.string(),
  name: z.string().optional(),
  transform: Transform,
  level: LevelId.optional(),
  parent: ModuleInstanceId.optional(), // sous-module logé dans un slot
  slot: z.string().optional(),
  params: z.record(z.string(), ParameterValue),
  /** Surcharges par paramètre : ex. hauteur « attestée », couronnement « hypothétique ». */
  certainty: Certainty,
  paramCertainty: z.record(z.string(), Certainty).default({}),
  weathering: z.number().min(0).max(1).optional(), // surcharge locale du curseur de vieillissement
  state: ModuleState.default({ lockedByUser: false, hidden: false, aiLocked: false }),
  group: z.string().optional(),
  tags: z.array(z.string()).default([]),
});
export type ModuleInstance = z.infer<typeof ModuleInstance>;
