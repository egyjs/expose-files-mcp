export class CommandSecurityError extends Error {
  constructor(message) {
    super(message);
    this.name = "CommandSecurityError";
  }
}

const DANGEROUS_TOKENS = [
  "rm -rf /",
  "rm -rf /*",
  "rm -rf ~",
  ":(){:|:&};:",
  "mkfs",
  "dd if=",
  "shutdown",
  "reboot",
  "halt",
  "poweroff",
  "format c:",
  "del /f /s /q c:\\",
  "Remove-Item -Recurse -Force C:\\",
];

const SHELL_METACHARS = /[;&|`$<>(){}]/;

const DEFAULT_DANGEROUS_BINARIES = new Set([
  "sudo",
  "su",
  "rm",
  "del",
  "mkfs",
  "fdisk",
  "dd",
  "shutdown",
  "reboot",
  "halt",
  "init",
  "kill",
  "killall",
  "curl",
  "wget",
  "nc",
  "ncat",
  "ssh",
  "scp",
  "rsync",
  "chmod",
  "chown",
]);

function getBaseCommand(commandLine) {
  const trimmed = commandLine.trim();
  if (!trimmed) return "";
  const match = trimmed.match(/^("[^"]+"|'[^']+'|\S+)/);
  if (!match) return "";
  const token = match[1].replace(/^["']|["']$/g, "");
  const last = token.split(/[\\/]/).pop() || token;
  return last.replace(/\.(exe|cmd|bat|ps1)$/i, "");
}

export function validateCommand(commandLine, config) {
  const { allowedCommands = [], allowShellMetachars = false } = config;

  if (typeof commandLine !== "string" || !commandLine.trim()) {
    throw new CommandSecurityError("Command must be a non-empty string.");
  }
  if (commandLine.includes("\0")) {
    throw new CommandSecurityError("Command contains a null byte.");
  }
  if (commandLine.length > 4000) {
    throw new CommandSecurityError("Command exceeds maximum length.");
  }

  const lower = commandLine.toLowerCase();
  for (const dangerous of DANGEROUS_TOKENS) {
    if (lower.includes(dangerous.toLowerCase())) {
      throw new CommandSecurityError(
        `Command contains a blocked dangerous pattern: "${dangerous}".`,
      );
    }
  }

  if (!allowShellMetachars && SHELL_METACHARS.test(commandLine)) {
    throw new CommandSecurityError(
      "Command contains shell metacharacters (;, &, |, `, $, <, >, parentheses, braces). " +
        "Pipelines and chaining are disabled by default for safety.",
    );
  }

  const base = getBaseCommand(commandLine);
  if (!base) {
    throw new CommandSecurityError("Could not parse command name.");
  }

  if (DEFAULT_DANGEROUS_BINARIES.has(base.toLowerCase())) {
    throw new CommandSecurityError(
      `Command "${base}" is blocked by the default deny list. ` +
        "Enable it explicitly via allowedCommands and pair with a careful review.",
    );
  }

  if (allowedCommands.length === 0) {
    throw new CommandSecurityError(
      "Terminal allowlist is empty. Configure terminal.allowedCommands to permit specific commands.",
    );
  }

  const allowed = allowedCommands.map((c) => c.toLowerCase());
  if (!allowed.includes(base.toLowerCase())) {
    throw new CommandSecurityError(
      `Command "${base}" is not in the allowlist. Allowed: ${allowedCommands.join(", ")}.`,
    );
  }

  return { base };
}
