import { z } from "zod";
import { RegionId, StyleId, YearRange } from "../common/period.js";
import { LevelId, Millimetres, VariantId } from "../common/primitives.js";
import { Connection } from "../connector/connector.js";
import { Diagnostic } from "../diagnostic/diagnostic.js";
import { ModuleInstance } from "../module/module.js";
import { BuildingSpecification } from "../spec/building-spec.js";

/**
 * Document de projet : la seule source de vérité persistée.
 * Tout le reste (maillages, BVH, textures compressées, résultats de calcul)
 * est dérivé et reconstructible — donc hors du document, dans des caches.
 */

export const Level = z.object({
  id: LevelId,
  name: z.string(), // "Sous-sol", "Rez-de-chaussée", "Chemin de ronde"
  elevation: Millimetres,
  height: Millimetres.optional(),
});

export const Source = z.object({
  id: z.string(),
  kind: z.enum(["plan", "photo", "orthophoto", "survey", "point_cloud", "mesh", "text", "publication"]),
  title: z.string(),
  citation: z.string().optional(),
  assetRef: z.string().optional(),
});

export const ProjectSettings = z.object({
  displayUnit: z.enum(["mm", "cm", "m"]).default("m"),
  uiMode: z.enum(["discovery", "creation", "expert"]).default("discovery"),
  weathering: z.number().min(0).max(1).default(0),
  northAngleMilliDeg: z.number().int().default(0),
  latitude: z.number().min(-90).max(90).optional(),
});

export const Project = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  name: z.string(),
  kind: z.enum(["creation", "reconstruction"]),
  context: z.object({ date: YearRange, region: RegionId.optional(), style: StyleId.optional() }),
  settings: ProjectSettings,
  levels: z.array(Level),
  modules: z.record(z.string(), ModuleInstance), // clé = id d'instance
  connections: z.array(Connection),
  /** Dépendances de bibliothèque figées : type → version de définition utilisée. */
  libraryLock: z.record(z.string(), z.string()),
  spec: BuildingSpecification.optional(), // intention d'origine si générée
  sources: z.array(Source).default([]),
  /** Diagnostics écartés par l'utilisateur (« Continuer ainsi ») : persistés, pas recalculés. */
  dismissedDiagnostics: z.array(z.object({ rule: z.string(), subjects: z.array(z.string()) })).default([]),
  terrainRef: z.string().optional(),
});
export type Project = z.infer<typeof Project>;

export const VariantMeta = z.object({
  id: VariantId,
  name: z.string(),
  parent: VariantId.optional(),
  createdAt: z.string(),
});

export type DiagnosticSnapshot = z.infer<typeof Diagnostic>[];
