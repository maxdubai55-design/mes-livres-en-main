import type { Transform } from "@ma3d/core";
import type { Vec3 } from "./kernel.js";

/** Applique une rotation (quaternion x, y, z, w) à un vecteur. */
export function rotateVec(q: Transform["rotation"], v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const [vx, vy, vz] = v;
  // t = 2 q × v ; v' = v + w t + q × t
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx),
  ];
}

export function toWorld(t: Transform, p: Vec3): Vec3 {
  const r = rotateVec(t.rotation, p);
  return [r[0] + t.position[0], r[1] + t.position[1], r[2] + t.position[2]];
}

/** Boîte englobante monde d'une boîte locale transformée (8 sommets). */
export function worldBounds(t: Transform, b: { min: Vec3; max: Vec3 }): { min: Vec3; max: Vec3 } {
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const x of [b.min[0], b.max[0]])
    for (const y of [b.min[1], b.max[1]])
      for (const z of [b.min[2], b.max[2]]) {
        const w = toWorld(t, [x, y, z]);
        for (let i = 0; i < 3; i++) {
          min[i] = Math.min(min[i]!, w[i]!);
          max[i] = Math.max(max[i]!, w[i]!);
        }
      }
  return { min, max };
}

/** Quaternion d'une rotation autour de la verticale (degrés). */
export function yaw(deg: number): Transform["rotation"] {
  const a = (deg * Math.PI) / 360;
  return [0, 0, Math.sin(a), Math.cos(a)];
}

export function yawOf(q: Transform["rotation"]): number {
  return (Math.atan2(2 * (q[3] * q[2] + q[0] * q[1]), 1 - 2 * (q[1] * q[1] + q[2] * q[2])) * 180) / Math.PI;
}
