import { z } from "zod";
import { DualLabel, MaterialId } from "../common/primitives.js";

/**
 * Système de matériaux (§7, §14.2). Un matériau réunit trois facettes séparées,
 * consommées par trois moteurs différents :
 *   - appearance : rendu PBR (moteur de rendu) ;
 *   - mechanics  : propriétés mécaniques (moteur structurel) ;
 *   - history    : usage régional/chronologique (moteur historique).
 * Un utilisateur applique « calcaire blond » ; chaque moteur lit sa facette.
 */

export const MaterialFamily = z.enum([
  "stone",
  "mortar",
  "render",
  "wood",
  "roofing",
  "metal",
  "glass",
  "stained_glass",
  "earth",
  "plaster",
]);

const TextureRef = z.string(); // chemin dans le paquet d'assets, ex. "tex/limestone_blond/albedo.ktx2"

export const PbrAppearance = z.object({
  albedo: TextureRef.optional(),
  baseColor: z.tuple([z.number(), z.number(), z.number()]).optional(), // si pas de texture
  normal: TextureRef.optional(),
  roughness: z.union([TextureRef, z.number().min(0).max(1)]),
  ao: TextureRef.optional(),
  height: TextureRef.optional(),
  metallic: z.union([TextureRef, z.number().min(0).max(1)]).default(0),
  transmission: z.number().min(0).max(1).optional(),
  opacity: z.number().min(0).max(1).optional(),
  thickness: z.number().nonnegative().optional(), // mm, pour la transmission volumique
  ior: z.number().min(1).max(3).optional(),
  /** Taille réelle d'une répétition de texture : garantit l'échelle quel que soit le module. */
  tileSizeMm: z.number().int().positive(),
  /** Appareillage (moellon, pierre de taille…) : paramètres du shader procédural de joints. */
  bond: z
    .object({
      pattern: z.enum(["ashlar", "coursed_rubble", "random_rubble", "pebbles", "brick"]),
      courseHeightMm: z.number().int().positive(),
      jointWidthMm: z.number().int().nonnegative(),
      mortar: MaterialId,
    })
    .optional(),
});

/** Valeurs par défaut prudentes, éditables en mode Expert. Unités SI dans le champ. */
export const Mechanics = z.object({
  density: z.number().positive(), // kg/m³
  youngModulus: z.number().positive(), // MPa
  poisson: z.number().min(0).max(0.5),
  compressiveStrength: z.number().positive(), // MPa
  tensileStrength: z.number().nonnegative(), // MPa — souvent ≈ 0 pour une maçonnerie
  shearStrength: z.number().nonnegative(), // MPa
  /** Valeurs issues d'une fourchette bibliographique, pas d'un essai : le rapport le dira. */
  basis: z.enum(["literature_range", "user_measured", "placeholder"]),
});

export const MaterialUsage = z.object({
  regions: z.array(z.string()).optional(),
  from: z.number().int().optional(),
  to: z.number().int().optional(),
  note: z.string().optional(),
});

/** Paramètres propres au verre et au vitrail (§7.2). */
export const GlassParams = z.object({
  tint: z.tuple([z.number(), z.number(), z.number()]),
  irregularity: z.number().min(0).max(1),
  bubbles: z.number().min(0).max(1),
  grime: z.number().min(0).max(1),
});

export const WeatheringChannels = z.object({
  fading: z.boolean().default(true),
  moss: z.boolean().default(true),
  lichen: z.boolean().default(true),
  damp: z.boolean().default(true),
  soot: z.boolean().default(false),
  cracks: z.boolean().default(true),
  mortarErosion: z.boolean().default(true),
  missingStones: z.boolean().default(false),
});

export const Material = z.object({
  id: MaterialId,
  label: DualLabel,
  family: MaterialFamily,
  appearance: PbrAppearance,
  mechanics: Mechanics.optional(), // absent pour les matériaux purement décoratifs
  usage: z.array(MaterialUsage).default([]),
  glass: GlassParams.optional(),
  /** Variantes d'état : « neuf », « érodé », « rouille avancée »… Même mécanique, autre apparence. */
  states: z.record(z.string(), PbrAppearance.partial()).default({}),
});
export type Material = z.infer<typeof Material>;
