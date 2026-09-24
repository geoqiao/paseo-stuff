# MaKa upstream release maintenance

> **Paused on 2026-09-24.** The plugin is unmaintained and no longer tracked by the daily
> upstream check. Keep this procedure for reviving the provider; it is not an active process.

This procedure covers compatibility updates to `plugins/maka` in `geoqiao/paseo-stuff`.
The initial verified baseline is MaKa `v0.2.0-dev.31.20260913`, commit
`0d4a6ba5f48de6807ab96d6b5aad3635cc6a1f57`, and plugin `0.1.0-beta.1`.
See [verification.md](verification.md) for the tested behavior and remaining gaps.

## Detect relevant changes

1. Read the repository instructions, current plugin code, verification record, and the last
   local monitoring state before making changes. Fetch the canonical remote without discarding
   local work. Resume any recorded incomplete update before starting a second one.
2. Read published releases from `apache/maka`, including prereleases. Do not rely on the
   GitHub `/releases/latest` endpoint: the supported MaKa build is itself a prerelease.
   Compare release IDs, tags, target commits, and release updates with the previous check.
   On first use, start from the verified baseline rather than treating all historical tags as new.
3. Read release notes and the actual tagged code changes. Focus on `packages/cli/src/acp/`,
   its tests, the ACP SDK dependency, and referenced public Runtime Host contracts. Cover tool
   events/results/usage, client-supplied MCP servers, interactive permissions/questions, and
   session loading/resumption. Also check breaking changes to initialization, configuration,
   prompt content, cancellation, stream identity, and close behavior used by this plugin.
4. Distinguish an ACP wire capability from a native Runtime Host feature or an unreleased plan.
   Release text alone is insufficient evidence to enable a capability. If releases contain no
   relevant change, record that result and leave plugin versions and releases untouched.

## Implement and verify

- Work in an isolated branch/workspace when the shared checkout is in use or contains unrelated
  changes. Check for an existing maintenance PR first. Keep work scoped to this plugin and its
  required CI/documentation entries; do not introduce a second provider ID.
- Use public Paseo APIs and the official MaKa ACP boundary. Read the version-matching Paseo
  provider documentation before changing a protocol mapping.
- For newly supported behavior, update both the wire mapping and the plugin's capability/input/
  event guards. Merely deleting `UNSUPPORTED_CAPABILITIES` entries is not an implementation.
  Preserve truthful behavior on older supported MaKa versions through real negotiation or an
  explicit, verified minimum version; never fabricate tool results, approvals, or restored history.
- Add focused protocol/regression tests for changed behavior, then run `npm run check` from the
  plugin directory and the required Node.js 22/24 CI checks. Exercise the official candidate ACP
  executable separately from fake peers before claiming new upstream support.
- Use an isolated MaKa state root/profile and a temporary project for candidate-version tests,
  after reading that release's official isolation instructions. Do not run a newer CLI against
  the normal profile merely to probe it: Desktop and CLI share versioned storage. Credentials,
  personal transcripts, temporary files, and raw logs must remain outside Git.
- Verify real behavior that changed: tool lifecycle and results; an MCP tool reached from the
  client configuration; allow/deny/cancel for approvals; or persistence across a fresh ACP
  connection for restoration. Preserve the existing streaming, follow-up, Stop, and close
  contracts. Record missing live evidence as a blocker, not a successful check.

## Publish and apply

1. Bump the plugin's own semantic version and npm lockfile, update the pinned installation tag,
   supported MaKa version, limitations, and verification record. Each plugin release uses the
   immutable Git tag `maka-v<package.json.version>`.
2. Open or update the maintenance PR in `geoqiao/paseo-stuff`, require its checks to pass, review
   the final diff, and merge it. Publish a GitHub release at the merge commit. Keep beta releases
   marked as prereleases. Do not retag or replace an existing release.
3. Update the configured local installation only after checking its exact source, runtime ID,
   target daemon, enablement, and current MaKa sessions. Typecheck before reload. Preserve
   disabled status, never create a duplicate installation, and never reload during active work:
   this plugin's close path cancels its owned native turns. Defer local application until idle
   when necessary, retaining that pending step in monitoring state. Never restart the daemon.
4. A plugin release does not authorize changing the machine's MaKa CLI/Desktop or migrating the
   normal profile. If local activation needs those changes, publish the independently verified
   compatible plugin and report the exact local prerequisite. Do not silently install a second
   old Desktop application or weaken permission settings.

## Monitoring records and completion

Keep private run state under `.scratch/maka-release-watch/` in the canonical checkout. Record
`lastCheckedAt`, reviewed release identities, the last fully integrated upstream tag, pending
PR/release/local-application work, and bounded evidence/report paths. Mark a release integrated
only after verification and publication succeed; retain failed or blocked updates for retry.
Persist state atomically. Network/auth/provider failures are failed checks, not "no updates".

Report in Chinese: checked releases, relevant capability changes, verification results,
PR/release links, local application status, and concrete blockers. Keep no-change reports short.
Respect the parent workflow's Paseo resource rules: only close resources created for this work,
collect and archive completed delegates when no longer needed, and preserve pinned or unsafe-to-
delete workspaces. A scheduled run must not archive its own current agent/workspace or create
another recurring schedule/heartbeat. Leave its final report in the schedule run history.
