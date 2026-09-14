# MaKa provider for Paseo

An experimental server-only plugin that adds **MaKa** to Paseo 0.8's provider picker through
the official `maka --acp` interface. It supports streamed conversations, real file and shell
work, follow-up prompts, cancellation, and MaKa's configuration selectors.

## Install

Requirements: Paseo 0.8 with plugins enabled, Node.js 22.19 or newer, and a configured MaKa CLI
on the machine running the Paseo daemon. The tested MaKa build is pinned here because its ACP
interface is still evolving.

**If you use MaKa Desktop, update it to the same release before starting the CLI.** Both
applications share MaKa's workspace database. A newer CLI can migrate that database into a
format an older desktop cannot open. For this tested CLI, use
[MaKa Desktop 0.2.0-dev.31.20260913](https://github.com/apache/maka/releases/tag/v0.2.0-dev.31.20260913).

```bash
npm install --global maka-agent@0.2.0-dev.31.20260913
maka
```

Use MaKa's own UI to configure a working provider connection, credentials, and a default model,
then exit it. A working MaKa default is required before Paseo can discover the model catalog.
The plugin neither imports credentials nor changes your MaKa profile.

Install the published plugin from GitHub:

```bash
paseo plugin add geoqiao/paseo-stuff:plugins/maka --ref maka-v0.1.0-beta.1 --host 127.0.0.1:6767
```

For a local development checkout, run from this plugin directory instead:

```bash
npm ci --ignore-scripts --legacy-peer-deps --no-audit --no-fund
npm run check
paseo plugin install "$PWD" --host 127.0.0.1:6767
```

Replace the host with your daemon's address if different. For later source changes, run the
checks again, then `paseo plugin reload maka --host 127.0.0.1:6767`. Reloading ends existing
MaKa sessions; create a new agent afterwards.

Select **MaKa → MaKa configured default** when creating an agent. The model label is a local
selector for the model already chosen in MaKa; it does not switch the upstream model. Thinking
levels depend on that model. MaKa also exposes collaboration, permission, and orchestration
configuration through ACP; Paseo presents the selectors supported by its public ACP shim.

The provider launches the executable with the working directory and environment supplied by
Paseo. If `maka` is unavailable on the daemon's `PATH`, set `MAKA_PASEO_COMMAND` in the daemon's
environment to the absolute executable path. This variable accepts an executable path only;
the plugin supplies `--acp` itself.

## Current limits

The tested official MaKa ACP implementation has these boundaries:

- **Tool visibility:** MaKa can execute file and shell tools, but ACP publishes only assistant
  text and thinking. Paseo receives no tool cards, tool results, or usage updates.
- **MCP:** MaKa rejects MCP servers. The plugin omits Paseo's MCP configuration and emits an
  explicit session notice, without exposing its values. Paseo's agent-management MCP is also
  unavailable inside MaKa conversations.
- **Permissions and questions:** the interactive bridge is unavailable. The plugin preserves
  MaKa's permission mode and never automatically approves tools. Tasks requiring an unsupported
  interaction fail; resolve configuration through MaKa's own UI.
- **History:** follow-ups work while the session is connected. Resume/load, imported history,
  and restoration after plugin reload or daemon restart are unavailable. Requests carrying
  persistence are rejected. Shutdown closes the owned ACP session and allows MaKa to cancel
  its associated Runtime Host work before process termination.
- **Prompt configuration:** MaKa does not apply Paseo's `_paseo` metadata, including custom
  system prompts, provider options, or tool policy. Configure effective behavior in MaKa.
- **Other input:** image prompts, provider commands, and prompt steering are unsupported.

The plugin rejects unsupported requests and documents the remaining upstream gaps. It uses
public SDKs and does not reconstruct missing features from private Runtime Host state.

These are limits of the tested MaKa ACP adapter, not the ACP protocol itself. Closing the ACP
connection does not delete MaKa's durable history; the adapter lacks a way to reopen it.
See the [upstream maintenance procedure](docs/upstream-maintenance.md) for how new MaKa releases
are reviewed and supported capabilities are added.

## Troubleshooting and verification

Check `maka --version`, ensure the same OS user can run MaKa with a working default, then inspect:

```bash
paseo plugin ls --host 127.0.0.1:6767
paseo provider models maka --host 127.0.0.1:6767
paseo plugin logs maka --host 127.0.0.1:6767
```

A configured free provider is not necessarily available for inference. Validate an ordinary
prompt in MaKa if Paseo can discover selectors but turns time out.

If Desktop reports `OperationalStateMigrationBlockedError` or a schema newer than its supported
version, update Desktop to match the CLI. Changing schema version numbers or restoring only
part of the database is not a compatible downgrade.

`npm run check` runs TypeScript, lint, and tests against the public Paseo ACP shim and synthetic
ACP peers. Real CLI, installed-host, and UI evidence is in
[`docs/verification.md`](docs/verification.md), including the versions and platform limits.
