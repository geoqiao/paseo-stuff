# ACP reasoning compatibility

Paseo SDK 0.9.2 and 0.10.1 accumulate thought and answer text under the same
explicit `messageId`: [`resolveChunkId()` ignores chunk kind](https://github.com/getpaseo/paseo/blob/v0.10.1/packages/plugin/src/server/acp-internal/connection.ts#L922).
DSH uses one native message ID for both, so the SDK prepends reasoning to the
answer. The bridge temporarily appends `:thought` only to nonempty string IDs
on `agent_thought_chunk` notifications. Assistant IDs, text, and other fields
are unchanged; missing, null, empty, or malformed IDs retain existing behavior.
ACP 1.4.0 defines `MessageId` as a string (`zMessageId = z.string()`), so the
suffix needs no UUID conversion. Reconsider this shim when Paseo fixes the
upstream adapter. It assumes native DSH IDs do not occupy the suffixed thought
namespace; observed DSH message IDs are UUIDs.

Verified 2026-09-29 with synthetic ACP peers and the real `runAcpProvider()`:

- SDK 0.9.2: the nine tests in `server/reasoning.test.ts` went from eight
  failures plus the passing no-ID control to nine passes. Typecheck, lint,
  and the full suite pass (74 tests / 3 files).
- Installed Paseo 0.10.1 SDK: the same nine cases changed from eight failures
  to nine passes. For this isolated check, TypeScript was transpiled locally,
  the test registration import was changed from Vitest to `node:test`, and the
  SDK import targeted the app's bundled module. Electron's helper ran in Node
  mode; the installed plugin and daemon were not reloaded or modified.
- Cases cover exact `Thinking.` / `Answer.` separation, multiple chunks,
  thought/text interleaving with stable IDs, unchanged answer `messageId`,
  no-ID fallback grouping, native load, and the load-to-resume translation.
  History updates before load acknowledgment are checked at the bridge
  boundary; SDK integration checks turns after restore. DSH currently resumes
  without replay, and the SDK may drop pre-acknowledgment replay because it
  assigns its native session ID after the load response. This shim does not
  change that separate limitation or the SDK's grouping of interleaved blocks.

No paid model calls, live plugin reload, desktop UI, or on-device mobile checks
were performed for this mitigation. It does not repair already-stored host
timeline items. The plugin's minimum Paseo requirement is unchanged.
