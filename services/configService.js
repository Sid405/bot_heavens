const { loadConfig } = require("../config-loader");

const API_URL =
  process.env.API_URL || process.env.CONFIG_API_URL || "http://localhost:3001";
const CONFIG_API_KEY = process.env.CONFIG_API_KEY || "";

const DEFAULT_STORE_CONFIG = {
  prompt: {
    title: "🛒 Loja de Robux",
    description: "Bem-vindo à nossa loja! Escolha o que deseja comprar:",
    color: "5865f2",
    image: null,
    buttons: [
      { label: "Comprar Robux", customId: "buy_robux", style: "Primary", emoji: "💎" },
      { label: "Comprar Gamepass", customId: "buy_gamepass", style: "Success", emoji: "🎮" },
    ],
  },
  pricing: {
    robuxPer1000: 12.0,
    gamepassPer1000: 20.0,
    minQuantity: 1000,
    deliveryHoursRobux: 24,
    deliveryHoursGamepass: 48,
  },
  logs: {
    publicChannelId: null,
    privateChannelId: null,
  },
};

async function getConfig() {
  try {
    const res = await fetch(`${API_URL}/api/config`, {
      headers: CONFIG_API_KEY ? { Authorization: `Bearer ${CONFIG_API_KEY}` } : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return loadConfig();
  }
}

function mergeWithDefaults(config, defaults) {
  const out = { ...defaults };
  for (const key of Object.keys(config || {})) {
    if (
      config[key] &&
      typeof config[key] === "object" &&
      !Array.isArray(config[key]) &&
      defaults[key] &&
      typeof defaults[key] === "object"
    ) {
      out[key] = mergeWithDefaults(config[key], defaults[key]);
    } else if (config[key] !== undefined) {
      out[key] = config[key];
    }
  }
  return out;
}

async function getStoreConfig() {
  const config = await getConfig();
  const storeRaw = config && typeof config.store === "object" ? config.store : {};
  return mergeWithDefaults(storeRaw, DEFAULT_STORE_CONFIG);
}

module.exports = { getConfig, getStoreConfig, DEFAULT_STORE_CONFIG };
