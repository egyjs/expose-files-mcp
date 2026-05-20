import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import {
  safeJoin,
  assertNoSymlinkEscape,
  isSensitive,
  checkPermission,
  PathSecurityError,
} from "../security/paths.js";

function ensureFiles(config, op) {
  if (!checkPermission(config.permissions.files, op)) {
    throw new Error(
      `File ${op} is not permitted. Current permissions.files = "${config.permissions.files}".`,
    );
  }
}

function checkSensitive(config, absPath) {
  if (config.allowSensitive) return;
  if (isSensitive(absPath, config.sensitivePatterns)) {
    throw new PathSecurityError(
      `Path "${absPath}" matches a sensitive pattern. Set allowSensitive=true to override.`,
    );
  }
}

async function resolveSafe(config, userPath, op) {
  const abs = safeJoin(config.rootDir, userPath ?? ".");
  checkSensitive(config, abs);
  if (op === "read") {
    await assertNoSymlinkEscape(config.rootDir, abs);
  }
  return abs;
}

function fmtSize(bytes) {
  if (bytes == null) return "?";
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1048576).toFixed(1)}MB`;
}

export function fileTools(config) {
  return [
    {
      name: "list_files",
      description:
        "List files and directories under a path inside the configured root. Returns names, types, and sizes.",
      inputSchema: {
        path: z
          .string()
          .default(".")
          .describe("Relative or absolute path inside rootDir."),
        recursive: z.boolean().default(false),
        maxEntries: z.number().int().positive().max(2000).default(500),
      },
      handler: async ({ path: p, recursive, maxEntries }) => {
        ensureFiles(config, "read");
        const abs = await resolveSafe(config, p, "read");
        const entries = [];
        async function walk(dir, depth) {
          const items = await fs.readdir(dir, { withFileTypes: true });
          for (const item of items) {
            if (entries.length >= maxEntries) return;
            const full = path.join(dir, item.name);
            try {
              checkSensitive(config, full);
            } catch {
              continue;
            }
            const rel = path.relative(config.rootDir, full);
            let size = null;
            if (item.isFile()) {
              try {
                const st = await fs.stat(full);
                size = st.size;
              } catch {}
            }
            entries.push({
              path: rel,
              type: item.isDirectory()
                ? "directory"
                : item.isSymbolicLink()
                  ? "symlink"
                  : "file",
              size,
            });
            if (recursive && item.isDirectory() && depth < 20) {
              await walk(full, depth + 1);
            }
          }
        }
        await walk(abs, 0);
        const base = path.relative(config.rootDir, abs) || ".";
        const truncated = entries.length >= maxEntries;
        const lines = [
          `root: ${config.rootDir} | base: ${base} | entries: ${entries.length}${truncated ? " (truncated)" : ""}`,
          "",
        ];
        for (const e of entries) {
          if (e.type === "directory") lines.push(`${e.path}/`);
          else if (e.type === "symlink") lines.push(`${e.path} [symlink]`);
          else lines.push(`${e.path} (${fmtSize(e.size)})`);
        }
        return lines.join("\n");
      },
    },
    {
      name: "read_file",
      description:
        "Read a UTF-8 text file under the configured root. Use offset/length for partial reads.",
      inputSchema: {
        path: z.string().describe("File path relative to rootDir."),
        encoding: z.enum(["utf8", "base64"]).default("utf8"),
        offset: z.number().int().nonnegative().default(0),
        length: z.number().int().positive().max(1_000_000).optional(),
      },
      handler: async ({ path: p, encoding, offset, length }) => {
        ensureFiles(config, "read");
        const abs = await resolveSafe(config, p, "read");
        const stat = await fs.stat(abs);
        if (!stat.isFile()) {
          throw new Error(`Not a file: ${p}`);
        }
        const maxLen = length ?? Math.min(stat.size - offset, 1_000_000);
        const buf = Buffer.alloc(Math.max(0, maxLen));
        const fh = await fs.open(abs, "r");
        try {
          const { bytesRead } = await fh.read(buf, 0, buf.length, offset);
          const slice = buf.subarray(0, bytesRead);
          const content =
            encoding === "base64"
              ? slice.toString("base64")
              : slice.toString("utf8");
          const meta = [
            `path: ${path.relative(config.rootDir, abs)}`,
            `size: ${stat.size}`,
            `read: ${bytesRead}`,
            `encoding: ${encoding}`,
            ...(offset ? [`offset: ${offset}`] : []),
          ].join(" | ");
          if (encoding === "base64") return `${meta}\n\n${content}`;
          return `${meta}\n\`\`\`\n${content}\n\`\`\``;
        } finally {
          await fh.close();
        }
      },
    },
    {
      name: "write_file",
      description:
        "Write or overwrite a UTF-8 (or base64) file under the configured root. Creates parent directories.",
      inputSchema: {
        path: z.string(),
        content: z.string(),
        encoding: z.enum(["utf8", "base64"]).default("utf8"),
        createDirs: z.boolean().default(true),
      },
      handler: async ({ path: p, content, encoding, createDirs }) => {
        ensureFiles(config, "write");
        const abs = await resolveSafe(config, p, "write");
        if (createDirs) {
          await fs.mkdir(path.dirname(abs), { recursive: true });
        }
        const data =
          encoding === "base64" ? Buffer.from(content, "base64") : content;
        await fs.writeFile(abs, data);
        const stat = await fs.stat(abs);
        return `path: ${path.relative(config.rootDir, abs)} | written: ${stat.size} bytes`;
      },
    },
    {
      name: "delete_file",
      description:
        "Delete a file or empty directory under the configured root. Use recursive=true to delete directories.",
      inputSchema: {
        path: z.string(),
        recursive: z.boolean().default(false),
      },
      handler: async ({ path: p, recursive }) => {
        ensureFiles(config, "write");
        const abs = await resolveSafe(config, p, "write");
        if (path.resolve(abs) === path.resolve(config.rootDir)) {
          throw new Error("Refusing to delete the root directory itself.");
        }
        const stat = await fs.stat(abs);
        if (stat.isDirectory()) {
          if (!recursive) {
            await fs.rmdir(abs);
          } else {
            await fs.rm(abs, { recursive: true, force: false });
          }
        } else {
          await fs.unlink(abs);
        }
        return `deleted: ${path.relative(config.rootDir, abs)}`;
      },
    },
    {
      name: "search_files",
      description:
        "Recursively search for filenames matching a glob and/or text matching a regex inside the configured root.",
      inputSchema: {
        path: z.string().default("."),
        namePattern: z
          .string()
          .optional()
          .describe("Glob to match filenames (e.g. '*.js')."),
        contentRegex: z
          .string()
          .optional()
          .describe("Regex pattern to match inside file contents."),
        maxResults: z.number().int().positive().max(500).default(100),
      },
      handler: async ({ path: p, namePattern, contentRegex, maxResults }) => {
        ensureFiles(config, "read");
        const abs = await resolveSafe(config, p, "read");
        const nameRe = namePattern ? globToRegExp(namePattern) : null;
        const contentRe = contentRegex ? new RegExp(contentRegex) : null;
        const results = [];
        async function walk(dir, depth) {
          if (results.length >= maxResults || depth > 20) return;
          let items;
          try {
            items = await fs.readdir(dir, { withFileTypes: true });
          } catch {
            return;
          }
          for (const item of items) {
            if (results.length >= maxResults) return;
            const full = path.join(dir, item.name);
            try {
              checkSensitive(config, full);
            } catch {
              continue;
            }
            if (item.isDirectory()) {
              await walk(full, depth + 1);
              continue;
            }
            if (!item.isFile()) continue;
            const nameMatch = nameRe ? nameRe.test(item.name) : true;
            if (!nameMatch) continue;
            let snippet = null;
            if (contentRe) {
              try {
                const text = await fs.readFile(full, "utf8");
                const m = text.match(contentRe);
                if (!m) continue;
                snippet = text
                  .slice(Math.max(0, m.index - 40), m.index + m[0].length + 40)
                  .replace(/\s+/g, " ");
              } catch {
                continue;
              }
            }
            results.push({
              path: path.relative(config.rootDir, full),
              snippet,
            });
          }
        }
        await walk(abs, 0);
        const truncated = results.length >= maxResults;
        const lines = [`${results.length} results${truncated ? " (truncated)" : ""}`];
        if (results.length) {
          lines.push("");
          for (const r of results) {
            lines.push(r.snippet ? `${r.path} — ${r.snippet}` : r.path);
          }
        }
        return lines.join("\n");
      },
    },
  ];
}

function globToRegExp(pattern) {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}
