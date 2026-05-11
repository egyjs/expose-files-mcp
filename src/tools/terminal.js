import { spawn } from "node:child_process";
import path from "node:path";
import { z } from "zod";
import { validateCommand } from "../security/commands.js";
import { safeJoin } from "../security/paths.js";

function buildShellInvocation(shell, command) {
  const lower = shell.toLowerCase();
  if (lower.includes("powershell") || lower.endsWith("pwsh") || lower.endsWith("pwsh.exe")) {
    return { file: shell, args: ["-NoProfile", "-NonInteractive", "-Command", command] };
  }
  if (lower.endsWith("cmd.exe") || lower.endsWith("cmd")) {
    return { file: shell, args: ["/d", "/s", "/c", command] };
  }
  return { file: shell, args: ["-c", command] };
}

export function terminalTools(config) {
  return [
    {
      name: "run_command",
      description:
        "Run a single allowlisted terminal command in the configured shell. Pipelines, redirection, and chaining are disabled by default.",
      inputSchema: {
        command: z.string().describe("Command line to execute."),
        cwd: z
          .string()
          .optional()
          .describe("Working directory relative to rootDir. Defaults to rootDir."),
        timeoutMs: z.number().int().positive().max(600000).optional(),
      },
      handler: async ({ command, cwd, timeoutMs }) => {
        if (!config.permissions.terminal) {
          throw new Error(
            "Terminal execution is disabled. Set permissions.terminal=true to enable.",
          );
        }
        validateCommand(command, {
          allowedCommands: config.terminal.allowedCommands,
          allowShellMetachars: config.terminal.allowShellMetachars,
        });

        const workdir = cwd
          ? safeJoin(config.rootDir, cwd)
          : config.terminal.cwd
            ? safeJoin(config.rootDir, config.terminal.cwd)
            : config.rootDir;

        const { file, args } = buildShellInvocation(
          config.terminal.shell,
          command,
        );

        const maxOutput = config.terminal.maxOutputBytes;
        const effectiveTimeout = timeoutMs ?? config.terminal.timeoutMs;

        const env = {
          ...process.env,
          ...config.terminal.env,
          MCP_ROOT_DIR: config.rootDir,
        };

        return await new Promise((resolve) => {
          const child = spawn(file, args, {
            cwd: workdir,
            env,
            windowsHide: true,
            shell: false,
          });

          let stdout = Buffer.alloc(0);
          let stderr = Buffer.alloc(0);
          let truncatedOut = false;
          let truncatedErr = false;
          let timedOut = false;

          const timer = setTimeout(() => {
            timedOut = true;
            child.kill("SIGKILL");
          }, effectiveTimeout);

          child.stdout.on("data", (chunk) => {
            if (stdout.length >= maxOutput) {
              truncatedOut = true;
              return;
            }
            const remaining = maxOutput - stdout.length;
            if (chunk.length > remaining) {
              stdout = Buffer.concat([stdout, chunk.subarray(0, remaining)]);
              truncatedOut = true;
            } else {
              stdout = Buffer.concat([stdout, chunk]);
            }
          });
          child.stderr.on("data", (chunk) => {
            if (stderr.length >= maxOutput) {
              truncatedErr = true;
              return;
            }
            const remaining = maxOutput - stderr.length;
            if (chunk.length > remaining) {
              stderr = Buffer.concat([stderr, chunk.subarray(0, remaining)]);
              truncatedErr = true;
            } else {
              stderr = Buffer.concat([stderr, chunk]);
            }
          });

          child.on("error", (err) => {
            clearTimeout(timer);
            resolve({
              command,
              shell: config.terminal.shell,
              cwd: workdir,
              exitCode: null,
              signal: null,
              timedOut: false,
              error: err.message,
              stdout: stdout.toString("utf8"),
              stderr: stderr.toString("utf8"),
              truncatedStdout: truncatedOut,
              truncatedStderr: truncatedErr,
            });
          });

          child.on("close", (code, signal) => {
            clearTimeout(timer);
            resolve({
              command,
              shell: config.terminal.shell,
              cwd: workdir,
              exitCode: code,
              signal,
              timedOut,
              stdout: stdout.toString("utf8"),
              stderr: stderr.toString("utf8"),
              truncatedStdout: truncatedOut,
              truncatedStderr: truncatedErr,
            });
          });
        });
      },
    },
  ];
}
