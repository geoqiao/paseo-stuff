# Verification scope

## Beta.3 — Paseo 0.9 migration (2026-09-18)

- Exact SDK/protocol/client target: **0.9.0-beta.1**. `npm run check` passed on
  Node **22.23.2** and **24**: typecheck, zero lint warnings/errors and **6 files /
  66 tests**, including real RN 0.81.5 Hermes evaluation.
- Nine new tests use unmodified tagged host presentation, grouping, projection,
  identity and Find-model sources. They cover native streaming, whole completed
  replies, stable history IDs, unsupported/oversized fallback, native tools in both
  display modes and canonical IDs after removing the transformer.
- Complete client-bundle checks exercise repeated native/render commands and
  cleanup, including no duplicate transformer registrations. These commands are
  client-local and reset on contribution reload; there is no hidden saved setting.
- Compiled client and server with the installed Paseo app's actual compiler. The
  compiled backend rendered a quadratic formula successfully (135×47 logical px).
- Reloaded the existing enabled ID `paseo-math-renderer-prototype` at
  `127.0.0.1:6767`; the 0.9.0-beta.1 daemon reports running/ready.
- A synthetic Pi turn produced two formulas in its completed Paseo timeline. Its
  source was inspected, and the test agent was archived. Desktop UI automation
  failed to start, so this is not a claim that its live pixels were inspected.
- The actual components and real local MathJax/resvg backend passed nine browser
  interaction groups: exact LaTeX clipboard, manual source state, image decode,
  light/dark and desktop/390px layouts, overflow/touch targets, malformed TeX,
  delimiter edits, unsupported Markdown and RPC retry. A further check confirms
  native output throughout the simulated streaming phase, then two rendered images
  after completion. No browser runtime errors; compact screenshot inspected.
- Those browser checks use React Native Web with host/RPC adapters. Native mobile
  rendering, actual installed Command Center interaction and reconnect/multi-client
  acceptance remain unverified.
- Chat Find still cannot target transformed host rows. The tested native-reply
  action restores original IDs; this is an explicit workaround, not an upstream fix.

## Historical beta.2 evidence (Paseo 0.8.0)

## Repeatable package checks

Run npm ci with the flags in README, prepare:markdown, prepare:wasm, and npm run check.
The monorepo CI installs each plugin separately on Node.js 22 and 24.

The 57 tests cover delimiters, CRLF/trailing whitespace, escaped dollars, code,
inline-source preservation, nested containers, unsupported Markdown bypass,
limits, actual PNG output, caching and disposal. Synthetic A/B fixtures are
model-generated test text, not personal conversations.

The host fixtures are unmodified Paseo 0.8.0 sources with recorded provenance.
Both the real projection and identity model are used: in 0.8.0 an explicit
replacement ID is plugin-global. Omitting it derives sourceId/index and avoids
colliding when the host splits one reply into several source rows. An earlier
test adapter wrongly prefixed explicit IDs and therefore missed this bug.

Assistant transformer phase is complete even during live text updates in this
host version. The parser therefore depends on text and delimiter closure, not phase.
Source data is retained at every prefix of synthetic A.

## Native bundle loading fix (beta.2)

The beta.1 client bundle reproduces the reported `Cannot read property 'prototype'
of undefined` in the RN 0.81.5 Hermes executable, at `getDecoder` during eager
loading of `markdown-it/dist/markdown-it.js`. Its bundled `EntityDecoder` is a
class expression. The later parser fallback cannot catch entry evaluation errors;
daemon status can still report running/ready while the mobile client fails to load.

`prepare:markdown` uses the existing TypeScript build dependency to lower the pinned
markdown-it 14.3.2 UMD distribution to ES5 syntax, preserving comments and removing
its stale source-map reference. The generated parser has an ESM wrapper: importing
the constructor as CommonJS would make Paseo's eager interop read restricted
function properties in Hermes and fail with `Restricted in strict mode`.
No parser downgrade, runtime transpiler, host patch or global polyfill is needed.
Generated files are ignored; the install manifest and CI rebuild them.

`tests/client-bundle.compat.test.js` matches the pinned Paseo 0.8.0 compiler settings
and eager CommonJS interop, then evaluates the entire entry from a string. The old
code passes in Node but fails in Hermes with the exact reported error. The fixed
entry passes both engines: registration, all prefixes of synthetic A/B, entity
decoding, delimiters/nested containers, input limits, native fallback and cleanup.
The Hermes test skips explicitly where its executable is unavailable; `HERMES_BIN`
can supply one. The local macOS run executed it successfully.

Host modules, UI hooks and schema construction are stubbed only in this engine
smoke test. Existing tests use real Zod and MathJax/resvg. These results do not
establish on-device iOS/Android UI, clipboard or RPC behavior. The beta.1 release
tag does not contain this fix.

An isolated copy of this plugin, with no dependencies or generated files, passed
every manifest build command and all 57 tests, including Hermes. Typecheck and
lint passed without warnings. The already-enabled local installation
`paseo-math-renderer-prototype` was reloaded on `127.0.0.1:6767` (app/daemon 0.8.0)
and reported running / Plugin ready. This status confirms host compilation and
backend readiness, not phone rendering. The temporary install copy was removed.

The installed Paseo 0.8.0 compiler also compiled both beta.2 entries in an offline
harness; the compiled server produced a PNG through its registered render handler.
This verifies the actual host compiler, without claiming a live phone RPC check.

## Bold Greek symbols (beta.2)

A valid multivariate normal density passed Markdown parsing but failed MathJax
conversion with `Undefined control sequence \boldsymbol`. The renderer enabled
only `base` and `ams`; MathJax 3 provides `\boldsymbol` in a separate extension.
The extension is now statically imported and explicitly enabled. All resources
remain bundled and the existing input/image bounds still apply.

The complete expression is covered in `tests/live-regressions.test.ts`, including
source preservation, the assistant-message transformer, real PNG output in light
and dark colors, and pixel dimensions at 3× density. It failed before the change
and passes after it. Typecheck, lint and all 57 tests pass, including Hermes.
Existing failed cards can use Retry after the plugin is reloaded.

## Desktop observation and local replay

The plugin was installed and reloaded on macOS Paseo app/daemon 0.8.0 without
restarting the daemon or changing other plugin enable states. Actual generated
replies mixed Markdown prose with quadratic equations, integrals, matrices,
aligned derivations, list/quote formulas and a long 24-term equation.

A contained six valid formulas. B contained five valid formulas and one
deliberately unknown TeX command. After correcting a redundant math-fence
delimiter pair, real backend replay rendered all eleven valid formulas.
The invalid one remained source and did not prevent the next formula rendering.
Live deltas (12 for A, 6 for B) exactly reconstructed the final history text.

Selected App observations covered live completed-block rendering, matrices,
long-equation overflow, preserved invalid source, and a later valid formula.
They did not exhaustively verify every nested container or interaction. The
earlier duplicate-ID build could leave stale nodes in a mounted view; closing
and reopening that old tab is needed, and cleanup of every polluted old view
was not recorded as a complete acceptance result.

## Browser interaction checks

Nine local Chromium groups used actual React Native Web plugin components and
real MathJax/resvg, with preview adapters for host hooks and RPC transport:

- Exact LaTeX clipboard content and English Copied feedback.
- Manual source view retained across appended text and a theme change.
- Matrix/aligned PNG decoding.
- Independent horizontal overflow at 390px and 44px compact action targets.
- One muted English toolbar per formula, no duplicate message toolbar.
- Invalid TeX source fallback.
- Closure promotes streamed source to a formula image.
- Unsupported image Markdown bypass.
- Simulated transport failure preserves source; Retry restores rendering.

No browser pageerror occurred. Screenshots in images/ use synthetic English
text and are labeled component previews. These are not screenshots of a mobile
device or proof of real-App clipboard/reconnect behavior.

## Not accepted as tested

Native iOS/Android; continuous inline math layout; semantic MathML; full native
Markdown interactions; all combinations of Summary/Full and other plugins;
real-App clipboard, light mode, virtualized source state, disable/re-enable and
network reconnect; large RPC payloads across relay; sustained CPU/memory or
multi-client load. Input bounds are not a hard execution-time sandbox.

Tests contain only synthetic data. No local host configuration, user credentials,
conversation IDs or personal captures are included in this package.
