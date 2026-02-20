/**
 * API do painel (dashboard) — tipo Dyno: você configura o bot pelo site.
 * O site Lovable chama esta API para ler e salvar a config.
 */
const express = require("express");
const cors = require("cors");
const { saveConfig, loadConfig } = require("./config-loader");

const app = express();
const PORT = process.env.CONFIG_API_PORT || 3001;
const API_KEY = process.env.CONFIG_API_KEY || "";

// Permite o site (Lovable) em outro domínio chamar esta API
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
app.use(cors({ origin: CORS_ORIGIN }));
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
    res.json({ ok: true, config: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PATCH — mesclar só algumas chaves (menu, options, embeds)
app.patch("/api/config", auth, (req, res) => {
  try {
    const current = loadConfig();
    const merged = {
      ...current,
      ...req.body,
      menu: { ...current.menu, ...(req.body.menu || {}) },
      embeds: { ...current.embeds, ...(req.body.embeds || {}) },
    };
    if (Array.isArray(req.body.options)) merged.options = req.body.options;
    const updated = saveConfig(merged);
    res.json({ ok: true, config: updated });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.listen(PORT, () => {
  console.log(`API de config ativa em http://localhost:${PORT} (para o site Lovable)`);
});
