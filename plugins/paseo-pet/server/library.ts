import { createHash } from "node:crypto";
import { opendir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import type { RpcInput } from "@getpaseo/plugin";
import {
  listPets, loadPet, manifestSchema, packageKeySchema,
  MAX_ASSET_BYTES, MAX_MANIFEST_BYTES, MAX_PETS, MAX_ENTRIES, type Pet,
} from "../shared/contracts";
import { canonicalRoot, readBounded, relativeParts } from "./files";
import { inspectImage, validateImage } from "./images";

function digest(...parts: (string | Buffer)[]) {
  const hash = createHash("sha256");
  for (const part of parts) hash.update(part);
  return hash.digest("hex");
}
export function defaultRoot(): string {
  const configured = process.env.CODEX_HOME;
  return path.join(configured && path.isAbsolute(configured) ? configured : path.join(homedir(), ".codex"), "pets");
}
export function userError(error: unknown): string {
  if (error instanceof Error && "code" in error) {
    switch (error.code) {
      case "ENOENT": return "Folder or resource is missing. Check the path and refresh.";
      case "EACCES": case "EPERM": return "This host cannot read the folder or resource.";
      default: return "Unable to read this pet package.";
    }
  }
  return error instanceof Error ? error.message : "Unable to read this pet package.";
}
async function descriptor(root: string, key: string) {
  packageKeySchema.parse(key);
  const manifestFile = await readBounded(root, [key, "pet.json"], MAX_MANIFEST_BYTES);
  let json: unknown;
  try { json = JSON.parse(manifestFile.bytes.toString("utf8")); }
  catch { throw new Error("pet.json is not valid JSON."); }
  const parsed = manifestSchema.safeParse(json);
  if (!parsed.success) throw new Error("Unsupported pet.json. Check its fields and sprite version (1 or 2).");
  const manifest = parsed.data;
  const parts = [key, ...relativeParts(manifest.spritesheetPath)];
  const asset = await readBounded(root, parts, MAX_ASSET_BYTES, true);
  const info = inspectImage(asset.bytes, asset.stat.size, manifest.spriteVersionNumber);
  if (path.extname(manifest.spritesheetPath).toLowerCase() !== (info.mime === "image/png" ? ".png" : ".webp")) {
    throw new Error("Atlas extension does not match PNG/WebP file contents.");
  }
  const revision = digest(manifestFile.bytes, JSON.stringify({
    root, parts, dev: asset.stat.dev, ino: asset.stat.ino,
    size: asset.stat.size, mtime: asset.stat.mtimeMs, ctime: asset.stat.ctimeMs,
  }));
  const pet: Pet = {
    key, id: manifest.id, displayName: manifest.displayName, description: manifest.description,
    version: manifest.spriteVersionNumber, mime: info.mime, bytes: asset.stat.size, revision,
  };
  return { pet, parts };
}
export async function listLibrary({ root: input }: RpcInput<typeof listPets>) {
  try {
    const root = await canonicalRoot(input);
    const pets: Pet[] = [], issues: { key: string; message: string }[] = [];
    let seen = 0, truncated = false;
    const directory = await opendir(root);
    // Iteration closes the handle even on break. No recursive walk or background watcher.
    for await (const entry of directory) {
      if (++seen > MAX_ENTRIES || pets.length >= MAX_PETS) { truncated = true; break; }
      if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
      if (entry.name.startsWith(".")) continue;
      try { pets.push((await descriptor(root, entry.name)).pet); }
      catch (error) { issues.push({ key: entry.name, message: userError(error) }); }
    }
    pets.sort((a, b) => a.displayName.localeCompare(b.displayName) || a.key.localeCompare(b.key));
    return { root, pets, issues, truncated };
  } catch (error) { throw new Error(userError(error)); }
}
export async function loadAsset({ root: input, key, revision }: RpcInput<typeof loadPet>) {
  try {
    const root = await canonicalRoot(input);
    const first = await descriptor(root, key);
    if (first.pet.revision !== revision) throw new Error("This pet changed. Refresh the pet list and try again.");
    const { bytes } = await readBounded(root, first.parts, MAX_ASSET_BYTES);
    const info = validateImage(bytes, first.pet.version);
    const second = await descriptor(root, key);
    if (second.pet.revision !== revision) throw new Error("This pet changed. Refresh the pet list and try again.");
    return { pet: second.pet, hash: digest(bytes), uri: "data:" + info.mime + ";base64," + bytes.toString("base64") };
  } catch (error) { throw new Error(userError(error)); }
}
