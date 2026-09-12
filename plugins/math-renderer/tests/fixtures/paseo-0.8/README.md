# Pinned host fixtures

Unmodified sources from getpaseo/paseo v0.8.0, commit
`b8e24677e12b226c7c38c1c3a40649daa9f1152f`.

- `plugins/projection.ts`: `packages/app/src/plugins/timeline/projection.ts`.
- `plugins/model.ts`: `packages/app/src/plugins/timeline/model.ts` (identity and result validation).
- `tool-calls/*`: matching paths under `packages/app/src/tool-calls/detail-level/`.
- Apache-2.0, upstream LICENSE included.

Only offline tests import these files; production plugin code uses public SDK APIs.
Tests use synthetic messages. No personal timelines or host settings are included.
