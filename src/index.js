import { loadConfig, redactConfig } from "./config.js";
import { buildServer } from "./server.js";
import { startStdio } from "./transports/stdio.js";
import { startHttp } from "./transports/http.js";
import { startTunnel } from "./tunnel/index.js";

function log(...args) {
  process.stderr.write(args.join(" ") + "\n");
}

export async function run(argv) {
  const { config, configPath } = loadConfig(argv);
  const { server, toolNames } = buildServer(config);

  if (config.transport === "stdio") {
    await startStdio(server);
    log(
      `[expose-files-mcp] stdio transport ready. root=${config.rootDir} tools=${toolNames.join(",")}`,
    );
    return { config, configPath };
  }

  const http = await startHttp(server, config);
  log(
    `[expose-files-mcp] http transport listening on http://${http.host}:${http.port}/mcp`,
  );
  log(`[expose-files-mcp] root=${config.rootDir} tools=${toolNames.join(",")}`);
  if (config.oauth?.enabled && http.oauth) {
    log(`[expose-files-mcp] OAuth 2.0 enabled — issuer: ${http.oauth.issuer}`);
    log(`[expose-files-mcp] OAuth authorize: ${http.oauth.issuer}/oauth/authorize`);
    log(`[expose-files-mcp] OAuth token:     ${http.oauth.issuer}/oauth/token`);
    log(`[expose-files-mcp] OAuth metadata:  ${http.oauth.issuer}/.well-known/oauth-authorization-server`);
  } else if (config.public.authToken) {
    log("[expose-files-mcp] auth: Bearer token required for /mcp");
  }

  let tunnel = null;
  if (config.public.enabled) {
    log(
      `[expose-files-mcp] starting ${config.public.provider} tunnel — DO NOT expose unrestricted filesystem or terminal to the public internet.`,
    );
    tunnel = await startTunnel(config);
    log(`[expose-files-mcp] public URL: ${tunnel.url}/mcp`);
    if (config.oauth?.enabled) {
      log(`[expose-files-mcp] OAuth public endpoints (use these with clients):`);
      log(`[expose-files-mcp]   authorize: ${tunnel.url}/oauth/authorize`);
      log(`[expose-files-mcp]   token:     ${tunnel.url}/oauth/token`);
      log(`[expose-files-mcp]   metadata:  ${tunnel.url}/.well-known/oauth-authorization-server`);
    } else {
      log("[expose-files-mcp] connect with header: Authorization: Bearer <authToken>");
    }
  }

  const shutdown = () => {
    log("[expose-files-mcp] shutting down...");
    if (tunnel) tunnel.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  return { config, configPath, tunnel };
}

export { loadConfig, redactConfig, buildServer };
