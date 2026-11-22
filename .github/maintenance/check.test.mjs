import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activeFollowupState,
  compare,
  followupChanges,
  includesMaintainedPaths,
  includesMaintainedRegistryRecord,
  isMaintainedApproval,
  isMaintainedIssue,
  summarizeActivity,
  verdictFor,
} from './check.mjs';

test('retired-only PR changes are skipped and maintained plugin or shared changes are kept', () => {
  const retired = ['plugins/agent-activity/README.md'];
  assert.equal(includesMaintainedPaths(retired), false);
  assert.equal(includesMaintainedPaths(['plugins/math-renderer/client/transform.ts']), true);
  assert.equal(includesMaintainedPaths([...retired, 'plugins/deepseek-harness/index.server.ts']), true);
  assert.equal(includesMaintainedPaths([...retired, '.github/maintenance/check.mjs']), true);
  assert.equal(includesMaintainedPaths(['README.md']), true);
});

test('registry PRs must touch an official maintained plugin record', () => {
  const retired = ['plugins/geoqiao/agent-activity.json'];
  assert.equal(includesMaintainedRegistryRecord(retired), false);
  assert.equal(includesMaintainedRegistryRecord(['plugins/someone/deepseek-harness.json']), false);
  assert.equal(includesMaintainedRegistryRecord([...retired, 'plugins/geoqiao/deepseek-harness.json']), true);
  assert.equal(includesMaintainedRegistryRecord(['plugins/geoqiao/math-renderer.json']), true);
});

test('CI approvals follow PR scope when fork run metadata omits the PR', () => {
  const prs = [{ number: 1, headRefOid: 'retired' }, { number: 2, headRefOid: 'shared' }];
  const maintained = new Set([2]);
  const approval = (run) => isMaintainedApproval(run, prs, maintained);
  assert.equal(approval({ event: 'pull_request', pull_requests: [], head_sha: 'retired' }), false);
  assert.equal(approval({ event: 'pull_request', pull_requests: [], head_sha: 'shared' }), true);
  assert.equal(approval({ event: 'pull_request', pull_requests: [{ number: 1 }] }), false);
  assert.equal(approval({ event: 'workflow_dispatch', head_branch: 'deepseek-harness-v0.1.0-beta.21' }), true);
  assert.equal(approval({ event: 'workflow_dispatch', head_branch: 'math-renderer-v0.1.0-beta.8' }), true);
  assert.equal(approval({ event: 'workflow_dispatch', head_branch: 'readable-agent-activity-v0.1.0-beta.14' }), false);
});

test('retired-only issues are skipped and maintained plugin or shared reports are kept', () => {
  assert.equal(isMaintainedIssue({ title: 'Math Renderer: formula display' }), true);
  assert.equal(isMaintainedIssue({ title: 'Tool display', labels: [{ name: 'agent-activity' }] }), false);
  assert.equal(isMaintainedIssue({ title: 'DeepSeek Harness session reopens' }), true);
  assert.equal(isMaintainedIssue({ title: 'Provider not found', body: 'This is with DSH' }), true);
  assert.equal(isMaintainedIssue({ title: 'Math Renderer and Readable Agent Activity interact' }), true);
  assert.equal(isMaintainedIssue({ title: 'Archive Readable Agent Activity CI', labels: [{ name: 'CI' }] }), true);
  assert.equal(isMaintainedIssue({ title: 'Release workflow check failed' }), true);
});

test('retired state and baseline items are skipped without a false closure', () => {
  const retiredIssue = 'https://github.com/getpaseo/paseo/issues/8875';
  const retiredPending = { id: 'upstream-transformed-work-folding', upstreamIssue: retiredIssue, status: 'waiting_upstream' };
  const maka = { id: 'retired-cafe-delisting', pullRequest: 'https://github.com/paseo-cafe/paseo-cafe/pull/453', status: 'waiting_upstream_merge' };
  const dshIssue = 'https://github.com/deepseek-ai/deepseek-harness/issues/12';
  const state = { trackedUpstream: [retiredIssue, dshIssue], pending: [retiredPending, maka] };
  assert.deepEqual(activeFollowupState(state), { tracked: [dshIssue], pending: [maka] });

  const retiredRepoIssue = 'https://github.com/geoqiao/paseo-stuff/issues/4';
  const old = [
    { kind: 'state_pending', id: retiredPending.id },
    { kind: 'tracked_upstream', url: retiredIssue },
    { kind: 'registry_behind', id: 'geoqiao/agent-activity' },
    { kind: 'open_issue', url: retiredRepoIssue },
    { kind: 'state_pending', id: maka.id, status: maka.status },
  ];
  const current = [old.at(-1)];
  assert.deepEqual(followupChanges(old, current, new Set([retiredRepoIssue])), []);
  const mathRegistry = { kind: 'registry_behind', id: 'geoqiao/math-renderer' };
  assert.deepEqual(followupChanges([], [mathRegistry]), [{ kind: 'followup_changed', item: mathRegistry }]);
});

test('unchanged waiting work does not wake repeated maintenance', () => {
  const pending = [{ kind: 'open_pr', url: 'https://github.com/a/b/pull/1', head: 'a', fingerprint: 'same' }];
  const changes = followupChanges(pending, structuredClone(pending));
  assert.deepEqual(changes, []);
  assert.equal(verdictFor({}, [], changes, []), 'NO_CHANGE');
});

test('new comments, edits, reviews, checks and heads trigger follow-up', () => {
  const original = { comments: [{ body: 'old', author: { login: 'contributor' } }], headRefOid: 'a' };
  const before = { kind: 'open_pr', url: 'https://github.com/a/b/pull/1', ...summarizeActivity(original) };
  for (const patch of [
    { comments: [...original.comments, { body: 'fixed' }] },
    { comments: [{ ...original.comments[0], body: 'edited' }] },
    { reviews: [{ state: 'CHANGES_REQUESTED' }] },
    { statusCheckRollup: [{ conclusion: 'FAILURE' }] },
    { headRefOid: 'b' },
  ]) {
    const after = { ...before, ...summarizeActivity({ ...original, ...patch }) };
    assert.equal(followupChanges([before], [after]).length, 1);
  }
});

test('closed own items and upstream state changes remain visible', () => {
  const item = { kind: 'tracked_upstream', url: 'https://github.com/a/b/pull/1', state: 'OPEN' };
  assert.equal(followupChanges([item], [{ ...item, state: 'MERGED' }])[0].kind, 'followup_changed');
  assert.equal(followupChanges([item], [])[0].kind, 'followup_closed');
});

test('a waiting item becomes actionable when its review date arrives', () => {
  const item = { kind: 'state_pending', id: 'registry-bump', due: false };
  assert.equal(followupChanges([item], [{ ...item, due: true }]).length, 1);
});

test('source errors win over no changes and pending work', () => {
  assert.equal(verdictFor({}, [], [], ['GitHub unavailable']), 'ERROR');
  assert.equal(verdictFor({}, [], [{}], ['npm unavailable']), 'ERROR');
  assert.equal(verdictFor(null, [], [], []), 'REVIEW');
  assert.equal(verdictFor({}, [{}], [], []), 'REVIEW');
  assert.equal(verdictFor({}, [], [{}], []), 'PENDING_FOLLOWUP');
});

test('npm next and published integrity changes are independently detected', () => {
  const before = { npm: { dsh: { distTags: { latest: '1', next: '1' }, versions: { '1': 'old' } } } };
  const after = { npm: { dsh: { distTags: { latest: '1', next: '2' }, versions: { '1': 'new', '2': 'second' } } } };
  const changes = compare(before, after);
  assert.ok(changes.some((c) => c.kind === 'dist_tag' && c.tag === 'next'));
  assert.ok(changes.some((c) => c.kind === 'version_added' && c.version === '2'));
  assert.ok(changes.some((c) => c.kind === 'version_integrity_changed' && c.version === '1'));
});

test('release page rollover is not treated as an upstream deletion', () => {
  const old = { publishedAt: '2026-01-01T00:00:00Z', tag: 'v1' };
  const recent = { publishedAt: '2026-02-01T00:00:00Z', tag: 'v2' };
  assert.deepEqual(compare({ github: { repo: { old, recent } } }, { github: { repo: { recent } } }), []);
});
