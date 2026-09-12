import { constants, type Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import path from "node:path";

export function inside(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith(".." + path.sep) && relative !== ".." && !path.isAbsolute(relative));
}
export function relativeParts(value: string): string[] {
  if (!value || path.isAbsolute(value) || /[\\:]/.test(value) || Array.from(value).some((char) => char.charCodeAt(0) < 32)) throw new Error("Atlas path must stay inside its pet package.");
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) throw new Error("Atlas path must stay inside its pet package.");
  return parts;
}
export async function canonicalRoot(input: string): Promise<string> {
  if (!path.isAbsolute(input) || input.includes("\0")) throw new Error("Choose an absolute pet folder on this host.");
  const root = await realpath(input);
  if (!(await lstat(root)).isDirectory()) throw new Error("The pet folder is not a directory.");
  return root;
}
async function assertPath(root: string, parts: string[]): Promise<string> {
  let target = root;
  for (let index = 0; index < parts.length; index++) {
    target = path.join(target, parts[index]);
    const stat = await lstat(target);
    if (stat.isSymbolicLink()) throw new Error("Symbolic links inside the pet folder are not supported.");
    if (index < parts.length - 1 && !stat.isDirectory()) throw new Error("Invalid package directory.");
  }
  if (!inside(root, await realpath(target))) throw new Error("Resource is outside the pet folder.");
  return target;
}
function sameFile(a: Stats, b: Stats): boolean {
  return a.dev === b.dev && a.ino === b.ino && a.size === b.size && a.mtimeMs === b.mtimeMs && a.ctimeMs === b.ctimeMs;
}
/** Bounded descriptor reads; no readFile on untrusted FIFO/device or growing files. */
export async function readBounded(root: string, parts: string[], maxBytes: number, headerOnly = false) {
  const target = await assertPath(root, parts);
  const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const before = await file.stat();
    if (!before.isFile() || before.size === 0 || before.size > maxBytes) {
      throw new Error("Resource must be a regular non-empty file within the size limit.");
    }
    const checked = await assertPath(root, parts);
    if (!sameFile(before, await lstat(checked))) throw new Error("Resource changed; refresh the pet list.");
    const bytes = Buffer.alloc(headerOnly ? Math.min(before.size, 64) : before.size);
    let count = 0;
    while (count < bytes.length) {
      const result = await file.read(bytes, count, bytes.length - count, count);
      if (!result.bytesRead) throw new Error("Resource changed; refresh the pet list.");
      count += result.bytesRead;
    }
    if (!sameFile(before, await file.stat()) || !sameFile(before, await lstat(await assertPath(root, parts)))) {
      throw new Error("Resource changed; refresh the pet list.");
    }
    return { bytes, stat: before };
  } finally {
    await file.close();
  }
}
