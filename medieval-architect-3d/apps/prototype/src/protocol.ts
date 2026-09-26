import type { ParameterValue } from "@ma3d/core";
import type { OpeningCut } from "@ma3d/geometry";

/** Messages échangés avec le worker de géométrie. */
export type GeometryRequest = {
  id: number;
  type: string; // ModuleTypeId
  params: Record<string, ParameterValue>;
  openings: OpeningCut[];
};

export type GeometryResponse =
  | {
      id: number;
      ok: true;
      positions: Float32Array;
      indices: Uint32Array;
      watertight: boolean;
      triangles: number;
      ms: number;
      cached: boolean;
    }
  | { id: number; ok: false; error: string };
