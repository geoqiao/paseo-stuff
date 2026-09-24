# Changelog

## 0.1.0-beta.6 — 2026-09-24

- Add the published DSH `0.1.7-rc.1` CLI/ACP closure to the exact runtime
  guard after an isolated official-closure ACP probe and a production provider
  factory initialize/close check.
- Retain exact rejection of untested DSH versions, the narrow
  `session/load` to `session/resume` bridge, typed tool output projection,
  opaque model IDs, and the existing no-auto-approval policy.
- Update the pinned installation reference and verification record. No model
  prompt or paid inference was used for this upstream compatibility check.

## 0.1.0-beta.5 — 2026-09-23

- Add the published DSH `0.1.7-alpha.2` CLI/ACP closure to the exact runtime
  guard after an isolated official-closure ACP probe and a production provider
  factory initialize/close check.
- Retain the narrow `session/load` to `session/resume` bridge, typed tool
  output projection, opaque model IDs, and the existing no-auto-approval policy.
- Update the pinned installation reference and verification record. No model
  prompt or paid inference was used for this upstream compatibility check.

## 0.1.0-beta.4 — 2026-09-18

- Migrate the plugin's exact Paseo SDK dependencies to `0.9.0-beta.1` and
  bound the manifest to `>=0.8.0 <0.10.0`.
- Add the published DSH `0.1.6-alpha.2` CLI/ACP closure to the exact runtime
  gate after real ACP control-surface and provider checks; retain `0.1.5-rc.1`
  and `0.1.5-rc.2` support.
- Keep the narrow `session/load` to `session/resume` bridge and typed tool
  output projection because both tested DSH ACP closures advertise resume
  without legacy load support.
- Verify the latest alpha's real persistence reopen and typed read-tool output
  with bounded synthetic prompts, without changing approval policy.
- Update pinned installation instructions and verification records for Paseo 0.9
  beta and the alpha DSH release.

## 0.1.0-beta.3

- Move development and releases to `geoqiao/paseo-stuff`, subdirectory `plugins/deepseek-harness`, retaining the `deepseek-harness` plugin ID.
- Update repository metadata, installation instructions and the existing Cafe pointer. Runtime and dependencies are unchanged from beta.2.
- Old standalone release tags remain unchanged. Installed Git sources do not migrate automatically; preserve the existing runtime ID and enable/disable choice when switching sources.

## 0.1.0-beta.2

- Follow-up to a separate code review; see `docs/code-review.md`.
- Redact JSON-quoted and space-separated credential labels in startup diagnostics,
  including escaped quoted values. Tests use synthetic secrets only.
- Preserve the version-probe timeout cause instead of reporting its cleanup exit.
- Report missing executable/cwd ambiguity honestly, and identify stable/build
  versions without accepting an untested prefix.
- Remove a redundant connection reference and clarify environment propagation.
- Typecheck/lint and 32 tests pass, including 13 additional regression cases.

## 0.1.0-beta.1

Initial beta release.

- Registers DeepSeek Harness as a Paseo provider with the public ACP shim.
- Launches the official DSH ACP profile without a shell.
- Bridges DSH session/resume to the shim private session/load expectation
  only when the initialized peer advertises resume but not load.
- Preserves DSH model, reasoning, MCP, image, tool, usage, permission and
  cancellation behavior without local session or credential storage.
- Supports and tests DSH 0.1.5-rc.1 and 0.1.5-rc.2.
- Closes connector resources during version probing, initialization and active
  prompts without allowing a post-close ACP child spawn.
- Owns pending connects and already-closing connections in async entry cleanup,
  fixing the installed-host IPC shutdown acknowledgement race.
- Records separate live public-SDK verification for both CLI versions; see the
  README for the exact scope and desktop/mobile limitations.
- Passes 19 automated tests and a repeated installed macOS Paseo 0.8.0 cycle:
  clean stop/start, complete tool output, restored context and retained history.
