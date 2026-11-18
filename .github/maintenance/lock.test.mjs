import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { currentSession, holderFinished, matchesSession, resolveRun, sessionAgentId } from './lock.mjs';

const workspace = 'repo::/checkout';
const terminal = { tabId: 'tab', leafId: 'pane', ptyId: 'pty', worktreeId: workspace, connected: true, orphaned: false };
const terminalEnv = { ORCA_TERMINAL_HANDLE: 'term_handle', ORCA_PANE_KEY: 'tab:pane', ORCA_TAB_ID: 'tab', ORCA_WORKSPACE_ID: workspace };
const cli = currentSession(terminalEnv, () => ({ terminal }));
const chat = { kind: 'chat', chatSessionId: 'chat-1' };
const runFor = (session, patch = {}) => ({
  id: 'run-1', automationId: 'schedule', status: 'dispatched',
  sessionKind: session.kind, workspaceId: workspace, ...session, ...patch,
});
const inventory = (terminals = []) => ({ terminals, truncated: false, hostScope: { omittedHostIds: [] } });
const ownerFor = (session) => ({ scheduleId: 'schedule', runId: 'run-1', agentId: sessionAgentId(session), session });

test('chat identity uses the Orca session, not provider session or terminal IDs', () => {
  assert.deepEqual(currentSession({ ...terminalEnv, ORCA_AGENT_SESSION_ID: 'chat-1', PI_SESSION_ID: 'provider' },
    () => { throw new Error('No terminal lookup for Chat'); }), chat);
  assert.equal(resolveRun('schedule', chat, () => ({ runs: [runFor(chat)] })).agentId, 'chat-1');
});

test('CLI identity is joined to the runtime terminal handle, pane, PTY and workspace', () => {
  const resolved = resolveRun('schedule', cli, () => ({ runs: [runFor(cli)] }));
  assert.equal(resolved.agentId, 'terminal:tab:pane');
  assert.equal(resolved.runId, 'run-1');
  assert.equal(matchesSession(runFor(cli), chat), false);
  for (const field of ['terminalSessionId', 'terminalPaneKey', 'terminalPtyId', 'workspaceId']) {
    assert.equal(matchesSession(runFor(cli, { [field]: 'other' }), cli), false, field);
  }
  assert.deepEqual(currentSession({ ORCA_TERMINAL_HANDLE: 'term_handle', ORCA_AGENT_PANE: 'tab:pane', ORCA_WORKTREE_ID: workspace },
    () => ({ terminal })), cli);
});

test('missing or conflicting terminal identity fails closed', () => {
  assert.throws(() => currentSession({ PI_SESSION_ID: 'provider' }), /Missing Orca/);
  for (const patch of [{ connected: false }, { orphaned: true }, { leafId: 'other' }, { worktreeId: 'other' }, { ptyId: null }]) {
    assert.throws(() => currentSession(terminalEnv, () => ({ terminal: { ...terminal, ...patch } })), /does not match/);
  }
  assert.throws(() => currentSession({ ...terminalEnv, ORCA_TAB_ID: 'other' }, () => ({ terminal })), /does not match/);
});

test('run selection rejects missing, duplicate, completed and mismatched runs on either surface', () => {
  for (const session of [chat, cli]) {
    for (const runs of [[], [runFor(session), runFor(session, { id: 'run-2' })],
      [runFor(session, { status: 'completed' })], [runFor(session, { automationId: 'other' })]]) {
      assert.throws(() => resolveRun('schedule', session, () => ({ runs })), /Expected one active/);
    }
    assert.equal(resolveRun('schedule', session, () => ({ runs: [runFor(session, { status: 'pending' })] })).runId, 'run-1');
  }
  assert.throws(() => resolveRun('schedule', chat, () => ({})), /no automation run inventory/);
  assert.throws(() => resolveRun('schedule', chat, () => { throw new Error('offline'); }), /offline/);
});

test('completed holder recovery requires the exact schedule, run and session', () => {
  for (const session of [chat, cli]) {
    const owner = ownerFor(session);
    const call = (args) => args[0] === 'automations'
      ? { runs: [runFor(session, { status: 'completed' })] } : inventory();
    assert.equal(holderFinished(owner, call), true);
    for (const patch of [{ status: 'failed' }, { status: 'dispatched' }, { id: 'other' },
      { automationId: 'other' }, session.kind === 'chat' ? { chatSessionId: 'other' } : { terminalPtyId: 'other' }]) {
      assert.equal(holderFinished(owner, () => ({ runs: [runFor(session, { status: 'completed', ...patch })] })), false);
    }
    assert.equal(holderFinished(owner, () => { throw new Error('offline'); }), false);
    assert.equal(holderFinished({ ...owner, agentId: 'other' }, call), false);
  }
  assert.equal(holderFinished({ agentId: 'chat-1', scheduleId: 'schedule', runId: 'run-1' },
    () => ({ runs: [runFor(chat, { status: 'completed' })] })), true);
  assert.equal(holderFinished({ ...ownerFor(cli), scheduleId: null }), false);
});

test('a completed CLI run with a surviving pane or incomplete inventory keeps its lock', () => {
  const completed = { runs: [runFor(cli, { status: 'completed' })] };
  for (const listing of [inventory([terminal]), inventory([{ ...terminal, ptyId: 'new-pty' }]),
    { terminals: [] }, { ...inventory(), truncated: true },
    { ...inventory(), hostScope: { omittedHostIds: ['host'] } }]) {
    assert.equal(holderFinished(ownerFor(cli), (args) => args[0] === 'automations' ? completed : listing), false);
  }
});

function harness(t, session) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paseo-lock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fakeOrca = path.join(dir, 'orca');
  const scenario = path.join(dir, 'scenario.json');
  fs.writeFileSync(fakeOrca, `#!/usr/bin/env node
const fs = require('node:fs');
const s = JSON.parse(fs.readFileSync(process.env.LOCK_SCENARIO, 'utf8'));
const args = process.argv.slice(2);
let result;
if (args[0] === 'automations') result = { runs: s.runs };
else if (args[1] === 'show') result = { terminal: s.terminal };
else if (args[1] === 'list') result = s.inventory;
else process.exit(1);
console.log(JSON.stringify({ ok: true, result }));
`, { mode: 0o700 });
  const env = { ...process.env, ...terminalEnv, ORCA_AGENT_SESSION_ID: session.kind === 'chat' ? session.chatSessionId : '',
    ORCA_CLI_COMMAND: fakeOrca, LOCK_SCENARIO: scenario };
  const set = (runs = [runFor(session)], listing = inventory()) =>
    fs.writeFileSync(scenario, JSON.stringify({ runs, terminal, inventory: listing }));
  set();
  const invoke = (...args) => {
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('./lock.mjs', import.meta.url)),
      ...args, '--state-dir', path.join(dir, 'watch')], { encoding: 'utf8', env });
    return { status: result.status, data: JSON.parse(result.stdout || result.stderr) };
  };
  return { invoke, set, lock: path.join(dir, 'watch', 'run.lock') };
}

for (const session of [chat, cli]) {
  test(`${session.kind}: actual CLI resolve/acquire, contention and guarded release`, (t) => {
    const h = harness(t, session);
    assert.equal(h.invoke('resolve', '--schedule-id', 'schedule').data.runId, 'run-1');
    assert.equal(fs.existsSync(h.lock), false);
    const acquired = h.invoke('acquire', '--schedule-id', 'schedule');
    assert.equal(acquired.status, 0);
    assert.equal(acquired.data.acquired, true);
    assert.deepEqual(acquired.data.session, session);
    assert.equal(h.invoke('acquire', '--schedule-id', 'schedule').status, 2);
    assert.equal(h.invoke('release', '--agent-id', 'wrong', '--token', acquired.data.token).status, 1);
    assert.equal(h.invoke('release', '--agent-id', acquired.data.agentId, '--token', 'wrong').status, 1);
    assert.equal(fs.existsSync(h.lock), true);
    assert.equal(h.invoke('release', '--agent-id', acquired.data.agentId, '--token', acquired.data.token).data.released, true);
    assert.equal(h.invoke('status').data.locked, false);
  });

  test(`${session.kind}: invalid acquisition writes nothing and manual runs stay explicit`, (t) => {
    const h = harness(t, session);
    assert.equal(h.invoke('acquire', '--schedule-id', 'schedule', '--run-id', 'invented').status, 1);
    assert.equal(h.invoke('acquire', '--schedule-id', 'schedule', '--agent-id', 'wrong').status, 1);
    h.set([runFor(session, { status: 'completed' })]);
    assert.equal(h.invoke('acquire', '--schedule-id', 'schedule').status, 1);
    assert.equal(fs.existsSync(h.lock), false);
    assert.equal(h.invoke('acquire', '--run-id', 'invented').status, 1);
    const manual = h.invoke('acquire', '--run-id', 'manual-repair');
    assert.equal(manual.data.acquired, true);
    assert.equal(manual.data.scheduleId, null);
    assert.equal(h.invoke('release', '--agent-id', manual.data.agentId, '--token', manual.data.token).status, 0);
  });

  test(`${session.kind}: completed exact holder can be recovered but unknown ownership stays locked`, (t) => {
    const h = harness(t, session);
    const acquired = h.invoke('acquire', '--schedule-id', 'schedule').data;
    h.set([runFor(session, { status: 'completed' }), runFor(session, { id: 'run-2' })],
      session.kind === 'terminal' ? inventory([terminal]) : inventory());
    if (session.kind === 'terminal') {
      assert.equal(h.invoke('acquire', '--schedule-id', 'schedule').status, 2);
      h.set([runFor(session, { status: 'completed' }), runFor(session, { id: 'run-2' })]);
    }
    const recovered = h.invoke('acquire', '--schedule-id', 'schedule');
    assert.equal(recovered.data.tookOverFrom.token, undefined);
    assert.equal(recovered.data.tookOverFrom.runId, acquired.runId);
    assert.equal(recovered.data.runId, 'run-2');
    assert.equal(h.invoke('release', '--agent-id', recovered.data.agentId, '--token', recovered.data.token).status, 0);
    fs.mkdirSync(h.lock);
    assert.equal(h.invoke('acquire', '--schedule-id', 'schedule').data.uncertain, true);
  });
}
