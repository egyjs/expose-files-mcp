import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { fileTools } from "./tools/files.js";
import { terminalTools } from "./tools/terminal.js";
import { metaTools } from "./tools/meta.js";

function wrapHandler(name, handler) {
  return async (args) => {
    try {
      const result = await handler(args ?? {});
      return {
        content: [
          {
            type: "text",
            text:
              typeof result === "string"
                ? result
                : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: `[${name}] ${err.name || "Error"}: ${err.message}`,
          },
        ],
      };
    }
  };
}

export function buildServer(config) {
  const server = new McpServer({
    name: "expose-files-mcp",
    version: "0.1.0",
  });

  const tools = [
    ...metaTools(config),
    ...fileTools(config),
    ...terminalTools(config),
  ];

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      wrapHandler(tool.name, tool.handler),
    );
  }

  return { server, toolNames: tools.map((t) => t.name) };
}
