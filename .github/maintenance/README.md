# Daily maintenance

The Orca automation **Paseo Stuff 每日维护** runs at **08:00 Asia/Shanghai**.
It reads [prompt.md](prompt.md) from the canonical checkout and follows DeepSeek
Harness (DSH), Math Renderer and shared repository maintenance. Each plugin's
minimum SDK pin stays in its package. CI tool locks use verified Paseo and
official DSH versions.

## Entry points

```sh
node .github/maintenance/check.mjs check
node --test .github/maintenance/*.test.mjs
```

Runtime state, candidate snapshots, drafts and evidence are local under
`.scratch/upstream-compat-watch/`. Set `PASEO_MAINTENANCE_STATE_DIR` to an absolute
directory for an isolated detector check. Preserve the production baseline when
testing.

The detector compares official Paseo and DSH releases, npm channels and
integrity, both maintained plugins' registry activity and URLs tracked in
`state.json`. Repository PRs that touch maintained plugin or shared paths, their
CI approvals and related issue activity are in scope. Issues without a plugin
identifier can be triaged as shared reports. Activity specific to Readable Agent
Activity is skipped. Unchanged waiting items do not trigger more work.
A source error returns `ERROR`, never `NO_CHANGE`. After reviewing every detected
change and recording verification or a concrete pending item, run
`node .github/maintenance/check.mjs accept`. Never accept an error snapshot.

Use `orca automations runs --id <automation-id>` to confirm the current run. Pass
the actual Orca session, run and automation IDs to
`lock.mjs acquire --agent-id ID --run-id ID --schedule-id ID`. Release with the
returned token after all writers finish. An occupied Orca lock requires
operator review if its owner cannot release it.

## Operational boundaries

The daily result is the status surface: last successful check, changes processed,
waiting items and exact user actions. Since 2026-11-11, standing authorization
covers DSH and shared maintenance fixes, tests, commits, branch pushes, PR creation and updates, verified
replies, merging after checks and review, and releases through the existing
GitHub Release → npm trusted-publishing workflow in `geoqiao/paseo-stuff`.
Verify the published package, version, dist-tag and workflow before recording a
release as complete. Documentation-only changes do not require a plugin release.
Record public text and resulting URLs; never duplicate a PR or overwrite a
published version. Follow the detailed gates in [prompt.md](prompt.md).
For Math Renderer, the automation prepares local evidence and drafts. Each push,
PR, comment, review, merge or release requires separate authorization.
External-repository writes, issue closure, destructive changes, paid services and
main-daemon/plugin installation changes still require separate authorization;
first npm publication and interactive authentication remain owner actions.

Resume actionable pending work even when the detector reports `NO_CHANGE`,
including items previously blocked only on push, PR, merge or release permission.
Store all evidence and recovery steps in the canonical checkout's state directory.
Orca starts a fresh session each time in the existing canonical checkout.
Stop owned services, finish any delegated tasks and release the coordination
lock before ending. Persist external blockers in the state directory.

A merged upstream fix stays pending until a released tag contains it and the
affected plugin behavior has been verified. A green unit suite is not a native
device check. Preserve each maintained plugin's recorded verification limits.

This is a local Orca automation. After downtime, compare against the last
successful baseline to catch intervening changes. Use Orca's task and run
records to confirm the automation is active.
