import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, rm, symlink, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listLibrary, loadAsset } from "./library";
import { inside, relativeParts } from "./files";
import { inspectImage, validateImage } from "./images";
import { MAX_ASSET_BYTES, MAX_MANIFEST_BYTES } from "../shared/contracts";
import { makeAtlas, pngChunk, webpHeader, writePet } from "../tests/fixtures";

let root: string, outside: string, png: Buffer, legacy: Buffer;
beforeAll(() => { png = makeAtlas(); legacy = makeAtlas(1); });
beforeEach(async () => { root = await mkdtemp(path.join(tmpdir(), "paseo-pet-test-")); outside = await mkdtemp(path.join(tmpdir(), "paseo-pet-outside-")); });
afterEach(async () => { await Promise.all([rm(root, { recursive: true, force: true }), rm(outside, { recursive: true, force: true })]); });
async function selected() { return (await listLibrary({ root })).pets[0]; }
async function loadFirst() { const pet = await selected(); return loadAsset({ root, key: pet.key, revision: pet.revision }); }

describe("read-only library", () => {
  it("lists and loads PNG v2 without modifying source; returns exactly the source bytes", async () => {
    const folder = await writePet(root, "pet", png);
    const before = await readFile(path.join(folder, "pet.json"));
    const asset = await loadFirst();
    expect(asset.pet.version).toBe(2);
    expect(Buffer.from(asset.uri.split(",")[1], "base64")).toEqual(png);
    expect(asset.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(await readFile(path.join(folder, "pet.json"))).toEqual(before);
  });
  it("imports v1 when the version is omitted", async () => {
    await writePet(root, "old", legacy, { spriteVersionNumber: undefined });
    expect((await loadFirst()).pet.version).toBe(1);
  });
  it("accepts WebP magic with version-compatible dimensions", async () => {
    const bytes = webpHeader();
    await writePet(root, "webp", bytes, { spritesheetPath: "spritesheet.webp" });
    expect((await loadFirst()).pet.mime).toBe("image/webp");
  });
  it("isolates invalid packages and does not collapse duplicate ids into one pet", async () => {
    await writePet(root, "one", png, { id: "same" });
    await writePet(root, "two", png, { id: "same" });
    await mkdir(path.join(root, "broken"));
    const result = await listLibrary({ root });
    expect(result.pets.map((pet) => pet.key)).toEqual(["one", "two"]);
    expect(result.issues).toHaveLength(1);
  });
  it("refuses stale resources and exposes a new revision after refresh", async () => {
    const folder = await writePet(root, "pet", png);
    const pet = await selected();
    const manifest = JSON.parse(await readFile(path.join(folder, "pet.json"), "utf8"));
    await writeFile(path.join(folder, "pet.json"), JSON.stringify({ ...manifest, description: "updated" }));
    await expect(loadAsset({ root, key: pet.key, revision: pet.revision })).rejects.toThrow("changed");
    expect((await selected()).revision).not.toBe(pet.revision);
  });
  it("rejects missing, malformed, oversized manifests, unknown versions and wrong dimensions", async () => {
    const invalid = [
      { spriteVersionNumber: 3 }, { spriteVersionNumber: undefined }, { id: "" },
    ];
    for (let i = 0; i < invalid.length; i++) await writePet(root, "invalid-" + i, png, invalid[i]);
    const malformed = await writePet(root, "malformed", png);
    await writeFile(path.join(malformed, "pet.json"), "{");
    const large = await writePet(root, "large", png);
    await writeFile(path.join(large, "pet.json"), " ".repeat(MAX_MANIFEST_BYTES + 1));
    expect((await listLibrary({ root })).pets).toEqual([]);
    expect((await listLibrary({ root })).issues).toHaveLength(5);
  });
  it("rejects oversized or truncated atlases before unbounded reads", async () => {
    const folder = await writePet(root, "huge", png);
    await truncate(path.join(folder, "spritesheet.png"), MAX_ASSET_BYTES + 1);
    await writePet(root, "truncated", Buffer.from("PNG"));
    expect((await listLibrary({ root })).pets).toEqual([]);
  });
  it("rejects symlink escapes at the package, manifest, intermediate directory and atlas", async () => {
    await writePet(outside, "secret", png);
    await symlink(path.join(outside, "secret"), path.join(root, "package"));
    const a = await writePet(root, "atlas", png);
    await rm(path.join(a, "spritesheet.png")); await symlink(path.join(outside, "secret/spritesheet.png"), path.join(a, "spritesheet.png"));
    const b = await writePet(root, "manifest", png);
    await rm(path.join(b, "pet.json")); await symlink(path.join(outside, "secret/pet.json"), path.join(b, "pet.json"));
    const c = await writePet(root, "nested", png);
    await symlink(path.join(outside, "secret"), path.join(c, "escape"));
    await writeFile(path.join(c, "pet.json"), JSON.stringify({ id: "nested", displayName: "Nested", spriteVersionNumber: 2, spritesheetPath: "escape/spritesheet.png" }));
    const result = await listLibrary({ root });
    expect(result.pets).toEqual([]); expect(result.issues).toHaveLength(4);
    expect(result.issues.every((issue) => issue.message.includes("Symbolic links"))).toBe(true);
  });
  it.each(["../secret.png", "/tmp/secret.png", "https://a/pet.png", "a\\b", "a//b", "a/./b", "a/\0b"])("rejects unsafe atlas path %j", (value) => {
    expect(() => relativeParts(value)).toThrow();
  });
  it("bounds directory scans and reports truncation", async () => {
    await Promise.all(Array.from({ length: 514 }, (_, i) => writeFile(path.join(root, "file-" + i), "")));
    expect((await listLibrary({ root })).truncated).toBe(true);
  });
  it("reports absent, relative and non-directory roots without exposing system error details", async () => {
    await expect(listLibrary({ root: path.join(root, "gone") })).rejects.toThrow("missing");
    await expect(listLibrary({ root: "~/.codex/pets" })).rejects.toThrow("absolute");
    const file = path.join(root, "file"); await writeFile(file, "test");
    await expect(listLibrary({ root: file })).rejects.toThrow("not a directory");
    expect(inside("/pets", "/pets-other/file")).toBe(false);
  });
});
describe("bounded static image validation", () => {
  it("validates full PNG containers and rejects CRC damage and animated PNG", () => {
    expect(validateImage(png, 2).mime).toBe("image/png");
    const corrupt = Buffer.from(png); corrupt[corrupt.length - 1] ^= 1;
    expect(() => validateImage(corrupt, 2)).toThrow();
    const animated = Buffer.concat([png.subarray(0, 33), pngChunk("acTL", Buffer.alloc(8)), png.subarray(33)]);
    expect(() => validateImage(animated, 2)).toThrow();
  });
  it("rejects magic, version dimensions, corrupted RIFF length and animated WebP", () => {
    expect(() => inspectImage(Buffer.alloc(64), 64, 2)).toThrow();
    expect(() => validateImage(png, 1)).toThrow("dimensions");
    const broken = webpHeader(); broken.writeUInt32LE(1, 4);
    expect(() => validateImage(broken, 2)).toThrow();
    const animated = Buffer.alloc(30); animated.write("RIFF"); animated.writeUInt32LE(22, 4); animated.write("WEBPVP8X", 8); animated.writeUInt32LE(10, 16); animated[20] = 2;
    expect(() => validateImage(animated, 2)).toThrow();
  });
});
