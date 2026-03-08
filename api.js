/**
 * Servidor HTTP Express — porta definida pelo Railway (process.env.PORT).
 * GET /api/config — retorna o JSON da configuração atual (config.json).
 * PATCH /api/config — recebe JSON no body, valida Authorization: Bearer {CONFIG_API_KEY}, salva mesclando com o existente.
 * CORS habilitado para qualquer origem.
 */
const express = require("express");
const cors = require("cors");
const { normalizeConfig } = require("./config-loader");
const { configEvents } = require("./config-events");
const Config = require("./models/Config");

/** Valida que não há comandos duplicados entre painéis. Retorna { valid: true } ou { valid: false, error } */
function validateDuplicateCommands(panels) {
  if (!Array.isArray(panels) || panels.length === 0) return { valid: true };
  const normalized = normalizeConfig({ panels });
  const commands = (normalized.panels || []).map((p) => (p.command || "").toLowerCase().trim());
  const seen = new Set();
  for (const cmd of commands) {
    if (!cmd) continue;
    if (seen.has(cmd)) {
      return { valid: false, error: `Comando duplicado: "${cmd}". Cada painel deve ter um comando único.` };
    }
    seen.add(cmd);
  }
  return { valid: true };
}

const app = express();
// Railway define process.env.PORT; local usa CONFIG_API_PORT ou 3001
const PORT = process.env.PORT || process.env.CONFIG_API_PORT || 3001;
const API_KEY = process.env.CONFIG_API_KEY || "";

// CORS — antes de todas as rotas; permite PATCH e preflight OPTIONS
app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "500kb" }));

// Preflight OPTIONS para /api/config (navegador envia antes de PATCH)
app.options("/api/config", (req, res) => res.sendStatus(204));

function auth(req, res, next) {
  if (!API_KEY) {
    return res.status(503).json({ error: "CONFIG_API_KEY não configurada no servidor." });
  }
  const header = req.headers.authorization;
  const token = header && header.replace(/^Bearer\s+/i, "");
  if (token !== API_KEY) {
    return res.status(401).json({ error: "Não autorizado." });
  }
  next();
}

// GET — ler config atual (para o site exibir)
app.get("/api/config", async (req, res) => {
  try {
    const doc = await Config.findById("main");
    res.json(doc ? doc.toObject() : { panels: [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST — atualizar config (chamado pelo site Lovable)
app.post("/api/config", auth, async (req, res) => {
  try {
    if (Array.isArray(req.body.panels)) {
      const check = validateDuplicateCommands(req.body.panels);
      if (!check.valid) return res.status(400).json({ error: check.error });
    }
    const normalized = normalizeConfig(req.body);
    await Config.findByIdAndUpdate("main", { panels: normalized.panels }, { upsert: true, new: true, setDefaultsOnInsert: true });
    configEvents.emit("saved");
    res.json({ ok: true, config: normalized });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH — mesclar configuração (suporta { panels: [...] } ou formato antigo menu/options/embeds)
app.patch("/api/config", auth, async (req, res) => {
  try {
    const doc = await Config.findById("main");
    const current = doc ? doc.toObject() : { panels: [] };
    let merged;

    if (Array.isArray(req.body.panels)) {
      const check = validateDuplicateCommands(req.body.panels);
      if (!check.valid) return res.status(400).json({ error: check.error });
      merged = { panels: req.body.panels };
    } else if (req.body.menu != null || req.body.options != null || req.body.embeds != null) {
      const first = current.panels?.[0] || {};
      merged = {
        panels: [
          {
            id: first.id,
            name: first.name || "Menu Principal",
            menu: { ...first.menu, ...(req.body.menu || {}) },
            options: Array.isArray(req.body.options) ? req.body.options : (first.options || []),
            embeds: { ...first.embeds, ...(req.body.embeds || {}) },
          },
          ...(current.panels?.slice(1) || []),
        ],
      };
    } else {
      merged = { ...current, ...req.body };
    }
    const normalized = normalizeConfig(merged);
    await Config.findByIdAndUpdate("main", { panels: normalized.panels }, { upsert: true, new: true, setDefaultsOnInsert: true });
    configEvents.emit("saved");
    res.json({ ok: true, config: normalized });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Railway precisa escutar em 0.0.0.0 para aceitar conexões externas
app.listen(PORT, "0.0.0.0", () => {
  console.log(`API ativa na porta ${PORT} (GET/PATCH /api/config)`);
});
