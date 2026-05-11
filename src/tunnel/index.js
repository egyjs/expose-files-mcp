import { startCloudflared } from "./cloudflared.js";
import { startNgrok } from "./ngrok.js";

export async function startTunnel(config) {
  if (!config.public.enabled) return null;

  const port = config.http.port;
  const host = config.http.host;

  let tunnel;
  if (config.public.provider === "cloudflared") {
    tunnel = startCloudflared({ port, host });
  } else if (config.public.provider === "ngrok") {
    tunnel = startNgrok({ port });
  } else {
    throw new Error(`Unknown tunnel provider: ${config.public.provider}`);
  }

  const url = await tunnel.waitForUrl();
  return { url, stop: tunnel.stop, provider: config.public.provider };
}
