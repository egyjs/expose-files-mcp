import os from "node:os";
import { z } from "zod";
import { redactConfig } from "../config.js";

export function metaTools(config) {
  return [
    {
      name: "get_working_directory",
      description: "Return the configured root directory and platform info.",
      inputSchema: {},
      handler: async () =>
        [
          `rootDir: ${config.rootDir}`,
          `platform: ${process.platform} | arch: ${process.arch} | node: ${process.version}`,
          `hostname: ${os.hostname()} | shell: ${config.terminal.shell}`,
        ].join("\n"),
    },
    {
      name: "get_server_config",
      description:
        "Return the active server configuration (auth tokens redacted).",
      inputSchema: {
        includeDefaults: z.boolean().default(true),
      },
      handler: async () => redactConfig(config),
    },
  ];
}
