import { mkdtemp, mkdir, readFile, realpath, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { PluginServerContext } from "@getpaseo/plugin/server";
import { runAcpProvider } from "@getpaseo/plugin/server/acp";
import {
  ProviderEventSchema,
  type ProviderConnection,
  type ProviderEvent,
  type ProviderInput,
  type ProviderMcpServerConfig,
} from "@getpaseo/plugin/server/provider";
import serverEntry from "../index.server";
import {
  createMakaProvider,
  type ManagedMakaProvider,
} from "./provider";
import { createMakaAcpStream, MAKA_DEFAULT_MODEL_ID, type ConnectorResource } from "./maka-compatibility";

const fakeMaka = fileURLToPath(
  new URL("../tests/fixtures/fake-maka.mjs", import.meta.url),
);
const command = [process.execPath, fakeMaka] as const;
const environmentKeys = [
  "MAKA_FAKE_HANG_INITIALIZE",
  "MAKA_FAKE_OMIT_CONFIG_OPTIONS",
  "MAKA_FAKE_SPAWN_LOG",
  "MAKA_TEST_MARKER",
];

let testRoot = "";
let cwdA = "";
let cwdB = "";
let spawnLog = "";
const originalEnvironment = new Map<string, string | undefined>();

beforeAll(async () => {
  for (const key of environmentKeys) {
    originalEnvironment.set(key, process.env[key]);
  }
  testRoot = await mkdtemp(join(tmpdir(), "paseo-maka-"));
  const rawCwdA = join(testRoot, "a");
  const rawCwdB = join(testRoot, "b");
  spawnLog = join(testRoot, "spawn.log");
  await Promise.all([mkdir(rawCwdA), mkdir(rawCwdB)]);
  cwdA = await realpath(rawCwdA);
  cwdB = await realpath(rawCwdB);
  process.env.MAKA_FAKE_SPAWN_LOG = spawnLog;
  delete process.env.MAKA_FAKE_HANG_INITIALIZE;
  delete process.env.MAKA_FAKE_OMIT_CONFIG_OPTIONS;
  delete process.env.MAKA_TEST_MARKER;
});

afterAll(async () => {
  for (const key of environmentKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  await rm(testRoot, { recursive: true, force: true });
});

describe.sequential("MaKa ACP provider", () => {
  it.each([0, -1, NaN, Infinity])(
    "rejects invalid close timeout %s before connecting",
    (closeTimeoutMs) => {
      expect(() => createMakaProvider({ closeTimeoutMs })).toThrow(
        "closeTimeoutMs must be positive",
      );
    },
  );

  it("observes process startup when called from an event-loop callback", async () => {
    const resources = new Set<ConnectorResource>();
    try {
      // Match a daemon IPC callback rather than Vitest's promise continuation:
      // Node's next-tick spawn event runs before the first await resumes.
      await new Promise<void>((resolve, reject) => {
        setImmediate(() => {
          void createMakaAcpStream({ cwd: cwdA, env: {}, hasMcpServers: false, resources }, command)
            .then(() => resolve(), reject);
        });
      });
      expect(resources.size).toBe(1);
    } finally {
      await Promise.all([...resources].map((resource) => resource.close()));
    }
  }, 8_000);

  it("registers a server-only provider with the native selector", async () => {
    const registerProvider = vi.fn();
    const cleanup = serverEntry({
      registerProvider,
    } as unknown as PluginServerContext);

    expect(registerProvider).toHaveBeenCalledOnce();
    const provider = registerProvider.mock.calls[0]?.[0];
    expect(provider).toMatchObject({ id: "maka", label: "MaKa" });
    expect(typeof provider?.connect).toBe("function");
    expect(typeof provider?.dispose).toBe("function");
    expect(typeof cleanup).toBe("function");
    await cleanup();
  });

  it("discovers selectors and hides native sessions without resume support", async () => {
    const nativeProvider = runAcpProvider({
      id: "native-session-list-probe",
      label: "Native session list probe",
      command,
    });
    const nativeConnection = await nativeProvider.connect(connectRequest());
    const nativeCollector = collect(nativeConnection);
    try {
      expect(nativeConnection.capabilities).toContain("session.list");
      await nativeConnection.send({
        type: "sessions",
        requestId: "native-sessions-1",
        cwd: testRoot,
      });
      const nativeSessions = await nativeCollector.waitFor(
        (event) =>
          event.type === "sessions" && event.requestId === "native-sessions-1",
      );
      expect(nativeSessions.type).toBe("sessions");
      if (nativeSessions.type === "sessions") {
        expect(nativeSessions.sessions).toHaveLength(1);
        expect(nativeSessions.sessions[0]?.title).toBe(
          "Native session without resume",
        );
      }
    } finally {
      nativeCollector.unsubscribe();
      await nativeConnection.close();
    }

    const { provider, connection } = await connected();
    const collector = collect(connection);
    try {
      expect(connection.capabilities).toContain("prompt.message");
      expect(connection.capabilities).toContain("session.configure");
      expect(connection.capabilities).not.toContain("prompt.command");
      expect(connection.capabilities).not.toContain("prompt.image");
      expect(connection.capabilities).not.toContain("prompt.steer");
      expect(connection.capabilities).not.toContain("permission");
      // The native ACP peer advertises a non-empty session/list result, but
      // MaKa cannot load those sessions. Do not offer unopenable imports to Paseo.
      expect(connection.capabilities).not.toContain("session.list");
      expect(connection.capabilities).not.toContain("session.persistence");

      await connection.send({
        type: "catalog",
        requestId: "catalog-1",
        cwd: testRoot,
      });
      const catalog = await collector.waitFor(
        (event) => event.type === "catalog" && event.requestId === "catalog-1",
      );
      if (catalog.type !== "catalog") {
        throw new Error("catalog event was not returned");
      }
      expect(catalog.catalog.defaultModel).toBe(MAKA_DEFAULT_MODEL_ID);
      expect(catalog.catalog.models).toEqual([
        expect.objectContaining({
          id: MAKA_DEFAULT_MODEL_ID,
          label: "MaKa configured default",
          defaultThinkingOptionId: "default",
          thinkingOptions: expect.arrayContaining([
            expect.objectContaining({ id: "default" }),
            expect.objectContaining({ id: "high" }),
          ]),
        }),
      ]);

      await expect(
        connection.send({
          type: "sessions",
          requestId: "sessions-1",
          cwd: testRoot,
        }),
      ).rejects.toThrow("persistent sessions are not importable");

      const open = openInput("selectors", cwdA, "selectors");
      await connection.send(open);
      const opened = await collector.waitFor(
        (event) =>
          event.type === "session.opened" && event.sessionId === open.sessionId,
      );
      expect(opened.type).toBe("session.opened");
      if (opened.type === "session.opened") {
        expect(opened.persistence).toBeUndefined();
        expect(opened.restoration).toBe("core");
        expect(opened.capabilities).not.toContain("prompt.command");
        expect(opened.capabilities).not.toContain("permission");
        expect(opened.capabilities).not.toContain("session.list");
        expect(opened.capabilities).not.toContain("session.persistence");
      }
      await collector.waitFor(
        (event) => event.type === "session.ready" && event.sessionId === open.sessionId,
      );
      const initialConfig = await collector.waitFor(
        (event) =>
          event.type === "session.config" && event.sessionId === open.sessionId,
      );
      expect(initialConfig.type).toBe("session.config");
      if (initialConfig.type === "session.config") {
        expect(initialConfig.config.model).toBe(MAKA_DEFAULT_MODEL_ID);
        expect(initialConfig.config.models).toEqual([
          expect.objectContaining({ id: MAKA_DEFAULT_MODEL_ID }),
        ]);
        expect(initialConfig.config.thinkingOption).toBe("default");
        expect(initialConfig.config.modes).toEqual([]);
        expect(settingValue(initialConfig, "permission_mode")).toBe("ask");
        expect(settingValue(initialConfig, "collaboration_mode")).toBe("agent");
        expect(settingValue(initialConfig, "orchestration_mode")).toBe("default");
      }

      await connection.send({
        type: "session.configure",
        requestId: "configure-1",
        sessionId: open.sessionId,
        changes: {
          model: MAKA_DEFAULT_MODEL_ID,
          mode: "plan",
          thinkingOption: "high",
          settings: {
            permission_mode: "ask",
            orchestration_mode: "graph",
          },
        },
      });
      await collector.waitFor(
        (event) =>
          event.type === "request.completed" && event.requestId === "configure-1",
      );
      const configured = await collector.waitFor(
        (event) =>
          event.type === "session.config" &&
          event.sessionId === open.sessionId &&
          event.config.thinkingOption === "high" &&
          settingValue(event, "collaboration_mode") === "plan" &&
          settingValue(event, "orchestration_mode") === "graph",
      );
      expect(configured.type).toBe("session.config");

      const wire = await readLog();
      expect(
        wire.filter((entry) => entry.event === "wire").some((entry) => entry.configId === "maka-model"),
      ).toBe(false);
      expect(
        wire.filter((entry) => entry.event === "wire").map((entry) => entry.configId),
      ).toEqual(
        expect.arrayContaining([
          "thinking_level",
          "permission_mode",
          "collaboration_mode",
          "orchestration_mode",
        ]),
      );
    } finally {
      collector.unsubscribe();
      await provider.dispose();
    }
  });

  it("projects the configured-default sentinel when new omits config options", async () => {
    const previous = process.env.MAKA_FAKE_OMIT_CONFIG_OPTIONS;
    process.env.MAKA_FAKE_OMIT_CONFIG_OPTIONS = "1";
    let provider: ManagedMakaProvider | undefined;
    let collector: Collector | undefined;
    try {
      const connectedProvider = await connected();
      provider = connectedProvider.provider;
      collector = collect(connectedProvider.connection);
      await connectedProvider.connection.send({
        type: "catalog",
        requestId: "catalog-missing-options",
        cwd: testRoot,
      });
      const catalog = await collector.waitFor(
        (event) =>
          event.type === "catalog" &&
          event.requestId === "catalog-missing-options",
      );
      expect(catalog.type).toBe("catalog");
      if (catalog.type === "catalog") {
        expect(catalog.catalog.defaultModel).toBe(MAKA_DEFAULT_MODEL_ID);
        expect(catalog.catalog.models).toEqual([
          expect.objectContaining({ id: MAKA_DEFAULT_MODEL_ID }),
        ]);
      }
    } finally {
      collector?.unsubscribe();
      await provider?.dispose();
      if (previous === undefined) {
        delete process.env.MAKA_FAKE_OMIT_CONFIG_OPTIONS;
      } else {
        process.env.MAKA_FAKE_OMIT_CONFIG_OPTIONS = previous;
      }
    }
  });

  it("separates shared-ID thinking and replies across streamed follow-ups", async () => {
    const { provider, connection } = await connected();
    const collector = collect(connection);
    try {
      const open = await openSession(connection, collector, "prompts", cwdA);
      await connection.send(messagePrompt(open.sessionId, "message-1", "first"));
      await collector.waitFor(
        (event) =>
          event.type === "session.turn" &&
          event.sessionId === open.sessionId &&
          event.turnId === "acp:message-1" &&
          event.state === "completed",
      );
      await collector.waitFor(
        (event) =>
          event.type === "timeline.item" &&
          event.sessionId === open.sessionId &&
          event.item.type === "assistant_message" &&
          event.item.text.includes("prompt=first"),
      );

      await connection.send(messagePrompt(open.sessionId, "message-2", "second"));
      await collector.waitFor(
        (event) =>
          event.type === "session.turn" &&
          event.sessionId === open.sessionId &&
          event.turnId === "acp:message-2" &&
          event.state === "completed",
      );
      await collector.waitFor(
        (event) =>
          event.type === "timeline.item" &&
          event.sessionId === open.sessionId &&
          event.item.type === "assistant_message" &&
          event.item.text.includes("prompt=second"),
      );
      const finalItems = new Map<string, string>();
      for (const event of collector.events) {
        if (event.type !== "timeline.item") continue;
        if (event.item.type === "assistant_message") {
          expect(event.item.text).not.toContain("thought for");
          expect(event.item.text).not.toContain(" continued");
          finalItems.set(event.item.id, event.item.text);
        } else if (event.item.type === "reasoning") {
          expect(event.item.text).not.toContain("marker=");
          expect(event.item.text).not.toContain("finished");
          finalItems.set(event.item.id, event.item.text);
        }
      }
      expect(finalItems.size).toBe(4);
      expect([...finalItems.values()].filter((text) => text.endsWith("\nfinished"))).toHaveLength(2);
      expect([...finalItems.values()].filter((text) => text.endsWith(" continued"))).toHaveLength(2);
    } finally {
      collector.unsubscribe();
      await provider.dispose();
    }
  });

  it("passes standard ACP tool calls through the public Paseo shim", async () => {
    const { provider, connection } = await connected();
    const collector = collect(connection);
    try {
      const open = await openSession(connection, collector, "tools", cwdA);
      await connection.send(messagePrompt(open.sessionId, "tool-1", "tool"));
      const tool = await collector.waitFor(
        (event) =>
          event.type === "timeline.item" &&
          event.sessionId === open.sessionId &&
          event.item.type === "tool_call" &&
          event.item.name === "read_file" &&
          event.item.status === "completed",
      );
      expect(tool.type).toBe("timeline.item");
      if (tool.type === "timeline.item" && tool.item.type === "tool_call") {
        expect(tool.item.detail.type).toBe("unknown");
        if (tool.item.detail.type === "unknown") {
          expect(tool.item.detail.output).toEqual({ text: "tool output" });
        }
      }
      await collector.waitFor(
        (event) =>
          event.type === "session.turn" &&
          event.sessionId === open.sessionId &&
          event.state === "completed",
      );
    } finally {
      collector.unsubscribe();
      await provider.dispose();
    }
  });

  it("reports prompt errors and cancels a pending turn", async () => {
    const { provider, connection } = await connected();
    const collector = collect(connection);
    try {
      const open = await openSession(connection, collector, "errors", cwdA);
      await connection.send(messagePrompt(open.sessionId, "error-1", "error"));
      const failed = await collector.waitFor(
        (event) =>
          event.type === "session.turn" &&
          event.sessionId === open.sessionId &&
          event.turnId === "acp:error-1" &&
          event.state === "failed",
      );
      if (failed.type !== "session.turn") {
        throw new Error("failed turn was not returned");
      }
      expect(failed.error?.message).toContain("fake MaKa prompt failure");

      await connection.send(messagePrompt(open.sessionId, "cancel-1", "hang"));
      await connection.send({
        type: "session.interrupt",
        requestId: "interrupt-1",
        sessionId: open.sessionId,
      });
      await collector.waitFor(
        (event) =>
          event.type === "session.turn" &&
          event.sessionId === open.sessionId &&
          event.turnId === "acp:cancel-1" &&
          event.state === "canceled",
      );
      await collector.waitFor(
        (event) => event.type === "request.completed" && event.requestId === "interrupt-1",
      );
    } finally {
      collector.unsubscribe();
      await provider.dispose();
    }
  });

  it("keeps concurrent cwd and environment contexts isolated", async () => {
    const { provider, connection } = await connected();
    const collector = collect(connection);
    try {
      const first = openInput("isolated-a", cwdA, "A");
      const second = openInput("isolated-b", cwdB, "B");
      await Promise.all([connection.send(first), connection.send(second)]);
      await Promise.all([
        collector.waitFor(
          (event) =>
            event.type === "session.ready" && event.sessionId === first.sessionId,
        ),
        collector.waitFor(
          (event) =>
            event.type === "session.ready" && event.sessionId === second.sessionId,
        ),
      ]);

      await connection.send(messagePrompt(first.sessionId, "isolated-prompt-a", "A"));
      await connection.send(messagePrompt(second.sessionId, "isolated-prompt-b", "B"));
      const assistantA = await collector.waitFor(
        (event) =>
          event.type === "timeline.item" &&
          event.sessionId === first.sessionId &&
          event.item.type === "assistant_message" &&
          event.item.text.includes("marker=A") &&
          event.item.text.includes(`cwd=${cwdA}`),
      );
      const assistantB = await collector.waitFor(
        (event) =>
          event.type === "timeline.item" &&
          event.sessionId === second.sessionId &&
          event.item.type === "assistant_message" &&
          event.item.text.includes("marker=B") &&
          event.item.text.includes(`cwd=${cwdB}`),
      );
      expect(assistantA.type).toBe("timeline.item");
      expect(assistantB.type).toBe("timeline.item");
    } finally {
      collector.unsubscribe();
      await provider.dispose();
    }
  });

  it("omits MCP wire values and emits an explicit value-free notice", async () => {
    const { provider, connection } = await connected();
    const collector = collect(connection);
    const secret = "mcp-secret-value";
    const server: ProviderMcpServerConfig = {
      type: "stdio",
      command: "mcp-server",
      args: ["--token", secret],
      env: { TOKEN: secret },
    };
    try {
      const open = openInput("mcp", cwdA, "mcp", {
        testServer: server,
        remoteServer: {
          type: "http",
          url: "https://example.invalid/mcp",
          headers: { Authorization: `Bearer ${secret}` },
        },
      });
      await connection.send(open);
      const notice = await collector.waitFor(
        (event) =>
          event.type === "session.notice" &&
          event.sessionId === open.sessionId &&
          event.notice.id === "mcp-unavailable",
      );
      expect(notice.type).toBe("session.notice");
      if (notice.type === "session.notice") {
        expect(notice.notice.description).toContain("MCP");
        expect(notice.notice.description).not.toContain(secret);
        expect(notice.notice.description).not.toContain("example.invalid");
      }
      const wire = await readLog();
      const newSessions = wire.filter(
        (entry) => entry.event === "wire" && entry.method === "session/new",
      );
      expect(newSessions.at(-1)?.mcpServers).toEqual([]);
      expect(JSON.stringify(newSessions.at(-1))).not.toContain(secret);
    } finally {
      collector.unsubscribe();
      await provider.dispose();
    }
  });

  it("rejects unsupported commands, sessions, permissions, and persistence", async () => {
    const { provider, connection } = await connected();
    try {
      await expect(
        connection.send({
          type: "session.prompt",
          sessionId: "not-opened",
          prompt: {
            clientMessageId: "command-1",
            delivery: "auto",
            input: { type: "command", name: "help", arguments: "" },
          },
        }),
      ).rejects.toThrow("provider commands");
      await expect(
        connection.send({ type: "sessions", requestId: "sessions-1" }),
      ).rejects.toThrow("persistent sessions are not importable");
      await expect(
        connection.send({
          type: "session.permission",
          sessionId: "not-opened",
          permissionId: "permission-1",
          response: { behavior: "deny" },
        }),
      ).rejects.toThrow("interactive permissions");

      const before = (await readLog()).filter(
        (entry) => entry.event === "wire" && entry.method === "session/new",
      ).length;
      await expect(
        connection.send({
          ...openInput("persisted", cwdA, "persisted"),
          persistence: { version: 1, data: { sessionId: "native-old" } },
        }),
      ).rejects.toThrow("does not support persistence");
      const after = (await readLog()).filter(
        (entry) => entry.event === "wire" && entry.method === "session/new",
      ).length;
      expect(after).toBe(before);
    } finally {
      await provider.dispose();
    }
  });

  it("surfaces EOF and closes an active prompt during disposal", async () => {
    const { provider, connection } = await connected();
    const collector = collect(connection);
    try {
      const open = await openSession(connection, collector, "eof", cwdA);
      await connection.send(messagePrompt(open.sessionId, "eof-1", "eof"));
      await collector.waitFor(
        (event) =>
          (event.type === "session.runtime_failed" || event.type === "session.turn") &&
          event.sessionId === open.sessionId,
      );
    } finally {
      collector.unsubscribe();
      await provider.dispose();
    }

    const activeLogStart = (await readLog()).length;
    const active = await connected({ closeTimeoutMs: 500 });
    const activeCollector = collect(active.connection);
    try {
      const open = await openSession(
        active.connection,
        activeCollector,
        "dispose-active",
        cwdA,
      );
      await active.connection.send(
        messagePrompt(open.sessionId, "dispose-prompt", "background"),
      );
      await waitForLog(
        (entry) =>
          entry.event === "prompt" &&
          entry.marker === "dispose-active" &&
          entry.text === "background",
      );
      await expect(withDeadline(active.provider.dispose(), 3_000)).resolves.toBeUndefined();
      const activeLog = await readLog();
      const gracefulCleanupIndex = activeLog.findIndex(
        (entry, index) =>
          index >= activeLogStart && entry.event === "graceful-cleanup",
      );
      const forcedSignalIndex = activeLog.findIndex(
        (entry, index) => index >= activeLogStart && entry.event === "signal",
      );
      expect(gracefulCleanupIndex).toBeGreaterThanOrEqual(activeLogStart);
      expect(forcedSignalIndex === -1 || gracefulCleanupIndex < forcedSignalIndex).toBe(
        true,
      );
    } finally {
      activeCollector.unsubscribe();
      await active.provider.dispose();
    }
  });

  it("bounds startup disposal and reports a missing executable", async () => {
    process.env.MAKA_FAKE_HANG_INITIALIZE = "1";
    const hanging = createMakaProvider({ command, closeTimeoutMs: 500 });
    const pending = hanging.connect(connectRequest());
    await waitForLog((entry) => entry.event === "start");
    await expect(withDeadline(hanging.dispose(), 3_000)).resolves.toBeUndefined();
    await expect(pending).rejects.toThrow(/ACP/);
    delete process.env.MAKA_FAKE_HANG_INITIALIZE;

    const missing = createMakaProvider({
      command: [join(testRoot, "missing-maka-executable")],
    });
    await expect(missing.connect(connectRequest())).rejects.toThrow("MaKa ACP");
    await expect(missing.dispose()).resolves.toBeUndefined();
  });
});

async function connected(
  options: { closeTimeoutMs?: number } = {},
): Promise<{ provider: ManagedMakaProvider; connection: ProviderConnection }> {
  const provider = createMakaProvider({ command, ...options });
  try {
    const connection = await provider.connect(connectRequest());
    return { provider, connection };
  } catch (error) {
    await provider.dispose().catch(() => undefined);
    throw error;
  }
}

function connectRequest() {
  return {
    versions: [1],
    capabilities: [
      "prompt.message",
      "prompt.command",
      "prompt.image",
      "prompt.steer",
      "session.configure",
      "session.list",
      "session.persistence",
      "permission",
    ],
  } as const;
}

function openInput(
  sessionId: string,
  cwd: string,
  marker: string,
  mcpServers: Readonly<Record<string, ProviderMcpServerConfig>> = {},
): Extract<ProviderInput, { type: "session.open" }> {
  return {
    type: "session.open",
    requestId: `open-${sessionId}`,
    sessionId,
    config: {
      cwd,
      env: { MAKA_TEST_MARKER: marker },
      mcpServers,
      model: MAKA_DEFAULT_MODEL_ID,
      thinkingOption: "default",
      settings: {
        permission_mode: "ask",
        collaboration_mode: "agent",
        orchestration_mode: "default",
      },
      persist: false,
    },
    history: "skip",
  };
}

function messagePrompt(
  sessionId: string,
  clientMessageId: string,
  text: string,
): Extract<ProviderInput, { type: "session.prompt" }> {
  return {
    type: "session.prompt",
    sessionId,
    prompt: {
      clientMessageId,
      delivery: "auto",
      input: { type: "message", content: [{ type: "text", text }] },
    },
  };
}

async function openSession(
  connection: ProviderConnection,
  collector: Collector,
  sessionId: string,
  cwd: string,
): Promise<{ sessionId: string }> {
  const input = openInput(sessionId, cwd, sessionId);
  await connection.send(input);
  await collector.waitFor(
    (event) => event.type === "session.opened" && event.sessionId === sessionId,
  );
  await collector.waitFor(
    (event) => event.type === "session.ready" && event.sessionId === sessionId,
  );
  return input;
}

interface Collector {
  events: ProviderEvent[];
  waitFor(
    predicate: (event: ProviderEvent) => boolean,
    timeoutMs?: number,
    start?: number,
  ): Promise<ProviderEvent>;
  unsubscribe(): void;
}

function collect(connection: ProviderConnection): Collector {
  const events: ProviderEvent[] = [];
  const waiters = new Set<{
    predicate: (event: ProviderEvent) => boolean;
    start: number;
    resolve: (event: ProviderEvent) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }>();
  const unsubscribe = connection.onEvent((event) => {
    ProviderEventSchema.parse(event);
    events.push(event);
    for (const waiter of waiters) {
      if (events.indexOf(event) < waiter.start || !waiter.predicate(event)) {
        continue;
      }
      clearTimeout(waiter.timer);
      waiters.delete(waiter);
      waiter.resolve(event);
    }
  });

  return {
    events,
    waitFor(predicate, timeoutMs = 5_000, start = 0) {
      const existing = events.slice(start).find(predicate);
      if (existing) {
        return Promise.resolve(existing);
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          start,
          resolve,
          reject,
          timer: setTimeout(() => {
            waiters.delete(waiter);
            reject(new Error("Timed out waiting for MaKa provider event"));
          }, timeoutMs),
        };
        waiters.add(waiter);
      });
    },
    unsubscribe() {
      unsubscribe();
      for (const waiter of waiters) {
        clearTimeout(waiter.timer);
      }
      waiters.clear();
    },
  };
}

function settingValue(event: ProviderEvent, id: string): string | undefined {
  if (event.type !== "session.config") {
    return undefined;
  }
  const setting = event.config.settings.find((candidate) => candidate.id === id);
  return typeof setting?.value === "string" ? setting.value : undefined;
}

interface LogEntry {
  event?: string;
  method?: string;
  requestId?: string;
  configId?: string;
  mcpServers?: unknown;
  [key: string]: unknown;
}

async function readLog(): Promise<LogEntry[]> {
  try {
    const content = await readFile(spawnLog, "utf8");
    return content
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as LogEntry);
  } catch {
    return [];
  }
}

async function waitForLog(
  predicate: (entry: LogEntry) => boolean,
  timeoutMs = 5_000,
): Promise<LogEntry> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const entry = (await readLog()).find(predicate);
    if (entry) {
      return entry;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for MaKa fake process log");
}

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("MaKa test operation timed out")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}
