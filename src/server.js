import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { fileTools } from "./tools/files.js";
import { terminalTools } from "./tools/terminal.js";
import { metaTools } from "./tools/meta.js";
import { batchTools } from "./tools/batch.js";

function wrapHandler(name, handler) {
  return async (args) => {
    try {
      const result = await handler(args ?? {});
      return {
        content: Array.isArray(result)
          ? result
          : [{ type: "text", text: typeof result === "string" ? result : JSON.stringify(result) }],
      };
    } catch (err) {
      return {
        isError: true,
        content: [{ type: "text", text: `[${name}] ${err.name || "Error"}: ${err.message}` }],
      };
    }
  };
}

export function buildServer(config) {
  const server = new McpServer({
    name: "expose-files-mcp",
    version: "0.1.0",
  });

  const registry = new Map();

  const baseTools = [
    ...metaTools(config),
    ...fileTools(config),
    ...terminalTools(config),
  ];

  for (const tool of baseTools) {
    const schema = z.object(tool.inputSchema ?? {});
    registry.set(tool.name, async (args) => {
      const parsed = schema.parse(args ?? {});
      return tool.handler(parsed);
    });
  }

  const allTools = [...baseTools, ...batchTools(registry)];

  for (const tool of allTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      wrapHandler(tool.name, tool.handler),
    );
  }

  return { server, toolNames: allTools.map((t) => t.name) };
}
