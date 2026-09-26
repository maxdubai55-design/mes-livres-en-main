import type { Transform } from "../common/primitives.js";
import type { Connection } from "../connector/connector.js";
import type { ModuleInstance } from "../module/module.js";
import type { ParameterValue } from "../module/parameters.js";
import type { Project } from "./project.js";

/**
 * Toute modification du projet passe par une Operation.
 * Une opération appliquée renvoie son inverse : c'est ce qui donne l'annuler/rétablir
 * (§20 : ≥ 100 niveaux), l'historique nommé, et la prévisualisation « en fantôme »
 * (appliquer sur une copie, afficher, jeter ou valider).
 * Les opérations sont sérialisables : l'IA, l'assistant et les corrections
 * automatiques produisent exactement les mêmes objets que l'interface.
 */
export type Operation =
  | { op: "addModule"; module: ModuleInstance }
  | { op: "removeModule"; id: string }
  | { op: "setParam"; id: string; param: string; value: ParameterValue | undefined }
  | { op: "setTransform"; id: string; transform: Transform }
  | { op: "connect"; connection: Connection }
  | { op: "disconnect"; id: string }
  | { op: "updateModule"; id: string; patch: ModulePatch }
  | { op: "setContext"; context: Project["context"]; name?: string }
  | { op: "setDismissed"; dismissed: Project["dismissedDiagnostics"] }
  | { op: "batch"; label: string; ops: Operation[] };

/** Champs d'une instance modifiables en place (les raccords sont conservés). */
export type ModulePatch = Partial<Pick<ModuleInstance, "type" | "definitionVersion" | "params" | "certainty" | "state" | "name">>;

export class OperationError extends Error {}

function mustGet(p: Project, id: string): ModuleInstance {
  const m = p.modules[id];
  if (!m) throw new OperationError(`module inconnu : ${id}`);
  return m;
}

/**
 * Applique une opération en place et renvoie l'opération inverse.
 * Supprimer un module supprime aussi ses connexions et ses sous-modules :
 * l'inverse les restaure tous, dans l'ordre.
 */
export function apply(p: Project, o: Operation): Operation {
  switch (o.op) {
    case "addModule": {
      if (p.modules[o.module.id]) throw new OperationError(`id déjà utilisé : ${o.module.id}`);
      p.modules[o.module.id] = structuredClone(o.module);
      return { op: "removeModule", id: o.module.id };
    }
    case "removeModule": {
      const target = mustGet(p, o.id);
      const children = Object.values(p.modules).filter((m) => m.parent === o.id);
      const undo: Operation[] = [];
      for (const c of children) undo.push(apply(p, { op: "removeModule", id: c.id }));
      const linked = p.connections.filter((c) => c.a.module === o.id || c.b.module === o.id);
      for (const c of linked) undo.push(apply(p, { op: "disconnect", id: c.id }));
      delete p.modules[o.id];
      // ordre inverse : le module d'abord, puis ses connexions, puis ses enfants
      return { op: "batch", label: "restaurer", ops: [{ op: "addModule", module: target }, ...undo.reverse()] };
    }
    case "setParam": {
      const m = mustGet(p, o.id);
      const previous = m.params[o.param];
      if (o.value === undefined) delete m.params[o.param];
      else m.params[o.param] = o.value;
      return { op: "setParam", id: o.id, param: o.param, value: previous };
    }
    case "setTransform": {
      const m = mustGet(p, o.id);
      const previous = structuredClone(m.transform);
      m.transform = structuredClone(o.transform);
      return { op: "setTransform", id: o.id, transform: previous };
    }
    case "connect": {
      mustGet(p, o.connection.a.module);
      mustGet(p, o.connection.b.module);
      if (p.connections.some((c) => c.id === o.connection.id))
        throw new OperationError(`connexion déjà présente : ${o.connection.id}`);
      p.connections.push(structuredClone(o.connection));
      return { op: "disconnect", id: o.connection.id };
    }
    case "disconnect": {
      const i = p.connections.findIndex((c) => c.id === o.id);
      if (i < 0) throw new OperationError(`connexion inconnue : ${o.id}`);
      const [removed] = p.connections.splice(i, 1);
      return { op: "connect", connection: removed! };
    }
    case "updateModule": {
      const m = mustGet(p, o.id);
      const previous: ModulePatch = {};
      for (const k of Object.keys(o.patch) as (keyof ModulePatch)[]) {
        (previous as Record<string, unknown>)[k] = structuredClone(m[k]);
        (m as Record<string, unknown>)[k] = structuredClone(o.patch[k]);
      }
      return { op: "updateModule", id: o.id, patch: previous };
    }
    case "setContext": {
      const previous = { op: "setContext" as const, context: structuredClone(p.context), name: p.name };
      p.context = structuredClone(o.context);
      if (o.name !== undefined) p.name = o.name;
      return previous;
    }
    case "setDismissed": {
      const previous = structuredClone(p.dismissedDiagnostics);
      p.dismissedDiagnostics = structuredClone(o.dismissed);
      return { op: "setDismissed", dismissed: previous };
    }
    case "batch": {
      const inverses: Operation[] = [];
      try {
        for (const sub of o.ops) inverses.push(apply(p, sub));
      } catch (e) {
        // atomicité : un lot à moitié appliqué est annulé avant de propager l'erreur
        for (const inv of inverses.reverse()) apply(p, inv);
        throw e;
      }
      return { op: "batch", label: o.label, ops: inverses.reverse() };
    }
  }
}

export type HistoryEntry = { label: string; forward: Operation; inverse: Operation; at: number };

/** Pile annuler/rétablir bornée. 100 niveaux minimum exigés ; 500 par défaut. */
export class History {
  private undoStack: HistoryEntry[] = [];
  private redoStack: HistoryEntry[] = [];
  constructor(
    private project: Project,
    readonly limit = 500,
  ) {
    if (limit < 100) throw new RangeError("l'historique doit conserver au moins 100 opérations");
  }

  do(label: string, forward: Operation): void {
    const inverse = apply(this.project, forward);
    this.undoStack.push({ label, forward, inverse, at: Date.now() });
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
  }

  undo(): boolean {
    const e = this.undoStack.pop();
    if (!e) return false;
    e.forward = apply(this.project, e.inverse);
    this.redoStack.push(e);
    return true;
  }

  redo(): boolean {
    const e = this.redoStack.pop();
    if (!e) return false;
    e.inverse = apply(this.project, e.forward);
    this.undoStack.push(e);
    return true;
  }

  get entries(): readonly HistoryEntry[] {
    return this.undoStack;
  }
}

/** Prévisualisation en fantôme : applique sur une copie, ne touche jamais au projet réel. */
export function preview(p: Project, o: Operation): Project {
  const copy = structuredClone(p);
  apply(copy, o);
  return copy;
}
