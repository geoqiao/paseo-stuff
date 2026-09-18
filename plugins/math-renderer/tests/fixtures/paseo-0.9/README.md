# Paseo 0.9 host test fixtures

Eight unmodified source files from getpaseo/paseo tag `v0.9.0-beta.1`,
commit `7c1958f5b0a4ae9f2cb12f77b0a754a644cd0081`.
Paths below this directory mirror `packages/app/src/` in that commit.
Copyright (c) 2025-present Mohamed Boudra. Apache-2.0; upstream LICENSE included.

Offline tests bundle the actual presentation order, projection, grouping, result
validation, Markdown splitting and Find target selection with synthetic inputs.
Type-only host imports are erased; public npm protocol and markdown-it supply
runtime dependencies. No fixture is imported by production plugin entries.
These checks are not live-app or on-device acceptance.
