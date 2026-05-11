import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export const DEFAULT_CONFIG = {
  rootDir: process.cwd(),
  permissions: {
    files: "read-only",
    terminal: false,
  },
  terminal: {
    shell: "auto",
    allowedCommands: [],
    timeoutMs: 10000,
    maxOutputBytes: 20000,
    env: {},
    cwd: null,
    allowShellMetachars: false,
  },
  transport: "stdio",
  http: {
    host: "127.0.0.1",
    port: 8080,
  },
  public: {
    enabled: false,
    provider: "cloudflared",
    authToken: null,
    noAuth: false,
  },
  oauth: {
    enabled: false,
    issuer: null,
    clients: [],
    tokenExpirySeconds: 3600,
  },
  sensitivePatterns: [
    ".env",
    ".env.*",
    "*.pem",
    "*.key",
    "id_rsa",
    "id_ed25519",
    ".npmrc",
  ],
  allowSensitive: false,
  dashboard: {
    enabled: true,
    host: "127.0.0.1",
    port: 7821,
  },
  logging: {
    actions: true,
  },
};

const FILE_PERMISSIONS = new Set([
  "read-only",
  "write-only",
  "read-write",
  "no",
  "none",
]);

function deepMerge(target, source) {
  if (source == null) return target;
  if (typeof source !== "object" || Array.isArray(source)) return source;
  const out = { ...target };
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      out[key] = deepMerge(target[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    if (key.includes("=")) {
      const [k, v] = key.split(/=(.+)/);
      args[k] = v;
    } else {
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        args[key] = next;
        i++;
      }
    }
  }
  return args;
}

function coerceBool(v) {
  if (typeof v === "boolean") return v;
  if (typeof v !== "string") return Boolean(v);
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}

function coerceInt(v) {
  if (typeof v === "number") return v;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : undefined;
}

function envOverrides() {
  const e = process.env;
  const o = {};
  if (e.MCP_ROOT_DIR) o.rootDir = e.MCP_ROOT_DIR;
  if (e.MCP_FILE_PERMISSIONS) {
    o.permissions = { ...(o.permissions || {}), files: e.MCP_FILE_PERMISSIONS };
  }
  if (e.MCP_TERMINAL !== undefined) {
    o.permissions = {
      ...(o.permissions || {}),
      terminal: coerceBool(e.MCP_TERMINAL),
    };
  }
  if (e.MCP_SHELL) o.terminal = { ...(o.terminal || {}), shell: e.MCP_SHELL };
  if (e.MCP_ALLOWED_COMMANDS) {
    o.terminal = {
      ...(o.terminal || {}),
      allowedCommands: e.MCP_ALLOWED_COMMANDS.split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  if (e.MCP_TIMEOUT_MS) {
    o.terminal = {
      ...(o.terminal || {}),
      timeoutMs: coerceInt(e.MCP_TIMEOUT_MS),
    };
  }
  if (e.MCP_MAX_OUTPUT_BYTES) {
    o.terminal = {
      ...(o.terminal || {}),
      maxOutputBytes: coerceInt(e.MCP_MAX_OUTPUT_BYTES),
    };
  }
  if (e.MCP_TRANSPORT) o.transport = e.MCP_TRANSPORT;
  if (e.MCP_HTTP_HOST) o.http = { ...(o.http || {}), host: e.MCP_HTTP_HOST };
  if (e.MCP_HTTP_PORT) {
    o.http = { ...(o.http || {}), port: coerceInt(e.MCP_HTTP_PORT) };
  }
  if (e.MCP_PUBLIC !== undefined) {
    o.public = { ...(o.public || {}), enabled: coerceBool(e.MCP_PUBLIC) };
  }
  if (e.MCP_PUBLIC_PROVIDER) {
    o.public = { ...(o.public || {}), provider: e.MCP_PUBLIC_PROVIDER };
  }
  if (e.MCP_AUTH_TOKEN) {
    o.public = { ...(o.public || {}), authToken: e.MCP_AUTH_TOKEN };
  }
  if (e.MCP_NO_AUTH !== undefined) {
    o.public = { ...(o.public || {}), noAuth: coerceBool(e.MCP_NO_AUTH) };
  }
  if (e.MCP_ALLOW_SENSITIVE !== undefined) {
    o.allowSensitive = coerceBool(e.MCP_ALLOW_SENSITIVE);
  }
  if (e.MCP_DASHBOARD !== undefined) {
    o.dashboard = { ...(o.dashboard || {}), enabled: coerceBool(e.MCP_DASHBOARD) };
  }
  if (e.MCP_DASHBOARD_HOST) {
    o.dashboard = { ...(o.dashboard || {}), host: e.MCP_DASHBOARD_HOST };
  }
  if (e.MCP_DASHBOARD_PORT) {
    o.dashboard = { ...(o.dashboard || {}), port: coerceInt(e.MCP_DASHBOARD_PORT) };
  }
  if (e.MCP_LOG_ACTIONS !== undefined) {
    o.logging = { ...(o.logging || {}), actions: coerceBool(e.MCP_LOG_ACTIONS) };
  }
  if (e.MCP_OAUTH !== undefined) {
    o.oauth = { ...(o.oauth || {}), enabled: coerceBool(e.MCP_OAUTH) };
  }
  if (e.MCP_OAUTH_ISSUER) {
    o.oauth = { ...(o.oauth || {}), issuer: e.MCP_OAUTH_ISSUER };
  }
  if (e.MCP_OAUTH_TOKEN_EXPIRY) {
    o.oauth = { ...(o.oauth || {}), tokenExpirySeconds: coerceInt(e.MCP_OAUTH_TOKEN_EXPIRY) };
  }
  if (e.MCP_OAUTH_CLIENT_ID) {
    const client = {
      clientId: e.MCP_OAUTH_CLIENT_ID,
      clientSecret: e.MCP_OAUTH_CLIENT_SECRET || null,
      redirectUris: e.MCP_OAUTH_REDIRECT_URIS
        ? e.MCP_OAUTH_REDIRECT_URIS.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    };
    o.oauth = { ...(o.oauth || {}), clients: [client] };
  }
  return o;
}

function cliOverrides(cliArgs) {
  const o = {};
  if (cliArgs["root"] || cliArgs["root-dir"]) {
    o.rootDir = cliArgs["root"] || cliArgs["root-dir"];
  }
  if (cliArgs["files"]) {
    o.permissions = { ...(o.permissions || {}), files: cliArgs["files"] };
  }
  if (cliArgs["terminal"] !== undefined) {
    o.permissions = {
      ...(o.permissions || {}),
      terminal: coerceBool(cliArgs["terminal"]),
    };
  }
  if (cliArgs["shell"]) {
    o.terminal = { ...(o.terminal || {}), shell: cliArgs["shell"] };
  }
  if (cliArgs["allowed-commands"]) {
    o.terminal = {
      ...(o.terminal || {}),
      allowedCommands: String(cliArgs["allowed-commands"])
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    };
  }
  if (cliArgs["timeout-ms"]) {
    o.terminal = {
      ...(o.terminal || {}),
      timeoutMs: coerceInt(cliArgs["timeout-ms"]),
    };
  }
  if (cliArgs["max-output-bytes"]) {
    o.terminal = {
      ...(o.terminal || {}),
      maxOutputBytes: coerceInt(cliArgs["max-output-bytes"]),
    };
  }
  if (cliArgs["transport"]) o.transport = cliArgs["transport"];
  if (cliArgs["host"]) o.http = { ...(o.http || {}), host: cliArgs["host"] };
  if (cliArgs["port"]) {
    o.http = { ...(o.http || {}), port: coerceInt(cliArgs["port"]) };
  }
  if (cliArgs["public"] !== undefined) {
    o.public = { ...(o.public || {}), enabled: coerceBool(cliArgs["public"]) };
  }
  if (cliArgs["provider"]) {
    o.public = { ...(o.public || {}), provider: cliArgs["provider"] };
  }
  if (cliArgs["auth-token"]) {
    o.public = { ...(o.public || {}), authToken: cliArgs["auth-token"] };
  }
  if (cliArgs["no-auth"] !== undefined) {
    o.public = { ...(o.public || {}), noAuth: coerceBool(cliArgs["no-auth"]) };
  }
  if (cliArgs["allow-sensitive"] !== undefined) {
    o.allowSensitive = coerceBool(cliArgs["allow-sensitive"]);
  }
  if (cliArgs["dashboard"] !== undefined) {
    o.dashboard = { ...(o.dashboard || {}), enabled: coerceBool(cliArgs["dashboard"]) };
  }
  if (cliArgs["dashboard-host"]) {
    o.dashboard = { ...(o.dashboard || {}), host: cliArgs["dashboard-host"] };
  }
  if (cliArgs["dashboard-port"]) {
    o.dashboard = { ...(o.dashboard || {}), port: coerceInt(cliArgs["dashboard-port"]) };
  }
  if (cliArgs["log-actions"] !== undefined) {
    o.logging = { ...(o.logging || {}), actions: coerceBool(cliArgs["log-actions"]) };
  }
  if (cliArgs["oauth"] !== undefined) {
    o.oauth = { ...(o.oauth || {}), enabled: coerceBool(cliArgs["oauth"]) };
  }
  if (cliArgs["oauth-issuer"]) {
    o.oauth = { ...(o.oauth || {}), issuer: cliArgs["oauth-issuer"] };
  }
  if (cliArgs["oauth-token-expiry"]) {
    o.oauth = { ...(o.oauth || {}), tokenExpirySeconds: coerceInt(cliArgs["oauth-token-expiry"]) };
  }
  if (cliArgs["oauth-client-id"]) {
    const client = {
      clientId: cliArgs["oauth-client-id"],
      clientSecret: cliArgs["oauth-client-secret"] || null,
      redirectUris: cliArgs["oauth-redirect-uris"]
        ? String(cliArgs["oauth-redirect-uris"]).split(",").map((s) => s.trim()).filter(Boolean)
        : [],
    };
    o.oauth = { ...(o.oauth || {}), clients: [client] };
  }
  return o;
}

function loadFile(configPath) {
  if (!configPath) return {};
  const abs = path.resolve(configPath);
  if (!fs.existsSync(abs)) {
    if (configPath === "mcp-local.config.json") return {};
    throw new Error(`Config file not found: ${abs}`);
  }
  const raw = fs.readFileSync(abs, "utf8");
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Invalid JSON in config file ${abs}: ${err.message}`);
  }
}

export function detectShell(shellPref) {
  if (shellPref && shellPref !== "auto") return shellPref;
  if (process.platform === "win32") {
    return process.env.ComSpec || "cmd.exe";
  }
  return process.env.SHELL || "/bin/sh";
}

export function loadConfig(argv = process.argv.slice(2)) {
  const cli = parseArgs(argv);
  const configPath = cli["config"] || process.env.MCP_CONFIG || "mcp-local.config.json";
  const fileConfig = loadFile(configPath);

  let cfg = deepMerge(DEFAULT_CONFIG, fileConfig);
  cfg = deepMerge(cfg, envOverrides());
  cfg = deepMerge(cfg, cliOverrides(cli));

  cfg.rootDir = path.resolve(cfg.rootDir.replace(/^~(?=$|\/|\\)/, os.homedir()));
  cfg.terminal.shell = detectShell(cfg.terminal.shell);

  validateConfig(cfg);
  return { config: cfg, cliArgs: cli, configPath };
}

function validateConfig(cfg) {
  if (!FILE_PERMISSIONS.has(cfg.permissions.files)) {
    throw new Error(
      `Invalid permissions.files: "${cfg.permissions.files}". Valid: ${[...FILE_PERMISSIONS].join(", ")}.`,
    );
  }
  if (typeof cfg.permissions.terminal !== "boolean") {
    cfg.permissions.terminal = Boolean(cfg.permissions.terminal);
  }
  if (!["stdio", "http"].includes(cfg.transport)) {
    throw new Error(`Invalid transport: "${cfg.transport}". Use "stdio" or "http".`);
  }
  if (cfg.public.enabled) {
    if (cfg.transport !== "http") {
      throw new Error(
        "public.enabled requires transport=http. Tunneling exposes the HTTP server.",
      );
    }
    if (!cfg.public.noAuth) {
      if (!cfg.public.authToken || cfg.public.authToken === "change-me") {
        if (!cfg.oauth.enabled) {
          throw new Error(
            "public.enabled requires public.authToken to be set to a strong value (not 'change-me'), oauth to be enabled, or public.noAuth=true to explicitly disable authentication.",
          );
        }
      }
    }
    if (!["cloudflared", "ngrok"].includes(cfg.public.provider)) {
      throw new Error(
        `Invalid public.provider: "${cfg.public.provider}". Use "cloudflared" or "ngrok".`,
      );
    }
  }
  if (cfg.oauth.enabled) {
    if (cfg.transport !== "http") {
      throw new Error("oauth.enabled requires transport=http.");
    }
    if (!cfg.oauth.clients || cfg.oauth.clients.length === 0) {
      throw new Error("oauth.enabled requires at least one entry in oauth.clients.");
    }
    for (const client of cfg.oauth.clients) {
      if (!client.clientId) {
        throw new Error("Each OAuth client must have a clientId.");
      }
      if (!Array.isArray(client.redirectUris) || client.redirectUris.length === 0) {
        throw new Error(`OAuth client "${client.clientId}" must have at least one redirectUri.`);
      }
    }
    if (!Number.isInteger(cfg.oauth.tokenExpirySeconds) || cfg.oauth.tokenExpirySeconds <= 0) {
      throw new Error("oauth.tokenExpirySeconds must be a positive integer.");
    }
  }
  if (!Number.isInteger(cfg.terminal.timeoutMs) || cfg.terminal.timeoutMs <= 0) {
    throw new Error("terminal.timeoutMs must be a positive integer.");
  }
  if (
    !Number.isInteger(cfg.terminal.maxOutputBytes) ||
    cfg.terminal.maxOutputBytes <= 0
  ) {
    throw new Error("terminal.maxOutputBytes must be a positive integer.");
  }
}

export const RUNTIME_EDITABLE_FIELDS = [
  "rootDir",
  "permissions.files",
  "permissions.terminal",
  "terminal.shell",
  "terminal.allowedCommands",
  "terminal.timeoutMs",
  "terminal.maxOutputBytes",
  "terminal.cwd",
  "terminal.allowShellMetachars",
  "terminal.env",
  "sensitivePatterns",
  "allowSensitive",
];

export function applyRuntimeUpdate(config, patch) {
  if (!patch || typeof patch !== "object") {
    throw new Error("Update payload must be an object.");
  }
  const next = deepMerge(config, patch);
  next.rootDir = path.resolve(
    String(next.rootDir).replace(/^~(?=$|\/|\\)/, os.homedir()),
  );
  next.terminal.shell = detectShell(next.terminal.shell);

  if (next.transport !== config.transport) {
    throw new Error("transport cannot be changed at runtime; restart required.");
  }
  if (JSON.stringify(next.http) !== JSON.stringify(config.http)) {
    throw new Error("http.host/port cannot be changed at runtime; restart required.");
  }
  if (JSON.stringify(next.public) !== JSON.stringify(config.public)) {
    throw new Error("public.* (tunnel) cannot be changed at runtime; restart required.");
  }
  if (JSON.stringify(next.oauth) !== JSON.stringify(config.oauth)) {
    throw new Error("oauth.* cannot be changed at runtime; restart required.");
  }
  if (JSON.stringify(next.dashboard) !== JSON.stringify(config.dashboard)) {
    throw new Error("dashboard.* cannot be changed at runtime; restart required.");
  }

  validateConfig(next);

  if (!fs.existsSync(next.rootDir) || !fs.statSync(next.rootDir).isDirectory()) {
    throw new Error(`rootDir does not exist or is not a directory: ${next.rootDir}`);
  }

  for (const key of Object.keys(config)) delete config[key];
  Object.assign(config, next);
  return config;
}

export function redactConfig(cfg) {
  const clone = JSON.parse(JSON.stringify(cfg));
  if (clone.public && clone.public.authToken) {
    clone.public.authToken = "***redacted***";
  }
  if (clone.oauth && Array.isArray(clone.oauth.clients)) {
    clone.oauth.clients = clone.oauth.clients.map((c) => ({
      ...c,
      clientSecret: c.clientSecret ? "***redacted***" : null,
    }));
  }
  return clone;
}
