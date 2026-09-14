# Verification

## Tested runtime

- Verification date: 2026-09-14 (UTC).
- Local macOS host; Paseo Desktop-managed daemon and CLI 0.8.0.
- Public Paseo plugin/client/protocol packages 0.8.0; ACP SDK 1.4.0.
- Official `maka-agent` npm package `0.2.0-dev.31.20260913`.
- MaKa Desktop `0.2.0-dev.31.20260913` was subsequently verified to open the shared profile.
- MaKa executable tested with Node.js 26.8.2; Paseo's Electron helper uses Node.js 24.20.0.
- Real inference: DeepSeek API. The API accepts `deepseek-v4-flash` and returns
  the current model ID `deepseek-flash`; MaKa was configured with that current ID.

The tested npm package integrity is:

```text
sha512-5iVjgjXYJKCJGAqve4Q7ndQGzt3/fedjrp8AHUkm30IWc0UZWQCag7rkSntZmgNTAvcbB7F2prPEj49LLRrq5w==
```

## Official ACP behavior verified independently

### Desktop and CLI version compatibility

The initial setup exposed a desktop compatibility regression: the installed Desktop
`0.2.0-dev.15.20260902` supported runtime schema 15, while the newer official CLI migrated the
shared database to schema 18. Starting the older desktop produced
`OperationalStateMigrationBlockedError` and instructed the user to upgrade. Installing the
matching official Desktop `0.2.0-dev.31.20260913` restored startup and displayed the existing
sessions without downgrading or deleting profile data. The old application copies were removed
at the user's request; a profile backup was retained.

The macOS arm64 ZIP matched GitHub's published SHA-256
`5e52a28382ca1a8697c698d5e85adcc3d2e95452fe99f251c7ae15f3a48ab43f`, and the extracted application
passed `codesign --verify --deep --strict`. This is why the install instructions require matching
Desktop and CLI releases before starting the CLI.

### Raw ACP checks

The official CLI was exercised through ACP SDK 1.4.0 before installing the plugin.
This establishes the upstream behavior separately from the Paseo adapter.

- `initialize` advertised session listing and closing, without load/resume or images.
- `session/new` returned permission, thinking, collaboration and orchestration selectors.
- A real model turn streamed `MAKA_READY` in successive `agent_message_chunk` updates.
- A second session created and read a real file in a temporary project directory under
  MaKa's normal `ask` permission mode. The file contents were checked independently.
- A follow-up in the same session correctly recalled a synthetic word from the previous turn.
- The file-operation turn emitted thinking and assistant text, with **no tool-call updates**.

An earlier OpenCode Free connection completed ACP initialization and session creation but did
not produce a response within the bounded probe. That run is not counted as successful inference.

## Upstream boundaries

These are facts about the tested MaKa package, not features supplied by this plugin:

| Boundary | Evidence in the installed MaKa package |
| --- | --- |
| No session reopening | `dist/acp/maka-acp-agent.js` registers no load/resume handler; session registry ownership is connection-local. |
| No model selection | `dist/acp/session-registry.js` creates with `modelTarget: { kind: 'default' }`; config setters do not include a model selector. |
| No forwarded MCP | `validateNewSessionParams` rejects nonempty `mcpServers`. |
| No permission/question bridge | The session registry rejects active unsupported interactions with `unsupported_interaction`. |
| No tool cards or usage updates | `dist/acp/session-event-mapper.js` maps assistant text and thinking only; the real file test confirmed the wire behavior. |
| No Paseo metadata application | The new-session handler does not apply the shim's `_paseo` system prompt, provider options or tool policy. |

MaKa tools can still read and edit files. The missing tool cards describe observability through
ACP, not an absence of tool execution. Permission mode is owned by MaKa and is not weakened by
the plugin. A task that needs an interaction unavailable over ACP fails instead of being approved.

## Automated and installed-host checks

The plugin's automated tests use the real public Paseo ACP shim with synthetic ACP peer
processes. They verify adapter behavior without model credentials. They do not establish that
MaKa implements capabilities absent from its official wire protocol.

`npm run check` passed: TypeScript, lint (zero warnings/errors), and **15 tests**. Coverage includes
catalog/configuration, a valid new-session response without optional config options, isolated
working directories and environments, MCP omission and notices, unsupported input, prompt errors,
cancellation, EOF, startup failures, and disposal. Publication CI also passed on Linux with
Node.js 22 and 24: typecheck, lint, and all 15 tests passed on each version. All ten jobs in the
five-plugin matrix passed in [PR #5 CI](https://github.com/geoqiao/paseo-stuff/actions/runs/34872895011).
These synthetic-peer Linux checks do not establish real MaKa CLI execution on Linux.

The plugin was installed as a local directory in the running Paseo 0.8 Desktop-managed daemon.
It reached `running` without restarting the daemon. Real installed-host checks passed:

- The provider picker exposed **MaKa configured default**, with Default, Low, High, and Max
  thinking options from the configured DeepSeek model.
- A MaKa agent wrote and read `paseo-maka-check.txt`; its exact contents were independently
  checked as `PASEO_MAKA_OK` plus one newline. Its follow-up correctly recalled `cobalt`.
- Changing thinking to Low succeeded. A fresh agent opened with High thinking and Plan
  collaboration; Desktop displayed High, Ask, Plan, and Default orchestration selectors.
- Paseo Stop changed an independently observed native Runtime Host turn from `running` to
  `cancelled`.
- Reloading the plugin during another active turn also changed the native turn to `cancelled`.
  The verification observer held a separate public Runtime Host connection open throughout, so
  host exit could not disguise an orphaned turn. The plugin returned to `running`, and a new
  agent completed a real prompt afterwards.
- The final live response was exactly `PASEO_MAKA_FINAL_OK: 391`, with thinking shown separately.
  Desktop's native Thinking block was expanded and collapsed successfully.
- Plugin lifecycle logs showed clean stop/start transitions without cleanup errors.
- The test agents and temporary local workspace were archived after verification. A final
  native catalog check found no running turns in the test directory; the installed plugin
  remains enabled and running.

Two compatibility regressions were found through these real checks and fixed:

1. Startup listeners are now attached before the first `await`, so a process started from a
   daemon callback cannot emit `spawn` before its listener is registered. An event-loop callback
   test covers this scheduling boundary. Startup errors also retain a bounded, redacted cause.
2. MaKa emits thinking and answer chunks with the same native message ID. Paseo 0.8's ACP shim
   accumulates text by ID alone. The adapter gives the two channels disjoint, reversible IDs,
   preventing thinking from being prepended to the answer. The regression fixture uses shared
   IDs and interleaved chunks across follow-ups; it failed before the fix and passed afterwards.

Desktop checks used the macOS app in its existing dark appearance. Light appearance, narrow
windows, and native mobile were not separately tested. Tool-card Summary/Full checks do not
apply because MaKa emits no tool cards. MCP notice delivery is covered at the provider-event
boundary; a visible notice in the Desktop UI was not verified. Paseo's generic capability
snapshot can still report MCP/tool support, so the explicit upstream limitations above remain
the authoritative support statement.

## Sources

- [Paseo 0.8 provider plugins](https://paseo.sh/docs/plugins/v0.8/providers.md)
- [Paseo 0.8 plugin reference](https://paseo.sh/docs/plugins/v0.8/reference.md)
- [MaKa CLI installation and usage](https://github.com/apache/maka/blob/v0.2.0-dev.31.20260913/packages/cli/README.md)
- [MaKa ACP behavior](https://github.com/apache/maka/blob/v0.2.0-dev.31.20260913/packages/cli/src/acp/README.md)
- [MaKa ACP registration](https://github.com/apache/maka/blob/v0.2.0-dev.31.20260913/packages/cli/src/acp/maka-acp-agent.ts)
- [MaKa ACP session registry](https://github.com/apache/maka/blob/v0.2.0-dev.31.20260913/packages/cli/src/acp/session-registry.ts)
- [MaKa ACP event mapper](https://github.com/apache/maka/blob/v0.2.0-dev.31.20260913/packages/cli/src/acp/session-event-mapper.ts)

The MaKa source links are pinned to the tested release; the installed npm version and integrity
above identify the actual artifact tested. Windows, Linux and native mobile clients have not been
exercised with the real MaKa runtime here.
Credentials, personal transcripts, local host configuration and raw live logs are excluded from
the repository. The plugin does not configure or migrate a user's MaKa profile during installation.
