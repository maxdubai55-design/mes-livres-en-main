import { z } from "zod";

/**
 * Format .medieval3d : archive ZIP (lisible par n'importe quel outil) contenant
 *
 *   manifest.json            ← ce schéma
 *   project.json             ← Project (variante active)
 *   variants/<id>.json       ← autres variantes (Project complets ; diff plus tard si besoin)
 *   history/ops.jsonl        ← journal d'opérations (reprise après crash, historique nommé)
 *   assets/…                 ← imports utilisateur (plans, photos, nuages de points, textures perso)
 *   thumbnails/cover.webp
 *   reports/…                ← rapports générés (facultatif)
 *
 * Jamais de maillage calculé dans le fichier : il se régénère. Exception : les
 * imports (photogrammétrie, modèle 3D de relevé), qui sont des sources.
 */
export const Manifest = z.object({
  format: z.literal("medieval3d"),
  formatVersion: z.number().int().positive(),
  appVersion: z.string(),
  createdAt: z.string(),
  savedAt: z.string(),
  activeVariant: z.string(),
  variants: z.array(z.object({ id: z.string(), name: z.string(), file: z.string() })),
  /** Bibliothèques requises : un fichier ouvert sans elles affiche des modules « à résoudre », pas une erreur. */
  libraries: z.array(z.object({ id: z.string(), version: z.string() })),
  checksums: z.record(z.string(), z.string()), // sha-256 par entrée
});
export type Manifest = z.infer<typeof Manifest>;

export const CURRENT_FORMAT_VERSION = 1;

/**
 * Migrations : une fonction par saut de version, appliquées en chaîne.
 * Un fichier plus récent que l'application s'ouvre en lecture seule avec avertissement.
 */
export type Migration = { from: number; to: number; migrate(project: unknown): unknown };

export function planMigrations(fileVersion: number, available: Migration[]): Migration[] | "newer" {
  if (fileVersion > CURRENT_FORMAT_VERSION) return "newer";
  const chain: Migration[] = [];
  let v = fileVersion;
  while (v < CURRENT_FORMAT_VERSION) {
    const step = available.find((m) => m.from === v);
    if (!step) throw new Error(`aucune migration depuis la version ${v}`);
    chain.push(step);
    v = step.to;
  }
  return chain;
}
