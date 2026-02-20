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

function getEmbedForOption(value, user) {
  const cfg = getConfig();
  const opts = cfg.options || [];
  const embedsConfig = cfg.embeds || {};
  const data = embedsConfig[value] || embedsConfig.ajuda || { title: "Info", description: "...", color: "5865f2" };

  const color = parseInt(String(data.color || "5865f2").replace(/^#/, ""), 16);
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(data.title || value)
    .setDescription(data.description || "")
    .setFooter({ text: `Solicitado por ${user.tag}` })
    .setTimestamp();
  return embed;
}

function createMenuRow() {
  const cfg = getConfig();
  const options = cfg.options || [];
  const placeholder = (cfg.menu && cfg.menu.placeholder) || "📌 Escolha uma opção...";

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("main_menu")
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

function createMainEmbed() {
  const cfg = getConfig();
  const menu = cfg.menu || {};
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
      .setDescription("Abre o menu principal com dropdown (tudo em um servidor)"),
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

  // Inicia a API para o site Lovable configurar o bot (opcional)
  if (process.env.CONFIG_API_KEY) {
    require("./api");
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isChatInputCommand() && interaction.commandName === "menu") {
    await interaction.reply({
      embeds: [createMainEmbed()],
      components: [createMenuRow()],
    });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === "main_menu") {
    const selected = interaction.values[0];
    const embed = getEmbedForOption(selected, interaction.user);
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

  await message.reply({
    embeds: [createMainEmbed()],
    components: [createMenuRow()],
  });
});

// ========== INICIAR BOT ==========
client.login(BOT_TOKEN).catch((err) => {
  console.error("Erro ao conectar. Verifique o token no .env (e se regenerou o token após vazamento).");
  console.error(err);
  process.exit(1);
});
