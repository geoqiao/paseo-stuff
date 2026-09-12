# Verification and remaining gaps

## Beta.5 native-loading follow-up

Typecheck and lint pass (zero warnings/errors), with **14 files / 251 tests** passing.
The new bundle test ran, not skipped, using the Hermes executable shipped with the
plugin's `react-native@0.81.5` dependency. It covers the full entry's registration and
cleanup, then actual highlighting for 13 language IDs with Unicode, CRLF, blank lines
and trailing newlines. The same bundle also passes a DOM-free Node VM evaluation.
Additional unit cases cover aliases, partial JSON, limits, grammar failure/retry and
theme colors. This is real JS-engine coverage, not native UI or clipboard integration.
On systems without that executable the Hermes case is explicitly skipped; supply
`HERMES_BIN` to run it with an installed matching engine.

The existing browser UI suite passed again at **1500×950 dark / 390×844 light**, including
highlighting, full Readable/Raw copying, streaming/manual disclosure, large previews,
keyboard and overflow checks, with zero browser warnings/errors. Temporary screenshots
were kept outside the repository; published screenshots were not replaced.
The installed macOS client still exposed Activity's Expand Exec/Thinking controls after
reload. No new on-phone visual check is claimed.

The existing enabled `colorful-agent-activity` installation on `127.0.0.1:6767` reloaded
successfully and reported running, with only stopping/stopped/loading/ready log additions.
The daemon was not restarted; `deepseek-harness` and `paseo-pet` remained disabled.
The temporary browser and preview process were closed. That verification pass did
not publish a release; the fix is now included in the monorepo beta.5.
The dependency audit still reports only the previously documented low-severity `diff` advisory.

## Automated checks

The published v0.1.0-beta.1 baseline had typecheck and lint passing with **13 files / 187 tests**.
The v0.1.0-beta.2 formatter follow-up passes the same checks with **13 files / 202 tests**.
It was reloaded into the existing enabled macOS Paseo 0.8.0 installation, which reported running.
No daemon restart, host display-preference change or other plugin state change was performed.
CI runs the same checks on Node.js 22 and 24.

The separate v0.1.0-beta.3 code review passes typecheck, zero lint issues and
**13 files / 217 tests**. Obsolete tests for unreachable output parsers were removed;
active-path regressions were added instead. In an isolated before-fix checkout,
the initial 213-case review suite produced **14 failures / 199 passes** against
beta.2 runtime code. A further two renderer cases reproduced repeated Raw
serialization and now pass; the final suite also covers 100,000-line diff counts.
The independent review's whitespace-stripped blank-context case also failed
before its one-condition fix and passes now.
See [code-review.md](code-review.md).

The v0.1.0-beta.4 icon fix passes typecheck, zero lint issues and **13 files / 224 tests**.
All seven new cases failed against the previous icon mapping, then passed after replacing
`ListActivity` with `Activity`. The suite validates every entry in the 62-tool Paseo map,
four supported tool-name spellings, and renderer size/color and manual disclosure across updates.
The pinned test-only `lucide-react@0.546.0` supplies the web icon exports for the same Lucide
release as Paseo 0.8.0's locked `lucide-react-native@0.546.0`; it is never imported by production.
Host source evidence: [named-export lookup](https://github.com/getpaseo/paseo/blob/b8e24677e12b226c7c38c1c3a40649daa9f1152f/packages/app/src/plugins/icons.ts)
and [dependency lock](https://github.com/getpaseo/paseo/blob/b8e24677e12b226c7c38c1c3a40649daa9f1152f/package-lock.json).
This checks catalog compatibility, not native SVG rendering.

Coverage includes:
- Lexical JSON fidelity, empty/malformed/oversized payloads, generated-output bounds and surrogate boundaries.
- Explicit code inputs, typed result envelopes, non-text placeholders and full Raw data.
- DSH-projected ACP `content[]` wrappers: explicit `type: "content"` blocks with nested text are extracted one layer, while mixed non-text blocks remain safe placeholders and the source stays in Raw.
- Explicit Pi Code-mode envelopes: one-layer `exec_command` result extraction only when `details.codeMode === true`, with schema rejection for partial/ambiguous wrappers.
- Mixed result blocks with per-segment language, one aggregate preview budget, multiple results and preserved unknown/image placeholders, including the ACP projection.
- Nested exit codes, running sessions, empty output, script errors, dropped trace counts, upstream `[Output truncated]` markers and formatter-limit notices.
- Exactly one decoding layer for known UI labels; generic logs/code and malformed quotes remain literal.
- Repeated AX role paths compacted only in the derived UI view; full labeled paths retained in Raw.
- JSON text-block highlighting, short headers and real-shaped custom tool inputs.
- Default collapse, user-controlled Show all/Show less, streaming/status updates and complete selected-view copying.
- Async clipboard races, error feedback, dark/light colors and compact props.
- Unmodified pinned Paseo projection functions, including the intentionally unsupported Summary grouping case.

The new Activity cases use synthetic envelopes only. They deliberately do not inspect or serialize
trace/image payloads for the default preview, do not repair partial JSON, and verify that Readable,
Raw and complete selected-view Copy remain distinct.

## Browser and host checks

The development workspace also has a separate React Native Web comparison harness. Its browser checks passed at **1500×950 dark** and **390×844 light**, exercising production components with synthetic inputs: frame spacing, keyboard disclosure, wrapping, code/JSON, quoted UI labels, Raw/Copy, streaming, bounded previews and 100,000-row data.

The standalone release includes source/unit/renderer/host-projection tests and selected synthetic screenshots, not the separate comparison application's source or its large host renderer fixtures. The browser check is not a connected-host integration test.
The baseline browser suite was repeated for beta.2. A new **1500×1050 / 390×844** browser pass
also verified nested Pi output, literal escapes, one-layer ACP blocks, mixed JSON token colors,
full Readable/Raw copying, streaming, compact status spacing and absence of horizontal page overflow.
The first pass exposed oversized newline-only status boxes; those were fixed and the check rerun.

For beta.3, both preceding browser suites passed again. A separate `?review` pass
at **1500×1050 dark / 390×844 light** verified hunk-aware diff colors/counts,
complete unified/before/after Raw copying, read offset zero, lone-surrogate preview
boundaries, streaming and preservation of Raw choice through layout/theme updates.
The repeated output screenshot was byte-identical; no preview artwork was changed.
These are synthetic production-component checks, not a new native-client matrix.
After typecheck, beta.3 was reloaded into the same enabled macOS Paseo 0.8.0
installation. Its new log entries were only stopping/stopped/loading/ready,
with no new stderr. The DSH and pet installations retained enabled/running state;
the daemon and display preferences were not changed.

For beta.4, a focused `?icons` browser pass at **1500×1050 dark / 390×844 light**
verified all 62 headers contain a drawn 14px Lucide SVG, including the valid `Globe2` alias,
and the Activity glyph survives expansion and streaming. The preview now resolves named
exports like the host and uses the matching Lucide release; it no longer drops aliases by
checking only the canonical `icons` map. The existing UI suite also passed, covering spacing,
Raw/Copy, bounded large output and keyboard disclosure. After typecheck, the existing enabled
macOS Paseo 0.8.0 installation reloaded successfully with only stopping/stopped/loading/ready
log additions and no new stderr. Other plugins retained their enabled/running states.
No new visual check in the native app or on a mobile device is claimed for this icon patch.

A read-only public-SDK replay of eight recent live timelines exercised **582 completed unknown
tool calls**: all stayed within the shared preview bounds, none threw, and hashes confirmed all
582 source payloads were unchanged. It included 298 bounded previews, 76 visible JSON segments
and 11 upstream-truncation cases. Only aggregate counts were retained, not personal fixtures.
This is live-data formatter verification, not visual desktop or latency/FPS measurement.

The README's focused images show the shipped renderer's UI-label/JSON view, bounded long-output preview and nested command output. They are component crops from the same browser harness, not reconstructed artwork. Captures check the compacted path, shared preview boundary and status spacing. Along with the three overview images, all six public screenshots use synthetic data and are labeled as component previews rather than live-host captures.

On the macOS Paseo 0.8.0 installation, earlier smoke checks verified 32px desktop pitch, real custom-tool icons and short summaries, readable output previews, and Show all/Show less. The beta was subsequently reloaded into that same enabled installation and reported running, without changing host preferences or restarting the daemon. The new quoted-label/path rendering was checked in the browser and renderer tests, not re-exercised in a live personal conversation. These targeted checks do not amount to the full browser matrix running in the installed app.

## Dependency review

An npm audit on 2026-09-12 reported **one low-severity advisory**, [GHSA-73rr-hh4g-fpgx](https://github.com/advisories/GHSA-73rr-hh4g-fpgx), for `diff@7.0.0` in the verification dependency tree. It affects `parsePatch` and string-input `applyPatch`; this plugin imports only `diffLines`, which the advisory explicitly says is unaffected. It does not call the affected functions.

The test dependency remains pinned to the version used for the Paseo 0.8 compatibility baseline; a blanket major upgrade would not upgrade the installed host's provided module. This is a scoped dependency review, not a security certification.

## Not established

- Summary support, automatic display-mode detection or safe mixed-mode connected clients.
- Native iOS/Android UI behavior beyond the new Hermes engine tests, or a complete reconnect/virtualization/enable-disable matrix.
- Smooth full rendering of million-line payloads or a measured latency/FPS budget.
- Lossless information equivalence of Readable and Raw. Readable is explicitly derived; Raw remains the complete received representation.
- Perfect interpretation of arbitrary custom-tool output or recursive code/string decoding.
- Recovery of output omitted upstream: a visible `[Output truncated]` marker is reported, but Show all and Copy cannot recreate bytes Pi did not send.

Formatting limits do not cap host projection/storage, full Raw serialization or clipboard work. Show all intentionally removes the preview limit. Clipboard browser tests use the shared system clipboard and must not run concurrently with unrelated copying.
