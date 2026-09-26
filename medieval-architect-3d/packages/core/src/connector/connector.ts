import { z } from "zod";
import { ConnectionId, ModuleInstanceId, Transform } from "../common/primitives.js";

/**
 * Connecteurs (§4). Un connecteur est un repère local exposé par un module,
 * calculé par son générateur à partir des paramètres (il suit la géométrie).
 *
 * Le « genre » dit ce qui se raccorde ; le « rôle » dit qui porte qui,
 * ce qui alimente directement le graphe des chemins de charge (§13.1).
 */
export const ConnectorKind = z.enum([
  "wall.end", // extrémité de mur / courtine
  "wall.face", // accroche sur le parement (contrefort, tour flanquante)
  "wall.top", // arase : crénelage, parapet, hourd, toiture
  "wall.opening", // logement d'ouverture dans l'épaisseur
  "tower.flank", // point d'attache d'une courtine sur une tour
  "tower.top",
  "floor.level", // niveau de plancher (lien avec le système de niveaux)
  "stair.landing",
  "walkway", // chemin de ronde : continuité de circulation
  "support.top", // sommet de pile / colonne
  "support.base",
  "arch.springer", // naissance d'arc ou de voûte
  "vault.keystone",
  "buttress.head", // tête de contrefort / culée recevant un arc-boutant
  "flying.head", // tête d'arc-boutant côté nef
  "flying.foot", // pied d'arc-boutant côté culée
  "roof.eave",
  "roof.ridge",
  "foundation",
  "terrain",
]);
export type ConnectorKind = z.infer<typeof ConnectorKind>;

export const LoadRole = z.enum(["carries", "is_carried", "neutral"]);
export type LoadRole = z.infer<typeof LoadRole>;

/** Déclaration dans la définition de module : combien, et avec qui ça peut se raccorder. */
export const ConnectorDecl = z.object({
  /** Nom stable, éventuellement indexé : "flank", "top", "springer[0..3]". */
  name: z.string(),
  kind: ConnectorKind,
  role: LoadRole,
  /** Nombre maximal de connexions simultanées sur ce connecteur. */
  capacity: z.number().int().positive().default(1),
  /** Paramètre de module dont dépend la dimension de raccord (épaisseur, largeur…). */
  sizeParam: z.string().optional(),
});
export type ConnectorDecl = z.infer<typeof ConnectorDecl>;

/** Connecteur résolu par le générateur : position réelle + dimension de raccord. */
export type ResolvedConnector = {
  name: string;
  kind: ConnectorKind;
  role: LoadRole;
  frame: Transform; // repère local au module ; l'axe Z sortant
  size: number; // mm : épaisseur de mur, largeur de passage…
};

/** Raccord effectif entre deux instances, stocké dans le projet. */
export const Connection = z.object({
  id: ConnectionId,
  a: z.object({ module: ModuleInstanceId, connector: z.string() }),
  b: z.object({ module: ModuleInstanceId, connector: z.string() }),
  /** Raccord accepté malgré un avertissement : on garde la trace de la décision de l'utilisateur. */
  acknowledged: z.boolean().default(false),
});
export type Connection = z.infer<typeof Connection>;
