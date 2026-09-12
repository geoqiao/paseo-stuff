# Separate post-release code review

2026-09-12. Review of the published beta.2 runtime, callers and tests, followed by
targeted beta.3 fixes. The implementation owner and an independent reviewer
examined correctness, unnecessary code, source fidelity and rendering work.
This is separate from the original formatter implementation review.

## Findings and fixes

| Finding | Resolution |
| --- | --- |
| Diff source lines beginning with `+++` / `---` were mistaken for file headers | One hunk-aware classifier now drives counts and colors. Tests cover omitted/zero counts, multiple files, no-newline markers and partial/malformed input. The independent follow-up also caught stripped blank context aborting a hunk; a failing regression and one-condition fix cover it. Unrecognized lines remain visible; Raw/Copy retain the supplied diff. |
| A lone high surrogate at a multi-block preview boundary could duplicate earlier text | Only a genuinely split surrogate pair is trimmed. Regression checks require segment reconstruction to equal preview text, preserve the shared budget and retain complete Copy/Raw source. |
| A supplied unified diff hid complete before/after strings from the UI | The Diff section retains the complete edit detail as lazy Raw data, including source outside the diff context. Generated diffs use the same mechanism. |
| Read ranges omitted offset/limit metadata | Contents Raw retains the complete read detail when either field is present, including zero. Normal Contents and its Copy stay unchanged. |
| Exa/GitHub summary normalization scanned entire large strings | Reuse one bounded-prefix helper. A summary may be absent when its bounded prefix is entirely whitespace; the original input remains available in details. |
| Unreachable output-card parsers complicated the actual formatter contract | Remove the unused Exa/GitHub/Paseo output helpers, including arbitrary embedded-JSON scanning and recursive envelope unwrapping. Preserve active tool recognition, icons, labels and summaries; test the real detail path's source fidelity instead. |
| Candidate fixes risked avoidable large-data work | Consume diff classification as an iterator for counts rather than retaining all classified rows. Memoize selected Raw text by source, so Copy and Show all state updates do not repeatedly serialize large details. Two renderer regressions failed before memoization and now pass, including source-update invalidation. |

Relevant code: [details](../shared/details.ts), [presentation](../shared/presentation.ts),
[bounded summaries](../shared/summary.ts), [renderer](../client/activity.tsx), and
their adjacent tests.

## Verification

- `npm run check`: typecheck, zero lint issues, **217 tests / 13 files**.
- The initial 213-case review suite against beta.2 runtime in an isolated checkout:
  **14 failures / 199 passes**, including diff classification, Raw metadata,
  bounded summaries and Unicode preview behavior. No personal data was used.
- The final suite adds two Raw-serialization regressions, stripped blank context
  and a 100,000-line diff count case. These establish behavior and reuse, not a
  latency benchmark.
- Three production-component RNWeb suites pass: existing UI/edge cases and a new
  focused review suite for diff colors/counts, complete Raw/Copy, range metadata,
  Unicode boundaries, streaming, dark/light and narrow layout.
- Existing pinned host-projection tests continue to document the unsupported
  Summary grouping contract. Browser fixtures are not native mobile tests.

## Design decisions and remaining limits

Keep one preview budget and explicit format recognition, not another formatter
framework, recursive decoding or pagination. Retain manual per-card disclosure
and complete source. Full detail-only support is unchanged.

The independent follow-up found no release blocker. Its call-site analysis also
proved a newly proposed preview-repair fallback unreachable after the Unicode
fix: noninitial segments have newline separators. That fallback was removed,
not retained as speculative defensive code; reconstruction regressions remain.

This limits default rendering work, not host transport/storage or full Raw/Copy.
Show all deliberately removes the preview cap. Source retention can increase
memory and clipboard work; preserving it is intentional. No measured latency/FPS
guarantee, native-mobile certification or promise to interpret arbitrary output
is made. See [verification.md](verification.md) for historical live-data evidence
and the scoped `diff` dependency advisory.

## beta.4 focused icon review

The implementation owner reviewed the follow-up independently of the earlier formatter work:
the runtime diff changes one icon name and exports its existing map for exhaustive testing.
No new resolver, fallback framework, rendering dependency or change to formatter/layout was added.
The previous renderer mock accepted any icon string, so it could not catch the invalid
`ListActivity` name. A pinned, test-only Lucide catalog check now covers all 62 Paseo mappings;
normalization and renderer tests reproduce the missing icon before the fix.
The web preview's canonical-only lookup also omitted valid aliases such as `Globe2`; its
lookup now follows the host's named-export behavior. That was a preview mismatch, not a
second confirmed installed-host bug. All 224 tests and the focused SVG/browser UI checks pass.
This was a focused self-review, not another independent-agent review or native-mobile test.
