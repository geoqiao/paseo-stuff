#!/usr/bin/env node

import { appendFileSync } from "node:fs";
import { createInterface } from "node:readline";

const spawnLog = process.env.MAKA_FAKE_SPAWN_LOG;
const sessions = new Map();
const pendingPrompts = new Map();
const pendingPermissions = new Map();
const pendingElicitations = new Map();
let sequence = 0;
let outputEnded = false;
let backgroundTimer;

function log(event, fields = {}) {
  if (!spawnLog) {
    return;
  }
  try {
    appendFileSync(
      spawnLog,
      JSON.stringify({
        event,
        pid: process.pid,
        cwd: process.cwd(),
        marker: process.env.MAKA_TEST_MARKER ?? "missing",
        ...fields,
      }) + "\n",
    );
  } catch {
    // Test diagnostics must not change ACP behavior.
  }
}

function send(message) {
  if (!outputEnded) {
    process.stdout.write(JSON.stringify(message) + "\n");
  }
}

function response(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function errorResponse(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}

function update(sessionId, value) {
  send({
    jsonrpc: "2.0",
    method: "session/update",
    params: { sessionId, update: value },
  });
}

function configOptions(session) {
  return [
    {
      id: "permission_mode",
      name: "Permission mode",
      category: "_maka/permission_mode",
      type: "select",
      currentValue: session.permissionMode,
      options: [
        { value: "explore", name: "Explore" },
        { value: "ask", name: "Ask" },
        { value: "bypass", name: "Bypass" },
      ],
    },
    {
      id: "thinking_level",
      name: "Thinking level",
      category: "thought_level",
      type: "select",
      currentValue: session.thinkingLevel,
      options: [
        { value: "default", name: "Default" },
        { value: "off", name: "Off" },
        { value: "low", name: "Low" },
        { value: "high", name: "High" },
        { value: "max", name: "Max" },
      ],
    },
    {
      id: "collaboration_mode",
      name: "Collaboration mode",
      category: "mode",
      type: "select",
      currentValue: session.collaborationMode,
      options: [
        { value: "agent", name: "Agent" },
        { value: "plan", name: "Plan" },
      ],
    },
    {
      id: "orchestration_mode",
      name: "Orchestration mode",
      category: "_maka/orchestration_mode",
      type: "select",
      currentValue: session.orchestrationMode,
      options: [
        { value: "default", name: "Default" },
        { value: "swarm", name: "Swarm" },
        { value: "graph", name: "Graph" },
      ],
    },
  ];
}

function sessionFor(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new Error("unknown session " + sessionId);
  }
  return session;
}

function promptText(prompt) {
  if (!Array.isArray(prompt)) {
    return "";
  }
  return prompt
    .filter((part) => part && part.type === "text")
    .map((part) => part.text)
    .join("\n");
}

function finishPrompt(requestId, sessionId, text) {
  const session = sessionFor(sessionId);
  if (text.includes("tool")) {
    update(sessionId, {
      sessionUpdate: "tool_call",
      toolCallId: "tool-" + requestId,
      name: "read_file",
      title: "Read file",
      kind: "read",
      status: "in_progress",
      rawInput: { filePath: "maka-test.txt" },
    });
    if (text.includes("tool-stream")) {
      update(sessionId, {
        sessionUpdate: "tool_call_update",
        toolCallId: "tool-" + requestId,
        status: "in_progress",
        content: [
          {
            type: "content",
            content: { type: "text", text: "partial tool output" },
          },
        ],
      });
    }
    update(sessionId, {
      sessionUpdate: "tool_call_update",
      toolCallId: "tool-" + requestId,
      status: "completed",
      rawOutput: { text: "tool output" },
    });
  }
  update(sessionId, {
    sessionUpdate: "agent_thought_chunk",
    messageId: "assistant-" + requestId,
    content: { type: "text", text: "thought for " + requestId },
  });
  update(sessionId, {
    sessionUpdate: "agent_message_chunk",
    messageId: "assistant-" + requestId,
    content: {
      type: "text",
      text: [
        "marker=" + (process.env.MAKA_TEST_MARKER ?? "missing"),
        "cwd=" + process.cwd(),
        "mcp=" + (session.mcpServers.length > 0 ? "yes" : "no"),
        "prompt=" + text,
      ].join(";"),
    },
  });
  update(sessionId, {
    sessionUpdate: "agent_thought_chunk",
    messageId: "assistant-" + requestId,
    content: { type: "text", text: " continued" },
  });
  update(sessionId, {
    sessionUpdate: "agent_message_chunk",
    messageId: "assistant-" + requestId,
    content: { type: "text", text: "\nfinished" },
  });
  response(requestId, { stopReason: "end_turn" });
}

function prompt(requestId, params) {
  sessionFor(params.sessionId);
  const text = promptText(params.prompt);
  log("prompt", { requestId, sessionId: params.sessionId, text });
  if (text.includes("hang")) {
    pendingPrompts.set(requestId, { requestId, sessionId: params.sessionId });
    return;
  }
  if (text.includes("background")) {
    backgroundTimer = setInterval(() => undefined, 1_000);
    return;
  }
  if (text.includes("permission")) {
    const permissionId = "permission-" + requestId;
    pendingPermissions.set(permissionId, {
      requestId,
      sessionId: params.sessionId,
    });
    send({
      jsonrpc: "2.0",
      id: permissionId,
      method: "session/request_permission",
      params: {
        sessionId: params.sessionId,
        toolCall: {
          toolCallId: "tool-" + requestId,
          title: "Read file",
          status: "pending",
          rawInput: { filePath: "maka-test.txt" },
        },
        options: [
          { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
          { optionId: "reject-once", name: "Reject", kind: "reject_once" },
        ],
      },
    });
    return;
  }
  if (text.includes("question")) {
    const elicitationId = "elicitation-" + requestId;
    pendingElicitations.set(elicitationId, {
      requestId,
    });
    send({
      jsonrpc: "2.0",
      id: elicitationId,
      method: "elicitation/create",
      params: {
        sessionId: params.sessionId,
        toolCallId: "tool-" + requestId,
        mode: "form",
        message: "Answer the test question",
        requestedSchema: {
          type: "object",
          properties: { answer: { type: "string" } },
          required: ["answer"],
        },
      },
    });
    return;
  }
  if (text.includes("eof")) {
    setImmediate(() => {
      outputEnded = true;
      process.stdout.end(() => process.exit(0));
    });
    return;
  }
  if (text.includes("error")) {
    errorResponse(requestId, -32001, "fake MaKa prompt failure");
    return;
  }
  finishPrompt(requestId, params.sessionId, text);
}

log("start", { argv: process.argv.slice(2) });
process.once("SIGTERM", () => {
  log("signal", { signal: "SIGTERM" });
  process.exit(143);
});

const input = createInterface({ input: process.stdin });
input.on("line", (line) => {
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    return;
  }

  log("wire", {
    method: message.method,
    id: message.id,
    cwd: message.params?.cwd,
    mcpServers: message.params?.mcpServers,
    configId: message.params?.configId,
    value: message.params?.value,
  });

  if (message.id !== undefined && message.method === undefined) {
    const pending = pendingPermissions.get(String(message.id));
    if (pending) {
      pendingPermissions.delete(String(message.id));
      if (message.error) {
        errorResponse(pending.requestId, -32001, "permission request failed");
        return;
      }
      const outcome = message.result?.outcome;
      const approved = outcome?.outcome === "selected";
      log("permission-response", {
        requestId: pending.requestId,
        sessionId: pending.sessionId,
        outcome: outcome?.outcome,
        optionId: outcome?.optionId,
      });
      finishPrompt(
        pending.requestId,
        pending.sessionId,
        approved ? "permission-approved" : "permission-denied",
      );
      return;
    }
    const elicitation = pendingElicitations.get(String(message.id));
    if (elicitation) {
      pendingElicitations.delete(String(message.id));
      errorResponse(
        elicitation.requestId,
        -32001,
        "question interaction unavailable",
      );
      return;
    }
    return;
  }

  if (message.method === "initialize") {
    if (process.env.MAKA_FAKE_HANG_INITIALIZE === "1") {
      return;
    }
    response(message.id, {
      protocolVersion: 1,
      agentCapabilities: {
        sessionCapabilities: { list: {}, close: {} },
      },
      agentInfo: { name: "fake-maka", title: "Fake MaKa", version: "test" },
    });
    return;
  }
  if (message.method === "session/new") {
    const sessionId = "maka-" + process.pid + "-" + ++sequence;
    const session = {
      id: sessionId,
      cwd: message.params.cwd,
      mcpServers: message.params.mcpServers ?? [],
      permissionMode: "ask",
      thinkingLevel: "default",
      collaborationMode: "agent",
      orchestrationMode: "default",
    };
    sessions.set(sessionId, session);
    if (process.env.MAKA_FAKE_OMIT_CONFIG_OPTIONS === "1") {
      response(message.id, { sessionId });
    } else {
      response(message.id, { sessionId, configOptions: configOptions(session) });
    }
    return;
  }
  if (message.method === "session/set_config_option") {
    const session = sessionFor(message.params.sessionId);
    const value = message.params.value;
    if (message.params.configId === "permission_mode") {
      session.permissionMode = value;
    } else if (message.params.configId === "thinking_level") {
      session.thinkingLevel = value;
    } else if (message.params.configId === "collaboration_mode") {
      session.collaborationMode = value;
    } else if (message.params.configId === "orchestration_mode") {
      session.orchestrationMode = value;
    }
    response(message.id, { configOptions: configOptions(session) });
    update(message.params.sessionId, {
      sessionUpdate: "config_option_update",
      configOptions: configOptions(session),
    });
    return;
  }
  if (message.method === "session/prompt") {
    prompt(message.id, message.params);
    return;
  }
  if (message.method === "session/cancel") {
    for (const [requestId, pending] of pendingPrompts) {
      if (pending.sessionId === message.params.sessionId) {
        pendingPrompts.delete(requestId);
        response(requestId, { stopReason: "cancelled" });
      }
    }
    response(message.id, {});
    return;
  }
  if (message.method === "session/close") {
    response(message.id, {});
    return;
  }
  if (message.method === "session/list") {
    response(message.id, {
      sessions: [
        {
          sessionId: "native-unopenable-session",
          cwd: process.cwd(),
          title: "Native session without resume",
        },
      ],
    });
    return;
  }
  if (message.id !== undefined && message.method !== undefined) {
    errorResponse(message.id, -32601, "unsupported method");
  }
});

input.on("close", () => {
  outputEnded = true;
  if (backgroundTimer) {
    clearInterval(backgroundTimer);
    backgroundTimer = undefined;
  }
  log("graceful-cleanup");
  setImmediate(() => process.exit(0));
});

process.on("exit", () => log("exit", { exitCode: process.exitCode ?? 0 }));
