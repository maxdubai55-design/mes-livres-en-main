import type { ParameterDef, ParameterTier } from "../module/parameters.js";

/** Raccourcis d'écriture des définitions de bibliothèque. */
type Extra = { technical?: string; handle?: "height" | "width" | "length" | "radius" | "rotation"; typical?: [number, number]; help?: string };

export function length(plain: string, tier: ParameterTier, def: number, min: number, max: number, x: Extra = {}): ParameterDef {
  return {
    kind: "length",
    label: { plain, ...(x.technical ? { technical: x.technical } : {}) },
    tier,
    default: def,
    min,
    max,
    ...(x.handle ? { handle: x.handle } : {}),
    ...(x.typical ? { typicalMin: x.typical[0], typicalMax: x.typical[1] } : {}),
    ...(x.help ? { help: x.help } : {}),
  };
}

export function count(plain: string, tier: ParameterTier, def: number, min: number, max: number, technical?: string): ParameterDef {
  return { kind: "count", label: { plain, ...(technical ? { technical } : {}) }, tier, default: def, min, max };
}

export function flag(plain: string, tier: ParameterTier, def: boolean, technical?: string): ParameterDef {
  return { kind: "boolean", label: { plain, ...(technical ? { technical } : {}) }, tier, default: def };
}

export function choice(plain: string, tier: ParameterTier, options: string[], def: string, technical?: string): ParameterDef {
  return { kind: "enum", label: { plain, ...(technical ? { technical } : {}) }, tier, options, default: def };
}

export function material(plain: string, slot: string, def: string): ParameterDef {
  return { kind: "material", label: { plain }, tier: "discovery", slot, default: def };
}

/** Libellés des valeurs d'énumération, pour l'interface. */
export const OPTION_LABELS: Record<string, string> = {
  none: "aucun",
  conical: "conique",
  terrace: "terrasse",
  pyramid: "pyramidal",
  spire: "flèche",
  gable: "deux pans",
  door: "porte",
  window: "fenêtre",
  arrow_slit: "archère",
  round: "plein cintre",
  pointed: "brisé",
  segmental: "surbaissé",
  barrel: "berceau",
  groin: "arêtes",
  ribbed: "croisée d'ogives",
  romanesque: "roman",
  gothic: "gothique",
};
