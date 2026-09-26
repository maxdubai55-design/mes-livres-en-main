import type { Material } from "../material/material.js";

/**
 * Catalogue de matériaux. Valeurs mécaniques : ordres de grandeur de la littérature ;
 * la traction de la MAÇONNERIE est prise à zéro par prudence (analyse limite des voûtes).
 * L'apparence est procédurale (couleur + appareillage) : le studio en tire des textures
 * sans fichier image, ce qui garde l'application légère.
 */
const stone = (
  id: string,
  plain: string,
  rgb: [number, number, number],
  pattern: "ashlar" | "coursed_rubble" | "random_rubble",
  density: number,
  fc: number,
): Material => ({
  id,
  label: { plain },
  family: "stone",
  appearance: {
    baseColor: rgb,
    roughness: 0.9,
    metallic: 0,
    tileSizeMm: 2400,
    bond: { pattern, courseHeightMm: pattern === "ashlar" ? 320 : 220, jointWidthMm: pattern === "ashlar" ? 10 : 25, mortar: "mortar.lime.aged" },
  },
  mechanics: { density, youngModulus: 20000, poisson: 0.2, compressiveStrength: fc, tensileStrength: 0, shearStrength: 1, basis: "literature_range" },
  usage: [],
  states: {},
});

export const MATERIALS: Material[] = [
  stone("stone.limestone.blond", "Calcaire blond", [0.8, 0.72, 0.56], "ashlar", 2300, 30),
  stone("stone.limestone.white", "Calcaire blanc", [0.86, 0.84, 0.78], "ashlar", 2250, 25),
  stone("stone.sandstone.red", "Grès rouge", [0.62, 0.36, 0.28], "ashlar", 2350, 40),
  stone("stone.granite.grey", "Granite gris", [0.55, 0.55, 0.54], "coursed_rubble", 2650, 120),
  stone("stone.schist.dark", "Schiste", [0.36, 0.35, 0.33], "random_rubble", 2700, 50),
  stone("stone.rubble.limestone", "Moellon calcaire", [0.72, 0.66, 0.55], "random_rubble", 2100, 8),
  {
    id: "mortar.lime.aged",
    label: { plain: "Mortier de chaux ancien" },
    family: "mortar",
    appearance: { baseColor: [0.78, 0.75, 0.68], roughness: 1, metallic: 0, tileSizeMm: 1000 },
    mechanics: { density: 1800, youngModulus: 1500, poisson: 0.2, compressiveStrength: 2, tensileStrength: 0, shearStrength: 0.2, basis: "literature_range" },
    usage: [],
    states: {},
  },
  {
    id: "roofing.slate",
    label: { plain: "Ardoise" },
    family: "roofing",
    appearance: { baseColor: [0.25, 0.27, 0.31], roughness: 0.6, metallic: 0, tileSizeMm: 1200 },
    usage: [{ note: "Nord et ouest de la France surtout." }],
    states: {},
  },
  {
    id: "roofing.tile.flat",
    label: { plain: "Tuile plate" },
    family: "roofing",
    appearance: { baseColor: [0.55, 0.28, 0.2], roughness: 0.8, metallic: 0, tileSizeMm: 1200 },
    usage: [],
    states: {},
  },
  {
    id: "roofing.tile.canal",
    label: { plain: "Tuile canal" },
    family: "roofing",
    appearance: { baseColor: [0.68, 0.38, 0.25], roughness: 0.8, metallic: 0, tileSizeMm: 1200 },
    usage: [{ note: "Midi de la France." }],
    states: {},
  },
  {
    id: "roofing.lauze",
    label: { plain: "Lauze" },
    family: "roofing",
    appearance: { baseColor: [0.45, 0.43, 0.4], roughness: 0.9, metallic: 0, tileSizeMm: 1500 },
    usage: [],
    states: {},
  },
  {
    id: "wood.oak.hewn",
    label: { plain: "Chêne équarri" },
    family: "wood",
    appearance: { baseColor: [0.42, 0.3, 0.19], roughness: 0.85, metallic: 0, tileSizeMm: 1500 },
    mechanics: { density: 700, youngModulus: 11000, poisson: 0.35, compressiveStrength: 40, tensileStrength: 60, shearStrength: 7, basis: "literature_range" },
    usage: [],
    states: {},
  },
];

export const limestoneBlond = MATERIALS[0]!;
