# Verification and limits

2026-09-12. Beta compatibility is verified against Paseo app/daemon/public SDK
**0.8.0**. The manifest's `>=0.8.0 <0.9.0` range is not a promise that future
0.8 releases have already been tested.

## Layers of evidence

The beta.1 baseline below had 19 automated cases. The separate
[beta.2 code review](code-review.md) passes typecheck/lint and **32 tests** after
diagnostic fixes and missing-coverage additions. Its new failures use synthetic
processes/strings; the real-inference evidence below was established in beta.1,
not silently reclassified as a fresh beta.2 API or native-client run.

| Layer | Evidence |
| --- | --- |
| Public SDK + fake ACP process | `npm run check` passed: typecheck, lint with zero warnings/errors, **19 tests / 2 files**. Catalog/model/thinking IDs, config changes, multiple turns, persistence, complete output, MCP/image frames, allow/deny permissions, cancellation/errors/EOF, concurrent cwd/env isolation and closure during version probe/initialize/prompt. |
| Official runtime + production provider factory | CLI `0.1.5-rc.1` and `0.1.5-rc.2`, each with ACP package `0.1.5-rc.2` and ACP SDK `1.4.0`. Three real DeepSeek v4-flash/reasoning-off turns per version passed: memory, file write/read, complete >8,000-character tool-output tail, and native context after provider/child restart. All emitted events passed `ProviderEventSchema`; usage events arrived. |
| Actual macOS Paseo daemon | Installed server entry and provider discovery succeeded. Two real turns retained context and a 101-line tool result. After disabling/enabling only this plugin, a third turn recalled the same marker and filename, and Paseo retained earlier displayed messages. No credential was passed in the Paseo agent configuration. |
| Real managed-child cleanup | An official DSH foreground shell tool launched a synthetic Node process that ignored SIGTERM. After closing the production provider, that owned child was gone. This is a targeted check, not a guarantee for arbitrary independently detached services. |
| Client UI | No custom client entry. Desktop UI matrix, native iOS/Android, vision requests and real MCP services are untested. Fake image/MCP frame tests are not live service or device tests. |

Real tests used only synthetic markers and temporary files. Personal conversations,
credentials and raw private fixtures are not included in this repository. API calls
are paid and are not part of CI.

## Shutdown regression and fix

The first actual disable/enable run exposed `ERR_IPC_CHANNEL_CLOSED` in Paseo
0.8's plugin-process shutdown. Its close handler removes a connection from the
host map before awaiting its asynchronous close; concurrent shutdown can then
disconnect IPC before the final close acknowledgement. Session restoration still
passed, but an exit error is not considered clean teardown.

The adapter now owns pending connects, scopes, resources and closing promises
through `dispose()` in its async entry cleanup. It marks all scopes closed before
any await and retains already-closing connections until their close settles.
Three added public-SDK/fake-peer regressions passed for pending version probing,
pending initialization and host-close acknowledgement ordering.

After loading the fix, the installed macOS daemon's disable/enable cycle was
repeated while DSH sessions were idle or closed. The new log interval contained
only stopping/stopped/loading/ready entries, with no IPC error or stderr. Another
real model turn restored the same marker and filename, and retained the earlier
Paseo history. All installed plugins' enable/status values were unchanged after
the cycle. The existing daemon was not restarted.

No host internals are imported or patched, and no global IPC/error handler is used
to hide the failure. Older log entries from the pre-fix runtime remain historical
evidence, not new failures. These targeted checks do not prove every possible
host shutdown or external detached-process scenario.

## Deliberate limitations and side effects

- DSH's ACP profile emits committed messages/thoughts and generic tool events,
  not raw token deltas, slash commands, steering, plans or terminal UI surfaces.
- Resume restores DSH context, not a replay of its transcript. Paseo owns its
  existing displayed history. Failed resume is never retried as a fresh session.
- Catalog discovery uses `session/new`; official DSH can retain those empty
  sessions. The plugin does not delete native records or read private transcripts.
- DSH profile settings stay authoritative. The generic ACP shim does not inject
  Paseo's extra system prompt. Custom profiles must still provide ACP over stdio.
- The CLI version guard accepts only the two tested prereleases. It does not pin
  the CLI's transitive packages or certify future dependency closures. DSH itself
  is a rapidly changing developer preview.
- Complete output is intentionally retained. Large payload transfer, storage,
  Raw and copying can be expensive. An optional renderer may bound display work;
  this adapter never drops the original body to make a preview faster.
- Plugins, official DSH and its tools run as trusted, unsandboxed code. Credentials
  stored with mode 0600 remain readable to tools running as the same OS user.

## Dependency review

`npm audit --omit=dev` reported zero advisories for the adapter's production
dependencies and the separately installed official CLI rc.2 dependency tree on
the date above. This is a point-in-time package-advisory check, not a security
certification. Official DSH's safety notice and the user's tool permission policy
still apply.
