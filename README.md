# expose-files-mcp

Let ChatGPT inspect your local project before you send a Codex task.

`expose-files-mcp` bridges planning and implementation: it runs a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that gives ChatGPT, Claude Desktop, Claude Code, Cursor and other AI tools read-only or read/write access to a project folder. Use it to explore a codebase, ask architecture questions, search files and prepare a clean Codex prompt — then hand off to Codex or another coding agent for the actual edits.

This project is a configurable MCP server for Node.js with safe defaults, optional terminal access, a built‑in dashboard, and support for local (`stdio`) or remote (`http`) transports. You can run it locally, behind a bearer token on your LAN, or expose it publicly via Cloudflare Tunnel or ngrok with OAuth 2.0 or static bearer auth. It works out of the box with ChatGPT + MCP, Claude Desktop/Code, Cursor, and any other client that understands MCP.

## Why plan with ChatGPT before coding?

ChatGPT shines at summarization, architecture review and task breakdown, but editing code through Codex or another agent consumes execution quota and requires precise prompts. `expose-files-mcp` lets ChatGPT inspect your repository directly:

* Understand an unfamiliar codebase quickly.
* Ask questions about file structure, dependencies and patterns.
* Search across the codebase without copy‑pasting large files.
* Draft a clear, concise prompt for your coding agent.
* Keep Codex (or other AI code editors) for the actual implementation.

Using ChatGPT for planning and Codex for implementation saves quota and reduces errors.

## Quick start

Inspect a local workspace in read‑only mode:

```Bash
npx -y expose-files-mcp --root . --files read-only
```

Allow writes and a limited terminal:

```Bash
npx -y expose-files-mcp \
  --root . \
  --files read-write \
  --terminal true \
  --allowed-commands "pwd,ls,cat,grep,find,echo,nl,printf,ps"
```

Expose over HTTP behind a random bearer token:

```Bash
export MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
npx -y expose-files-mcp \
  --transport http \
  --root . \
  --files read-only \
  --auth-token "$MCP_AUTH_TOKEN"
```

Works with ChatGPT, Claude Desktop/Code, Cursor and any MCP client. See Usage with npx for more examples.

## Safe defaults

`expose-files-mcp` is designed to fail closed and to block dangerous commands by default:

- - [x] Files are **read‑only** unless you enable write or read‑write.
- - [x] Terminal execution is **off** by default.
- - [x] No command is allowed until you define an allowlist.
- - [x] Public exposure is **off** unless `--public true`.
- - [x] Sensitive file patterns (`.env`, `*.pem`, SSH keys, etc.) are blocked unless you set `--allow-sensitive true`.
- - [x] Commands are run with timeouts, output caps, a deny list (`rm`, `curl`, `wget`, `ssh`, etc.) and shell metacharacters disabled.
- - [x] Path resolution refuses any path that escapes `rootDir` and rejects symlinks that escape the root.

See the Security model for details.

## Feature highlights

* **MCP server with file tools** — list, read, write, delete and search files under a configurable root, with fine‑grained permissions.
* **Optional terminal** — run allow‑listed commands with built‑in deny list, timeouts and output caps.
* **Two transports** — `stdio` for local MCP clients (e.g. ChatGPT Apps, Claude, Cursor) and `http` with Streamable HTTP for remote clients.
* **Tunnels built in** — optional Cloudflare Tunnel or ngrok integration to make your MCP endpoint publicly reachable.
* **OAuth 2.0 or bearer auth** — built‑in authorization server and PKCE support, or simple static bearer token.
* **Runtime dashboard** — a loopback‑only web UI to change `rootDir`, file/terminal permissions, allowlists, sensitive patterns and more without restarting.
* **Declarative configuration** — read settings from JSON, environment variables, or CLI flags; safe defaults require opt‑in for risky features.
* **Cross‑platform** — works on macOS, Linux, WSL and Windows; chooses the right shell automatically.

<!-- ## 30‑second setup for ChatGPT + Codex


Use ChatGPT (planning) → `expose-files-mcp` → Codex (implementation).
-->

## Why not just use Codex directly?

Codex and other code‑editing agents are great at writing code, but for planning. With `expose-files-mcp`, you can:

* Plan the task with ChatGPT using full file context (no copy-paste required).
* Ask high‑level questions that don't require editing.
* Save Codex usage for the final edit, reducing cost and risk.
* Avoid repeatedly copying large files into prompts.

Once ChatGPT has the context, you can craft a precise prompt for Codex or your coding agent.

## Table of contents

* Installation
* Usage with npx
* Local MCP usage (stdio)
* Public usage with Cloudflare Tunnel
* Public usage with ngrok
* HTTP with OAuth 2.0
* Local runtime dashboard
* Configuration options
* CLI options
* Example config files
* Security model
* Available MCP tools
* Cross‑platform command examples
* Troubleshooting
* Development setup
* Publishing to npm

---

## Installation

No global install needed — use `npx`:

```Bash
npx expose-files-mcp@latest --help
```

Or install it as a dependency in a project:

```Bash
npm install expose-files-mcp
```

Or globally:

```Bash
npm install -g expose-files-mcp
expose-files-mcp --help
```

Requirements:

* Node.js **18.17+** (uses native `fetch`, ESM, `node:` imports).
* Optional: [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) or [`ngrok`](https://ngrok.com/download) on `PATH` for public exposure.

## Usage with npx

The fastest path — read‑only access to a workspace folder, stdio transport, suitable for Claude Desktop:

```Bash
npx expose-files-mcp --root ./ --files read-only
```

Read‑write plus a limited terminal allowlist:

```Bash
npx expose-files-mcp \
  --root ./ \
  --files read-write \
  --terminal \
  --allowed-commands "pwd,ls,cat,grep,find,echo,nl,printf,ps"
```

HTTP transport on localhost behind a bearer token:

```Bash
npx expose-files-mcp \
  --transport http --host 127.0.0.1 --port 8080 \
  --root ./ --files read-only \
  --auth-token "$(openssl rand -hex 32)"
```

## Local MCP usage (stdio)

Most local MCP clients launch the server as a child process and talk to it over stdio.

### Claude Desktop / Claude Code

Add an entry to your MCP config (e.g. `~/.config/Claude/claude_desktop_config.json` or your project's `.mcp.json`):

```JSON
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

## Public usage with Cloudflare Tunnel

Cloudflare Tunnel exposes your local HTTP server through a `*.trycloudflare.com` (or your own hostname) URL. No account is required for quick tunnels.

1. Install `cloudflared`: [https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)
2. Pick a strong auth token (keep it secret):
    
    ```Bash
    export MCP_AUTH_TOKEN="$(openssl rand -hex 32)"
    ```
    
3. Start the server with a tunnel:
    
    ```Bash
    npx expose-files-mcp \
      --transport http --port 8080 \
      --public --provider cloudflared \
      --auth-token "$MCP_AUTH_TOKEN" \
      --root ./workspace --files read-only
    ```
    
4. The server prints the public URL (it will look like `https://<random>.trycloudflare.com/mcp`).
5. Clients connect to that URL with:
    
    ```
    Authorization: Bearer <MCP_AUTH_TOKEN>
    ```
    

Under the hood this is equivalent to running:

```Bash
cloudflared tunnel --url http://localhost:8080
```

…in parallel with the MCP HTTP server.

## Public usage with ngrok

1. Install ngrok and add your authtoken once:
    
    ```Bash
    ngrok config add-authtoken <your-ngrok-token>
    ```
    
2. Start the server with ngrok as the provider:
    
    ```Bash
    npx expose-files-mcp \
      --transport http --port 8080 \
      --public true --provider ngrok \
      --auth-token "$(openssl rand -hex 32)" \
      --root ./workspace --files read-only
    ```
    
3. The server prints the `https://<id>.ngrok-free.app/mcp` URL once ngrok's local API reports a tunnel.

Under the hood this is equivalent to running:

```Bash
ngrok http 8080
```

## HTTP with OAuth 2.0

When `oauth.enabled = true`, the server runs a built‑in **OAuth 2.0 authorization server** on the same HTTP port. The `/mcp` endpoint then requires a valid OAuth Bearer token instead of a static `authToken`.

### Flow overview

```
Client                          expose-files-mcp
  │                                    │
  │── GET /oauth/authorize ───────────>│  shows HTML consent page
  │<─ 302 ?code=<code> ───────────────│
  │                                    │
  │── POST /oauth/token ──────────────>│  exchanges code for token
  │<─ { access_token, expires_in } ───│
  │                                    │
  │── POST /mcp (Bearer <token>) ─────>│  authenticated MCP call
  │<─ MCP response ───────────────────│
```

### Endpoints exposed automatically

| Method | Path | Description |
| --- | --- | --- |
| `GET` | `/.well-known/oauth-authorization-server` | OAuth server metadata (RFC 8414) |
| `GET` | `/oauth/authorize` | Shows the HTML consent page |
| `POST` | `/oauth/authorize` | Processes the user's allow/deny choice |
| `POST` | `/oauth/token` | Issues an access token for a valid code |

### Quick start

1. Generate a client secret:
    
    ```Bash
    export OAUTH_SECRET="$(openssl rand -hex 32)"
    ```
    
2. Start the server with OAuth enabled:
    
    ```Bash
    npx expose-files-mcp \
      --transport http --port 8080 \
      --oauth true \
      --oauth-client-id my-client \
      --oauth-client-secret "$OAUTH_SECRET" \
      --oauth-redirect-uris "http://localhost:3000/callback" \
      --root ./workspace --files read-only
    ```
    
3. The server logs the OAuth endpoints on startup:
    
    ```
    [expose-files-mcp] OAuth 2.0 enabled — issuer: http://127.0.0.1:8080
    [expose-files-mcp] OAuth authorize: http://127.0.0.1:8080/oauth/authorize
    [expose-files-mcp] OAuth token:     http://127.0.0.1:8080/oauth/token
    [expose-files-mcp] OAuth metadata:  http://127.0.0.1:8080/.well-known/oauth-authorization-server
    ```
    
4. Point your OAuth client at those URLs. The client must send `Authorization: Bearer <access_token>` on every `/mcp` request.

### Configuration via JSON

```JSON
{
  "transport": "http",
  "http": { "host": "127.0.0.1", "port": 8080 },
  "oauth": {
    "enabled": true,
    "issuer": "http://127.0.0.1:8080",
    "clients": [
      {
        "clientId": "my-client",
        "clientSecret": "REPLACE_WITH_LONG_RANDOM_SECRET",
        "redirectUris": ["http://localhost:3000/callback"]
      }
    ],
    "tokenExpirySeconds": 3600
  },
  "rootDir": "./workspace",
  "permissions": { "files": "read-only" }
}
```

### PKCE

Public clients that cannot keep a secret can omit `clientSecret` and use PKCE instead. Send `code_challenge` (SHA‑256 of the verifier, base64url‑encoded) and `code_challenge_method=S256` in the authorization request; send `code_verifier` at the token endpoint. The server enforces the challenge automatically when one is present.

### Notes

* `oauth.enabled` requires `transport=http`.
* When OAuth is active the static `public.authToken` check on `/mcp` is **replaced** by OAuth token validation. Static bearer auth is only used when `oauth.enabled=false`.
* Tokens and auth codes are stored in memory. Restarting the server invalidates all issued tokens.
* Multiple clients can be listed under `oauth.clients`; each has its own `clientId`, optional `clientSecret`, and `redirectUris`.

## Local runtime dashboard

Every time the server boots it also starts a tiny dashboard on `http://127.0.0.1:7821` (loopback only — never reachable via the public tunnel). Open it in a browser to change configuration without restarting the MCP server or recreating the tunnel.

What it can change at runtime (next MCP tool call picks up the new value):

* `rootDir`
* `permissions.files` and `permissions.terminal`
* `terminal.shell`, `terminal.allowedCommands`, `terminal.cwd`, `terminal.timeoutMs`, `terminal.maxOutputBytes`, `terminal.allowShellMetachars`, `terminal.env`
* `sensitivePatterns` and `allowSensitive`

What requires a restart (the dashboard shows these as read‑only):

* `transport`, `http.host`, `http.port`
* `public.*` — changing the tunnel needs a restart so the existing tunnel can be torn down and rebuilt
* `oauth.*`

### HTTP API

The dashboard is backed by a small JSON API on the same port; you can script it instead of clicking:

* `GET /api/config` — current config (with secrets redacted)
* `GET /api/editable-fields` — list of dotted paths that can be updated at runtime
* `POST /api/config` — apply a partial patch; returns the new config or `400 { "error": "..." }`

```Bash
curl -s -X POST -H 'content-type: application/json' \
  -d '{"permissions":{"files":"read-write","terminal":true},"terminal":{"allowedCommands":["ls","cat","grep"]}}' \
  http://127.0.0.1:7821/api/config
```

Updates run through the same validator as startup, so invalid values (bad permission string, missing `rootDir`, etc.) are rejected with a clear message and the running config is left untouched.

### Disabling or rebinding

```JSON
{
  "dashboard": {
    "enabled": true,
    "host": "127.0.0.1",
    "port": 7821
  }
}
```

Equivalent CLI flags: `--dashboard <bool>`, `--dashboard-host <host>`, `--dashboard-port <n>`.  
Equivalent env vars: `MCP_DASHBOARD`, `MCP_DASHBOARD_HOST`, `MCP_DASHBOARD_PORT`.

Keep `dashboard.host` on `127.0.0.1`. Anyone who can reach the dashboard can change file permissions and the terminal allowlist on the running server.

## Configuration options

Configuration is merged in this order (later wins):

1. **Built-in defaults** (safe: `files=read-only`, `terminal=false`, `public.enabled=false`, empty allowlist).
2. **Config file** (`--config <path>` or `MCP_CONFIG`, default `./mcp-local.config.json` if present).
3. **Environment variables**.
4. **CLI flags**.

| Key | Type | Default | Description |
| --- | --- | --- | --- |
| `rootDir` | string | `cwd()` | Working directory exposed to the server. All file paths are resolved under this. |
| `permissions.files` | `read-only` | `write-only` | `read-write` | `none` | `read-only` | File access mode. |
| `permissions.terminal` | boolean | `false` | Whether `run_command` is enabled. |
| `terminal.shell` | string | `auto` | Shell binary. `auto` picks `$SHELL` on POSIX or `%ComSpec%` on Windows. |
| `terminal.allowedCommands` | string[] | `[]` | Base command names permitted by `run_command`. |
| `terminal.timeoutMs` | int | `10000` | Per-command timeout. |
| `terminal.maxOutputBytes` | int | `20000` | Cap on stdout/stderr captured per command. |
| `terminal.env` | object | `{}` | Extra env vars passed to child processes. |
| `terminal.cwd` | string | null | `null` | Default working directory (relative to `rootDir`). |
| `terminal.allowShellMetachars` | boolean | `false` | Allow `;`, `&`, ` |
| `transport` | `stdio` | `http` | `stdio` | Transport for the MCP server. |
| `http.host` | string | `127.0.0.1` | Bind host for HTTP transport. |
| `http.port` | int | `8080` | Bind port for HTTP transport. |
| `public.enabled` | boolean | `false` | Start a public tunnel. Requires `transport=http`. |
| `public.provider` | `cloudflared` | `ngrok` | `cloudflared` | Tunnel provider. |
| `public.authToken` | string | `null` | Static Bearer token required by `/mcp`. Used when `oauth.enabled=false`. |
| `public.noAuth` | boolean | `false` | Disable authentication on `/mcp` entirely. **Dangerous** — only use on trusted networks or when another layer (VPN, firewall) provides access control. |
| `oauth.enabled` | boolean | `false` | Enable built-in OAuth 2.0 authorization server. Requires `transport=http`. |
| `oauth.issuer` | string | `null` | OAuth issuer URL. Defaults to `http://<http.host>:<http.port>`. |
| `oauth.clients` | object[] | `[]` | Registered OAuth clients. Each entry: `{ clientId, clientSecret?, redirectUris[] }`. |
| `oauth.tokenExpirySeconds` | int | `3600` | Lifetime of issued access tokens in seconds. |
| `sensitivePatterns` | string[] | `.env`, `*.pem`, `*.key`, `id_rsa`, `id_ed25519`, `.npmrc`, … | Globs that file tools refuse by default. |
| `allowSensitive` | boolean | `false` | Override `sensitivePatterns`. |
| `dashboard.enabled` | boolean | `true` | Start the local runtime config dashboard. |
| `dashboard.host` | string | `127.0.0.1` | Bind host for the dashboard. Keep on loopback. |
| `dashboard.port` | int | `7821` | Bind port for the dashboard. |

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
--auth-token <token>        Static Bearer token for /mcp (when OAuth is off)
--no-auth <bool>            Disable /mcp authentication entirely (dangerous — use only on trusted networks)
--allow-sensitive <bool>    Permit access to sensitive paths
--oauth <bool>              Enable OAuth 2.0 authorization server
--oauth-issuer <url>        OAuth issuer URL (default: http://<host>:<port>)
--oauth-client-id <id>      Register a single OAuth client (quick setup)
--oauth-client-secret <s>   Client secret for the above client
--oauth-redirect-uris <u>   Comma-separated redirect URIs for the above client
--oauth-token-expiry <n>    Access token lifetime in seconds (default: 3600)
--dashboard <bool>          Enable the local runtime dashboard (default: true)
--dashboard-host <host>     Dashboard bind host (default: 127.0.0.1)
--dashboard-port <n>        Dashboard bind port (default: 7821)
--help, -h                  Show help
--version, -v               Print version
```

Equivalent environment variables: `MCP_ROOT_DIR`, `MCP_FILE_PERMISSIONS`, `MCP_TERMINAL`, `MCP_SHELL`, `MCP_ALLOWED_COMMANDS`, `MCP_TIMEOUT_MS`, `MCP_MAX_OUTPUT_BYTES`, `MCP_TRANSPORT`, `MCP_HTTP_HOST`, `MCP_HTTP_PORT`, `MCP_PUBLIC`, `MCP_PUBLIC_PROVIDER`, `MCP_AUTH_TOKEN`, `MCP_NO_AUTH`, `MCP_ALLOW_SENSITIVE`, `MCP_OAUTH`, `MCP_OAUTH_ISSUER`, `MCP_OAUTH_CLIENT_ID`, `MCP_OAUTH_CLIENT_SECRET`, `MCP_OAUTH_REDIRECT_URIS`, `MCP_OAUTH_TOKEN_EXPIRY`, `MCP_DASHBOARD`, `MCP_DASHBOARD_HOST`, `MCP_DASHBOARD_PORT`, `MCP_CONFIG`.

## Example config files

Minimal read‑only local setup (`mcp-local.config.json`):

```JSON
{
  "rootDir": "./workspace",
  "permissions": { "files": "read-only", "terminal": false }
}
```

Full read‑write + terminal + public via cloudflared:

```JSON
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

HTTP with OAuth 2.0:

```JSON
{
  "rootDir": "./workspace",
  "permissions": { "files": "read-only", "terminal": false },
  "transport": "http",
  "http": { "host": "127.0.0.1", "port": 8080 },
  "oauth": {
    "enabled": true,
    "clients": [
      {
        "clientId": "my-client",
        "clientSecret": "REPLACE_WITH_LONG_RANDOM_SECRET",
        "redirectUris": ["http://localhost:3000/callback"]
      }
    ],
    "tokenExpirySeconds": 3600
  }
}
```

See `mcp-local.config.example.json` for a fully annotated version.

## Security model

`expose-files-mcp` is designed to fail closed.

**Defaults that fail closed**

* `permissions.files = "read-only"` — no writes/deletes until you opt in.
* `permissions.terminal = false` — `run_command` is rejected until you opt in.
* `terminal.allowedCommands = []` — even when terminal is enabled, no command is accepted until you list it.
* `public.enabled = false` — no tunnel.
* Sensitive‑path globs (`.env`, `*.pem`, private keys, `.npmrc`, …) are blocked unless `allowSensitive=true`.

**Path safety**

* All paths are resolved against `rootDir`. Any path that, after resolution, lies outside `rootDir` is rejected with `PathSecurityError`.
* Null bytes in paths are rejected.
* Symlinks are resolved (`fs.realpath`) on reads and rejected if they escape the root.

**Command safety**

* A single command is parsed; the base binary (e.g. `cat`, `ls`, `pwd`) is checked against `allowedCommands`.
* A built‑in deny list always blocks `sudo`, `su`, `rm`, `del`, `mkfs`, `fdisk`, `dd`, `shutdown`, `reboot`, `halt`, `kill`, `killall`, `curl`, `wget`, `nc`, `ssh`, `scp`, `rsync`, `chmod`, `chown` — even if they appear in `allowedCommands`.
* Shell metacharacters (`;`, `&`, `|`, `` ` ``, `$`, `<`, `>`, `(`, `)`, `{`, `}`) are blocked unless `terminal.allowShellMetachars=true`.
* A dangerous‑pattern scan blocks well‑known destructive snippets (`rm -rf /`, `:(){:|:&};:`, `mkfs`, `dd if=`, `format c:`, etc.).
* Every command is run with a timeout and an output cap; processes are `SIGKILL`‑ed on timeout.

**Auth on HTTP / public**

* When `transport=http`, if `public.authToken` is set (and `oauth.enabled=false`), the `/mcp` endpoint requires `Authorization: Bearer <token>` (or `X-MCP-Auth: <token>`). Comparison is constant-time.
* `public.enabled=true` is **rejected at startup** unless `transport=http` and one of: an `authToken` other than the placeholder `"change-me"` is set, `oauth.enabled=true`, or `public.noAuth=true`.
* Setting `public.noAuth=true` removes **all** authentication from `/mcp`. Only do this on trusted networks, behind a VPN/firewall, or for local-only HTTP usage where you still want the HTTP transport but don't need auth.

**OAuth 2.0**

* When `oauth.enabled=true`, the built‑in authorization server issues short‑lived access tokens via the authorization code flow. The static `authToken` check is bypassed; only OAuth tokens are accepted on `/mcp`.
* PKCE (`S256`) is enforced when a client supplies `code_challenge`; public clients (no `clientSecret`) must use PKCE.
* Auth codes expire after 10 minutes; their single‑use is enforced by deleting them on first exchange.
* Tokens are held only in memory — restarting the process revokes all outstanding tokens.

**Warnings**

* Even with all the protections above, exposing the file tools on the public internet means giving anyone with the token access to your files. Treat the token like an SSH key.
* Cloudflare's quick‑tunnel URLs are public and unauthenticated at the network layer — the only thing standing between attackers and your files is your `authToken`. Use a long random value.
* Never enable `terminal: true` with permissive `allowedCommands` over a public tunnel. `echo`, `cat`, and `ls` are usually safe; everything else deserves a second thought.

## Available MCP tools

| Tool | Description |
| --- | --- |
| `get_working_directory` | Returns `rootDir`, platform, shell, Node version, hostname. |
| `get_server_config` | Returns the active config with `authToken` redacted. |
| `list_files` | Lists entries under a path (optionally recursive). |
| `read_file` | Reads a file as UTF‑8 or base64 with optional offset/length. |
| `write_file` | Writes/overwrites a file. Requires write permission. |
| `delete_file` | Deletes a file or directory. Requires write permission. |
| `search_files` | Recursively matches filenames (glob) and/or content (regex). |
| `run_command` | Runs one allowlisted command in the configured shell with timeout & output cap. |
| `batch` | Runs up to 50 of the tools above in a single call, in parallel or sequential. |

### `batch` — run multiple actions in one call

Most MCP clients invoke one tool at a time. `batch` lets an agent submit several tool calls in a single request and receive every result together — useful when the agent already knows it needs, say, three files plus a directory listing. The tool runs the children directly inside the server, so a batch of 10 reads is one network round‑trip instead of 10.

Arguments:

* `actions`: array (1..50) of `{ id?: string, tool: string, arguments: object }`. `id` is echoed back so the caller can correlate results.
* `mode`: `"parallel"` (default) runs all actions concurrently; `"sequential"` runs them in order.
* `stopOnError`: only meaningful with `mode="sequential"` — stop after the first failing action.

Each result entry is `{ index, id, tool, ok, durationMs, result | error }`. Children are invoked through the same handlers as direct tool calls, so they respect every permission/allowlist/path‑safety check. `batch` cannot call itself.

Example arguments:

```JSON
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

## Cross‑platform command examples

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
You enabled the tunnel without an auth token, or you left it as `"change-me"`. Generate one with `openssl rand -hex 32`. Alternatively, enable OAuth (`--oauth true`) or, only on trusted networks, pass `--no-auth true` to disable authentication entirely.

**`cloudflared not found on PATH`**  
Install `cloudflared` from [https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) and re-open your shell.

**`ngrok not found on PATH`**  
Install ngrok from [https://ngrok.com/download](https://ngrok.com/download) and run `ngrok config add-authtoken <token>` once.

**`401 Unauthorized` on `/mcp`** (static token auth)  
The client did not send `Authorization: Bearer <token>` (or sent a wrong one). Re-check the `--auth-token` you started the server with.

**`401 Unauthorized: invalid or expired token`** (OAuth)  
The access token has expired or was issued by a previous server process. Re-run the authorization code flow to obtain a fresh token.

**`"oauth.enabled requires transport=http"`**  
OAuth is only available on the HTTP transport. Add `--transport http` (and `--port 8080`) to your command.

**`"oauth.enabled requires at least one entry in oauth.clients"`**  
You enabled OAuth but did not configure any client. Add `--oauth-client-id` / `--oauth-client-secret` / `--oauth-redirect-uris` or add a `clients` array to `oauth` in your config file.

**`400 Invalid redirect_uri`** on the authorize endpoint  
The `redirect_uri` supplied by the client is not in the `redirectUris` list for that client. Update `oauth.clients[].redirectUris` to include it.

**`PathSecurityError: ... escapes the configured root directory.`**  
The client tried to read/write a path outside `rootDir` (e.g. `../etc/passwd`). This is working as intended.

**Verbose errors**  
Set `MCP_DEBUG=1` to get stack traces on fatal startup errors.

## Development setup

```Bash
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
src/transports/http.js           # Express + Streamable HTTP + auth routing
src/auth/oauth.js                # OAuth 2.0 authorization server (auth code + PKCE)
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
    
    ```Bash
    npm pack --dry-run
    ```
    
4. Publish:
    
    ```Bash
    npm login
    npm publish --access public
    ```
    
5. Tag the release:
    
    ```Bash
    git tag v0.1.0 && git push --tags
    ```
    

After publishing, `npx expose-files-mcp@latest` will fetch and run the new version.

