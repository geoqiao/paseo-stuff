# ACP reasoning compatibility

DSH's ACP bridge (`@deepseek-ai/dsh-acp`, `assistantUpdates`, still present in
0.1.7-rc.2 and 0.2.0-rc.1) sends a message's `agent_thought_chunk` and
`agent_message_chunk` with the same `messageId`. ACP v1
([Prompt Turn → Message IDs](https://agentclientprotocol.com/protocol/prompt-turn))
says chunks with the same `messageId` belong to the same message, and a thought
and an answer are different messages. Paseo SDK 0.9.2 and 0.10.1 follow that
rule: [`resolveChunkId()`](https://github.com/getpaseo/paseo/blob/v0.10.1/packages/plugin/src/server/acp-internal/connection.ts#L922)
keys buffers by the explicit ID regardless of chunk kind, so the reasoning is
prepended to the answer. Reported upstream as
[deepseek-harness#8235](https://github.com/deepseek-ai/deepseek-harness/discussions/8235).

The bridge appends `:thought` only to nonempty string IDs on
`agent_thought_chunk` notifications. Assistant IDs, text, and other fields are
unchanged; missing, null, empty, or malformed IDs retain existing behavior.
ACP 1.4.0 defines `MessageId` as a string (`zMessageId = z.string()`), so the
suffix needs no UUID conversion. It assumes native DSH IDs do not occupy the
suffixed thought namespace; observed DSH message IDs are UUIDs. Remove the shim
once dsh-acp sends distinct IDs for thought and answer chunks.

Verified 2026-09-29 with synthetic ACP peers and the real `runAcpProvider()`:

- SDK 0.9.2: the nine tests in `server/reasoning.test.ts` went from eight
  failures plus the passing no-ID control to nine passes. Typecheck, lint,
  and the full suite pass (74 tests / 3 files).
- Installed Paseo 0.10.1 SDK: the same nine cases changed from eight failures
  to nine passes. For this isolated check, TypeScript was transpiled locally,
  the test registration import was changed from Vitest to `node:test`, and the
  SDK import targeted the app's bundled module. Electron's helper ran in Node
  mode.
- Cases cover exact `Thinking.` / `Answer.` separation, multiple chunks,
  thought/text interleaving with stable IDs, unchanged answer `messageId`,
  no-ID fallback grouping, native load, and the load-to-resume translation.
  History updates before load acknowledgment are checked at the bridge
  boundary; SDK integration checks turns after restore. At that verification date DSH resumed
  without replay, and the 0.10.1 SDK could drop pre-acknowledgment replay because it
  assigns its native session ID after the load response. This shim does not
  change that separate limitation or the SDK's grouping of interleaved blocks.

Live check, 2026-09-29: the installed plugin was reloaded from the fix on a
macOS Paseo 0.10.1 daemon, and one DSH turn ran with `deepseek-v4-flash`
(thinking High). In the hosted web client, the reasoning appeared only in the
collapsed Thinking block and the answer contained only the reply text. Mobile
was not checked. The shim does not repair host timeline items stored before
the fix. The plugin's minimum Paseo requirement is unchanged.

## v4 session history replay (unreleased)

The compatibility stream now replays recognised v4 logs before a successful
translated load response; native load and resume errors bypass it. The historical
0.10.1 observation above is not the current 0.13.2 and 0.14.0 contract: Paseo 0.13
and 0.14 admit updates in its load replay window. The provider regression checks that
window on 0.13.2 and 0.14.0 and explicitly records the empty-history behavior of the minimum 0.11.4
SDK. See [verification.md](verification.md) for the executed checks and limits.

## Paseo 0.14.0

Paseo 0.14 keys each ACP chunk ID by its kind (getpaseo/paseo#7272), so a reasoning
chunk and an answer chunk with the same native message ID no longer share a timeline
ID. The `:thought` suffix from the 0.1.0-beta.13 fix is then redundant but harmless:
it renames only the reasoning row. It stays, because 0.11 to 0.13 still need it. The
reasoning tests now assert distinct IDs and that only the answer keeps `messageId`,
so they pass under both SDK lines.

0.14 also releases an idle agent's runtime after 60 minutes. The ACP shim does not
advertise `session.can_stop_runtime`, so the host releases DSH sessions too, then
resumes them through `session/load` with history replay on the next prompt. The
agent manager treats an existing durable timeline as already primed and does not
append the provider replay. A live 0.14.0 check confirmed that the resumed agent kept
its context and that the timeline gained only the new turn.
