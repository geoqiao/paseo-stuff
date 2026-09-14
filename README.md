# Paseo Stuff

Independent community plugins for [Paseo](https://paseo.sh), maintained in one repository.
Each plugin has its own manifest, version, npm lockfile, tests and license. There is no
shared runtime or root-hoisted dependency tree.

## Plugins

| Plugin | Directory | Status / important limits |
| --- | --- | --- |
| Math Renderer | [plugins/math-renderer](plugins/math-renderer) | Experimental beta; block LaTeX in reply bodies, Paseo 0.8.0 only. Inline math and native mobile acceptance are not complete. |
| Readable Agent Activity | [plugins/agent-activity](plugins/agent-activity) | Full detail only; disable before using Summary on any connected client. |
| DeepSeek Harness | [plugins/deepseek-harness](plugins/deepseek-harness) | Provider adapter; requires a separately installed, compatible official DSH executable and credentials. |
| MaKa | [plugins/maka](plugins/maka) | Experimental provider for the official MaKa ACP CLI; uses MaKa's configured default model. MCP forwarding, permission dialogs and session reopening are not supported by the tested MaKa release. |
| Paseo Pet | [plugins/paseo-pet](plugins/paseo-pet) | Experimental sidebar companion for user-supplied Codex pet packs; native mobile acceptance is not complete. No character assets included. |

Read each plugin's README before installing. Plugins are trusted, unsandboxed code;
their permissions and operational requirements differ.

## Install a plugin from this repository

Run against the intended daemon, after reviewing the plugin and enabling plugins in Paseo:

```sh
paseo plugin add geoqiao/paseo-stuff:plugins/math-renderer --ref math-renderer-v0.1.0-beta.2 --host <host:port>
```

The `:plugins/<directory>` suffix selects one plugin, not the whole repository.
Do not enable two installations of the same timeline renderer or provider.

This is the new development and release home for Readable Agent Activity and
DeepSeek Harness as well. Their old repositories and immutable release tags remain
available for existing installations. The existing Cafe entries keep their IDs;
the registry migration in PR #97 has merged and points to this repository.

Existing Git installations do **not** switch repositories automatically. See the
[migration notes](MIGRATION.md) before changing an installed source. Activity beta.5
includes the tested native-loading fix beyond the old standalone beta.4; DSH beta.3
changes publication metadata and documentation only.

## Development

Use npm from the plugin directory, not the repository root:

```sh
cd plugins/math-renderer
npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
npm run prepare:markdown --if-present
npm run prepare:wasm --if-present
npm run check
```

CI independently installs and checks all five plugins on Node.js 22 and 24.
Use the public Paseo SDK. Typecheck before reloading the exact installed ID on an
explicit host; do not restart the daemon or enable an intentionally disabled plugin.
See [AGENTS.md](AGENTS.md) for repository development rules.

## Versions and Cafe

Each plugin maintains its own `package.json.version`. Git tags use
`<plugin-id>-v<version>` so releases remain independent in the monorepo.

A [Paseo Cafe](https://github.com/paseo-cafe/paseo-cafe) entry can point to a subdirectory:

```json
{
  "repo": "geoqiao/paseo-stuff",
  "path": "plugins/math-renderer",
  "categories": ["productivity"],
  "submittedBy": "geoqiao"
}
```

The entry filename must match that plugin's `paseo-plugin.json.id`. Each listing is
submitted separately; a pull request is not a claim that Cafe has accepted the plugin.

The current Cafe scope is exactly these three plugins, all sourced from this repository:

| Catalog ID | Plugin directory | Merged PR |
| --- | --- | --- |
| `readable-agent-activity` | `plugins/agent-activity` | [Existing-entry migration #97](https://github.com/paseo-cafe/paseo-cafe/pull/97) |
| `deepseek-harness` | `plugins/deepseek-harness` | [Existing-entry migration #97](https://github.com/paseo-cafe/paseo-cafe/pull/97) |
| `math-renderer` | `plugins/math-renderer` | [New entry #98](https://github.com/paseo-cafe/paseo-cafe/pull/98) |

Paseo Pet remains managed here but is not submitted to Cafe. The linked PRs have
merged; subsequent version/README updates appear after Cafe's next scan and deployment.

## Licenses and publication scope

Repository-authored material is MIT unless otherwise noted. Each plugin retains its
own LICENSE and dependency/upstream notices; bundled test fixtures retain upstream licenses.
Readable Agent Activity derives from Matt Cowger's MIT plugin; see its
[provenance](plugins/agent-activity/UPSTREAM.md).

Local experiments, internal workspace notes, generated bundles, dependency directories,
host configuration, credentials and personal conversation captures are not published.
Plugin tests and screenshots use synthetic content.
