# paseo.cafe catalog

[paseo.cafe](https://paseo.cafe) is an independent community directory, not a
Paseo compatibility certification.

The original [PR #86](https://github.com/paseo-cafe/paseo-cafe/pull/86) was merged.
The monorepo migration updates that existing entry in place:

- Registry file and plugin ID: `readable-agent-activity`.
- Repository: `geoqiao/paseo-stuff`.
- Subdirectory: `plugins/agent-activity`.
- Prepared pointer: [catalog-entry.json](catalog-entry.json).

Do not delete/re-add the entry or create another ID. The existing
`colorful-agent-activity` entry belongs to the upstream author and is not changed.
The migration still requires maintainer review and deployment before the live
directory points at the new source.

The entry discloses the Full detail-only beta limitation. `platforms` is omitted
because the implementation is not OS-restricted; the caveat distinguishes a
tested macOS host from untested native mobile clients.

Registry validation checks the public repository and subpath, the manifest, and
the match between manifest ID and registry filename. The scanner derives package
metadata, README, license and images from the plugin subdirectory. See the
[directory instructions](https://github.com/paseo-cafe/paseo-cafe#submitting-a-plugin).

A catalog pointer update does not modify previously installed Git sources.
See the [migration notes](https://github.com/geoqiao/paseo-stuff/blob/main/MIGRATION.md).
