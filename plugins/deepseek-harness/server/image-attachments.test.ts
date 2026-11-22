import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, stat, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dshImageMarkdown,
  fileUri,
  materializeDshImage,
  readDshImageAttachment,
} from "./image-attachments";

vi.mock("node:fs/promises", { spy: true });

const imageBytes = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1cAAAAASUVORK5CYII=", "base64",
);
const hash = createHash("sha256").update(imageBytes).digest("hex");

let home: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), "dsh-images-"));
  vi.stubEnv(process.platform === "win32" ? "USERPROFILE" : "HOME", home);
});
afterEach(async () => {
  vi.mocked(writeFile).mockRestore();
  vi.unstubAllEnvs();
  await rm(home, { recursive: true, force: true });
});

async function writeAttachment(bytes = imageBytes): Promise<string> {
  const directory = join(home, "attachments", "v1", "objects", hash.slice(0, 2));
  await mkdir(directory, { recursive: true });
  const path = join(directory, hash);
  await writeFile(path, bytes);
  return path;
}

const materialize = () => materializeDshImage({ hash, mediaType: "image/png" }, home);
const cacheDirectory = () => join(home, ".paseo-dsh-image-cache");

describe("DSH image attachments", () => {
  it("reads the reference carried by a v4 image block", () => {
    expect(readDshImageAttachment({
      attachmentId: `sha256:${hash}`,
      mediaType: "image/png",
    })).toEqual({ hash, mediaType: "image/png" });
  });

  it.each<[string, unknown]>([
    ["missing", undefined],
    ["null", null],
    ["string", `sha256:${hash}`],
    ["unknown algorithm", { attachmentId: `md5:${hash}`, mediaType: "image/png" }],
    ["non-image media type", { attachmentId: `sha256:${hash}`, mediaType: "application/pdf" }],
    ["malformed hash", { attachmentId: "sha256:not-a-hash", mediaType: "image/png" }],
    ["missing media type", { attachmentId: `sha256:${hash}` }],
    ...["image/bmp", "image/tiff", "image/avif", "image/svg+xml", "constructor"].map<[string, unknown]>((mediaType) =>
      [mediaType, { attachmentId: `sha256:${hash}`, mediaType }],
    ),
  ])("rejects a %s reference", (_label, value) => {
    expect(readDshImageAttachment(value)).toBeNull();
  });

  it("materializes the bytes beside an image extension and reuses the file", async () => {
    await writeAttachment();
    const first = await materializeDshImage({ hash, mediaType: "image/png" }, home);
    expect(first).not.toBeNull();
    expect(first!.replace(/\\/g, "/").endsWith(`/${hash}.png`)).toBe(true);
    expect(await readFile(first!)).toEqual(imageBytes);
    expect(await materializeDshImage({ hash, mediaType: "image/png" }, home)).toBe(first);
  });

  it("returns null when the attachment bytes are gone", async () => {
    expect(await materializeDshImage({ hash: "0".repeat(64), mediaType: "image/png" }, home)).toBeNull();
  });

  it("publishes one private copy for concurrent requests and requires a matching source", async () => {
    const source = await writeAttachment();
    const [first, second] = await Promise.all([materialize(), materialize()]);
    expect(first).not.toBeNull();
    expect(second).toBe(first);
    expect(await readdir(cacheDirectory())).toEqual([`${hash}.png`]);
    if (process.platform !== "win32") {
      expect((await stat(cacheDirectory())).mode & 0o777).toBe(0o700);
      expect((await stat(first!)).mode & 0o777).toBe(0o600);
    }
    await writeFile(source, Buffer.concat([imageBytes, Buffer.from([0])]));
    expect(await materialize()).toBeNull();
    expect(await readFile(first!)).toEqual(imageBytes);
    await rm(source);
    expect(await materialize()).toBeNull();
  });

  it("rejects attachment files over the individual byte limit without creating a cache", async () => {
    await truncate(await writeAttachment(), 8 * 1024 * 1024 + 1);
    expect(await materialize()).toBeNull();
    await expect(stat(cacheDirectory())).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("cleans the staged copy when a replay is aborted before publication", async () => {
    await writeAttachment();
    const abort = new AbortController();
    const fs = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
    vi.mocked(writeFile).mockImplementation(async (path, data, options) => {
      await fs.writeFile(path, data, options);
      if (typeof path === "string" && path.endsWith(".preview.tmp")) abort.abort();
    });
    expect(await materializeDshImage({ hash, mediaType: "image/png" }, home, abort.signal)).toBeNull();
    expect(abort.signal.aborted).toBe(true);
    expect(await readdir(cacheDirectory())).toEqual([]);
  });

  it("evicts expired and least recently used entries within the file count limit", async () => {
    await writeAttachment();
    await mkdir(cacheDirectory(), { mode: 0o700 });
    const existing = Array.from({ length: 129 }, (_, index) =>
      join(cacheDirectory(), `${index.toString(16).padStart(64, "0")}.png`));
    for (const path of existing) await writeFile(path, imageBytes, { mode: 0o600 });
    const expired = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    const leastRecent = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await utimes(existing[0], expired, expired);
    await utimes(existing[1], leastRecent, leastRecent);
    expect(await materialize()).not.toBeNull();
    expect(await readdir(cacheDirectory())).toHaveLength(128);
    for (const path of existing.slice(0, 2)) {
      await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
    }
  });

  it("evicts entries to make room within the total byte limit", async () => {
    await writeAttachment();
    await mkdir(cacheDirectory(), { mode: 0o700 });
    for (let index = 0; index < 8; index++) {
      const path = join(cacheDirectory(), `${index.toString(16).padStart(64, "0")}.png`);
      await writeFile(path, imageBytes, { mode: 0o600 });
      await truncate(path, 8 * 1024 * 1024);
    }
    expect(await materialize()).not.toBeNull();
    const names = await readdir(cacheDirectory());
    expect(names).toHaveLength(8);
    const sizes = await Promise.all(names.map(async (name) => (await stat(join(cacheDirectory(), name))).size));
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBe(56 * 1024 * 1024 + imageBytes.length);
  });

  it("renders a standalone markdown image with an encoded file URI", () => {
    expect(dshImageMarkdown("C:\\Users\\me\\AppData\\Local\\Temp\\paseo dsh\\a.png")).toBe(
      "\n\n![Image](file:///C:/Users/me/AppData/Local/Temp/paseo%20dsh/a.png)\n\n",
    );
    expect(fileUri("/tmp/a.png")).toBe("file:///tmp/a.png");
    expect(fileUri("C:\\Images\\a (b).png")).toBe("file:///C:/Images/a%20%28b%29.png");
    expect(fileUri("\\\\server\\share\\a.png")).toBe("file://server/share/a.png");
  });
});
