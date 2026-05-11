const TTY = process.stderr.isTTY;
const COLOR = TTY && process.env.NO_COLOR === undefined;

const c = {
  reset:   COLOR ? "\x1b[0m"  : "",
  bold:    COLOR ? "\x1b[1m"  : "",
  dim:     COLOR ? "\x1b[2m"  : "",
  cyan:    COLOR ? "\x1b[36m" : "",
  green:   COLOR ? "\x1b[32m" : "",
  yellow:  COLOR ? "\x1b[33m" : "",
  red:     COLOR ? "\x1b[31m" : "",
  magenta: COLOR ? "\x1b[35m" : "",
  blue:    COLOR ? "\x1b[34m" : "",
};

const KEY_WIDTH = 12;

function write(line) {
  process.stderr.write(line + "\n");
}

export function blank() {
  write("");
}

export function title(name, version) {
  write(`${c.bold}${name}${c.reset}${c.dim} v${version}${c.reset}`);
}

export function section(name) {
  write(`${c.bold}${c.cyan}${name}${c.reset}`);
}

export function kv(key, value) {
  const k = key.padEnd(KEY_WIDTH);
  write(`  ${c.dim}${k}${c.reset} ${value}`);
}

export function ready(msg = "ready") {
  write(`${c.green}● ${msg}${c.reset}`);
}

export function info(msg) {
  write(msg);
}

export function warn(msg) {
  write(`${c.yellow}⚠  ${msg}${c.reset}`);
}

export function error(msg) {
  write(`${c.red}✖  ${msg}${c.reset}`);
}

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function pad3(n) { return n < 10 ? "00" + n : n < 100 ? "0" + n : "" + n; }

function timestamp() {
  const d = new Date();
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`;
}

function summarizeValue(v, maxLen = 80) {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (typeof v === "string") {
    const s = v.length > maxLen ? v.slice(0, maxLen) + "…" : v;
    return JSON.stringify(s);
  }
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (typeof v === "object") {
    const keys = Object.keys(v);
    if (keys.length === 0) return "{}";
    return `{${keys.length} keys}`;
  }
  return String(v);
}

function summarizeArgs(args) {
  if (!args || typeof args !== "object") return "";
  const entries = Object.entries(args);
  if (entries.length === 0) return "";
  const parts = [];
  let total = 0;
  for (const [k, v] of entries) {
    const piece = `${k}=${summarizeValue(v)}`;
    if (total + piece.length > 140) {
      parts.push("…");
      break;
    }
    parts.push(piece);
    total += piece.length + 1;
  }
  return parts.join(" ");
}

let enabled = true;

export function setActionLoggingEnabled(value) {
  enabled = Boolean(value);
}

export function isActionLoggingEnabled() {
  return enabled;
}

export function action({ tool, ok, durationMs, args, error: errMsg, source }) {
  if (!enabled) return;
  const ts = `${c.dim}[${timestamp()}]${c.reset}`;
  const mark = ok
    ? `${c.green}✓${c.reset}`
    : `${c.red}✗${c.reset}`;
  const name = `${c.bold}${ok ? c.cyan : c.red}${tool}${c.reset}`;
  const dur = durationMs == null
    ? ""
    : ` ${c.dim}${durationMs}ms${c.reset}`;
  const src = source ? ` ${c.magenta}${source}${c.reset}` : "";
  const summary = summarizeArgs(args);
  const argsStr = summary ? `  ${c.dim}${summary}${c.reset}` : "";
  const tail = ok ? "" : ` ${c.red}— ${errMsg || "error"}${c.reset}`;
  write(`${ts} ${mark} ${name}${dur}${src}${argsStr}${tail}`);
}
