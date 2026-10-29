import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { zstdCompressSync } from "node:zlib";

/** Authored synthetic JSONL, compressed into several independent flush frames. */
export async function writeReplayFixture(
  home: string,
  sessionId = "synthetic-session",
  cwd = "/synthetic/workspace",
  edit: (rows: Record<string, any>[]) => void = () => undefined,
): Promise<string> {
  const text = await readFile(new URL("./fixtures/session-v4.jsonl", import.meta.url), "utf8");
  const rows = text.trim().split("\n").map((line) => JSON.parse(line));
  rows[0].id = sessionId;
  rows[0].cwd = cwd;
  edit(rows);
  const batches: Buffer[] = [];
  for (let index = 0; index < rows.length; index += 2) {
    batches.push(zstdCompressSync(Buffer.from(rows.slice(index, index + 2).map((row) => JSON.stringify(row) + "\n").join(""))));
  }
  const directory = join(home, "sessions", "synthetic-project", sessionId);
  await mkdir(directory, { recursive: true });
  const path = join(directory, "session.v4.jsonl.zstd");
  await writeFile(path, Buffer.concat(batches));
  return path;
}
