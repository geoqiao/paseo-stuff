import { randomUUID } from "node:crypto";
import { access, copyFile, link, mkdir, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Paseo previews a markdown image only when the file name carries an image
// extension, while DSH stores attachment bytes under a bare content hash.
const IMAGE_EXTENSIONS: Readonly<Record<string, string | undefined>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/bmp": "bmp",
  "image/tiff": "tiff",
  "image/avif": "avif",
};

const IMAGE_DIRECTORY = "paseo-dsh-images";

let imagesDirectory: Promise<string> | undefined;

function resolveImagesDirectory(): Promise<string> {
  imagesDirectory ??= mkdir(join(tmpdir(), IMAGE_DIRECTORY), { recursive: true })
    .then(() => join(tmpdir(), IMAGE_DIRECTORY))
    .catch((error) => {
      imagesDirectory = undefined;
      throw error;
    });
  return imagesDirectory;
}

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
  if (!/^[0-9a-f]{64}$/.test(hash)) return null;
  if (typeof mediaType !== "string" || IMAGE_EXTENSIONS[mediaType] === undefined) return null;
  return { hash, mediaType };
}

/**
 * Exposes an attachment as a cached file with an image extension. Hard links keep
 * the bytes in place; a staged copy covers homes on another volume. Returns null
 * when the attachment was pruned or cannot be read.
 */
export async function materializeDshImage(
  attachment: DshImageAttachment,
  dshHome: string,
): Promise<string | null> {
  const extension = IMAGE_EXTENSIONS[attachment.mediaType];
  if (extension === undefined) return null;
  const source = join(
    dshHome,
    "attachments",
    "v1",
    "objects",
    attachment.hash.slice(0, 2),
    attachment.hash,
  );
  const target = join(await resolveImagesDirectory(), `${attachment.hash}.${extension}`);
  try {
    await access(target);
    return target;
  } catch {
    // Not materialized for this content yet.
  }
  try {
    await link(source, target);
    return target;
  } catch {
    // Another volume or a filesystem without hard links.
  }
  // Stage the copy so a failed write cannot leave a truncated preview behind.
  const staging = `${target}.${randomUUID()}.tmp`;
  try {
    await copyFile(source, staging);
    await rename(staging, target);
    return target;
  } catch {
    await rm(staging, { force: true }).catch(() => undefined);
    return null;
  }
}

/** Markdown image that Paseo's chat renderer loads through its file API. */
export function dshImageMarkdown(path: string): string {
  return `\n\n![Image](${fileUri(path)})\n\n`;
}

export function fileUri(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const drive = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  if (drive) return `file:///${drive[1]}:/${encodePath(drive[2])}`;
  return `file:///${encodePath(normalized.replace(/^\/+/, ""))}`;
}

function encodePath(value: string): string {
  return value
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}
