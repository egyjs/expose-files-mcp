# expose-files-mcp

A configurable [Model Context Protocol](https://modelcontextprotocol.io) server for Node.js that gives an MCP-compatible client (Claude Desktop, Claude Code, Cursor, etc.) controlled access to a local working directory and — optionally — to a small, allow-listed set of terminal commands. The server can run locally over stdio, or over HTTP behind a bearer token and exposed to the public internet through **Cloudflare Tunnel** or **ngrok**.

> [!WARNING]
> This server can give an AI model the ability to read, write, and delete files on your machine and execute shell commands. Exposing it to the public internet without strict permissions, a strong auth token, and a tight command allowlist is dangerous. Read [Security model](#security-model) before enabling `public`.

## Table of contents

- [Project overview](#project-overview)
- [Installation](#installation)
- [Usage with npx](#usage-with-npx)
- [Local MCP usage (stdio)](#local-mcp-usage-stdio)
- [Public usage with cloudflared](#public-usage-with-cloudflared)
- [Public usage with ngrok](#public-usage-with-ngrok)
- [Configuration options](#configuration-options)
- [CLI options](#cli-options)
- [Example config files](#example-config-files)
- [Security model](#security-model)
- [Available MCP tools](#available-mcp-tools)
- [Cross-platform command examples](#cross-platform-command-examples)
- [Troubleshooting](#troubleshooting)
- [Development setup](#development-setup)
- [Publishing to npm](#publishing-to-npm)

## Project overview

`expose-files-mcp` is a single npm package that:

- Runs an MCP server using the official `@modelcontextprotocol/sdk`.
- Exposes a configurable **root directory** with file tools (`list_files`, `read_file`, `write_file`, `delete_file`, `search_files`) gated by `read-only` / `write-only` / `read-write` / `none` permissions.
- Exposes a `run_command` tool that runs a single command in the configured shell, with an **allowlist**, a **dangerous-command deny list**, a timeout, an output cap, and shell-metacharacter blocking by default.
- Supports two transports: `stdio` for local clients, and `http` (`/mcp` endpoint, Streamable HTTP) for remote clients.
- Optionally spawns `cloudflared` or `ngrok` to publish the HTTP server, and prints the public URL.
- Reads configuration from a JSON file, environment variables, and CLI flags (in order of increasing precedence).

## Installation

No global install needed — use `npx`:

```bash
npx expose-files-mcp@latest --help
```

Or install it as a dependency in a project:

```bash
npm install expose-files-mcp
```

Or globally:

```bash
npm install -g expose-files-mcp
expose-files-mcp --help
```

Requirements:

- Node.js **18.17+** (uses native `fetch`, ESM, `node:` imports).
- Optional: [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) or [`ngrok`](https://ngrok.com/download) on `PATH` for public exposure.

## Usage with npx

The fastest path — read-only access to a workspace folder, stdio transport, suitable for Claude Desktop:

```bash
npx expose-files-mcp --root ./workspace --files read-only
```

Read-write plus a limited terminal allowlist:

```bash
npx expose-files-mcp \
  --root ./workspace \
  --files read-write \
  --terminal true \
  --allowed-commands "pwd,ls,cat,grep,find,echo,nl,printf,ps"
```

HTTP transport on localhost behind a bearer token:

```bash
npx expose-files-mcp \
  --transport http --host 127.0.0.1 --port 8080 \
  --root ./workspace --files read-only \
  --auth-token "$(openssl rand -hex 32)"
```

## Local MCP usage (stdio)

Most local MCP clients launch the server as a child process and talk to it over stdio.

### Claude Desktop / Claude Code

Add an entry to your MCP config (e.g. `~/.config/Claude/claude_desktop_config.json` or your project's `.mcp.json`):

```json
{
  "mcpServers": {
    "expose-files": {
      "command": "npx",
      "args": [
        "-y",
        "expose-files-mcp",
        "--root",
        "/Users/you/projects/my-app",
        "--files",
        "read-write",
        "--terminal",
        "true",
        "--allowed-commands",
        "pwd,ls,cat,grep,find,echo,nl,printf,ps,where,type,dir,Get-ChildItem"
      ]
    }
  }
}
```

### Cursor / other clients

Any client that supports the MCP stdio transport works the same way — point its `command` at `npx` and pass `expose-files-mcp` with your flags.

## Public usage with cloudflared

Cloudflare Tunnel exposes your local HTTP server through a `*.trycloudflare.com` (or your own hostname) URL. No account is required for quick tunnels.

1. Install `cloudflared`: <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/>
2. Pick a strong auth token (keep it secret):
   ```bash
   export MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
   ```
3. Start the server with a tunnel:
   ```bash
   npx expose-files-mcp \
     --transport http --port 8080 \
     --public true --provider cloudflared \
     --auth-token "$MCP_AUTH_TOKEN" \
     --root ./workspace --files read-only
   ```
4. The server prints the public URL (it will look like `https://<random>.trycloudflare.com/mcp`).
5. Clients connect to that URL with:
   ```
   Authorization: Bearer <MCP_AUTH_TOKEN>
   ```

Under the hood this is equivalent to running:

```bash
cloudflared tunnel --url http://localhost:8080
```

…in parallel with the MCP HTTP server.

## Public usage with ngrok

1. Install ngrok and add your authtoken once:
   ```bash
   ngrok config add-authtoken <your-ngrok-token>
   ```
2. Start the server with ngrok as the provider:
   ```bash
   npx expose-files-mcp \
     --transport http --port 8080 \
     --public true --provider ngrok \
     --auth-token "$(openssl rand -hex 32)" \
     --root ./workspace --files read-only
   ```
3. The server prints the `https://<id>.ngrok-free.app/mcp` URL once ngrok's local API reports a tunnel.

Under the hood this is equivalent to running:

```bash
ngrok http 8080
```

## Configuration options

Configuration is merged in this order (later wins):

1. **Built-in defaults** (safe: `files=read-only`, `terminal=false`, `public.enabled=false`, empty allowlist).
2. **Config file** (`--config <path>` or `MCP_CONFIG`, default `./mcp-local.config.json` if present).
3. **Environment variables**.
4. **CLI flags**.

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `rootDir` | string | `cwd()` | Working directory exposed to the server. All file paths are resolved under this. |
| `permissions.files` | `read-only` \| `write-only` \| `read-write` \| `none` | `read-only` | File access mode. |
| `permissions.terminal` | boolean | `false` | Whether `run_command` is enabled. |
| `terminal.shell` | string | `auto` | Shell binary. `auto` picks `$SHELL` on POSIX or `%ComSpec%` on Windows. |
| `terminal.allowedCommands` | string[] | `[]` | Base command names permitted by `run_command`. |
| `terminal.timeoutMs` | int | `10000` | Per-command timeout. |
| `terminal.maxOutputBytes` | int | `20000` | Cap on stdout/stderr captured per command. |
| `terminal.env` | object | `{}` | Extra env vars passed to child processes. |
| `terminal.cwd` | string \| null | `null` | Default working directory (relative to `rootDir`). |
| `terminal.allowShellMetachars` | boolean | `false` | Allow `;`, `&`, `|`, `` ` ``, `$`, `<`, `>`, `(`, `)`, `{`, `}` in commands. **Off by default.** |
| `transport` | `stdio` \| `http` | `stdio` | Transport for the MCP server. |
| `http.host` | string | `127.0.0.1` | Bind host for HTTP transport. |
| `http.port` | int | `8080` | Bind port for HTTP transport. |
| `public.enabled` | boolean | `false` | Start a public tunnel. Requires `transport=http`. |
| `public.provider` | `cloudflared` \| `ngrok` | `cloudflared` | Tunnel provider. |
| `public.authToken` | string | `null` | Bearer token required by `/mcp`. Must be set when `public.enabled`. |
| `sensitivePatterns` | string[] | `.env`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `.npmrc`, … | Globs that file tools refuse by default. |
| `allowSensitive` | boolean | `false` | Override `sensitivePatterns`. |

## CLI options

```
--config <path>             Path to JSON config (default: mcp-local.config.json)
--root <dir>                Working directory exposed to the server
--files <perm>              read-only | write-only | read-write | none
--terminal <bool>           Enable terminal execution
--shell <shell>             auto | /bin/sh | bash | cmd.exe | powershell | pwsh
--allowed-commands <list>   Comma-separated allowlist of base command names
--timeout-ms <n>            Per-command timeout
--max-output-bytes <n>      Max captured output per stream
--transport <t>             stdio | http
--host <host>               HTTP host
--port <n>                  HTTP port
--public <bool>             Enable public tunnel (requires --transport=http)
--provider <name>           cloudflared | ngrok
--auth-token <token>        Bearer token required for HTTP/public access
--allow-sensitive <bool>    Permit access to sensitive paths
--help, -h                  Show help
--version, -v               Print version
```

Equivalent environment variables: `MCP_ROOT_DIR`, `MCP_FILE_PERMISSIONS`, `MCP_TERMINAL`, `MCP_SHELL`, `MCP_ALLOWED_COMMANDS`, `MCP_TIMEOUT_MS`, `MCP_MAX_OUTPUT_BYTES`, `MCP_TRANSPORT`, `MCP_HTTP_HOST`, `MCP_HTTP_PORT`, `MCP_PUBLIC`, `MCP_PUBLIC_PROVIDER`, `MCP_AUTH_TOKEN`, `MCP_ALLOW_SENSITIVE`, `MCP_CONFIG`.

## Example config files

Minimal read-only local setup (`mcp-local.config.json`):

```json
{
  "rootDir": "./workspace",
  "permissions": { "files": "read-only", "terminal": false }
}
```

Full read-write + terminal + public via cloudflared:

```json
{
  "rootDir": "./workspace",
  "permissions": { "files": "read-write", "terminal": true },
  "terminal": {
    "shell": "auto",
    "allowedCommands": ["pwd", "ls", "dir", "grep", "find", "cat", "type", "echo"],
    "timeoutMs": 10000,
    "maxOutputBytes": 20000
  },
  "transport": "http",
  "http": { "host": "127.0.0.1", "port": 8080 },
  "public": {
    "enabled": true,
    "provider": "cloudflared",
    "authToken": "REPLACE_WITH_LONG_RANDOM_TOKEN"
  }
}
```

See [`mcp-local.config.example.json`](./mcp-local.config.example.json) for a fully annotated version.

## Security model

`expose-files-mcp` is designed to fail closed.

**Defaults that fail closed**

- `permissions.files = "read-only"` — no writes/deletes until you opt in.
- `permissions.terminal = false` — `run_command` is rejected until you opt in.
- `terminal.allowedCommands = []` — even when terminal is enabled, no command is accepted until you list it.
- `public.enabled = false` — no tunnel.
- Sensitive-path globs (`.env`, `*.pem`, private keys, `.npmrc`, …) are blocked unless `allowSensitive=true`.

**Path safety**

- All paths are resolved against `rootDir`. Any path that, after resolution, lies outside `rootDir` is rejected with `PathSecurityError`.
- Null bytes in paths are rejected.
- Symlinks are resolved (`fs.realpath`) on reads and rejected if they escape the root.

**Command safety**

- A single command is parsed; the base binary (e.g. `cat`, `ls`, `pwd`) is checked against `allowedCommands`.
- A built-in deny list always blocks `sudo`, `su`, `rm`, `del`, `mkfs`, `fdisk`, `dd`, `shutdown`, `reboot`, `halt`, `kill`, `killall`, `curl`, `wget`, `nc`, `ssh`, `scp`, `rsync`, `chmod`, `chown` — even if they appear in `allowedCommands`.
- Shell metacharacters (`;`, `&`, `|`, `` ` ``, `$`, `<`, `>`, `(`, `)`, `{`, `}`) are blocked unless `terminal.allowShellMetachars=true`.
- A dangerous-pattern scan blocks well-known destructive snippets (`rm -rf /`, `:(){:|:&};:`, `mkfs`, `dd if=`, `format c:`, etc.).
- Every command is run with a timeout and an output cap; processes are `SIGKILL`-ed on timeout.

**Auth on HTTP / public**

- When `transport=http`, if `public.authToken` is set, the `/mcp` endpoint requires `Authorization: Bearer <token>` (or `X-MCP-Auth: <token>`). Comparison is constant-time.
- `public.enabled=true` is **rejected at startup** unless `transport=http` and an `authToken` other than the placeholder `"change-me"` is set.

**Warnings**

- Even with all the protections above, exposing the file tools on the public internet means giving anyone with the token access to your files. Treat the token like an SSH key.
- Cloudflare's quick-tunnel URLs are public and unauthenticated at the network layer — the only thing standing between attackers and your files is your `authToken`. Use a long random value.
- Never enable `terminal: true` with permissive `allowedCommands` over a public tunnel. `echo`, `cat`, and `ls` are usually safe; everything else deserves a second thought.

## Available MCP tools

| Tool | Description |
|------|-------------|
| `get_working_directory` | Returns `rootDir`, platform, shell, Node version, hostname. |
| `get_server_config` | Returns the active config with `authToken` redacted. |
| `list_files` | Lists entries under a path (optionally recursive). |
| `read_file` | Reads a file as UTF-8 or base64 with optional offset/length. |
| `write_file` | Writes/overwrites a file. Requires write permission. |
| `delete_file` | Deletes a file or directory. Requires write permission. |
| `search_files` | Recursively matches filenames (glob) and/or content (regex). |
| `run_command` | Runs one allowlisted command in the configured shell with timeout & output cap. |
| `batch` | Runs up to 50 of the tools above in a single call, in parallel or sequential. |

### `batch` — run multiple actions in one call

Most MCP clients invoke one tool at a time. `batch` lets an agent submit several tool calls in a single request and receive every result together — useful when the agent already knows it needs, say, three files plus a directory listing. The tool runs the children directly inside the server, so a batch of 10 reads is one network round-trip instead of 10.

Arguments:

- `actions`: array (1..50) of `{ id?: string, tool: string, arguments: object }`. `id` is echoed back so the caller can correlate results.
- `mode`: `"parallel"` (default) runs all actions concurrently; `"sequential"` runs them in order.
- `stopOnError`: only meaningful with `mode="sequential"` — stop after the first failing action.

Each result entry is `{ index, id, tool, ok, durationMs, result | error }`. Children are invoked through the same handlers as direct tool calls, so they respect every permission/allowlist/path-safety check. `batch` cannot call itself.

Example arguments:

```json
{
  "mode": "parallel",
  "actions": [
    { "id": "ls",   "tool": "list_files", "arguments": { "path": "." } },
    { "id": "pkg",  "tool": "read_file",  "arguments": { "path": "package.json" } },
    { "id": "todo", "tool": "search_files", "arguments": { "contentRegex": "TODO" } },
    { "id": "pwd",  "tool": "run_command", "arguments": { "command": "pwd" } }
  ]
}
```

## Cross-platform command examples

The terminal allowlist matches by base command name (extensions like `.exe`, `.cmd`, `.ps1` are stripped). Recommended allowlists:

### Bash / zsh (Linux, macOS, WSL)

```
pwd, ls, cat, grep, find, nl, printf, ps, echo, head, tail, wc
```

### Windows CMD

```
dir, type, where, echo, findstr, hostname
```

### Windows PowerShell / pwsh

```
Get-ChildItem, Get-Content, Select-String, Get-Process, Write-Output, where.exe
```

You can mix them; `expose-files-mcp` only checks the base binary name. Pick the shell with `--shell powershell` / `--shell cmd.exe` / `--shell /bin/bash`.

## Troubleshooting

**"Terminal allowlist is empty."**
You enabled `permissions.terminal=true` but did not pass `--allowed-commands` (or set `terminal.allowedCommands` in config). Add at least one command name.

**"Command contains shell metacharacters."**
Pipes and chaining are off by default. Either rewrite the command to a single binary invocation or set `terminal.allowShellMetachars=true`. Only do the latter for trusted local use.

**"public.enabled requires public.authToken to be set to a strong value."**
You enabled the tunnel without an auth token, or you left it as `"change-me"`. Generate one with `openssl rand -hex 32`.

**`cloudflared not found on PATH`**
Install `cloudflared` from <https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/> and re-open your shell.

**`ngrok not found on PATH`**
Install ngrok from <https://ngrok.com/download> and run `ngrok config add-authtoken <token>` once.

**`401 Unauthorized` on `/mcp`**
The client did not send `Authorization: Bearer <token>` (or sent a wrong one). Re-check the `--auth-token` you started the server with.

**`PathSecurityError: ... escapes the configured root directory.`**
The client tried to read/write a path outside `rootDir` (e.g. `../etc/passwd`). This is working as intended.

**Verbose errors**
Set `MCP_DEBUG=1` to get stack traces on fatal startup errors.

## Development setup

```bash
git clone https://github.com/egyjs/expose-files-mcp.git
cd expose-files-mcp
npm install

# Run stdio against a sandbox directory:
node bin/expose-files-mcp.js --root ./workspace --files read-write

# Run HTTP:
node bin/expose-files-mcp.js \
  --transport http --port 8080 \
  --root ./workspace --files read-only \
  --auth-token testtoken
curl http://127.0.0.1:8080/healthz
```

Project layout:

```
bin/expose-files-mcp.js          # CLI entry (`npx expose-files-mcp`)
src/index.js                     # run() orchestrator
src/config.js                    # config file + env + CLI loader
src/server.js                    # builds the McpServer + tools
src/transports/stdio.js          # stdio transport
src/transports/http.js           # Express + Streamable HTTP + bearer auth
src/tunnel/index.js              # dispatches to cloudflared / ngrok
src/tunnel/cloudflared.js        # spawns `cloudflared tunnel --url ...`
src/tunnel/ngrok.js              # spawns `ngrok http <port>`, reads :4040 API
src/tools/files.js               # list/read/write/delete/search file tools
src/tools/terminal.js            # run_command tool
src/tools/meta.js                # get_working_directory / get_server_config
src/security/paths.js            # safeJoin, symlink check, sensitive globs
src/security/commands.js         # command validator + deny list
```

## Publishing to npm

1. Update `version` in `package.json`.
2. Make sure `"files"` in `package.json` includes everything the runtime needs (`bin`, `src`, README, license, example config).
3. Dry run to verify the published payload:
   ```bash
   npm pack --dry-run
   ```
4. Publish:
   ```bash
   npm login
   npm publish --access public
   ```
5. Tag the release:
   ```bash
   git tag v0.1.0 && git push --tags
   ```

After publishing, `npx expose-files-mcp@latest` will fetch and run the new version.
