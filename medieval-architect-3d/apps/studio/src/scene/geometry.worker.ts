/// <reference lib="webworker" />
import wasmUrl from "manifold-3d/manifold.wasm?url";
import { LIBRARY_BY_TYPE } from "@ma3d/core";
import { GeometryCache, initKernel } from "@ma3d/geometry";
import type { GeometryRequest, GeometryResponse } from "./protocol";

/**
 * Worker de géométrie : tout le calcul paramétrique et booléen se fait ici,
 * le fil principal ne fait qu'afficher. Les tableaux sont transférés, pas copiés.
 */
const ready = initKernel({ locateFile: () => wasmUrl });
const cache = new GeometryCache(256);

self.onmessage = async (e: MessageEvent<GeometryRequest>) => {
  const req = e.data;
  try {
    await ready;
    const def = LIBRARY_BY_TYPE.get(req.type);
    if (!def) throw new Error(`type inconnu : ${req.type}`);
    const g = await cache.get(def, req.params, [], req.quality);
    const positions = g.mesh.positions.slice();
    const indices = g.mesh.indices.slice();
    const res: GeometryResponse = {
      id: req.id,
      ok: true,
      positions,
      indices,
      groups: g.mesh.groups,
      bounds: g.mesh.bounds,
      connectors: g.connectors,
      watertight: g.watertight,
      triangles: g.triangles,
      ms: g.ms,
    };
    (self as DedicatedWorkerGlobalScope).postMessage(res, [positions.buffer, indices.buffer]);
  } catch (err) {
    (self as DedicatedWorkerGlobalScope).postMessage({ id: req.id, ok: false, error: String(err) } satisfies GeometryResponse);
  }
};
