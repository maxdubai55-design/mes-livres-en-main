import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { Project } from "../project/project.js";
import { CURRENT_FORMAT_VERSION, Manifest, planMigrations, type Migration } from "./file-format.js";

/**
 * Lecture / écriture du format .medieval3d (archive ZIP, voir file-format.ts).
 * Fonctionne à l'identique dans le navigateur et sous Node : aucune API de fichier ici,
 * seulement des octets.
 */

async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as ArrayBuffer);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type ArchiveExtras = {
  appVersion: string;
  createdAt?: string;
  thumbnail?: Uint8Array; // PNG
  history?: string[]; // journal d'opérations, une ligne JSON par opération
};

export async function saveArchive(project: Project, extras: ArchiveExtras): Promise<Uint8Array> {
  const now = new Date().toISOString();
  const files: Record<string, Uint8Array> = {
    "project.json": strToU8(JSON.stringify(project, null, 1)),
  };
  if (extras.history?.length) files["history/ops.jsonl"] = strToU8(extras.history.join("\n") + "\n");
  if (extras.thumbnail) files["thumbnails/cover.png"] = extras.thumbnail;
  const checksums: Record<string, string> = {};
  for (const [name, bytes] of Object.entries(files)) checksums[name] = await sha256(bytes);
  const manifest: Manifest = {
    format: "medieval3d",
    formatVersion: CURRENT_FORMAT_VERSION,
    appVersion: extras.appVersion,
    createdAt: extras.createdAt ?? now,
    savedAt: now,
    activeVariant: "main",
    variants: [{ id: "main", name: "Principale", file: "project.json" }],
    libraries: Object.entries(project.libraryLock).map(([id, version]) => ({ id, version })),
    checksums,
  };
  files["manifest.json"] = strToU8(JSON.stringify(manifest, null, 1));
  // Le PNG est déjà compressé : on le stocke tel quel.
  return zipSync(
    Object.fromEntries(Object.entries(files).map(([k, v]) => [k, k.endsWith(".png") ? [v, { level: 0 }] : v])),
    { level: 6 },
  );
}

export type LoadResult =
  | { ok: true; project: Project; manifest: Manifest; readOnly: boolean; warnings: string[] }
  | { ok: false; error: string };

export async function loadArchive(bytes: Uint8Array, migrations: Migration[] = []): Promise<LoadResult> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bytes);
  } catch {
    return { ok: false, error: "Ce fichier n'est pas une archive .medieval3d lisible." };
  }
  const rawManifest = files["manifest.json"];
  if (!rawManifest) return { ok: false, error: "Archive incomplète : manifest.json manquant." };
  const parsedManifest = Manifest.safeParse(JSON.parse(strFromU8(rawManifest)));
  if (!parsedManifest.success) return { ok: false, error: "Manifeste illisible." };
  const manifest = parsedManifest.data;
  const warnings: string[] = [];
  for (const [name, expected] of Object.entries(manifest.checksums)) {
    const f = files[name];
    if (!f) warnings.push(`Fichier manquant : ${name}`);
    else if ((await sha256(f)) !== expected) warnings.push(`Fichier altéré depuis l'enregistrement : ${name}`);
  }
  const entry = manifest.variants.find((v) => v.id === manifest.activeVariant)?.file ?? "project.json";
  const raw = files[entry];
  if (!raw) return { ok: false, error: `Variante introuvable : ${entry}` };
  const plan = planMigrations(manifest.formatVersion, migrations);
  let data: unknown = JSON.parse(strFromU8(raw));
  let readOnly = false;
  if (plan === "newer") {
    readOnly = true;
    warnings.push("Fichier créé par une version plus récente : ouverture en lecture seule.");
  } else {
    for (const m of plan) data = m.migrate(data);
  }
  const project = Project.safeParse(data);
  if (!project.success) return { ok: false, error: `Projet invalide : ${project.error.issues[0]?.message ?? "inconnu"}` };
  return { ok: true, project: project.data, manifest, readOnly, warnings };
}
