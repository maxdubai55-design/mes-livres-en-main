import { Project, type ModuleInstance } from "../src/index.js";

export const instance = (id: string, type: string, extra: Partial<ModuleInstance> = {}): ModuleInstance => ({
  id,
  type,
  definitionVersion: "0.2.0",
  transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1] },
  params: {},
  certainty: { level: "free_restitution", provenance: "user", sources: [] },
  paramCertainty: {},
  state: { lockedByUser: false, hidden: false, aiLocked: false },
  tags: [],
  ...extra,
});

export const project = (modules: ModuleInstance[] = [], year = 1250): Project =>
  Project.parse({
    schemaVersion: 1,
    id: "p1",
    name: "Essai",
    kind: "creation",
    context: { date: { from: year, to: year } },
    settings: {},
    levels: [],
    modules: Object.fromEntries(modules.map((m) => [m.id, m])),
    connections: [],
    libraryLock: {},
  });
