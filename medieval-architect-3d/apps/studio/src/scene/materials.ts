import * as THREE from "three/webgpu";
import { float, mix, texture, triplanarTextures, uniform, vec3 } from "three/tsl";
import { MATERIALS, type Material } from "@ma3d/core";

/**
 * Matériaux de la scène. Les textures sont PROCÉDURALES (dessinées sur un canvas à partir
 * de la couleur et de l'appareillage du catalogue) et projetées en triplanaire : aucun fichier
 * image à télécharger, et aucune coordonnée de texture à générer sur les maillages.
 * L'échelle réelle est respectée : un motif = `tileSizeMm` du catalogue.
 */

/** Couleur (hexadécimal sRGB) → vecteur TSL dans l'espace de travail linéaire. */
const rgb = (hex: number) => {
  const c = new THREE.Color(hex);
  return vec3(c.r, c.g, c.b);
};

export type DisplayMode = "realistic" | "neutral" | "wireframe" | "transparent" | "structure" | "analysis";
export type Tint = "none" | "selected" | "ghost" | "removed" | "ok" | "notice" | "warning" | "critical";

const BY_ID = new Map(MATERIALS.map((m) => [m.id, m]));

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const css = (rgb: [number, number, number], k = 1) =>
  `rgb(${Math.round(Math.min(1, rgb[0] * k) * 255)},${Math.round(Math.min(1, rgb[1] * k) * 255)},${Math.round(Math.min(1, rgb[2] * k) * 255)})`;

/** Dessine le motif d'un matériau. `vertical` = assises verticales (faces orientées selon X). */
function paint(m: Material, vertical: boolean): HTMLCanvasElement {
  const S = 512;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d")!;
  const base = m.appearance.baseColor ?? [0.7, 0.7, 0.7];
  const r = rng(m.id.length * 7919 + (vertical ? 1 : 0));
  const tile = m.appearance.tileSizeMm;
  if (vertical) {
    g.translate(S, 0);
    g.rotate(Math.PI / 2);
  }
  const bond = m.appearance.bond;
  if (m.family === "stone" && bond) {
    const mortar = BY_ID.get(bond.mortar)?.appearance.baseColor ?? [0.78, 0.75, 0.68];
    g.fillStyle = css(mortar);
    g.fillRect(0, 0, S, S);
    const course = (bond.courseHeightMm / tile) * S;
    const joint = Math.max(1, (bond.jointWidthMm / tile) * S);
    for (let y = 0, row = 0; y < S - 0.5; y += course, row++) {
      const h = Math.min(course, S - y);
      if (bond.pattern === "random_rubble") {
        // moellons : longueurs et hauteurs irrégulières
        let x = -r() * course;
        while (x < S) {
          const w = course * (0.8 + r() * 1.6);
          const dy = (r() - 0.5) * joint * 2;
          g.fillStyle = css(base, 0.78 + r() * 0.34);
          g.beginPath();
          g.roundRect(x + joint / 2, y + joint / 2 + dy, w - joint, h - joint, Math.min(8, h / 3));
          g.fill();
          x += w;
        }
      } else {
        const blockW = course * (bond.pattern === "ashlar" ? 2.2 : 1.6);
        let x = row % 2 ? -blockW / 2 : 0;
        while (x < S) {
          const w = bond.pattern === "ashlar" ? blockW : blockW * (0.7 + r() * 0.6);
          g.fillStyle = css(base, 0.86 + r() * 0.22);
          g.fillRect(x + joint / 2, y + joint / 2, w - joint, h - joint);
          x += w;
        }
      }
    }
  } else if (m.family === "roofing") {
    g.fillStyle = css(base, 0.7);
    g.fillRect(0, 0, S, S);
    const rows = 16;
    const rh = S / rows;
    for (let y = 0, row = 0; y < S; y += rh, row++) {
      const w = m.id.includes("canal") ? rh * 1.3 : rh * 1.1;
      let x = row % 2 ? -w / 2 : 0;
      while (x < S) {
        g.fillStyle = css(base, 0.85 + r() * 0.25);
        if (m.id.includes("canal")) {
          const grad = g.createLinearGradient(x, 0, x + w, 0);
          grad.addColorStop(0, css(base, 0.7));
          grad.addColorStop(0.5, css(base, 1.1));
          grad.addColorStop(1, css(base, 0.7));
          g.fillStyle = grad;
        }
        g.fillRect(x + 1, y + 1, w - 2, rh - 2);
        x += w;
      }
    }
  } else if (m.family === "wood") {
    g.fillStyle = css(base);
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 90; i++) {
      g.strokeStyle = css(base, 0.75 + r() * 0.4);
      g.lineWidth = 1 + r() * 3;
      const y = r() * S;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(S / 3, y + (r() - 0.5) * 20, (2 * S) / 3, y + (r() - 0.5) * 20, S, y);
      g.stroke();
    }
    // joints de planches
    g.fillStyle = css(base, 0.5);
    for (let y = 0; y < S; y += S / 4) g.fillRect(0, y, S, 2);
  } else {
    g.fillStyle = css(base);
    g.fillRect(0, 0, S, S);
    for (let i = 0; i < 3000; i++) {
      g.fillStyle = css(base, 0.9 + r() * 0.2);
      g.fillRect(r() * S, r() * S, 2, 2);
    }
  }
  return c;
}

const TINTS: Record<Exclude<Tint, "none">, number> = {
  selected: 0xe29a62,
  ghost: 0x4a90d9,
  removed: 0xd9534f,
  ok: 0x2f7d4a,
  notice: 0xd4a017,
  warning: 0xe07b24,
  critical: 0xc62828,
};

export class MaterialLibrary {
  private textures = new Map<string, [THREE.Texture, THREE.Texture]>();
  private cache = new Map<string, THREE.Material>();
  /** Opacité du mode transparent, partagée par tous les matériaux (uniform TSL). */
  readonly opacity = uniform(0.35);
  opacityValue = 0.35;

  private tex(m: Material): [THREE.Texture, THREE.Texture] {
    let t = this.textures.get(m.id);
    if (!t) {
      const mk = (vertical: boolean) => {
        const x = new THREE.CanvasTexture(paint(m, vertical));
        x.wrapS = x.wrapT = THREE.RepeatWrapping;
        x.colorSpace = THREE.SRGBColorSpace;
        x.anisotropy = 4;
        return x;
      };
      t = [mk(false), mk(true)];
      this.textures.set(m.id, t);
    }
    return t;
  }

  get(materialId: string, mode: DisplayMode, tint: Tint = "none"): THREE.Material {
    const key = `${materialId}|${mode}|${tint}`;
    let mat = this.cache.get(key);
    if (mat) return mat;
    const m = BY_ID.get(materialId) ?? BY_ID.get("stone.limestone.blond")!;
    const base = new THREE.Color(...(m.appearance.baseColor ?? [0.7, 0.7, 0.7]));
    const nm = new THREE.MeshStandardNodeMaterial();
    const rough = typeof m.appearance.roughness === "number" ? m.appearance.roughness : 0.9;
    nm.roughness = rough;
    nm.metalness = 0;
    let col;
    if (mode === "realistic" || mode === "transparent") {
      const [horiz, vert] = this.tex(m);
      const scale = float(1000 / m.appearance.tileSizeMm);
      // X : assises verticales dans l'image, Y (dessus) et Z : horizontales
      col = vec3(triplanarTextures(texture(vert), texture(horiz), texture(horiz), scale).rgb);
    } else if (mode === "wireframe") {
      col = rgb(0x3a3530);
      nm.wireframe = true;
    } else {
      col = rgb(mode === "neutral" || mode === "analysis" ? 0xd8d2c6 : base.getHex());
    }
    if (tint !== "none") {
      const c = rgb(TINTS[tint]);
      const k = tint === "selected" ? 0.35 : tint === "ghost" || tint === "removed" ? 0.55 : 0.7;
      col = mix(col, c, float(k));
      if (tint === "selected") nm.emissiveNode = c.mul(0.15);
    }
    nm.colorNode = col;
    if (mode === "transparent" || tint === "ghost" || tint === "removed") {
      nm.transparent = true;
      nm.depthWrite = false;
      nm.opacityNode = tint === "ghost" || tint === "removed" ? float(0.45) : this.opacity;
    }
    nm.side = THREE.FrontSide;
    this.cache.set(key, nm);
    return nm;
  }

  setOpacity(v: number): void {
    this.opacity.value = v;
    this.opacityValue = v;
  }

  /** Matériau simple (MeshStandardMaterial) pour les exports GLB : couleur moyenne + rugosité. */
  exportMaterial(materialId: string): THREE.MeshStandardMaterial {
    const m = BY_ID.get(materialId) ?? BY_ID.get("stone.limestone.blond")!;
    const mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(...(m.appearance.baseColor ?? [0.7, 0.7, 0.7])),
      roughness: typeof m.appearance.roughness === "number" ? m.appearance.roughness : 0.9,
      metalness: 0,
    });
    mat.name = m.label.plain;
    return mat;
  }
}
