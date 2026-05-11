#!/usr/bin/env node
import { run } from "../src/index.js";
import { parseArgs } from "../src/config.js";
import { error as logError } from "../src/log.js";

const argv = process.argv.slice(2);
const flags = parseArgs(argv);

if (flags.help || flags.h) {
  process.stdout.write(`expose-files-mcp — MCP server for local files & terminal, optionally exposed via tunnel.

Usage:
  npx expose-files-mcp [options]

Options:
  --config <path>             Path to JSON config (default: mcp-local.config.json)
  --root <dir>                Working directory exposed to the server
  --files <perm>              File permissions: read-only | write-only | read-write | none
  --terminal <bool>           Enable terminal execution (default: false)
  --shell <shell>             Shell to use: auto | /bin/sh | bash | cmd.exe | powershell | pwsh
  --allowed-commands <list>   Comma-separated allowlist of base command names
  --timeout-ms <n>            Per-command timeout (default 10000)
  --max-output-bytes <n>      Max captured output per stream (default 20000)
  --transport <t>             stdio | http (default stdio)
  --host <host>               HTTP host (default 127.0.0.1)
  --port <n>                  HTTP port (default 8080)
  --public <bool>             Enable public tunnel (requires --transport=http)
  --provider <name>           Tunnel provider: cloudflared | ngrok
  --auth-token <token>        Bearer token required for HTTP/public access
  --allow-sensitive <bool>    Permit access to files matching sensitivePatterns
  --help, -h                  Show this help
  --version, -v               Print version

Environment variables: MCP_ROOT_DIR, MCP_FILE_PERMISSIONS, MCP_TERMINAL, MCP_SHELL,
  MCP_ALLOWED_COMMANDS, MCP_TIMEOUT_MS, MCP_MAX_OUTPUT_BYTES, MCP_TRANSPORT,
  MCP_HTTP_HOST, MCP_HTTP_PORT, MCP_PUBLIC, MCP_PUBLIC_PROVIDER, MCP_AUTH_TOKEN,
  MCP_ALLOW_SENSITIVE, MCP_CONFIG.

Examples:
  # Local stdio for Claude Desktop / Code:
  npx expose-files-mcp --root ./workspace --files read-only

  # HTTP transport + public tunnel:
  npx expose-files-mcp --transport http --port 8080 \\
    --public true --provider cloudflared --auth-token "$(openssl rand -hex 32)"
`);
  process.exit(0);
}

if (flags.version || flags.v) {
  process.stdout.write("0.1.0\n");
  process.exit(0);
}

try {
  await run(argv);
} catch (err) {
  logError(`fatal: ${err.message}`);
  if (process.env.MCP_DEBUG) process.stderr.write(`${err.stack}\n`);
  process.exit(1);
}
