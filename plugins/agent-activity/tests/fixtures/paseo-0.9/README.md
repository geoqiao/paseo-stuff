# Paseo 0.9 host test fixtures

Seven unmodified source files from getpaseo/paseo tag `v0.9.2`,
commit `c67b7158b441bb09026b38d86ae335cc4b49190a`.
Paths below this directory mirror `packages/app/src/` in that commit.
All seven are byte-identical in tag `v0.10.0-beta.1`, commit
`52d345db7f271251787c1099a2fe48fde515f012`.
Copyright (c) 2025-present Mohamed Boudra. Apache-2.0; upstream LICENSE included.

Beta.7 used `v0.9.0-beta.1` (commit `7c1958f5b0a4ae9f2cb12f77b0a754a644cd0081`).
Since then only `agent-stream/presentation.ts` and `utils/split-markdown-blocks.ts`
changed; the other five files are identical in all three tags.

Offline tests bundle the actual presentation order, projection, grouping, result
validation and Markdown splitting with synthetic inputs.
Type-only host imports are erased; public npm protocol and markdown-it supply
runtime dependencies. No fixture is imported by production plugin entries.
These checks are not live-app or on-device acceptance.
