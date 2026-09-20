# Changelog

## 0.1.0-beta.4 — 2026-09-20

- Track MaKa `.43`'s standard ACP permission bridge through Paseo's public permission flow.
- Preserve explicit failure for question/form elicitation because Paseo 0.9's ACP shim does not
  expose `elicitation/create` to providers.
- Add synthetic approval and unsupported-elicitation regressions; real `.43` tool execution and
  approval remain pending isolated model configuration.

## 0.1.0-beta.3 — 2026-09-19

- Confirm the published MaKa `.41`/`.42` ACP line and its standard tool-call/tool-call-update mapping.
- Preserve the existing public-shim adapter path; add a regression for cumulative tool updates before an authoritative result.
- Probe the official `.42` ACP executable in isolated roots. MCP remains rejected, session load remains unavailable, and real `.42` tool execution remains unverified without a configured isolated model.

## 0.1.0-beta.2 — 2026-09-18

- Target Paseo 0.9.0-beta.1 with exact SDK dependencies and a bounded 0.9 compatibility range.
- Verify the signed MaKa Desktop/CLI dev39 pair with real inference and installed Paseo follow-ups. Dev40 nightly requires runtime schema 19; its control protocol was tested only in isolated profiles.
- Preserve standard ACP tool events when emitted. Dev40's mapper was inspected; tool conversion is covered by synthetic peers, not a real dev40 tool run.
- Keep native session listing hidden because MaKa cannot resume those sessions. Add a nonempty-list regression so Paseo cannot offer imports that fail when opened.
- Pass typecheck, lint, and 16 tests on Node 22 and 24. MCP, interactive approvals, persistence, usage, and native mobile remain outside verified support.

## 0.1.0-beta.1 — 2026-09-14

- Initial MaKa ACP provider release for Paseo 0.8, with streamed thinking and replies, connected follow-ups, configuration selectors, cancellation, and owned-session cleanup.
