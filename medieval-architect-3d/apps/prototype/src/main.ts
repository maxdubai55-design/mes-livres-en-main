import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { OpeningCut } from "@ma3d/geometry";
import { GeometryClient } from "./geometry-client";

/**
 * Prototype du lot 0. Il répond à quatre questions, pas plus :
 *  1. WebGPU fonctionne-t-il, et le repli WebGL 2 est-il transparent ?
 *  2. 200 tours paramétriques instanciées restent-elles fluides ?
 *  3. La géométrie calculée dans un worker revient-elle assez vite pour une poignée ?
 *  4. Un mur percé de 10 ouvertures reste-t-il étanche (condition de l'export STL) ?
 */

type Bench = {
  backend: string;
  fps: number;
  drawCalls: number;
  triangles: number;
  towerInstances: number;
  firstBuildMs: number;
  lastRegenMs: number;
  workerComputeMs: number;
  allWatertight: boolean;
  ready: boolean;
};
const bench: Bench = {
  backend: "?",
  fps: 0,
  drawCalls: 0,
  triangles: 0,
  towerInstances: 0,
  firstBuildMs: 0,
  lastRegenMs: 0,
  workerComputeMs: 0,
  allWatertight: true,
  ready: false,
};
(window as unknown as { __bench: Bench }).__bench = bench;

const params = new URLSearchParams(location.search);

/**
 * Three.js r186 passe `swizzle: "rgba"` à chaque vue de texture WebGPU. Les navigateurs
 * dont l'implémentation WebGPU précède cette option (Chromium 141, par exemple) lèvent
 * une exception à chaque image : l'écran reste vide. On le détecte avant de choisir le moteur.
 */
async function webgpuCompatible(): Promise<{ ok: boolean; reason: string }> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return { ok: false, reason: "WebGPU absent" };
  const adapter = await gpu.requestAdapter();
  if (!adapter) return { ok: false, reason: "aucun adaptateur WebGPU" };
  const device = await adapter.requestDevice();
  try {
    const tex = device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING });
    tex.createView({ swizzle: "rgba" } as GPUTextureViewDescriptor);
    tex.destroy();
    return { ok: true, reason: "" };
  } catch {
    return { ok: false, reason: "WebGPU trop ancien pour Three.js (vues de texture sans « swizzle »)" };
  } finally {
    device.destroy();
  }
}

const probe = params.has("webgl") ? { ok: false, reason: "WebGL 2 demandé" } : await webgpuCompatible();
const forceWebGL = !probe.ok;

// --- rendu -------------------------------------------------------------------
const container = document.getElementById("view")!;
const renderer = new THREE.WebGPURenderer({ antialias: true, forceWebGL });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
container.appendChild(renderer.domElement);
await renderer.init();
bench.backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
  ? "WebGPU"
  : `WebGL 2 (${probe.reason})`;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa9b8c6);
scene.fog = new THREE.Fog(0xa9b8c6, 250, 700);

const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.5, 2000);
camera.position.set(-110, 90, 150);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 5, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xdfe8f0, 0x5a5040, 1.2));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
sun.position.set(-120, 160, 80);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -200, right: 200, top: 200, bottom: -200, far: 600 });
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(1200, 1200),
  new THREE.MeshStandardMaterial({ color: 0x6f7a4f, roughness: 1 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const stone = new THREE.MeshStandardMaterial({ color: 0xcdb991, roughness: 0.92 });

// --- conversion modèle → scène ----------------------------------------------
/**
 * Modèle : Z vers le haut, millimètres. Scène : Y vers le haut, mètres. Facettes nettes.
 * Attention : Three.js transforme les tableaux en place. Passer une copie si le maillage sert deux fois.
 */
function toThree(positions: Float32Array, indices: Uint32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.rotateX(-Math.PI / 2);
  g.scale(0.001, 0.001, 0.001);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}

const geo = new GeometryClient();

// --- 1. champ de 200 tours instanciées : 4 variantes × 50 ------------------
const VARIANTS = [
  { diameter: 7000, wallThickness: 2000, roof: "conical" },
  { diameter: 9000, wallThickness: 2500, roof: "conical" },
  { diameter: 11000, wallThickness: 3000, roof: "none" },
  { diameter: 8000, wallThickness: 2200, roof: "none", openGorge: true },
] as const;
const PER_VARIANT = Number(params.get("per") ?? 50);

const towerMeshes: THREE.InstancedMesh[] = [];
VARIANTS.forEach((_, v) => {
  // une variante = une géométrie partagée par toutes ses instances : un seul appel de dessin
  const m = new THREE.InstancedMesh(new THREE.BufferGeometry(), stone, PER_VARIANT);
  m.castShadow = true;
  m.receiveShadow = true;
  m.visible = false; // jusqu'au retour du worker : pas de géométrie vide à dessiner
  const mat = new THREE.Matrix4();
  for (let i = 0; i < PER_VARIANT; i++) {
    const n = v * PER_VARIANT + i;
    const col = n % 20, row = Math.floor(n / 20);
    mat.makeTranslation(-190 + col * 20, 0, 60 + row * 20);
    m.setMatrixAt(i, mat);
  }
  scene.add(m);
  towerMeshes.push(m);
});
bench.towerInstances = VARIANTS.length * PER_VARIANT;

// --- 2. petite enceinte : 4 tours + 4 courtines, positions tirées des dimensions --
const castle = new THREE.Group();
scene.add(castle);
const CASTLE = { w: 60000, d: 40000, tower: { diameter: 10000, wallThickness: 2800, height: 20000 } };

// --- 3. mur de démonstration percé de 10 ouvertures -------------------------
const DEMO_OPENINGS: OpeningCut[] = Array.from({ length: 10 }, (_, i) => ({
  shape: i % 3 === 0 ? "round_arch" : i % 3 === 1 ? "rect" : "slit",
  at: 2000 + i * 3600,
  width: i % 3 === 2 ? 180 : 1400,
  height: i % 3 === 2 ? 1800 : 3200,
  sill: i % 3 === 0 ? 0 : 2500,
}));

let towerHeight = 18000;

async function buildTowers(): Promise<number> {
  const t0 = performance.now();
  const results = await Promise.all(
    VARIANTS.map((v) => geo.request({ type: "castle.tower.round", params: { ...v, height: towerHeight }, openings: [] })),
  );
  results.forEach((r, i) => {
    const m = towerMeshes[i]!;
    m.geometry.dispose();
    m.geometry = toThree(r.positions, r.indices);
    m.visible = true;
    bench.allWatertight &&= r.watertight;
  });
  bench.workerComputeMs = Math.max(...results.map((r) => r.ms));
  return performance.now() - t0;
}

async function buildCastle(): Promise<void> {
  const { w, d, tower } = CASTLE;
  const r = tower.diameter / 2;
  const [t, walls, demo] = await Promise.all([
    geo.request({ type: "castle.tower.round", params: { ...tower, roof: "conical" }, openings: [] }),
    Promise.all(
      [w, d].map((len) =>
        geo.request({
          type: "castle.wall.curtain",
          params: { length: len - 2 * r + 2 * 600, height: 12000, thickness: 2400 },
          openings: [],
        }),
      ),
    ),
    geo.request({ type: "castle.wall.curtain", params: { length: 38000, height: 9000, thickness: 2200, batter: 800 }, openings: DEMO_OPENINGS }),
  ]);
  bench.allWatertight &&= t.watertight && demo.watertight && walls.every((x) => x.watertight);

  const towerGeo = toThree(t.positions, t.indices);
  const corners: [number, number][] = [[0, 0], [w, 0], [w, d], [0, d]];
  for (const [x, z] of corners) {
    const m = new THREE.Mesh(towerGeo, stone);
    m.position.set((x - w / 2) / 1000, 0, (z - d / 2) / 1000 - 40);
    m.castShadow = m.receiveShadow = true;
    castle.add(m);
  }
  // Courtine : le mur va de x = 0 à x = L dans son repère ; on l'ancre sur le flanc des tours,
  // en l'enfonçant de 600 mm dans la maçonnerie pour que le raccord soit plein.
  const sides = [
    { geo: walls[0]!, from: [0, 0], angle: 0 },
    { geo: walls[1]!, from: [w, 0], angle: -Math.PI / 2 },
    { geo: walls[0]!, from: [w, d], angle: Math.PI },
    { geo: walls[1]!, from: [0, d], angle: Math.PI / 2 },
  ] as const;
  for (const s of sides) {
    const m = new THREE.Mesh(toThree(s.geo.positions.slice(), s.geo.indices.slice()), stone);
    const dx = Math.cos(s.angle), dz = -Math.sin(s.angle);
    m.position.set(
      (s.from[0] + dx * (r - 600) - w / 2) / 1000,
      0,
      (s.from[1] + dz * (r - 600) - d / 2) / 1000 - 40,
    );
    m.rotation.y = s.angle;
    m.castShadow = m.receiveShadow = true;
    castle.add(m);
  }
  const demoMesh = new THREE.Mesh(toThree(demo.positions, demo.indices), stone);
  demoMesh.position.set(-19, 0, 20);
  demoMesh.castShadow = demoMesh.receiveShadow = true;
  scene.add(demoMesh);
}

// --- boucle, mesures, interface ---------------------------------------------
const statsEl = document.getElementById("stats")!;
let frames = 0;
let windowStart = performance.now();

function renderStats(): void {
  const rows: [string, string][] = [
    ["Rendu", bench.backend],
    ["Images/s", bench.fps.toFixed(0)],
    ["Appels de dessin", String(bench.drawCalls)],
    ["Triangles", bench.triangles.toLocaleString("fr-FR")],
    ["Tours instanciées", String(bench.towerInstances)],
    ["Premier calcul", `${bench.firstBuildMs.toFixed(0)} ms`],
    ["Régénération (aller-retour)", `${bench.lastRegenMs.toFixed(0)} ms`],
    ["Calcul d'une tour (worker)", `${bench.workerComputeMs.toFixed(1)} ms`],
    ["Solides étanches", bench.allWatertight ? "oui" : "NON"],
  ];
  statsEl.innerHTML = rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("");
}

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.info.reset();
  renderer.render(scene, camera);
  frames++;
  const now = performance.now();
  if (now - windowStart >= 1000) {
    bench.fps = (frames * 1000) / (now - windowStart);
    bench.drawCalls = renderer.info.render.drawCalls;
    bench.triangles = renderer.info.render.triangles;
    frames = 0;
    windowStart = now;
    renderStats();
  }
});
renderer.info.autoReset = false;

addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// Le curseur simule une poignée : chaque mouvement redemande la géométrie au worker.
let inflight: Promise<void> | null = null;
let queued = false;
document.getElementById("height")!.addEventListener("input", (e) => {
  towerHeight = Number((e.target as HTMLInputElement).value);
  if (inflight) {
    queued = true; // on ne garde que la dernière valeur demandée
    return;
  }
  const loop = async () => {
    do {
      queued = false;
      bench.lastRegenMs = await buildTowers();
    } while (queued);
    inflight = null;
  };
  inflight = loop();
});

const t0 = performance.now();
await Promise.all([buildTowers(), buildCastle()]);
bench.firstBuildMs = performance.now() - t0;
bench.lastRegenMs = await buildTowers(); // deuxième appel : sert le cache ou recalcule selon la hauteur
towerHeight = 21000;
(document.getElementById("height") as HTMLInputElement).value = String(towerHeight);
bench.lastRegenMs = await buildTowers(); // vraie régénération : nouvelle hauteur, 4 variantes
bench.ready = true;
renderStats();
