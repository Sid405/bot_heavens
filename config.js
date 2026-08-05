const CHANNELS = Object.freeze({
  terms: process.env.TERMS_CHANNEL_ID || "1395903363324973186",
  support: process.env.SUPPORT_CHANNEL_ID || "1395903365954928792",
  faq: process.env.FAQ_CHANNEL_ID || "1395903395671576668",
  catalog: process.env.CATALOG_CHANNEL_ID || "1475966115954819123",
});

const GROUPS = Object.freeze([
  {
    id: "anime",
    name: "Anime & Luta",
    emoji: "⚔️",
    placeholder: "⚔️ Escolha um jogo de Anime/Luta...",
  },
  {
    id: "simulators",
    name: "Simuladores & RPG",
    emoji: "🎲",
    placeholder: "🎲 Escolha um Simulador/RPG...",
  },
  {
    id: "adventure",
    name: "Aventura & Diversos",
    emoji: "☀️",
    placeholder: "☀️ Escolha um jogo...",
  },
]);

module.exports = { CHANNELS, GROUPS };
