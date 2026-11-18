#!/usr/bin/env node
// Local automation coordination. No expiry or forced release.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

function orca(args) {
  const response = JSON.parse(execFileSync(process.env.ORCA_CLI_COMMAND || 'orca', [...args, '--json'],
    { encoding: 'utf8', timeout: 20_000, maxBuffer: 8 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] }));
  if (response.ok !== true) throw new Error(response.error?.message || 'Orca request failed');
  return response.result;
}

export function currentSession(env = process.env, call = orca) {
  if (env.ORCA_AGENT_SESSION_ID?.trim()) {
    return { kind: 'chat', chatSessionId: env.ORCA_AGENT_SESSION_ID };
  }
  const pane = env.ORCA_PANE_KEY || env.ORCA_AGENT_PANE;
  const workspace = env.ORCA_WORKSPACE_ID || env.ORCA_WORKTREE_ID;
  if (!env.ORCA_TERMINAL_HANDLE || !pane || !workspace) {
    throw new Error('Missing Orca chat identity or terminal handle, pane and workspace identity');
  }
  const terminal = call(['terminal', 'show', '--terminal', env.ORCA_TERMINAL_HANDLE]).terminal;
  if (!terminal || terminal.orphaned || terminal.connected !== true
    || terminal.worktreeId !== workspace || `${terminal.tabId}:${terminal.leafId}` !== pane
    || (env.ORCA_TAB_ID && terminal.tabId !== env.ORCA_TAB_ID) || !terminal.ptyId) {
    throw new Error('Orca terminal identity does not match the current pane and workspace');
  }
  return {
    kind: 'terminal',
    workspaceId: workspace,
    terminalSessionId: terminal.tabId,
    terminalPaneKey: pane,
    terminalPtyId: terminal.ptyId,
  };
}

export function sessionAgentId(session) {
  return session.kind === 'chat' ? session.chatSessionId : `terminal:${session.terminalPaneKey}`;
}

export function matchesSession(run, session) {
  if (session.kind === 'chat') {
    return (!run.sessionKind || run.sessionKind === 'chat') && !!session.chatSessionId
      && run.chatSessionId === session.chatSessionId;
  }
  return run.sessionKind === 'terminal' && run.workspaceId === session.workspaceId
    && !!session.terminalSessionId && run.terminalSessionId === session.terminalSessionId
    && !!session.terminalPaneKey && run.terminalPaneKey === session.terminalPaneKey
    && !!session.terminalPtyId && run.terminalPtyId === session.terminalPtyId;
}

export function resolveRun(scheduleId, session, call = orca) {
  const runs = call(['automations', 'runs', '--id', scheduleId]).runs;
  if (!Array.isArray(runs)) throw new Error('Orca returned no automation run inventory');
  const matches = runs.filter((run) => run.automationId === scheduleId
    && ['pending', 'dispatched'].includes(run.status) && matchesSession(run, session));
  if (matches.length !== 1 || !matches[0].id) {
    throw new Error(`Expected one active automation run matching this ${session.kind} session; found ${matches.length}`);
  }
  return { scheduleId, runId: matches[0].id, agentId: sessionAgentId(session), session };
}

// Completion is necessary but a CLI pane can remain alive after its run completes.
// Missing inventories, mismatches, failed dispatches and live panes keep the lock held.
export function holderFinished(owner, call = orca) {
  if (!owner.scheduleId || !owner.runId) return false;
  const session = owner.session ?? { kind: 'chat', chatSessionId: owner.agentId };
  if (sessionAgentId(session) !== owner.agentId) return false;
  try {
    const runs = call(['automations', 'runs', '--id', owner.scheduleId]).runs;
    if (!Array.isArray(runs)) return false;
    const matches = runs.filter((run) => run.id === owner.runId && run.automationId === owner.scheduleId);
    if (matches.length !== 1 || matches[0].status !== 'completed' || !matchesSession(matches[0], session)) return false;
    if (session.kind === 'terminal') {
      const inventory = call(['terminal', 'list', '--worktree', session.workspaceId]);
      if (!Array.isArray(inventory.terminals) || inventory.truncated !== false
        || !Array.isArray(inventory.hostScope?.omittedHostIds) || inventory.hostScope.omittedHostIds.length) return false;
      return !inventory.terminals.some((terminal) => terminal.ptyId === session.terminalPtyId
        || `${terminal.tabId}:${terminal.leafId}` === session.terminalPaneKey);
    }
    return true;
  } catch {
    return false;
  }
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  const flags = new Map();
  const allowed = new Set(['--state-dir', '--agent-id', '--run-id', '--schedule-id', '--owner-pid', '--token']);
  for (let i = 0; i < args.length; i += 2) {
    if (!allowed.has(args[i]) || !args[i + 1]?.trim() || flags.has(args[i])) {
      throw new Error('Expected unique supported --key value arguments');
    }
    flags.set(args[i], args[i + 1]);
  }
  const required = (name) => {
    const value = flags.get(name);
    if (!value) throw new Error(`${name} is required`);
    return value;
  };
  const stateDir = flags.get('--state-dir') ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.scratch/upstream-compat-watch');
  if (!path.isAbsolute(stateDir)) throw new Error('state-dir must be absolute');
  const lockDir = path.join(stateDir, 'run.lock');
  const ownerFile = path.join(lockDir, 'owner.json');

  function inspect() {
    try {
      const { token, ...owner } = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
      return { locked: true, owner };
    } catch (error) {
      if (error.code === 'ENOENT' && !fs.existsSync(lockDir)) return { locked: false };
      return { locked: true, uncertain: true, error: 'Owner metadata missing or unreadable; do not take over.' };
    }
  }
  function takeOverFinished() {
    const current = inspect();
    if (current.uncertain || !current.owner?.agentId || !holderFinished(current.owner)) return null;
    const stale = `${lockDir}.stale-${Date.now()}-${process.pid}`;
    try { fs.renameSync(lockDir, stale); } catch { return null; }
    fs.rmSync(stale, { recursive: true, force: true });
    return current.owner;
  }

  if (command === 'status') return inspect();
  if (command === 'resolve' || command === 'acquire') {
    const session = currentSession();
    let identity;
    if (flags.has('--schedule-id')) {
      identity = resolveRun(flags.get('--schedule-id'), session);
    } else {
      const runId = required('--run-id');
      if (!runId.startsWith('manual-')) throw new Error('Unscheduled work requires a manual- run ID');
      identity = { scheduleId: null, runId, agentId: sessionAgentId(session), session };
    }
    for (const [flag, key] of [['--agent-id', 'agentId'], ['--run-id', 'runId']]) {
      if (flags.has(flag) && flags.get(flag) !== identity[key]) throw new Error(`${flag} does not match the current Orca identity`);
    }
    if (command === 'resolve') return identity;
    const ownerPidText = flags.get('--owner-pid');
    const ownerPid = ownerPidText === undefined ? null : Number(ownerPidText);
    if (ownerPid !== null && (!Number.isSafeInteger(ownerPid) || ownerPid <= 0)) {
      throw new Error('owner-pid must be a positive integer');
    }
    fs.mkdirSync(stateDir, { recursive: true });
    let tookOverFrom = null;
    try { fs.mkdirSync(lockDir, { mode: 0o700 }); }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      tookOverFrom = takeOverFinished();
      try { if (tookOverFrom) fs.mkdirSync(lockDir, { mode: 0o700 }); }
      catch (retryError) { if (retryError.code !== 'EEXIST') throw retryError; tookOverFrom = null; }
      if (!tookOverFrom) {
        process.exitCode = 2;
        return { acquired: false, ...inspect() };
      }
    }
    const owner = {
      schemaVersion: 2,
      ...identity,
      ownerPid,
      acquisitionHelperPid: process.pid,
      acquiredAt: new Date().toISOString(),
      token: randomUUID(),
      ...(tookOverFrom ? { tookOverFrom } : {}),
    };
    // An interrupted metadata write leaves a locked/uncertain directory.
    fs.writeFileSync(ownerFile, JSON.stringify(owner, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { acquired: true, ...owner };
  }
  if (command === 'release') {
    const agentId = required('--agent-id');
    const token = required('--token');
    const owner = JSON.parse(fs.readFileSync(ownerFile, 'utf8'));
    if (owner.agentId !== agentId || owner.token !== token) throw new Error('Lock ownership mismatch');
    // The caller must first finish all owned writers and delegates.
    fs.unlinkSync(ownerFile);
    fs.rmdirSync(lockDir);
    return { released: true, agentId, runId: owner.runId };
  }
  throw new Error('Usage: lock.mjs status | resolve/acquire --schedule-id ID | acquire --run-id manual-ID | release --agent-id ID --token TOKEN');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { console.log(JSON.stringify(main())); }
  catch (error) {
    console.error(JSON.stringify({ error: error.message }));
    process.exitCode = 1;
  }
}
