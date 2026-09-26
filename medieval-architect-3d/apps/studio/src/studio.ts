import {
  DEFAULT_CREATION_CERTAINTY,
  History,
  LIBRARY_BY_TYPE,
  Project,
  apply,
  runDiagnostics,
  type AABB,
  type Diagnostic,
  type ModuleInstance,
  type Operation,
  type RegionId,
  type StyleId,
} from "@ma3d/core";

/**
 * État de l'application. Une seule règle : toute modification du projet passe par `run()`,
 * qui enregistre l'opération dans l'historique puis notifie les vues.
 */

export type UiMode = "discovery" | "creation" | "expert";
export type Listener = (reason: ChangeReason) => void;
export type ChangeReason = "project" | "selection" | "diagnostics" | "mode" | "preview";

export const APP_VERSION = "0.3.0";
const AUTOSAVE_KEY = "ma3d.autosave.v1";

export function newId(prefix = "mod"): string {
  const r = crypto.getRandomValues(new Uint32Array(2));
  return `${prefix}_${r[0]!.toString(36)}${r[1]!.toString(36)}`.slice(0, prefix.length + 13);
}

export function emptyProject(name = "Nouveau projet", year: [number, number] = [1201, 1300], region?: RegionId, style?: StyleId): Project {
  return Project.parse({
    schemaVersion: 1,
    id: newId("prj"),
    name,
    kind: "creation",
    context: { date: { from: year[0], to: year[1] }, ...(region ? { region } : {}), ...(style ? { style } : {}) },
    settings: {},
    levels: [],
    modules: {},
    connections: [],
    libraryLock: {},
  });
}

export class Studio {
  project: Project;
  history: History;
  /** Journal des opérations (pour le fichier .medieval3d). */
  log: string[] = [];
  selection: string | null = null;
  mode: UiMode = "discovery";
  diagnostics: Diagnostic[] = [];
  /** Boîtes englobantes monde (mm), tenues à jour par la scène. */
  bounds = new Map<string, AABB>();
  /** Projet de prévisualisation (fantôme), ou null. */
  preview: { project: Project; label: string; onAccept: () => void } | null = null;
  dirty = false;
  /** Remarques du dernier plan généré (éléments non construits, simplifications). */
  lastPlanNotes: string[] = [];
  /** Relance d'une variante de la dernière génération, tant que son aperçu est affiché. */
  variant: { again: () => void } | null = null;
  private listeners = new Set<Listener>();
  private diagTimer = 0;
  private saveTimer = 0;

  constructor(project: Project = emptyProject()) {
    this.project = project;
    this.history = new History(this.project, 500);
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }

  emit(reason: ChangeReason): void {
    for (const l of this.listeners) l(reason);
  }

  /** Applique une opération, l'enregistre, notifie. Renvoie false si elle a échoué. */
  run(label: string, op: Operation): boolean {
    try {
      this.history.do(label, op);
    } catch (e) {
      console.error(e);
      return false;
    }
    this.log.push(JSON.stringify({ label, op, at: Date.now() }));
    this.changed();
    return true;
  }

  undo(): void {
    if (this.history.undo()) this.changed();
  }

  redo(): void {
    if (this.history.redo()) this.changed();
  }

  get canUndo(): boolean {
    return this.history.entries.length > 0;
  }

  private changed(): void {
    this.dirty = true;
    if (this.selection && !this.project.modules[this.selection]) this.selection = null;
    this.emit("project");
    this.scheduleDiagnostics();
    this.scheduleAutosave();
  }

  /** Remplace le projet (ouverture de fichier, nouveau projet). L'historique repart de zéro. */
  load(project: Project): void {
    this.project = project;
    this.history = new History(this.project, 500);
    this.log = [];
    this.selection = null;
    this.preview = null;
    this.bounds.clear();
    this.dirty = false;
    this.emit("project");
    this.emit("selection");
    this.scheduleDiagnostics();
  }

  select(id: string | null): void {
    if (this.selection === id) return;
    this.selection = id;
    this.emit("selection");
  }

  setMode(m: UiMode): void {
    this.mode = m;
    this.emit("mode");
  }

  get selected(): ModuleInstance | null {
    return this.selection ? this.project.modules[this.selection] ?? null : null;
  }

  // --- création -------------------------------------------------------------

  makeInstance(type: string, position: [number, number, number], params: ModuleInstance["params"] = {}): ModuleInstance {
    const def = LIBRARY_BY_TYPE.get(type);
    if (!def) throw new Error(`type inconnu : ${type}`);
    return {
      id: newId(),
      type,
      definitionVersion: def.version,
      transform: { position, rotation: [0, 0, 0, 1] },
      params,
      certainty: DEFAULT_CREATION_CERTAINTY,
      paramCertainty: {},
      state: { lockedByUser: false, hidden: false, aiLocked: false },
      tags: [],
    };
  }

  add(type: string, position: [number, number, number]): string {
    const m = this.makeInstance(type, position);
    this.run(`Ajouter ${LIBRARY_BY_TYPE.get(type)?.label.plain ?? type}`, { op: "addModule", module: m });
    this.select(m.id);
    return m.id;
  }

  duplicate(id: string, offset?: [number, number, number]): string | null {
    const src = this.project.modules[id];
    if (!src) return null;
    if (!offset) {
      // à côté de l'original, jamais dedans : décalage = largeur de l'objet + 2 m
      const b = this.bounds.get(id);
      offset = [b ? Math.round(b.max[0] - b.min[0] + 2000) : 5000, 0, 0];
    }
    const copy: ModuleInstance = structuredClone(src);
    copy.id = newId();
    copy.transform.position = [src.transform.position[0] + offset[0], src.transform.position[1] + offset[1], src.transform.position[2] + offset[2]];
    copy.state = { ...copy.state, lockedByUser: false };
    delete copy.parent;
    this.run("Dupliquer", { op: "addModule", module: copy });
    this.select(copy.id);
    return copy.id;
  }

  remove(id: string): void {
    const m = this.project.modules[id];
    if (!m) return;
    if (m.state.lockedByUser) return;
    this.run("Supprimer", { op: "removeModule", id });
  }

  // --- prévisualisation en fantôme --------------------------------------------

  /** Montre l'effet d'une opération sans l'appliquer. `commit()` l'applique pour de bon. */
  showPreview(label: string, op: Operation, onCommit?: () => void): void {
    const copy = structuredClone(this.project);
    try {
      apply(copy, op);
    } catch (e) {
      console.error(e);
      return;
    }
    this.preview = {
      project: copy,
      label,
      onAccept: () => {
        this.preview = null;
        this.variant = null;
        this.run(label, op);
        onCommit?.();
        this.emit("preview");
      },
    };
    this.emit("preview");
  }

  cancelPreview(): void {
    this.preview = null;
    this.variant = null;
    this.emit("preview");
  }

  // --- diagnostics ----------------------------------------------------------

  scheduleDiagnostics(delay = 250): void {
    clearTimeout(this.diagTimer);
    this.diagTimer = window.setTimeout(() => this.runDiagnosticsNow(), delay);
  }

  runDiagnosticsNow(): void {
    this.diagnostics = runDiagnostics({ project: this.project, defs: LIBRARY_BY_TYPE, bounds: this.bounds });
    this.emit("diagnostics");
  }

  worstFor(id: string): Diagnostic["severity"] | "ok" {
    const order = ["critical", "warning", "notice"] as const;
    const ds = this.diagnostics.filter((d) => !d.dismissed && d.subjects.includes(id));
    for (const s of order) if (ds.some((d) => d.severity === s)) return s;
    return "ok";
  }

  dismiss(d: Diagnostic): void {
    this.run("Continuer ainsi", {
      op: "setDismissed",
      dismissed: [...this.project.dismissedDiagnostics, { rule: d.rule, subjects: d.subjects }],
    });
  }

  // --- autosauvegarde -------------------------------------------------------

  private scheduleAutosave(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => {
      try {
        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify({ at: Date.now(), project: this.project }));
      } catch {
        /* stockage indisponible (navigation privée) : l'autosauvegarde est désactivée */
      }
    }, 1200);
  }

  static readAutosave(): { at: number; project: Project } | null {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      const p = Project.safeParse(data.project);
      if (!p.success || Object.keys(p.data.modules).length === 0) return null;
      return { at: data.at, project: p.data };
    } catch {
      return null;
    }
  }

  static clearAutosave(): void {
    try {
      localStorage.removeItem(AUTOSAVE_KEY);
    } catch {
      /* rien */
    }
  }
}
