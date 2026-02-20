require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
const { loadConfig } = require("./config-loader");
const { configEvents } = require("./config-events");
const { refreshMenus } = require("./bot-menus");

// ========== CONFIGURAÇÃO (só variáveis de ambiente — nunca coloque token no código) ==========
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;

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

// ========== EMBEDS E MENU A PARTIR DO CONFIG (editável pelo site Lovable) ==========
function getConfig() {
  return loadConfig();
}

function getPanels() {
  const cfg = getConfig();
  return cfg.panels || [];
}

function getPanelsForChannel(channelId) {
  const panels = getPanels();
  const channelPanels = panels.filter((p) => p.channelId && p.channelId === channelId);
  if (channelPanels.length > 0) return channelPanels;
  return panels.filter((p) => !p.channelId);
}

function getEmbedForOption(panelId, value, user) {
  const panels = getPanels();
  const panel = panels.find((p) => p.id === panelId);
  const embedsConfig = panel?.embeds || {};
  const data = embedsConfig[value] || { title: "Info", description: "...", color: "5865f2" };

  const color = parseInt(String(data.color || "5865f2").replace(/^#/, ""), 16);
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(data.title || value)
    .setDescription(data.description || "")
    .setFooter({ text: `Solicitado por ${user.tag}` })
    .setTimestamp();
  return embed;
}

function createMenuRow(panel) {
  const options = panel.options || [];
  if (options.length === 0) return null;
  const placeholder = (panel.menu && panel.menu.placeholder) || "📌 Escolha uma opção...";

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId(`panel_${panel.id}`)
    .setPlaceholder(placeholder)
    .addOptions(
      options.slice(0, 25).map((opt) => ({
        label: opt.label,
        value: opt.value,
        description: opt.description || "",
        emoji: opt.emoji || undefined,
      }))
    );

  return new ActionRowBuilder().addComponents(selectMenu);
}

function createPanelEmbed(panel) {
  const menu = panel.menu || {};
  return new EmbedBuilder()
    .setColor(0x5865f2)
    .setTitle(menu.mainTitle || "📋 Menu Principal")
    .setDescription(menu.mainDescription || "Use o dropdown abaixo para acessar as opções.")
    .setTimestamp();
}

// ========== COMANDO SLASH /menu ==========
async function registerCommands() {
  const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
  const commands = [
    new SlashCommandBuilder()
      .setName("menu")
      .setDescription("Abre o menu deste canal (dúvidas, produtos, etc.)"),
  ].map((cmd) => cmd.toJSON());

  try {
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("Comandos slash registrados.");
  } catch (e) {
    console.warn("Aviso: não foi possível registrar comandos globais.", e.message);
  }
}

// ========== EVENTOS ==========
client.once("ready", async () => {
  console.log(`Bot online: ${client.user.tag}`);
  await registerCommands();
  await refreshMenus(client, createPanelEmbed, createMenuRow);
});

configEvents.on("saved", async () => {
  await refreshMenus(client, createPanelEmbed, createMenuRow);
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "menu") {
    const panels = getPanelsForChannel(interaction.channelId);
    if (panels.length === 0) {
      await interaction.reply({ content: "Nenhum painel configurado para este canal.", ephemeral: true });
      return;
    }
    await interaction.deferReply();
    for (let i = 0; i < panels.length; i++) {
      const panel = panels[i];
      const payload = {
        embeds: [createPanelEmbed(panel)],
      };
      const row = createMenuRow(panel);
      if (row) payload.components = [row];
      if (i === 0) {
        await interaction.editReply(payload);
      } else {
        await interaction.followUp(payload);
      }
    }
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId.startsWith("panel_")) {
    const panelId = interaction.customId.replace(/^panel_/, "");
    const selected = interaction.values[0];
    const embed = getEmbedForOption(panelId, selected, interaction.user);
    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
    });
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  const content = message.content.toLowerCase().trim();
  if (content !== "!menu" && content !== "?menu") return;

  const panels = getPanelsForChannel(message.channel.id);
  if (panels.length === 0) {
    await message.reply("Nenhum painel configurado para este canal.");
    return;
  }
  for (let i = 0; i < panels.length; i++) {
    const panel = panels[i];
    const payload = {
      embeds: [createPanelEmbed(panel)],
    };
    const row = createMenuRow(panel);
    if (row) payload.components = [row];
    if (i === 0) {
      await message.reply(payload);
    } else {
      await message.channel.send(payload);
    }
  }
});

// ========== SERVIDOR HTTP (porta do Railway = process.env.PORT) ==========
require("./api");

// ========== INICIAR BOT ==========
client.login(BOT_TOKEN).catch((err) => {
  console.error("Erro ao conectar. Verifique o token no .env (e se regenerou o token após vazamento).");
  console.error(err);
  process.exit(1);
});
