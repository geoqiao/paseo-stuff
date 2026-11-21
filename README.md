# Paseo Stuff

[DeepSeek Harness](plugins/deepseek-harness) is the maintained Paseo plugin in
this repository. It connects Paseo to the official DSH executable through its
ACP profile. Install DSH and configure credentials on the daemon machine.

## Install DeepSeek Harness

Paseo plugins run as trusted, unsandboxed code. Review the
[plugin README](plugins/deepseek-harness/README.md) and enable plugins on the
intended Paseo daemon. Install from the official registry:

~~~sh
paseo plugin add geoqiao/deepseek-harness --host <host:port>
~~~

For an exact version, install from npm or from its immutable Git tag:

~~~sh
paseo plugin add npm:paseo-deepseek-harness@0.1.0-beta.21 --host <host:port>
paseo plugin add git:geoqiao/paseo-stuff:plugins/deepseek-harness --ref deepseek-harness-v0.1.0-beta.21 --host <host:port>
~~~

The Git subdirectory selects the plugin. Paseo 0.11 and later interpret a bare
`owner/name` as a registry ID. Use the `git:` prefix for a direct Git install.
See [migration notes](MIGRATION.md) before changing an existing source.

DeepSeek Harness requires **Paseo 0.11.0 or later**. The stable verification
target is **0.16.2**, and the minimum SDK pin is **0.11.4**. The current verified
official DSH CLI is **0.2.2-rc.5**, which requires **Node.js >=24.9.0**. See the
[verification record](plugins/deepseek-harness/docs/verification.md) for beta,
isolated provider and UI check results.

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

CI checks DSH on Node.js 22 and 24 and exercises the real Windows DSH launcher.
The Orca automation **Paseo Stuff 每日维护** checks DSH and shared maintenance
daily at 08:00 Asia/Shanghai. See [maintenance](.github/maintenance/README.md)
and [development rules](AGENTS.md).

## Releases and registry

DSH releases use the tag `deepseek-harness-v<version>`, with the version from
the plugin's `package.json`. Publishing its GitHub Release triggers
[trusted npm publishing](.github/workflows/publish-npm.yml). The workflow
checks the version and runs the plugin checks. To retry a release, dispatch the
workflow with the same tag. Versions already on npm are skipped.

The packed manifest removes Git-only build commands and the package ships an
`npm-shrinkwrap.json` for production dependencies. CI installs those dependencies
and loads the result in a Paseo daemon.

The [official registry record](https://github.com/getpaseo/plugins/blob/main/plugins/geoqiao/deepseek-harness.json)
pins the reviewed npm artifact. The registry opens a bump PR when a new npm
version appears. DSH keeps English and Simplified Chinese overviews next to
its manifest. Its [Paseo Cafe entry](https://github.com/paseo-cafe/paseo-cafe/pull/97)
uses the same repository and plugin subdirectory.

## Retired plugins

| Plugin | Source and last release |
| --- | --- |
| Math Renderer | [Source](plugins/math-renderer) · [0.1.0-beta.8](https://github.com/geoqiao/paseo-stuff/releases/tag/math-renderer-v0.1.0-beta.8) |
| Readable Agent Activity | [Source](plugins/agent-activity) · [0.1.0-beta.14](https://github.com/geoqiao/paseo-stuff/releases/tag/readable-agent-activity-v0.1.0-beta.14) |

Both plugins have stopped receiving fixes, new releases and compatibility
checks. Historical npm versions and Git tags remain available for existing
installations. Recorded compatibility applies to the versions listed in each
plugin's README.

## Licenses

Repository-authored material is MIT unless otherwise noted. Each plugin retains
its license and dependency notices. Vendored fixtures retain their respective
licenses. Readable Agent Activity derives from Matt Cowger's MIT plugin.
[Provenance](plugins/agent-activity/UPSTREAM.md)
