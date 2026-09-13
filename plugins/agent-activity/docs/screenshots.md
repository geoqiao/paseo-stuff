# Beta.6 comparison screenshots

Captured on 2026-09-13 from real React Native Web renderer components with identical
synthetic data in each pair. No personal conversation, credential or live tool output
is included. No image generation or visual reconstruction was used.

| File | Pixels | Comparison |
| --- | --- | --- |
| `images/01-json-comparison.png` | 1176×848 | Serialized JSON vs whitespace-only formatting and highlighting; dark theme. |
| `images/02-code-comparison.png` | 1176×664 | Source-only exec input and pure text result transport; light theme. |
| `images/03-preview-comparison.png` | 1176×1618 | The same 60-line plain result; Activity previews 20 lines with one Show all. |

The left column is the **Paseo native renderer**, not another community Activity plugin.
It reuses `ToolCallDetailsContent` from Paseo v0.8.0, commit
[`b8e24677e12b226c7c38c1c3a40649daa9f1152f`](https://github.com/getpaseo/paseo/tree/b8e24677e12b226c7c38c1c3a40649daa9f1152f),
plus an adapted `ExpandableBadge` header and theme bridge. Upstream code is Apache-2.0;
see [upstream license](https://github.com/getpaseo/paseo/blob/b8e24677e12b226c7c38c1c3a40649daa9f1152f/LICENSE).
The source files used by the isolated development harness were checksum-verified.

The right column uses this release's unmodified production `ToolActivity` renderer.
The surrounding titles/panels label the comparison and are not contributed by the plugin.
The reference uses desktop inline details; these are **not live Paseo screenshots,
native mobile tests, or a complete host lifecycle/virtualization reproduction**.
Both use the verified default theme, not private/custom host preferences.

The screenshot harness is development-only and is not imported by or required to
install this plugin. Earlier screenshot assets remain in older immutable release tags.
