import {
  LIBRARY_BY_TYPE,
  type BuildingSpecification,
  type Certainty,
  type Connection,
  type ModuleInstance,
  type ModuleIntent,
  type ParameterValue,
  type Transform,
} from "@ma3d/core";

/**
 * Planificateur : BuildingSpecification → modules placés et raccordés.
 *
 * Déterministe : même spec + même graine → même résultat. La graine ne fait varier
 * que les proportions (±10 %), jamais la composition : les variantes restent fidèles à la demande.
 *
 * Repère : X vers l'est, Y vers le nord, Z vers le haut, millimètres. Les châteaux ouvrent
 * leur porte au sud ; les églises sont orientées, façade à l'ouest (x = 0), chevet à l'est.
 */

export type Plan = {
  modules: ModuleInstance[];
  connections: Connection[];
  notes: string[];
};

type Ctx = {
  spec: BuildingSpecification;
  rand: () => number;
  nextId: () => string;
  modules: ModuleInstance[];
  connections: Connection[];
  notes: string[];
};

/** PRNG mulberry32 : petit, rapide, reproductible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function yaw(deg: number): Transform["rotation"] {
  const a = (deg * Math.PI) / 360;
  return [0, 0, Math.sin(a), Math.cos(a)];
}

const AI_CERTAINTY: Certainty = { level: "free_restitution", provenance: "generator", sources: [], note: "Généré automatiquement à partir d'une demande." };

function add(ctx: Ctx, type: string, at: [number, number, number], yawDeg: number, params: Record<string, ParameterValue>, name?: string): ModuleInstance {
  const def = LIBRARY_BY_TYPE.get(type);
  if (!def) throw new Error(`type inconnu : ${type}`);
  const m: ModuleInstance = {
    id: ctx.nextId(),
    type,
    definitionVersion: def.version,
    ...(name ? { name } : {}),
    transform: { position: at.map(Math.round) as [number, number, number], rotation: yaw(yawDeg) },
    params,
    certainty: AI_CERTAINTY,
    paramCertainty: {},
    state: { lockedByUser: false, hidden: false, aiLocked: false },
    tags: ["généré"],
  };
  ctx.modules.push(m);
  return m;
}

function link(ctx: Ctx, a: ModuleInstance, ca: string, b: ModuleInstance, cb: string): void {
  ctx.connections.push({
    id: `cnx_${ctx.nextId().slice(4)}`,
    a: { module: a.id, connector: ca },
    b: { module: b.id, connector: cb },
    acknowledged: false,
  });
}

const intent = (spec: BuildingSpecification, prefix: string): ModuleIntent | undefined => spec.modules.find((m) => m.ref.startsWith(prefix));
const vary = (ctx: Ctx, v: number, amp = 0.1) => Math.round(v * (1 + (ctx.rand() * 2 - 1) * amp));

export function plan(spec: BuildingSpecification, opts: { seed?: number; idPrefix?: string } = {}): Plan {
  let n = 0;
  const prefix = opts.idPrefix ?? "gen";
  const ctx: Ctx = {
    spec,
    rand: mulberry32(opts.seed ?? spec.generation.seed ?? 1),
    nextId: () => `mod_${prefix}${String(++n).padStart(4, "0")}`,
    modules: [],
    connections: [],
    notes: [],
  };
  const church = ["cathedral", "church", "abbey", "chapel"].includes(spec.building.type);
  if (church) planChurch(ctx);
  else planCastle(ctx);
  return { modules: ctx.modules, connections: ctx.connections, notes: ctx.notes };
}

// --- Châteaux ---------------------------------------------------------------

type TowerSpec = { type: string; size: number; height: number; square: boolean };

function isSouthern(spec: BuildingSpecification): boolean {
  const r = spec.building.region ?? "";
  return r.startsWith("fr.occitania") || r === "fr.provence" || r === "es.catalonia" || r === "it.italy";
}

/** Demi-épaisseur d'une tour le long de l'axe d'une courtine (rayon ou demi-côté). */
const halfSize = (t: TowerSpec) => t.size / 2;

type Ring = { hx: number; hy: number; tower: TowerSpec; wallHeight: number; wallThickness: number; extra: number };

/**
 * Enceinte rectangulaire : tours aux angles (et au milieu des grands côtés si demandé),
 * courtines tendues de tour à tour, encastrées de 600 mm dans la maçonnerie des tours.
 * Renvoie la liste des tours dans l'ordre du parcours (sens trigonométrique depuis le sud-ouest).
 */
function buildRing(ctx: Ctx, ring: Ring, withGate: boolean, label: string): void {
  const { hx, hy } = ring;
  const corners: Array<[number, number]> = [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]];
  // Tours supplémentaires : milieux des côtés sud et nord d'abord, puis est et ouest, etc.
  const perSide = [0, 0, 0, 0];
  const order = hx >= hy ? [0, 2, 1, 3] : [1, 3, 0, 2];
  for (let i = 0; i < ring.extra; i++) perSide[order[i % 4]!]!++;
  const points: Array<[number, number]> = [];
  for (let s = 0; s < 4; s++) {
    const a = corners[s]!, b = corners[(s + 1) % 4]!;
    points.push(a);
    for (let j = 1; j <= perSide[s]!; j++) {
      const f = j / (perSide[s]! + 1);
      points.push([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]);
    }
  }
  const southern = isSouthern(ctx.spec);
  const towers = points.map(([x, y], i) =>
    add(ctx, ring.tower.type, [x, y, 0], 0, {
      height: vary(ctx, ring.tower.height),
      ...(ring.tower.square ? { width: ring.tower.size } : { diameter: ring.tower.size }),
      roof: southern ? (ring.tower.square ? "terrace" : "none") : ring.tower.square ? "pyramid" : "conical",
      crenellated: true,
      ...(southern ? { roofMaterial: "roofing.tile.canal" } : {}),
    }, `${label} — tour ${i + 1}`),
  );

  const EMBED = 600;
  // Porte : sur le segment sud le plus proche de l'axe x = 0.
  let gateSeg = -1;
  if (withGate) {
    let best = Infinity;
    for (let i = 0; i < points.length; i++) {
      const a = points[i]!, b = points[(i + 1) % points.length]!;
      if (a[1] !== -hy || b[1] !== -hy) continue;
      const mid = Math.abs((a[0] + b[0]) / 2);
      if (mid < best) {
        best = mid;
        gateSeg = i;
      }
    }
  }

  for (let i = 0; i < points.length; i++) {
    const A = points[i]!, B = points[(i + 1) % points.length]!;
    const tA = towers[i]!, tB = towers[(i + 1) % points.length]!;
    const dx = B[0] - A[0], dy = B[1] - A[1];
    const dist = Math.hypot(dx, dy);
    const ux = dx / dist, uy = dy / dist;
    const angle = (Math.atan2(uy, ux) * 180) / Math.PI;
    const flankOut = ((Math.round(angle / 90) % 4) + 4) % 4; // flanc de A tourné vers B
    const flankIn = (flankOut + 2) % 4; // flanc de B tourné vers A
    const rA = halfSize(ring.tower) - EMBED;
    const rB = halfSize(ring.tower) - EMBED;
    const wallParams = { height: vary(ctx, ring.wallHeight, 0.05), thickness: ring.wallThickness, crenellated: true };

    if (i === gateSeg) {
      const g = intent(ctx.spec, "gate#");
      const gw = Math.min(14000, dist - 2 * halfSize(ring.tower) - 4000);
      if (gw >= 7000) {
        const gc: [number, number] = [A[0] + dx / 2, A[1] + dy / 2];
        const gate = add(ctx, "castle.entrance.gate", [gc[0], gc[1], 0], angle, {
          width: gw,
          height: Math.round(ring.wallHeight * 1.35),
          depth: Math.max(8000, ring.wallThickness * 3),
          flankingTowers: Boolean(g?.params.flankingTowers ?? true),
          crenellated: true,
        }, "Porte fortifiée");
        const l1 = dist / 2 - gw / 2 + EMBED - rA;
        const w1 = add(ctx, "castle.wall.curtain", [A[0] + ux * rA, A[1] + uy * rA, 0], angle, { ...wallParams, length: Math.round(l1) }, `${label} — courtine`);
        const w2 = add(ctx, "castle.wall.curtain", [gc[0] + ux * (gw / 2 - EMBED), gc[1] + uy * (gw / 2 - EMBED), 0], angle, { ...wallParams, length: Math.round(l1) }, `${label} — courtine`);
        link(ctx, tA, `flank[${flankOut}]`, w1, "start");
        link(ctx, w1, "end", gate, "flank[2]");
        link(ctx, gate, "flank[0]", w2, "start");
        link(ctx, w2, "end", tB, `flank[${flankIn}]`);
        continue;
      }
      ctx.notes.push("Côté sud trop court pour une porte fortifiée : porte omise.");
    }
    const L = dist - rA - rB;
    const w = add(ctx, "castle.wall.curtain", [A[0] + ux * rA, A[1] + uy * rA, 0], angle, { ...wallParams, length: Math.round(L) }, `${label} — courtine`);
    link(ctx, tA, `flank[${flankOut}]`, w, "start");
    link(ctx, w, "end", tB, `flank[${flankIn}]`);
  }
}

function planCastle(ctx: Ctx): void {
  const { spec } = ctx;
  const towers = intent(spec, "tower#");
  const outer = intent(spec, "enceinte.outer#");
  const keep = intent(spec, "keep#");
  const hall = intent(spec, "hall#");
  const square = towers?.type === "castle.tower.square";
  const nTowers = towers?.count ?? 4;

  const L = spec.overall.length ?? (outer ? 90000 : 60000);
  const W = spec.overall.width ?? Math.round(L * (outer ? 0.62 : 0.66));
  const offset = outer ? Math.min(14000, Math.round(0.18 * Math.min(L, W))) : 0;

  const innerTower: TowerSpec = {
    type: square ? "castle.tower.square" : "castle.tower.round",
    size: vary(ctx, square ? 8000 : 9000),
    height: 18000,
    square,
  };
  const inner: Ring = { hx: L / 2 - offset, hy: W / 2 - offset, tower: innerTower, wallHeight: 11000, wallThickness: 2400, extra: Math.max(0, nTowers - 4) };
  if (nTowers < 4) ctx.notes.push("Moins de quatre tours demandées : les angles de l'enceinte en reçoivent quand même une.");
  buildRing(ctx, inner, !outer, outer ? "Enceinte haute" : "Enceinte");
  if (outer) {
    const outerRing: Ring = {
      hx: L / 2,
      hy: W / 2,
      tower: { ...innerTower, size: Math.round(innerTower.size * 0.75), height: 12000 },
      wallHeight: 7500,
      wallThickness: 2000,
      extra: 0,
    };
    buildRing(ctx, outerRing, true, "Enceinte basse");
  }

  const t = inner.wallThickness;
  const towerHalf = innerTower.size / 2;
  if (keep) {
    const round = keep.type === "castle.keep.round";
    const room = Math.min(2 * inner.hy - 2 * t - 8000, 2 * inner.hx * 0.45);
    const size = Math.max(8000, Math.min(round ? 15000 : 14000, room));
    const kx = inner.hx * 0.35;
    const ky = inner.hy - t / 2 - size / 2 - 3000;
    add(ctx, keep.type, [kx, Math.max(0, ky), 0], 0, {
      height: vary(ctx, round ? 30000 : 25000),
      ...(round ? { diameter: size } : { width: size }),
      roof: isSouthern(spec) ? "none" : round ? "conical" : "pyramid",
      crenellated: true,
    }, "Donjon");
  }
  if (hall) {
    const x0 = -inner.hx + towerHalf + 2000;
    const keepLeft = keep ? inner.hx * 0.35 - 9000 : inner.hx - towerHalf - 2000;
    const length = Math.min(24000, keepLeft - x0 - 2000);
    const width = 9000;
    if (length >= 8000) {
      add(ctx, "castle.residential.hall", [x0, inner.hy - t / 2 - width / 2 - 400, 0], 0, {
        length: Math.round(length),
        width,
        height: 8000,
        windows: Math.max(2, Math.floor(length / 5000)),
        ...(isSouthern(spec) ? { roofMaterial: "roofing.tile.canal" } : {}),
      }, "Logis");
    } else ctx.notes.push("Cour trop petite pour un logis à côté du donjon : logis omis.");
  }
}

// --- Églises ----------------------------------------------------------------

function planChurch(ctx: Ctx): void {
  const { spec } = ctx;
  const style = spec.building.style ?? "romanesque";
  const gothic = style.startsWith("gothic");
  const cathedral = spec.building.type === "cathedral";
  const naveI = intent(spec, "nave#");
  const aisles = Boolean(naveI?.params.aisles ?? cathedral);
  const transept = intent(spec, "transept#");
  const chapels = intent(spec, "chapel.radiating#");
  const facadeTowers = intent(spec, "tower.facade#");
  const flyers = Boolean(intent(spec, "buttress#")?.params.flyer) && aisles && gothic;
  const southernSingle = style === "gothic.southern";

  const Lt = spec.overall.length ?? (cathedral ? 90000 : spec.building.type === "chapel" ? 25000 : 50000);
  const W = vary(ctx, southernSingle ? 18000 : cathedral ? 12500 : 9000, 0.05);
  const H = vary(ctx, gothic ? (cathedral ? 32000 : 22000) : cathedral ? 22000 : 15000, 0.05);
  const t = gothic ? 1600 : 1800;
  const aw = aisles && !southernSingle ? Math.round(W * 0.5) : 0;
  const ah = Math.round(H * 0.45);
  const hasAisles = aw > 0;
  const outerHalf = W / 2 + t;
  const outerTotal = outerHalf + (hasAisles ? aw + t : 0);
  const apseR = outerHalf;
  const naveLen = Math.max(12000, Lt - apseR);
  const bays = Math.max(2, Math.min(20, Number(naveI?.params.bays ?? Math.round(naveLen / (gothic ? 7000 : 6000)))));
  const bay = naveLen / bays;
  const arch = gothic ? "pointed" : "round";
  const stone = gothic ? "stone.limestone.white" : "stone.limestone.blond";
  const roofMaterial = southernSingle || spec.building.region?.startsWith("fr.occitania") ? "roofing.tile.canal" : "roofing.slate";

  const nave = add(ctx, "church.nave", [0, 0, 0], 0, {
    length: Math.round(naveLen),
    width: W,
    height: H,
    wallThickness: t,
    bays,
    aisles: hasAisles,
    ...(hasAisles ? { aisleWidth: aw, aisleHeight: ah } : {}),
    archProfile: arch,
    facade: true,
    eastOpen: true,
    material: stone,
    roofMaterial,
  }, "Nef");
  if (southernSingle && aisles) ctx.notes.push("Gothique méridional : nef unique large, sans bas-côtés.");

  const apse = add(ctx, "church.apse", [naveLen, 0, 0], 0, {
    diameter: Math.round(2 * apseR),
    height: H,
    wallThickness: t,
    windows: 5,
    material: stone,
    roofMaterial,
  }, "Abside");
  link(ctx, nave, "east", apse, "west");

  // Transept : deux bras perpendiculaires à la nef, façade vers l'extérieur.
  let armRange: [number, number] | null = null;
  if (transept) {
    const xc = naveLen - Math.min(2.5, bays - 1) * bay;
    const armL = Math.round(Math.max(bay * 1.6, 8000) + (hasAisles ? aw : 0));
    const armParams = { length: armL + (hasAisles ? aw + t : 0), width: W, height: H, wallThickness: t, bays: 2, aisles: false, archProfile: arch, facade: true, eastOpen: true, material: stone, roofMaterial };
    const yEdge = outerHalf + armParams.length; // l'extrémité intérieure touche le mur du vaisseau central
    const north = add(ctx, "church.transept", [xc, yEdge, 0], -90, armParams, "Bras nord du transept");
    const south = add(ctx, "church.transept", [xc, -yEdge, 0], 90, armParams, "Bras sud du transept");
    link(ctx, north, "east", nave, `bay[${Math.round(xc / bay)}].north`);
    link(ctx, south, "east", nave, `bay[${Math.round(xc / bay)}].south`);
    armRange = [xc - W / 2 - t - 500, xc + W / 2 + t + 500];
  }

  // Chapelles rayonnantes autour de l'abside, réparties sur 150° ; leur diamètre est borné
  // par l'écart entre deux chapelles voisines pour qu'elles ne se touchent pas.
  if (chapels) {
    const nC = chapels.count;
    const spread = 150;
    const step = nC === 1 ? spread : spread / (nC - 1);
    const dist0 = apseR - t / 2;
    const chord = nC === 1 ? Infinity : 2 * dist0 * Math.sin((step * Math.PI) / 360);
    const d = Math.round(Math.max(2500, Math.min(apseR * 0.9, 7000, chord * 0.8)));
    const dist = dist0 + d * 0.15;
    for (let i = 0; i < nC; i++) {
      const a = nC === 1 ? 0 : -spread / 2 + step * i;
      const rad = (a * Math.PI) / 180;
      const c = add(ctx, "church.chapel.radiating", [naveLen + Math.cos(rad) * dist, Math.sin(rad) * dist, 0], a, {
        diameter: d,
        height: Math.round(ah * 0.9),
        wallThickness: Math.max(400, Math.round(t * 0.7)),
        windows: 3,
        material: stone,
        roofMaterial,
      }, `Chapelle rayonnante ${i + 1}`);
      link(ctx, c, "west", apse, "west");
    }
    if (d < 4000) ctx.notes.push("Chapelles nombreuses pour la taille de l'abside : elles sont petites.");
    ctx.notes.push("Déambulatoire non modélisé : les chapelles se greffent directement sur l'abside.");
  }

  // Tours de façade : deux tours encadrant la façade (sur les bas-côtés), ou un clocher-porche
  // unique planté devant le portail. `westZone` = partie de la nef occupée par les tours.
  let westZone = 0;
  if (facadeTowers) {
    const n = facadeTowers.count;
    const tw = Math.round(Math.min(Math.max(8000, aw + 2 * t), 12000));
    const ys = n === 1 ? [0] : [-(outerTotal - tw / 2), outerTotal - tw / 2];
    for (const y of ys) {
      const porch = n === 1;
      const x = porch ? -tw / 2 + 300 : tw / 2 - 2500;
      if (!porch) westZone = Math.max(westZone, x + tw / 2 + 800);
      const tower = add(ctx, "church.tower.facade", [x, y, 0], 0, {
        height: vary(ctx, Math.round(H * (gothic ? 2 : 1.6))),
        width: tw,
        wallThickness: Math.round(t * 1.4),
        roof: gothic ? "spire" : "pyramid",
        material: stone,
        roofMaterial,
      }, y < 0 ? "Tour sud de la façade" : y > 0 ? "Tour nord de la façade" : "Clocher-porche");
      link(ctx, tower, "flank[0]", nave, "west");
    }
  }

  // Piles des grandes arcades, voûtes du vaisseau central, contreforts.
  const vKind = gothic ? "ribbed" : "barrel";
  const riseOf = (span: number) => (arch === "pointed" ? Math.sqrt(span * span - (span / 2) ** 2) : span / 2);
  const vT = 450;
  const springZ = Math.round(H - riseOf(W) - vT - 600);
  for (let b = 0; b < bays; b++) {
    const xb = bay * (b + 0.5);
    if (armRange && xb > armRange[0] && xb < armRange[1]) continue; // croisée : laissée ouverte
    add(ctx, "church.vault", [xb, 0, springZ], 0, { spanX: Math.round(bay), spanY: W, thickness: vT, kind: vKind, profile: arch, material: stone }, `Voûte, travée ${b + 1}`);
  }
  if (springZ < ah) ctx.notes.push("Voûtes plus basses que les bas-côtés : augmenter la hauteur de la nef.");
  for (let b = 1; b < bays; b++) {
    const x = bay * b;
    if (x < westZone) continue; // piles et contreforts noyés dans la base des tours de façade
    if (hasAisles) {
      for (const sy of [-1, 1]) {
        add(ctx, "church.support.column", [x, sy * (W / 2 + t / 2), 0], 0, {
          height: Math.max(3000, ah - 600),
          diameter: Math.max(1200, t),
          style: gothic ? "gothic" : "romanesque",
          material: stone,
        }, `Pile ${b}${sy < 0 ? " sud" : " nord"}`);
      }
    }
    if (armRange && x > armRange[0] && x < armRange[1]) continue;
    for (const sy of [-1, 1]) {
      const bt = add(ctx, "church.buttress", [x, sy * outerTotal, 0], sy < 0 ? 0 : 180, {
        height: hasAisles ? ah + 1500 : Math.round(H * 0.8),
        width: 1800,
        depth: hasAisles ? 3200 : 2600,
        steps: 2,
        flyer: flyers,
        ...(flyers ? { flyerSpan: aw + t, flyerHeight: springZ + 1500 } : {}),
        material: stone,
      }, `${flyers ? "Culée et arc-boutant" : "Contrefort"} ${b}${sy < 0 ? " sud" : " nord"}`);
      link(ctx, bt, "head", nave, `bay[${b}].${sy < 0 ? "south" : "north"}`);
    }
  }
}
