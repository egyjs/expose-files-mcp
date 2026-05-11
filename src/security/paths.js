import path from "node:path";
import fs from "node:fs/promises";

export class PathSecurityError extends Error {
  constructor(message) {
    super(message);
    this.name = "PathSecurityError";
  }
}

export function resolveRoot(rootDir) {
  return path.resolve(rootDir);
}

export function safeJoin(rootDir, userPath) {
  if (typeof userPath !== "string") {
    throw new PathSecurityError("Path must be a string.");
  }
  if (userPath.includes("\0")) {
    throw new PathSecurityError("Path contains a null byte.");
  }

  const root = resolveRoot(rootDir);
  const candidate = path.isAbsolute(userPath)
    ? path.resolve(userPath)
    : path.resolve(root, userPath);

  const rel = path.relative(root, candidate);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PathSecurityError(
      `Path "${userPath}" escapes the configured root directory.`,
    );
  }
  return candidate;
}

export async function assertNoSymlinkEscape(rootDir, absPath) {
  const root = resolveRoot(rootDir);
  try {
    const real = await fs.realpath(absPath);
    const rel = path.relative(root, real);
    if (rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new PathSecurityError(
        `Resolved path escapes root via symlink: ${absPath}`,
      );
    }
    return real;
  } catch (err) {
    if (err.code === "ENOENT") return absPath;
    throw err;
  }
}

function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "::DOUBLESTAR::")
    .replace(/\*/g, "[^/\\\\]*")
    .replace(/::DOUBLESTAR::/g, ".*")
    .replace(/\?/g, "[^/\\\\]");
  return new RegExp(`(^|[\\\\/])${escaped}$`, "i");
}

export function isSensitive(absPath, sensitivePatterns = []) {
  const normalized = absPath.replace(/\\/g, "/");
  return sensitivePatterns.some((pattern) => {
    const re = globToRegExp(pattern);
    return re.test(normalized) || re.test(path.basename(normalized));
  });
}

export function checkPermission(permission, op) {
  if (permission === "no" || permission === "none" || permission === false) {
    return false;
  }
  if (op === "read") {
    return permission === "read-only" || permission === "read-write";
  }
  if (op === "write") {
    return permission === "write-only" || permission === "read-write";
  }
  return false;
}
