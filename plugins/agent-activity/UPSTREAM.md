# Upstream provenance

## Plugin

- Repository: https://github.com/mcowger/paseo-plugins
- Commit: `91058be73840ae11b130b6bb7d34b07652462217`
- Subdirectory: `colorful-agent-activity`
- License: MIT, Copyright (c) 2026 Matt Cowger; original LICENSE retained.
- Imported from an installed local checkout, not a fresh upstream snapshot.
- Local changes already present at import: tools/reasoning default collapsed, manual-only expansion during streaming, React renderer regression tests (44 total tests), documentation and development-only test dependencies.

This fork publishes under the distinct manifest ID **readable-agent-activity**. Existing local installations may retain an explicit runtime alias; internal renderer kind strings remain unchanged. Do not enable this fork and another timeline-replacement plugin together.

## Changes in this fork

- Theme-derived neutral rows and bounded summaries instead of category backgrounds and palette controls.
- Stacked sections, lexical JSON formatting, literal JS inputs, readable tool-result text, Raw/Copy and bounded previews.
- One-layer decoding of known UI quoted labels and compaction of repeated accessibility paths.
- Manual-only expansion; 20-line / 4,000-character previews with Show all / Show less.
- Defensive malformed-detail handling, bounded diff/format/highlight work and asynchronous clipboard race protection.
- No server entry; presentation uses public SDK modules and does not need daemon-side privileges.
- Additional pure/renderer tests and pinned host compatibility fixtures. Full detail only; Summary remains unsupported.

Public screenshots are newly generated from synthetic data, not upstream screenshots or personal conversation captures.

## Host test fixtures

Four unmodified Paseo v0.8.0 source files from commit `b8e24677e12b226c7c38c1c3a40649daa9f1152f`, under Apache-2.0, are used only in tests. Their license is not replaced by the plugin's MIT license.

See [fixture provenance](tests/fixtures/paseo-0.8/README.md) and [fixture LICENSE](tests/fixtures/paseo-0.8/LICENSE).
