# Verification scope — 0.1.0-beta.1

## Repeatable package checks

Run npm ci with the flags in README, prepare:wasm, and npm run check.
The monorepo CI installs each plugin separately on Node.js 22 and 24.

The 54 tests cover delimiters, CRLF/trailing whitespace, escaped dollars, code,
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
