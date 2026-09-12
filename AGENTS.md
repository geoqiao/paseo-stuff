# Paseo Stuff — development rules

## Scope and layout
- This repository can contain multiple independent Paseo plugins under `plugins/<name>/`.
- Each plugin owns its manifest, package.json, package-lock.json, README, LICENSE, tests and runtime modules.
- Keep plugins independently installable. Do not import sibling plugins or rely on root-hoisted dependencies.
- Use npm with each plugin's lockfile; run installation and verification from that plugin's directory.
- Root `docs/` contains accepted design, host compatibility evidence and cross-plugin decisions. Do not create a shared runtime framework before at least two plugins actually need it.
- Do not commit generated bundles, node_modules, credentials, local host configuration or personal conversation fixtures.
- Preserve upstream licenses and record exact provenance for forks and vendored fixtures.

## Paseo contracts
- Current verified target is Paseo app/daemon and SDK 0.8.0. Verify versions before introducing APIs.
- Fetch https://paseo.sh/llms.txt, then the version-matching plugin reference before adopting unfamiliar APIs.
- Client entries: `index.client.tsx`, client UI under `client/`.
- Optional daemon entry: `index.server.ts`, daemon-only modules under `server/`.
- Pure data/contracts under `shared/`; no other root code modules.
- Use public SDK modules only. Never import host internals in a production plugin, inspect host React state/DOM, or read private app storage to infer settings.
- Use React Native primitives and host UI. Derive colors from theme.colors and layout from layout.compact/platform.
- Host Icon exposes name/size/color, not stroke width in 0.8.0. Choose simple supported Lucide shapes; do not claim an unsupported strokeWidth parameter.
- Keep transforms synchronous, deterministic and JSON-safe. Preserve source information and stable item identity.
- Host Tool call display preferences take precedence. Never silently force Full detail or replace grouped Summary rows with a single call.
- A compatibility gap must be documented and tested, not hidden behind a guessed configuration value.
- Preserve per-card manual-only expansion through streaming and status updates.

## Safety and lifecycle
- Plugins are trusted unsandboxed code. Avoid network/process/filesystem privileges for presentation-only work.
- Return cleanup; unregister contributions and stop all resources owned by the plugin.
- Preserve installation enable/disable state. Do not restart the daemon to load source edits.
- Typecheck before install/reload. Use an explicit target host. Do not auto-enable a disabled plugin.
- Repository creation/development does not authorize publishing, remote creation, or replacing the installed Paseo app.

## Verification
- For changed plugins: npm run typecheck, npm run lint, npm test.
- Cover malformed/empty/large data, copying, streaming, user-controlled folding, narrow layouts and light/dark colors.
- Test Summary and Full detail against the supported host pipeline; distinguish host integration tests from mocked renderer tests.
- Record actual desktop/mobile checks and limitations accurately. Do not call mocked compact props an on-device mobile test.
- Keep docs, runtime manifest and install instructions consistent with tested support.
