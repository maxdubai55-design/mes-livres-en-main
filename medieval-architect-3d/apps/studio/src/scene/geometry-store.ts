import * as THREE from "three/webgpu";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { LIBRARY_BY_TYPE, type ParameterValue, type ResolvedConnector } from "@ma3d/core";
import { geometryKey } from "@ma3d/geometry/src/registry.js";
import type { Quality } from "@ma3d/geometry/src/generator.js";
import type { GeometryPayload, GeometryRequest, GeometryResponse } from "./protocol";

export type GeometryEntry = {
  key: string;
  geometry: THREE.BufferGeometry;
  connectors: ResolvedConnector[];
  /** Boîte englobante locale, repère modèle (mm, Z en haut). */
  bounds: GeometryPayload["bounds"];
  watertight: boolean;
  triangles: number;
  ms: number;
};

export const SLOT_INDEX: Record<string, number> = { masonry: 0, roof: 1, timber: 2 };

/**
 * Magasin de géométries partagées. Une géométrie est calculée une fois par jeu de
 * paramètres, puis partagée par toutes les instances identiques (compteur de références).
 * Les entrées inutilisées sont libérées au-delà de `maxIdle`.
 */
export class GeometryStore {
  private workers: Worker[];
  private rr = 0;
  private pending = new Map<number, (r: GeometryResponse) => void>();
  private next = 1;
  private entries = new Map<string, Promise<GeometryEntry>>();
  private refs = new Map<string, number>();
  private idle: string[] = [];
  computeMs = 0;
  requests = 0;

  constructor(workers = Math.min(4, Math.max(1, (navigator.hardwareConcurrency ?? 2) - 1)), private maxIdle = 200) {
    this.workers = Array.from({ length: workers }, () => {
      const w = new Worker(new URL("./geometry.worker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent<GeometryResponse>) => {
        this.pending.get(e.data.id)?.(e.data);
        this.pending.delete(e.data.id);
      };
      return w;
    });
  }

  keyOf(type: string, params: Record<string, ParameterValue>, quality: Quality = "high"): string {
    const def = LIBRARY_BY_TYPE.get(type);
    if (!def) throw new Error(`type inconnu : ${type}`);
    return geometryKey(def, params, [], quality);
  }

  /** Obtient (et réserve) une géométrie. Appeler `release(key)` quand elle n'est plus affichée. */
  acquire(type: string, params: Record<string, ParameterValue>, quality: Quality = "high"): { key: string; entry: Promise<GeometryEntry> } {
    const key = this.keyOf(type, params, quality);
    this.refs.set(key, (this.refs.get(key) ?? 0) + 1);
    this.idle = this.idle.filter((k) => k !== key);
    let entry = this.entries.get(key);
    if (!entry) {
      entry = this.compute(key, type, params, quality);
      this.entries.set(key, entry);
      entry.catch(() => this.entries.delete(key));
    }
    return { key, entry };
  }

  /** Accès sans réservation (diagnostics, exports). */
  peek(key: string): Promise<GeometryEntry> | undefined {
    return this.entries.get(key);
  }

  release(key: string): void {
    const n = (this.refs.get(key) ?? 1) - 1;
    if (n > 0) {
      this.refs.set(key, n);
      return;
    }
    this.refs.delete(key);
    this.idle.push(key);
    while (this.idle.length > this.maxIdle) {
      const k = this.idle.shift()!;
      this.entries.get(k)?.then((e) => e.geometry.dispose());
      this.entries.delete(k);
    }
  }

  private compute(key: string, type: string, params: Record<string, ParameterValue>, quality: Quality): Promise<GeometryEntry> {
    const id = this.next++;
    const worker = this.workers[this.rr++ % this.workers.length]!;
    this.requests++;
    return new Promise<GeometryEntry>((resolve, reject) => {
      this.pending.set(id, (r) => {
        if (!r.ok) return reject(new Error(r.error));
        this.computeMs = r.ms;
        resolve({
          key,
          geometry: toThree(r),
          connectors: r.connectors,
          bounds: r.bounds,
          watertight: r.watertight,
          triangles: r.triangles,
          ms: r.ms,
        });
      });
      worker.postMessage({ id, type, params, quality } satisfies GeometryRequest);
    });
  }
}

/**
 * Modèle (Z en haut, mm) → scène (Y en haut, m). Normales « pliées » à 35° :
 * les cylindres restent lisses avec peu de segments, les arêtes vives restent vives.
 */
function toThree(p: GeometryPayload): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(p.positions, 3));
  g.setIndex(new THREE.BufferAttribute(p.indices, 1));
  for (const grp of p.groups) g.addGroup(grp.start, grp.count, SLOT_INDEX[grp.slot] ?? 0);
  g.rotateX(-Math.PI / 2);
  g.scale(0.001, 0.001, 0.001);
  const creased = toCreasedNormals(g, (35 * Math.PI) / 180);
  // toCreasedNormals perd les groupes (sortie non indexée : 3 sommets par triangle, même ordre)
  creased.clearGroups();
  for (const grp of p.groups) creased.addGroup(grp.start, grp.count, SLOT_INDEX[grp.slot] ?? 0);
  g.dispose();
  creased.computeBoundingBox();
  creased.computeBoundingSphere();
  return creased;
}
