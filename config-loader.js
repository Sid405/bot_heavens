const fs = require("fs");
const path = require("path");

const CONFIG_PATH = path.join(__dirname, "config.json");
const EXAMPLE_PATH = path.join(__dirname, "config.example.json");

const defaultConfig = {
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

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf8");
      const data = JSON.parse(raw);
      return { ...defaultConfig, ...data };
    }
  } catch (e) {
    console.warn("Erro ao ler config.json, usando padrão:", e.message);
  }
  return defaultConfig;
}

function saveConfig(newConfig) {
  const full = deepMerge(defaultConfig, newConfig);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(full, null, 2), "utf8");
  return full;
}

module.exports = { loadConfig, saveConfig, CONFIG_PATH, defaultConfig };
