# Changelog

## 0.1.0-beta.3 — 2026-09-18

- Target Paseo 0.9.0-beta.1 and the 0.9 SDK. Keep streaming replies native and render supported whole replies after completion, avoiding repeated parsing and mid-stream ownership changes.
- Add client-local Command Center actions to restore native replies for chat Find and re-enable block formula rendering. Do not mutate history or host preferences.
- Open HTTP(S) links through the public host `openExternalUrl` API.
- Add pinned 0.9 host fixtures and regression coverage for mixed/oversized whole-message fallback, stable history identity, native tool modes and the remaining Find identity gap.
- Retain all parser, TeX and rendering bounds. Unsupported whole replies remain native; inline math and full native Markdown parity remain outside this beta.

## 0.1.0-beta.2

- Enable MathJax's bundled boldsymbol extension so valid formulas containing
  bold Greek symbols render, including the multivariate normal density.
- Fix the mobile startup error `Cannot read property 'prototype' of undefined`
  reproduced in Hermes while loading the Markdown parser's entity decoder.
- Prepare the pinned parser as function-based JavaScript with an ESM wrapper;
  generate it during installation and CI without committing compiled artifacts.
- Test complete client-bundle loading, streaming Markdown, fallback and cleanup
  in Node and the RN Hermes executable. On-device UI acceptance remains outstanding.

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
