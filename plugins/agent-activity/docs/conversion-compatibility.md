# Unified tool formatting — beta.6

This supersedes both the Calls-overview experiment and the conversion-only simple
renderer. Ordinary tools and codex-conversion now use the same renderer.

## Contract

- Header: actual tool name, mapped icon, and host lifecycle status.
- Body: Input and Output only; JSON formatting/highlighting or literal non-JSON text.
- Each section previews at most twenty displayed line-heights, including wrapping;
  one Show all / Show less removes/restores both sections' limits.
- No Raw/Copy toolbar, supplementary status explanation, nested Calls view, settings
  screen, generated tool summary or diff reconstruction.
- Show all exposes every received output field. Text selection includes real newlines.
  Streaming/status updates do not reopen cards or reset the user's full/preview choice
  while mounted, including a manual close/reopen of the same card.

For near-native sequencing, Thinking is the one presentation-only exception:
a matching header and selectable original plain text, with a twenty-line preview
and Show all. No Markdown parser or reasoning-text rewriting is restored.
Both platforms use the native default 14px label size, natural leading and 12px
icons, without the trial's additional 44px mobile header minimum. The host's 16px
gap remains: the current browser comparison measures 33px pitch versus 32px for
all-native rows. Only Show all retains a 44px compact target; collapsed header hit
areas are smaller than native badges. See [spacing evidence](compatibility.md#spacing-and-icons).

## Thin adaptation, not semantic interpretation

Known exec / mcpScript inputs that contain only a nonblank code field show that source
in Input. Additional parameters keep the complete input as JSON. Direct shell, wait,
stdin, patch and image tool arguments use the generic formatter.

A decoded envelope containing only one exact text block may show that text directly,
including the DSH-projected ACP text-block wrapper. If the envelope or block has other
fields, it stays complete JSON. Serialized JSON strings are never parsed and
re-serialized to unwrap transport: doing so could lose duplicate keys or large numbers.

In particular, conversion results with details / codeMode / traces remain complete.
No exit status is inferred from result strings, no trace is aggregated or interpreted,
and no metadata or attachment body is silently removed. Embedded JSON strings retain
their escapes inside the surrounding JSON. There is no recursive decoding or request
to load image/file data. Mistaken-wait recovery and upstream truncation markers remain
as received; Show all cannot restore missing upstream data.

For native typed details, the adapter places shell parameters and read ranges in Input,
results in Output, and complete write/edit parameters in Input. Unknown detail shapes
fall back to complete JSON in Output. Actual host errors stay inside Output. Only known
host discriminators and pure transport wrappers are omitted from this display; the
source timeline item itself is not modified.

Reference shapes were inspected from **@howaboua/pi-codex-conversion 3.0.33**.
No upstream implementation, AST interpreter, terminal renderer, process/session tracker
or new runtime privilege is introduced.

## Limits and verification

Formatting changes JSON whitespace only, bounded to 1,000,000 characters and 40
indentation levels; overflow falls back to intact source. Highlighting retains its
100,000-character/cache limits. The source prefix is limited to twenty logical lines;
the renderer additionally clips to twenty line-heights, scaled with system font size.
Natural content measurement reveals overflow and controls the existing Show all.
The measurement ScrollView is not a user scroll area: native scrolling is disabled;
web uses hidden overflow without scrollEnabled=false, because RN Web 0.21 otherwise
blocks the ancestor's wheel/touch gestures. Show all removes the measuring container.
This bounds displayed height, not host storage, serialization or layout of a very
long source line. Native gestures/font metrics still require on-device verification.

See [current verification](verification.md) for automated and browser checks.
The initial formatter pass preserved the disabled local installation. It was later
found enabled and reloaded for the minimal Thinking spacing trial; see the current
verification record. The user accepted the local trial before authorizing beta.6.

**Paseo 0.8 Full detail only remains required on every connected client.** Summary
still requires a public host grouping/detail-renderer contract. No private setting,
DOM or React-state inspection is used to guess the user's display preference.
