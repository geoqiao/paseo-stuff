import { createHash, randomUUID } from "node:crypto";
import { constants, type BigIntStats } from "node:fs";
import { lstat, mkdir, open, readdir, realpath, rename, rm, rmdir, unlink, utimes, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative } from "node:path";
import { setTimeout as wait } from "node:timers/promises";
import { pathToFileURL } from "node:url";

// Portable raster formats recognized by the Paseo 0.16.2 file API.
// SVG is web-only in that release and can contain active content.
const IMAGE_EXTENSIONS = new Map([
  ["image/png", "png"],
  ["image/jpeg", "jpg"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);
const SHA256 = /^[0-9a-f]{64}$/;
const PREVIEW_FILE = /^[0-9a-f]{64}\.(png|jpg|webp|gif)$/;
const CACHE_DIRECTORY = ".paseo-dsh-image-cache";
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_CACHE_BYTES = 64 * 1024 * 1024;
const MAX_CACHE_FILES = 128;
const EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const uid = process.getuid?.();
const READ_FLAGS = constants.O_RDONLY | (uid === undefined ? 0 : constants.O_NOFOLLOW | constants.O_NONBLOCK);

export interface DshImageAttachment {
  hash: string;
  mediaType: string;
}

/** Reads the attachment reference carried by a DSH v4 image block. */
export function readDshImageAttachment(value: unknown): DshImageAttachment | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const attachment = value as Record<string, unknown>;
  const id = attachment.attachmentId;
  const mediaType = attachment.mediaType;
  if (typeof id !== "string" || !id.startsWith("sha256:")) return null;
  const hash = id.slice("sha256:".length);
  if (!SHA256.test(hash) || typeof mediaType !== "string" || !IMAGE_EXTENSIONS.has(mediaType)) return null;
  return { hash, mediaType };
}

export async function materializeDshImage(
  attachment: DshImageAttachment,
  dshHome: string,
  signal: AbortSignal = AbortSignal.timeout(1_000),
  pinned: ReadonlySet<string> = new Set(),
): Promise<string | null> {
  const extension = IMAGE_EXTENSIONS.get(attachment.mediaType);
  if (!extension || !SHA256.test(attachment.hash)) return null;
  try {
    const source = join(await attachmentDirectory(dshHome, attachment.hash, signal), attachment.hash);
    const { bytes, entry } = await readImageFile(source, signal);
    if (createHash("sha256").update(bytes).digest("hex") !== attachment.hash ||
      !matchesFormat(bytes, extension)) return null;
    signal.throwIfAborted();
    const cache = await resolveCache(signal);
    const target = join(cache, `${attachment.hash}.${extension}`);
    const release = await lockCache(cache, signal);
    try {
      signal.throwIfAborted();
      // A concurrent replay may have published it while we validated the source.
      const existing = await readImageFile(target, signal, true).catch(() => null);
      signal.throwIfAborted();
      if (!sameFile(entry, await lstat(source, { bigint: true }))) return null;
      signal.throwIfAborted();
      if (existing?.bytes.equals(bytes)) {
        const now = new Date();
        await utimes(target, now, now);
        signal.throwIfAborted();
        return target;
      }
      if (!await makeCacheRoom(cache, target, bytes.length, pinned, signal)) return null;
      const staging = join(cache, ".preview.tmp");
      try {
        signal.throwIfAborted();
        await writeFile(staging, bytes, { flag: "wx", mode: 0o600, signal });
        signal.throwIfAborted();
        await rename(staging, target);
        if (signal.aborted) {
          await unlink(target);
          return null;
        }
        return target;
      } finally {
        await rm(staging, { force: true }).catch(() => undefined);
      }
    } finally {
      await release();
    }
  } catch {
    // Attachment and cache failures must never discard the text transcript.
    return null;
  }
}

async function attachmentDirectory(home: string, hash: string, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  let directory = await realpath(home);
  await checkAncestors(directory, signal);
  for (const part of ["attachments", "v1", "objects", hash.slice(0, 2)]) {
    directory = join(directory, part);
    await checkDirectory(directory, signal, false);
  }
  return directory;
}

async function resolveCache(signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();
  const home = await realpath(homedir());
  await checkAncestors(home, signal);
  const cache = join(home, CACHE_DIRECTORY);
  signal.throwIfAborted();
  await mkdir(cache, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "EEXIST") throw error;
  });
  await checkDirectory(cache, signal, true);
  return cache;
}

async function checkAncestors(path: string, signal: AbortSignal): Promise<void> {
  for (let directory = path; ; directory = dirname(directory)) {
    await checkDirectory(directory, signal, false, directory !== path);
    if (dirname(directory) === directory) return;
  }
}

async function checkDirectory(
  path: string, signal: AbortSignal, privateDirectory: boolean, ancestor = false,
): Promise<void> {
  signal.throwIfAborted();
  const info = await lstat(path);
  const stickyAncestor = ancestor && (info.mode & 0o1000) !== 0;
  if (!info.isDirectory() || (uid !== undefined && (
    (info.uid !== uid && !(ancestor && info.uid === 0)) ||
    (!stickyAncestor && (info.mode & (privateDirectory ? 0o077 : 0o022)) !== 0)
  ))) throw new Error("Unsafe image directory");
}

async function readImageFile(
  path: string, signal: AbortSignal, privateFile = false,
): Promise<{ bytes: Buffer; entry: BigIntStats }> {
  signal.throwIfAborted();
  const entry = await lstat(path, { bigint: true });
  if (!entry.isFile() || entry.size < 1n || entry.size > MAX_IMAGE_BYTES ||
    (privateFile && uid !== undefined && (entry.uid !== BigInt(uid) || (entry.mode & 0o077n) !== 0n))) {
    throw new Error("Invalid image file");
  }
  signal.throwIfAborted();
  if (relative(path, await realpath(path)) !== "") throw new Error("Image path changed");
  signal.throwIfAborted();
  const handle = await open(path, READ_FLAGS);
  try {
    signal.throwIfAborted();
    if (!sameFile(entry, await handle.stat({ bigint: true }))) throw new Error("Image file changed");
    const bytes = Buffer.alloc(Number(entry.size));
    let offset = 0;
    while (offset < bytes.length) {
      signal.throwIfAborted();
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (!bytesRead) throw new Error("Image file changed");
      offset += bytesRead;
    }
    signal.throwIfAborted();
    if (!sameFile(entry, await lstat(path, { bigint: true }))) throw new Error("Image file changed");
    return { bytes, entry };
  } finally {
    await handle.close();
  }
}

function sameFile(before: BigIntStats, after: BigIntStats): boolean {
  return after.isFile() && before.dev === after.dev && before.ino === after.ino &&
    before.size === after.size && before.mtimeNs === after.mtimeNs && before.ctimeNs === after.ctimeNs;
}

function matchesFormat(bytes: Buffer, extension: string): boolean {
  switch (extension) {
    case "png": return bytes.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"));
    case "jpg": return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    case "gif": return ["GIF87a", "GIF89a"].includes(bytes.toString("ascii", 0, 6));
    case "webp": return bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    default: return false;
  }
}

/** Serialize admission even when two daemons use the same OS profile. */
async function lockCache(cache: string, signal: AbortSignal): Promise<() => Promise<void>> {
  const lock = join(cache, ".lock");
  const owner = `${process.pid}-${randomUUID()}`;
  const candidate = join(cache, `.lock-${owner}`);
  signal.throwIfAborted();
  await mkdir(candidate, { mode: 0o700 });
  try {
    signal.throwIfAborted();
    await writeFile(join(candidate, owner), "", { flag: "wx", mode: 0o600, signal });
    for (;;) {
      signal.throwIfAborted();
      try {
        // A nonempty directory cannot replace another nonempty directory.
        await rename(candidate, lock);
        return () => releaseCacheLock(lock, owner);
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code;
        if (code !== "EEXIST" && code !== "ENOTEMPTY" &&
          !(process.platform === "win32" && (code === "EPERM" || code === "EACCES"))) throw error;
        signal.throwIfAborted();
        const owners = await readdir(lock).catch((readError: NodeJS.ErrnoException) => {
          if (readError.code === "ENOENT") return [];
          throw readError;
        });
        signal.throwIfAborted();
        if (owners.length === 0) await rmdir(lock).catch(() => undefined);
        if (owners.length === 1 && ownerExited(owners[0])) await releaseCacheLock(lock, owners[0]);
        await wait(10, undefined, { signal });
      }
    }
  } finally {
    await rm(candidate, { recursive: true, force: true }).catch(() => undefined);
  }
}

function ownerExited(owner: string): boolean {
  const match = /^([1-9]\d*)-[0-9a-f-]{36}$/.exec(owner);
  if (!match) return false;
  try {
    process.kill(Number(match[1]), 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH";
  }
}

async function releaseCacheLock(lock: string, owner: string): Promise<void> {
  // Only remove our own marker. rmdir cannot remove a successor's nonempty lock.
  await unlink(join(lock, owner)).catch(() => undefined);
  await rmdir(lock).catch(() => undefined);
}

async function makeCacheRoom(
  cache: string, target: string, size: number, pinned: ReadonlySet<string>, signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();
  await rm(join(cache, ".preview.tmp"), { force: true });
  signal.throwIfAborted();
  const names = await readdir(cache);
  const entries: { path: string; size: number; mtime: number }[] = [];
  const expiry = Date.now() - EXPIRY_MS;
  let total = 0;
  for (const name of names) {
    signal.throwIfAborted();
    if (name.startsWith(".lock-") && ownerExited(name.slice(".lock-".length))) {
      await rm(join(cache, name), { recursive: true, force: true });
    }
    if (!PREVIEW_FILE.test(name)) continue;
    const path = join(cache, name);
    const info = await lstat(path);
    signal.throwIfAborted();
    if (path === target || !pinned.has(path) && (info.mtimeMs < expiry || !info.isFile())) {
      await unlink(path);
      continue;
    }
    entries.push({ path, size: info.size, mtime: info.mtimeMs });
    total += info.size;
  }
  let count = entries.length;
  for (const entry of entries.sort((a, b) => a.mtime - b.mtime)) {
    if (count < MAX_CACHE_FILES && total + size <= MAX_CACHE_BYTES) break;
    if (pinned.has(entry.path)) continue;
    signal.throwIfAborted();
    await unlink(entry.path);
    total -= entry.size;
    count--;
  }
  return count < MAX_CACHE_FILES && total + size <= MAX_CACHE_BYTES;
}

/** Markdown image that Paseo's chat renderer loads through its file API. */
export function dshImageMarkdown(path: string): string {
  return `\n\n![Image](${fileUri(path)})\n\n`;
}

export function fileUri(path: string): string {
  const windows = /^[A-Za-z]:[\\/]/.test(path) || path.startsWith("\\\\");
  return pathToFileURL(path, { windows }).href.replace(/\(/g, "%28").replace(/\)/g, "%29");
}
