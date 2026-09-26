import { DEFAULT_CREATION_CERTAINTY } from "../common/certainty.js";
import type { ModuleDefinition } from "../module/module.js";
import type { Operation } from "../project/operations.js";
import type { Project } from "../project/project.js";
import type { Fix } from "./diagnostic.js";

/**
 * Traduit une correction proposée par un diagnostic en opérations du projet.
 * Le résultat est un lot unique : un seul « annuler » défait toute la correction,
 * et il peut être prévisualisé en fantôme avant d'être appliqué.
 */
export function fixToOperation(
  project: Project,
  defs: Map<string, ModuleDefinition>,
  fix: Fix,
  newId: () => string,
): Operation {
  const ops: Operation[] = [];
  for (const f of fix.operations) {
    switch (f.op) {
      case "setParam":
        ops.push({ op: "setParam", id: f.module, param: f.param, value: f.value });
        break;
      case "move": {
        const m = project.modules[f.module];
        if (!m) break;
        const [x, y, z] = m.transform.position;
        ops.push({
          op: "setTransform",
          id: f.module,
          transform: { position: [x + f.delta[0], y + f.delta[1], z + f.delta[2]], rotation: m.transform.rotation },
        });
        break;
      }
      case "replaceType": {
        const m = project.modules[f.module];
        const def = defs.get(f.newType);
        if (!m || !def) break;
        // On conserve les valeurs dont le nom existe dans la nouvelle définition (hauteur, matériau…).
        const params = Object.fromEntries(Object.entries(m.params).filter(([k]) => k in def.parameters));
        ops.push({ op: "updateModule", id: m.id, patch: { type: def.type, definitionVersion: def.version, params } });
        break;
      }
      case "addModule": {
        const def = defs.get(f.type);
        const near = project.modules[f.near];
        if (!def) break;
        ops.push({
          op: "addModule",
          module: {
            id: newId(),
            type: def.type,
            definitionVersion: def.version,
            transform: { position: f.at ?? near?.transform.position ?? [0, 0, 0], rotation: [0, 0, 0, 1] },
            params: f.params,
            certainty: DEFAULT_CREATION_CERTAINTY,
            paramCertainty: {},
            state: { lockedByUser: false, hidden: false, aiLocked: false },
            tags: ["correction"],
          },
        });
        break;
      }
    }
  }
  return { op: "batch", label: fix.label, ops };
}
