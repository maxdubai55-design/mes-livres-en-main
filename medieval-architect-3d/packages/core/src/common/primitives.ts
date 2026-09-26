import { z } from "zod";

/**
 * Toutes les longueurs du modèle sont stockées en millimètres entiers.
 * Raisons : pas de dérive flottante, hachage stable pour le cache géométrique,
 * comparaisons exactes dans les tests. L'affichage convertit (mm, cm, m).
 */
export const Millimetres = z.number().int();
export type Millimetres = z.infer<typeof Millimetres>;

export const PositiveMm = Millimetres.positive();

/** Angles en millidegrés entiers, pour la même raison. 90° = 90000. */
export const MilliDegrees = z.number().int();

export const Vec3 = z.tuple([Millimetres, Millimetres, Millimetres]);
export type Vec3 = z.infer<typeof Vec3>;

/** Rotation stockée en quaternion normalisé (flottants : c'est la seule exception). */
export const Quat = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Quat = z.infer<typeof Quat>;

export const Transform = z.object({
  position: Vec3,
  rotation: Quat,
});
export type Transform = z.infer<typeof Transform>;

export const IDENTITY_TRANSFORM: Transform = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };

/** Identifiants typés par préfixe, lisibles dans les fichiers et les rapports. */
const prefixedId = (prefix: string) =>
  z.string().regex(new RegExp(`^${prefix}_[A-Za-z0-9-]{4,}$`), `identifiant ${prefix}_… attendu`);

export const ModuleInstanceId = prefixedId("mod");
export const ModuleTypeId = z.string().regex(/^[a-z]+(\.[a-z0-9-]+)+$/, "ex. castle.tower.round");
export const ConnectionId = prefixedId("cnx");
export const MaterialId = z.string().regex(/^[a-z]+(\.[a-z0-9-]+)+$/, "ex. stone.limestone.blond");
export const LevelId = prefixedId("lvl");
export const DiagnosticId = prefixedId("diag");
export const SourceId = prefixedId("src");
export const VariantId = prefixedId("var");

export type ModuleInstanceId = z.infer<typeof ModuleInstanceId>;
export type ModuleTypeId = z.infer<typeof ModuleTypeId>;
export type MaterialId = z.infer<typeof MaterialId>;

/** Texte affiché : terme courant + terme technique (règle de vocabulaire double, §2.5). */
export const DualLabel = z.object({
  plain: z.string().min(1),
  technical: z.string().optional(),
});
export type DualLabel = z.infer<typeof DualLabel>;
