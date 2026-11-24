# Releasing Paseo Stuff plugins

Release each plugin from [its own directory](plugins/). Follow [AGENTS.md](AGENTS.md)
for compatibility targets and the [maintenance authorization rules](.github/maintenance/prompt.md)
for approvals. Documentation-only changes do not need a plugin release.

| Plugin directory | npm package | Git tag | Minimum SDK pin |
| --- | --- | --- | --- |
| `plugins/deepseek-harness` | `paseo-deepseek-harness` | `deepseek-harness-v<version>` | `0.11.4` |
| `plugins/math-renderer` | `paseo-math-renderer` | `math-renderer-v<version>` | `0.13.2` |

## Prepare the release PR

1. Start from current `main` in `geoqiao/paseo-stuff`. Review the changes since
   the last plugin tag and confirm the upstream fixes are in the releases you
   intend to support. For DSH, check the official CLI's npm `latest` and `next`
   and verify any newly supported version.
2. Bump the version in the plugin's `package.json` and `package-lock.json`
   together. For a version-only bump, run `npm version <version> --no-git-tag-version`
   from the plugin directory. Update its changelog, pinned install examples and
   applicable manifest requirements, notices and overviews. Draft the release
   notes with the user-visible changes, supported versions and verification scope.
3. From that directory, install the locked dependencies with
   `npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund` and run
   `npm run check`. For Math Renderer, run `npm run prepare:markdown` and
   `npm run prepare:wasm` before the check. Repeat with the current stable target
   from [AGENTS.md](AGENTS.md) by setting `paseo_sdk` to that version and running
   the following. Run the same preparation and checks again, then restore the
   locked dependencies before packing.

   ```sh
   npm install --no-save --package-lock=false --ignore-scripts --legacy-peer-deps \
     --no-audit --no-fund "@getpaseo/client@$paseo_sdk" \
     "@getpaseo/plugin@$paseo_sdk" "@getpaseo/protocol@$paseo_sdk"
   ```

4. Run `npm pack` into a temporary directory. Inspect the tarball's package
   version, plugin manifest, `npm-shrinkwrap.json`, entry points and both
   overviews. Check that the packed manifest has no Git-only build command.
   Install the unpacked package's production dependencies from its shrinkwrap
   and load it in an isolated Paseo daemon. Use the
   [CI package job](.github/workflows/ci.yml) as the reference for this smoke test.
   Record the SDK, CLI, daemon and live-client checks you actually ran.
5. Confirm the GitHub noreply commit identity, push the authorized branch and
   open a PR against `main` with the notes and verification results. Wait for the
   checks on the final head and resolve outstanding review before merging under
   the applicable authorization. Capture the full merged commit SHA from GitHub.

## Publish and verify

1. With release authorization, confirm the tag points to the merged commit if
   it already exists. Stop if it points elsewhere. Confirm the release and npm
   version are absent for a new publication. Publish a GitHub Release with the
   approved title and notes. For a beta, use `--prerelease`. When the tag is new,
   GitHub can create it at the merged commit in the same operation. For example,
   with `tag`, `merged_sha`, `title` and `notes_file` set to the verified release
   values:

   ```sh
   gh release create "$tag" -R geoqiao/paseo-stuff --target "$merged_sha" \
     --title "$title" --notes-file "$notes_file" --prerelease
   ```

2. A **published** GitHub Release (including a prerelease) triggers
   [Publish to npm](.github/workflows/publish-npm.yml). A tag push or draft release
   leaves publication pending. The workflow checks out the tag, validates the
   package version, runs the plugin checks and publishes through npm trusted
   publishing. It uses the npm `latest` dist-tag for both plugins, including beta
   versions. If the run fails, check whether the version reached npm before
   retrying. To retry under the release authorization, run
   `gh workflow run publish-npm.yml -R geoqiao/paseo-stuff -f tag="$tag"`.
   The workflow skips versions that already exist on npm. First-time publication
   is handled by the owner.
3. After the workflow succeeds, check the exact npm version, tarball URL and
   integrity and verify `latest` points to the intended version. Download the
   published package, inspect it and run the applicable isolated smoke check.
   Verify the remote tag SHA and record the PR, release, Actions run, npm
   metadata and check results. Track the Paseo registry bump separately and
   verify its version and integrity once accepted.
