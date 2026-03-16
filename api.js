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
const Catalog = require("./models/Catalog");

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
const PORT = process.env.PORT || process.env.CONFIG_API_PORT || 3001;
const API_KEY = process.env.CONFIG_API_KEY || "";

app.use(
  cors({
    origin: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "500kb" }));

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

// ========== ROTA DE SEED — acesse UMA VEZ para popular o catálogo ==========
app.get("/run-seed", async (req, res) => {
  try {
    const existing = await Catalog.countDocuments();
    if (existing > 0) {
      return res.json({ ok: false, msg: `Catálogo já tem ${existing} jogos. Seed não executado novamente.` });
    }

    const games = [
      // ==================== ANIME & LUTA ====================
      { name: "Anime Destroyers", emoji: "⚔️", group: "Anime & Luta", categories: [{ name: "Gamepass", products: [{ name: "Sorte", price: 3.37 }, { name: "Armazenamento Grande", price: 3.37 }, { name: "Clique Rápido", price: 3.37 }, { name: "Melhor Alcance", price: 5.07 }, { name: "VIP", price: 5.07 }, { name: "Fast Roll", price: 6.77 }, { name: "Dano x2", price: 6.77 }, { name: "2x Energia", price: 6.77 }, { name: "2x Gemas", price: 6.77 }, { name: "Rolo Extra", price: 8.47 }, { name: "Abertura Rápida", price: 10.17 }, { name: "2x XP", price: 13.57 }, { name: "Super Sorte", price: 13.57 }, { name: "2x Drops", price: 13.57 }, { name: "Equipamentos Extras", price: 16.97 }, { name: "Extra Aberto", price: 16.97 }, { name: "Todos os Game Pass", price: 118.97 }] }] },
      { name: "Anime Eternal", emoji: "✨", group: "Anime & Luta", categories: [{ name: "Gamepass", products: [{ name: "Fast Clicker", price: 3.37 }, { name: "Que Sorte!", price: 3.37 }, { name: "Pequeno Depósito", price: 3.37 }, { name: "Armazenamento Grande", price: 6.77 }, { name: "Extra Titan", price: 10.17 }, { name: "Moedas Duplas", price: 10.17 }, { name: "Suporte Extra", price: 10.17 }, { name: "VIP", price: 10.17 }, { name: "Danos Duplos", price: 11.87 }, { name: "Energia Dupla", price: 11.87 }, { name: "Double Exp", price: 13.57 }, { name: "Double Souls", price: 13.57 }, { name: "Fast Stars Open", price: 13.57 }, { name: "Multi Open", price: 13.57 }, { name: "Multi Roll", price: 16.97 }, { name: "Fast Roll", price: 16.97 }, { name: "Arma Dupla", price: 16.97 }, { name: "Mais Equipamentos", price: 16.97 }, { name: "Arma Tripla", price: 20.37 }, { name: "Equipamentos de Campeões Extras", price: 20.37 }, { name: "Super Sortudo!", price: 20.37 }, { name: "Acesso Remoto", price: 27.17 }, { name: "Super Sortudo! (Ultra)", price: 44.17 }] }] },
      { name: "Anime Fighters Simulator", emoji: "🥊", group: "Anime & Luta", categories: [{ name: "Gamepass", products: [{ name: "Corrida", price: 0.99 }, { name: "Teletransporte", price: 1.67 }, { name: "Auto Clicker", price: 2.35 }, { name: "Sortudo", price: 3.37 }, { name: "Mochila Pequena", price: 3.37 }, { name: "Ímã", price: 5.07 }, { name: "Mochila Relic", price: 6.77 }, { name: "Giro Passivo Instantâneo", price: 6.77 }, { name: "Slots do Cofre", price: 6.77 }, { name: "EXP em Dobro", price: 10.17 }, { name: "Recarga pela Metade", price: 13.57 }, { name: "VIP", price: 13.57 }, { name: "2x Iene", price: 13.57 }, { name: "Abertura Rápida", price: 13.57 }, { name: "Mochila Grande", price: 13.57 }, { name: "2x Gotas", price: 16.97 }, { name: "Caça-Níqueis Grande Cofre", price: 16.97 }, { name: "Ataque Automático", price: 16.97 }, { name: "2x Sorte da Aura", price: 16.97 }, { name: "Equipamento Extra", price: 20.37 }, { name: "Mochila Mega", price: 22.07 }, { name: "Super Sortudo", price: 23.77 }, { name: "Passe Premium", price: 27.17 }, { name: "Aberto para Vários", price: 27.17 }, { name: "Grimório da Sorte", price: 33.97 }] }] },
      { name: "Anime Vanguards", emoji: "🛡️", group: "Anime & Luta", categories: [{ name: "Gamepass", products: [{ name: "Unidade de Armazenamento Extra", price: 5.07 }, { name: "VIP", price: 10.17 }, { name: "Exibir Todas as Unidades", price: 20.37 }, { name: "Passe Premium", price: 27.17 }, { name: "Pular 10 Níveis", price: 33.97 }, { name: "Caçador Brilhante", price: 44.17 }, { name: "Passe", price: 169.97 }] }] },
      { name: "Anime Weapons", emoji: "🗡️", group: "Anime & Luta", categories: [{ name: "Gamepass", products: [{ name: "Ímã", price: 5.07 }, { name: "Clique Rápido", price: 6.77 }, { name: "Estoque do Arsenal", price: 8.47 }, { name: "Estrelas em Estoque", price: 8.47 }, { name: "Chuva de Meteoros", price: 10.17 }, { name: "Sorte", price: 10.17 }, { name: "Dano x2", price: 16.97 }, { name: "VIP", price: 16.97 }, { name: "Maestria 2x", price: 16.97 }, { name: "+1 Sombra", price: 16.97 }, { name: "+1 Stand", price: 16.97 }, { name: "+2 Estrelas Equipar", price: 16.97 }, { name: "+1 Gacha", price: 16.97 }, { name: "Abertura Rápida", price: 16.97 }, { name: "Insta Roll", price: 16.97 }, { name: "2x Experiência", price: 16.97 }, { name: "2x Iene", price: 16.97 }, { name: "Super Sorte", price: 20.37 }, { name: "Ultra Sorte", price: 33.97 }] }] },
      { name: "Jujutsu Beatdown", emoji: "👊", group: "Anime & Luta", categories: [{ name: "Gamepass", products: [{ name: "Emotes Extras + Adesivos", price: 4.05 }, { name: "Som de Matar", price: 5.07 }, { name: "Roupas do Despertar", price: 5.07 }, { name: "Mochila de Energia Amaldiçoada", price: 6.77 }, { name: "Acesso Antecipado", price: 10.17 }, { name: "Privado Plus", price: 13.57 }, { name: "VIP", price: 16.97 }] }, { name: "Moedas (G)", products: [{ name: "1.075 G", price: 4.08 }, { name: "2.700 G", price: 10.20 }, { name: "5.500 G", price: 20.40 }, { name: "8.300 G", price: 30.60 }, { name: "11.200 G", price: 40.80 }, { name: "22.750 G", price: 81.60 }] }] },
      { name: "Jujutsu Shenanigans", emoji: "🌀", group: "Anime & Luta", categories: [{ name: "Gamepass", products: [{ name: "Som de Matança Personalizada", price: 3.40 }, { name: "Roupas do Despertar", price: 3.40 }, { name: "Mais Slot de Emoção", price: 5.10 }, { name: "Segunda Página de Emote", price: 5.95 }, { name: "Mais Salvas de Construção", price: 5.95 }, { name: "Acesso Antecipado", price: 10.20 }] }] },
      { name: "Jujutsu: Zero", emoji: "⚡", group: "Anime & Luta", categories: [{ name: "Gamepass", products: [{ name: "Reroll Rápido de Clã", price: 5.07 }, { name: "Sorte", price: 6.77 }, { name: "Apoiador", price: 6.77 }, { name: "Bolsa Clan Maior", price: 10.17 }, { name: "Yen Boost", price: 13.57 }, { name: "Aumento de XP", price: 20.37 }, { name: "Aumento de Maestria", price: 20.37 }, { name: "Ultra Sortudo", price: 27.17 }, { name: "Grau Especial", price: 67.97 }] }, { name: "Moedas (¥)", products: [{ name: "¥2.500", price: 1.67 }, { name: "¥5.000", price: 3.37 }, { name: "¥25.000", price: 6.77 }, { name: "¥50.000", price: 16.97 }] }, { name: "Lúmens", products: [{ name: "500 Lúmens", price: 3.37 }, { name: "1.500 Lúmens", price: 10.17 }, { name: "6.000 Lúmens", price: 27.17 }, { name: "15.000 Lúmens", price: 67.97 }] }] },
      { name: "Jump Showdown", emoji: "🏆", group: "Anime & Luta", categories: [{ name: "Gamepass", products: [{ name: "Kill Sounds", price: 3.40 }, { name: "Espaços Extras para Emotes", price: 3.40 }, { name: "Trajes de Despertar", price: 5.10 }, { name: "Acesso Antecipado", price: 10.17 }, { name: "Servidor Privado +", price: 16.97 }] }] },
      { name: "Heroes Battlegrounds", emoji: "🦸", group: "Anime & Luta", categories: [{ name: "Gamepass", products: [{ name: "Emotes Tóxicos", price: 3.23 }, { name: "Páginas de Emotes", price: 3.23 }, { name: "Sons de Morte Personalizados", price: 6.77 }, { name: "Texto Personalizado para Movimentação", price: 6.77 }, { name: "Acesso Antecipado", price: 8.33 }, { name: "Servidor Privado +", price: 16.97 }, { name: "VIP", price: 27.17 }] }] },
      { name: "The Strongest Battlegrounds", emoji: "💥", group: "Anime & Luta", categories: [{ name: "Gamepass", products: [{ name: "Emote Segunda Página", price: 3.37 }, { name: "Traje de Despertar", price: 3.37 }, { name: "Espaços Extras para Emotes", price: 3.37 }, { name: "Selo Eterno", price: 3.37 }, { name: "Kill Sound", price: 6.77 }, { name: "Erupção Sombria", price: 10.17 }, { name: "VIP", price: 10.17 }, { name: "Acesso Antecipado", price: 10.17 }, { name: "Servidores Privados +", price: 16.97 }] }, { name: "Emotes", products: [{ name: "1 Emote Aleatório", price: 0.85 }, { name: "5 Emotes", price: 4.25 }, { name: "10 Emotes", price: 8.50 }, { name: "50 Emotes", price: 42.50 }] }, { name: "Cosméticos", products: [{ name: "3 Cosméticos", price: 8.06 }, { name: "5 Cosméticos", price: 13.43 }] }] },
      { name: "Sailor Piece", emoji: "⚓", group: "Anime & Luta", categories: [{ name: "Bônus", products: [{ name: "2x Dinheiro", price: 8.47 }, { name: "2x Experiência", price: 10.17 }, { name: "2x Gemas", price: 13.57 }, { name: "2x Gotas de Sorte", price: 22.07 }, { name: "2x Caídas", price: 28.87 }, { name: "Haki do Conquistador", price: 33.97 }, { name: "Mais Forte Hoje", price: 35.67 }, { name: "Mais Forte da História", price: 37.37 }] }, { name: "Personagens", products: [{ name: "Espada", price: 16.97 }, { name: "Yuji", price: 16.97 }, { name: "Gojo", price: 23.77 }, { name: "Sukuna", price: 27.17 }, { name: "Qin Shi", price: 28.87 }, { name: "Ichigo", price: 30.57 }, { name: "Jinwoo", price: 30.57 }, { name: "Alucard", price: 30.57 }, { name: "Aizen", price: 32.27 }, { name: "Sombra", price: 33.97 }, { name: "Madoka", price: 37.37 }, { name: "Rimuru", price: 39.07 }, { name: "Gilgamesh", price: 40.77 }] }] },
      // ==================== SIMULADORES & RPG ====================
      { name: "99 Nights in the Forest", emoji: "🌲", group: "Simuladores & RPG", categories: [{ name: "Diamantes", products: [{ name: "20 Diamantes (Pequeno Pacote)", price: 3.37 }, { name: "100 Diamantes (Saco Velho)", price: 13.60 }, { name: "250 Diamantes (Bom Saco)", price: 30.60 }, { name: "700 Diamantes (Saco Gigante)", price: 85.00 }] }] },
      { name: "Dragon Soul", emoji: "🐉", group: "Simuladores & RPG", categories: [{ name: "Gamepass", products: [{ name: "Viagem Rápida", price: 1.33 }, { name: "Seletor de Cores", price: 1.67 }, { name: "Flying Nimbus", price: 2.69 }, { name: "Drip", price: 5.07 }, { name: "Transmissão Instantânea", price: 5.07 }, { name: "Maldição Demoníaca", price: 8.47 }, { name: "Drops Sorte", price: 8.47 }, { name: "Radar Dragão", price: 10.17 }, { name: "Soul Vanity", price: 11.87 }, { name: "Pacote Brave", price: 16.97 }, { name: "Câmara do Tempo", price: 30.57 }, { name: "Pacote Gogota", price: 30.57 }, { name: "Pacote Brolo", price: 33.97 }, { name: "Xeno Boku Black", price: 47.60 }, { name: "Forma de Grande Macaco", price: 340.00 }] }, { name: "Soul Draw", products: [{ name: "Soul Draw x1", price: 0.07 }, { name: "Soul Draw x5", price: 0.31 }, { name: "Soul Draw x10", price: 0.65 }, { name: "Baú da Sorte", price: 0.85 }, { name: "Soul Draw x50", price: 3.37 }, { name: "Soul Draw x99", price: 6.77 }, { name: "ULTRA Soul Draw x1", price: 22.75 }] }, { name: "Pedras Permanentes", products: [{ name: "Pedra Permanente Incomum", price: 2.69 }, { name: "Pedra Perma Rara", price: 5.41 }, { name: "Epic Perma Stone", price: 11.19 }, { name: "Pedra Permanente Lendária", price: 16.97 }, { name: "Pedra Zenkai Perma", price: 33.97 }] }] },
      { name: "Rebirth Champions: Ultimate", emoji: "🏅", group: "Simuladores & RPG", categories: [{ name: "Gamepass", products: [{ name: "Auto Clicker", price: 2.69 }, { name: "Auto Rebirth", price: 5.07 }, { name: "Mega Sorte", price: 6.77 }, { name: "+2 Equipamento para Pet", price: 6.77 }, { name: "Abertura de Ovos Mais Rápida", price: 10.17 }, { name: "Fazendeiro Insano", price: 10.17 }, { name: "Ovo Extra", price: 13.57 }, { name: "Lenhador Insano", price: 13.57 }, { name: "Moedas de Masmorra", price: 13.57 }, { name: "Moedas Espaciais", price: 13.57 }, { name: "+3 Equipamento para Pet", price: 13.57 }, { name: "Mega Fragmentos da Sorte", price: 13.57 }, { name: "VIP", price: 20.37 }, { name: "Caçador de Segredos", price: 27.17 }, { name: "Ultra Sorte", price: 27.17 }, { name: "Caçador Brilhante", price: 27.17 }, { name: "Ovos Mágicos", price: 27.17 }, { name: "Caçador Divino", price: 27.17 }, { name: "Compre Todos os Gamepasses", price: 237.25 }] }] },
      { name: "Saber Simulator", emoji: "🔱", group: "Simuladores & RPG", categories: [{ name: "Gamepass", products: [{ name: "x2 Velocidade", price: 1.67 }, { name: "Sorte", price: 5.07 }, { name: "VIP Melhorado 2", price: 6.77 }, { name: "Hatch Automático", price: 6.77 }, { name: "VIP Melhorado", price: 6.77 }, { name: "x2 Saúde", price: 10.17 }, { name: "Dano x2 e Acertos em Chefes", price: 10.17 }, { name: "+350 Pet Inv", price: 10.17 }, { name: "Hatch Triplo", price: 11.87 }, { name: "x2 Moedas", price: 13.57 }, { name: "Fast Hatch", price: 13.57 }, { name: "x2 Pontos de Elemento", price: 13.57 }, { name: "Força x2", price: 13.57 }, { name: "+1 Equipamento para Pet", price: 16.97 }, { name: "Turbo Auto Swing", price: 16.97 }, { name: "Balanço Rápido", price: 16.97 }, { name: "DNA Infinito", price: 30.57 }, { name: "Sabre Duplo x2", price: 33.97 }] }] },
      { name: "Tap Simulator", emoji: "👆", group: "Simuladores & RPG", categories: [{ name: "Gamepass", products: [{ name: "+100 Slots", price: 2.69 }, { name: "Hatch Rápido!", price: 3.23 }, { name: "Ovos da Sorte!", price: 5.07 }, { name: "Auto Rebirth", price: 6.77 }, { name: "+2 Equipamento para Pet", price: 8.47 }, { name: "+250 Vagas", price: 11.87 }, { name: "Super Sortudo!", price: 22.07 }, { name: "Renascimento Ilimitado", price: 23.77 }, { name: "+4 Equipamento para Pet", price: 25.47 }, { name: "Octo Hatch", price: 28.87 }, { name: "Caçador Secreto", price: 50.97 }, { name: "Ovos Mágicos!", price: 54.37 }] }] },
      { name: "Sol's RNG", emoji: "🎲", group: "Simuladores & RPG", categories: [{ name: "Gamepass", products: [{ name: "Teletransportador de Mercador", price: 1.36 }, { name: "Pacote Inicial", price: 1.67 }, { name: "Engrenagem Invisível", price: 2.72 }, { name: "Quick Roll", price: 3.40 }, { name: "VIP", price: 8.47 }, { name: "VIP+", price: 11.90 }] }, { name: "Pacotes de Atualização", products: [{ name: "Pacote Alpha", price: 5.10 }, { name: "Pacote Beta", price: 8.50 }, { name: "Pacote Gamma", price: 15.30 }, { name: "Pacote Delta", price: 25.50 }] }] },
      { name: "The Forge", emoji: "🔨", group: "Simuladores & RPG", categories: [{ name: "Gamepass", products: [{ name: "Depósito Duplo", price: 8.47 }, { name: "Forja Rápida", price: 10.17 }, { name: "Venda em Qualquer Lugar", price: 11.87 }, { name: "Apoiador", price: 12.89 }, { name: "Forja de Batata", price: 15.27 }, { name: "Forje em Qualquer Lugar", price: 18.67 }] }, { name: "Totens", products: [{ name: "3 Totem de XP", price: 4.39 }, { name: "3 Totem da Vitalidade", price: 5.75 }, { name: "3 Totem da Sorte", price: 5.75 }, { name: "3 Totem de Mineiro", price: 5.75 }, { name: "3 Totem do Guerreiro", price: 5.75 }] }] },
      // ==================== AVENTURA & DIVERSOS ====================
      { name: "Blox Fruits", emoji: "🍎", group: "Aventura & Diversos", categories: [{ name: "Gamepass", products: [{ name: "Foguete", price: 1.70 }, { name: "Gire", price: 2.55 }, { name: "Lâmina", price: 3.40 }, { name: "Primavera", price: 6.12 }, { name: "Bomba", price: 7.48 }, { name: "Fumo", price: 8.50 }, { name: "Lanchas Rápidas", price: 11.90 }, { name: "2x Chance de Drop do Chefe", price: 11.90 }, { name: "Spike", price: 12.92 }, { name: "+1 Armazém de Frutas", price: 13.60 }, { name: "Maestria 2x", price: 15.30 }, { name: "2x Dinheiro", price: 15.30 }, { name: "Chama", price: 18.70 }, { name: "Notificador de Frutas", price: 91.80 }] }, { name: "Frutas Permanentes", products: [{ name: "Gelo", price: 25.50 }, { name: "Areia", price: 28.90 }, { name: "Escuro", price: 32.30 }, { name: "Águia", price: 33.15 }, { name: "Diamante", price: 34.00 }, { name: "Luz", price: 37.40 }, { name: "Lâmina Negra", price: 40.80 }, { name: "Borracha", price: 40.80 }, { name: "Fantasma", price: 43.35 }, { name: "Magma", price: 44.20 }, { name: "Terremoto", price: 51.00 }, { name: "Buda", price: 56.10 }, { name: "Amor", price: 57.80 }, { name: "Criação", price: 59.50 }, { name: "Aranha", price: 61.20 }, { name: "Som", price: 64.60 }, { name: "Phoenix", price: 68.00 }, { name: "Portal", price: 68.00 }, { name: "Relâmpago", price: 71.40 }, { name: "Dor", price: 74.80 }, { name: "Blizzard", price: 76.50 }, { name: "Gravidade", price: 78.20 }, { name: "Mamute", price: 79.90 }, { name: "T-Rex", price: 79.90 }, { name: "Massa", price: 81.60 }, { name: "Sombra", price: 82.45 }, { name: "Venom", price: 83.30 }, { name: "Gás", price: 85.00 }, { name: "Spirit", price: 86.70 }, { name: "Yeti", price: 101.97 }, { name: "Tigre", price: 102.00 }, { name: "Kitsune", price: 136.00 }, { name: "Controle", price: 136.00 }, { name: "Dragão", price: 170.00 }] }] },
      { name: "Blue Lock: Rivals", emoji: "⚽", group: "Aventura & Diversos", categories: [{ name: "Gamepass", products: [{ name: "Pular Giro", price: 3.37 }, { name: "Servidores Privados", price: 3.40 }, { name: "Roupas do Despertar", price: 5.07 }, { name: "Som do Gol", price: 5.07 }, { name: "Som de Quebra de Tornozelo", price: 5.07 }, { name: "Emotes Tóxicos", price: 6.77 }, { name: "Emotes de Anime", price: 13.57 }, { name: "VIP", price: 16.97 }] }, { name: "Slots de Style", products: [{ name: "Slot de Styles 2", price: 3.84 }, { name: "Slot de Styles 3", price: 7.79 }, { name: "Slot de Styles 4", price: 10.17 }, { name: "Slot de Styles 5", price: 12.89 }, { name: "Slot de Styles 6", price: 15.27 }, { name: "Slot de Styles 7", price: 16.97 }] }, { name: "Slots de Flow", products: [{ name: "Slot de Flow 2", price: 3.84 }, { name: "Slot de Flow 3", price: 7.65 }, { name: "Slot de Flow 4", price: 10.17 }, { name: "Slot de Flow 5", price: 12.89 }, { name: "Slot de Flow 6", price: 15.27 }, { name: "Slot de Flow 7", price: 16.97 }] }] },
      { name: "Brookhaven", emoji: "🏘️", group: "Aventura & Diversos", categories: [{ name: "Gamepass", products: [{ name: "Melhoria de Veículo", price: 1.02 }, { name: "Fogo sob Demanda", price: 1.70 }, { name: "Melhoria de Cavalo", price: 3.37 }, { name: "Cobertura", price: 5.10 }, { name: "Música Desbloqueada", price: 6.77 }, { name: "Desbloqueio de Velocidade do Veículo", price: 6.77 }, { name: "Premium", price: 9.35 }, { name: "Pacote Barco", price: 10.17 }, { name: "Pacote de Temas", price: 10.17 }, { name: "Personalização de Veículos", price: 13.57 }, { name: "Passe de Desastre", price: 16.97 }, { name: "Terreno Desbloqueado", price: 16.97 }, { name: "Pacote de Veículos", price: 27.17 }, { name: "Imóveis Desbloqueados", price: 27.17 }, { name: "VIP", price: 33.97 }] }] },
      { name: "Fisch", emoji: "🎣", group: "Aventura & Diversos", categories: [{ name: "Gamepass", products: [{ name: "Pacote", price: 3.37 }, { name: "Pacote de Emoções", price: 3.37 }, { name: "Rádio", price: 5.07 }, { name: "Suportador", price: 5.75 }, { name: "Encantar em Qualquer Lugar", price: 8.13 }, { name: "XP Duplo", price: 8.13 }, { name: "Sorte dos Avaliadores", price: 10.17 }, { name: "Gerar Barco em Qualquer Lugar", price: 10.17 }, { name: "Vender em Qualquer Lugar", price: 13.57 }, { name: "Disponível em Qualquer Lugar", price: 16.97 }] }] },
      { name: "Fish It! 🐟", emoji: "🐠", group: "Aventura & Diversos", categories: [{ name: "Gamepass", products: [{ name: "Pequena Sorte", price: 1.70 }, { name: "XP em Dobro", price: 6.63 }, { name: "Mini Hoverboat", price: 7.65 }, { name: "Sorte Extra", price: 8.33 }, { name: "+Mutações", price: 10.03 }, { name: "Venda em Qualquer Lugar", price: 10.71 }, { name: "Prancha de Surf Magma", price: 13.57 }, { name: "VIP + Sorte", price: 15.13 }, { name: "Jetski Etéreo", price: 16.97 }, { name: "Sorte Avançada", price: 18.53 }, { name: "Espada Etérea", price: 30.57 }, { name: "Foice Crescendo", price: 30.57 }, { name: "Pacote Hiper Barco", price: 33.97 }] }] },
      { name: "Forsaken", emoji: "💀", group: "Aventura & Diversos", categories: [{ name: "Gamepass", products: [{ name: "Roda de Emotes Adicional", price: 6.77 }, { name: "VIP", price: 27.17 }] }, { name: "Pontos", products: [{ name: "+250 Pontos", price: 3.40 }, { name: "+500 Pontos", price: 6.80 }, { name: "+1.000 Pontos", price: 13.60 }, { name: "+2.000 Pontos", price: 27.20 }, { name: "+5.000 Pontos", price: 68.00 }, { name: "+10.000 Pontos", price: 132.60 }, { name: "+20.000 Pontos", price: 258.40 }] }] },
      { name: "INK GAME", emoji: "🖊️", group: "Aventura & Diversos", categories: [{ name: "Gamepass", products: [{ name: "Páginas de Emotes", price: 6.77 }, { name: "Etiqueta de Jogador Personalizada", price: 6.77 }, { name: "Contagem de Votos 2x", price: 8.47 }, { name: "Servidor Privado +", price: 16.97 }, { name: "Fabricante de Vidro Vision", price: 22.07 }, { name: "VIP", price: 22.07 }, { name: "Guarda Permanente", price: 27.17 }] }, { name: "Boosts", products: [{ name: "Boost 0 ao 1", price: 3.37 }, { name: "Boost 1 ao 2", price: 5.07 }, { name: "Boost 2 ao 3", price: 6.77 }, { name: "Boost 3 ao 4", price: 8.47 }, { name: "Boost 4 ao 5", price: 10.17 }, { name: "Boost 5 ao 6", price: 20.37 }] }, { name: "Moedas", products: [{ name: "95 Milhões", price: 6.77 }, { name: "200 Milhões", price: 13.57 }, { name: "260 Milhões", price: 16.97 }, { name: "456 Milhões", price: 27.17 }, { name: "1 Bilhão", price: 50.97 }] }] },
      { name: "Steal a Brainrot", emoji: "🧠", group: "Aventura & Diversos", categories: [{ name: "Gamepass", products: [{ name: "Mítico", price: 5.95 }, { name: "Blackhole Slap", price: 6.77 }, { name: "2X Dinheiro", price: 10.17 }, { name: "Tapete Voador", price: 12.75 }, { name: "VIP", price: 16.97 }, { name: "Deus da Podridão Cerebral", price: 20.37 }, { name: "Pistola a Laser", price: 25.47 }, { name: "Ban Hammer", price: 50.97 }, { name: "Segredo", price: 81.57 }, { name: "Painel Administrativo", price: 254.97 }] }] },
      { name: "King Legacy", emoji: "👑", group: "Aventura & Diversos", categories: [{ name: "Gamepass", products: [{ name: "Pose Legado", price: 11.90 }, { name: "+1 Armazém de Frutas", price: 12.75 }, { name: "Barco Caixão", price: 17.00 }, { name: "2x Drop", price: 25.50 }, { name: "2x Dinheiro", price: 34.00 }, { name: "Lâmina Noturna", price: 34.00 }, { name: "+1 Slot (Passivo)", price: 34.00 }, { name: "Posição de Fruta", price: 85.00 }, { name: "Conquistador", price: 85.00 }] }] },
    ];

    await Catalog.insertMany(games);
    res.json({ ok: true, msg: `✅ ${games.length} jogos inseridos com sucesso!` });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

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

// PATCH — mesclar configuração
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

app.listen(PORT, "0.0.0.0", () => {
  console.log(`API ativa na porta ${PORT} (GET/PATCH /api/config)`);
});
