import { z } from "zod";

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
          const label = action.id
            ? `[${index}] ${action.tool} (${action.id})`
            : `[${index}] ${action.tool}`;

          if (action.tool === "batch") {
            return { ok: false, section: `## ${label} ✗\nError: batch cannot call itself.` };
          }
          const handler = registry.get(action.tool);
          if (!handler) {
            const available = [...registry.keys()].join(", ");
            return {
              ok: false,
              section: `## ${label} ✗\nError: Unknown tool "${action.tool}". Available: ${available}`,
            };
          }
          try {
            const result = await handler(action.arguments ?? {});
            const body = typeof result === "string" ? result : JSON.stringify(result);
            return { ok: true, section: `## ${label} ✓\n${body}` };
          } catch (err) {
            return {
              ok: false,
              section: `## ${label} ✗\nError: ${err.name || "Error"}: ${err.message}`,
            };
          }
        };

        let items;
        let stopped = false;

        if (mode === "parallel") {
          items = await Promise.all(actions.map(runOne));
        } else {
          items = [];
          for (let i = 0; i < actions.length; i++) {
            const item = await runOne(actions[i], i);
            items.push(item);
            if (!item.ok && stopOnError) {
              stopped = true;
              break;
            }
          }
        }

        const header = `${mode} | ${items.length}/${actions.length} actions${stopped ? " | stopped on error" : ""}`;
        return [header, "", ...items.map((it) => it.section)].join("\n\n");
      },
    },
  ];
}
