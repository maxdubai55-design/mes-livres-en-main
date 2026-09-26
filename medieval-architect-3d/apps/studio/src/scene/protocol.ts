import type { ParameterValue, ResolvedConnector } from "@ma3d/core";
import type { Quality } from "@ma3d/geometry/src/generator.js";
import type { MeshGroup } from "@ma3d/geometry/src/kernel.js";

/** Messages échangés avec le worker de géométrie. */
export type GeometryRequest = {
  id: number;
  type: string;
  params: Record<string, ParameterValue>;
  quality: Quality;
};

export type GeometryPayload = {
  positions: Float32Array;
  indices: Uint32Array;
  groups: MeshGroup[];
  bounds: { min: [number, number, number]; max: [number, number, number] };
  connectors: ResolvedConnector[];
  watertight: boolean;
  triangles: number;
  ms: number;
};

export type GeometryResponse = ({ id: number; ok: true } & GeometryPayload) | { id: number; ok: false; error: string };
