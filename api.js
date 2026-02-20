/**
 * Servidor HTTP Express — porta definida pelo Railway (process.env.PORT).
 * GET /api/config — retorna o JSON da configuração atual (config.json).
 * PATCH /api/config — recebe JSON no body, valida Authorization: Bearer {CONFIG_API_KEY}, salva mesclando com o existente.
 * CORS habilitado para qualquer origem.
 */
const express = require("express");
const cors = require("cors");
const { saveConfig, loadConfig } = require("./config-loader");
const { configEvents } = require("./config-events");

const app = express();
// Railway define process.env.PORT; local usa CONFIG_API_PORT ou 3001
const PORT = process.env.PORT || process.env.CONFIG_API_PORT || 3001;
const API_KEY = process.env.CONFIG_API_KEY || "";

// CORS habilitado para qualquer origem
app.use(cors());
app.use(express.json({ limit: "500kb" }));

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
app.get("/api/config", (req, res) => {
  try {
    const config = loadConfig();
    res.json(config);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST — atualizar config (chamado pelo site Lovable)
app.post("/api/config", auth, (req, res) => {
  try {
    const updated = saveConfig(req.body);
    configEvents.emit("saved");
    res.json({ ok: true, config: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH — mesclar configuração (suporta { panels: [...] } ou formato antigo menu/options/embeds)
app.patch("/api/config", auth, (req, res) => {
  try {
    const current = loadConfig();
    let merged;

    if (Array.isArray(req.body.panels)) {
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
    const updated = saveConfig(merged);
    configEvents.emit("saved");
    res.json({ ok: true, config: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`API ativa na porta ${PORT} (GET/PATCH /api/config)`);
});
