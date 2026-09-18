# Verification and limits

2026-09-18. Beta.4's migration target is
Paseo public SDK **0.9.0-beta.1**, while the earlier 0.8.0 evidence remains
historical evidence. The manifest's `>=0.8.0 <0.10.0` range expresses the two
tested minor lines; it is not a promise about later 0.9 prereleases or 0.10.

## Upstream evidence

- npm reports `latest` and `next` as DSH `0.1.5-rc.2`, and `alpha` as
  `0.1.6-alpha.2`. The published alpha tarball is
  [`@deepseek-ai/dsh@0.1.6-alpha.2`](https://www.npmjs.com/package/%40deepseek-ai/dsh/v/0.1.6-alpha.2) with integrity
  `sha512-PHR/3ZHpJNWXlDQ3U9weFb7calWbSMJd2GD3z2iPJ8zAKL7ipuzyPy5xGbaXf2OA8hc0SAGJeoUW7nfatCNOYw==`.
- The official DSH tag `dsh-v0.1.6-alpha.2` resolves to commit
  [`ddefc45fbc7f8e46dd73185e68295696d1297887`](https://github.com/deepseek-ai/deepseek-harness/commit/ddefc45fbc7f8e46dd73185e68295696d1297887). Its published CLI closure
  resolves DSH, `dsh-acp-app`, and `dsh-acp` to `0.1.6-alpha.2`, with
  `@agentclientprotocol/sdk` `1.4.0` and matching alpha.2 agent, session, LLM,
  MCP, persistence, token-meter, and approval packages.
- The [official ACP package contract](https://github.com/deepseek-ai/deepseek-harness/blob/dsh-v0.1.6-alpha.2/packages/acp/acp/README.md) for both tested closures advertises
  `session/list`, `session/resume`, and `session/close`, omits legacy
  `session/load`, and documents that resume does not replay history. The
  published ACP mappings for rc.2 and alpha.2 retain message IDs on assistant
  and reasoning chunks and typed content blocks on tool results.

## Layers of evidence

The beta.1 baseline below had 19 automated cases. The separate
[beta.2 code review](code-review.md) passes typecheck/lint and **32 tests** after
diagnostic fixes and missing-coverage additions. Its new failures use synthetic
processes/strings; the real-inference evidence below was established in beta.1,
not silently reclassified as a fresh beta.2 API or native-client run.

| Layer | Evidence |
| --- | --- |
| Public SDK + fake ACP process | Node 22.23.2 and Node 24.21.0 `npm run check` passed: typecheck, lint with zero warnings/errors, **32 tests / 2 files** against exact Paseo SDK `0.9.0-beta.1`. Catalog/model/thinking IDs, config changes, multiple turns, persistence, complete output, MCP/image frames, allow/deny permissions, cancellation/errors/EOF, concurrent cwd/env isolation and closure during version probe/initialize/prompt are covered. |
| Real ACP control surface | The published rc.2 and alpha.2 CLIs each passed an initialize probe reporting ACP v1, `session/list`, `session/resume`, `session/close`, HTTP MCP, and no `loadSession`; each created and closed a temporary session. |
| Official runtime + public provider factory | On Node 22.23.2, isolated CLI `0.1.5-rc.2` with ACP `0.1.5-rc.2` and global CLI `0.1.6-alpha.2` with ACP `0.1.6-alpha.2` each passed catalog discovery, session open/configuration, one bounded synthetic no-tools prompt with the exact marker `SYNTHETIC_DSH_PASEO_CHECK`, usage/timeline events validated by `ProviderEventSchema`, and clean close. No permission event occurred. |
| Latest alpha persistence and tool regression | On Node 24.21.0 with global `@deepseek-ai/dsh@0.1.6-alpha.2`, a temporary wrapper recorded **6/6** owned ACP profile children closed across provider disposal. A first no-tools prompt stored a unique marker; a second provider reopened the returned persistence, the wrapper observed `session/resume` and no `session/load`, and a second prompt recalled the marker without including it. A temporary `read-probe.txt` read-tool prompt returned the synthetic file marker through a typed `tool_call` raw-output detail; no permission event or approval response was involved. |
| Historical official runtime + production provider factory | CLI `0.1.5-rc.1` and `0.1.5-rc.2`, each with ACP package `0.1.5-rc.2` and ACP SDK `1.4.0`. Three real DeepSeek v4-flash/reasoning-off turns per version passed: memory, file write/read, complete >8,000-character tool-output tail, and native context after provider/child restart. All emitted events passed `ProviderEventSchema`; usage events arrived. |
| Local CLI upgrade | The authorized global installation moved from `@deepseek-ai/dsh` `0.1.5-rc.2` to `0.1.6-alpha.2`. `$HOME/.dsh/.credentials.yaml` remained owner-only (`0600`) with unchanged metadata; its contents were never read or logged. |
| Historical actual macOS Paseo daemon | Installed server entry and provider discovery succeeded. Two real turns retained context and a 101-line tool result. After disabling/enabling only this plugin, a third turn recalled the same marker and filename, and Paseo retained earlier displayed messages. No credential was passed in the Paseo agent configuration. |
| Real managed-child cleanup | An official DSH foreground shell tool launched a synthetic Node process that ignored SIGTERM. After closing the production provider, that owned child was gone. This is a targeted check, not a guarantee for arbitrary independently detached services. |
| Client UI | No custom client entry. Desktop UI matrix, native iOS/Android, vision requests and real MCP services are untested. Fake image/MCP frame tests are not live service or device tests. |

The 0.8.0 daemon and earlier rc.1/rc.2 inference rows are retained from the
previous beta evidence. This migration did not reload, enable, disable, or
restart the installed Paseo daemon; the existing DeepSeek Harness installation
remained disabled.

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
- The CLI version guard accepts only the three tested exact releases. It does
  not pin the CLI's transitive packages or certify future dependency closures.
  DSH itself is a rapidly changing developer preview.
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
