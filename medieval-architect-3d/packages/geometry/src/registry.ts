import { resolveParameters, type ModuleDefinition, type ParameterValue } from "@ma3d/core";
import { run, type GeneratedGeometry, type Generator, type OpeningCut, type Quality } from "./generator.js";
import { apse, gatehouse, hall, nave } from "./generators/buildings.js";
import { arch, buttress, column, hoarding, machicolation, vault } from "./generators/structure.js";
import { roundTower, squareTower } from "./generators/tower.js";
import { straightWall } from "./generators/wall.js";

export const GENERATORS: Record<string, Generator> = Object.fromEntries(
  [straightWall, roundTower, squareTower, gatehouse, hall, nave, apse, column, arch, vault, buttress, machicolation, hoarding].map(
    (g) => [g.id, g],
  ),
);

/** Sérialisation à clés triées : deux jeux de paramètres égaux donnent la même clé. */
export function stableKey(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableKey).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableKey(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** Clé de cache d'une géométrie : ce qui la détermine entièrement, et rien d'autre. */
export function geometryKey(
  def: ModuleDefinition,
  params: Record<string, ParameterValue>,
  openings: OpeningCut[] = [],
  quality: Quality = "high",
): string {
  const gen = GENERATORS[def.generator];
  const resolved = resolveParameters(def.parameters, params);
  return stableKey({ g: def.generator, gv: gen?.version ?? 0, t: def.type, v: def.version, p: resolved, o: openings, q: quality });
}

/**
 * Cache de géométrie (§24). La position de l'instance n'entre pas dans la clé :
 * vingt tours identiques placées à vingt endroits partagent un seul maillage.
 * Politique LRU bornée.
 */
export class GeometryCache {
  private entries = new Map<string, Promise<GeneratedGeometry>>();
  hits = 0;
  misses = 0;
  constructor(private readonly max = 512) {}

  get(
    def: ModuleDefinition,
    params: Record<string, ParameterValue>,
    openings: OpeningCut[] = [],
    quality: Quality = "high",
  ): Promise<GeneratedGeometry> {
    const gen = GENERATORS[def.generator];
    if (!gen) return Promise.reject(new Error(`générateur inconnu : ${def.generator}`));
    const key = geometryKey(def, params, openings, quality);
    const hit = this.entries.get(key);
    if (hit) {
      this.hits++;
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    this.misses++;
    const resolved = resolveParameters(def.parameters, params);
    const pending = run(gen, { params: resolved, openings, quality });
    pending.catch(() => this.entries.delete(key)); // un échec ne reste pas en cache
    this.entries.set(key, pending);
    if (this.entries.size > this.max) this.entries.delete(this.entries.keys().next().value!);
    return pending;
  }

  get size(): number {
    return this.entries.size;
  }
}
