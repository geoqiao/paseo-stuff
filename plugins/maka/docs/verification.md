# Verification

Verification date: 2026-09-18 UTC.

## Runtime and release evidence

Plugin version 0.1.0-beta.2 targets Paseo
0.9.0-beta.1 with exact 0.9.0-beta.1 client, plugin, and protocol packages and ACP SDK
1.4.0. The checks below preceded publication of the pinned prerelease.

The signed MaKa release used for the normal profile is 0.2.0-dev.39.20260916:

- The official GitHub release is v0.2.0-dev.39.20260916.
- MaKa Desktop and the global CLI both report 0.2.0-dev.39.20260916.
- The npm package integrity is
  sha512-1yQ8xnVSepi+q+yGEDV63RKY4O281n2/2YGdEkkXGpihH6A1xyI1SD9C/j0PoQJlAgWWupWWkW4oLQWsmZoOtw==.
- The macOS arm64 ZIP matched SHA-256
  48271132a47088db74dfa70ec169f23a9f8c034bac44224c8eb0fde96f808f43.
  The staged application passed codesign --verify --deep --strict and macOS notarization
  assessment before replacement.

The newer npm nightly 0.2.0-dev.40.20260917 was inspected and tested only in temporary
profiles. Its package integrity is
sha512-87VI79VN+wai7CEj3pXuuFjs1qf4dowhFZKsdgl8bOZBjZafL0bnRueBpdOSDEf9ePP6KkQ4Fh5cWO1mJFzZRw==.
It raises the runtime schema from 18 to 19, while the signed dev39 release keeps runtime
schema 18. The normal profile therefore uses the matching signed dev39 Desktop and CLI.

Before the upgrade, the normal profile reported runtime schema 18, session metadata 39, and usage
schema 7 under Desktop/CLI dev38. After the compatible Desktop launch and dev39 CLI check it
reported runtime schema 18, session metadata 39, and usage schema 9. No schema downgrade or
forced migration was used. MaKa Desktop opened the normal profile, and was then quit gracefully.
The old application bundle remains at `/Applications/Maka.app.pre-dev38.20260916`.
Restoring that bundle alone is not a verified database downgrade. Credentials, settings,
and profile contents were not exported or printed.

No MaKa shell or tool operation was active before the Desktop replacement. The bounded real CLI
check used a temporary project directory, sent a text-only prompt, closed the ACP session, and
exited cleanly. It received the exact sentinel MAKA_PASEO_REAL_OK from MaKa dev39.

## Upstream ACP behavior

The official dev39 ACP source advertises session listing and closing. It does not implement ACP
load/resume, persistence restoration, permission/question interaction, MCP forwarding, or usage
updates. Session creation uses MaKa's configured default model and does not expose model selection.

The dev40 npm nightly adds standard ACP tool-call and tool-call-update mapping for tool start,
output deltas, progress, previews, and final results, as confirmed by inspecting its bundled
mapper. The plugin preserves these events and the public Paseo 0.9 shim renders bounded tool
output and progress. Tool lifecycle conversion was exercised through the synthetic
fake-maka.mjs peer and public shim; the isolated dev40 public-shim run covered initialization,
catalog, and session-list events only and did not emit a dev40 tool lifecycle.

The native MaKa session/list capability is deliberately withheld from Paseo. Paseo maps each
listed result into an import offering and later supplies persistence when opening it; MaKa cannot
load that session. The plugin masks session.list, rejects sessions requests, and filters any
session-list event. A regression fixture advertises a non-empty native list and verifies that the
Paseo connection exposes no session.list capability and rejects the import request before an
unopenable offering can be emitted.

## Automated and live checks

The plugin check uses the public Paseo 0.9 ACP shim and synthetic ACP peers. It covers:

- catalog discovery and MaKa selector configuration;
- masking native session listing when resume is unavailable;
- standard ACP tool-call and tool-call-update conversion into Paseo tool cards;
- streamed thinking and answer chunks with shared native IDs;
- isolated working directories and environment;
- MCP omission and notice delivery;
- unsupported commands, images, steering, permissions, persistence, archive, revert, and
  unarchive inputs;
- prompt errors, cancellation, EOF, startup failure, and bounded disposal.

The final check passed under Node.js 22 and Node.js 24 with TypeScript, oxlint, and 16 tests. The
same check also passed under the installed Node.js 26.8.2 runtime. The checks do not require model
credentials.

A direct raw ACP probe against dev40 in a temporary HOME reported version 0.2.0-dev.40.20260917,
session capabilities list and close, created a session with three config options, and listed the
temporary session. A direct public Paseo ACP shim probe against that same isolated process
negotiated prompt.message, session.configure, and session.list, then received catalog and sessions
events only. No normal credentials or profile database was visible to either probe. No dev40
inference or tool lifecycle was attempted in the isolated profile.

The normal-profile dev39 ACP probe was the bounded inference check. It initialized, created a
session, returned MAKA_PASEO_REAL_OK, closed the session, and left no running MaKa process.

The enabled `maka` plugin was reloaded on the existing Paseo 0.9.0-beta.1 daemon at
2026-09-18T05:38:50Z and reached ready. Public provider/model discovery exposed MaKa configured
default and its Default/Low/High/Max thinking options. A fresh installed-host MaKa agent returned
the exact requested sentinel, then recalled a synthetic token in a second turn without the token
being repeated in that prompt. Its complete timeline contained no tool calls. Both turns finished
with no pending permissions, and the test agent was archived through Paseo. New plugin log entries
contain only loading/ready, without stderr. This verifies the installed provider path, not the
Desktop picker's pixels. The Paseo daemon and app were not restarted.

## Supported boundaries and limits

- Follow-up prompts work while a session remains connected.
- Native MaKa session listing exists upstream but is intentionally hidden by this plugin until
  load/resume support exists.
- MaKa's configured default model and collaboration/thinking selectors are supported.
- Standard ACP tool events are supported when emitted by the installed MaKa build.
- MCP servers, interactive permissions/questions, image prompts, provider commands, prompt
  steering, persistence, imported history, resume/load, and usage updates are unsupported.
- The plugin does not apply Paseo custom system prompts, provider options, or tool policy to MaKa.
- The signed dev39 normal profile was the installed live target. The dev40 nightly requires a
  Desktop release that supports its runtime schema 19 before it can be used with that profile.
- Mobile, narrow-layout, light-theme, and post-reload Paseo UI pixels were not exercised in this
  migration. The installed provider conversation was verified through public Paseo APIs.

## Sources

- [Paseo plugin provider reference for 0.9.0-beta.1](https://github.com/getpaseo/paseo/blob/v0.9.0-beta.1/public-docs/plugins/providers.md)
- [Paseo plugin reference for 0.9.0-beta.1](https://github.com/getpaseo/paseo/blob/v0.9.0-beta.1/public-docs/plugins/reference.md)
- [Paseo migration notes for 0.9.0-beta.1](https://github.com/getpaseo/paseo/blob/v0.9.0-beta.1/public-docs/plugins/migration.md)
- [MaKa signed release v0.2.0-dev.39.20260916](https://github.com/apache/maka/releases/tag/v0.2.0-dev.39.20260916)
- [MaKa dev39 ACP README](https://github.com/apache/maka/blob/v0.2.0-dev.39.20260916/packages/cli/src/acp/README.md)
- [MaKa dev39 ACP agent](https://github.com/apache/maka/blob/v0.2.0-dev.39.20260916/packages/cli/src/acp/maka-acp-agent.ts)
- [MaKa dev39 session registry](https://github.com/apache/maka/blob/v0.2.0-dev.39.20260916/packages/cli/src/acp/session-registry.ts)
- [MaKa nightly package 0.2.0-dev.40.20260917](https://www.npmjs.com/package/maka-agent/v/0.2.0-dev.40.20260917)
- [Paseo MaKa upstream maintenance guide](upstream-maintenance.md)

Credentials, personal transcripts, local host configuration, and raw live logs are excluded from
the repository.
