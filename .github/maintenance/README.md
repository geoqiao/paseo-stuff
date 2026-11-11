# Daily maintenance

One Paseo schedule runs at **08:00 Asia/Shanghai**. It reads
[prompt.md](prompt.md) from the canonical checkout, checks new GitHub activity and
upstream releases, then works only on changes. No hourly poller or heartbeat is
needed.

The maintained plugins are Readable Agent Activity, Math Renderer and DeepSeek
Harness. Minimum SDK pins stay in their packages; CI tool locks use the current
verified Paseo and official DSH release.

## Entry points

```sh
node .github/maintenance/check.mjs check
node --test .github/maintenance/check.test.mjs
```

Runtime state, candidate snapshots, drafts and evidence are local under
`.scratch/upstream-compat-watch/`. Set `PASEO_MAINTENANCE_STATE_DIR` to an absolute
directory for an isolated detector check. Preserve the production baseline when
testing.

The detector compares releases, npm channels and integrity, open issue comments,
PR heads/reviews/checks, registry records, CI approval requests, and URLs listed
in `state.json.trackedUpstream`. Unchanged waiting items do not trigger more work.
A source error returns `ERROR`, never `NO_CHANGE`. After reviewing every detected
change and recording verification or a concrete pending item, run
`node .github/maintenance/check.mjs accept`. Never accept an error snapshot.

Use `lock.mjs acquire --agent-id ID --run-id ID --schedule-id ID` before writing
state or code; release with the returned token after all writers finish. Unknown
lock ownership blocks writes. Use the actual current daemon and schedule IDs.

## Operational boundaries

The daily result is the status surface: last successful check, changes processed,
waiting items and exact user actions. Since 2026-11-11, standing authorization
covers fixes, tests, commits, branch pushes, PR creation and updates, verified
replies, merging after checks and review, and releases through the existing
GitHub Release → npm trusted-publishing workflow in `geoqiao/paseo-stuff`.
Verify the published package, version, dist-tag and workflow before recording a
release as complete. Documentation-only changes do not require a plugin release.
Record public text and resulting URLs; never duplicate a PR or overwrite a
published version. Follow the detailed gates in [prompt.md](prompt.md).
External-repository writes, issue closure, destructive changes, paid services and
main-daemon/plugin installation changes still require separate authorization;
first npm publication and interactive authentication remain owner actions.

Resume actionable pending work even when the detector reports `NO_CHANGE`,
including items previously blocked only on push, PR, merge or release permission.
Store all evidence and recovery steps in the canonical checkout's state directory.
The schedule uses local isolation with `target.config.archiveOnFinish=true`:
Paseo archives each run's workspace and agent after it ends, leaving project files
intact. Stop owned services, finish delegates and release the coordination lock
before ending. Persist external blockers for the next run instead of retaining
daily conversations.

A merged upstream fix stays pending until a released tag contains it and the
affected plugin behavior has been verified. A green unit suite is not a native
device check. Preserve each plugin's recorded verification limits.

This is a local schedule: the computer and Paseo daemon must be running. It has
no independent off-host outage alarm. On resumption, compare against the last
successful baseline to catch intervening changes. The checked-in entrypoints
allow recreating the task after daemon migration; local schedule metadata alone
does not mean a task still exists.
