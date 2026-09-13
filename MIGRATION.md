# Moving to the plugin monorepo

Development and new releases now live in `geoqiao/paseo-stuff`. Old repositories,
commits and release tags remain available; they are not deleted or rewritten.

| Existing plugin / catalog ID | New source | First monorepo tag |
| --- | --- | --- |
| `readable-agent-activity` | `geoqiao/paseo-stuff:plugins/agent-activity` | `readable-agent-activity-v0.1.0-beta.5` |
| `deepseek-harness` | `geoqiao/paseo-stuff:plugins/deepseek-harness` | `deepseek-harness-v0.1.0-beta.3` |

The existing Cafe submissions [#86](https://github.com/paseo-cafe/paseo-cafe/pull/86)
and [#87](https://github.com/paseo-cafe/paseo-cafe/pull/87) were merged. The separate
[migration PR #97](https://github.com/paseo-cafe/paseo-cafe/pull/97) also merged,
changing `repo` and adding `path` while retaining filenames and IDs.
Math Renderer's [PR #98](https://github.com/paseo-cafe/paseo-cafe/pull/98) merged as
a separate new entry, not a replacement for either plugin. Cafe derives later
versions from each plugin's package.json during its scan/deployment cycle.

## New installations

Use the install command in the selected plugin's README. Each subdirectory has
its own manifest, lockfile and build commands; installing one does not install
its siblings. Tags pin a version. Tracking `main` opts into future updates from
this trusted, unsandboxed repository.

## Existing installations

A Cafe pointer change does **not** redirect a Git installation's stored remote.
`paseo plugin update <id>` follows that installation's existing source; an old
tag stays pinned. Local directory installations already pointing into this
checkout need no source migration: typecheck, then reload their existing alias.

For Paseo 0.8.0, adding the new Git source under an already configured ID is
rejected; it is not an in-place source replacement. Removing a plugin stops it,
removes a Git-managed checkout and deletes plugin settings. Installing enables
it. These behaviors are confirmed in the
[0.8.0 lifecycle implementation](https://github.com/getpaseo/paseo/blob/b8e24677e12b226c7c38c1c3a40649daa9f1152f/packages/server/src/server/plugins/index.ts).

Therefore migration is opt-in, not an automatic background action:

1. Inspect `paseo plugin ls --host <your-host>`. Record the existing runtime ID
   (including any custom alias), source/ref, enabled state and user settings.
   Preserve any local edits in a managed checkout outside it before removal.
2. Wait for work that uses the plugin to finish. In particular, do not replace
   DeepSeek Harness while its agents or child processes are active.
3. If the plugin is intentionally disabled, leave it installed and disabled
   until you explicitly want to enable the new installation. Paseo 0.8.0 has
   no disabled-install CLI flag; do not enable it briefly as a migration trick.
4. For an enabled installation you have explicitly chosen to replace, remove
   the old installation and add the new source with `--id <existing-id>` and
   its pinned tag. Use the same explicit host for both commands. This has
   downtime and can require restoring user settings; it is not transactional.
   Keep the old source/ref for recovery if the new install fails.
5. Verify the resulting source, ID and runtime status. Do not create an enabled
   duplicate. Activity still requires Full detail on **all** connected clients.

No daemon restart or manual edit to Paseo's private source records is required.
Publishing this repository does not itself change anyone's installed plugins.
