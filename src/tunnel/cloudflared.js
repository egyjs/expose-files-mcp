import { spawn } from "node:child_process";

export function startCloudflared({ port, host = "127.0.0.1", logger = console }) {
  const url = `http://${host}:${port}`;
  const child = spawn(
    "cloudflared",
    ["tunnel", "--no-autoupdate", "--url", url],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const state = { publicUrl: null, ready: null };

  const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

  state.ready = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      const text = chunk.toString("utf8");
      process.stderr.write(`[cloudflared] ${text}`);
      const m = text.match(URL_RE);
      if (m && !state.publicUrl) {
        state.publicUrl = m[0];
        resolve(state.publicUrl);
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            "cloudflared not found on PATH. Install it from https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/",
          ),
        );
      } else {
        reject(err);
      }
    });
    child.on("exit", (code) => {
      if (!state.publicUrl) {
        reject(new Error(`cloudflared exited with code ${code} before producing a URL.`));
      }
    });
  });

  return {
    process: child,
    waitForUrl: () => state.ready,
    get publicUrl() {
      return state.publicUrl;
    },
    stop: () => {
      if (!child.killed) child.kill();
    },
  };
}
