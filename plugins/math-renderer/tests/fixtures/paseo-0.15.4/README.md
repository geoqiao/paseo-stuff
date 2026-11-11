# Paseo 0.15.4 host test fixtures

Nine unmodified source files from getpaseo/paseo tag `v0.15.4`,
commit `1c00b365c9e0b74c1580eba33d905d693125ae21`, plus one reduced file.
Paths below this directory mirror `packages/app/src/` in that commit.
The annotated tag object is `b2f00c7d3214257201040bcc8af5a3a3e21e21a5`;
its peeled source commit is the commit above. Sources can be fetched from
`https://raw.githubusercontent.com/getpaseo/paseo/1c00b365c9e0b74c1580eba33d905d693125ae21/packages/app/src/<path>`.
Copyright (c) 2025-present Mohamed Boudra. Apache-2.0; upstream LICENSE included.

`types/stream.ts` is reduced: it keeps only the verbatim runtime function
`getStreamItemMessageId`, because the full module imports tool-call parsers that
the presentation pipeline does not use. Its types are erased at build time.

Offline tests bundle the actual presentation order, plugin projection, tool-call
grouping, turn folding for each Chat display mode and the chat Find model with synthetic inputs.
Type-only host imports are erased. The public npm `@getpaseo/protocol` 0.15.4
package, installed as the development alias `paseo-host-protocol`, supplies runtime
helpers such as turn boundaries. No fixture is imported by production plugin entries.
These checks are not live-app or on-device acceptance.
