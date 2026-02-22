// Discord Bot — comandos de prefixo ... (ex: ...grupo, ...menu, ...duvidas)
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { loadConfig } = require("./config-loader");

// ========== CONFIGURAÇÃO (só variáveis de ambiente — nunca coloque token no código) ==========
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PREFIX = "...";
const API_URL = process.env.API_URL || process.env.CONFIG_API_URL || "http://localhost:3001";
const CONFIG_API_KEY = process.env.CONFIG_API_KEY || "";

if (!BOT_TOKEN || !CLIENT_ID) {
  console.error(
    "Defina DISCORD_BOT_TOKEN e DISCORD_CLIENT_ID no arquivo .env (copie de .env.example)."
  );
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

// ========== BUSCAR CONFIG (API ou local) ==========
async function getConfigFromAPI() {
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

// ========== EVENTOS ==========
client.once("clientReady", () => {
  console.log(`Bot online: ${client.user.tag} — prefixo: ${PREFIX}comando`);
});

// Listener de comandos de prefixo (ex: ...grupo, ...menu)
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const command = message.content.slice(PREFIX.length).trim().toLowerCase();
  if (!command) return;

  const config = await getConfigFromAPI();
  const panels = Array.isArray(config.panels) ? config.panels : [];
  const panel = panels.find((p) => (p.command || "").toLowerCase() === command);

  if (!panel) {
    const lista = panels
      .map((p) => `\`${PREFIX}${p.command || "menu"}\``)
      .join(", ");
    return message.reply({
      content: `Comando não encontrado. Comandos disponíveis: ${lista}`,
    });
  }

  try {
    await message.delete();
  } catch {
    // Sem permissão para deletar — ignora
  }

  const menu = panel.menu || {};
  const embed = new EmbedBuilder()
    .setTitle(menu.mainTitle || "📋 Menu")
    .setDescription(menu.mainDescription || "Use o dropdown abaixo.")
    .setColor(0x2b2d31);

  const options = Array.isArray(panel.options) ? panel.options : [];

  if (options.length > 0) {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId(`panel_select_${panel.id}`)
      .setPlaceholder(menu.placeholder || "📌 Escolha uma opção...")
      .addOptions(
        options.slice(0, 25).map((opt) => ({
          label: opt.label,
          value: opt.value,
          description: opt.description || undefined,
          emoji: opt.emoji || undefined,
        }))
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);
    await message.channel.send({ embeds: [embed], components: [row] });
  } else {
    await message.channel.send({ embeds: [embed] });
  }
});

// Handler do dropdown (SelectMenu)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (!interaction.customId.startsWith("panel_select_")) return;

  const panelId = interaction.customId.replace("panel_select_", "");
  const selectedValue = interaction.values[0];

  const config = await getConfigFromAPI();
  const panels = Array.isArray(config.panels) ? config.panels : [];
  const panel = panels.find((p) => p.id === panelId);

  if (!panel) {
    return interaction.reply({
      content: "Painel não encontrado.",
      ephemeral: true,
    });
  }

  const embedsConfig = panel.embeds || {};
  const embedData = embedsConfig[selectedValue];

  if (!embedData) {
    return interaction.reply({
      content: "Embed não configurado para esta opção.",
      ephemeral: true,
    });
  }

  const color = parseInt(String(embedData.color || "5865f2").replace(/^#/, ""), 16) || 0x2b2d31;
  const embed = new EmbedBuilder()
    .setTitle(embedData.title || selectedValue)
    .setDescription(embedData.description || "")
    .setColor(color)
    .setFooter({ text: `Solicitado por ${interaction.user.tag}` })
    .setTimestamp();

  if (embedData.image) {
    embed.setImage(embedData.image);
  }
  if (embedData.thumbnail) {
    embed.setThumbnail(embedData.thumbnail);
  }
  if (embedData.video) {
    const currentDesc = embed.data.description || "";
    embed.setDescription(currentDesc + "\n\n" + embedData.video);
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
});

// ========== SERVIDOR HTTP (porta do Railway = process.env.PORT) ==========
require("./api");

// ========== INICIAR BOT ==========
client.login(BOT_TOKEN).catch((err) => {
  console.error("Erro ao conectar. Verifique o token no .env.");
  console.error(err);
  process.exit(1);
});
