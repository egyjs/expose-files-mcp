import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadConfig, redactConfig } from "./config.js";
import { buildServer } from "./server.js";
import { startStdio } from "./transports/stdio.js";
import { startHttp } from "./transports/http.js";
import { startTunnel } from "./tunnel/index.js";
import { startDashboard } from "./dashboard/index.js";
import { blank, title, section, kv, ready, warn } from "./log.js";

const pkg = JSON.parse(
  readFileSync(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"),
    "utf8",
  ),
);

function describeAuth(config) {
  if (config.oauth?.enabled) return "OAuth 2.0";
  if (config.public?.noAuth) return "none (disabled)";
  if (config.public?.authToken) return "Bearer token";
  return "none";
}

function describeTerminal(config) {
  if (!config.permissions.terminal) return "disabled";
  const n = config.terminal.allowedCommands.length;
  return `enabled (${n} allowed ${n === 1 ? "command" : "commands"})`;
}

function logCore(config, toolNames) {
  title(pkg.name, pkg.version);
  blank();
  section("Server");
  kv("Root",       config.rootDir);
  kv("Files",      config.permissions.files);
  kv("Terminal",   describeTerminal(config));
  kv("Transport",  config.transport);
  kv("Tools",      `${toolNames.length} (${toolNames.join(", ")})`);
}

function logDashboard(dashboard) {
  if (!dashboard) return;
  blank();
  section("Dashboard");
  kv("URL", dashboard.url);
}

function logHttp(config, http) {
  blank();
  section("HTTP");
  kv("Listen", `http://${http.host}:${http.port}/mcp`);
  kv("Auth",   describeAuth(config));
}

function logOAuth(http) {
  if (!http.oauth) return;
  blank();
  section("OAuth 2.0");
  kv("Issuer",    http.oauth.issuer);
  kv("Authorize", `${http.oauth.issuer}/oauth/authorize`);
  kv("Token",     `${http.oauth.issuer}/oauth/token`);
  kv("Metadata",  `${http.oauth.issuer}/.well-known/oauth-authorization-server`);
}

function logTunnel(config, tunnel) {
  blank();
  section(`Tunnel (${config.public.provider})`);
  kv("Public", `${tunnel.url}/mcp`);
  if (config.oauth?.enabled) {
    kv("Authorize", `${tunnel.url}/oauth/authorize`);
    kv("Token",     `${tunnel.url}/oauth/token`);
    kv("Metadata",  `${tunnel.url}/.well-known/oauth-authorization-server`);
  } else if (config.public.authToken) {
    kv("Header", "Authorization: Bearer <authToken>");
  }
}

function logSecurityWarnings(config) {
  const msgs = [];
  if (config.public?.enabled) {
    msgs.push("Public tunnel is exposing this server — never expose unrestricted filesystem or terminal access to the internet.");
  }
  if (config.public?.noAuth) {
    msgs.push("Authentication is DISABLED — /mcp is open to anyone who can reach this server.");
  }
  if (config.allowSensitive) {
    msgs.push("allowSensitive=true — sensitive file patterns are no longer blocked.");
  }
  if (config.terminal?.allowShellMetachars) {
    msgs.push("terminal.allowShellMetachars=true — pipes, redirection and chaining are permitted.");
  }
  if (msgs.length === 0) return;
  blank();
  for (const m of msgs) warn(m);
}

export async function run(argv) {
  const { config, configPath } = loadConfig(argv);

  const dashboard = await startDashboard(config);

  if (config.transport === "stdio") {
    const { server, toolNames } = buildServer(config);
    await startStdio(server);

    logCore(config, toolNames);
    logDashboard(dashboard);
    logSecurityWarnings(config);
    blank();
    ready("stdio transport ready");

    return { config, configPath, dashboard };
  }

  const { toolNames } = buildServer(config);
  const http = await startHttp(() => buildServer(config).server, config);

  let tunnel = null;
  if (config.public.enabled) {
    tunnel = await startTunnel(config);
  }

  logCore(config, toolNames);
  logHttp(config, http);
  if (config.oauth?.enabled && http.oauth) logOAuth(http);
  if (tunnel) logTunnel(config, tunnel);
  logDashboard(dashboard);
  logSecurityWarnings(config);
  blank();
  ready("http transport ready");

  const shutdown = () => {
    blank();
    warn("Shutting down…");
    if (tunnel) tunnel.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { config, configPath, tunnel, dashboard };
}

export { loadConfig, redactConfig, buildServer };
