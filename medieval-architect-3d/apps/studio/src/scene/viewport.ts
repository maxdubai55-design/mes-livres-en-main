import * as THREE from "three/webgpu";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";
import {
  LIBRARY_BY_TYPE,
  evaluateSnap,
  resolveParameters,
  type ModuleInstance,
  type Project,
  type ResolvedConnector,
  type Transform,
} from "@ma3d/core";
import { toWorld, worldBounds, yaw, yawOf, rotateVec } from "@ma3d/geometry/src/transform.js";
import type { Studio } from "../studio";
import { GeometryStore, type GeometryEntry } from "./geometry-store";
import { MaterialLibrary, type DisplayMode, type Tint } from "./materials";

/** Modèle (mm, Z en haut) ↔ scène (m, Y en haut). */
export const toScene = (p: readonly [number, number, number]) => new THREE.Vector3(p[0] / 1000, p[2] / 1000, -p[1] / 1000);
export const toModel = (v: THREE.Vector3): [number, number, number] => [Math.round(v.x * 1000), Math.round(-v.z * 1000), Math.round(v.y * 1000)];

/** Générateurs à surfaces courbes : ils reçoivent une version allégée pour la vue lointaine. */
const CURVED = new Set(["gen.tower.round", "gen.church.apse", "gen.church.column", "gen.gate", "gen.church.nave", "gen.church.vault", "gen.church.arch"]);

type Rec = {
  id: string;
  group: THREE.Group;
  hiKey: string | null;
  loKey: string | null;
  entry: GeometryEntry | null;
  meshes: THREE.Mesh[];
  lod: THREE.LOD | null;
  matKey: string;
  pending: number;
};

export type SnapState = { color: "green" | "orange" | "red"; reasons: string[]; target: string; mine: string; theirs: string; at: THREE.Vector3 } | null;

async function webgpuCompatible(): Promise<{ ok: boolean; reason: string }> {
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return { ok: false, reason: "WebGPU absent" };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { ok: false, reason: "aucun adaptateur WebGPU" };
    const device = await adapter.requestDevice();
    try {
      const tex = device.createTexture({ size: [1, 1], format: "rgba8unorm", usage: GPUTextureUsage.TEXTURE_BINDING });
      tex.createView({ swizzle: "rgba" } as GPUTextureViewDescriptor);
      tex.destroy();
      return { ok: true, reason: "" };
    } finally {
      device.destroy();
    }
  } catch {
    return { ok: false, reason: "WebGPU incompatible avec cette version de Three.js" };
  }
}

export class Viewport {
  renderer!: THREE.WebGPURenderer;
  backend = "?";
  readonly scene = new THREE.Scene();
  readonly persp: THREE.PerspectiveCamera;
  readonly ortho: THREE.OrthographicCamera;
  camera: THREE.Camera;
  controls!: OrbitControls;
  gizmo!: TransformControls;
  readonly store = new GeometryStore();
  readonly materials = new MaterialLibrary();
  mode: DisplayMode = "realistic";
  snapEnabled = true;
  gridSnap = true;
  private recs = new Map<string, Rec>();
  private ghosts = new THREE.Group();
  private world = new THREE.Group();
  private sun: THREE.DirectionalLight;
  private grid: THREE.GridHelper;
  private human: THREE.Group;
  private snapMarker: THREE.Mesh;
  private selBox = new THREE.Box3Helper(new THREE.Box3(), 0xe29a62);
  private needsRender = true;
  private raycaster = new THREE.Raycaster();
  private down: { x: number; y: number } | null = null;
  snap: SnapState = null;
  onMeasure: (text: string) => void = () => {};
  onSnap: (s: SnapState) => void = () => {};
  frameMs = 0;
  frames = 0;

  constructor(private container: HTMLElement, private studio: Studio) {
    const aspect = Math.max(1, container.clientWidth) / Math.max(1, container.clientHeight);
    this.persp = new THREE.PerspectiveCamera(45, aspect, 0.5, 4000);
    this.persp.position.set(-70, 55, 90);
    this.ortho = new THREE.OrthographicCamera(-60 * aspect, 60 * aspect, 60, -60, -2000, 4000);
    this.camera = this.persp;

    this.scene.background = new THREE.Color(0xb9c7d3);
    this.scene.fog = new THREE.Fog(0xb9c7d3, 600, 2200);
    this.scene.add(new THREE.HemisphereLight(0xe4ecf2, 0x5d5444, 1.15));
    this.sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
    this.sun.position.set(-120, 180, 90);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0005;
    // Optimisation : les ombres ne sont recalculées que quand la scène change, pas à chaque image.
    this.sun.shadow.autoUpdate = false;
    this.scene.add(this.sun, this.sun.target);

    const ground = new THREE.Mesh(new THREE.CircleGeometry(1500, 64), new THREE.MeshStandardMaterial({ color: 0x7d8a5a, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    ground.name = "sol";
    this.scene.add(ground);
    this.grid = new THREE.GridHelper(400, 400, 0x5f6a45, 0x6f7a50);
    (this.grid.material as THREE.Material).transparent = true;
    (this.grid.material as THREE.Material).opacity = 0.35;
    this.scene.add(this.grid);
    this.scene.add(this.world, this.ghosts, this.selBox);
    this.selBox.visible = false;

    this.human = makeHuman();
    this.human.visible = false;
    this.scene.add(this.human);
    this.snapMarker = new THREE.Mesh(new THREE.SphereGeometry(0.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0x2f7d4a, depthTest: false, transparent: true, opacity: 0.85 }));
    this.snapMarker.renderOrder = 10;
    this.snapMarker.visible = false;
    this.scene.add(this.snapMarker);
  }

  async init(forceWebGL = false): Promise<void> {
    const probe = forceWebGL ? { ok: false, reason: "WebGL 2 demandé" } : await webgpuCompatible();
    this.renderer = new THREE.WebGPURenderer({ antialias: true, alpha: true, forceWebGL: !probe.ok });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.container.appendChild(this.renderer.domElement);
    await this.renderer.init();
    this.backend = (this.renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? "WebGPU" : `WebGL 2${probe.reason ? ` (${probe.reason})` : ""}`;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 6, 0);
    this.controls.maxPolarAngle = Math.PI * 0.495;
    this.controls.addEventListener("change", () => this.requestRender());

    this.gizmo = new TransformControls(this.camera, this.renderer.domElement);
    this.gizmo.setSpace("world");
    this.gizmo.setTranslationSnap(0.5);
    this.gizmo.setRotationSnap(THREE.MathUtils.degToRad(15));
    this.gizmo.addEventListener("dragging-changed", (e) => {
      this.controls.enabled = !e.value;
      if (!e.value) this.commitGizmo();
    });
    this.gizmo.addEventListener("objectChange", () => this.onGizmoMove());
    this.gizmo.addEventListener("change", () => this.requestRender());
    this.scene.add(this.gizmo.getHelper());

    const el = this.renderer.domElement;
    el.tabIndex = 0;
    el.addEventListener("pointerdown", (e) => (this.down = { x: e.clientX, y: e.clientY }));
    el.addEventListener("pointerup", (e) => this.onClick(e));
    el.addEventListener("dblclick", () => this.frameSelection());
    new ResizeObserver(() => this.resize()).observe(this.container);

    this.renderer.setAnimationLoop(() => this.tick());
  }

  // --- rendu à la demande ------------------------------------------------------

  requestRender(): void {
    this.needsRender = true;
  }

  private tick(): void {
    const moving = this.controls.update();
    if (!this.needsRender && !moving) return;
    this.needsRender = false;
    const t0 = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.frameMs = performance.now() - t0;
    this.frames++;
  }

  private resize(): void {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.persp.aspect = w / h;
    this.persp.updateProjectionMatrix();
    const half = (this.ortho.top - this.ortho.bottom) / 2;
    this.ortho.left = -half * (w / h);
    this.ortho.right = half * (w / h);
    this.ortho.updateProjectionMatrix();
    this.requestRender();
  }

  private shadowsDirty(): void {
    // Cadre la caméra d'ombre sur la scène réelle : ombres nettes pour un petit château comme pour une cathédrale.
    const box = new THREE.Box3().setFromObject(this.world);
    if (!box.isEmpty()) {
      const c = box.getCenter(new THREE.Vector3());
      const r = Math.max(20, box.getSize(new THREE.Vector3()).length() / 2 + 10);
      this.sun.target.position.copy(c);
      this.sun.position.copy(c).add(new THREE.Vector3(-0.5, 0.75, 0.4).normalize().multiplyScalar(r * 2));
      Object.assign(this.sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 1, far: r * 4 });
      this.sun.shadow.camera.updateProjectionMatrix();
    }
    this.sun.shadow.needsUpdate = true;
    this.requestRender();
  }

  // --- synchronisation projet → scène ---------------------------------------------

  sync(): void {
    const p = this.studio.project;
    const live = new Set<string>();
    for (const m of Object.values(p.modules)) {
      live.add(m.id);
      this.syncModule(m);
    }
    for (const [id, rec] of this.recs) if (!live.has(id)) this.drop(id, rec);
    this.syncGhosts();
    this.updateSelection();
    this.shadowsDirty();
  }

  private visibleInMode(m: ModuleInstance): boolean {
    if (m.state.hidden) return false;
    if (this.mode !== "structure") return true;
    const def = LIBRARY_BY_TYPE.get(m.type);
    return !!def && def.structuralRole !== "carried" && def.structuralRole !== "non_structural";
  }

  private tintFor(m: ModuleInstance): Tint {
    if (this.studio.preview && !this.studio.preview.project.modules[m.id]) return "removed";
    if (this.mode === "analysis") return this.studio.worstFor(m.id);
    if (this.studio.selection === m.id) return "selected";
    return "none";
  }

  private materialsFor(m: ModuleInstance, tint: Tint): THREE.Material[] {
    const def = LIBRARY_BY_TYPE.get(m.type)!;
    const params = resolveParameters(def.parameters, m.params);
    const slot = (s: string, fallback: string) => {
      const e = Object.entries(def.parameters).find(([, p]) => p.kind === "material" && p.slot === s);
      return e ? String(params[e[0]]) : fallback;
    };
    const masonry = slot("masonry", "stone.limestone.blond");
    return [
      this.materials.get(masonry, this.mode, tint),
      this.materials.get(slot("roof", "roofing.slate"), this.mode, tint),
      this.materials.get(slot("timber", "wood.oak.hewn"), this.mode, tint),
    ];
  }

  private syncModule(m: ModuleInstance): void {
    let rec = this.recs.get(m.id);
    if (!rec) {
      const group = new THREE.Group();
      group.userData.moduleId = m.id;
      this.world.add(group);
      rec = { id: m.id, group, hiKey: null, loKey: null, entry: null, meshes: [], lod: null, matKey: "", pending: 0 };
      this.recs.set(m.id, rec);
    }
    const g = rec.group;
    g.position.copy(toScene(m.transform.position));
    g.rotation.set(0, THREE.MathUtils.degToRad(yawOf(m.transform.rotation)), 0);
    g.visible = this.visibleInMode(m);

    const tint = this.tintFor(m);
    const matKey = JSON.stringify([m.params, this.mode, tint]);
    const key = this.store.keyOf(m.type, m.params, "high");
    if (key !== rec.hiKey) {
      const { key: k, entry } = this.store.acquire(m.type, m.params, "high");
      const token = ++rec.pending;
      const r = rec;
      entry.then((e) => {
        if (r.pending !== token || !this.recs.has(m.id)) return this.store.release(k);
        if (r.hiKey) this.store.release(r.hiKey);
        if (r.loKey) this.store.release(r.loKey);
        r.hiKey = k;
        r.loKey = null;
        r.entry = e;
        this.build(r, m, e, null);
        this.updateBounds(m, e);
        // Version allégée pour la vue lointaine, calculée quand le fil est libre.
        const def = LIBRARY_BY_TYPE.get(m.type);
        if (def && CURVED.has(def.generator)) {
          setTimeout(() => {
            if (r.pending !== token) return;
            const lo = this.store.acquire(m.type, m.params, "low");
            lo.entry.then((le) => {
              if (r.pending !== token) return this.store.release(lo.key);
              r.loKey = lo.key;
              this.build(r, this.studio.project.modules[m.id] ?? m, e, le);
            }).catch(() => this.store.release(lo.key));
          }, 50);
        }
      }).catch((err) => {
        console.error(err);
        this.store.release(k);
      });
      rec.matKey = matKey;
    } else if (rec.matKey !== matKey && rec.entry) {
      rec.matKey = matKey;
      const mats = this.materialsFor(m, tint);
      for (const mesh of rec.meshes) mesh.material = mats;
      this.requestRender();
    }
    if (rec.entry) this.updateBounds(m, rec.entry);
  }

  private build(rec: Rec, m: ModuleInstance, hi: GeometryEntry, lo: GeometryEntry | null): void {
    rec.group.clear();
    const mats = this.materialsFor(m, this.tintFor(m));
    const mk = (e: GeometryEntry) => {
      const mesh = new THREE.Mesh(e.geometry, mats);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.userData.moduleId = m.id;
      return mesh;
    };
    const hm = mk(hi);
    rec.meshes = [hm];
    if (lo) {
      const lod = new THREE.LOD();
      const radius = hi.geometry.boundingSphere?.radius ?? 10;
      lod.addLevel(hm, 0);
      const lm = mk(lo);
      lod.addLevel(lm, Math.max(90, radius * 9));
      rec.meshes.push(lm);
      rec.group.add(lod);
      rec.lod = lod;
    } else {
      rec.group.add(hm);
      rec.lod = null;
    }
    rec.matKey = JSON.stringify([m.params, this.mode, this.tintFor(m)]);
    if (this.studio.selection === m.id) this.updateSelection();
    this.shadowsDirty();
  }

  private updateBounds(m: ModuleInstance, e: GeometryEntry): void {
    const b = worldBounds(m.transform, e.bounds);
    const old = this.studio.bounds.get(m.id);
    if (!old || old.min.some((v, i) => Math.abs(v - b.min[i]!) > 1) || old.max.some((v, i) => Math.abs(v - b.max[i]!) > 1)) {
      this.studio.bounds.set(m.id, b);
      this.studio.scheduleDiagnostics();
    }
  }

  private drop(id: string, rec: Rec): void {
    rec.pending++;
    if (rec.hiKey) this.store.release(rec.hiKey);
    if (rec.loKey) this.store.release(rec.loKey);
    this.world.remove(rec.group);
    this.recs.delete(id);
    this.studio.bounds.delete(id);
    if (this.gizmo.object === rec.group) this.gizmo.detach();
  }

  /** Fantômes : modules ajoutés ou modifiés par la prévisualisation en cours. */
  private syncGhosts(): void {
    for (const child of [...this.ghosts.children]) this.ghosts.remove(child);
    const prev = this.studio.preview?.project;
    if (!prev) return;
    const cur = this.studio.project.modules;
    for (const m of Object.values(prev.modules)) {
      const c = cur[m.id];
      if (c && JSON.stringify([c.type, c.params, c.transform]) === JSON.stringify([m.type, m.params, m.transform])) continue;
      const group = new THREE.Group();
      group.position.copy(toScene(m.transform.position));
      group.rotation.y = THREE.MathUtils.degToRad(yawOf(m.transform.rotation));
      this.ghosts.add(group);
      const { key, entry } = this.store.acquire(m.type, m.params);
      entry.then((e) => {
        if (group.parent) group.add(new THREE.Mesh(e.geometry, this.materialsFor(m, "ghost")));
        this.requestRender();
        // on relâche dès que la prévisualisation disparaît
        const release = () => (group.parent ? setTimeout(release, 500) : this.store.release(key));
        release();
      });
    }
    this.requestRender();
  }

  setMode(mode: DisplayMode): void {
    this.mode = mode;
    for (const m of Object.values(this.studio.project.modules)) this.syncModule(m);
    this.grid.visible = mode !== "realistic";
    this.shadowsDirty();
  }

  refreshTints(): void {
    for (const m of Object.values(this.studio.project.modules)) this.syncModule(m);
    this.requestRender();
  }

  // --- sélection, manipulation, aimantation --------------------------------------

  private onClick(e: PointerEvent): void {
    if (!this.down || Math.hypot(e.clientX - this.down.x, e.clientY - this.down.y) > 5) return;
    if (this.gizmo.dragging || e.button !== 0) return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.children, true);
    const hit = hits.find((h) => h.object.visible && h.object.userData.moduleId);
    this.studio.select(hit ? (hit.object.userData.moduleId as string) : null);
  }

  updateSelection(): void {
    const id = this.studio.selection;
    const rec = id ? this.recs.get(id) : undefined;
    const m = id ? this.studio.project.modules[id] : undefined;
    if (rec && m && !m.state.lockedByUser && this.studio.preview === null) {
      if (this.gizmo.object !== rec.group) this.gizmo.attach(rec.group);
    } else if (this.gizmo.object) this.gizmo.detach();
    if (rec && rec.group.children.length) {
      this.selBox.box.setFromObject(rec.group);
      this.selBox.visible = true;
      const s = this.selBox.box.getSize(new THREE.Vector3());
      this.onMeasure(`${m ? LIBRARY_BY_TYPE.get(m.type)?.label.plain : ""} — ${s.x.toFixed(1)} × ${s.z.toFixed(1)} m, hauteur ${s.y.toFixed(1)} m`);
    } else {
      this.selBox.visible = false;
      this.onMeasure("");
    }
    this.requestRender();
  }

  setGizmoMode(mode: "translate" | "rotate"): void {
    this.gizmo.setMode(mode);
    // rotation : autour de la verticale seulement (les édifices ne basculent pas)
    this.gizmo.showX = mode === "translate";
    this.gizmo.showZ = mode === "translate";
    this.gizmo.showY = true;
    this.requestRender();
  }

  setGridSnap(on: boolean): void {
    this.gridSnap = on;
    this.gizmo.setTranslationSnap(on ? 0.5 : null);
    this.gizmo.setRotationSnap(on ? THREE.MathUtils.degToRad(15) : null);
  }

  private currentTransform(group: THREE.Group): Transform {
    return { position: toModel(group.position), rotation: yaw(THREE.MathUtils.radToDeg(group.rotation.y)) };
  }

  /** Connecteurs d'une instance dans le repère monde du modèle. */
  private worldConnectors(id: string, t?: Transform): Array<ResolvedConnector & { world: [number, number, number] }> {
    const rec = this.recs.get(id);
    const m = this.studio.project.modules[id];
    if (!rec?.entry || !m) return [];
    const tr = t ?? m.transform;
    return rec.entry.connectors.map((c) => ({ ...c, world: toWorld(tr, c.frame.position) }));
  }

  /**
   * Raccords latéraux (mur contre tour, mur contre mur) : la distance se mesure en plan et
   * l'élément reste posé au sol. Sinon un mur de 9 m ne s'accrocherait jamais à une tour de 18 m,
   * leurs points d'accroche étant à mi-hauteur de chacun.
   */
  private static PLANAR = new Set(["wall.end", "tower.flank", "wall.face", "buttress.head"]);

  private findSnap(id: string, t: Transform): SnapState {
    if (!this.snapEnabled) return null;
    const mine = this.worldConnectors(id, t);
    let best: SnapState = null;
    let bestScore = Infinity;
    const RADIUS = 1800;
    for (const other of Object.keys(this.studio.project.modules)) {
      if (other === id) continue;
      for (const theirs of this.worldConnectors(other)) {
        for (const c of mine) {
          const planar = Viewport.PLANAR.has(c.kind) && Viewport.PLANAR.has(theirs.kind);
          const dz = planar ? 0 : c.world[2] - theirs.world[2];
          const d = Math.hypot(c.world[0] - theirs.world[0], c.world[1] - theirs.world[1], dz);
          if (d > RADIUS) continue;
          const v = evaluateSnap(c, theirs);
          if (v.status === "incompatible") continue;
          const score = d + (v.status === "unusual" ? RADIUS : 0);
          if (score < bestScore) {
            bestScore = score;
            best = { color: v.color, reasons: v.reasons, target: other, mine: c.name, theirs: theirs.name, at: toScene(theirs.world) };
            (best as SnapState & { delta: number[] }).delta = [theirs.world[0] - c.world[0], theirs.world[1] - c.world[1], planar ? 0 : theirs.world[2] - c.world[2]];
          }
        }
      }
    }
    return best;
  }

  private onGizmoMove(): void {
    const id = this.studio.selection;
    const rec = id ? this.recs.get(id) : undefined;
    if (!id || !rec) return;
    const t = this.currentTransform(rec.group);
    this.snap = this.findSnap(id, t);
    if (this.snap) {
      this.snapMarker.position.copy(this.snap.at);
      (this.snapMarker.material as THREE.MeshBasicMaterial).color.set(this.snap.color === "green" ? 0x2f9d58 : 0xe07b24);
      this.snapMarker.visible = true;
    } else this.snapMarker.visible = false;
    this.onSnap(this.snap);
    const p = t.position;
    this.onMeasure(`x ${(p[0] / 1000).toFixed(2)} m · y ${(p[1] / 1000).toFixed(2)} m · z ${(p[2] / 1000).toFixed(2)} m · rotation ${Math.round(yawOf(t.rotation))}°`);
    this.selBox.box.setFromObject(rec.group);
    this.requestRender();
  }

  private commitGizmo(): void {
    const id = this.studio.selection;
    const rec = id ? this.recs.get(id) : undefined;
    const m = id ? this.studio.project.modules[id] : undefined;
    if (!id || !rec || !m) return;
    const t = this.currentTransform(rec.group);
    const snap = this.snap as (SnapState & { delta?: number[] }) | null;
    this.snapMarker.visible = false;
    this.snap = null;
    this.onSnap(null);
    if (snap?.delta) {
      t.position = [t.position[0] + snap.delta[0]!, t.position[1] + snap.delta[1]!, t.position[2] + snap.delta[2]!].map(Math.round) as [number, number, number];
    }
    const same = JSON.stringify(t) === JSON.stringify(m.transform);
    if (same) return;
    const already = this.studio.project.connections.some(
      (c) => (c.a.module === id && c.b.module === snap?.target) || (c.b.module === id && c.a.module === snap?.target),
    );
    const ops: Parameters<Studio["run"]>[1][] = [{ op: "setTransform", id, transform: t }];
    if (snap && !already) {
      ops.push({
        op: "connect",
        connection: {
          id: `cnx_${Math.random().toString(36).slice(2, 12)}`,
          a: { module: id, connector: snap.mine },
          b: { module: snap.target, connector: snap.theirs },
          acknowledged: snap.color !== "green",
        },
      });
    }
    this.studio.run(snap ? "Raccorder" : "Déplacer", { op: "batch", label: "Déplacer", ops });
  }

  // --- caméra --------------------------------------------------------------------

  frameSelection(): void {
    const id = this.studio.selection;
    const rec = id ? this.recs.get(id) : undefined;
    this.frameBox(rec ? new THREE.Box3().setFromObject(rec.group) : new THREE.Box3().setFromObject(this.world));
  }

  frameAll(): void {
    this.frameBox(new THREE.Box3().setFromObject(this.world));
  }

  focusModel(p: [number, number, number]): void {
    const c = toScene(p);
    const box = new THREE.Box3(c.clone().subScalar(12), c.clone().addScalar(12));
    this.frameBox(box);
  }

  private frameBox(box: THREE.Box3): void {
    if (box.isEmpty()) box = new THREE.Box3(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 15, 20));
    const c = box.getCenter(new THREE.Vector3());
    const r = Math.max(6, box.getSize(new THREE.Vector3()).length() / 2);
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    this.controls.target.copy(c);
    if (this.camera === this.persp) this.persp.position.copy(c).add(dir.multiplyScalar(r / Math.sin(THREE.MathUtils.degToRad(this.persp.fov / 2)) * 1.05));
    else {
      this.ortho.position.copy(c).add(dir.multiplyScalar(r * 4));
      this.setOrthoHalf(r * 1.1);
    }
    this.controls.update();
    this.requestRender();
  }

  private setOrthoHalf(half: number): void {
    const aspect = this.container.clientWidth / Math.max(1, this.container.clientHeight);
    Object.assign(this.ortho, { left: -half * aspect, right: half * aspect, top: half, bottom: -half });
    this.ortho.updateProjectionMatrix();
  }

  /** Vues normalisées (cube de navigation). */
  view(name: "top" | "bottom" | "front" | "back" | "left" | "right" | "iso"): void {
    const dirs: Record<string, [number, number, number]> = {
      top: [0, 1, 0.0001], bottom: [0, -1, 0.0001], front: [0, 0.0001, 1], back: [0, 0.0001, -1], left: [-1, 0.0001, 0], right: [1, 0.0001, 0], iso: [-1, 0.9, 1],
    };
    const box = new THREE.Box3().setFromObject(this.world);
    const c = box.isEmpty() ? this.controls.target.clone() : box.getCenter(new THREE.Vector3());
    const r = box.isEmpty() ? 40 : Math.max(10, box.getSize(new THREE.Vector3()).length() / 2);
    const d = new THREE.Vector3(...dirs[name]!).normalize();
    this.controls.target.copy(c);
    this.camera.position.copy(c).add(d.multiplyScalar(this.camera === this.persp ? r * 2.6 : r * 4));
    if (this.camera === this.ortho) this.setOrthoHalf(r * 1.1);
    this.controls.maxPolarAngle = name === "bottom" ? Math.PI : Math.PI * 0.495;
    this.controls.update();
    this.requestRender();
  }

  setOrthographic(on: boolean): void {
    const from = this.camera;
    const to = on ? this.ortho : this.persp;
    if (from === to) return;
    to.position.copy(from.position);
    to.quaternion.copy(from.quaternion);
    if (on) this.setOrthoHalf(from.position.distanceTo(this.controls.target) * Math.tan(THREE.MathUtils.degToRad(this.persp.fov / 2)));
    this.camera = to;
    this.controls.object = to;
    this.gizmo.camera = to;
    this.controls.update();
    this.requestRender();
  }

  toggleHuman(on: boolean): void {
    this.human.visible = on;
    const t = this.controls.target;
    this.human.position.set(t.x + 2, 0, t.z + 2);
    this.requestRender();
  }

  // --- export ----------------------------------------------------------------

  /** Image PNG à la résolution demandée (fond transparent en option). */
  async snapshot(width: number, height: number, transparent: boolean): Promise<Blob> {
    const r = this.renderer;
    const oldSize = r.getSize(new THREE.Vector2());
    const oldRatio = r.getPixelRatio();
    const bg = this.scene.background;
    const fog = this.scene.fog;
    const grid = this.grid.visible;
    const gizmo = this.gizmo.getHelper().visible;
    const sel = this.selBox.visible;
    r.setPixelRatio(1);
    r.setSize(width, height, false);
    const cam = this.camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const oldAspect = this.persp.aspect;
    if (cam === this.persp) {
      this.persp.aspect = width / height;
      this.persp.updateProjectionMatrix();
    }
    if (transparent) {
      this.scene.background = null;
      this.scene.fog = null;
      this.scene.getObjectByName("sol")!.visible = false;
    }
    this.grid.visible = false;
    this.gizmo.getHelper().visible = false;
    this.selBox.visible = false;
    this.sun.shadow.needsUpdate = true;
    r.render(this.scene, this.camera);
    const blob = await new Promise<Blob>((ok, ko) => r.domElement.toBlob((b) => (b ? ok(b) : ko(new Error("capture impossible"))), "image/png"));
    this.scene.background = bg;
    this.scene.fog = fog;
    this.scene.getObjectByName("sol")!.visible = true;
    this.grid.visible = grid;
    this.gizmo.getHelper().visible = gizmo;
    this.selBox.visible = sel;
    r.setPixelRatio(oldRatio);
    r.setSize(oldSize.x, oldSize.y, true);
    this.persp.aspect = oldAspect;
    this.persp.updateProjectionMatrix();
    this.requestRender();
    return blob;
  }

  /** Scène d'export : maillages haute qualité, matériaux standard, repère Y en haut en mètres. */
  async exportScene(project: Project): Promise<{ scene: THREE.Scene; notWatertight: string[] }> {
    const out = new THREE.Scene();
    const notWatertight: string[] = [];
    for (const m of Object.values(project.modules)) {
      if (m.state.hidden) continue;
      const def = LIBRARY_BY_TYPE.get(m.type)!;
      const { key, entry } = this.store.acquire(m.type, m.params);
      const e = await entry;
      if (!e.watertight) notWatertight.push(m.name ?? def.label.plain);
      const params = resolveParameters(def.parameters, m.params);
      const matFor = (slot: string, fb: string) => {
        const p = Object.entries(def.parameters).find(([, x]) => x.kind === "material" && x.slot === slot);
        return this.materials.exportMaterial(p ? String(params[p[0]]) : fb);
      };
      const mesh = new THREE.Mesh(e.geometry.clone(), [matFor("masonry", "stone.limestone.blond"), matFor("roof", "roofing.slate"), matFor("timber", "wood.oak.hewn")]);
      mesh.name = m.name ?? def.label.plain;
      mesh.position.copy(toScene(m.transform.position));
      mesh.rotation.y = THREE.MathUtils.degToRad(yawOf(m.transform.rotation));
      mesh.userData = { type: m.type, certainty: m.certainty.level, params: m.params };
      out.add(mesh);
      this.store.release(key);
    }
    return { scene: out, notWatertight };
  }

  /** Statistiques de la scène : triangles affichés (niveau de détail courant compris) et maillages. */
  get stats(): { modules: number; triangles: number; meshes: number; sharedGeometries: number } {
    let triangles = 0, meshes = 0;
    const geos = new Set<THREE.BufferGeometry>();
    this.world.updateMatrixWorld();
    for (const r of this.recs.values()) {
      if (!r.group.visible) continue;
      const shown = r.lod ? (r.lod.levels[r.lod.getCurrentLevel()]?.object as THREE.Mesh | undefined) : r.meshes[0];
      if (!shown) continue;
      meshes++;
      geos.add(shown.geometry);
      triangles += shown.geometry.attributes.position!.count / 3;
    }
    return { modules: this.recs.size, triangles, meshes, sharedGeometries: geos.size };
  }
}

function makeHuman(): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: 0x3b5b8c, roughness: 0.8 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.05, 4, 12), mat);
  body.position.y = 0.75;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), mat);
  head.position.y = 1.62;
  g.add(body, head);
  g.traverse((o) => (o.castShadow = true));
  g.name = "Silhouette 1,75 m";
  return g;
}

export { rotateVec };
