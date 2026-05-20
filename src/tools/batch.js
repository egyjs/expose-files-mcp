import { z } from "zod";
import { logAction } from "../activity-log.js";

export function batchTools(registry) {
  return [
    {
      name: "batch",
      description:
        "Execute multiple tool calls in a single request. Each action specifies a tool name and its arguments; results are returned in the same order. Use mode='parallel' for independent actions, 'sequential' when later actions depend on earlier ones. The 'batch' tool itself cannot be called recursively.",
      inputSchema: {
        actions: z
          .array(
            z.object({
              id: z
                .string()
                .optional()
                .describe("Caller-supplied id echoed back in the result."),
              tool: z.string().describe("Name of a registered MCP tool."),
              arguments: z
                .record(z.any())
                .default({})
                .describe("Arguments object passed to the tool."),
            }),
          )
          .min(1)
          .max(50)
          .describe("List of tool calls to run."),
        mode: z
          .enum(["parallel", "sequential"])
          .default("parallel")
          .describe(
            "parallel: run all actions concurrently. sequential: run in order.",
          ),
        stopOnError: z
          .boolean()
          .default(false)
          .describe(
            "Only meaningful in sequential mode: stop after the first action that throws.",
          ),
      },
      handler: async ({ actions, mode, stopOnError }) => {
        const runOne = async (action, index) => {
          const entry = {
            index,
            id: action.id ?? null,
            tool: action.tool,
          };
          if (action.tool === "batch") {
            return {
              ...entry,
              ok: false,
              error: "batch cannot call itself.",
            };
          }
          const handler = registry.get(action.tool);
          if (!handler) {
            return {
              ...entry,
              ok: false,
              error: `Unknown tool: "${action.tool}". Available: ${[...registry.keys()].join(", ")}.`,
            };
          }
          const started = Date.now();
          try {
            const result = await handler(action.arguments ?? {});
            const durationMs = Date.now() - started;
            logAction({
              tool: action.tool,
              ok: true,
              durationMs,
              args: action.arguments,
              source: "batch",
            });
            return {
              ...entry,
              ok: true,
              durationMs,
              result,
            };
          } catch (err) {
            const durationMs = Date.now() - started;
            const errorMsg = `${err.name || "Error"}: ${err.message}`;
            logAction({
              tool: action.tool,
              ok: false,
              durationMs,
              args: action.arguments,
              error: errorMsg,
              source: "batch",
            });
            return {
              ...entry,
              ok: false,
              durationMs,
              error: errorMsg,
            };
          }
        };

        if (mode === "parallel") {
          const results = await Promise.all(actions.map(runOne));
          return { mode, count: results.length, results };
        }

        const results = [];
        for (let i = 0; i < actions.length; i++) {
          const r = await runOne(actions[i], i);
          results.push(r);
          if (!r.ok && stopOnError) {
            return {
              mode,
              count: results.length,
              stopped: true,
              results,
            };
          }
        }
        return { mode, count: results.length, results };
      },
    },
  ];
}
