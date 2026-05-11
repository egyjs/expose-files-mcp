import express from "express";
import { renderHtml } from "./view.js";

export function createDashboardApp(configService) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));

  app.get("/", (_req, res) => {
    res.type("html").send(renderHtml());
  });

  app.get("/api/config", (_req, res) => {
    res.json(configService.read());
  });

  app.get("/api/editable-fields", (_req, res) => {
    res.json({ fields: configService.editableFields() });
  });

  app.post("/api/config", (req, res) => {
    try {
      const updated = configService.update(req.body || {});
      res.json(updated);
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  return app;
}
