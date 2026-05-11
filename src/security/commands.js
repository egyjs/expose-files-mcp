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

function tokenize(commandLine) {
  const tokens = [];
  const s = commandLine;
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i])) i++;
    if (i >= s.length) break;
    let token = "";
    while (i < s.length && !/\s/.test(s[i])) {
      const ch = s[i];
      if (ch === '"' || ch === "'") {
        const quote = ch;
        i++;
        while (i < s.length && s[i] !== quote) token += s[i++];
        if (i < s.length) i++;
      } else {
        token += ch;
        i++;
      }
    }
    tokens.push(token);
  }
  return tokens;
}

function basename(token) {
  const last = token.split(/[\\/]/).pop() || token;
  return last.replace(/\.(exe|cmd|bat|ps1)$/i, "");
}

function hasPathSeparator(s) {
  return /[\\/]/.test(s);
}

function matchEntry(entry, tokens) {
  const entryTokens = entry.trim().split(/\s+/);
  if (entryTokens.length === 0 || entryTokens.length > tokens.length) return false;

  const headEntry = entryTokens[0];
  const headToken = tokens[0];
  if (hasPathSeparator(headEntry)) {
    if (headEntry.toLowerCase() !== headToken.toLowerCase()) return false;
  } else {
    if (headEntry.toLowerCase() !== basename(headToken).toLowerCase()) return false;
  }

  for (let i = 1; i < entryTokens.length; i++) {
    if (entryTokens[i] !== tokens[i]) return false;
  }
  return true;
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

  const tokens = tokenize(commandLine);
  if (tokens.length === 0) {
    throw new CommandSecurityError("Could not parse command name.");
  }

  const base = basename(tokens[0]);
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

  const matched = allowedCommands.find((entry) => matchEntry(entry, tokens));
  if (!matched) {
    const prefix = tokens.slice(0, 2).join(" ");
    throw new CommandSecurityError(
      `Command "${prefix}" is not in the allowlist. Allowed: ${allowedCommands.join(", ")}.`,
    );
  }

  return { base, matched };
}
