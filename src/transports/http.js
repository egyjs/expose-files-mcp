import express from "express";
import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";

function timingSafeEqual(a, b) {
  const ab = Buffer.from(a || "", "utf8");
  const bb = Buffer.from(b || "", "utf8");
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

function authMiddleware(authToken) {
  return (req, res, next) => {
    if (!authToken) return next();
    const header = req.header("authorization") || "";
    const provided = header.startsWith("Bearer ")
      ? header.slice(7)
      : req.header("x-mcp-auth") || "";
    if (!timingSafeEqual(provided, authToken)) {
      res.status(401).json({
        jsonrpc: "2.0",
        error: { code: -32001, message: "Unauthorized" },
        id: null,
      });
      return;
    }
    next();
  };
}

export async function startHttp(server, config) {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

  app.get("/healthz", (_req, res) => {
    res.json({ ok: true, name: "expose-files-mcp", version: "0.1.0" });
  });

  const transports = new Map();
  const mcpAuth = authMiddleware(config.public.authToken);

  app.post("/mcp", mcpAuth, async (req, res) => {
    try {
      const sessionId = req.header("mcp-session-id");
      let transport = sessionId ? transports.get(sessionId) : undefined;

      if (!transport) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            transports.set(id, transport);
          },
        });
        transport.onclose = () => {
          if (transport.sessionId) transports.delete(transport.sessionId);
        };
        await server.connect(transport);
      }

      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: err.message },
          id: null,
        });
      }
    }
  });

  const handleSession = async (req, res) => {
    const sessionId = req.header("mcp-session-id");
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(400).send("Invalid or missing session id.");
      return;
    }
    await transport.handleRequest(req, res);
  };
  app.get("/mcp", mcpAuth, handleSession);
  app.delete("/mcp", mcpAuth, handleSession);

  await new Promise((resolve) => {
    app.listen(config.http.port, config.http.host, resolve);
  });
  return { app, port: config.http.port, host: config.http.host };
}
