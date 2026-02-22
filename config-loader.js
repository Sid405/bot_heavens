const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const CONFIG_PATH = path.join(__dirname, "config.json");
const EXAMPLE_PATH = path.join(__dirname, "config.example.json");
const PAINEL_JSON_PATH = process.env.PAINEL_JSON_PATH || path.join(__dirname, "painel.json");

const defaultPanel = {
  id: crypto.randomUUID(),
  name: "Menu Principal",
  command: "menu",
  menu: {
    placeholder: "📌 Escolha uma opção...",
    mainTitle: "📋 Menu Principal — Tudo em um servidor",
    mainDescription:
      "Use o **dropdown abaixo** para acessar as opções. Tudo em um só lugar!",
  },
  options: [
    { value: "regras", label: "📜 Regras", description: "Ver regras", emoji: "📜" },
    { value: "cargos", label: "🎭 Cargos", description: "Cargos e notificações", emoji: "🎭" },
    { value: "ajuda", label: "❓ Ajuda", description: "Comandos e ajuda", emoji: "❓" },
    { value: "links", label: "🔗 Links", description: "Links do servidor", emoji: "🔗" },
    { value: "info", label: "ℹ️ Informações", description: "Sobre o servidor", emoji: "ℹ️" },
  ],
  embeds: {
    regras: { color: "5865f2", title: "📜 Regras", description: "• Respeite todos\n• Sem spam" },
    cargos: { color: "57f287", title: "🎭 Cargos", description: "Use o canal de cargos." },
    ajuda: { color: "fee75c", title: "❓ Ajuda", description: "`/menu` — Abre o menu." },
    links: { color: "eb459e", title: "🔗 Links", description: "Links úteis." },
    info: { color: "ed4245", title: "ℹ️ Informações", description: "Bem-vindo!" },
  },
};

const defaultConfig = {
  panels: [defaultPanel],
};

function deepMerge(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source || {})) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object"
    ) {
      out[key] = deepMerge(target[key], source[key]);
    } else if (source[key] !== undefined) {
      out[key] = source[key];
    }
  }
  return out;
}

/**
 * Converte config antigo (menu/options/embeds na raiz) para o novo formato { panels: [...] }.
 */
function normalizeConfig(data) {
  if (Array.isArray(data.panels) && data.panels.length > 0) {
    return {
      panels: data.panels.map((p) => {
        const name = p.name || "Menu";
        const command =
          p.command ||
          String(name)
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "") ||
          "menu";
        return {
          id: p.id || crypto.randomUUID(),
          name,
          command,
          channelId: p.channelId || null,
          menu: { ...defaultPanel.menu, ...(p.menu || {}) },
          options: Array.isArray(p.options) ? p.options : [],
          embeds: typeof p.embeds === "object" ? p.embeds : {},
        };
      }),
    };
  }
  // Compatibilidade: config antigo sem panels
  return {
    panels: [
      {
        id: crypto.randomUUID(),
        name: "Menu Principal",
        command: "menu",
        menu: { ...defaultPanel.menu, ...(data.menu || {}) },
        options: Array.isArray(data.options) ? data.options : defaultPanel.options,
        embeds: typeof data.embeds === "object" ? data.embeds : defaultPanel.embeds,
      },
    ],
  };
}

function loadConfig() {
  // 1. Try painel.json (or PAINEL_JSON_PATH)
  try {
    if (fs.existsSync(PAINEL_JSON_PATH)) {
      const raw = fs.readFileSync(PAINEL_JSON_PATH, "utf8");
      const data = JSON.parse(raw);
      return normalizeConfig(data);
    }
  } catch (e) {
    console.warn("Falhou ao ler painel.json, tentando config.json:", e.message);
  }
  // 2. Fallback: config.json (backward compat)
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf8");
      const data = JSON.parse(raw);
      return normalizeConfig(data);
    }
  } catch (e) {
    console.warn("Erro ao ler config.json:", e.message);
  }
  // 3. Safe empty default to avoid crash
  return { panels: [] };
}

function saveConfig(newConfig) {
  const merged = deepMerge(defaultConfig, newConfig);
  const full = normalizeConfig(merged);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(full, null, 2), "utf8");
  return full;
}

module.exports = { loadConfig, saveConfig, normalizeConfig, CONFIG_PATH, PAINEL_JSON_PATH, defaultConfig };
