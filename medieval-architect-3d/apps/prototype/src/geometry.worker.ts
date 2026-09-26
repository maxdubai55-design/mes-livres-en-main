/// <reference lib="webworker" />
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { CASTLE_LIBRARY } from "@ma3d/core/src/library/castle.js";
import { GeometryCache, initKernel } from "@ma3d/geometry";
import type { GeometryRequest, GeometryResponse } from "./protocol";

/**
 * Worker de géométrie : tout le calcul paramétrique et booléen se fait ici,
 * le fil principal ne fait qu'afficher. Les tableaux sont transférés, pas copiés.
 */
const ready = initKernel({ locateFile: () => wasmUrl });
const cache = new GeometryCache();
const defs = new Map(CASTLE_LIBRARY.map((d) => [d.type, d]));

self.onmessage = async (e: MessageEvent<GeometryRequest>) => {
  const req = e.data;
  try {
    await ready;
    const def = defs.get(req.type);
    if (!def) throw new Error(`type inconnu : ${req.type}`);
    const missesBefore = cache.misses;
    const g = await cache.get(def, req.params, req.openings);
    // copie : l'original reste dans le cache du worker
    const positions = g.mesh.positions.slice();
    const indices = g.mesh.indices.slice();
    const res: GeometryResponse = {
      id: req.id,
      ok: true,
      positions,
      indices,
      watertight: g.watertight,
      triangles: g.triangles,
      ms: g.ms,
      cached: cache.misses === missesBefore,
    };
    (self as DedicatedWorkerGlobalScope).postMessage(res, [positions.buffer, indices.buffer]);
  } catch (err) {
    const res: GeometryResponse = { id: req.id, ok: false, error: String(err) };
    (self as DedicatedWorkerGlobalScope).postMessage(res);
  }
};
