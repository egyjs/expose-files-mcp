import { spawn } from "node:child_process";

async function fetchNgrokUrl() {
  const endpoints = [
    "http://127.0.0.1:4040/api/tunnels",
    "http://localhost:4040/api/tunnels",
  ];
  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const data = await res.json();
      const tunnel = (data.tunnels || []).find((t) =>
        String(t.public_url || "").startsWith("https://"),
      );
      if (tunnel) return tunnel.public_url;
    } catch {}
  }
  return null;
}

export function startNgrok({ port, logger = console }) {
  const child = spawn(
    "ngrok",
    ["http", String(port), "--log=stdout", "--log-format=logfmt"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );

  const state = { publicUrl: null };

  const ready = new Promise((resolve, reject) => {
    const onData = (chunk) => {
      process.stderr.write(`[ngrok] ${chunk}`);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    child.on("error", (err) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            "ngrok not found on PATH. Install it from https://ngrok.com/download and run `ngrok config add-authtoken <token>`.",
          ),
        );
      } else {
        reject(err);
      }
    });

    const deadline = Date.now() + 15000;
    const poll = async () => {
      if (state.publicUrl) return;
      const url = await fetchNgrokUrl();
      if (url) {
        state.publicUrl = url;
        resolve(url);
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error("Timed out waiting for ngrok public URL."));
        return;
      }
      setTimeout(poll, 500);
    };
    setTimeout(poll, 800);
  });

  return {
    process: child,
    waitForUrl: () => ready,
    get publicUrl() {
      return state.publicUrl;
    },
    stop: () => {
      if (!child.killed) child.kill();
    },
  };
}
