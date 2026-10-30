# Paseo 0.14 host test fixtures

Nine unmodified source files from getpaseo/paseo tag `v0.14.0`,
commit `8c6de842a3157530c26a7a94c78a3d647fb96ce9`, plus one reduced file.
Paths below this directory mirror `packages/app/src/` in that commit.
Copyright (c) 2025-present Mohamed Boudra. Apache-2.0; upstream LICENSE included.

`types/stream.ts` is reduced: it keeps only the verbatim runtime function
`getStreamItemMessageId`, because the full module imports tool-call parsers that
the presentation pipeline does not use. Its types are erased at build time.

Offline tests bundle the actual presentation order, plugin projection, tool-call
grouping, turn folding for each Chat display mode and the chat Find model with synthetic inputs.
Type-only host imports are erased. The public npm `@getpaseo/protocol` 0.14.0
package, installed as the development alias `paseo-host-protocol`, supplies runtime
helpers such as turn boundaries. No fixture is imported by production plugin entries.
These checks are not live-app or on-device acceptance.
