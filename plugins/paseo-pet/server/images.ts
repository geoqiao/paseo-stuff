import { CELL_HEIGHT, CELL_WIDTH, COLUMNS, type SpriteVersion } from "../shared/contracts";

const PNG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const fail = (): never => { throw new Error("Invalid or unsupported static PNG/WebP atlas."); };
export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function webpDimensions(kind: string, data: Buffer): { width: number; height: number } {
  if (kind === "VP8X") {
    if (data.length < 10 || (data[0] & 2)) fail(); // No independently animated WebP.
    return { width: data.readUIntLE(4, 3) + 1, height: data.readUIntLE(7, 3) + 1 };
  }
  if (kind === "VP8L") {
    if (data.length < 5 || data[0] !== 0x2f) fail();
    const bits = data.readUInt32LE(1);
    if (bits >>> 29) fail();
    return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
  }
  if (kind === "VP8 ") {
    if (data.length < 10 || data[3] !== 0x9d || data[4] !== 0x01 || data[5] !== 0x2a) fail();
    return { width: data.readUInt16LE(6) & 0x3fff, height: data.readUInt16LE(8) & 0x3fff };
  }
  return fail();
}
export function inspectImage(header: Buffer, totalBytes: number, version: SpriteVersion) {
  let width: number, height: number, mime: "image/png" | "image/webp";
  if (header.length >= 33 && header.subarray(0, 8).equals(PNG)) {
    if (header.readUInt32BE(8) !== 13 || header.toString("ascii", 12, 16) !== "IHDR"
      || crc32(header.subarray(12, 29)) !== header.readUInt32BE(29)) fail();
    width = header.readUInt32BE(16); height = header.readUInt32BE(20); mime = "image/png";
  } else if (header.length >= 30 && header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP") {
    if (header.readUInt32LE(4) + 8 !== totalBytes || header.readUInt32LE(16) + 20 > totalBytes) fail();
    ({ width, height } = webpDimensions(header.toString("ascii", 12, 16), header.subarray(20)));
    mime = "image/webp";
  } else return fail();
  if (width !== COLUMNS * CELL_WIDTH || height !== (version === 2 ? 11 : 9) * CELL_HEIGHT) {
    throw new Error("Atlas dimensions do not match Codex v" + version + " (1536 × " + (version === 2 ? 2288 : 1872) + ").");
  }
  return { width, height, mime };
}
/** Full container validation before returning bytes. Pixel decoding remains the client's job. */
export function validateImage(bytes: Buffer, version: SpriteVersion) {
  const info = inspectImage(bytes, bytes.length, version);
  if (info.mime === "image/png") {
    let offset = 8, imageData = false, ended = false;
    while (offset + 12 <= bytes.length) {
      const size = bytes.readUInt32BE(offset), end = offset + 12 + size;
      if (end > bytes.length) fail();
      const kind = bytes.toString("ascii", offset + 4, offset + 8);
      if (kind === "acTL" || (kind === "IHDR" && offset !== 8)) fail();
      if (crc32(bytes.subarray(offset + 4, end - 4)) !== bytes.readUInt32BE(end - 4)) fail();
      if (kind === "IDAT") imageData = true;
      if (kind === "IEND") {
        if (size !== 0 || end !== bytes.length) fail();
        ended = true;
      }
      offset = end;
    }
    if (!imageData || !ended || offset !== bytes.length) fail();
  } else {
    let offset = 12, images = 0;
    while (offset + 8 <= bytes.length) {
      const kind = bytes.toString("ascii", offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
      const end = offset + 8 + size;
      if (end > bytes.length || kind === "ANIM" || kind === "ANMF") fail();
      if (kind === "VP8 " || kind === "VP8L" || kind === "VP8X") {
        const dimensions = webpDimensions(kind, bytes.subarray(offset + 8, end));
        if (dimensions.width !== info.width || dimensions.height !== info.height) fail();
        if (kind !== "VP8X") images++;
      }
      offset = end + (size % 2);
    }
    if (images !== 1 || offset !== bytes.length) fail();
  }
  return info;
}
