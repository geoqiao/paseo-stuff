# Upstream compatibility fixture

Four unmodified source files copied from getpaseo/paseo tag v0.8.0, commit b8e24677e12b226c7c38c1c3a40649daa9f1152f.

- tool-calls/* corresponds to packages/app/src/tool-calls/detail-level/*.
- plugins/projection.ts corresponds to packages/app/src/plugins/timeline/projection.ts.
- Copyright (c) 2025-present Mohamed Boudra. Apache-2.0; LICENSE retained.

Tests run the real projection functions with synthetic messages. Type-only host imports are erased by Vitest. Fixtures are excluded from plugin typechecking and never imported by production entries. No code is executed in the installed Paseo app.

The Summary test intentionally demonstrates the unresolved incompatibility, not successful support.
