import { ConfigService } from "./config-service.js";
import { createDashboardApp } from "./server.js";

export async function startDashboard(config) {
  if (!config.dashboard?.enabled) return null;

  const configService = new ConfigService(config);
  const app = createDashboardApp(configService);

  const { host, port } = config.dashboard;
  await new Promise((resolve, reject) => {
    const server = app.listen(port, host, resolve);
    server.on("error", reject);
  });
  return { host, port, url: `http://${host}:${port}` };
}

export { ConfigService } from "./config-service.js";
export { createDashboardApp } from "./server.js";
