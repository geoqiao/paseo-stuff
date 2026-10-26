# Paseo 0.13 host test fixtures

Seven unmodified source files from getpaseo/paseo tag `v0.13.2`,
commit `d2941157a8f91512daf54fc688241d416e8f5ebd`.
Paths below this directory mirror `packages/app/src/` in that commit.
Copyright (c) 2025-present Mohamed Boudra. Apache-2.0; upstream LICENSE included.

Offline tests bundle the actual presentation order, plugin projection, tool-call
grouping and the chat Find model with synthetic inputs. Type-only host imports are
erased; the public npm protocol package supplies runtime dependencies. No fixture
is imported by production plugin entries. These checks are not live-app or
on-device acceptance.
