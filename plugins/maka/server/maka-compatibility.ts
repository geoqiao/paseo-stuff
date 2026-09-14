import { spawn, type ChildProcess } from "node:child_process";
import { Readable, Writable } from "node:stream";
import { ndJsonStream } from "@agentclientprotocol/sdk";
import type {
  AcpStream,
  AcpStreamMessage,
} from "@getpaseo/plugin/server/acp";

export const MAKA_DEFAULT_MODEL_ID = "maka-configured-default";

const STARTUP_TIMEOUT_MS = 5_000;
const SHUTDOWN_SIGNAL_TIMEOUT_MS = 1_000;
const STDERR_CAPTURE_LIMIT = 8_192;
const DIAGNOSTIC_LIMIT = 1_600;
const ANSI_ESCAPE_RE = new RegExp(
  String.fromCharCode(27) + "\\[[0-?]*[ -/]*[@-~]",
  "g",
);

export interface ConnectorResource {
  close(reason?: unknown): Promise<void>;
}

export interface MakaConnectorContext {
  cwd: string;
  env: Readonly<Record<string, string>>;
  hasMcpServers: boolean;
  resources: Set<ConnectorResource>;
  isClosed?: () => boolean;
}

export type MakaCommand = readonly [string, ...string[]];

interface RecordValue {
  [key: string]: unknown;
}

interface AcpStreamOwner {
  close(reason?: unknown): Promise<void>;
  endInput(): void;
  markGracefulExit(): void;
  onFailure(listener: (error: Error) => void): () => void;
}

interface ManagedAcpStream extends AcpStream {
  close(reason?: unknown): Promise<void>;
}

export async function createMakaAcpStream(
  context: MakaConnectorContext,
  command: MakaCommand,
): Promise<AcpStream> {
  assertConnectorOpen(context, "before starting");

  const executable = command[0];
  const args = command.slice(1);
  const cwd = context.cwd || process.cwd();
  const env = mergedEnvironment(context.env);
  const child = spawn(executable, args, {
    cwd,
    env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const stderr = new BoundedCapture(STDERR_CAPTURE_LIMIT);
  const owner = new ChildProcessOwner(child, executable, () => stderr.value);
  child.stderr?.on("data", (chunk: unknown) => stderr.append(chunk));
  // Subscribe before any await: Node can emit spawn on its next-tick queue
  // before resource registration resumes in the desktop plugin runtime.
  const spawned = waitForChildSpawn(child, STARTUP_TIMEOUT_MS);
  void spawned.catch(() => undefined);

  let managed: ManagedAcpStream | undefined;
  let resource: ConnectorResource | undefined;

  try {
    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new Error(
        "MaKa ACP could not acquire piped stdio for executable " + executable,
      );
    }

    const raw = ndJsonStream(
      Writable.toWeb(child.stdin),
      Readable.toWeb(child.stdout),
    ) as unknown as AcpStream;
    managed = createMakaCompatibilityStream(
      raw,
      owner,
      context,
      () => {
        if (resource) {
          context.resources.delete(resource);
        }
      },
    );
    resource = {
      close: (reason) => managed!.close(reason),
    };

    await registerConnectorResource(context, resource, "ACP startup");
    await spawned;
    assertConnectorOpen(context, "after startup");
    if (owner.hasExited) {
      throw new Error(
        "MaKa ACP exited during startup." + diagnosticSuffix(stderr.value),
      );
    }
    return managed;
  } catch (error) {
    const startupError = new Error(
      "MaKa ACP failed to start " +
        executable +
        "." +
        diagnosticSuffix(asError(error).message, "cause") +
        diagnosticSuffix(stderr.value),
      { cause: error },
    );
    await managed?.close(startupError).catch(() => undefined);
    if (!managed) {
      await owner.close(startupError).catch(() => undefined);
    }
    throw startupError;
  }
}

function createMakaCompatibilityStream(
  source: AcpStream,
  owner: AcpStreamOwner & { hasExited?: boolean },
  context: MakaConnectorContext,
  onClosed: () => void,
): ManagedAcpStream {
  const reader = source.readable.getReader();
  const writer = source.writable.getWriter();
  const configResponseKinds = new Map<string, "new" | "config">();
  let latestConfigOptions: unknown[] | undefined;
  let readableController:
    | ReadableStreamDefaultController<AcpStreamMessage>
    | undefined;
  let closed = false;
  let failed = false;
  let closePromise: Promise<void> | undefined;

  const unsubscribeFailure = owner.onFailure((error) => {
    fail(error);
  });

  let transportClosePromise: Promise<void> | undefined;

  const gracefulTransportClose = (reason?: unknown): Promise<void> => {
    if (transportClosePromise) {
      return transportClosePromise;
    }
    closed = true;
    owner.markGracefulExit();
    owner.endInput();
    transportClosePromise = (async () => {
      await Promise.allSettled([reader.cancel(reason), writer.close()]);
    })();
    return transportClosePromise;
  };

  const close = (reason?: unknown): Promise<void> => {
    if (closePromise) {
      return closePromise;
    }
    closePromise = (async () => {
      await gracefulTransportClose(reason);
      const ownerResult = await Promise.allSettled([owner.close(reason)]);
      unsubscribeFailure();
      onClosed();

      if (ownerResult[0]?.status === "rejected") {
        throw asError(ownerResult[0].reason);
      }
    })();
    return closePromise;
  };

  function fail(error: unknown): void {
    if (closed) {
      return;
    }
    failed = true;
    const normalized = asError(error);
    try {
      readableController?.error(normalized);
    } catch {
      // The consumer may already have terminated the readable side.
    }
    void close(normalized).catch(() => undefined);
  }

  const readable = new ReadableStream<AcpStreamMessage>({
    start(controller) {
      readableController = controller;
    },
    async pull(controller) {
      try {
        const next = await reader.read();
        if (next.done) {
          await close(new Error("MaKa ACP stdio reached EOF"));
          if (!failed) {
            controller.close();
          }
          return;
        }
        controller.enqueue(transformInbound(next.value as AcpStreamMessage));
      } catch (error) {
        fail(error);
      }
    },
    cancel(reason) {
      return gracefulTransportClose(reason);
    },
  });

  const writable = new WritableStream<AcpStreamMessage>({
    async write(message) {
      try {
        if (closed) {
          throw new Error("MaKa ACP stream is closed");
        }
        await writer.write(transformOutbound(message));
      } catch (error) {
        fail(error);
        throw error;
      }
    },
    close() {
      return gracefulTransportClose(
        new Error("MaKa ACP stdio writable closed"),
      );
    },
    abort(reason) {
      return close(reason);
    },
  });

  return { readable, writable, close };

  function transformOutbound(message: AcpStreamMessage): AcpStreamMessage {
    if (!isRequestFrame(message)) {
      return message;
    }

    if (
      message.method === "session/new" ||
      message.method === "session/set_config_option"
    ) {
      configResponseKinds.set(
        rpcIdKey(message.id),
        message.method === "session/new" ? "new" : "config",
      );
    }

    if (
      context.hasMcpServers &&
      (message.method === "session/new" || message.method === "session/load") &&
      isRecord(message.params)
    ) {
      return {
        ...message,
        params: {
          ...message.params,
          mcpServers: [],
        },
      } as AcpStreamMessage;
    }

    return message;
  }

  function transformInbound(message: AcpStreamMessage): AcpStreamMessage {
    if (
      isNotificationFrame(message) &&
      message.method === "session/update" &&
      isRecord(message.params) &&
      isRecord(message.params.update) &&
      typeof message.params.update.messageId === "string" &&
      (message.params.update.sessionUpdate === "agent_message_chunk" ||
        message.params.update.sessionUpdate === "agent_thought_chunk")
    ) {
      // MaKa identifies the assistant message across both channels; Paseo's
      // ACP shim accumulates text by ID alone. Use disjoint, reversible IDs
      // so interleaved thinking and answer chunks cannot contaminate each other.
      const update = message.params.update;
      const channel = update.sessionUpdate === "agent_thought_chunk" ? "thinking" : "text";
      return {
        ...message,
        params: {
          ...message.params,
          update: { ...update, messageId: `maka:${channel}:${update.messageId}` },
        },
      } as AcpStreamMessage;
    }
    return projectDefaultModel(message);
  }

  function projectDefaultModel(message: AcpStreamMessage): AcpStreamMessage {
    if (
      isResponseFrame(message) &&
      configResponseKinds.has(rpcIdKey(message.id))
    ) {
      const requestKind = configResponseKinds.get(rpcIdKey(message.id));
      configResponseKinds.delete(rpcIdKey(message.id));
      if (!isRecord(message.result)) {
        return message;
      }
      const options = configOptionsFrom(message.result.configOptions);
      const baseOptions =
        options ??
        (requestKind === "new" && typeof message.result.sessionId === "string"
          ? []
          : latestConfigOptions);
      const projected = withDefaultModel(baseOptions);
      if (!projected) {
        return message;
      }
      latestConfigOptions = projected;
      return {
        ...message,
        result: {
          ...message.result,
          configOptions: projected,
        },
      } as AcpStreamMessage;
    }

    if (
      isNotificationFrame(message) &&
      message.method === "session/update" &&
      isRecord(message.params) &&
      isRecord(message.params.update) &&
      message.params.update.sessionUpdate === "config_option_update"
    ) {
      const options = configOptionsFrom(message.params.update.configOptions);
      const projected = withDefaultModel(options);
      if (!projected) {
        return message;
      }
      latestConfigOptions = projected;
      return {
        ...message,
        params: {
          ...message.params,
          update: {
            ...message.params.update,
            configOptions: projected,
          },
        },
      } as AcpStreamMessage;
    }

    return message;
  }
}

function configOptionsFrom(value: unknown): unknown[] | undefined {
  return Array.isArray(value) ? value : undefined;
}

function withDefaultModel(
  options: unknown[] | undefined,
): unknown[] | undefined {
  if (!options) {
    return undefined;
  }
  if (
    options.some(
      (option) => isRecord(option) && option.category === "model",
    )
  ) {
    return options;
  }
  return [
    ...options,
    {
      id: "maka-model",
      name: "Model",
      description: "MaKa uses the model configured by its official setup.",
      category: "model",
      type: "select",
      currentValue: MAKA_DEFAULT_MODEL_ID,
      options: [
        {
          value: MAKA_DEFAULT_MODEL_ID,
          name: "MaKa configured default",
        },
      ],
    },
  ];
}

class ChildProcessOwner implements AcpStreamOwner {
  hasExited = false;
  private gracefulExitExpected = false;
  private closePromise: Promise<void> | undefined;
  private closed = false;
  private failureReported = false;
  private readonly failureListeners = new Set<(error: Error) => void>();

  constructor(
    private readonly child: ChildProcess,
    private readonly executable: string,
    private readonly getStderr: () => string,
  ) {
    child.once("error", (error) => {
      this.notifyFailure(error);
    });
    child.once("close", () => {
      this.hasExited = true;
      if (!this.closed && !this.gracefulExitExpected) {
        this.notifyFailure(
          new Error(
            `MaKa ACP process exited unexpectedly.${diagnosticSuffix(this.getStderr())}`,
          ),
        );
      }
    });
  }

  onFailure(listener: (error: Error) => void): () => void {
    this.failureListeners.add(listener);
    return () => this.failureListeners.delete(listener);
  }

  markGracefulExit(): void {
    this.gracefulExitExpected = true;
  }

  endInput(): void {
    const input = this.child.stdin;
    if (input && !input.destroyed && !input.writableEnded) {
      input.end();
    }
  }

  close(_reason?: unknown): Promise<void> {
    if (this.closePromise) {
      return this.closePromise;
    }
    this.closed = true;
    this.closePromise = this.terminate();
    return this.closePromise;
  }

  private async terminate(): Promise<void> {
    if (this.child.exitCode !== null || this.child.signalCode !== null) {
      return;
    }

    const exited = waitForChildClose(this.child);
    if (await settlesWithin(exited, SHUTDOWN_SIGNAL_TIMEOUT_MS * 5)) {
      return;
    }
    try {
      this.child.kill("SIGTERM");
    } catch {
      return;
    }
    if (await settlesWithin(exited, SHUTDOWN_SIGNAL_TIMEOUT_MS)) {
      return;
    }

    try {
      this.child.kill("SIGKILL");
    } catch {
      return;
    }
    if (!(await settlesWithin(exited, SHUTDOWN_SIGNAL_TIMEOUT_MS))) {
      throw new Error(
        `MaKa ACP executable ${this.executable} did not terminate after SIGKILL`,
      );
    }
  }

  private notifyFailure(error: unknown): void {
    if (this.closed || this.failureReported) {
      return;
    }
    this.failureReported = true;
    const normalized = asError(error);
    for (const listener of this.failureListeners) {
      listener(normalized);
    }
  }
}

class BoundedCapture {
  private chunks: string[] = [];
  private size = 0;

  constructor(private readonly limit: number) {}

  get value(): string {
    return this.chunks.join("");
  }

  append(chunk: unknown): void {
    if (this.size >= this.limit) {
      return;
    }
    const text = Buffer.isBuffer(chunk)
      ? chunk.toString("utf8")
      : String(chunk);
    const remaining = this.limit - this.size;
    const bounded = text.slice(0, remaining);
    this.chunks.push(bounded);
    this.size += bounded.length;
  }
}

async function registerConnectorResource(
  context: MakaConnectorContext,
  resource: ConnectorResource,
  operation: string,
): Promise<void> {
  assertConnectorOpen(context, `registering ${operation}`);
  context.resources.add(resource);
  if (context.isClosed?.()) {
    context.resources.delete(resource);
    await resource.close(new Error(`MaKa ACP connector closed during ${operation}`));
    throw new Error(`MaKa ACP connector closed during ${operation}`);
  }
}

function assertConnectorOpen(
  context: MakaConnectorContext,
  phase: string,
): void {
  if (context.isClosed?.()) {
    throw new Error(`MaKa ACP connector was closed ${phase}`);
  }
}

function mergedEnvironment(
  overrides: Readonly<Record<string, string>>,
): Record<string, string> {
  const environment: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      environment[key] = value;
    }
  }
  Object.assign(environment, overrides);
  return environment;
}

function waitForChildSpawn(
  child: ChildProcess,
  timeoutMs: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      child.off("spawn", onSpawn);
      child.off("error", onError);
      child.off("close", onClose);
      if (timer) {
        clearTimeout(timer);
      }
    };
    const onSpawn = () => {
      cleanup();
      resolve();
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const onClose = () => {
      cleanup();
      reject(new Error("MaKa ACP process closed before startup completed"));
    };
    child.once("spawn", onSpawn);
    child.once("error", onError);
    child.once("close", onClose);
    timer = setTimeout(() => {
      cleanup();
      reject(new Error("MaKa ACP process did not spawn before the startup deadline"));
    }, timeoutMs);
  });
}

function waitForChildClose(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise((resolve) => child.once("close", () => resolve()));
}

async function settlesWithin(
  promise: Promise<void>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<false>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
  });
  try {
    return await Promise.race([promise.then(() => true), timeout]);
  } catch {
    return false;
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function diagnosticSuffix(stderr: string, label = "stderr"): string {
  const value = stderr
    .replace(ANSI_ESCAPE_RE, "")
    .replace(
      /(["']?(?:api[ _-]?key|authorization|bearer|token|secret|password|cookie)["']?\s*[:=]\s*)(?:Bearer\s+)?(?:"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|[^\s,;]+)/gi,
      "$1[redacted]",
    )
    .replace(/(Bearer\s+)[^\s]+/gi, "$1[redacted]")
    .trim()
    .slice(0, DIAGNOSTIC_LIMIT);
  return value ? ` ${label}: ${value}` : "";
}

function isRequestFrame(
  value: AcpStreamMessage,
): value is AcpStreamMessage & {
  method: string;
  id: string | number | null;
  params?: unknown;
} {
  const record = value as unknown as RecordValue;
  return (
    isRecord(record) &&
    hasOwn(record, "method") &&
    hasOwn(record, "id") &&
    typeof record.method === "string" &&
    isRpcId(record.id)
  );
}

function isNotificationFrame(
  value: AcpStreamMessage,
): value is AcpStreamMessage & { method: string; params?: unknown } {
  const record = value as unknown as RecordValue;
  return (
    isRecord(record) &&
    hasOwn(record, "method") &&
    !hasOwn(record, "id") &&
    typeof record.method === "string"
  );
}

function isResponseFrame(
  value: AcpStreamMessage,
): value is AcpStreamMessage & {
  id: string | number | null;
  result?: unknown;
  error?: unknown;
} {
  const record = value as unknown as RecordValue;
  return (
    isRecord(record) &&
    !hasOwn(record, "method") &&
    hasOwn(record, "id") &&
    isRpcId(record.id) &&
    hasOwn(record, "result")
  );
}

function isRpcId(value: unknown): value is string | number | null {
  return (
    value === null ||
    typeof value === "string" ||
    (typeof value === "number" && Number.isFinite(value))
  );
}

function rpcIdKey(value: string | number | null): string {
  return `${typeof value}:${String(value)}`;
}

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: RecordValue, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}
