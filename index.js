// Discord Bot — loja (Robux + Gamepass) + painéis de menu (prefixo ...)
require("dotenv").config();

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionsBitField,
  ChannelType,
  REST,
  Routes,
  SlashCommandBuilder,
} = require("discord.js");
const { loadConfig } = require("./config-loader");
const { connectDB } = require("./db");
const Order = require("./models/Order");

// ========== CONFIGURAÇÃO ==========
const BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const PREFIX = "...";
const API_URL =
  process.env.API_URL || process.env.CONFIG_API_URL || "http://localhost:3001";
const CONFIG_API_KEY = process.env.CONFIG_API_KEY || "";

// Loja
const SHOP_CATEGORY_ID = process.env.SHOP_CATEGORY_ID || "1395903305623932979";
const ROBUX_PRICE_BRL = parseFloat(process.env.ROBUX_PRICE_BRL || "0.045");
const GAMEPASS_PRICE_BRL = parseFloat(process.env.GAMEPASS_PRICE_BRL || "0.034");
const MIN_ROBUX_QUANTITY = 99;
const PIX_KEY = process.env.PIX_KEY || "";
const PIX_MERCHANT_NAME = (process.env.PIX_MERCHANT_NAME || "Loja").slice(
  0,
  25
);
const PIX_CITY = (process.env.PIX_CITY || "Brasil").slice(0, 15);

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
      headers: CONFIG_API_KEY
        ? { Authorization: `Bearer ${CONFIG_API_KEY}` }
        : {},
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return loadConfig();
  }
}

// ========== ROBLOX API ==========
async function fetchRobloxUser(username) {
  try {
    const res = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        usernames: [username],
        excludeBannedUsers: false,
      }),
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data || data.data.length === 0) return null;
    const user = data.data[0];

    const thumbRes = await fetch(
      `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png`,
      { signal: AbortSignal.timeout(5000) }
    );
    const thumbData = thumbRes.ok ? await thumbRes.json() : { data: [] };
    const avatarUrl = thumbData.data?.[0]?.imageUrl || null;

    return {
      userId: user.id,
      username: user.name,
      displayName: user.displayName,
      avatarUrl,
    };
  } catch (err) {
    console.error("[shop] fetchRobloxUser erro (possível timeout ou API indisponível):", err.name, err.message);
    return null;
  }
}

// ========== HELPERS DA LOJA ==========

// Retorna o label legível para o tipo de produto
function getProductLabel(productType) {
  return productType === "gamepass" ? "Gamepass" : "Robux";
}

// Rejeita interação com aviso efêmero se o usuário não é o dono
async function rejectIfNotOwner(interaction, ownerId) {
  if (interaction.user.id !== ownerId) {
    await interaction.reply({
      content: "❌ Este botão não é para você.",
      ephemeral: true,
    });
    return true;
  }
  return false;
}

function buildNicknameModal(customId = "loja_modal_nickname") {
  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle("Nick do Roblox");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("nickname")
        .setLabel("Qual é o seu nick no Roblox?")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: Builderman")
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(20)
    )
  );
  return modal;
}

function buildRobloxConfirmEmbed(robloxUser) {
  return new EmbedBuilder()
    .setTitle("🔍 Confirmar Conta Roblox")
    .setDescription("Encontramos este usuário. É você?")
    .setThumbnail(robloxUser.avatarUrl)
    .addFields(
      { name: "📛 Display Name", value: robloxUser.displayName, inline: true },
      {
        name: "👤 Username",
        value: `@${robloxUser.username}`,
        inline: true,
      },
      { name: "🆔 ID", value: String(robloxUser.userId), inline: true }
    )
    .setColor(0x5865f2);
}

function calcTotal(quantity, discountAmount, productType = "robux") {
  const pricePerUnit =
    productType === "gamepass" ? GAMEPASS_PRICE_BRL : ROBUX_PRICE_BRL;
  const subtotal = quantity * pricePerUnit;
  return Math.max(0, subtotal - (discountAmount || 0));
}

function formatBRL(value) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function buildOrderEmbed(order) {
  const total = calcTotal(order.quantity, order.discountAmount, order.productType);
  const statusEmoji =
    {
      open: "🟢",
      pending_payment: "🟡",
      paid: "✅",
      awaiting_gamepass: "🔵",
      delivered: "✅",
      cancelled: "❌",
    }[order.status] || "⚪";
  const productLabel = getProductLabel(order.productType);
  return new EmbedBuilder()
    .setTitle(`${statusEmoji} Pedido de ${productLabel}`)
    .setColor(0x5865f2)
    .addFields(
      { name: "👤 Discord", value: `<@${order.userId}>`, inline: true },
      {
        name: "🎮 Roblox",
        value: `${order.robloxDisplayName} (@${order.robloxUsername})`,
        inline: true,
      },
      {
        name: "🆔 ID Roblox",
        value: String(order.robloxUserId),
        inline: true,
      },
      {
        name: "💎 Quantidade",
        value:
          order.quantity > 0 ? `${order.quantity} Robux` : "Não definida",
        inline: true,
      },
      {
        name: "🏷️ Cupom",
        value: order.couponCode || "Nenhum",
        inline: true,
      },
      {
        name: "💰 Total",
        value:
          order.quantity > 0 ? formatBRL(total) : "R$ 0,00",
        inline: true,
      }
    )
    .setFooter({ text: `Pedido #${order._id}` })
    .setTimestamp();
}

function buildOrderButtons(orderId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_qtd_${orderId}`)
      .setLabel("🔢 Alterar quantidade")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`ticket_cupom_${orderId}`)
      .setLabel("🏷️ Adicionar cupom")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`ticket_pagar_${orderId}`)
      .setLabel("💳 Ir para pagamento")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`ticket_editar_${orderId}`)
      .setLabel("✏️ Editar perfil")
      .setStyle(ButtonStyle.Secondary)
  );
}

// CRC16-CCITT para payload PIX EMV
function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
    }
  }
  return (crc & 0xffff).toString(16).toUpperCase().padStart(4, "0");
}

function generatePixPayload(pixKey, merchantName, city, amount) {
  const merchant = (merchantName || "Loja").slice(0, 25);
  const cityStr = (city || "Brasil").slice(0, 15);
  const amountStr = amount.toFixed(2);

  function tlv(tag, value) {
    return `${tag}${String(value.length).padStart(2, "0")}${value}`;
  }

  const pixInfo = tlv("00", "BR.GOV.BCB.PIX") + tlv("01", pixKey);
  const additionalData = tlv("05", "***");

  const body =
    tlv("00", "01") +
    tlv("26", pixInfo) +
    tlv("52", "0000") +
    tlv("53", "986") +
    tlv("54", amountStr) +
    tlv("58", "BR") +
    tlv("59", merchant) +
    tlv("60", cityStr) +
    tlv("62", additionalData) +
    "6304";

  return body + crc16(body);
}

async function updateTicketEmbed(guild, orderId) {
  try {
    const order = await Order.findById(orderId);
    if (!order || !order.channelId || !order.ticketMessageId) return;
    const channel = guild.channels.cache.get(order.channelId);
    if (!channel) return;
    const msg = await channel.messages.fetch(order.ticketMessageId);
    if (!msg) return;
    const embed = buildOrderEmbed(order);
    const buttons = buildOrderButtons(order._id);
    await msg.edit({ embeds: [embed], components: [buttons] });
  } catch (err) {
    console.error("[shop] Erro ao atualizar embed do ticket:", err);
  }
}

// ========== SLASH COMMANDS ==========
const slashCommands = [
  new SlashCommandBuilder()
    .setName("loja")
    .setDescription("Abre a loja de Robux e Gamepass"),
  new SlashCommandBuilder()
    .setName("pedidos-pendentes")
    .setDescription("Lista pedidos pendentes (apenas admins)")
    .setDefaultMemberPermissions(
      PermissionsBitField.Flags.Administrator.toString()
    ),
].map((c) => c.toJSON());

// ========== EVENTOS ==========
client.once("clientReady", async () => {
  console.log(`Bot online: ${client.user.tag} — prefixo: ${PREFIX}comando`);
  try {
    const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
    await rest.put(Routes.applicationCommands(CLIENT_ID), {
      body: slashCommands,
    });
    console.log("Slash commands /loja e /pedidos-pendentes registrados.");
  } catch (err) {
    console.error("[slash] Erro ao registrar slash commands:", err);
  }
});

// ========== LISTENER DE PREFIXO (ex: ...menu) ==========
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith(PREFIX)) return;

  const command = message.content.slice(PREFIX.length).trim().toLowerCase();
  if (!command) return;

  const normalizeCmd = (c) => (c || "").toLowerCase().replace(/-/g, "");

  const config = await getConfigFromAPI();
  const panels = Array.isArray(config.panels) ? config.panels : [];
  const panel = panels.find(
    (p) => normalizeCmd(p.command) === normalizeCmd(command)
  );

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
      content:
        "Erro ao montar o menu. Verifique a configuração no painel.",
    });
  }
});

// ========== HANDLER: painel select menu (existente) ==========
async function handlePanelSelect(interaction) {
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

  const color =
    parseInt(String(embedData.color || "5865f2").replace(/^#/, ""), 16) ||
    0x2b2d31;

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

  if (embedData.url) embed.setURL(embedData.url);

  if (embedData.author?.name && embedData.author.name.trim().length > 0) {
    const authorData = { name: embedData.author.name.trim() };
    if (embedData.author.url) authorData.url = embedData.author.url;
    if (embedData.author.iconUrl) authorData.iconURL = embedData.author.iconUrl;
    embed.setAuthor(authorData);
  }

  if (embedData.image) embed.setImage(embedData.image);
  if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);

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
          console.warn(
            `[embed] Timestamp inválido ignorado: "${embedData.footer.timestamp}"`
          );
        }
      }
    }
  } else {
    embed
      .setFooter({ text: `Solicitado por ${interaction.user.tag}` })
      .setTimestamp();
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ========== HANDLERS DA LOJA ==========

// /loja — exibe tela inicial "Heaven's Market" com 2 botões
async function handleLojaCommand(interaction) {
  const userId = interaction.user.id;

  const embed = new EmbedBuilder()
    .setTitle("🛒 Heaven's Market")
    .setDescription(
      "Bem-vindo à nossa loja! Escolha o produto que deseja comprar abaixo."
    )
    .addFields(
      {
        name: "🕐 Horários de Entrega",
        value: "Segunda a Sábado — 08h às 22h (BRT)",
        inline: false,
      },
      {
        name: "💬 Suporte",
        value: "Abra um ticket e nossa equipe irá te ajudar!",
        inline: false,
      }
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Heaven's Market" })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`loja_produto_robux_${userId}`)
      .setLabel("💎 Comprar Robux!")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`loja_produto_gamepass_${userId}`)
      .setLabel("🎮 Comprar Gamepass!")
      .setStyle(ButtonStyle.Success)
  );

  await interaction.reply({ embeds: [embed], components: [row] });
}

// Botão: Comprar Robux / Comprar Gamepass → cria ticket imediatamente e posta termos nele
async function handleLojaProduto(interaction, productType) {
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;

  // Verificar se a categoria existe
  const category = interaction.guild.channels.cache.get(SHOP_CATEGORY_ID);
  if (!category) {
    await interaction.editReply({
      content:
        "❌ Categoria de tickets não encontrada. Contate um admin para configurar `SHOP_CATEGORY_ID`.",
    });
    return;
  }

  // Se o usuário já tem um ticket aberto com canal válido, retorna o link ao invés de criar novo
  const existingOrder = await Order.findOne({
    guildId: interaction.guildId,
    userId,
    status: { $in: ["open", "pending_payment", "paid", "awaiting_gamepass"] },
    channelId: { $ne: null },
  });
  if (existingOrder) {
    const existingChannel = interaction.guild.channels.cache.get(existingOrder.channelId);
    if (existingChannel) {
      await interaction.editReply({
        content: `⚠️ Você já tem um ticket aberto! Vá para <#${existingOrder.channelId}>`,
      });
      return;
    }
  }

  // Remove pedidos abertos anteriores deste usuário (sem nick ainda) para evitar acúmulo
  await Order.deleteMany({
    guildId: interaction.guildId,
    userId,
    channelId: null,
  });

  const order = await Order.create({
    guildId: interaction.guildId,
    userId,
    productType: productType === "gamepass" ? "gamepass" : "robux",
    status: "open",
  });

  const me = interaction.guild.members.me;
  const adminRoles = interaction.guild.roles.cache.filter(
    (r) =>
      !r.managed &&
      r.id !== interaction.guild.id &&
      (r.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
        r.permissions.has(PermissionsBitField.Flags.Administrator))
  );

  const permissionOverwrites = [
    {
      id: interaction.guild.id,
      deny: [PermissionsBitField.Flags.ViewChannel],
    },
    {
      id: userId,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    },
  ];

  if (me) {
    permissionOverwrites.push({
      id: me.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  for (const [, role] of adminRoles) {
    permissionOverwrites.push({
      id: role.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
      ],
    });
  }

  const productLabel = getProductLabel(productType);

  try {
    const channel = await interaction.guild.channels.create({
      name: `🟢・ticket-${userId.slice(-4)}`,
      type: ChannelType.GuildText,
      parent: SHOP_CATEGORY_ID,
      permissionOverwrites,
    });

    // Postar termos dentro do ticket
    const termsEmbed = new EmbedBuilder()
      .setTitle("📜 Termos de Uso — Heaven's Market")
      .setDescription(
        `Produto: **${productLabel}**\n\n` +
          "Antes de continuar, leia os nossos termos:\n\n" +
          "• Os pedidos são processados manualmente e podem levar algumas horas.\n" +
          "• Não realizamos reembolsos após confirmação do pagamento.\n" +
          "• Você precisa fornecer o nick correto do Roblox.\n" +
          "• Ao iniciar a compra, você concorda com os termos acima.\n\n" +
          "Clique em **Inserir Nickname do Roblox** para continuar! 🚀"
      )
      .setColor(0x57f287)
      .setFooter({ text: "Heaven's Market" })
      .setTimestamp();

    const nickRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`loja_nick_${order._id}`)
        .setLabel("📝 Inserir Nickname do Roblox")
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`loja_fechar_${order._id}`)
        .setLabel("✖ Cancelar")
        .setStyle(ButtonStyle.Danger)
    );

    const ticketMsg = await channel.send({
      content: `<@${userId}>`,
      embeds: [termsEmbed],
      components: [nickRow],
    });

    await Order.findByIdAndUpdate(order._id, {
      channelId: channel.id,
      ticketMessageId: ticketMsg.id,
    });

    // Confirma ao usuário via ephemeral sem editar a mensagem home do /loja
    await interaction.editReply({
      content: `✅ Ticket criado! Vá para <#${channel.id}>`,
    });
  } catch (err) {
    console.error("[shop] Erro ao criar ticket:", err);
    await Order.findByIdAndDelete(order._id);
    await interaction.editReply({
      content: "❌ Erro ao criar ticket. Tente novamente ou contate um admin.",
    });
  }
}

// /pedidos-pendentes — lista pedidos pendentes (admin)
async function handlePedidosPendentesCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const orders = await Order.find({
    guildId: interaction.guildId,
    status: {
      $in: ["open", "pending_payment", "paid", "awaiting_gamepass"],
    },
  })
    .sort({ createdAt: -1 })
    .limit(20);

  if (orders.length === 0) {
    return interaction.editReply({
      content: "✅ Nenhum pedido pendente no momento.",
    });
  }

  const statusEmojis = {
    open: "🟢",
    pending_payment: "🟡",
    paid: "✅",
    awaiting_gamepass: "🔵",
  };

  const lines = orders.map((o) => {
    const emoji = statusEmojis[o.status] || "⚪";
    const qty = o.quantity > 0 ? `${o.quantity} Robux` : "—";
    const gamepass = o.gamepassLink ? `[Gamepass](${o.gamepassLink})` : "—";
    const ch = o.channelId ? `<#${o.channelId}>` : "sem ticket";
    return `${emoji} <@${o.userId}> | ${qty} | ${gamepass} | ${ch}`;
  });

  const embed = new EmbedBuilder()
    .setTitle("📋 Pedidos Pendentes")
    .setDescription(lines.join("\n"))
    .setColor(0xfee75c)
    .setFooter({ text: `${orders.length} pedido(s)` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// Botão: Iniciar Compra → abre modal de nick (com productType e verificação de dono)
async function handleLojaIniciarProduto(interaction, productType, ownerId) {
  if (await rejectIfNotOwner(interaction, ownerId)) return;
  await interaction.showModal(
    buildNicknameModal(`loja_modal_nickname_${productType}`)
  );
}

// Botão: Cancelar (fluxo antigo) → remove embed
async function handleLojaCancelar(interaction, ownerId) {
  if (ownerId && await rejectIfNotOwner(interaction, ownerId)) return;
  await interaction.update({
    content: "✖ Compra cancelada.",
    embeds: [],
    components: [],
  });
}

// Botão: Fechar ticket (novo fluxo) → cancela pedido e deleta canal
async function handleLojaFechar(interaction, orderId) {
  const order = await Order.findById(orderId);
  if (order) {
    if (
      order.userId !== interaction.user.id &&
      !interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)
    ) {
      await interaction.reply({
        content: "❌ Este botão não é para você.",
        ephemeral: true,
      });
      return;
    }
    await Order.findByIdAndUpdate(orderId, { status: "cancelled" });
  }

  await interaction.update({
    content: "✖ Compra cancelada. O canal será fechado em instantes...",
    embeds: [],
    components: [],
  });

  setTimeout(async () => {
    try {
      await interaction.channel.delete();
    } catch {
      // Sem permissão para deletar — ignora
    }
  }, 5000);
}

// Botão: Sim, sou eu
async function handleLojaSim(interaction, orderId) {
  await interaction.deferUpdate();

  const order = await Order.findById(orderId);
  if (!order || order.userId !== interaction.user.id) {
    return interaction.editReply({
      content: "❌ Pedido não encontrado.",
      embeds: [],
      components: [],
    });
  }

  // Novo fluxo: ticket já existe — postar embed de pedido no canal do ticket
  if (order.channelId) {
    const ticketChannel = interaction.guild.channels.cache.get(order.channelId);
    if (!ticketChannel) {
      return interaction.editReply({
        content: "❌ Canal do ticket não encontrado.",
        embeds: [],
        components: [],
      });
    }

    // Desativar botões da mensagem de termos (impede novo clique em Inserir Nickname)
    if (order.ticketMessageId) {
      try {
        const termsMsg = await ticketChannel.messages.fetch(order.ticketMessageId);
        if (termsMsg) await termsMsg.edit({ components: [] });
      } catch {
        // Ignora se não conseguir editar
      }
    }

    // Renomear canal com nick do Roblox
    try {
      const safeName = (order.robloxUsername || "usuario")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 20);
      await ticketChannel.setName(`🟢・ticket-${safeName}`);
    } catch {
      // Sem permissão para renomear — ignora
    }

    const orderEmbed = buildOrderEmbed(order);
    const buttons = buildOrderButtons(order._id);
    const newMsg = await ticketChannel.send({
      content: `<@${order.userId}>`,
      embeds: [orderEmbed],
      components: [buttons],
    });

    await Order.findByIdAndUpdate(orderId, { ticketMessageId: newMsg.id });

    return interaction.editReply({
      content: `✅ Perfil confirmado! Veja seu pedido em <#${order.channelId}>.`,
      embeds: [],
      components: [],
    });
  }

  // Fluxo legado (pedidos sem channelId): criar ticket agora
  try {
    const me = interaction.guild.members.me;
    const adminRoles = interaction.guild.roles.cache.filter(
      (r) =>
        !r.managed &&
        r.id !== interaction.guild.id &&
        (r.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
          r.permissions.has(PermissionsBitField.Flags.Administrator))
    );

    const permissionOverwrites = [
      {
        id: interaction.guild.id,
        deny: [PermissionsBitField.Flags.ViewChannel],
      },
      {
        id: interaction.user.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      },
    ];

    if (me) {
      permissionOverwrites.push({
        id: me.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ManageChannels,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      });
    }

    for (const [, role] of adminRoles) {
      permissionOverwrites.push({
        id: role.id,
        allow: [
          PermissionsBitField.Flags.ViewChannel,
          PermissionsBitField.Flags.SendMessages,
          PermissionsBitField.Flags.ReadMessageHistory,
        ],
      });
    }

    const category = interaction.guild.channels.cache.get(SHOP_CATEGORY_ID);
    if (!category) {
      return interaction.editReply({
        content:
          "❌ Categoria de tickets não encontrada. Contate um admin para configurar `SHOP_CATEGORY_ID`.",
        embeds: [],
        components: [],
      });
    }

    const safeName = (order.robloxUsername || "usuario")
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, "")
      .slice(0, 20);

    const channel = await interaction.guild.channels.create({
      name: `🟢・ticket-${safeName}`,
      type: ChannelType.GuildText,
      parent: SHOP_CATEGORY_ID,
      permissionOverwrites,
    });

    const orderEmbed = buildOrderEmbed(order);
    const buttons = buildOrderButtons(order._id);

    const msg = await channel.send({
      content: `<@${order.userId}>`,
      embeds: [orderEmbed],
      components: [buttons],
    });

    await Order.findByIdAndUpdate(orderId, {
      channelId: channel.id,
      ticketMessageId: msg.id,
    });

    await interaction.editReply({
      content: `✅ Ticket criado! Vá para <#${channel.id}>`,
      embeds: [],
      components: [],
    });
  } catch (err) {
    console.error("[shop] Erro ao criar ticket:", err);
    await interaction.editReply({
      content: "❌ Erro ao criar ticket. Tente novamente ou contate um admin.",
      embeds: [],
      components: [],
    });
  }
}

// Botão: Não sou eu → reabre modal (reutiliza orderId para atualizar)
async function handleLojaNao(interaction, orderId) {
  await interaction.showModal(
    buildNicknameModal(`loja_modal_reconfirmar_${orderId}`)
  );
}

// Botão: Alterar quantidade → abre modal
async function handleTicketQtd(interaction, orderId) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal_qtd_${orderId}`)
    .setTitle("Alterar Quantidade de Robux");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("quantidade")
        .setLabel(`Quantidade de Robux (mínimo ${MIN_ROBUX_QUANTITY})`)
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 400")
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(10)
    )
  );
  await interaction.showModal(modal);
}

// Botão: Adicionar cupom → abre modal
async function handleTicketCupom(interaction, orderId) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal_cupom_${orderId}`)
    .setTitle("Adicionar Cupom de Desconto");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("cupom")
        .setLabel("Código do cupom")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: PROMO10")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(30)
    )
  );
  await interaction.showModal(modal);
}

// Botão: Ir para pagamento → gera PIX placeholder e muda status
async function handleTicketPagar(interaction, orderId) {
  await interaction.deferUpdate();

  const order = await Order.findById(orderId);
  if (!order) {
    await interaction.followUp({
      content: "❌ Pedido não encontrado.",
      ephemeral: true,
    });
    return;
  }

  if (order.quantity < MIN_ROBUX_QUANTITY) {
    await interaction.followUp({
      content: `❌ Defina a quantidade de Robux (mínimo ${MIN_ROBUX_QUANTITY}) antes de ir para o pagamento.`,
      ephemeral: true,
    });
    return;
  }

  const total = calcTotal(order.quantity, order.discountAmount, order.productType);
  const totalFormatted = formatBRL(total);

  if (order.productType === "gamepass") {
    // Fluxo de gamepass: calcular Robux necessário para criação da gamepass
    const requiredRobux = Math.ceil(order.quantity / 0.7);

    let pixContent = "";
    if (PIX_KEY) {
      const payload = generatePixPayload(
        PIX_KEY,
        PIX_MERCHANT_NAME,
        PIX_CITY,
        total
      );
      pixContent = `\n\n**📋 Copia e Cola PIX:**\n\`\`\`\n${payload}\n\`\`\``;
    } else {
      pixContent =
        "\n\n*⚠️ Chave PIX não configurada. Entre em contato com um admin para receber os dados de pagamento.*";
    }

    const gpEmbed = new EmbedBuilder()
      .setTitle("🎮 Pagamento — Gamepass")
      .setDescription(
        `**Valor a pagar: ${totalFormatted}**\n` +
          `Quantidade: ${order.quantity} Robux Taxados\n` +
          (order.couponCode ? `Cupom: ${order.couponCode}\n` : "") +
          pixContent +
          "\n\n**Instruções para criar sua Gamepass:**\n" +
          `1. Realize o pagamento de **${totalFormatted}** via PIX.\n` +
          `2. Crie uma **Gamepass** no Roblox com valor de **${requiredRobux} Robux**.\n` +
          `3. Após criar a gamepass, clique em **Inserir Gamepass ID** abaixo.\n\n` +
          "Após o pagamento e envio do ID, nossa equipe irá completar a entrega."
      )
      .setColor(0xfee75c)
      .setTimestamp();

    const gpRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`ticket_gp_id_${orderId}`)
        .setLabel("🔗 Inserir Gamepass ID")
        .setStyle(ButtonStyle.Primary)
    );

    const updatedOrder = await Order.findByIdAndUpdate(
      orderId,
      {
        status: "pending_payment",
        totalAmount: total,
        gamepassRequiredRobux: requiredRobux,
      },
      { new: true }
    );

    try {
      if (interaction.channel) {
        const safeName = (order.robloxUsername || "usuario")
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, "")
          .slice(0, 20);
        await interaction.channel.setName(`🟡・ticket-${safeName}`);
      }
    } catch {
      // Sem permissão para renomear — ignora
    }

    await updateTicketEmbed(interaction.guild, updatedOrder._id);
    await interaction.channel.send({ embeds: [gpEmbed], components: [gpRow] });
    return;
  }

  // Fluxo de Robux: pagamento padrão via PIX
  let pixContent = "";
  if (PIX_KEY) {
    const payload = generatePixPayload(
      PIX_KEY,
      PIX_MERCHANT_NAME,
      PIX_CITY,
      total
    );
    pixContent = `\n\n**📋 Copia e Cola PIX:**\n\`\`\`\n${payload}\n\`\`\``;
  } else {
    pixContent =
      "\n\n*⚠️ Chave PIX não configurada. Entre em contato com um admin para receber os dados de pagamento.*";
  }

  const payEmbed = new EmbedBuilder()
    .setTitle("💳 Instruções de Pagamento")
    .setDescription(
      `**Valor a pagar: ${totalFormatted}**\n` +
        `Quantidade: ${order.quantity} Robux\n` +
        (order.couponCode ? `Cupom: ${order.couponCode}\n` : "") +
        pixContent +
        "\n\nApós realizar o pagamento, **aguarde a confirmação de um admin**."
    )
    .setColor(0xfee75c)
    .setTimestamp();

  const updatedOrder = await Order.findByIdAndUpdate(
    orderId,
    { status: "pending_payment", totalAmount: total },
    { new: true }
  );

  // Renomear canal para status pendente
  try {
    if (interaction.channel) {
      const safeName = (order.robloxUsername || "usuario")
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "")
        .slice(0, 20);
      await interaction.channel.setName(`🟡・ticket-${safeName}`);
    }
  } catch {
    // Sem permissão para renomear — ignora
  }

  // Atualizar embed do ticket com novo status
  await updateTicketEmbed(interaction.guild, updatedOrder._id);

  // Enviar instruções de pagamento no canal
  await interaction.channel.send({ embeds: [payEmbed] });
}

// Botão: Editar perfil → reabre modal de nick
async function handleTicketEditar(interaction, orderId) {
  await interaction.showModal(
    buildNicknameModal(`loja_modal_reeditar_${orderId}`)
  );
}

// Modal: nickname vindo do ticket (novo fluxo) ou do /loja (fluxo antigo)
async function handleModalNickname(interaction, orderId = null, productType = "robux") {
  await interaction.deferReply({ ephemeral: true });

  const nickname = interaction.fields.getTextInputValue("nickname");
  const robloxUser = await fetchRobloxUser(nickname);

  if (!robloxUser) {
    return interaction.editReply({
      content:
        "❌ Usuário Roblox não encontrado. Verifique o nick e tente novamente.",
    });
  }

  let order;
  if (orderId) {
    // Novo fluxo: atualizar pedido existente (ticket já criado)
    order = await Order.findByIdAndUpdate(
      orderId,
      {
        robloxUserId: String(robloxUser.userId),
        robloxUsername: robloxUser.username,
        robloxDisplayName: robloxUser.displayName,
      },
      { new: true }
    );
  } else {
    // Fluxo antigo: criar pedido novo
    await Order.deleteMany({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      channelId: null,
    });
    order = await Order.create({
      guildId: interaction.guildId,
      userId: interaction.user.id,
      robloxUserId: String(robloxUser.userId),
      robloxUsername: robloxUser.username,
      robloxDisplayName: robloxUser.displayName,
      productType: productType === "gamepass" ? "gamepass" : "robux",
      status: "open",
    });
  }

  if (!order) {
    return interaction.editReply({ content: "❌ Pedido não encontrado." });
  }

  const embed = buildRobloxConfirmEmbed(robloxUser);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`loja_nao_${order._id}`)
      .setLabel("❌ Não sou eu")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`loja_sim_${order._id}`)
      .setLabel("✅ Sim, sou eu")
      .setStyle(ButtonStyle.Success)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// Modal: reconfirmação de nick (clicou "Não sou eu")
async function handleModalReconfirmar(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const nickname = interaction.fields.getTextInputValue("nickname");
  const robloxUser = await fetchRobloxUser(nickname);

  if (!robloxUser) {
    return interaction.editReply({
      content:
        "❌ Usuário Roblox não encontrado. Verifique o nick e tente novamente.",
    });
  }

  const order = await Order.findByIdAndUpdate(
    orderId,
    {
      robloxUserId: String(robloxUser.userId),
      robloxUsername: robloxUser.username,
      robloxDisplayName: robloxUser.displayName,
    },
    { new: true }
  );

  if (!order) {
    return interaction.editReply({ content: "❌ Pedido não encontrado." });
  }

  const embed = buildRobloxConfirmEmbed(robloxUser);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`loja_nao_${order._id}`)
      .setLabel("❌ Não sou eu")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`loja_sim_${order._id}`)
      .setLabel("✅ Sim, sou eu")
      .setStyle(ButtonStyle.Success)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// Modal: reeditar perfil dentro do ticket
async function handleModalReeditar(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const nickname = interaction.fields.getTextInputValue("nickname");
  const robloxUser = await fetchRobloxUser(nickname);

  if (!robloxUser) {
    return interaction.editReply({
      content: "❌ Usuário Roblox não encontrado. Tente novamente.",
    });
  }

  const order = await Order.findByIdAndUpdate(
    orderId,
    {
      robloxUserId: String(robloxUser.userId),
      robloxUsername: robloxUser.username,
      robloxDisplayName: robloxUser.displayName,
    },
    { new: true }
  );

  if (!order) {
    return interaction.editReply({ content: "❌ Pedido não encontrado." });
  }

  await updateTicketEmbed(interaction.guild, orderId);
  await interaction.editReply({ content: "✅ Perfil atualizado com sucesso!" });
}

// Modal: alterar quantidade
async function handleModalQtd(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const raw = interaction.fields.getTextInputValue("quantidade");
  const qty = parseInt(raw, 10);

  if (isNaN(qty) || qty < MIN_ROBUX_QUANTITY) {
    return interaction.editReply({
      content: `❌ Quantidade inválida. O mínimo é **${MIN_ROBUX_QUANTITY} Robux**.`,
    });
  }

  const existingOrder = await Order.findById(orderId);
  if (!existingOrder) {
    return interaction.editReply({ content: "❌ Pedido não encontrado." });
  }

  const total = calcTotal(qty, 0, existingOrder.productType);
  const order = await Order.findByIdAndUpdate(
    orderId,
    {
      quantity: qty,
      totalAmount: total,
      discountAmount: 0,
      couponCode: null,
    },
    { new: true }
  );

  if (!order) {
    return interaction.editReply({ content: "❌ Pedido não encontrado." });
  }

  await updateTicketEmbed(interaction.guild, orderId);
  await interaction.editReply({
    content: `✅ Quantidade atualizada: **${qty} Robux** (${formatBRL(total)})`,
  });
}

// Modal: aplicar cupom
async function handleModalCupom(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const cupom = interaction.fields
    .getTextInputValue("cupom")
    .trim()
    .toUpperCase();

  const order = await Order.findByIdAndUpdate(
    orderId,
    { couponCode: cupom },
    { new: true }
  );

  if (!order) {
    return interaction.editReply({ content: "❌ Pedido não encontrado." });
  }

  await updateTicketEmbed(interaction.guild, orderId);
  await interaction.editReply({
    content: `✅ Cupom **${cupom}** registrado! *(Desconto será validado por um admin.)*`,
  });
}

// ========== NOVOS HANDLERS: fluxo de ticket imediato ==========

// Botão: Inserir Nickname do Roblox (dentro do ticket)
async function handleLojaNickButton(interaction, orderId) {
  const order = await Order.findById(orderId);
  if (!order) {
    await interaction.reply({ content: "❌ Pedido não encontrado.", ephemeral: true });
    return;
  }
  if (order.userId !== interaction.user.id) {
    await interaction.reply({ content: "❌ Este botão não é para você.", ephemeral: true });
    return;
  }
  await interaction.showModal(buildNicknameModal(`loja_nick_modal_${orderId}`));
}

// Botão: Inserir Gamepass ID
async function handleTicketGamepassId(interaction, orderId) {
  const modal = new ModalBuilder()
    .setCustomId(`ticket_modal_gp_id_${orderId}`)
    .setTitle("ID ou Link da Gamepass");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("gamepass_id")
        .setLabel("Link ou ID da sua Gamepass no Roblox")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: https://www.roblox.com/game-pass/1234567")
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(200)
    )
  );
  await interaction.showModal(modal);
}

// Modal: gamepass ID submetido
async function handleModalGamepassId(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const gpId = interaction.fields.getTextInputValue("gamepass_id").trim();

  const order = await Order.findByIdAndUpdate(
    orderId,
    { gamepassLink: gpId, status: "awaiting_gamepass" },
    { new: true }
  );

  if (!order) {
    return interaction.editReply({ content: "❌ Pedido não encontrado." });
  }

  await updateTicketEmbed(interaction.guild, orderId);
  await interaction.editReply({
    content:
      "✅ Gamepass registrada! Nossa equipe irá verificar e completar a entrega em breve.",
  });
}

// ========== INTERAÇÃO CENTRAL ==========
client.on("interactionCreate", async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "loja") {
        await handleLojaCommand(interaction);
      } else if (interaction.commandName === "pedidos-pendentes") {
        await handlePedidosPendentesCommand(interaction);
      }
      return;
    }

    // Botões
    if (interaction.isButton()) {
      const id = interaction.customId;
      if (id.startsWith("loja_produto_robux_")) {
        await handleLojaProduto(interaction, "robux");
      } else if (id.startsWith("loja_produto_gamepass_")) {
        await handleLojaProduto(interaction, "gamepass");
      } else if (id.startsWith("loja_nick_")) {
        await handleLojaNickButton(interaction, id.slice("loja_nick_".length));
      } else if (id.startsWith("loja_fechar_")) {
        await handleLojaFechar(interaction, id.slice("loja_fechar_".length));
      } else if (id.startsWith("loja_iniciar_robux_")) {
        // backward compat: old messages with Iniciar Compra button
        const ownerId = id.slice("loja_iniciar_robux_".length);
        await handleLojaIniciarProduto(interaction, "robux", ownerId);
      } else if (id.startsWith("loja_iniciar_gamepass_")) {
        // backward compat
        const ownerId = id.slice("loja_iniciar_gamepass_".length);
        await handleLojaIniciarProduto(interaction, "gamepass", ownerId);
      } else if (id.startsWith("loja_cancelar_")) {
        const ownerId = id.slice("loja_cancelar_".length);
        await handleLojaCancelar(interaction, ownerId);
      } else if (id === "loja_cancelar") {
        await handleLojaCancelar(interaction, null);
      } else if (id.startsWith("loja_sim_")) {
        await handleLojaSim(interaction, id.slice("loja_sim_".length));
      } else if (id.startsWith("loja_nao_")) {
        await handleLojaNao(interaction, id.slice("loja_nao_".length));
      } else if (id.startsWith("ticket_qtd_")) {
        await handleTicketQtd(interaction, id.slice("ticket_qtd_".length));
      } else if (id.startsWith("ticket_cupom_")) {
        await handleTicketCupom(interaction, id.slice("ticket_cupom_".length));
      } else if (id.startsWith("ticket_pagar_")) {
        await handleTicketPagar(interaction, id.slice("ticket_pagar_".length));
      } else if (id.startsWith("ticket_editar_")) {
        await handleTicketEditar(
          interaction,
          id.slice("ticket_editar_".length)
        );
      } else if (id.startsWith("ticket_gp_id_")) {
        await handleTicketGamepassId(
          interaction,
          id.slice("ticket_gp_id_".length)
        );
      }
      return;
    }

    // Modais
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id.startsWith("loja_nick_modal_")) {
        // Novo fluxo: nick inserido de dentro do ticket
        await handleModalNickname(
          interaction,
          id.slice("loja_nick_modal_".length),
          null
        );
      } else if (id === "loja_modal_nickname_robux") {
        await handleModalNickname(interaction, null, "robux");
      } else if (id === "loja_modal_nickname_gamepass") {
        await handleModalNickname(interaction, null, "gamepass");
      } else if (id === "loja_modal_nickname") {
        // backward compat
        await handleModalNickname(interaction, null, "robux");
      } else if (id.startsWith("loja_modal_reconfirmar_")) {
        await handleModalReconfirmar(
          interaction,
          id.slice("loja_modal_reconfirmar_".length)
        );
      } else if (id.startsWith("loja_modal_reeditar_")) {
        await handleModalReeditar(
          interaction,
          id.slice("loja_modal_reeditar_".length)
        );
      } else if (id.startsWith("ticket_modal_qtd_")) {
        await handleModalQtd(
          interaction,
          id.slice("ticket_modal_qtd_".length)
        );
      } else if (id.startsWith("ticket_modal_cupom_")) {
        await handleModalCupom(
          interaction,
          id.slice("ticket_modal_cupom_".length)
        );
      } else if (id.startsWith("ticket_modal_gp_id_")) {
        await handleModalGamepassId(
          interaction,
          id.slice("ticket_modal_gp_id_".length)
        );
      }
      return;
    }

    // Select menu de painéis (existente)
    if (
      interaction.isStringSelectMenu() &&
      interaction.customId.startsWith("panel_select_")
    ) {
      await handlePanelSelect(interaction);
    }
  } catch (err) {
    console.error("[interactionCreate] Erro:", err);
    try {
      const errMsg = { content: "❌ Ocorreu um erro inesperado.", ephemeral: true };
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp(errMsg);
      } else if (!interaction.isModalSubmit()) {
        await interaction.reply(errMsg);
      }
    } catch {
      // Ignora falhas no envio do erro
    }
  }
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
