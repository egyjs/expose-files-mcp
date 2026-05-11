import express from "express";
import { applyRuntimeUpdate, redactConfig, RUNTIME_EDITABLE_FIELDS } from "./config.js";

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>expose-files-mcp dashboard</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  :root { color-scheme: light dark; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 0; padding: 24px; max-width: 880px; }
  h1 { font-size: 1.4rem; margin: 0 0 4px; }
  .sub { color: #666; font-size: 0.9rem; margin-bottom: 20px; }
  fieldset { border: 1px solid #ccc; border-radius: 8px; padding: 14px 18px; margin-bottom: 16px; }
  legend { font-weight: 600; padding: 0 6px; }
  label { display: block; font-size: 0.9rem; margin-bottom: 4px; color: #444; }
  .row { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
  .row > div { flex: 1 1 220px; }
  input[type=text], input[type=number], select, textarea {
    width: 100%; padding: 6px 8px; font: inherit; border: 1px solid #bbb; border-radius: 4px;
    background: canvas; color: canvastext; box-sizing: border-box;
  }
  textarea { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; min-height: 80px; }
  input[disabled], select[disabled], textarea[disabled] { opacity: 0.55; }
  .toggle { display: flex; align-items: center; gap: 8px; margin-top: 18px; }
  .actions { display: flex; gap: 10px; align-items: center; margin-top: 4px; }
  button { padding: 8px 16px; font: inherit; border: 0; border-radius: 4px; background: #2563eb; color: white; cursor: pointer; }
  button.secondary { background: #555; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .status { font-size: 0.9rem; }
  .status.ok { color: #0a7d2b; }
  .status.err { color: #b00020; }
  .note { font-size: 0.8rem; color: #888; margin-top: 6px; }
  .ro { font-size: 0.78rem; background: #e6e6e6; color: #555; padding: 1px 6px; border-radius: 4px; margin-left: 6px; }
  details summary { cursor: pointer; user-select: none; }
  details pre { background: rgba(0,0,0,0.05); padding: 10px; border-radius: 6px; overflow: auto; max-height: 280px; }
</style>
</head>
<body>
<h1>expose-files-mcp</h1>
<div class="sub">Local runtime configuration. Changes apply immediately to new MCP tool calls — no restart, no new tunnel.</div>

<form id="cfg">
  <fieldset>
    <legend>Filesystem</legend>
    <div class="row">
      <div>
        <label for="rootDir">Root directory</label>
        <input type="text" id="rootDir" name="rootDir" />
      </div>
      <div>
        <label for="permissions.files">File permissions</label>
        <select id="permissions.files" name="permissions.files">
          <option value="none">none</option>
          <option value="read-only">read-only</option>
          <option value="write-only">write-only</option>
          <option value="read-write">read-write</option>
        </select>
      </div>
    </div>
    <div class="row">
      <div>
        <label for="sensitivePatterns">Sensitive patterns (one per line)</label>
        <textarea id="sensitivePatterns" name="sensitivePatterns"></textarea>
      </div>
      <div class="toggle">
        <input type="checkbox" id="allowSensitive" name="allowSensitive" />
        <label for="allowSensitive" style="margin:0">Allow sensitive file access</label>
      </div>
    </div>
  </fieldset>

  <fieldset>
    <legend>Terminal</legend>
    <div class="toggle">
      <input type="checkbox" id="permissions.terminal" name="permissions.terminal" />
      <label for="permissions.terminal" style="margin:0">Enable terminal execution</label>
    </div>
    <div class="row" style="margin-top:12px">
      <div>
        <label for="terminal.shell">Shell</label>
        <input type="text" id="terminal.shell" name="terminal.shell" />
      </div>
      <div>
        <label for="terminal.cwd">Default cwd (relative to rootDir, blank = root)</label>
        <input type="text" id="terminal.cwd" name="terminal.cwd" />
      </div>
    </div>
    <div class="row">
      <div>
        <label for="terminal.timeoutMs">Timeout (ms)</label>
        <input type="number" id="terminal.timeoutMs" name="terminal.timeoutMs" min="1" />
      </div>
      <div>
        <label for="terminal.maxOutputBytes">Max output bytes</label>
        <input type="number" id="terminal.maxOutputBytes" name="terminal.maxOutputBytes" min="1" />
      </div>
      <div class="toggle">
        <input type="checkbox" id="terminal.allowShellMetachars" name="terminal.allowShellMetachars" />
        <label for="terminal.allowShellMetachars" style="margin:0">Allow shell metachars (pipes/redirection)</label>
      </div>
    </div>
    <div class="row">
      <div style="flex-basis:100%">
        <label for="terminal.allowedCommands">Allowed commands (one per line)</label>
        <textarea id="terminal.allowedCommands" name="terminal.allowedCommands"></textarea>
      </div>
    </div>
  </fieldset>

  <fieldset>
    <legend>Transport &amp; tunnel <span class="ro">restart required</span></legend>
    <div class="row">
      <div>
        <label>Transport</label>
        <input type="text" id="transport" disabled />
      </div>
      <div>
        <label>HTTP host:port</label>
        <input type="text" id="httpAddr" disabled />
      </div>
      <div>
        <label>Public tunnel</label>
        <input type="text" id="publicState" disabled />
      </div>
      <div>
        <label>OAuth</label>
        <input type="text" id="oauthState" disabled />
      </div>
    </div>
    <div class="note">These settings affect how the server binds and how the public tunnel is built. Change them in your config file and restart.</div>
  </fieldset>

  <div class="actions">
    <button type="submit" id="save">Apply changes</button>
    <button type="button" class="secondary" id="reload">Reload from server</button>
    <span class="status" id="status"></span>
  </div>
</form>

<details style="margin-top:24px">
  <summary>Raw config (redacted)</summary>
  <pre id="raw"></pre>
</details>

<script>
const ed = new Set(${JSON.stringify(RUNTIME_EDITABLE_FIELDS)});

function get(o, p) {
  return p.split(".").reduce((x, k) => (x == null ? x : x[k]), o);
}
function setNested(o, p, v) {
  const ks = p.split(".");
  let cur = o;
  for (let i = 0; i < ks.length - 1; i++) {
    cur[ks[i]] = cur[ks[i]] ?? {};
    cur = cur[ks[i]];
  }
  cur[ks[ks.length - 1]] = v;
}

function fill(cfg) {
  document.getElementById("rootDir").value = cfg.rootDir ?? "";
  document.getElementById("permissions.files").value = cfg.permissions?.files ?? "read-only";
  document.getElementById("permissions.terminal").checked = !!cfg.permissions?.terminal;
  document.getElementById("terminal.shell").value = cfg.terminal?.shell ?? "";
  document.getElementById("terminal.cwd").value = cfg.terminal?.cwd ?? "";
  document.getElementById("terminal.timeoutMs").value = cfg.terminal?.timeoutMs ?? 10000;
  document.getElementById("terminal.maxOutputBytes").value = cfg.terminal?.maxOutputBytes ?? 20000;
  document.getElementById("terminal.allowShellMetachars").checked = !!cfg.terminal?.allowShellMetachars;
  document.getElementById("terminal.allowedCommands").value = (cfg.terminal?.allowedCommands ?? []).join("\\n");
  document.getElementById("sensitivePatterns").value = (cfg.sensitivePatterns ?? []).join("\\n");
  document.getElementById("allowSensitive").checked = !!cfg.allowSensitive;

  document.getElementById("transport").value = cfg.transport ?? "";
  document.getElementById("httpAddr").value = (cfg.http?.host ?? "") + ":" + (cfg.http?.port ?? "");
  document.getElementById("publicState").value = cfg.public?.enabled
    ? cfg.public.provider + (cfg.public.noAuth ? " (no auth)" : "")
    : "disabled";
  document.getElementById("oauthState").value = cfg.oauth?.enabled ? "enabled" : "disabled";

  document.getElementById("raw").textContent = JSON.stringify(cfg, null, 2);
}

function collect() {
  const patch = {};
  setNested(patch, "rootDir", document.getElementById("rootDir").value.trim());
  setNested(patch, "permissions.files", document.getElementById("permissions.files").value);
  setNested(patch, "permissions.terminal", document.getElementById("permissions.terminal").checked);
  setNested(patch, "terminal.shell", document.getElementById("terminal.shell").value.trim() || "auto");
  const cwd = document.getElementById("terminal.cwd").value.trim();
  setNested(patch, "terminal.cwd", cwd === "" ? null : cwd);
  setNested(patch, "terminal.timeoutMs", parseInt(document.getElementById("terminal.timeoutMs").value, 10));
  setNested(patch, "terminal.maxOutputBytes", parseInt(document.getElementById("terminal.maxOutputBytes").value, 10));
  setNested(patch, "terminal.allowShellMetachars", document.getElementById("terminal.allowShellMetachars").checked);
  setNested(patch, "terminal.allowedCommands",
    document.getElementById("terminal.allowedCommands").value.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean));
  setNested(patch, "sensitivePatterns",
    document.getElementById("sensitivePatterns").value.split(/\\r?\\n/).map(s => s.trim()).filter(Boolean));
  setNested(patch, "allowSensitive", document.getElementById("allowSensitive").checked);
  return patch;
}

function setStatus(msg, ok) {
  const el = document.getElementById("status");
  el.textContent = msg;
  el.className = "status " + (ok ? "ok" : "err");
  if (ok) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 4000);
}

async function load() {
  const r = await fetch("/api/config");
  const cfg = await r.json();
  fill(cfg);
}

document.getElementById("cfg").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = document.getElementById("save");
  btn.disabled = true;
  try {
    const r = await fetch("/api/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(collect()),
    });
    const body = await r.json();
    if (!r.ok) {
      setStatus(body.error || "Update failed", false);
    } else {
      fill(body);
      setStatus("Applied. New MCP tool calls will use the updated config.", true);
    }
  } catch (err) {
    setStatus(err.message, false);
  } finally {
    btn.disabled = false;
  }
});

document.getElementById("reload").addEventListener("click", load);
load();
</script>
</body>
</html>`;

export async function startDashboard(config) {
  if (!config.dashboard?.enabled) return null;

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.type("html").send(HTML);
  });

  app.get("/api/config", (_req, res) => {
    res.json(redactConfig(config));
  });

  app.post("/api/config", (req, res) => {
    try {
      applyRuntimeUpdate(config, req.body || {});
      res.json(redactConfig(config));
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  const { host, port } = config.dashboard;
  await new Promise((resolve, reject) => {
    const server = app.listen(port, host, resolve);
    server.on("error", reject);
  });
  return { host, port, url: `http://${host}:${port}` };
}
