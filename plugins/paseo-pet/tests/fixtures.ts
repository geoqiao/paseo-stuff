import { deflateSync } from "node:zlib";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { crc32 } from "../server/images";
import { animations } from "../shared/animation";

export function pngChunk(kind: string, data: Buffer): Buffer {
  const chunk = Buffer.alloc(data.length + 12);
  chunk.writeUInt32BE(data.length, 0); chunk.write(kind, 4, "ascii"); data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, chunk.length - 4)), chunk.length - 4);
  return chunk;
}
/** Original geometric fixture, not a copied Codex character. */
export function makeAtlas(version = 2): Buffer {
  const width = 1536, height = version === 2 ? 2288 : 1872;
  const pixels = Buffer.alloc((width * 4 + 1) * height);
  const counts = Object.values(animations).map((entry) => entry.durations.length);
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / 208), localY = y % 208;
    for (let x = 0; x < width; x++) {
      const column = Math.floor(x / 192), cx = 96 + (column % 3 - 1) * 3, localX = x % 192;
      if (row < 9 && column >= counts[row]) continue;
      const body = (localX - cx) ** 2 / 2500 + (localY - 126) ** 2 / 3025 < 1;
      const eye = localY >= 108 && localY < 117 && (Math.abs(localX - (cx - 17)) < 4 || Math.abs(localX - (cx + 17)) < 4);
      if (!body) continue;
      const i = y * (width * 4 + 1) + 1 + x * 4;
      pixels[i] = eye ? 30 : 120 + row * 8; pixels[i + 1] = eye ? 40 : 165; pixels[i + 2] = eye ? 50 : 190; pixels[i + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), pngChunk("IHDR", header), pngChunk("IDAT", deflateSync(pixels)), pngChunk("IEND", Buffer.alloc(0))]);
}
export function webpHeader(width = 1536, height = 2288): Buffer {
  // Structurally valid lossless dimensions; intentionally not a decodable picture.
  const image = Buffer.alloc(6);
  image[0] = 0x2f; image.writeUInt32LE(((height - 1) << 14) | (width - 1), 1);
  const bytes = Buffer.alloc(26);
  bytes.write("RIFF", 0); bytes.writeUInt32LE(18, 4); bytes.write("WEBPVP8L", 8); bytes.writeUInt32LE(6, 16); image.copy(bytes, 20);
  // inspectImage requires 30 header bytes, as valid real WebP includes a longer stream.
  const padded = Buffer.concat([bytes, Buffer.alloc(4)]);
  padded.writeUInt32LE(22, 4); padded.writeUInt32LE(10, 16);
  return padded;
}
export async function writePet(root: string, key: string, atlas: Buffer, extra: Record<string, unknown> = {}) {
  const folder = path.join(root, key);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "pet.json"), JSON.stringify({
    id: key, displayName: key, description: "Synthetic geometry test pet",
    spriteVersionNumber: 2, spritesheetPath: "spritesheet.png", ...extra,
  }));
  await writeFile(path.join(folder, String(extra.spritesheetPath ?? "spritesheet.png")), atlas);
  return folder;
}
