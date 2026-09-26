import type { ModuleDefinition } from "../module/module.js";
import { choice, count, flag, length, material } from "./helpers.js";

/**
 * Bibliothèque « châteaux et fortifications ».
 *
 * DONNÉES HISTORIQUES : fourchettes indicatives pour la France, à faire valider
 * par un castellologue avant publication. `sources` vide = non encore sourcé.
 */

const STONE = "stone.limestone.blond";

export const curtainWall: ModuleDefinition = {
  type: "castle.wall.curtain",
  version: "0.2.0",
  label: { plain: "Mur d'enceinte", technical: "courtine" },
  category: "fortification.wall",
  structuralRole: "bearing",
  generator: "gen.wall.straight",
  parameters: {
    length: length("Longueur", "discovery", 20000, 1000, 200000, { handle: "length" }),
    height: length("Hauteur", "discovery", 9000, 1000, 40000, { handle: "height", typical: [5000, 20000] }),
    thickness: length("Épaisseur", "creation", 2200, 400, 8000, { typical: [1500, 4000] }),
    batter: length("Élargissement à la base", "creation", 0, 0, 5000, { technical: "talus / fruit" }),
    crenellated: flag("Créneaux", "discovery", true, "crénelage"),
    openingType: choice("Ouvertures", "creation", ["none", "door", "window", "arrow_slit"], "none"),
    openingCount: count("Nombre d'ouvertures", "creation", 0, 0, 20),
    material: material("Pierre", "masonry", STONE),
  },
  connectors: [
    { name: "start", kind: "wall.end", role: "neutral", capacity: 1, sizeParam: "thickness" },
    { name: "end", kind: "wall.end", role: "neutral", capacity: 1, sizeParam: "thickness" },
    { name: "top", kind: "wall.top", role: "carries", capacity: 2, sizeParam: "thickness" },
    { name: "outer", kind: "wall.face", role: "carries", capacity: 8 },
    { name: "inner", kind: "wall.face", role: "carries", capacity: 8 },
    { name: "base", kind: "foundation", role: "is_carried", capacity: 1, sizeParam: "thickness" },
  ],
  slots: [],
  history: [{ attested: { from: 1000, to: 1500 }, sources: [] }],
  paramHistory: {},
  learnMore: {
    short: "Portion de muraille entre deux tours.",
    role: "Fermer l'enceinte et porter le chemin de ronde.",
    period: "Tout le Moyen Âge.",
  },
};

const towerHistoryRound = [
  {
    attested: { from: 1190, to: 1500 },
    rareBefore: { from: 1100, to: 1189 },
    equivalentIfAnachronic: "castle.tower.square",
    note: "Généralisation en domaine royal français sous Philippe Auguste ; exemples antérieurs isolés.",
    sources: [],
  },
];

export const roundTower: ModuleDefinition = {
  type: "castle.tower.round",
  version: "0.2.0",
  label: { plain: "Tour ronde" },
  category: "fortification.tower",
  structuralRole: "bearing",
  generator: "gen.tower.round",
  parameters: {
    height: length("Hauteur", "discovery", 18000, 3000, 60000, { handle: "height", typical: [8000, 35000] }),
    diameter: length("Diamètre", "discovery", 9000, 2000, 30000, { handle: "radius", typical: [5000, 16000] }),
    wallThickness: length("Épaisseur des murs", "creation", 2500, 500, 7000),
    floors: count("Nombre d'étages", "discovery", 3, 1, 8),
    roof: choice("Toit", "discovery", ["none", "conical", "terrace"], "conical"),
    crenellated: flag("Créneaux (sans toit)", "discovery", true, "crénelage"),
    arrowSlits: count("Archères", "creation", 4, 0, 16),
    openGorge: flag("Ouverte côté cour", "creation", false, "ouverte à la gorge"),
    material: material("Pierre", "masonry", STONE),
    roofMaterial: material("Couverture", "roof", "roofing.slate"),
  },
  connectors: [
    { name: "flank[0..3]", kind: "tower.flank", role: "neutral", capacity: 1, sizeParam: "wallThickness" },
    { name: "top", kind: "tower.top", role: "carries", capacity: 1 },
    { name: "floor[0..7]", kind: "floor.level", role: "carries", capacity: 1 },
    { name: "base", kind: "foundation", role: "is_carried", capacity: 1 },
  ],
  slots: [],
  history: towerHistoryRound,
  paramHistory: {
    openGorge: { true: [{ attested: { from: 1150, to: 1400 }, sources: [], note: "Tours ouvertes à la gorge : courantes aux XIIe–XIIIe s." }] },
  },
  learnMore: {
    short: "Tour de plan circulaire, souvent placée aux angles de l'enceinte.",
    role: "Battre le pied des murs voisins ; pas d'angle mort ni d'arête fragile face à la sape.",
    period: "Surtout à partir de la fin du XIIe siècle en France.",
  },
};

export const squareTower: ModuleDefinition = {
  type: "castle.tower.square",
  version: "0.2.0",
  label: { plain: "Tour carrée", technical: "tour quadrangulaire" },
  category: "fortification.tower",
  structuralRole: "bearing",
  generator: "gen.tower.square",
  parameters: {
    height: length("Hauteur", "discovery", 16000, 3000, 60000, { handle: "height", typical: [8000, 30000] }),
    width: length("Largeur", "discovery", 8000, 2000, 25000, { handle: "width", typical: [5000, 14000] }),
    wallThickness: length("Épaisseur des murs", "creation", 2200, 500, 6000),
    floors: count("Nombre d'étages", "discovery", 3, 1, 8),
    roof: choice("Toit", "discovery", ["none", "pyramid", "spire", "terrace"], "pyramid"),
    crenellated: flag("Créneaux (sans toit)", "discovery", true, "crénelage"),
    arrowSlits: count("Archères", "creation", 4, 0, 16),
    material: material("Pierre", "masonry", STONE),
    roofMaterial: material("Couverture", "roof", "roofing.slate"),
  },
  connectors: [
    { name: "flank[0..3]", kind: "tower.flank", role: "neutral", capacity: 1, sizeParam: "wallThickness" },
    { name: "top", kind: "tower.top", role: "carries", capacity: 1 },
    { name: "floor[0..7]", kind: "floor.level", role: "carries", capacity: 1 },
    { name: "base", kind: "foundation", role: "is_carried", capacity: 1 },
  ],
  slots: [],
  history: [{ attested: { from: 1000, to: 1500 }, sources: [], note: "Forme la plus ancienne ; reste courante dans le Midi et en Italie." }],
  paramHistory: {},
  learnMore: {
    short: "Tour de plan carré ou rectangulaire.",
    role: "Flanquer l'enceinte ; plus simple à bâtir, mais ses angles sont vulnérables à la sape.",
    period: "Dès le XIe siècle ; peu à peu concurrencée par la tour ronde après 1190 dans le domaine royal.",
  },
};

export const roundKeep: ModuleDefinition = {
  ...roundTower,
  type: "castle.keep.round",
  label: { plain: "Donjon rond", technical: "tour maîtresse circulaire" },
  category: "fortification.keep",
  parameters: {
    ...roundTower.parameters,
    height: length("Hauteur", "discovery", 30000, 8000, 60000, { handle: "height", typical: [15000, 40000] }),
    diameter: length("Diamètre", "discovery", 15000, 6000, 35000, { handle: "radius", typical: [10000, 20000] }),
    wallThickness: length("Épaisseur des murs", "creation", 4000, 1000, 8000),
    floors: count("Nombre d'étages", "discovery", 4, 1, 8),
    arrowSlits: count("Archères", "creation", 6, 0, 16),
  },
  history: [
    {
      attested: { from: 1190, to: 1400 },
      rareBefore: { from: 1120, to: 1189 },
      equivalentIfAnachronic: "castle.keep.square",
      note: "Type « philippien » : tour maîtresse ronde isolée par un fossé.",
      sources: [],
    },
  ],
  paramHistory: {},
  learnMore: {
    short: "Tour maîtresse de plan circulaire, dernier refuge du château.",
    role: "Résister isolément si l'enceinte tombe ; affirmer le pouvoir du seigneur.",
    period: "Fin XIIe – XIIIe siècle surtout.",
  },
};

export const squareKeep: ModuleDefinition = {
  ...squareTower,
  type: "castle.keep.square",
  label: { plain: "Donjon carré", technical: "tour maîtresse quadrangulaire" },
  category: "fortification.keep",
  parameters: {
    ...squareTower.parameters,
    height: length("Hauteur", "discovery", 25000, 8000, 50000, { handle: "height", typical: [15000, 35000] }),
    width: length("Largeur", "discovery", 14000, 6000, 30000, { handle: "width", typical: [10000, 22000] }),
    wallThickness: length("Épaisseur des murs", "creation", 3500, 1000, 7000),
    floors: count("Nombre d'étages", "discovery", 4, 1, 8),
  },
  history: [
    {
      attested: { from: 1000, to: 1250 },
      rareAfter: { from: 1251, to: 1450 },
      note: "Donjons romans quadrangulaires ; formes tardives plus rares (Vincennes, XIVe s.).",
      sources: [],
    },
  ],
  paramHistory: {},
  learnMore: {
    short: "Grande tour maîtresse de plan carré ou rectangulaire.",
    role: "Résidence seigneuriale fortifiée et réduit défensif.",
    period: "XIe–XIIe siècle surtout.",
  },
};

export const gate: ModuleDefinition = {
  type: "castle.entrance.gate",
  version: "0.1.0",
  label: { plain: "Porte fortifiée", technical: "châtelet d'entrée" },
  category: "fortification.entrance",
  structuralRole: "bearing",
  generator: "gen.gate",
  parameters: {
    width: length("Largeur", "discovery", 14000, 5000, 40000, { handle: "width" }),
    depth: length("Profondeur", "creation", 10000, 3000, 30000),
    height: length("Hauteur", "discovery", 14000, 4000, 35000, { handle: "height" }),
    passageWidth: length("Largeur du passage", "creation", 3500, 2000, 8000),
    passageHeight: length("Hauteur du passage", "creation", 5000, 2500, 12000),
    flankingTowers: flag("Tours de flanquement", "discovery", true),
    crenellated: flag("Créneaux", "discovery", true, "crénelage"),
    material: material("Pierre", "masonry", STONE),
  },
  connectors: [
    { name: "flank[0]", kind: "tower.flank", role: "neutral", capacity: 1 },
    { name: "flank[2]", kind: "tower.flank", role: "neutral", capacity: 1 },
    { name: "top", kind: "tower.top", role: "carries", capacity: 1 },
    { name: "base", kind: "foundation", role: "is_carried", capacity: 1 },
  ],
  slots: [],
  history: [{ attested: { from: 1000, to: 1500 }, sources: [] }],
  paramHistory: {
    flankingTowers: {
      true: [{ attested: { from: 1200, to: 1500 }, rareBefore: { from: 1150, to: 1199 }, sources: [], note: "Porte encadrée de deux tours : diffusion au XIIIe s." }],
    },
  },
  learnMore: {
    short: "Entrée du château, renforcée par un passage voûté et souvent deux tours.",
    role: "Contrôler l'accès : herse, vantaux, assommoirs dans la voûte du passage.",
    period: "Formes simples dès le XIe siècle ; châtelets à deux tours au XIIIe.",
  },
};

export const hall: ModuleDefinition = {
  type: "castle.residential.hall",
  version: "0.1.0",
  label: { plain: "Logis", technical: "logis seigneurial / grande salle" },
  category: "residential",
  structuralRole: "bearing",
  generator: "gen.building.hall",
  parameters: {
    length: length("Longueur", "discovery", 20000, 5000, 60000, { handle: "length" }),
    width: length("Largeur", "discovery", 9000, 4000, 20000, { handle: "width" }),
    height: length("Hauteur des murs", "discovery", 8000, 3000, 20000, { handle: "height" }),
    wallThickness: length("Épaisseur des murs", "creation", 1200, 500, 3000),
    windows: count("Fenêtres", "discovery", 4, 0, 12),
    roof: choice("Toit", "creation", ["gable", "none"], "gable"),
    material: material("Pierre", "masonry", STONE),
    roofMaterial: material("Couverture", "roof", "roofing.tile.flat"),
  },
  connectors: [
    { name: "start", kind: "wall.end", role: "neutral", capacity: 1 },
    { name: "end", kind: "wall.end", role: "neutral", capacity: 1 },
    { name: "base", kind: "foundation", role: "is_carried", capacity: 1 },
  ],
  slots: [],
  history: [{ attested: { from: 1000, to: 1500 }, sources: [] }],
  paramHistory: {},
  learnMore: {
    short: "Bâtiment d'habitation du seigneur, souvent adossé à la courtine.",
    role: "Loger, recevoir, rendre la justice (grande salle).",
    period: "Tout le Moyen Âge ; fenêtres de plus en plus larges après 1300.",
  },
};

export const machicolation: ModuleDefinition = {
  type: "castle.defense.machicolation",
  version: "0.2.0",
  label: { plain: "Balcon de pierre percé", technical: "mâchicoulis sur consoles" },
  category: "fortification.defense",
  structuralRole: "carried",
  generator: "gen.defense.machicolation",
  parameters: {
    length: length("Longueur", "discovery", 12000, 2000, 100000, { handle: "length" }),
    corbelCourses: count("Rangs de consoles", "creation", 3, 1, 5, "corbeaux"),
    projection: length("Avancée", "creation", 600, 250, 1200),
    material: material("Pierre", "masonry", STONE),
  },
  connectors: [{ name: "seat", kind: "wall.top", role: "is_carried", capacity: 1 }],
  slots: [],
  history: [
    {
      attested: { from: 1300, to: 1500 },
      rareBefore: { from: 1180, to: 1299 },
      equivalentIfAnachronic: "castle.defense.hoarding",
      note: "Remplace progressivement le hourd de bois ; généralisé aux XIVe–XVe siècles.",
      sources: [],
    },
  ],
  paramHistory: {},
  learnMore: {
    short: "Parapet en saillie sur des consoles de pierre, percé entre elles.",
    role: "Frapper le pied de la muraille sans se découvrir.",
    period: "Surtout XIVe–XVe siècle.",
  },
};

export const hoarding: ModuleDefinition = {
  type: "castle.defense.hoarding",
  version: "0.2.0",
  label: { plain: "Galerie de bois en surplomb", technical: "hourd" },
  category: "fortification.defense",
  structuralRole: "carried",
  generator: "gen.defense.hoarding",
  parameters: {
    length: length("Longueur", "discovery", 12000, 2000, 100000, { handle: "length" }),
    projection: length("Avancée", "creation", 1500, 800, 2500),
    timberMaterial: material("Bois", "timber", "wood.oak.hewn"),
    roofMaterial: material("Couverture", "roof", "wood.oak.hewn"),
  },
  connectors: [{ name: "seat", kind: "wall.top", role: "is_carried", capacity: 1 }],
  slots: [],
  history: [{ attested: { from: 1100, to: 1350 }, rareAfter: { from: 1351, to: 1450 }, sources: [] }],
  paramHistory: {},
  learnMore: {
    short: "Galerie de bois montée en temps de guerre au sommet des murs.",
    role: "Même usage que le mâchicoulis, mais vulnérable au feu.",
    period: "XIIe–XIIIe siècle surtout.",
  },
};

export const CASTLE_LIBRARY: ModuleDefinition[] = [
  curtainWall,
  roundTower,
  squareTower,
  roundKeep,
  squareKeep,
  gate,
  hall,
  machicolation,
  hoarding,
];
