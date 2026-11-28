# Paseo Stuff

> **Guides & Project Page:** [Paseo Complete Setup & Usage Guide (中文)](https://geoqiao.me/blog/paseo-guide/) · [paseo-stuff Project Page](https://geoqiao.me/projects/paseo-stuff/)
> **Workflow & Comparisons:** [Paseo Multi-Agent Profile Workflow](https://geoqiao.me/blog/how-i-use-paseo/) · [Orca vs Paseo](https://geoqiao.me/blog/how-i-use-orca/)

This repository maintains [DeepSeek Harness](plugins/deepseek-harness), which
connects Paseo to the official DSH executable through its ACP profile, and
[Math Renderer](plugins/math-renderer), which renders inline and block LaTeX in
assistant replies. Install DSH and configure credentials on the daemon machine.

## Install DeepSeek Harness

Paseo plugins run as trusted, unsandboxed code. Review the
[plugin README](plugins/deepseek-harness/README.md) and enable plugins on the
intended Paseo daemon. Install from the official registry:

~~~sh
paseo plugin add geoqiao/deepseek-harness --host <host:port>
~~~

For an exact version, install from npm or from its immutable Git tag:

~~~sh
paseo plugin add npm:paseo-deepseek-harness@0.1.0-beta.22 --host <host:port>
paseo plugin add git:geoqiao/paseo-stuff:plugins/deepseek-harness --ref deepseek-harness-v0.1.0-beta.22 --host <host:port>
~~~

The Git subdirectory selects the plugin. Paseo 0.11 and later interpret a bare
`owner/name` as a registry ID. Use the `git:` prefix for a direct Git install.
See [migration notes](MIGRATION.md) before changing an existing source.

DeepSeek Harness requires **Paseo 0.11.0 or later**. The stable verification
target is **0.16.2**, and the minimum SDK pin is **0.11.4**. The current verified
official DSH CLI is **0.2.2-rc.5**, which requires **Node.js >=24.9.0**. See the
[verification record](plugins/deepseek-harness/docs/verification.md) for beta,
isolated provider and UI check results.

## Install Math Renderer

Math Renderer requires **Paseo 0.13 or later**. Enable plugins on the intended
daemon and install from the official registry:

~~~sh
paseo plugin add geoqiao/math-renderer --host <host:port>
~~~

The [Math Renderer README](plugins/math-renderer/README.md) has pinned npm and
Git install commands, compatibility details and verification history.

### Registry mirrors and artifact verification

Paseo 0.12.0 through 0.15.4 also compare the tarball URL, so a registry mirror
can cause an “npm artifact changed since review” error. Paseo 0.16.1 accepts
different mirror URLs with matching version and integrity. On affected hosts,
use the direct npm install above or set `npm config set replace-registry-host never`
as the daemon's user before retrying the registry install.
[Upstream fix](https://github.com/getpaseo/paseo/pull/8756)

## Development

Run npm from the plugin directory:

~~~sh
cd plugins/deepseek-harness
npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
npm run check
~~~

For Math Renderer, run the same install command from `plugins/math-renderer`,
then run `npm run prepare:markdown`, `npm run prepare:wasm` and `npm run check`.

CI checks both plugins on Node.js 22 and 24 and exercises the real Windows DSH
launcher. The Orca automation **Paseo Stuff 每日维护** checks both plugins and
shared maintenance daily at 08:00 Asia/Shanghai. See the
[maintenance guide](.github/maintenance/README.md) and [development rules](AGENTS.md).

## Releases and registry

Releases use `deepseek-harness-v<version>` or `math-renderer-v<version>`, with
the version from the plugin's `package.json`. Publishing a GitHub Release triggers
[trusted npm publishing](.github/workflows/publish-npm.yml). The workflow
checks the version and runs the plugin checks. To retry a release, dispatch the
workflow with the same tag. Versions already on npm are skipped.

The packed manifest removes Git-only build commands and the package ships an
`npm-shrinkwrap.json` for production dependencies. CI installs those dependencies
and loads the result in a Paseo daemon.

The official registry records for
[DeepSeek Harness](https://github.com/getpaseo/plugins/blob/main/plugins/geoqiao/deepseek-harness.json)
and [Math Renderer](https://github.com/getpaseo/plugins/blob/main/plugins/geoqiao/math-renderer.json)
pin their reviewed npm artifacts. The registry opens a bump PR when a new npm
version appears. Both plugins keep English and Simplified Chinese overviews next
to their manifests. Their Paseo Cafe entries use this repository and the
corresponding plugin subdirectories.

## Retired plugin

| Plugin | Source and last release |
| --- | --- |
| Readable Agent Activity | [Source](plugins/agent-activity) · [0.1.0-beta.14](https://github.com/geoqiao/paseo-stuff/releases/tag/readable-agent-activity-v0.1.0-beta.14) |

Readable Agent Activity has stopped receiving fixes, new releases and
compatibility checks. Historical npm versions and Git tags remain available for
existing installations. Its README records compatibility for the last release.

## Licenses

Repository-authored material is MIT unless otherwise noted. Each plugin retains
its license and dependency notices. Vendored fixtures retain their respective
licenses. Readable Agent Activity derives from Matt Cowger's MIT plugin.
[Provenance](plugins/agent-activity/UPSTREAM.md)
