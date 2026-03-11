// Discord Bot — comandos de prefixo ... (ex: ...grupo, ...menu, ...duvidas)
// e Slash Commands (/prompt, /calcular, /aprovar, /entregar, /entregue)
require("dotenv").config();

const {
  Client,
  Collection,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const path = require("path");
const fs = require("fs");
const { loadConfig } = require("./config-loader");
const { connectDB } = require("./db");
const { registerCommands } = require("./register-commands");

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

// ========== CARREGAR SLASH COMMANDS ==========
client.commands = new Collection();
const commandsDir = path.join(__dirname, "commands");
for (const file of fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"))) {
  const cmd = require(path.join(commandsDir, file));
  client.commands.set(cmd.data.name, cmd);
}

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
client.once("clientReady", async () => {
  console.log(`Bot online: ${client.user.tag} — prefixo: ${PREFIX}comando`);
  try {
    await registerCommands();
  } catch (err) {
    console.warn("Aviso: Falha ao registrar slash commands. Verifique as variáveis DISCORD_CLIENT_ID e DISCORD_BOT_TOKEN:", err);
  }
});

// Listener de comandos de prefixo (ex: ...grupo, ...menu)
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const command = message.content.slice(PREFIX.length).trim().toLowerCase();
  if (!command) return;

  const normalizeCmd = (c) => (c || "").toLowerCase().replace(/-/g, "");

  const config = await getConfigFromAPI();
  const panels = Array.isArray(config.panels) ? config.panels : [];
  const panel = panels.find((p) => normalizeCmd(p.command) === normalizeCmd(command));

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

  const validOptions = options
    .filter(
      (opt) =>
        opt &&
        opt.label &&
        opt.label.trim().length >= 1 &&
        opt.value &&
        opt.value.trim().length >= 1
    )
    .slice(0, 25)
    .map((opt) => {
      const item = {
        label: opt.label.trim().slice(0, 100),
        value: opt.value.trim().slice(0, 100),
      };
      if (opt.description && opt.description.trim().length > 0) {
        item.description = opt.description.trim().slice(0, 100);
      }
      if (opt.emoji) {
        item.emoji = opt.emoji;
      }
      return item;
    });

  try {
    if (validOptions.length > 0) {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`panel_select_${panel.id}`)
        .setPlaceholder(menu.placeholder || "📌 Escolha uma opção...")
        .addOptions(validOptions);

      const row = new ActionRowBuilder().addComponents(selectMenu);
      await message.channel.send({ embeds: [embed], components: [row] });
    } else if (options.length > 0) {
      const errorEmbed = new EmbedBuilder()
        .setTitle("⚠️ Configuração inválida")
        .setDescription(
          "Nenhuma opção válida encontrada. Verifique as opções no painel e certifique-se de que label e value estão preenchidos."
        )
        .setColor(0xff0000);
      await message.channel.send({ embeds: [errorEmbed] });
    } else {
      await message.channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Erro ao montar menu:", err);
    await message.channel.send({
      content: "Erro ao montar o menu. Verifique a configuração no painel.",
    });
  }
});

// Handler do dropdown (SelectMenu) e Slash Commands
client.on("interactionCreate", async (interaction) => {
  // ===== Slash Commands =====
  if (interaction.isChatInputCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;
    try {
      await command.execute(interaction, client);
    } catch (err) {
      console.error(`[slash/${interaction.commandName}] Erro:`, err);
      const reply = { content: "❌ Ocorreu um erro ao executar este comando.", ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply(reply).catch(() => {});
      } else {
        await interaction.reply(reply).catch(() => {});
      }
    }
    return;
  }

  // ===== Select Menu (prefixo) =====
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

  // Build description, optionally appending video
  let description = embedData.description || "";
  if (embedData.video) {
    const videoLine = `\n\n🎥 ${embedData.video}`;
    if (description.length + videoLine.length <= 4096) {
      description = description + videoLine;
    } else {
      const maxDescLen = 4096 - videoLine.length;
      if (maxDescLen > 0) {
        description = description.slice(0, maxDescLen) + videoLine;
      }
    }
  }

  const embed = new EmbedBuilder()
    .setTitle(embedData.title || selectedValue)
    .setDescription(description)
    .setColor(color);

  // URL do título
  if (embedData.url) embed.setURL(embedData.url);

  // Author
  if (embedData.author?.name && embedData.author.name.trim().length > 0) {
    const authorData = { name: embedData.author.name.trim() };
    if (embedData.author.url) authorData.url = embedData.author.url;
    if (embedData.author.iconUrl) authorData.iconURL = embedData.author.iconUrl;
    embed.setAuthor(authorData);
  }

  // Image / Thumbnail
  if (embedData.image) embed.setImage(embedData.image);
  if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);

  // Fields
  if (Array.isArray(embedData.fields)) {
    const validFields = embedData.fields
      .filter(
        (f) =>
          f &&
          f.name &&
          f.name.trim().length > 0 &&
          f.value &&
          f.value.trim().length > 0
      )
      .slice(0, 25)
      .map((f) => ({
        name: f.name.trim().slice(0, 256),
        value: f.value.trim().slice(0, 1024),
        inline: Boolean(f.inline),
      }));
    if (validFields.length > 0) embed.addFields(validFields);
  }

  // Footer and Timestamp
  if (embedData.footer?.text && embedData.footer.text.trim().length > 0) {
    const footerData = { text: embedData.footer.text.trim() };
    if (embedData.footer.iconUrl) footerData.iconURL = embedData.footer.iconUrl;
    embed.setFooter(footerData);
    if (embedData.footer.timestamp) {
      if (
        embedData.footer.timestamp === "now" ||
        embedData.footer.timestamp === "agora"
      ) {
        embed.setTimestamp();
      } else {
        const ts = new Date(embedData.footer.timestamp);
        if (!isNaN(ts.getTime())) {
          embed.setTimestamp(ts);
        } else {
          console.warn(`[embed] Timestamp inválido ignorado: "${embedData.footer.timestamp}"`);
        }
      }
    }
  } else {
    embed.setFooter({ text: `Solicitado por ${interaction.user.tag}` }).setTimestamp();
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
});

// ========== SERVIDOR HTTP (porta do Railway = process.env.PORT) ==========
require("./api");

// ========== CONECTAR AO MONGODB E INICIAR BOT ==========
connectDB().then(() => {
  client.login(BOT_TOKEN).catch((err) => {
    console.error("Erro ao conectar. Verifique o token no .env.");
    console.error(err);
    process.exit(1);
  });
});
