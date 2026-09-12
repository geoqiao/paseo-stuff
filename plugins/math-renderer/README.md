# Math Renderer for Paseo

Render **block LaTeX inside assistant reply bodies**, with one muted English action row
per formula: **Show LaTeX** and **Copy LaTeX**. No extra panel or duplicate message toolbar.

> **Experimental beta — 0.1.0-beta.1.** Requires Paseo app and daemon **0.8.0**.
> Inline math is not typeset. Native iOS/Android acceptance and complete native Markdown
> parity are not finished. Read the limitations before enabling this trusted plugin.

![Dark component preview of block math and English actions](images/math-dark.png)

*Synthetic React Native Web component preview, not a native mobile or live Paseo screenshot.*
[Light preview](images/math-light.png) · [Compact preview](images/math-compact.png)

## Install

Plugins run as trusted, unsandboxed code. Review the source, choose the target daemon,
and enable plugins in Paseo before installing:

```sh
paseo plugin add geoqiao/paseo-stuff:plugins/math-renderer --ref math-renderer-v0.1.0-beta.1 --host <host:port>
paseo plugin ls --host <host:port>
```

The manifest ID is `math-renderer`. This directory is independently installable;
it does not import any sibling plugin or depend on root-installed packages.

If you used the earlier local prototype alias `paseo-math-renderer-prototype`, keep
that installation's ID for reload/disable. Do not enable a second copy alongside it.
Likewise, avoid overlapping assistant-message replacement plugins.

## Supported content

- Closed display-math blocks: `$$...$$` and `\[...\]`, with delimiters occupying their own lines
  or the entire block on one line.
- Closed fenced `math` blocks, including one redundant outer display-delimiter pair.
- Paragraphs, headings, emphasis, lists, quotes, ordinary code, and HTTP(S) Markdown links.
- Incomplete streaming formulas remain source text until closed.
- Invalid or unsupported TeX retains its source; transport/render failures offer **Retry**.
- **Show LaTeX** changes to **Show formula** while viewing source. Manual viewing survives
  text and theme updates while the card remains mounted.
- Long equations scroll horizontally. Colors follow the host theme; compact actions have
  44-pixel minimum height.

Example prompt for a model:

```text
Explain the quadratic formula in English. Mix normal Markdown paragraphs, a list and
a quotation with display formulas. Put display delimiters on their own lines. Include
a Gaussian integral, a matrix in a math fence, and an aligned three-line derivation.
Include a Python code block with the string "$$not_math$$". End with a valid formula
after a deliberately invalid \badUnknownCommand{1} display formula. Do not use tools
or wrap the entire reply in a code fence.
```

## Limitations

- **Block math only:** `$...$` and `\(...\)` remain source, not inline math layout.
- Paseo 0.8.0 does not expose its native Markdown renderer or math-node extensions.
  The plugin replaces supported source rows with its own small Markdown renderer;
  code highlighting, workspace-file interactions and native selection behavior are not fully reproduced.
- Tables, images, explicit HTML, and non-HTTP(S) Markdown links in a source row cause
  that row to remain native. Paseo may split a reply into multiple rows, so this is
  not an all-or-nothing guarantee for the entire reply.
- Local formula viewing state does not survive every virtualization unmount.
- MathJax base + AMS only. Missing glyphs (including many non-Latin text glyphs),
  external resources, custom macros and unsupported commands fall back to source.
- Host foreground colors currently must be six-digit hex strings. Font size is clamped
  to 12–28 and image density to 1–3; other accessibility configurations need testing.
- PNG output has a LaTeX accessibility label and copy action, but is not semantic MathML
  and does not provide continuous mathematical text selection.
- macOS Paseo 0.8.0 was checked with actual model output. Native iOS/Android, other
  app/daemon versions, full desktop reconnect/disable cycles and sustained multi-client
  performance are **not** accepted as tested.
- The transformer only selects assistant messages and does not change tool display settings.
  Summary/Full detail behavior has pinned-source integration tests, not a complete
  live-App matrix of both modes and other plugins.

## Rendering and trust

Formula text goes through the existing Paseo plugin RPC to MathJax on the daemon machine.
MathJax produces self-contained SVG glyph paths; bundled resvg WASM rasterizes them into
PNG data URIs. The client renders ordinary React Native images, text and scroll views.

No external math service, font URL, system-font scan, runtime filesystem access, shell
process or extra HTTP listener is used by the renderer. This is not a promise that
Paseo's trusted plugin environment is a security sandbox.

Limits include 96,000 characters / 32 formulas per source row, 4,096 characters per formula,
bounded TeX commands/nesting/rows, 2,400×800 logical pixels / 4 million raster pixels,
1 MB SVG/PNG, 128 cache entries / 8 MB of image URIs, and at most 16 pending renders.
These are **not a hard CPU timeout or a strict memory sandbox**. Use trusted inputs;
adversarial/high-concurrency load remains a beta risk.

Cleanup unregisters contributions, clears the cache and releases MathJax resources.
The host terminates the plugin subprocess to reclaim its WASM memory.
MathJax 3 is deliberately pinned for self-contained, synchronous glyph output;
migration to MathJax 4 is a separate maintenance task.

## Development

From this directory:

```sh
npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
npm run prepare:wasm
npm run check
```

`prepare:wasm` embeds the unmodified npm resvg WASM artifact into ignored
`server/generated/wasm.ts`. The manifest runs these build steps during installation.
Do not commit that generated file, dependencies or compiled bundles.

Typecheck before reloading the exact installed ID on the intended host. Do not restart
the daemon or auto-enable a disabled installation.

## Verification

- Typecheck, lint and **54 automated tests** passed locally.
- Tests include real MathJax/resvg PNG output, malformed/oversized inputs, stable source-row
  identity using pinned Paseo 0.8.0 source, cleanup, and synthetic mixed-output regressions.
- Two real model replies contained 12 display formulas: 11 valid and one intentionally invalid.
  Their 18 recorded deltas reconstructed history exactly; backend replay produced 11 images
  and retained the invalid source. Selected rendering and failure cases were inspected in the App.
- Nine separate browser interaction groups passed using actual plugin components and the
  real local renderer, including exact LaTeX copy, English/muted single-row actions, source
  state, light/dark themes, 390px overflow, streaming completion and simulated transport failure.
  These browser checks are **not** native mobile acceptance.
- Publication-time production dependency audit reported zero known advisories; this is
  a point-in-time result, not a security guarantee.

See [verification details](docs/verification.md) and the repository's CI results.

## License

Plugin-authored code is MIT. Third-party code, glyphs, WASM and pinned host fixtures
retain their licenses. See [THIRD_PARTY.md](THIRD_PARTY.md), `third-party/`, and the fixture LICENSE.
