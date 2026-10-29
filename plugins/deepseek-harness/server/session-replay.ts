import { open, opendir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { setImmediate as yieldLoop } from "node:timers/promises";
import { zstdDecompress } from "node:zlib";
import type { AcpStreamMessage } from "@getpaseo/plugin/server/acp";
import { resolveDshHome } from "./dsh-home";

const SESSION_FILE = "session.v4.jsonl.zstd";
const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_TEXT_BYTES = 64 * 1024 * 1024;
const MAX_RECORDS = 50_000;
const MAX_PROJECTS = 1_024;
const MAX_REPLAY_MS = 1_000;

// Known v4 bookkeeping, not transcript messages. Unknown event kinds fail the
// entire replay rather than displaying a possibly misleading partial history.
const BOOKKEEPING = new Set([
  "turn/start", "turn/end", "step/start", "step/end", "assistant/attempt",
  "request/header", "request/context", "session/end-seed", "session/title",
  "permission/preset", "sandbox/mode", "approval/policy", "agent/inbox/spliced",
  "session-log-deepseek/delivery-accepted", "job/registered", "job/settled",
  "goal/change", "system/message", "developer/message",
]);

export interface ReplayTarget {
  sessionId: string;
  cwd: string;
}

type RecordValue = Record<string, unknown>;

/** Best-effort v4 text history only; no writes, new sessions, or model calls. */
export async function buildSessionReplay(
  target: ReplayTarget,
  env: Readonly<Record<string, string | undefined>>,
): Promise<AcpStreamMessage[]> {
  const signal = AbortSignal.timeout(MAX_REPLAY_MS);
  try {
    return await Promise.race([
      readReplay(target, resolveDshHome(env.DSH_HOME), signal),
      new Promise<never>((_, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      }),
    ]);
  } catch {
    // An unsupported, missing, corrupt or oversized transcript must not turn a
    // successful resume into a failed load. Do not log conversation contents.
    return [];
  }
}

async function readReplay(
  target: ReplayTarget,
  home: string,
  signal: AbortSignal,
): Promise<AcpStreamMessage[]> {
  // DSH currently issues UUIDs. Refuse other path syntax rather than allowing
  // a session/load parameter to escape the sessions directory.
  if (!/^[A-Za-z0-9_-]+$/.test(target.sessionId)) return [];
  const root = join(home, "sessions");
  const projects = await opendir(root);
  let count = 0;
  for await (const project of projects) {
    signal.throwIfAborted();
    if (++count > MAX_PROJECTS) return [];
    if (!project.isDirectory()) continue;
    const directory = join(root, project.name, target.sessionId);
    let names: string[];
    try {
      names = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
    // A migrated session can retain older generations. Never replay stale v4
    // data when a newer generation exists beside it.
    if (names.some((name) => {
      const match = /^session\.v([1-9]\d*)\.jsonl(?:\.zstd)?$/.exec(name);
      return match !== null && Number(match[1]) > 4;
    })) return [];
    if (!names.includes(SESSION_FILE)) continue;
    const compressed = await readBounded(join(directory, SESSION_FILE), signal);
    const text = await decodeFrames(compressed, signal);
    const lines = text.split("\n");
    if (lines.pop() !== "" || lines.length > MAX_RECORDS) return [];
    const header = record(JSON.parse(lines[0]));
    if (header.type !== "session" || header.version !== 4) return [];
    if (header.id !== target.sessionId || header.cwd !== target.cwd) continue;
    const frames: AcpStreamMessage[] = [];
    for (let index = 1; index < lines.length; index++) {
      if (index % 256 === 0) await yieldLoop();
      signal.throwIfAborted();
      const event = record(JSON.parse(lines[index]));
      if (event.seq !== index - 1 || typeof event.time !== "number") {
        throw new Error("Unrecognised session event envelope");
      }
      for (const update of replayEvent(event)) {
        frames.push({
          jsonrpc: "2.0",
          method: "session/update",
          params: { sessionId: target.sessionId, update },
        });
        if (frames.length > MAX_RECORDS) return [];
      }
    }
    return frames;
  }
  return [];
}

async function readBounded(path: string, signal: AbortSignal): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    const before = await handle.stat();
    if (!before.isFile() || before.size > MAX_FILE_BYTES) throw new Error("Replay file limit");
    // A fixed buffer also bounds memory if the file grows after stat().
    const bytes = Buffer.alloc(before.size);
    let offset = 0;
    while (offset < bytes.length) {
      signal.throwIfAborted();
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) throw new Error("Incomplete replay file");
      offset += bytesRead;
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.mtimeMs !== before.mtimeMs) {
      throw new Error("Replay file changed while reading");
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function decodeFrames(input: Buffer, signal: AbortSignal): Promise<string> {
  const parts: Buffer[] = [];
  let offset = 0;
  let bytes = 0;
  while (offset < input.length) {
    signal.throwIfAborted();
    if (parts.length >= MAX_RECORDS || bytes >= MAX_TEXT_BYTES) throw new Error("Replay text limit");
    const remaining = input.subarray(offset);
    if (remaining.length < 4 || remaining.readUInt32LE(0) !== 0xfd2fb528) {
      throw new Error("Unrecognised Zstandard frame");
    }
    const length = frameLength(remaining);
    // DSH appends independent frames. Walk their headers instead of searching
    // payloads for magic bytes, which can also occur inside a valid frame.
    const decoded = await new Promise<Buffer>((resolve, reject) => {
      zstdDecompress(remaining.subarray(0, length), { maxOutputLength: MAX_TEXT_BYTES - bytes }, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
    signal.throwIfAborted();
    parts.push(decoded);
    bytes += decoded.length;
    offset += length;
  }
  return Buffer.concat(parts, bytes).toString("utf8");
}

/** RFC 8878 framing: require every block and optional checksum before decoding.
 * Node can return decoded bytes for a truncated last frame without an error. */
function frameLength(input: Buffer): number {
  if (input.length < 5) throw new Error("Incomplete Zstandard header");
  const flags = input[4];
  if (flags & 0x18) throw new Error("Reserved Zstandard header bits");
  const singleSegment = (flags & 0x20) !== 0;
  const contentSizeFlag = flags >>> 6;
  const dictionaryBytes = [0, 1, 2, 4][flags & 3];
  const contentSizeBytes = contentSizeFlag === 0 ? (singleSegment ? 1 : 0) : 2 ** contentSizeFlag;
  let end = 5 + (singleSegment ? 0 : 1) + dictionaryBytes + contentSizeBytes;
  for (;;) {
    if (end + 3 > input.length) throw new Error("Incomplete Zstandard block header");
    const block = input.readUIntLE(end, 3);
    const kind = (block >>> 1) & 3;
    const size = block >>> 3;
    if (kind === 3 || size > 128 * 1024) throw new Error("Invalid Zstandard block");
    end += 3 + (kind === 1 ? 1 : size);
    if (end > input.length) throw new Error("Incomplete Zstandard block");
    if (block & 1) break;
  }
  if (flags & 4) end += 4;
  if (end > input.length) throw new Error("Incomplete Zstandard checksum");
  return end;
}

function replayEvent(event: RecordValue): RecordValue[] {
  const data = record(event.data);
  if (typeof event.type !== "string") throw new Error("Missing event type");
  if (BOOKKEEPING.has(event.type)) return [];
  // Replacements change the model's surface rather than append conversation.
  // Until mapped explicitly, retain the empty-timeline fallback for these logs.
  if (event.surfaceOp !== undefined && event.surfaceOp !== "append") {
    throw new Error("Unsupported surface operation");
  }
  switch (event.type) {
    case "user/message": {
      const source = record(data.source);
      if (typeof source.kind !== "string") throw new Error("Missing user source");
      if (source.kind !== "user") return [];
      return textUpdates(data, "user_message_chunk");
    }
    case "assistant/message":
      return textUpdates(record(data.message), "agent_message_chunk");
    case "tool/call": {
      const args = string(data.arguments);
      let rawInput: unknown = args;
      try { rawInput = JSON.parse(args); } catch { /* Preserve invalid tool JSON as text. */ }
      return [{
        sessionUpdate: "tool_call", toolCallId: string(data.callId),
        title: string(data.name), kind: "other", status: "in_progress", rawInput,
      }];
    }
    case "tool/result": {
      const message = record(data.message);
      const content = blocks(message.content).map((block) => {
        if (block.type !== "text") throw new Error("Unsupported tool content");
        return { type: "content", content: { type: "text", text: string(block.text) } };
      });
      if (message.isError !== undefined && typeof message.isError !== "boolean") {
        throw new Error("Invalid tool status");
      }
      return [{
        sessionUpdate: "tool_call_update", toolCallId: string(message.toolCallId),
        status: message.isError ? "failed" : "completed", content, rawOutput: { content },
      }];
    }
    default:
      throw new Error("Unknown session event");
  }
}

function textUpdates(message: RecordValue, kind: string): RecordValue[] {
  const id = string(message.id);
  return blocks(message.content).flatMap((block, index) => {
    // The separate tool/call record owns this card.
    if (block.type === "tool-call" && kind === "agent_message_chunk") return [];
    const thought = block.type === "reasoning" && kind === "agent_message_chunk";
    if (block.type !== "text" && !thought) throw new Error("Unsupported message content");
    return [{
      sessionUpdate: thought ? "agent_thought_chunk" : kind,
      messageId: `replay:${id}:${index}`,
      content: { type: "text", text: string(block.text) },
    }];
  });
}

function record(value: unknown): RecordValue {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Expected an object");
  }
  return value as RecordValue;
}

function string(value: unknown): string {
  if (typeof value !== "string") throw new Error("Expected a string");
  return value;
}

function blocks(value: unknown): RecordValue[] {
  if (!Array.isArray(value)) throw new Error("Expected content blocks");
  return value.map(record);
}
