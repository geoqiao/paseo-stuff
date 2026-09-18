import { AsyncLocalStorage } from "node:async_hooks";
import { runAcpProvider, type AcpTransformer } from "@getpaseo/plugin/server/acp";
import type {
  ProviderConnection,
  ProviderEvent,
  ProviderInput,
  ProviderRegistration,
} from "@getpaseo/plugin/server/provider";
import {
  createMakaAcpStream,
  MAKA_DEFAULT_MODEL_ID,
  type ConnectorResource,
  type MakaCommand,
  type MakaConnectorContext,
} from "./maka-compatibility";

const PROVIDER_ID = "maka";
const PROVIDER_LABEL = "MaKa";
const DEFAULT_CLOSE_TIMEOUT_MS = 2_000;
const UNSUPPORTED_CAPABILITIES = new Set([
  "prompt.command",
  "prompt.image",
  "prompt.steer",
  "permission",
  "permission.tool_policy",
  "session.list",
  "session.persistence",
]);

const makaConfiguration: AcpTransformer = {
  discover(catalog) {
    return {
      ...catalog,
      models: catalog.models.map((model) =>
        model.id === MAKA_DEFAULT_MODEL_ID
          ? {
              ...model,
              thinkingOptions: [...(catalog.thinkingOptions ?? [])],
              defaultThinkingOptionId: catalog.defaultThinkingOption,
            }
          : model,
      ),
    };
  },
  async configure(change, context) {
    if (change.target === "model") {
      if (change.value === MAKA_DEFAULT_MODEL_ID) {
        return "handled";
      }
      throw new Error(
        "MaKa uses its configured default model and does not support model selection",
      );
    }

    if (change.target === "mode") {
      if (change.value === null) {
        throw new Error("MaKa collaboration mode cannot be cleared");
      }
      await context.config.set("collaboration_mode", change.value);
      return "handled";
    }

    return "pass";
  },
};

export interface MakaProviderOptions {
  /** Test and embedding hook; production uses `maka --acp` or MAKA_PASEO_COMMAND. */
  command?: MakaCommand;
  startupTimeoutMs?: number;
  closeTimeoutMs?: number;
}

export interface ManagedMakaProvider extends ProviderRegistration {
  dispose(): Promise<void>;
}

interface InputContext {
  cwd: string;
  env: Readonly<Record<string, string>>;
  hasMcpServers: boolean;
}

interface ConnectorScope extends InputContext {
  resources: Set<ConnectorResource>;
  isClosed: () => boolean;
}

interface ConnectionScope extends InputContext {
  resources: Set<ConnectorResource>;
  closed: boolean;
  closeConnection?: () => Promise<void>;
  closePromise?: Promise<void>;
  resourceClosePromise?: Promise<void>;
}

export function createMakaProvider(
  options: MakaProviderOptions = {},
): ManagedMakaProvider {
  validateOptions(options);

  const command = resolveCommand(options.command);
  const closeTimeoutMs = options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS;
  const storage = new AsyncLocalStorage<ConnectorScope>();
  const scopes = new Set<ConnectionScope>();
  const pendingConnects = new Set<Promise<ProviderConnection>>();
  let disposed = false;
  let disposePromise: Promise<void> | undefined;

  const delegate = runAcpProvider({
    id: PROVIDER_ID,
    label: PROVIDER_LABEL,
    description: "MaKa through its ACP interface.",
    icon: "icon.svg",
    ...(options.startupTimeoutMs === undefined
      ? {}
      : { acpOptions: { startupTimeoutMs: options.startupTimeoutMs } }),
    transformers: [makaConfiguration],
    connector: () => {
      const scope = storage.getStore();
      if (!scope) {
        throw new Error("MaKa connector was requested without an input context");
      }
      const context: MakaConnectorContext = {
        cwd: scope.cwd,
        env: scope.env,
        hasMcpServers: scope.hasMcpServers,
        resources: scope.resources,
        isClosed: scope.isClosed,
      };
      return createMakaAcpStream(context, command);
    },
  });

  const closeScopeResources = (scope: ConnectionScope): Promise<void> => {
    if (!scope.resourceClosePromise) {
      scope.resourceClosePromise = closeResources(scope.resources);
    }
    return scope.resourceClosePromise;
  };

  const closeScope = (
    scope: ConnectionScope,
    connection: ProviderConnection,
  ): Promise<void> => {
    if (scope.closePromise) {
      return scope.closePromise;
    }
    scope.closed = true;

    let delegateClose: Promise<void>;
    try {
      delegateClose = connection.close();
    } catch (error) {
      delegateClose = Promise.reject(error);
    }
    void delegateClose.catch(() => undefined);

    scope.closePromise = (async () => {
      let delegateError: unknown;
      let delegateTimedOut = false;
      try {
        await withTimeout(
          delegateClose,
          closeTimeoutMs,
          "MaKa provider close timed out",
        );
      } catch (error) {
        delegateError = error;
        delegateTimedOut = true;
      }

      let resourceError: unknown;
      try {
        await closeScopeResources(scope);
      } catch (error) {
        resourceError = error;
      }

      // A pending ACP prompt can keep the shim's close promise waiting for
      // native session/close. EOF above is what releases that wait; give it a
      // second bounded chance before reporting a cleanup failure.
      if (delegateTimedOut) {
        try {
          await withTimeout(
            delegateClose,
            closeTimeoutMs,
            "MaKa provider cleanup did not settle after EOF",
          );
          delegateError = undefined;
        } catch (error) {
          delegateError = error;
        }
      }

      const errors = [delegateError, resourceError].filter(
        (error): error is unknown => error !== undefined,
      );
      if (errors.length === 1) {
        throw errors[0];
      }
      if (errors.length > 1) {
        throw new AggregateError(errors, "MaKa provider cleanup failed");
      }
    })();
    void scope.closePromise.then(
      () => scopes.delete(scope),
      () => scopes.delete(scope),
    );
    return scope.closePromise;
  };

  const connectScope = async (
    scope: ConnectionScope,
    request: Parameters<ProviderRegistration["connect"]>[0],
  ): Promise<ProviderConnection> => {
    let connection: ProviderConnection;
    try {
      connection = await storage.run(scopeToConnector(scope), () =>
        delegate.connect(request),
      );
    } catch (error) {
      let resourceError: unknown;
      try {
        await closeScopeResources(scope);
      } catch (cleanupError) {
        resourceError = cleanupError;
      }
      scopes.delete(scope);
      if (resourceError !== undefined) {
        throw new AggregateError(
          [error, resourceError],
          "MaKa provider connect cleanup failed",
        );
      }
      throw error;
    }

    scope.closeConnection = () => closeScope(scope, connection);
    if (disposed || scope.closed) {
      scope.closed = true;
      try {
        await scope.closeConnection();
      } catch (error) {
        throw new AggregateError(
          [
            new Error("MaKa provider was closed while connecting"),
            error,
          ],
          "MaKa provider connect cleanup failed",
        );
      }
      throw new Error("MaKa provider was closed while connecting");
    }

    const capabilities = withoutUnsupportedCapabilities(
      connection.capabilities,
    );
    const mcpOpenRequests = new Map<
      string,
    {
      sessionId: string;
      notice: Extract<ProviderEvent, { type: "session.notice" }>;
    }
    >();
    const clearMcpOpenRequest = (
      requestId?: string,
      sessionId?: string,
    ): void => {
      if (requestId) {
        mcpOpenRequests.delete(requestId);
      }
      if (sessionId) {
        for (const [candidateRequestId, candidate] of mcpOpenRequests) {
          if (candidate.sessionId === sessionId) {
            mcpOpenRequests.delete(candidateRequestId);
          }
        }
      }
    };

    return {
      version: connection.version,
      capabilities,
      async send(input) {
        if (scope.closed) {
          throw new Error("MaKa provider connection is closed");
        }
        assertSupportedInput(input);
        const inputContext = contextForInput(input);
        if (input.type === "session.open" && inputContext.hasMcpServers) {
          mcpOpenRequests.set(input.requestId, {
            sessionId: input.sessionId,
            notice: mcpNotice(),
          });
        }
        const inputScope = scopeToConnector(scope, inputContext);
        try {
          await storage.run(inputScope, () => connection.send(input));
        } catch (error) {
          if (input.type === "session.open") {
            mcpOpenRequests.delete(input.requestId);
          }
          throw error;
        }
      },
      onEvent(listener) {
        return connection.onEvent((event) => {
          const filtered = filterProviderEvent(event);
          if (!filtered) {
            return;
          }
          listener(filtered);

          if (event.type === "request.failed") {
            clearMcpOpenRequest(event.requestId);
          }
          if (event.type === "session.opened") {
            const pending = event.requestId
              ? mcpOpenRequests.get(event.requestId)
              : [...mcpOpenRequests.values()].find(
                  (candidate) => candidate.sessionId === event.sessionId,
                );
            if (pending && pending.sessionId === event.sessionId) {
              listener({
                type: "session.notice",
                sessionId: event.sessionId,
                notice: pending.notice.notice,
              });
            }
          }
          if (
            event.type === "session.ready" ||
            event.type === "session.closed" ||
            event.type === "session.runtime_failed"
          ) {
            clearMcpOpenRequest(
              event.type === "session.ready" ? event.requestId : undefined,
              event.sessionId,
            );
          }
        });
      },
      close: () => closeScope(scope, connection),
    };
  };

  const registration: ManagedMakaProvider = {
    ...delegate,
    async connect(request) {
      if (disposed) {
        throw new Error("MaKa provider has been disposed");
      }

      const scope: ConnectionScope = {
        cwd: process.cwd(),
        env: {},
        hasMcpServers: false,
        resources: new Set(),
        closed: false,
      };
      scopes.add(scope);
      const pending = connectScope(scope, request);
      pendingConnects.add(pending);
      try {
        return await pending;
      } finally {
        pendingConnects.delete(pending);
      }
    },
    dispose() {
      if (disposePromise) {
        return disposePromise;
      }
      disposed = true;
      const scopesAtDispose = [...scopes];
      const pendingAtDispose = [...pendingConnects];
      for (const scope of scopesAtDispose) {
        scope.closed = true;
      }

      disposePromise = (async () => {
        const errors: unknown[] = [];
        const tracked = new Set<Promise<unknown>>();

        const waitForCleanup = async (
          operations: readonly Promise<unknown>[],
        ): Promise<void> => {
          const fresh = operations.filter((operation) => {
            if (tracked.has(operation)) {
              return false;
            }
            tracked.add(operation);
            return true;
          });
          const results = await Promise.allSettled(fresh);
          for (const result of results) {
            if (result.status === "rejected") {
              errors.push(result.reason);
            }
          }
        };

        await waitForCleanup(
          scopesAtDispose.map((scope) =>
            scope.closeConnection
              ? scope.closeConnection()
              : closeScopeResources(scope),
          ),
        );
        await Promise.allSettled(pendingAtDispose);

        while (true) {
          const lateClosing = [...scopes]
            .map((scope) => scope.closePromise ?? scope.resourceClosePromise)
            .filter((operation): operation is Promise<void> =>
              operation !== undefined,
            );
          const freshClosing = lateClosing.filter(
            (operation) => !tracked.has(operation),
          );
          if (freshClosing.length === 0) {
            break;
          }
          await waitForCleanup(freshClosing);
        }

        scopes.clear();
        for (const pending of pendingAtDispose) {
          pendingConnects.delete(pending);
        }
        if (errors.length === 1) {
          throw errors[0];
        }
        if (errors.length > 1) {
          throw new AggregateError(errors, "MaKa provider dispose failed");
        }
      })();
      return disposePromise;
    },
  };

  return registration;
}

export const createProvider = createMakaProvider;

function contextForInput(input: ProviderInput): InputContext {
  if (input.type === "session.open") {
    return {
      cwd: input.config.cwd,
      env: { ...input.config.env },
      hasMcpServers: Object.keys(input.config.mcpServers).length > 0,
    };
  }
  if (input.type === "catalog" || input.type === "sessions") {
    return {
      cwd: input.cwd ?? process.cwd(),
      env: {},
      hasMcpServers: false,
    };
  }
  return {
    cwd: process.cwd(),
    env: {},
    hasMcpServers: false,
  };
}

function scopeToConnector(
  scope: ConnectionScope,
  context: InputContext = scope,
): ConnectorScope {
  return {
    cwd: context.cwd,
    env: context.env,
    hasMcpServers: context.hasMcpServers,
    resources: scope.resources,
    isClosed: () => scope.closed,
  };
}

function assertSupportedInput(input: ProviderInput): void {
  if (input.type === "sessions") {
    throw new Error(
      "MaKa ACP exposes native session listing without resume; persistent sessions are not importable",
    );
  }
  if (input.type === "session.open" && input.persistence !== undefined) {
    throw new Error(
      "MaKa ACP does not support persistence; reopen starts a new session only when no persistence is supplied",
    );
  }
  if (input.type === "session.prompt") {
    if (input.prompt.input.type === "command") {
      throw new Error("MaKa ACP does not support provider commands");
    }
    if (input.prompt.delivery === "steer") {
      throw new Error("MaKa ACP does not support prompt steering");
    }
    if (input.prompt.input.content.some((part) => part.type === "image")) {
      throw new Error("MaKa ACP does not support image prompts");
    }
  }
  if (input.type === "session.permission") {
    throw new Error("MaKa ACP does not support interactive permissions");
  }
  if (
    input.type === "session.archive" ||
    input.type === "session.unarchive" ||
    input.type === "session.revert"
  ) {
    throw new Error(`MaKa ACP does not support ${input.type}`);
  }
}

function filterProviderEvent(event: ProviderEvent): ProviderEvent | undefined {
  if (
    event.type === "session.commands" ||
    event.type === "sessions" ||
    event.type === "session.permission" ||
    event.type === "session.permission_resolved" ||
    event.type === "session.persistence"
  ) {
    return undefined;
  }
  if (event.type !== "session.opened") {
    return event;
  }
  const sanitized = { ...event };
  delete sanitized.persistence;
  return {
    ...sanitized,
    capabilities: withoutUnsupportedCapabilities(event.capabilities),
  };
}

function withoutUnsupportedCapabilities(
  capabilities: readonly string[],
): readonly string[] {
  return capabilities.filter(
    (capability) => !UNSUPPORTED_CAPABILITIES.has(capability),
  );
}

function mcpNotice(): Extract<ProviderEvent, { type: "session.notice" }> {
  return {
    type: "session.notice",
    sessionId: "",
    notice: {
      id: "mcp-unavailable",
      severity: "warning",
      title: "MaKa MCP support unavailable",
      description:
        "MaKa's ACP adapter does not accept MCP servers. Paseo MCP configuration was omitted from the MaKa request.",
    },
  };
}

async function closeResources(
  resources: Set<ConnectorResource>,
): Promise<void> {
  const results = await Promise.allSettled(
    [...resources].map((resource) =>
      resource.close(new Error("Paseo closed the MaKa provider")),
    ),
  );
  const errors = results
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    )
    .map((result) => result.reason);
  resources.clear();
  if (errors.length > 0) {
    throw new AggregateError(errors, "MaKa ACP child process cleanup failed");
  }
}

async function withTimeout(
  promise: Promise<void>,
  timeoutMs: number,
  message: string,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  try {
    await Promise.race([promise, timeout]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function resolveCommand(command: MakaCommand | undefined): MakaCommand {
  if (command) {
    validateCommand(command);
    return [command[0].trim(), ...command.slice(1)];
  }
  const executable = process.env.MAKA_PASEO_COMMAND?.trim() || "maka";
  return [executable, "--acp"];
}

function validateCommand(command: MakaCommand): void {
  if (command.length === 0 || command[0].trim().length === 0) {
    throw new Error("MaKa provider command must contain an executable");
  }
}

function validateOptions(options: MakaProviderOptions): void {
  if (
    options.startupTimeoutMs !== undefined &&
    (!Number.isFinite(options.startupTimeoutMs) || options.startupTimeoutMs <= 0)
  ) {
    throw new Error("MaKa startupTimeoutMs must be positive");
  }
  if (
    options.closeTimeoutMs !== undefined &&
    (!Number.isFinite(options.closeTimeoutMs) || options.closeTimeoutMs <= 0)
  ) {
    throw new Error("MaKa closeTimeoutMs must be positive");
  }
}
