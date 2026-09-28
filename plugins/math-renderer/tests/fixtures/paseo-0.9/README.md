# Paseo 0.9 host test fixtures

Eight unmodified source files from getpaseo/paseo tag `v0.9.2`,
commit `c67b7158b441bb09026b38d86ae335cc4b49190a`.
Paths below this directory mirror `packages/app/src/` in that commit.
All eight are byte-identical in tag `v0.10.0-beta.1`, commit
`52d345db7f271251787c1099a2fe48fde515f012`. Five are unchanged since `v0.9.0-beta.1`;
`agent-stream/presentation.ts`, `agent-stream/chat-find/model.ts` and
`utils/split-markdown-blocks.ts` were refreshed from `v0.9.2`.
Copyright (c) 2025-present Mohamed Boudra. Apache-2.0; upstream LICENSE included.

Offline tests bundle the actual presentation order, projection, grouping, result
validation, Markdown splitting and Find target selection with synthetic inputs.
Type-only host imports are erased; public npm protocol and markdown-it supply
runtime dependencies. No fixture is imported by production plugin entries.
These checks are not live-app or on-device acceptance.
