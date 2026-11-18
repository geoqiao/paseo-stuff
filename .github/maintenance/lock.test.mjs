import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('Paseo lock stays with a live holder and transfers after archival', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'paseo-lock-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('./lock.mjs', import.meta.url));
  fs.writeFileSync(path.join(dir, 'paseo'), `#!/usr/bin/env node
if (process.argv.slice(2).join(' ') !== 'inspect first --json') process.exit(1);
console.log(JSON.stringify({ Id: 'first', Archived: process.env.ARCHIVED === 'true' }));
`, { mode: 0o700 });
  function invoke(archived, ...args) {
    const result = spawnSync(process.execPath, [cli, ...args, '--state-dir', dir], {
      encoding: 'utf8',
      env: { ...process.env, PATH: dir + path.delimiter + process.env.PATH, ARCHIVED: String(archived) },
    });
    return { status: result.status, data: JSON.parse(result.stdout || result.stderr) };
  }
  const first = invoke(false, 'acquire', '--agent-id', 'first', '--run-id', 'run-1');
  assert.equal(first.status, 0);
  const request = ['acquire', '--agent-id', 'second', '--run-id', 'run-2'];
  const blocked = invoke(false, ...request);
  assert.equal(blocked.status, 2);
  assert.equal(blocked.data.owner.runId, 'run-1');
  const recovered = invoke(true, ...request);
  assert.equal(recovered.status, 0);
  assert.equal(recovered.data.tookOverFrom.runId, 'run-1');
  assert.equal(invoke(true, 'release', '--agent-id', 'first', '--token', first.data.token).status, 1);
  assert.equal(invoke(true, 'release', '--agent-id', 'second', '--token', recovered.data.token).status, 0);
});
