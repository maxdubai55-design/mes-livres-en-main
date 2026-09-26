import type { ModuleDefinition } from "../module/module.js";
import { CASTLE_LIBRARY } from "./castle.js";
import { CHURCH_LIBRARY } from "./church.js";

export * from "./castle.js";
export * from "./church.js";
export * from "./materials.js";
export { OPTION_LABELS } from "./helpers.js";

export const LIBRARY: ModuleDefinition[] = [...CASTLE_LIBRARY, ...CHURCH_LIBRARY];
export const LIBRARY_BY_TYPE = new Map(LIBRARY.map((d) => [d.type, d]));
