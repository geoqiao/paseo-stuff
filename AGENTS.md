# Paseo Stuff development rules

## Scope and layout

- Maintain only DeepSeek Harness (DSH) under `plugins/deepseek-harness/`. Math Renderer and Readable Agent Activity are retired. Preserve their sources, licenses, IDs and release history for existing installations.
- Keep DSH independently installable from its subdirectory. Use npm and its lockfile there. Keep the daemon entry in `index.server.ts` and daemon-only code under `server/`.
- Preserve upstream licenses and exact provenance for vendored fixtures. Keep generated bundles, dependencies, credentials, host configuration and personal conversations out of commits.

## Paseo and DSH contracts

- The stable verification target is Paseo app/daemon 0.16.2. Keep DSH SDK devDependencies pinned to 0.11.4 and install target SDKs without saving for verification. Move the target after checking each new stable release. Record prerelease checks separately.
- Track the newest official DSH release across npm `latest` and `next`. The verified CLI is 0.2.2-rc.5 and requires Node >=24.9.0. Test each release before listing it as verified.
- Declare `requirements.paseo` as a minimum (`>=`). Raise it when adopting an API that requires a newer version or after a support decision. Reserve upper bounds for known incompatibilities.
- Fetch https://paseo.sh/llms.txt and the version-matching plugin reference before adopting unfamiliar APIs. Use public SDK modules only. Keep usage, provider and lifecycle contributions within documented contracts.
- Keep provider transforms deterministic and JSON-safe. Preserve source information and stable item identity. Document and test compatibility gaps.

## Release and host safety

- `geoqiao/paseo-stuff` is the canonical DSH source. Use the registry ID `geoqiao/deepseek-harness` or an explicit `git:` source. Keep both `OVERVIEW.md` and `OVERVIEW.zh-CN.md` beside the manifest, included in npm, and synchronized. Overviews omit install commands, badges and em dashes.
- Publish DSH only through GitHub Release → `.github/workflows/publish-npm.yml` using trusted publishing. Keep npm tokens out of the repository. The owner handles first-time publication and interactive npm authentication. Verify published artifacts and distinguish a listing submission from an accepted or deployed record.
- Return cleanup and stop all resources owned by the plugin. Typecheck before installing or reloading on an explicit target. Preserve installation source and enabled state. Keep the running daemon and installed app intact.

## Daily maintenance

- Use the existing Orca automation **Paseo Stuff 每日维护** at 08:00 Asia/Shanghai. Its entrypoint is `.github/maintenance/prompt.md`. The detector and coordination lock live beside it. Keep local state and evidence under the canonical checkout's `.scratch/upstream-compat-watch/`.
- Follow DSH and shared maintenance issue/PR activity, official Paseo and DSH releases, the DSH registry record and explicitly tracked upstream items. Keep observed, reviewed, verified, released and deployed states separate.
- Preserve the public-reply, merge, release and local-install authorization boundaries in the maintenance prompt. Record unchanged waiting items without repeating checks or replies.

## Verification

- Run `npm run check` for DSH changes. Cover provider startup and cleanup, malformed and large inputs, capabilities, permissions, streaming, reconnection and persisted session replay where affected.
- Run `node --test .github/maintenance/*.test.mjs` for maintenance changes.
- Record versions actually tested and distinguish SDK tests, real CLI probes, isolated daemon checks and live client verification. Keep docs, manifest and install instructions consistent with tested support.
