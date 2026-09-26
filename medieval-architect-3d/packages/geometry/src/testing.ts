import type { MeshData } from "./kernel.js";

/** Distance minimale d'un point à la surface d'un maillage (force brute, pour les tests). */
export function distanceToMesh(p: [number, number, number], m: MeshData): number {
  let best = Infinity;
  const P = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const a = m.indices[i]! * 3, b = m.indices[i + 1]! * 3, c = m.indices[i + 2]! * 3;
    const d = pointTriangle(p, [P[a]!, P[a + 1]!, P[a + 2]!], [P[b]!, P[b + 1]!, P[b + 2]!], [P[c]!, P[c + 1]!, P[c + 2]!]);
    if (d < best) best = d;
  }
  return best;
}

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Ericson, « Real-Time Collision Detection », §5.1.5. */
function pointTriangle(p: V, a: V, b: V, c: V): number {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const at = (q: V) => Math.hypot(...sub(p, q));
  if (d1 <= 0 && d2 <= 0) return at(a);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return at(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) {
    const v = d1 / (d1 - d3);
    return at([a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]]);
  }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return at(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) {
    const w = d2 / (d2 - d6);
    return at([a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]]);
  }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
    const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
    return at([b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])]);
  }
  const denom = 1 / (va + vb + vc);
  const v = vb * denom, w = vc * denom;
  return at([a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w]);
}
