# Changelog

## 0.1.0-beta.1

First public experimental release, targeting Paseo 0.8.0.

- Render closed display-math delimiters and math fences in assistant reply bodies.
- Use local MathJax and embedded resvg WASM to produce PNGs for React Native.
- Preserve surrounding supported Markdown, incomplete source, and invalid formulas.
- Keep one muted English action row per formula: Show LaTeX and Copy LaTeX.
- Preserve manual source viewing across text/theme updates while mounted.
- Normalize one redundant display-delimiter pair inside math fences.
- Let the host derive unique source-relative replacement IDs for split reply rows.
- Include bounded rendering, source fallback, explicit retry and lifecycle cleanup.

This is block math only. Inline math, complete native Markdown parity, native mobile
acceptance and sustained resource stress testing are not complete. See README.md.
