import type { Manifold } from "manifold-3d";
import type { ParameterValue, ResolvedConnector } from "@ma3d/core";
import { build, toMeshData, type MeshData, type Scope, type Vec3 } from "./kernel.js";

/**
 * Convention d'axes du modèle : Z vers le haut, millimètres.
 * (La scène Three.js, en Y vers le haut et en mètres, convertit à l'affichage.)
 */

/** Ouverture explicite (au-delà de celles que le module répartit lui-même). */
export type OpeningCut = {
  shape: "rect" | "round_arch" | "slit";
  /** Mur : distance depuis le début, au centre de l'ouverture. Tour : angle en degrés. */
  at: number;
  width: number;
  /** Hauteur totale, arc compris. */
  height: number;
  sill: number;
};

/** Niveau de détail : `low` sert aux vues lointaines (moins de segments sur les courbes). */
export type Quality = "high" | "low";

export type GeneratorInput = {
  params: Record<string, ParameterValue>;
  openings: OpeningCut[];
  quality?: Quality;
};

export type Construction = { solid: Manifold; connectors: ResolvedConnector[] };

export interface Generator {
  id: string;
  /** Incrémentée à chaque changement de la géométrie produite : invalide le cache. */
  version: number;
  construct(k: Scope, input: GeneratorInput): Construction;
}

export type GeneratedGeometry = {
  mesh: MeshData;
  connectors: ResolvedConnector[];
  volumeMm3: number;
  triangles: number;
  /** Étanche et orienté : condition de l'export STL et de l'impression 3D. */
  watertight: boolean;
  genus: number;
  ms: number;
};

export async function run(gen: Generator, input: GeneratorInput): Promise<GeneratedGeometry> {
  const t0 = performance.now();
  return build((k) => {
    const { solid, connectors } = gen.construct(k, input);
    const status = solid.status();
    return {
      mesh: toMeshData(solid, k),
      connectors,
      volumeMm3: solid.volume(),
      triangles: solid.numTri(),
      watertight: status === "NoError" && !solid.isEmpty(),
      genus: solid.genus(),
      ms: performance.now() - t0,
    };
  });
}

// --- utilitaires partagés par les générateurs --------------------------------

export function num(p: Record<string, ParameterValue>, key: string, fallback?: number): number {
  const v = p[key];
  if (typeof v === "number") return v;
  if (fallback !== undefined) return fallback;
  throw new TypeError(`paramètre numérique manquant : ${key}`);
}

export function bool(p: Record<string, ParameterValue>, key: string, fallback = false): boolean {
  const v = p[key];
  return typeof v === "boolean" ? v : fallback;
}

export function str(p: Record<string, ParameterValue>, key: string, fallback: string): string {
  const v = p[key];
  return typeof v === "string" ? v : fallback;
}

/** Nombre de segments d'un cercle : proportionnel au diamètre, borné, réduit en basse qualité. */
export function segmentsFor(diameter: number, quality: Quality = "high"): number {
  const n = Math.round(diameter / 250);
  const clamped = Math.min(64, Math.max(24, n));
  const q = quality === "low" ? Math.max(12, Math.round(clamped / 3)) : clamped;
  return q - (q % 4); // multiple de 4 : sommets aux quatre points cardinaux (connecteurs exacts)
}

/** Quaternion qui tourne +Z vers la direction `d` (normalisée). Repère sortant des connecteurs. */
export function quatFromZ(d: Vec3): [number, number, number, number] {
  const [x, y, z] = d;
  const len = Math.hypot(x, y, z);
  const nx = x / len, ny = y / len, nz = z / len;
  if (nz > 0.999999) return [0, 0, 0, 1];
  if (nz < -0.999999) return [1, 0, 0, 0];
  // axe = Z × d, angle = acos(Z·d)
  const ax = -ny, ay = nx;
  const s = Math.sqrt((1 + nz) * 2);
  return [ax / s, ay / s, 0, s / 2];
}

export function connector(
  name: string,
  kind: ResolvedConnector["kind"],
  role: ResolvedConnector["role"],
  position: Vec3,
  outward: Vec3,
  size: number,
): ResolvedConnector {
  return {
    name,
    kind,
    role,
    size: Math.round(size),
    frame: { position: position.map(Math.round) as Vec3, rotation: quatFromZ(outward) },
  };
}
