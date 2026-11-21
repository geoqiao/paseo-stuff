import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  dshImageMarkdown,
  fileUri,
  materializeDshImage,
  readDshImageAttachment,
} from "./image-attachments";

const imageBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const hash = createHash("sha256").update(imageBytes).digest("hex");

let home: string;
beforeEach(async () => { home = await mkdtemp(join(tmpdir(), "dsh-images-")); });
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

async function writeAttachment(): Promise<void> {
  const directory = join(home, "attachments", "v1", "objects", hash.slice(0, 2));
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, hash), imageBytes);
}

describe("DSH image attachments", () => {
  it("reads the reference carried by a v4 image block", () => {
    expect(readDshImageAttachment({
      attachmentId: `sha256:${hash}`,
      mediaType: "image/png",
    })).toEqual({ hash, mediaType: "image/png" });
  });

  it.each([
    ["missing", undefined],
    ["null", null],
    ["string", `sha256:${hash}`],
    ["unknown algorithm", { attachmentId: `md5:${hash}`, mediaType: "image/png" }],
    ["non-image media type", { attachmentId: `sha256:${hash}`, mediaType: "application/pdf" }],
    ["malformed hash", { attachmentId: "sha256:not-a-hash", mediaType: "image/png" }],
    ["missing media type", { attachmentId: `sha256:${hash}` }],
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

  it("renders a standalone markdown image with an encoded file URI", () => {
    expect(dshImageMarkdown("C:\\Users\\me\\AppData\\Local\\Temp\\paseo dsh\\a.png")).toBe(
      "\n\n![Image](file:///C:/Users/me/AppData/Local/Temp/paseo%20dsh/a.png)\n\n",
    );
    expect(fileUri("/tmp/a.png")).toBe("file:///tmp/a.png");
  });
});
