import type { HistoricalUsage, ModuleDefinition } from "../module/module.js";
import { choice, count, flag, length, material } from "./helpers.js";

/**
 * Bibliothèque « églises et cathédrales ».
 * Mêmes réserves que pour les châteaux : fourchettes indicatives, non sourcées.
 */

const STONE = "stone.limestone.white";

/** Arc brisé : diffusion en France à partir des années 1130–1140 (Saint-Denis). */
const POINTED: HistoricalUsage[] = [
  { attested: { from: 1140, to: 1500 }, rareBefore: { from: 1080, to: 1139 }, sources: [], note: "Connu plus tôt en Bourgogne (Cluny III) ; généralisé avec le gothique." },
];
const RIBBED: HistoricalUsage[] = [
  { attested: { from: 1130, to: 1500 }, rareBefore: { from: 1090, to: 1129 }, sources: [], note: "Premières croisées d'ogives vers 1100 (Durham, Normandie)." },
];
const FLYER: HistoricalUsage[] = [
  { attested: { from: 1180, to: 1500 }, rareBefore: { from: 1150, to: 1179 }, sources: [], note: "Arcs-boutants apparents : Notre-Dame de Paris, vers 1180." },
];

export const nave: ModuleDefinition = {
  type: "church.nave",
  version: "0.1.0",
  label: { plain: "Nef", technical: "vaisseau et bas-côtés" },
  category: "religious.plan",
  structuralRole: "bearing",
  generator: "gen.church.nave",
  parameters: {
    length: length("Longueur", "discovery", 40000, 8000, 150000, { handle: "length" }),
    width: length("Largeur du vaisseau central", "discovery", 10000, 4000, 20000, { handle: "width", typical: [6000, 16000] }),
    height: length("Hauteur des murs", "discovery", 20000, 6000, 50000, { handle: "height", typical: [10000, 35000] }),
    wallThickness: length("Épaisseur des murs", "creation", 1500, 600, 4000),
    bays: count("Nombre de travées", "discovery", 6, 1, 20),
    aisles: flag("Bas-côtés", "discovery", true, "collatéraux"),
    aisleWidth: length("Largeur des bas-côtés", "creation", 6000, 2500, 12000),
    aisleHeight: length("Hauteur des bas-côtés", "creation", 10000, 4000, 25000),
    archProfile: choice("Forme des arcs", "discovery", ["round", "pointed"], "round"),
    facade: flag("Façade avec portail et rose", "creation", true),
    eastOpen: flag("Ouverte vers le chœur", "creation", true),
    material: material("Pierre", "masonry", STONE),
    roofMaterial: material("Couverture", "roof", "roofing.slate"),
  },
  connectors: [
    { name: "west", kind: "wall.end", role: "neutral", capacity: 1 },
    { name: "east", kind: "wall.end", role: "neutral", capacity: 1 },
    { name: "base", kind: "foundation", role: "is_carried", capacity: 1 },
    { name: "bay[0..20].north", kind: "wall.face", role: "carries", capacity: 1 },
    { name: "bay[0..20].south", kind: "wall.face", role: "carries", capacity: 1 },
  ],
  slots: [],
  history: [{ attested: { from: 1000, to: 1500 }, sources: [] }],
  paramHistory: { archProfile: { pointed: POINTED } },
  learnMore: {
    short: "Partie de l'église où se tiennent les fidèles, entre la façade et le transept.",
    role: "Accueillir l'assemblée ; ses murs hauts portent la charpente ou les voûtes.",
    period: "Tout le Moyen Âge.",
  },
};

export const transept: ModuleDefinition = {
  ...nave,
  type: "church.transept",
  label: { plain: "Transept", technical: "bras de transept" },
  parameters: {
    ...nave.parameters,
    length: length("Longueur", "discovery", 30000, 8000, 80000, { handle: "length" }),
    bays: count("Nombre de travées", "discovery", 3, 1, 10),
    aisles: flag("Bas-côtés", "discovery", false, "collatéraux"),
    eastOpen: flag("Extrémité ouverte", "creation", false),
  },
  learnMore: {
    short: "Vaisseau transversal qui croise la nef et dessine le plan en croix.",
    role: "Élargir l'espace devant le chœur ; ses bras contrebutent la croisée.",
    period: "Tout le Moyen Âge dans les grandes églises.",
  },
};

export const apse: ModuleDefinition = {
  type: "church.apse",
  version: "0.1.0",
  label: { plain: "Abside", technical: "chevet semi-circulaire" },
  category: "religious.plan",
  structuralRole: "bearing",
  generator: "gen.church.apse",
  parameters: {
    diameter: length("Diamètre", "discovery", 13000, 4000, 30000, { handle: "radius" }),
    height: length("Hauteur", "discovery", 18000, 4000, 45000, { handle: "height" }),
    wallThickness: length("Épaisseur des murs", "creation", 1400, 600, 4000),
    windows: count("Fenêtres", "discovery", 5, 0, 9),
    roof: flag("Toiture", "creation", true),
    material: material("Pierre", "masonry", STONE),
    roofMaterial: material("Couverture", "roof", "roofing.slate"),
  },
  connectors: [
    { name: "west", kind: "wall.end", role: "neutral", capacity: 1 },
    { name: "base", kind: "foundation", role: "is_carried", capacity: 1 },
  ],
  slots: [],
  history: [{ attested: { from: 1000, to: 1500 }, sources: [] }],
  paramHistory: {},
  learnMore: {
    short: "Extrémité arrondie du chœur, à l'est.",
    role: "Abriter l'autel principal.",
    period: "Tout le Moyen Âge.",
  },
};

export const radiatingChapel: ModuleDefinition = {
  ...apse,
  type: "church.chapel.radiating",
  label: { plain: "Chapelle rayonnante", technical: "absidiole" },
  parameters: {
    ...apse.parameters,
    diameter: length("Diamètre", "discovery", 6000, 2500, 12000, { handle: "radius" }),
    height: length("Hauteur", "discovery", 9000, 3000, 20000, { handle: "height" }),
    wallThickness: length("Épaisseur des murs", "creation", 900, 400, 2500),
    windows: count("Fenêtres", "discovery", 3, 0, 5),
  },
  history: [{ attested: { from: 1050, to: 1500 }, sources: [], note: "Chevets à chapelles rayonnantes : pèlerinage, puis gothique." }],
  learnMore: {
    short: "Petite abside ouverte sur le déambulatoire.",
    role: "Multiplier les autels et les lieux de dévotion.",
    period: "Dès le XIe siècle sur les églises de pèlerinage.",
  },
};

export const column: ModuleDefinition = {
  type: "church.support.column",
  version: "0.1.0",
  label: { plain: "Colonne", technical: "pile / colonne" },
  category: "religious.support",
  structuralRole: "bearing",
  generator: "gen.church.column",
  parameters: {
    height: length("Hauteur", "discovery", 8000, 1500, 30000, { handle: "height" }),
    diameter: length("Diamètre", "discovery", 1200, 300, 4000, { handle: "radius" }),
    style: choice("Chapiteau", "discovery", ["romanesque", "gothic"], "romanesque"),
    base: flag("Base", "creation", true),
    capital: flag("Chapiteau", "creation", true),
    material: material("Pierre", "masonry", STONE),
  },
  connectors: [
    { name: "top", kind: "support.top", role: "carries", capacity: 4 },
    { name: "base", kind: "support.base", role: "is_carried", capacity: 1 },
  ],
  slots: [],
  history: [{ attested: { from: 1000, to: 1500 }, sources: [] }],
  paramHistory: {
    style: { gothic: [{ attested: { from: 1140, to: 1500 }, rareBefore: { from: 1120, to: 1139 }, sources: [] }] },
  },
  learnMore: {
    short: "Support vertical isolé.",
    role: "Porter arcs et voûtes, et transmettre leur poids aux fondations.",
    period: "Tout le Moyen Âge.",
  },
};

export const archDef: ModuleDefinition = {
  type: "church.arch",
  version: "0.1.0",
  label: { plain: "Arc", technical: "arc / arcade" },
  category: "religious.arch",
  structuralRole: "thrusting",
  generator: "gen.church.arch",
  parameters: {
    span: length("Portée", "discovery", 6000, 1000, 25000, { handle: "width" }),
    band: length("Hauteur de l'arc", "creation", 700, 200, 2500, { technical: "rouleau" }),
    depth: length("Épaisseur", "creation", 1000, 300, 4000),
    profile: choice("Forme", "discovery", ["round", "pointed", "segmental"], "round"),
    material: material("Pierre", "masonry", STONE),
  },
  connectors: [
    { name: "springer[0..1]", kind: "arch.springer", role: "is_carried", capacity: 1 },
    { name: "top", kind: "wall.top", role: "carries", capacity: 1 },
  ],
  slots: [],
  history: [{ attested: { from: 1000, to: 1500 }, sources: [] }],
  paramHistory: { profile: { pointed: POINTED } },
  learnMore: {
    short: "Élément courbe qui franchit une ouverture en reportant les charges sur ses appuis.",
    role: "Porter en transformant le poids en poussées obliques.",
    period: "Plein cintre roman, arc brisé gothique.",
  },
};

export const vaultDef: ModuleDefinition = {
  type: "church.vault",
  version: "0.1.0",
  label: { plain: "Voûte", technical: "voûte de travée" },
  category: "religious.vault",
  structuralRole: "thrusting",
  generator: "gen.church.vault",
  parameters: {
    spanX: length("Longueur de la travée", "discovery", 6500, 2000, 20000, { handle: "length" }),
    spanY: length("Largeur (portée)", "discovery", 10000, 2000, 20000, { handle: "width", typical: [4000, 16000] }),
    thickness: length("Épaisseur", "creation", 400, 150, 1500),
    kind: choice("Type", "discovery", ["barrel", "groin", "ribbed"], "barrel"),
    profile: choice("Forme", "discovery", ["round", "pointed"], "round"),
    material: material("Pierre", "masonry", STONE),
  },
  connectors: [
    { name: "springer[0..3]", kind: "arch.springer", role: "is_carried", capacity: 1 },
    { name: "keystone", kind: "vault.keystone", role: "neutral", capacity: 1 },
  ],
  slots: [],
  history: [{ attested: { from: 1000, to: 1500 }, sources: [] }],
  paramHistory: { kind: { ribbed: RIBBED }, profile: { pointed: POINTED } },
  learnMore: {
    short: "Couvrement en pierre d'une travée.",
    role: "Protéger du feu et porter ; mais elle pousse ses murs vers l'extérieur.",
    period: "Berceau et arêtes romans ; croisée d'ogives à partir du XIIe siècle.",
  },
};

export const buttressDef: ModuleDefinition = {
  type: "church.buttress",
  version: "0.1.0",
  label: { plain: "Contrefort", technical: "contrefort / culée d'arc-boutant" },
  category: "religious.buttressing",
  structuralRole: "bracing",
  generator: "gen.church.buttress",
  parameters: {
    height: length("Hauteur", "discovery", 12000, 2000, 40000, { handle: "height" }),
    width: length("Largeur", "creation", 1500, 500, 4000),
    depth: length("Saillie", "discovery", 3000, 500, 8000, { handle: "length" }),
    steps: count("Ressauts", "creation", 2, 1, 4),
    flyer: flag("Arc-boutant", "discovery", false),
    flyerSpan: length("Portée de l'arc-boutant", "creation", 7000, 2000, 20000),
    flyerHeight: length("Hauteur de la tête d'arc-boutant", "creation", 20000, 5000, 50000),
    material: material("Pierre", "masonry", STONE),
  },
  connectors: [
    { name: "head", kind: "buttress.head", role: "carries", capacity: 1 },
    { name: "base", kind: "foundation", role: "is_carried", capacity: 1 },
    { name: "flyer", kind: "flying.head", role: "is_carried", capacity: 1 },
  ],
  slots: [],
  history: [{ attested: { from: 1000, to: 1500 }, sources: [] }],
  paramHistory: { flyer: { true: FLYER } },
  learnMore: {
    short: "Massif de maçonnerie plaqué contre un mur ; l'arc-boutant le relie au mur haut.",
    role: "Contrebuter : reprendre la poussée des voûtes et la descendre au sol.",
    period: "Contreforts dès l'époque romane ; arcs-boutants à partir des années 1180.",
  },
};

export const facadeTower: ModuleDefinition = {
  type: "church.tower.facade",
  version: "0.1.0",
  label: { plain: "Tour de façade", technical: "tour-clocher" },
  category: "religious.tower",
  structuralRole: "bearing",
  generator: "gen.tower.square",
  parameters: {
    height: length("Hauteur", "discovery", 45000, 10000, 90000, { handle: "height" }),
    width: length("Largeur", "discovery", 10000, 4000, 20000, { handle: "width" }),
    wallThickness: length("Épaisseur des murs", "creation", 2500, 800, 5000),
    floors: count("Niveaux", "creation", 4, 1, 8),
    roof: choice("Couronnement", "discovery", ["terrace", "pyramid", "spire"], "spire"),
    crenellated: flag("Balustrade", "creation", false),
    arrowSlits: count("Baies", "creation", 4, 0, 16),
    material: material("Pierre", "masonry", STONE),
    roofMaterial: material("Couverture", "roof", "roofing.slate"),
  },
  connectors: [
    { name: "flank[0..3]", kind: "tower.flank", role: "neutral", capacity: 1 },
    { name: "top", kind: "tower.top", role: "carries", capacity: 1 },
    { name: "floor[0..7]", kind: "floor.level", role: "carries", capacity: 1 },
    { name: "base", kind: "foundation", role: "is_carried", capacity: 1 },
  ],
  slots: [],
  history: [{ attested: { from: 1000, to: 1500 }, sources: [] }],
  paramHistory: {},
  learnMore: {
    short: "Tour encadrant la façade occidentale.",
    role: "Porter les cloches, signaler l'édifice de loin.",
    period: "Façades harmoniques à deux tours : à partir du XIe siècle (Normandie).",
  },
};

export const CHURCH_LIBRARY: ModuleDefinition[] = [nave, transept, apse, radiatingChapel, column, archDef, vaultDef, buttressDef, facadeTower];
