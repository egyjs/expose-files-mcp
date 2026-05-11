import fs from "node:fs";
import path from "node:path";

let stream = null;
let enabled = false;
let filePath = null;
let warned = false;

function pad2(n) { return n < 10 ? "0" + n : "" + n; }
function pad3(n) { return n < 10 ? "00" + n : n < 100 ? "0" + n : "" + n; }

function timestamp(d = new Date()) {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}.${pad3(d.getMilliseconds())}`
  );
}

function clipString(s, max) {
  if (s.length <= max) return s;
  return s.slice(0, max) + `…(+${s.length - max} chars)`;
}

function sanitizeArgs(args, maxStringLen = 200) {
  if (args == null) return null;
  if (typeof args === "string") return clipString(args, maxStringLen);
  if (typeof args !== "object") return args;
  if (Array.isArray(args)) return args.map((v) => sanitizeArgs(v, maxStringLen));
  const out = {};
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === "string") {
      out[k] = clipString(v, maxStringLen);
    } else if (v && typeof v === "object") {
      out[k] = sanitizeArgs(v, maxStringLen);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function configureActivityLog({ enabled: wantEnabled, file }) {
  closeActivityLog();
  enabled = Boolean(wantEnabled);
  warned = false;
  if (!enabled) return { enabled: false, file: null };

  filePath = path.resolve(file || "mcp-actions.log");
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    stream = fs.createWriteStream(filePath, { flags: "a" });
    stream.on("error", (err) => {
      if (!warned) {
        warned = true;
        process.stderr.write(
          `⚠  activity log write error (${filePath}): ${err.message}\n`,
        );
      }
    });
    stream.write(
      JSON.stringify({
        ts: timestamp(),
        event: "log_opened",
        pid: process.pid,
      }) + "\n",
    );
    return { enabled: true, file: filePath };
  } catch (err) {
    enabled = false;
    stream = null;
    process.stderr.write(
      `⚠  could not open activity log at ${filePath}: ${err.message}\n`,
    );
    return { enabled: false, file: null };
  }
}

export function logAction({ tool, ok, durationMs, args, error, source }) {
  if (!enabled || !stream) return;
  const record = {
    ts: timestamp(),
    tool,
    ok: Boolean(ok),
    durationMs: durationMs ?? null,
    source: source || "tool",
    args: sanitizeArgs(args),
  };
  if (!ok && error) record.error = error;
  try {
    stream.write(JSON.stringify(record) + "\n");
  } catch (err) {
    if (!warned) {
      warned = true;
      process.stderr.write(`⚠  activity log write failed: ${err.message}\n`);
    }
  }
}

export function closeActivityLog() {
  if (stream) {
    try { stream.end(); } catch {}
  }
  stream = null;
  enabled = false;
  filePath = null;
}

export function activityLogStatus() {
  return { enabled, file: filePath };
}
