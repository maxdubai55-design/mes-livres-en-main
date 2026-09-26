import Module from "manifold-3d";
import type { Manifold, ManifoldToplevel } from "manifold-3d";

/**
 * Adaptateur du noyau géométrique. Les générateurs n'importent jamais
 * manifold-3d directement : ils reçoivent un `Scope`. Changer de noyau
 * (OpenCascade, par exemple) ne touche que ce fichier.
 *
 * Mémoire : manifold-3d alloue dans le tas WASM, que le ramasse-miettes JS
 * ne libère pas. Chaque génération se fait dans un `Scope` qui supprime tous
 * les solides intermédiaires à la fin ; seul le maillage final (tableaux JS) sort.
 *
 * Matériaux : un solide peut être « étiqueté » (toit, charpente). L'étiquette
 * survit aux opérations booléennes grâce à l'identifiant d'origine de manifold,
 * et devient un groupe de triangles dans le maillage final.
 */

let toplevel: ManifoldToplevel | undefined;

/** `locateFile` sert au navigateur : le bundler fournit l'URL du fichier .wasm. */
export async function initKernel(options?: { locateFile?: () => string }): Promise<ManifoldToplevel> {
  if (!toplevel) {
    const locateFile = options?.locateFile;
    toplevel = await (locateFile ? Module({ locateFile }) : Module());
    toplevel.setup();
  }
  return toplevel;
}

export type Vec3 = [number, number, number];
export type Vec2 = [number, number];

/** Emplacements de matériau d'un module. `masonry` par défaut. */
export type MaterialSlot = "masonry" | "roof" | "timber";

export type MeshGroup = { start: number; count: number; slot: MaterialSlot };

export type MeshData = {
  /** Positions en millimètres, 3 flottants par sommet. */
  positions: Float32Array;
  indices: Uint32Array;
  /** Plages d'indices par emplacement de matériau, triées, contiguës. */
  groups: MeshGroup[];
  bounds: { min: Vec3; max: Vec3 };
};

export class Scope {
  private owned: Manifold[] = [];
  private tags = new Map<number, MaterialSlot>();
  constructor(readonly m: ManifoldToplevel) {}

  /** Enregistre un solide pour suppression en fin de portée. */
  own<T extends Manifold>(s: T): T {
    this.owned.push(s);
    return s;
  }

  /** Marque un solide comme relevant d'un autre matériau (toit, bois). */
  tag(s: Manifold, slot: MaterialSlot): Manifold {
    const o = this.own(s.asOriginal());
    this.tags.set(o.originalID(), slot);
    return o;
  }

  slotOf(originalId: number): MaterialSlot {
    return this.tags.get(originalId) ?? "masonry";
  }

  box(size: Vec3, at: Vec3 = [0, 0, 0]): Manifold {
    const b = this.own(this.m.Manifold.cube(size, false));
    return this.own(b.translate(at));
  }

  /** Boîte centrée en X et Y, posée sur z. */
  cbox(sx: number, sy: number, sz: number, at: Vec3 = [0, 0, 0]): Manifold {
    return this.box([sx, sy, sz], [at[0] - sx / 2, at[1] - sy / 2, at[2]]);
  }

  cylinder(height: number, rLow: number, rHigh = rLow, segments = 48, at: Vec3 = [0, 0, 0]): Manifold {
    const c = this.own(this.m.Manifold.cylinder(height, rLow, rHigh, segments, false));
    return this.own(c.translate(at));
  }

  /** Extrusion d'un profil 2D (plan XY) le long de Z, avec réduction éventuelle au sommet. */
  extrude(profile: Vec2[] | Vec2[][], height: number, scaleTop?: number | Vec2): Manifold {
    const raw = Array.isArray(profile[0]![0]) ? (profile as Vec2[][]) : [profile as Vec2[]];
    // Règle de remplissage « positive » : un contour horaire serait vide. On normalise.
    const polys = raw.map(ccw);
    // Piège : un facteur numérique est lu comme [s, 0] par manifold-3d (sommet écrasé en biseau).
    const top: Vec2 = typeof scaleTop === "number" ? [scaleTop, scaleTop] : (scaleTop ?? [1, 1]);
    return this.own(this.m.Manifold.extrude(polys, height, 0, 0, top));
  }

  /**
   * Profil (u, v) extrudé le long de X monde : u → Y monde, v → Z monde.
   * C'est la primitive des murs, toitures à pignon, arcs et voûtes en berceau.
   */
  extrudeX(profile: Vec2[] | Vec2[][], length: number, x0 = 0): Manifold {
    return this.translate(this.rotate(this.extrude(profile, length), [90, 0, 90]), [x0, 0, 0]);
  }

  /** Même chose le long de Y monde (de y0 à y0 + length) : u → −X monde, v → Z monde. */
  extrudeY(profile: Vec2[] | Vec2[][], length: number, y0 = 0): Manifold {
    return this.translate(this.rotate(this.extrudeX(profile, length), [0, 0, 90]), [0, y0, 0]);
  }

  union(parts: Manifold[]): Manifold {
    if (parts.length === 1) return parts[0]!;
    return this.own(this.m.Manifold.union(parts));
  }

  difference(base: Manifold, cutters: Manifold[]): Manifold {
    if (cutters.length === 0) return base;
    return this.own(base.subtract(this.union(cutters)));
  }

  intersect(a: Manifold, b: Manifold): Manifold {
    return this.own(a.intersect(b));
  }

  hull(parts: Manifold[]): Manifold {
    return this.own(this.m.Manifold.hull(parts));
  }

  translate(s: Manifold, v: Vec3): Manifold {
    return this.own(s.translate(v));
  }

  rotate(s: Manifold, degrees: Vec3): Manifold {
    return this.own(s.rotate(degrees));
  }

  mirrorY(s: Manifold): Manifold {
    return this.own(s.mirror([0, 1, 0]));
  }

  dispose(): void {
    for (const s of this.owned) s.delete();
    this.owned = [];
  }
}

const SLOT_ORDER: MaterialSlot[] = ["masonry", "roof", "timber"];

export function toMeshData(s: Manifold, k: Scope): MeshData {
  const mesh = s.getMesh();
  const n = mesh.numProp;
  const count = mesh.vertProperties.length / n;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = mesh.vertProperties[i * n]!;
    positions[i * 3 + 1] = mesh.vertProperties[i * n + 1]!;
    positions[i * 3 + 2] = mesh.vertProperties[i * n + 2]!;
  }
  // Regroupe les plages d'indices par emplacement de matériau.
  const bySlot = new Map<MaterialSlot, number[]>();
  const runs = mesh.runIndex.length - 1;
  for (let r = 0; r < runs; r++) {
    const slot = k.slotOf(mesh.runOriginalID[r]!);
    const list = bySlot.get(slot) ?? [];
    for (let i = mesh.runIndex[r]!; i < mesh.runIndex[r + 1]!; i++) list.push(mesh.triVerts[i]!);
    bySlot.set(slot, list);
  }
  const indices = new Uint32Array(mesh.triVerts.length);
  const groups: MeshGroup[] = [];
  let offset = 0;
  for (const slot of SLOT_ORDER) {
    const list = bySlot.get(slot);
    if (!list || list.length === 0) continue;
    indices.set(list, offset);
    groups.push({ start: offset, count: list.length, slot });
    offset += list.length;
  }
  const b = s.boundingBox();
  return {
    positions,
    indices,
    groups,
    bounds: { min: [b.min[0], b.min[1], b.min[2]], max: [b.max[0], b.max[1], b.max[2]] },
  };
}

/** Exécute une construction dans une portée et libère tout sauf le maillage résultant. */
export async function build<T>(fn: (k: Scope) => T): Promise<T> {
  const k = new Scope(await initKernel());
  try {
    return fn(k);
  } finally {
    k.dispose();
  }
}

// --- profils 2D -------------------------------------------------------------

/** Points d'un arc de cercle de centre c, rayon r, de a0 à a1 (radians), n segments. */
export function arcPoints(c: Vec2, r: number, a0: number, a1: number, n: number): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]);
  }
  return out;
}

export type ArchProfile = "round" | "pointed" | "segmental";

/**
 * Intrados d'un arc de portée `span`, naissances en (±span/2, 0), de gauche à droite.
 * - round : plein cintre ; flèche = span/2.
 * - pointed : arc brisé en tiers-point ; centres à ±span/2 de l'axe opposé, rayon = span.
 *   (Tiers-point classique : rayon = portée, flèche ≈ 0,866 × portée.)
 * - segmental : arc surbaissé, flèche = span/4.
 */
export function archCurve(span: number, profile: ArchProfile, n = 16): Vec2[] {
  const h = span / 2;
  if (profile === "round") return arcPoints([0, 0], h, Math.PI, 0, n);
  if (profile === "segmental") {
    const f = span / 4;
    const r = (h * h + f * f) / (2 * f);
    const cy = f - r;
    const a = Math.asin(h / r);
    return arcPoints([0, cy], r, Math.PI / 2 + a, Math.PI / 2 - a, n);
  }
  // brisé : deux arcs de rayon `span`, centres aux naissances opposées
  const r = span;
  const aTop = Math.acos(h / r); // angle au sommet depuis le centre opposé
  const left = arcPoints([h, 0], r, Math.PI, Math.PI - aTop, n / 2);
  const right = arcPoints([-h, 0], r, aTop, 0, n / 2);
  return [...left, ...right.slice(1)];
}

/** Flèche (hauteur sous clé) d'un arc. */
export function archRise(span: number, profile: ArchProfile): number {
  if (profile === "round") return span / 2;
  if (profile === "segmental") return span / 4;
  return Math.sqrt(span * span - (span / 2) * (span / 2));
}

/** Contour fermé d'une ouverture en arc (piédroits + arc), base en v = 0, hauteur totale `height`. */
export function archOpening(span: number, height: number, profile: ArchProfile, n = 16): Vec2[] {
  const rise = archRise(span, profile);
  const legs = Math.max(height - rise, 1);
  const curve = archCurve(span, profile, n).map(([u, v]) => [u, v + legs] as Vec2);
  return [[-span / 2, 0], [span / 2, 0], ...curve.reverse()];
}

export function signedArea(poly: Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, y1] = poly[i]!;
    const [x2, y2] = poly[(i + 1) % poly.length]!;
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** Oriente un contour dans le sens trigonométrique. */
export function ccw(poly: Vec2[]): Vec2[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}
