# Changelog

## 0.1.0-beta.2 — 2026-09-18

- Target Paseo 0.9.0-beta.1 with exact SDK dependencies and a bounded 0.9 compatibility range.
- Verify the signed MaKa Desktop/CLI dev39 pair with real inference and installed Paseo follow-ups. Dev40 nightly requires runtime schema 19; its control protocol was tested only in isolated profiles.
- Preserve standard ACP tool events when emitted. Dev40's mapper was inspected; tool conversion is covered by synthetic peers, not a real dev40 tool run.
- Keep native session listing hidden because MaKa cannot resume those sessions. Add a nonempty-list regression so Paseo cannot offer imports that fail when opened.
- Pass typecheck, lint, and 16 tests on Node 22 and 24. MCP, interactive approvals, persistence, usage, and native mobile remain outside verified support.

## 0.1.0-beta.1 — 2026-09-14

- Initial MaKa ACP provider release for Paseo 0.8, with streamed thinking and replies, connected follow-ups, configuration selectors, cancellation, and owned-session cleanup.
