# Paseo 0.16.1 host test fixtures

Nine unmodified source files from getpaseo/paseo tag `v0.16.1`,
commit `c09a3d81e772a747dd11bca43d860f3518f07c2d`, plus one reduced file.
Paths below this directory mirror `packages/app/src/` in that commit.
Sources can be fetched from
`https://raw.githubusercontent.com/getpaseo/paseo/c09a3d81e772a747dd11bca43d860f3518f07c2d/packages/app/src/<path>`.
Copyright (c) 2025-present Mohamed Boudra. Apache-2.0; upstream LICENSE included.

`types/stream.ts` is reduced: it keeps only the verbatim runtime function
`getStreamItemMessageId`, because the full module imports tool-call parsers that
the presentation pipeline does not use. Its types are erased at build time.

Offline tests bundle the actual presentation order, plugin projection, tool-call
grouping, turn folding for each Chat display mode with synthetic inputs.
Type-only host imports are erased. The public npm `@getpaseo/protocol` 0.16.1
package, installed as the development alias `paseo-host-protocol`, supplies runtime
helpers such as turn boundaries. No fixture is imported by production plugin entries.
These checks are not live-app or on-device acceptance.
