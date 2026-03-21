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
const Catalog = require("./models/Catalog");

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
const PIX_MERCHANT_NAME = (process.env.PIX_MERCHANT_NAME || "Loja").slice(0, 25);
const PIX_CITY = (process.env.PIX_CITY || "Brasil").slice(0, 15);

// Canais de log
const CH_COMPRAS    = process.env.CH_COMPRAS    || "1395903374284554260"; // compras públicas
const CH_ENTREGAS   = process.env.CH_ENTREGAS   || "1395903375664480337"; // entregas
const CH_REFS       = process.env.CH_REFS       || "1395903376998400153"; // refs/avaliações
const CH_LOGS       = process.env.CH_LOGS       || "1395903311798075463"; // logs admins

// Estado da loja
let lojaAberta = true;

// Codex Pay
const CODEX_EMAIL = process.env.CODEX_EMAIL || "";
const CODEX_SENHA = process.env.CODEX_SENHA || "";
const CODEX_BASE  = "https://codexpay.cloud/api";

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
    GatewayIntentBits.GuildMembers,
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
    // 1. Buscar userId pelo username
    const res = await fetch("https://users.roblox.com/v1/usernames/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
      signal: AbortSignal.timeout(7000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.data || data.data.length === 0) return null;
    const user = data.data[0];

    // 2. Buscar detalhes completos (descrição, data de criação) e avatar em paralelo
    const [detailRes, thumbRes] = await Promise.allSettled([
      fetch(`https://users.roblox.com/v1/users/${user.id}`, { signal: AbortSignal.timeout(5000) }),
      fetch(
        `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${user.id}&size=150x150&format=Png`,
        { signal: AbortSignal.timeout(5000) }
      ),
    ]);

    let description = "";
    let createdAt = null;
    if (detailRes.status === "fulfilled" && detailRes.value.ok) {
      const detail = await detailRes.value.json();
      description = detail.description || "";
      createdAt = detail.created || null; // ex: "2019-11-30T13:07:56.327Z"
    }

    const thumbData =
      thumbRes.status === "fulfilled" && thumbRes.value.ok
        ? await thumbRes.value.json()
        : { data: [] };
    const avatarUrl = thumbData.data?.[0]?.imageUrl || null;

    return {
      userId: user.id,
      username: user.name,
      displayName: user.displayName,
      description,
      createdAt,
      avatarUrl,
    };
  } catch (err) {
    console.error("[shop] fetchRobloxUser erro:", err.name, err.message);
    return null;
  }
}

// ========== HELPERS ==========
function getProductLabel(productType) {
  return productType === "gamepass" ? "Gamepass" : "Robux";
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

// ========== EMBEDS & COMPONENTES ==========
function buildOrderEmbed(order) {
  const total = calcTotal(order.quantity, order.discountAmount, order.productType);
  const productLabel = getProductLabel(order.productType);
  const pricePerUnit = order.productType === "gamepass" ? GAMEPASS_PRICE_BRL : ROBUX_PRICE_BRL;

  const statusMap = {
    open: "🟢 Aguardando quantidade",
    pending_payment: "🟡 Aguardando pagamento",
    paid: "✅ Pagamento confirmado",
    awaiting_gamepass: "🔵 Aguardando Gamepass",
    delivered: "✅ Entregue",
    cancelled: "❌ Cancelado",
  };

  return new EmbedBuilder()
    .setTitle(`🎉 Carrinho de ${productLabel} — Heaven's Market`)
    .setDescription(
      `> Olá <@${order.userId}>! Defina a quantidade e siga para o pagamento.\n` +
      `> Quantidade mínima: **${MIN_ROBUX_QUANTITY} Robux** • Preço: **R$ ${pricePerUnit.toFixed(3)}/Robux**`
    )
    .setColor(0x5865f2)
    .addFields(
      {
        name: "💰 Valor Total",
        value: order.quantity > 0 ? `**${formatBRL(total)}**` : "`Defina a quantidade`",
        inline: true,
      },
      {
        name: "💎 Quantidade",
        value: order.quantity > 0 ? `**${order.quantity} Robux**` : "`Não definida`",
        inline: true,
      },
      {
        name: "🏷️ Cupom",
        value: order.couponCode ? `\`${order.couponCode}\`` : "`Nenhum`",
        inline: true,
      },
      {
        name: "👤 Roblox",
        value: order.robloxUsername
          ? `**${order.robloxDisplayName}** (@${order.robloxUsername})`
          : "`Não informado`",
        inline: true,
      },
      {
        name: "📊 Status",
        value: statusMap[order.status] || "⚪ Desconhecido",
        inline: true,
      },
    )
    .setFooter({ text: `Pedido #${order._id} • Heaven's Market` })
    .setTimestamp();
}

// Dropdown com ações do ticket (substitui múltiplos botões)
function buildTicketSelectMenu(orderId) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`ticket_action_${orderId}`)
      .setPlaceholder("⚙️ O que deseja fazer?")
      .addOptions([
        {
          label: "🔢 Alterar quantidade",
          description: "Defina a quantidade de Robux desejada",
          value: `qtd_${orderId}`,
          emoji: "🔢",
        },
        {
          label: "🏷️ Adicionar cupom",
          description: "Insira um código de desconto",
          value: `cupom_${orderId}`,
          emoji: "🏷️",
        },
        {
          label: "✏️ Editar perfil Roblox",
          description: "Corrigir o nick do Roblox",
          value: `editar_${orderId}`,
          emoji: "✏️",
        },
      ])
  );
}

// Botão de ir para pagamento (separado pois é ação principal)
function buildPayButton(orderId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`ticket_pagar_${orderId}`)
      .setLabel("💳 Ir para pagamento")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`loja_fechar_${orderId}`)
      .setLabel("✖ Cancelar Ticket")
      .setStyle(ButtonStyle.Danger)
  );
}

function buildRobloxConfirmEmbed(robloxUser) {
  // Formatar data de criação da conta
  let createdFormatted = "Não disponível";
  if (robloxUser.createdAt) {
    const d = new Date(robloxUser.createdAt);
    createdFormatted = d.toLocaleDateString("pt-BR", {
      weekday: "long", year: "numeric", month: "long", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  }

  const embed = new EmbedBuilder()
    .setTitle("🔍 Este perfil é seu?")
    .setDescription(
      "Encontramos este perfil no Roblox. Confirme se é você antes de continuar.\n" +
      "Clique em **✅ Sim, sou eu!** ou **❌ Não sou eu!** para confirmar."
    )
    .setThumbnail(robloxUser.avatarUrl)
    .addFields(
      { name: "📛 Nome", value: robloxUser.displayName, inline: true },
      { name: "👤 Usuário", value: `@${robloxUser.username}`, inline: true },
      { name: "🆔 ID", value: String(robloxUser.userId), inline: true },
      {
        name: "📝 Descrição",
        value: robloxUser.description?.trim() || "*Sem descrição*",
        inline: false,
      },
      { name: "📅 Conta criada em", value: createdFormatted, inline: false },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Verifique com atenção — o nick precisa ser exatamente o seu." });

  return embed;
}

function buildNicknameModal(customId = "loja_modal_nickname") {
  const modal = new ModalBuilder().setCustomId(customId).setTitle("Nick do Roblox");
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

// ========== TICKET: atualizar embed principal ==========
async function updateTicketEmbed(guild, orderId) {
  try {
    const order = await Order.findById(orderId);
    if (!order || !order.channelId || !order.ticketMessageId) return;
    const channel = guild.channels.cache.get(order.channelId);
    if (!channel) return;
    const msg = await channel.messages.fetch(order.ticketMessageId).catch(() => null);
    if (!msg) return;
    await msg.edit({
      embeds: [buildOrderEmbed(order)],
      components: [buildTicketSelectMenu(order._id), buildPayButton(order._id)],
    });
  } catch (err) {
    console.error("[shop] Erro ao atualizar embed do ticket:", err);
  }
}

// ========== CRIAR TICKET ==========
async function buildPermissionOverwrites(guild, userId) {
  const me = guild.members.me;
  const adminRoles = guild.roles.cache.filter(
    (r) => !r.managed && r.id !== guild.id &&
      (r.permissions.has(PermissionsBitField.Flags.ManageChannels) ||
        r.permissions.has(PermissionsBitField.Flags.Administrator))
  );
  const overwrites = [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    { id: userId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
  ];
  if (me) overwrites.push({ id: me.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels, PermissionsBitField.Flags.ReadMessageHistory] });
  for (const [, role] of adminRoles) overwrites.push({ id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] });
  return overwrites;
}

// Trava o canal para o cliente não mandar mensagem (só leitura)
async function lockChannelForUser(guild, channel, userId) {
  try {
    await channel.permissionOverwrites.edit(userId, {
      SendMessages: false,
    });
  } catch { /* ignora */ }
}

function buildTermsEmbed(userId, productType) {
  const isGamepass = productType === "gamepass";
  const emoji = isGamepass ? "🎮" : "💎";
  const label = isGamepass ? "Gamepass In-Game" : "Robux";
  return new EmbedBuilder()
    .setTitle("✨ Heaven's Market 👋")
    .setDescription(
      `> <@${userId}>, seja bem-vindo(a) ao seu carrinho de compras!\n\n` +
      `${emoji} Você está adquirindo **${label}** com segurança e praticidade.\n\n` +
      `**📋 Leia com atenção antes de continuar:**\n` +
      `> 🔶 Ao clicar em **Iniciar Compra** você concorda com os termos da loja.\n` +
      `> 🔶 As informações fornecidas são de **responsabilidade do comprador**.\n` +
      `> 🔶 Nossa equipe atua **apenas pelos canais oficiais** deste servidor.\n\n` +
      `**🔒 Segurança:**\n` +
      `> ❌ Jamais oferecemos suporte por **mensagens privadas**.\n` +
      `> ⚠️ Recebeu contato externo? **Ignore — é golpe.**`
    )
    .setColor(0x2b2d31)
    .setThumbnail("https://i.imgur.com/NxqBMbD.png")
    .setFooter({ text: "Heaven's Market • Compra 100% segura" })
    .setTimestamp();
}

async function createTicket(interaction, productType, userId) {
  const categoryChannel = interaction.guild.channels.cache.get(SHOP_CATEGORY_ID);
  if (!categoryChannel) {
    await interaction.editReply({ content: "❌ Categoria de tickets não encontrada. Contate um admin." });
    return null;
  }

  // Anti-spam
  if (checkTicketSpam(userId)) {
    await interaction.editReply({
      content: "⚠️ Você está abrindo tickets muito rápido. Aguarde alguns minutos antes de tentar novamente.",
    });
    return null;
  }

  // Ticket fantasma
  const existingOrder = await Order.findOne({
    guildId: interaction.guildId, userId,
    channelId: { $ne: null },
    status: { $in: ["open", "pending_payment", "awaiting_gamepass"] },
  });
  if (existingOrder) {
    const existingChannel = interaction.guild.channels.cache.get(existingOrder.channelId);
    if (existingChannel) {
      await interaction.editReply({ content: `⚠️ Você já tem um ticket aberto! Vá para <#${existingOrder.channelId}>` });
      return null;
    }
    await Order.findByIdAndUpdate(existingOrder._id, { status: "cancelled" });
  }
  await Order.deleteMany({ guildId: interaction.guildId, userId, channelId: null });

  const order = await Order.create({
    guildId: interaction.guildId, userId,
    productType: productType === "gamepass" ? "gamepass" : "robux",
    status: "open",
  });

  const prefix = productType === "gamepass" ? "🎮・gp" : "💎・robux";

  try {
    const channel = await interaction.guild.channels.create({
      name: `${prefix}-${userId.slice(-4)}`,
      type: ChannelType.GuildText,
      parent: SHOP_CATEGORY_ID,
      permissionOverwrites: await buildPermissionOverwrites(interaction.guild, userId),
    });

    const termsRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`terms_start_${order._id}`).setLabel("💰 Iniciar Compra").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`terms_read_${order._id}`).setLabel("📄 Ler Termos").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`loja_fechar_${order._id}`).setLabel("✖ Cancelar Compra").setStyle(ButtonStyle.Danger)
    );

    const ticketMsg = await channel.send({
      content: `<@${userId}>`,
      embeds: [buildTermsEmbed(userId, productType)],
      components: [termsRow],
    });

    await Order.findByIdAndUpdate(order._id, { channelId: channel.id, ticketMessageId: ticketMsg.id });
    // Inicia timer de inatividade
    resetInactivityTimer(channel, order._id);
    return channel;
  } catch (err) {
    console.error("[shop] Erro ao criar ticket:", err);
    await Order.findByIdAndDelete(order._id);
    return null;
  }
}

// ========== SLASH COMMANDS ==========
const slashCommands = [
  new SlashCommandBuilder()
    .setName("loja")
    .setDescription("Abre a loja de Robux e Gamepass"),
  new SlashCommandBuilder()
    .setName("calcular")
    .setDescription("Calcula o valor de Robux taxado e Gamepass")
    .addIntegerOption(opt =>
      opt.setName("robux")
        .setDescription("Quantidade de Robux desejada")
        .setRequired(true)
        .setMinValue(1)
    ),
  new SlashCommandBuilder()
    .setName("gastos")
    .setDescription("Mostra o total gasto de um usuário na loja")
    .addUserOption(opt =>
      opt.setName("usuario")
        .setDescription("Usuário para consultar (deixe vazio para ver o seu)")
        .setRequired(false)
    ),
  new SlashCommandBuilder()
    .setName("aprovar")
    .setDescription("Aprova manualmente um pedido como pago (apenas admins)")
    .addUserOption(opt => opt.setName("usuario").setDescription("Usuário dono do pedido").setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("gerarpix")
    .setDescription("Gera um PIX avulso pela Codex Pay")
    .addNumberOption(opt =>
      opt.setName("valor")
        .setDescription("Valor em reais (ex.: 49.90)")
        .setRequired(true)
        .setMinValue(0.01)
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("entregar")
    .setDescription("Confirma pagamento e registra entrega (apenas admins)")
    .addUserOption(opt => opt.setName("usuario").setDescription("Membro que receberá a entrega").setRequired(true))
    .addStringOption(opt => opt.setName("produto").setDescription("Produto entregue (ex: 400 Robux Taxados)").setRequired(true))
    .addAttachmentOption(opt => opt.setName("imagem").setDescription("Comprovante/print (opcional)").setRequired(false))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Abre ou fecha a loja")
    .addStringOption(opt =>
      opt.setName("acao")
        .setDescription("Abrir ou fechar a loja")
        .setRequired(true)
        .addChoices(
          { name: "🟢 Abrir", value: "abrir" },
          { name: "🔴 Fechar", value: "fechar" },
        )
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Gerencia o ticket atual")
    .addSubcommand(sub =>
      sub.setName("fechar")
        .setDescription("Fecha o ticket atual")
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("solicitar_avaliacao")
    .setDescription("Envia o embed de avaliação no canal atual")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("cupom")
    .setDescription("Gerencia cupons de desconto")
    .addSubcommand(sub => sub.setName("criar")
      .setDescription("Cria um cupom de desconto")
      .addStringOption(opt => opt.setName("codigo").setDescription("Código do cupom (ex: PROMO10)").setRequired(true))
      .addNumberOption(opt => opt.setName("desconto").setDescription("Valor do desconto em reais (ex: 5.00)").setRequired(true).setMinValue(0.01))
      .addIntegerOption(opt => opt.setName("usos").setDescription("Máximo de usos (0 = ilimitado)").setRequired(false))
    )
    .addSubcommand(sub => sub.setName("deletar")
      .setDescription("Deleta um cupom")
      .addStringOption(opt => opt.setName("codigo").setDescription("Código do cupom").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("listar").setDescription("Lista todos os cupons ativos"))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("Mostra o perfil e histórico de compras de um usuário")
    .addUserOption(opt => opt.setName("usuario").setDescription("Usuário (deixe vazio para ver o seu)").setRequired(false)),
  new SlashCommandBuilder()
    .setName("jogo")
    .setDescription("Gerencia jogos do catálogo")
    .addSubcommand(sub => sub.setName("adicionar")
      .setDescription("Adiciona um jogo ao catálogo")
      .addStringOption(opt => opt.setName("nome").setDescription("Nome do jogo").setRequired(true))
      .addStringOption(opt => opt.setName("emoji").setDescription("Emoji do jogo").setRequired(true))
      .addStringOption(opt => opt.setName("grupo").setDescription("Grupo (ex: Anime & Luta)").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("remover")
      .setDescription("Remove um jogo do catálogo")
      .addStringOption(opt => opt.setName("nome").setDescription("Nome exato do jogo").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("listar").setDescription("Lista todos os jogos do catálogo"))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("produto")
    .setDescription("Gerencia produtos de um jogo")
    .addSubcommand(sub => sub.setName("adicionar")
      .setDescription("Adiciona um produto a um jogo")
      .addStringOption(opt => opt.setName("jogo").setDescription("Nome do jogo").setRequired(true))
      .addStringOption(opt => opt.setName("categoria").setDescription("Categoria (ex: Gamepass, Frutas)").setRequired(true))
      .addStringOption(opt => opt.setName("nome").setDescription("Nome do produto").setRequired(true))
      .addNumberOption(opt => opt.setName("preco").setDescription("Preço em reais").setRequired(true).setMinValue(0.01))
    )
    .addSubcommand(sub => sub.setName("remover")
      .setDescription("Remove um produto de um jogo")
      .addStringOption(opt => opt.setName("jogo").setDescription("Nome do jogo").setRequired(true))
      .addStringOption(opt => opt.setName("nome").setDescription("Nome do produto").setRequired(true))
    )
    .addSubcommand(sub => sub.setName("editar")
      .setDescription("Edita o preço de um produto existente")
      .addStringOption(opt => opt.setName("jogo").setDescription("Nome do jogo").setRequired(true))
      .addStringOption(opt => opt.setName("nome").setDescription("Nome do produto").setRequired(true))
      .addNumberOption(opt => opt.setName("preco").setDescription("Novo preço em reais").setRequired(true).setMinValue(0.01))
    )
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("desconto")
    .setDescription("Aplica desconto direto em um pedido aberto")
    .addUserOption(opt => opt.setName("usuario").setDescription("Usuário dono do pedido").setRequired(true))
    .addNumberOption(opt => opt.setName("valor").setDescription("Valor do desconto em reais").setRequired(true).setMinValue(0.01))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("alterar-nick")
    .setDescription("Altera o nick Roblox de um pedido de gamepass")
    .addUserOption(opt => opt.setName("usuario").setDescription("Usuário dono do pedido").setRequired(true))
    .addStringOption(opt => opt.setName("nick").setDescription("Novo nick do Roblox").setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("reabrir")
    .setDescription("Reabre um ticket cancelado")
    .addUserOption(opt => opt.setName("usuario").setDescription("Usuário dono do pedido").setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("ping")
    .setDescription("Mostra a latência do bot e status da conexão"),
  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Mostra o ranking dos maiores compradores do servidor"),
  new SlashCommandBuilder()
    .setName("historico")
    .setDescription("Mostra o histórico de pedidos de um usuário")
    .addUserOption(opt => opt.setName("usuario").setDescription("Usuário (vazio = você mesmo)").setRequired(false)),
  new SlashCommandBuilder()
    .setName("buscar")
    .setDescription("Busca um produto no catálogo")
    .addStringOption(opt => opt.setName("produto").setDescription("Nome do produto a buscar").setRequired(true)),
  new SlashCommandBuilder()
    .setName("cancelar")
    .setDescription("Cancela um pedido com motivo")
    .addUserOption(opt => opt.setName("usuario").setDescription("Usuário dono do pedido").setRequired(true))
    .addStringOption(opt => opt.setName("motivo").setDescription("Motivo do cancelamento").setRequired(true))
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("stats")
    .setDescription("Estatísticas da loja")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
  new SlashCommandBuilder()
    .setName("pedidos-pendentes")
    .setDescription("Lista pedidos pendentes (apenas admins)")
    .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator.toString()),
].map((c) => c.toJSON());

// ========== EVENTOS ==========
client.once("clientReady", async () => {
  console.log(`Bot online: ${client.user.tag} — prefixo: ${PREFIX}comando`);
  try {
    const rest = new REST({ version: "10" }).setToken(BOT_TOKEN);
    // Limpa comandos globais antigos
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    // Registra por servidor (aparece na hora)
    await rest.put(Routes.applicationGuildCommands(CLIENT_ID, "1125234022432383037"), { body: slashCommands });
    console.log("Slash commands registrados no servidor.");
  } catch (err) {
    console.error("[slash] Erro ao registrar slash commands:", err);
  }
});

// ========== PREFIXO ==========
client.on("messageCreate", async (message) => {
  if (message.author.bot) return;

  // Reset timer de inatividade se canal é um ticket ativo
  if (inactivityTimers.has(message.channelId)) {
    const order = await Order.findOne({ channelId: message.channelId, status: { $nin: ["delivered", "cancelled"] } }).catch(() => null);
    if (order) resetInactivityTimer(message.channel, order._id);
  }

  if (!message.content.startsWith(PREFIX)) return;

  const command = message.content.slice(PREFIX.length).trim().toLowerCase();
  if (!command) return;

  const normalizeCmd = (c) => (c || "").toLowerCase().replace(/-/g, "");

  const config = await getConfigFromAPI();
  const panels = Array.isArray(config.panels) ? config.panels : [];
  const panel = panels.find((p) => normalizeCmd(p.command) === normalizeCmd(command));

  if (!panel) {
    const lista = panels.map((p) => `\`${PREFIX}${p.command || "menu"}\``).join(", ");
    return message.reply({ content: `Comando não encontrado. Comandos disponíveis: ${lista}` });
  }

  try { await message.delete(); } catch { /* sem permissão — ignora */ }

  const menu = panel.menu || {};
  const embed = new EmbedBuilder()
    .setTitle(menu.mainTitle || "📋 Menu")
    .setDescription(menu.mainDescription || "Use o dropdown abaixo.")
    .setColor(0x2b2d31);

  const options = Array.isArray(panel.options) ? panel.options : [];
  const validOptions = options
    .filter((opt) => opt?.label?.trim().length >= 1 && opt?.value?.trim().length >= 1)
    .slice(0, 25)
    .map((opt) => {
      const item = {
        label: opt.label.trim().slice(0, 100),
        value: opt.value.trim().slice(0, 100),
      };
      if (opt.description?.trim().length > 0) item.description = opt.description.trim().slice(0, 100);
      if (opt.emoji) item.emoji = opt.emoji;
      return item;
    });

  try {
    if (validOptions.length > 0) {
      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId(`panel_select_${panel.id}`)
        .setPlaceholder(menu.placeholder || "📌 Escolha uma opção...")
        .addOptions(validOptions);
      await message.channel.send({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
    } else {
      await message.channel.send({ embeds: [embed] });
    }
  } catch (err) {
    console.error("Erro ao montar menu:", err);
    await message.channel.send({ content: "Erro ao montar o menu. Verifique a configuração no painel." });
  }
});

// ========== HANDLER: painel select menu ==========
async function handlePanelSelect(interaction) {
  const panelId = interaction.customId.replace("panel_select_", "");
  const selectedValue = interaction.values[0];

  const config = await getConfigFromAPI();
  const panels = Array.isArray(config.panels) ? config.panels : [];
  const panel = panels.find((p) => p.id === panelId);

  if (!panel) return interaction.reply({ content: "Painel não encontrado.", ephemeral: true });

  const embedData = (panel.embeds || {})[selectedValue];
  if (!embedData) return interaction.reply({ content: "Embed não configurado para esta opção.", ephemeral: true });

  const color = parseInt(String(embedData.color || "5865f2").replace(/^#/, ""), 16) || 0x2b2d31;

  let description = embedData.description || "";
  if (embedData.video) {
    const videoLine = `\n\n🎥 ${embedData.video}`;
    if (description.length + videoLine.length <= 4096) description += videoLine;
  }

  const embed = new EmbedBuilder()
    .setTitle(embedData.title || selectedValue)
    .setDescription(description)
    .setColor(color);

  if (embedData.url) embed.setURL(embedData.url);
  if (embedData.author?.name?.trim().length > 0) {
    const authorData = { name: embedData.author.name.trim() };
    if (embedData.author.url) authorData.url = embedData.author.url;
    if (embedData.author.iconUrl) authorData.iconURL = embedData.author.iconUrl;
    embed.setAuthor(authorData);
  }
  if (embedData.image) embed.setImage(embedData.image);
  if (embedData.thumbnail) embed.setThumbnail(embedData.thumbnail);
  if (Array.isArray(embedData.fields)) {
    const validFields = embedData.fields
      .filter((f) => f?.name?.trim().length > 0 && f?.value?.trim().length > 0)
      .slice(0, 25)
      .map((f) => ({ name: f.name.trim().slice(0, 256), value: f.value.trim().slice(0, 1024), inline: Boolean(f.inline) }));
    if (validFields.length > 0) embed.addFields(validFields);
  }
  if (embedData.footer?.text?.trim().length > 0) {
    const footerData = { text: embedData.footer.text.trim() };
    if (embedData.footer.iconUrl) footerData.iconURL = embedData.footer.iconUrl;
    embed.setFooter(footerData);
    if (embedData.footer.timestamp) {
      if (embedData.footer.timestamp === "now" || embedData.footer.timestamp === "agora") {
        embed.setTimestamp();
      } else {
        const ts = new Date(embedData.footer.timestamp);
        if (!isNaN(ts.getTime())) embed.setTimestamp(ts);
      }
    }
  } else {
    embed.setFooter({ text: `Solicitado por ${interaction.user.tag}` }).setTimestamp();
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ========== HANDLERS DA LOJA ==========

// /loja — mensagem fixa "Heaven's Market" com 2 botões
// IMPORTANTE: a mensagem usa IDs fixos sem userId para que QUALQUER membro possa clicar
async function handleLojaCommand(interaction) {
  const embed = new EmbedBuilder()
    .setTitle("🛒 Heaven's Market")
    .setDescription(
      "Bem-vindo à nossa loja! Escolha o produto que deseja comprar abaixo."
    )
    .addFields(
      { name: "🕐 Horários de Entrega", value: "Segunda a Sábado — 08h às 22h (BRT)", inline: false },
      { name: "💬 Suporte", value: "Abra um ticket e nossa equipe irá te ajudar!", inline: false }
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Heaven's Market" })
    .setTimestamp();

  // Botões sem userId — qualquer membro pode clicar e abrir seu próprio ticket
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("loja_produto_robux")
      .setLabel("💎 Comprar Robux!")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("loja_produto_gamepass")
      .setLabel("🎮 Comprar Gamepass!")
      .setStyle(ButtonStyle.Success)
  );

  // Responde publicamente — mensagem fica no canal para todos clicarem
  await interaction.reply({ embeds: [embed], components: [row] });
}

// Botão: Comprar Robux / Comprar Gamepass
async function handleLojaProduto(interaction, productType) {
  if (!lojaAberta) {
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder()
        .setTitle("🔴 Loja Fechada")
        .setDescription("A loja está temporariamente fechada.\nVolte mais tarde ou aguarde um aviso no servidor.")
        .setColor(0xed4245)
        .setFooter({ text: "Heaven's Market" })],
    });
  }
  await interaction.deferReply({ ephemeral: true });

  const userId = interaction.user.id;
  const channel = await createTicket(interaction, productType, userId);

  if (channel) {
    await interaction.editReply({ content: `✅ Ticket criado! Vá para <#${channel.id}>` });
  }
  // Se channel é null, createTicket já enviou a mensagem de erro
}

// Botão: Inserir Nickname do Roblox (dentro do ticket)
// ========== TERMOS ==========
async function handleTermsRead(interaction, orderId) {
  await interaction.reply({
    ephemeral: true,
    embeds: [new EmbedBuilder()
      .setTitle("📄 Termos de Uso — Heaven's Market")
      .setDescription(
        "**1. Responsabilidade do Comprador**\n> As informações fornecidas são de total responsabilidade do comprador. Erros não geram reembolso.\n\n" +
        "**2. Política de Reembolso**\n> Não realizamos reembolsos após confirmação do pagamento.\n\n" +
        "**3. Prazo de Entrega**\n> Os pedidos são processados manualmente. O prazo varia conforme a demanda.\n\n" +
        "**4. Canais Oficiais**\n> Nossa equipe atua APENAS pelos canais oficiais deste servidor.\n\n" +
        "**5. Segurança**\n> Jamais oferecemos suporte por mensagens privadas. Contatos externos são golpe.\n\n" +
        "**6. Banimentos**\n> Não nos responsabilizamos por punições aplicadas pelos jogos."
      )
      .setColor(0x5865f2)
      .setFooter({ text: "Heaven's Market • Ao iniciar a compra você concorda com estes termos." })],
  });
}

async function handleTermsStart(interaction, orderId) {
  const order = await Order.findById(orderId);
  if (!order) return interaction.reply({ content: "❌ Pedido não encontrado.", ephemeral: true });
  if (order.userId !== interaction.user.id) return interaction.reply({ content: "❌ Este botão não é para você.", ephemeral: true });

  if (order.productType === "robux") {
    await interaction.showModal(buildNicknameModal(`loja_nick_modal_${orderId}`));
  } else {
    await interaction.deferUpdate();
    await showCatalogInTicket(interaction, order);
  }
}

async function handleLojaNickButton(interaction, orderId) {
  const order = await Order.findById(orderId);
  if (!order) {
    return interaction.reply({ content: "❌ Pedido não encontrado.", ephemeral: true });
  }
  if (order.userId !== interaction.user.id) {
    return interaction.reply({ content: "❌ Este botão não é para você.", ephemeral: true });
  }
  await interaction.showModal(buildNicknameModal(`loja_nick_modal_${orderId}`));
}

// Botão: Fechar ticket
async function handleLojaFechar(interaction, orderId) {
  const order = await Order.findById(orderId);
  if (order) {
    const isAdmin = interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator);
    if (order.userId !== interaction.user.id && !isAdmin) {
      return interaction.reply({ content: "❌ Este botão não é para você.", ephemeral: true });
    }
    await Order.findByIdAndUpdate(orderId, { status: "cancelled" });
  }

  await interaction.update({
    content: "✖ Compra cancelada. O canal será fechado em instantes...",
    embeds: [],
    components: [],
  });

  setTimeout(async () => {
    try { await interaction.channel.delete(); } catch { /* sem permissão — ignora */ }
  }, 5000);
}

// Modal: nickname inserido de dentro do ticket
async function handleModalNickname(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const nickname = interaction.fields.getTextInputValue("nickname");
  const robloxUser = await fetchRobloxUser(nickname);

  if (!robloxUser) {
    return interaction.editReply({
      content: "❌ Usuário Roblox não encontrado. Verifique o nick e tente novamente.",
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

  if (!order) return interaction.editReply({ content: "❌ Pedido não encontrado." });

  // Se veio do checkout do carrinho (gamepass), pula confirmação e vai direto para pagamento
  const hasCartItems = (order.cartItems || []).length > 0;
  if (order.productType === "gamepass" && hasCartItems) {
    const ticketChannel = interaction.guild.channels.cache.get(order.channelId);
    await interaction.editReply({ content: "✅ Nick confirmado! Gerando pagamento..." });
    if (ticketChannel) await sendCartPayment({ guild: interaction.guild, channel: ticketChannel }, order);
    return;
  }

  // Caso padrão: mostrar tela de confirmação
  const embed = buildRobloxConfirmEmbed(robloxUser);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`loja_nao_${order._id}`).setLabel("❌ Não sou eu").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`loja_sim_${order._id}`).setLabel("✅ Sim, sou eu").setStyle(ButtonStyle.Success)
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// Modal: reconfirmação de nick
async function handleModalReconfirmar(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const nickname = interaction.fields.getTextInputValue("nickname");
  const robloxUser = await fetchRobloxUser(nickname);

  if (!robloxUser) {
    return interaction.editReply({
      content: "❌ Usuário Roblox não encontrado. Verifique o nick e tente novamente.",
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

  if (!order) return interaction.editReply({ content: "❌ Pedido não encontrado." });

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

// Botão: Não sou eu
async function handleLojaNao(interaction, orderId) {
  await interaction.showModal(buildNicknameModal(`loja_modal_reconfirmar_${orderId}`));
}

// Botão: Sim, sou eu — bifurca por tipo de pedido
async function handleLojaSim(interaction, orderId) {
  await interaction.deferUpdate();

  const order = await Order.findById(orderId);
  if (!order || order.userId !== interaction.user.id) {
    return interaction.editReply({ content: "❌ Pedido não encontrado.", embeds: [], components: [] });
  }

  if (!order.channelId) {
    return interaction.editReply({ content: "❌ Canal do ticket não encontrado.", embeds: [], components: [] });
  }

  const ticketChannel = interaction.guild.channels.cache.get(order.channelId);
  if (!ticketChannel) {
    return interaction.editReply({ content: "❌ Canal do ticket não encontrado.", embeds: [], components: [] });
  }

  // Desativar botões da mensagem de confirmação Roblox
  if (order.ticketMessageId) {
    try {
      const termsMsg = await ticketChannel.messages.fetch(order.ticketMessageId).catch(() => null);
      if (termsMsg) await termsMsg.edit({ components: [] });
    } catch { /* ignora */ }
  }

  // ── Gamepass in-game: tem itens no carrinho ou estava no checkout ──
  const hasCartItems = (order.cartItems || []).length > 0;
  const isPendingCheckout = order.catalogProductName === "cart_checkout";

  if (order.productType === "gamepass" && (hasCartItems || isPendingCheckout)) {
    // Renomear canal
    try {
      const safeName = (order.robloxUsername || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15) || order.userId.slice(-4);
      await ticketChannel.setName(`🟢・gp-${safeName}`);
    } catch { /* ignora */ }

    await interaction.editReply({ content: "✅ Perfil confirmado!", embeds: [], components: [] });

    // Se tinha itens no carrinho, vai direto para pagamento
    if (hasCartItems) {
      await sendCartPayment({ guild: interaction.guild, channel: ticketChannel }, order);
    } else {
      // Estava no checkout sem nick — agora mostra carrinho
      await handleCatViewCart({ ...interaction, channel: ticketChannel, editReply: async (d) => ticketChannel.send(d), deferUpdate: async () => {} }, orderId);
    }
    return;
  }

  // ── Gamepass in-game: ainda não tem itens — volta ao catálogo ──
  if (order.productType === "gamepass" && !hasCartItems) {
    try {
      const safeName = (order.robloxUsername || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15) || order.userId.slice(-4);
      await ticketChannel.setName(`🟢・gp-${safeName}`);
    } catch { /* ignora */ }

    await interaction.editReply({ content: "✅ Perfil confirmado! Agora escolha os produtos.", embeds: [], components: [] });
    await showCatalogInTicket({ guild: interaction.guild, channel: ticketChannel, followUp: (d) => ticketChannel.send(d) }, order);
    return;
  }

  // ── Robux: fluxo normal ──
  try {
    const safeName = (order.robloxUsername || "usuario").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    await ticketChannel.setName(`🟢・robux-${safeName}`);
  } catch { /* ignora */ }

  const orderEmbed = buildOrderEmbed(order);
  const newMsg = await ticketChannel.send({
    content: `<@${order.userId}>`,
    embeds: [orderEmbed],
    components: [buildTicketSelectMenu(order._id), buildPayButton(order._id)],
  });

  await Order.findByIdAndUpdate(orderId, { ticketMessageId: newMsg.id });

  await interaction.editReply({
    content: `✅ Perfil confirmado! Veja seu pedido em <#${order.channelId}>.`,
    embeds: [],
    components: [],
  });
}

// Select menu do ticket: qtd / cupom / editar
async function handleTicketAction(interaction) {
  const selected = interaction.values[0];

  if (selected.startsWith("qtd_")) {
    const orderId = selected.replace("qtd_", "");
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
  } else if (selected.startsWith("cupom_")) {
    const orderId = selected.replace("cupom_", "");
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
  } else if (selected.startsWith("editar_")) {
    const orderId = selected.replace("editar_", "");
    await interaction.showModal(buildNicknameModal(`loja_modal_reeditar_${orderId}`));
  }
}

// Modal: reeditar perfil dentro do ticket
async function handleModalReeditar(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const nickname = interaction.fields.getTextInputValue("nickname");
  const robloxUser = await fetchRobloxUser(nickname);

  if (!robloxUser) {
    return interaction.editReply({ content: "❌ Usuário Roblox não encontrado. Tente novamente." });
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

  if (!order) return interaction.editReply({ content: "❌ Pedido não encontrado." });

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
  if (!existingOrder) return interaction.editReply({ content: "❌ Pedido não encontrado." });

  const total = calcTotal(qty, 0, existingOrder.productType);
  const order = await Order.findByIdAndUpdate(
    orderId,
    { quantity: qty, totalAmount: total, discountAmount: 0, couponCode: null },
    { new: true }
  );

  if (!order) return interaction.editReply({ content: "❌ Pedido não encontrado." });

  await updateTicketEmbed(interaction.guild, orderId);
  await interaction.editReply({
    content: `✅ Quantidade atualizada: **${qty} Robux** (${formatBRL(total)})`,
  });
}

// Modal: aplicar cupom
async function handleModalCupom(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const cupom = interaction.fields.getTextInputValue("cupom").trim().toUpperCase();
  const { valid, desconto } = applyCoupon(cupom);

  if (valid) {
    await Order.findByIdAndUpdate(orderId, { couponCode: cupom, discountAmount: desconto }, { new: true });
    await updateTicketEmbed(interaction.guild, orderId);
    await interaction.editReply({ content: `✅ Cupom **${cupom}** aplicado! Desconto de **${formatBRL(desconto)}**.` });
  } else {
    await interaction.editReply({ content: `❌ Cupom **${cupom}** inválido ou esgotado.` });
  }
}

// Botão: Ir para pagamento
async function handleTicketPagar(interaction, orderId) {
  await interaction.deferUpdate();

  const order = await Order.findById(orderId);
  if (!order) return interaction.followUp({ content: "❌ Pedido não encontrado.", ephemeral: true });
  if (order.quantity < MIN_ROBUX_QUANTITY) {
    return interaction.followUp({
      content: `❌ Defina a quantidade de Robux (mínimo ${MIN_ROBUX_QUANTITY}) antes de ir para o pagamento.`,
      ephemeral: true,
    });
  }

  const total = calcTotal(order.quantity, order.discountAmount, order.productType);
  const totalFormatted = formatBRL(total);

  // Renomear canal
  try {
    const safeName = (order.robloxUsername || "usuario").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20);
    if (interaction.channel) await interaction.channel.setName(`🟡・robux-${safeName}`);
  } catch { /* ignora */ }

  // Criar cobrança na Codex
  await interaction.channel.send({ content: "⏳ Gerando PIX, aguarde..." });

  const adicionais = {
    tipo_venda: "roblox",
    produtos: [{ name: "Robux Taxados", quantidade: order.quantity, preco: total }],
    info_adicionais: {
      nick: order.robloxUsername || "—",
      display: order.robloxDisplayName || "—",
      avatar_url: "https://i.imgur.com/NxqBMbD.png",
      game_name: "Robux",
    },
  };

  const codexData = await codexNewPayment(total, adicionais);

  const updatedOrder = await Order.findByIdAndUpdate(
    orderId,
    { status: "pending_payment", totalAmount: total, ...(codexData ? { codexPaymentId: codexData.id } : {}) },
    { new: true }
  );

  await updateTicketEmbed(interaction.guild, updatedOrder._id);

  if (codexData) {
    // Manda QR Code como imagem base64 + copia e cola
    const qrBuffer = Buffer.from(codexData.base64.replace("data:image/png;base64,", ""), "base64");
    const { AttachmentBuilder } = require("discord.js");
    const attachment = new AttachmentBuilder(qrBuffer, { name: "qrcode.png" });

    const embed = new EmbedBuilder()
      .setTitle("💳 Pagamento PIX")
      .addFields(
        { name: "💰 Valor", value: `**${totalFormatted}**`, inline: true },
        { name: "💎 Quantidade", value: `${order.quantity} Robux (taxados)`, inline: true },
        ...(order.couponCode ? [{ name: "🏷️ Cupom", value: `\`${order.couponCode}\``, inline: true }] : []),
      )
      .setDescription(
        `**📋 Código PIX — Copia e Cola:**\n\`\`\`\n${codexData.copiaCola}\n\`\`\`\n` +
        `> ⏱️ O QR Code tem validade de **30 minutos**.\n` +
        `> ✅ O pagamento será **confirmado automaticamente** assim que realizado.`
      )
      .setImage("attachment://qrcode.png")
      .setColor(0xfee75c)
      .setFooter({ text: "Heaven's Market • Aguardando Pagamento" })
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed], files: [attachment] });

    // Fecha canal para o cliente (só leitura enquanto aguarda pagamento)
    await lockChannelForUser(interaction.guild, interaction.channel, order.userId);

    // Inicia polling automático
    startPaymentPolling(client, interaction.guild, updatedOrder, codexData.id);
  } else {
    // Fallback PIX manual se Codex falhar
    let pixSection = PIX_KEY
      ? `\n\n**📋 Copia e Cola PIX:**\n\`\`\`\n${generatePixPayload(PIX_KEY, PIX_MERCHANT_NAME, PIX_CITY, total)}\n\`\`\``
      : "\n\n> ⚠️ *Gateway indisponível. Contate um admin.*";

    const embed = new EmbedBuilder()
      .setTitle("💳 Instruções de Pagamento — Robux")
      .addFields(
        { name: "💰 Valor", value: `**${totalFormatted}**`, inline: true },
        { name: "💎 Quantidade", value: `${order.quantity} Robux (taxados)`, inline: true },
      )
      .setDescription(pixSection)
      .setColor(0xfee75c)
      .setFooter({ text: "Heaven's Market • Aguardando Pagamento" })
      .setTimestamp();

    await interaction.channel.send({ embeds: [embed] });
  }
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

  if (!order) return interaction.editReply({ content: "❌ Pedido não encontrado." });

  await updateTicketEmbed(interaction.guild, orderId);
  await interaction.editReply({
    content: "✅ Gamepass registrada! Nossa equipe irá verificar e completar a entrega em breve.",
  });
}

// /pedidos-pendentes
async function handlePedidosPendentesCommand(interaction) {
  // FIX: verificar permissão de Administrator explicitamente
  if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Você não tem permissão para usar este comando.", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const orders = await Order.find({
    guildId: interaction.guildId,
    status: { $in: ["open", "pending_payment", "paid", "awaiting_gamepass"] },
  })
    .sort({ createdAt: -1 })
    .limit(20);

  if (orders.length === 0) {
    return interaction.editReply({ content: "✅ Nenhum pedido pendente no momento." });
  }

  const statusEmojis = { open: "🟢", pending_payment: "🟡", paid: "✅", awaiting_gamepass: "🔵" };
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

// ========== INTERAÇÃO CENTRAL ==========
client.on("interactionCreate", async (interaction) => {
  try {
    // Slash commands
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "loja") return handleLojaCommand(interaction);
      if (interaction.commandName === "calcular") return handleCalcularCommand(interaction);
      if (interaction.commandName === "gastos") return handleGastosCommand(interaction);
      if (interaction.commandName === "aprovar") return handleAprovarCommand(interaction);
      if (interaction.commandName === "ticket") return handleTicketCommand(interaction);
      if (interaction.commandName === "status") return handleStatusCommand(interaction);
      if (interaction.commandName === "cupom") return handleCupomCommand(interaction);
      if (interaction.commandName === "perfil") return handlePerfilCommand(interaction);
      if (interaction.commandName === "ranking") return handleRankingCommand(interaction);
      if (interaction.commandName === "ping") return handlePingCommand(interaction);
      if (interaction.commandName === "historico") return handleHistoricoCommand(interaction);
      if (interaction.commandName === "buscar") return handleBuscarCommand(interaction);
      if (interaction.commandName === "cancelar") return handleCancelarCommand(interaction);
      if (interaction.commandName === "stats") return handleStatsCommand(interaction);
      if (interaction.commandName === "desconto") return handleDescontoCommand(interaction);
      if (interaction.commandName === "alterar-nick") return handleAlterarNickCommand(interaction);
      if (interaction.commandName === "reabrir") return handleReabrirCommand(interaction);
      if (interaction.commandName === "jogo") return handleJogoCommand(interaction);
      if (interaction.commandName === "produto") return handleProdutoCommand(interaction);
      if (interaction.commandName === "gerarpix") return handleGerarPixCommand(interaction);
      if (interaction.commandName === "entregar") return handleEntregarCommand(interaction);
      if (interaction.commandName === "solicitar_avaliacao") return handleSolicitarAvaliacaoCommand(interaction);
      if (interaction.commandName === "pedidos-pendentes") return handlePedidosPendentesCommand(interaction);
      return;
    }

    // Botões
    if (interaction.isButton()) {
      const id = interaction.customId;

      // Mensagem /loja — botões fixos (qualquer membro clica)
      if (id === "loja_produto_robux") return handleLojaProduto(interaction, "robux");
      if (id === "loja_produto_gamepass") return handleLojaProduto(interaction, "gamepass");
      if (id.startsWith("loja_produto_robux_")) return handleLojaProduto(interaction, "robux");
      if (id.startsWith("loja_produto_gamepass_")) return handleLojaProduto(interaction, "gamepass");

      // Termos
      if (id.startsWith("terms_start_")) return handleTermsStart(interaction, id.slice("terms_start_".length));
      if (id.startsWith("terms_read_")) return handleTermsRead(interaction, id.slice("terms_read_".length));

      // Fluxo Robux / confirmação Roblox
      if (id.startsWith("loja_nick_")) return handleLojaNickButton(interaction, id.slice("loja_nick_".length));
      if (id.startsWith("loja_fechar_")) return handleLojaFechar(interaction, id.slice("loja_fechar_".length));
      if (id.startsWith("loja_sim_")) return handleLojaSim(interaction, id.slice("loja_sim_".length));
      if (id.startsWith("loja_nao_")) return handleLojaNao(interaction, id.slice("loja_nao_".length));
      if (id.startsWith("ticket_pagar_")) return handleTicketPagar(interaction, id.slice("ticket_pagar_".length));
      if (id.startsWith("ticket_gp_id_")) return handleTicketGamepassId(interaction, id.slice("ticket_gp_id_".length));

      // Carrinho in-game
      if (id.startsWith("cat_back_games_")) {
        const orderId = id.slice("cat_back_games_".length);
        const order = await Order.findById(orderId);
        if (order) { await interaction.deferUpdate(); return showCatalogInTicket(interaction, order); }
        return;
      }
      if (id.startsWith("cat_back_game_")) {
        const parts = id.split("_"); // cat_back_game_{orderId}_{gameId}
        return handleCatGame(interaction, parts[3], parts[4]);
      }
      if (id.startsWith("cat_view_cart_")) return handleCatViewCart(interaction, id.slice("cat_view_cart_".length));
      if (id.startsWith("cat_checkout_")) return handleCatCheckout(interaction, id.slice("cat_checkout_".length));
      if (id.startsWith("cat_clear_")) return handleCatClear(interaction, id.slice("cat_clear_".length));
      if (id.startsWith("cat_coupon_")) return handleCatCoupon(interaction, id.slice("cat_coupon_".length));
      if (id.startsWith("cat_not_found_")) return handleCatNotFound(interaction, id.slice("cat_not_found_".length));

      // Avaliação
      if (id.startsWith("avaliacao_")) {
        const stars = id.replace("avaliacao_", "");
        return handleAvaliacaoButton(interaction, stars);
      }

      // Backward compat legado
      if (id.startsWith("ticket_qtd_")) {
        const orderId = id.slice("ticket_qtd_".length);
        const modal = new ModalBuilder().setCustomId(`ticket_modal_qtd_${orderId}`).setTitle("Alterar Quantidade de Robux");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("quantidade").setLabel(`Quantidade mínima ${MIN_ROBUX_QUANTITY}`).setStyle(TextInputStyle.Short).setPlaceholder("Ex: 400").setRequired(true).setMinLength(2).setMaxLength(10)));
        return interaction.showModal(modal);
      }
      if (id.startsWith("ticket_cupom_")) {
        const orderId = id.slice("ticket_cupom_".length);
        const modal = new ModalBuilder().setCustomId(`ticket_modal_cupom_${orderId}`).setTitle("Adicionar Cupom");
        modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("cupom").setLabel("Código do cupom").setStyle(TextInputStyle.Short).setPlaceholder("Ex: PROMO10").setRequired(true).setMinLength(1).setMaxLength(30)));
        return interaction.showModal(modal);
      }
      if (id.startsWith("ticket_editar_")) return interaction.showModal(buildNicknameModal(`loja_modal_reeditar_${id.slice("ticket_editar_".length)}`));
      return;
    }

    // Select menus
    if (interaction.isStringSelectMenu()) {
      const cid = interaction.customId;
      if (cid.startsWith("panel_select_")) return handlePanelSelect(interaction);
      if (cid.startsWith("ticket_action_")) return handleTicketAction(interaction);

      // Catálogo carrinho
      if (cid.startsWith("cat_game_")) return handleCatGame(interaction, cid.slice("cat_game_".length), interaction.values[0]);
      if (cid.startsWith("cat_category_")) {
        const parts = cid.split("_"); // cat_category_{orderId}_{gameId}
        return handleCatCategory(interaction, parts[2], parts[3], parseInt(interaction.values[0]));
      }
      if (cid.startsWith("cat_product_")) {
        const parts = cid.split("_"); // cat_product_{orderId}_{gameId}_{categoryIndex}
        return handleCatProduct(interaction, parts[2], parts[3], parseInt(parts[4]), parseInt(interaction.values[0]));
      }
      if (cid.startsWith("cat_remove_")) return handleCatRemove(interaction, cid.slice("cat_remove_".length), parseInt(interaction.values[0]));
      return;
    }

    // Modais
    if (interaction.isModalSubmit()) {
      const id = interaction.customId;
      if (id.startsWith("loja_nick_modal_")) return handleModalNickname(interaction, id.slice("loja_nick_modal_".length));
      if (id.startsWith("loja_modal_reconfirmar_")) return handleModalReconfirmar(interaction, id.slice("loja_modal_reconfirmar_".length));
      if (id.startsWith("loja_modal_reeditar_")) return handleModalReeditar(interaction, id.slice("loja_modal_reeditar_".length));
      if (id.startsWith("ticket_modal_qtd_")) return handleModalQtd(interaction, id.slice("ticket_modal_qtd_".length));
      if (id.startsWith("ticket_modal_cupom_")) return handleModalCupom(interaction, id.slice("ticket_modal_cupom_".length));
      if (id.startsWith("ticket_modal_gp_id_")) return handleModalGamepassId(interaction, id.slice("ticket_modal_gp_id_".length));
      if (id.startsWith("cat_modal_coupon_")) return handleModalCatCoupon(interaction, id.slice("cat_modal_coupon_".length));
      if (id.startsWith("cat_modal_not_found_")) return handleModalCatNotFound(interaction, id.slice("cat_modal_not_found_".length));
      if (id.startsWith("avaliacao_modal_")) return handleAvaliacaoModal(interaction, id.replace("avaliacao_modal_", ""));
      return;
    }
  } catch (err) {
    console.error("[interactionCreate] Erro:", err);
    try {
      const errMsg = { content: "❌ Ocorreu um erro inesperado.", ephemeral: true };
      if (interaction.deferred || interaction.replied) await interaction.followUp(errMsg);
      else if (!interaction.isModalSubmit()) await interaction.reply(errMsg);
    } catch { /* ignora falhas no envio do erro */ }
  }
});


async function showCatalogInTicket(interaction, order) {
  const games = await Catalog.find({ active: true }).sort({ group: 1, name: 1 });
  if (games.length === 0) return interaction.followUp({ content: "❌ Nenhum jogo cadastrado.", ephemeral: true });

  const cartItems = order.cartItems || [];
  const cartTotal = cartItems.reduce((s, i) => s + i.price, 0);

  // Agrupa por grupo
  const grouped = {};
  for (const g of games) {
    if (!grouped[g.group]) grouped[g.group] = [];
    grouped[g.group].push(g);
  }
  const groups = Object.entries(grouped);

  const embed = new EmbedBuilder()
    .setTitle("🛒 Heaven's Market — Catálogo In-Game")
    .setDescription(
      `Selecione um jogo em uma das categorias abaixo.\n\n` +
      `📦 **${games.length} jogos** no catálogo\n` +
      `🛒 **Carrinho:** ${cartItems.length} item(s) — **${formatBRL(cartTotal)}**\n\n` +
      `> Não encontrou seu jogo? Clique em **"Não estou vendo meu jogo"**.`
    )
    .setColor(0x2b2d31)
    .setFooter({ text: "Heaven's Market • Catálogo In-Game" });

  // Um select menu por grupo (máx 5 rows = 4 menus + 1 botões)
  const components = groups.slice(0, 4).map(([groupName, groupGames]) =>
    new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`cat_game_${order._id}`)
        .setPlaceholder(`${groupName}`)
        .addOptions(groupGames.slice(0, 25).map((g) => ({
          label: `${g.emoji} ${g.name}`.slice(0, 100),
          value: String(g._id),
          description: `${g.categories.reduce((s, c) => s + c.products.length, 0)} produtos`,
        })))
    )
  );

  components.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cat_not_found_${order._id}`).setLabel("❓ Não estou vendo meu jogo").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cat_view_cart_${order._id}`).setLabel(`🛒 Carrinho (${cartItems.length})`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`loja_fechar_${order._id}`).setLabel("✖ Cancelar").setStyle(ButtonStyle.Danger)
  ));

  if (order.ticketMessageId) {
    try {
      const ch = interaction.guild.channels.cache.get(order.channelId);
      const msg = ch ? await ch.messages.fetch(order.ticketMessageId).catch(() => null) : null;
      if (msg) { await msg.edit({ embeds: [embed], components }); return; }
    } catch { /* ignora */ }
  }
  await interaction.followUp({ embeds: [embed], components });
}

async function handleCatGame(interaction, orderId, gameId) {
  await interaction.deferUpdate();
  const [game, order] = await Promise.all([Catalog.findById(gameId), Order.findById(orderId)]);
  if (!game || !order) return interaction.followUp({ content: "❌ Não encontrado.", ephemeral: true });

  if (game.categories.length === 1) return showCatProducts(interaction, order, game, 0);

  const cartItems = order.cartItems || [];
  const cartTotal = cartItems.reduce((s, i) => s + i.price, 0);

  const embed = new EmbedBuilder()
    .setTitle(`${game.emoji} ${game.name}`)
    .setDescription(
      `Selecione uma **categoria** de produto:\n\n` +
      `🛒 Carrinho: **${cartItems.length} item(s)** — **${formatBRL(cartTotal)}**`
    )
    .setColor(0x2b2d31)
    .setFooter({ text: `Heaven's Market • ${game.group}` });

  const catRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`cat_category_${orderId}_${gameId}`)
      .setPlaceholder("📂 Selecione uma categoria...")
      .addOptions(game.categories.map((cat, i) => ({
        label: cat.name, value: String(i),
        description: `${cat.products.length} produto(s) disponíveis`,
      })))
  );

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cat_back_games_${orderId}`).setLabel("⬅️ Jogos").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cat_view_cart_${orderId}`).setLabel(`🛒 Carrinho (${cartItems.length})`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`loja_fechar_${orderId}`).setLabel("✖ Cancelar").setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [catRow, backRow] });
}

async function handleCatCategory(interaction, orderId, gameId, categoryIndex) {
  await interaction.deferUpdate();
  const [game, order] = await Promise.all([Catalog.findById(gameId), Order.findById(orderId)]);
  if (!game || !order) return interaction.followUp({ content: "❌ Não encontrado.", ephemeral: true });
  await showCatProducts(interaction, order, game, categoryIndex);
}

async function showCatProducts(interaction, order, game, categoryIndex) {
  const category = game.categories[categoryIndex];
  if (!category) return interaction.followUp({ content: "❌ Categoria não encontrada.", ephemeral: true });

  const cartItems = order.cartItems || [];
  const cartTotal = cartItems.reduce((s, i) => s + i.price, 0);

  const embed = new EmbedBuilder()
    .setTitle(`${game.emoji} ${game.name} — ${category.name}`)
    .setDescription(
      `Selecione o **produto** para adicionar ao carrinho:\n\n` +
      `🛒 Carrinho: **${cartItems.length} item(s)** — **${formatBRL(cartTotal)}**`
    )
    .setColor(0x2b2d31)
    .setFooter({ text: `Heaven's Market • ${category.products.length} produtos disponíveis` });

  const prodRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`cat_product_${order._id}_${game._id}_${categoryIndex}`)
      .setPlaceholder("🛍️ Selecione um produto...")
      .addOptions(category.products.slice(0, 25).map((p, i) => ({
        label: p.name.slice(0, 100), value: String(i),
        description: `💰 R$ ${p.price.toFixed(2).replace(".", ",")}`,
      })))
  );

  const backRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cat_back_game_${order._id}_${game._id}`).setLabel("⬅️ Categorias").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cat_view_cart_${order._id}`).setLabel(`🛒 Carrinho (${cartItems.length})`).setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`loja_fechar_${order._id}`).setLabel("✖ Cancelar").setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [prodRow, backRow] });
}

async function handleCatProduct(interaction, orderId, gameId, categoryIndex, productIndex) {
  await interaction.deferUpdate();
  const [game, order] = await Promise.all([Catalog.findById(gameId), Order.findById(orderId)]);
  if (!game || !order) return interaction.followUp({ content: "❌ Não encontrado.", ephemeral: true });

  const category = game.categories[categoryIndex];
  const product = category?.products[productIndex];
  if (!product) return interaction.followUp({ content: "❌ Produto não encontrado.", ephemeral: true });

  await Order.findByIdAndUpdate(orderId, {
    $push: { cartItems: { gameName: game.name, gameEmoji: game.emoji, categoryName: category.name, productName: product.name, price: product.price, quantity: 1 } },
  });

  const updatedOrder = await Order.findById(orderId);
  const total = (updatedOrder.cartItems || []).reduce((s, i) => s + i.price, 0);
  const count = updatedOrder.cartItems.length;

  const embed = new EmbedBuilder()
    .setTitle("✅ Produto Adicionado!")
    .setDescription(
      `**${game.emoji} ${product.name}** foi adicionado ao seu carrinho.\n\n` +
      `> 💰 Preço unitário: **R$ ${product.price.toFixed(2).replace(".", ",")}**\n` +
      `> 🛒 Total do carrinho: **${formatBRL(total)}** (${count} item${count > 1 ? "s" : ""})\n\n` +
      `Deseja continuar comprando ou finalizar?`
    )
    .setColor(0x57f287)
    .setFooter({ text: "Heaven's Market • Item adicionado com sucesso" });

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cat_back_games_${orderId}`).setLabel("🛍️ Continuar Comprando").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`cat_view_cart_${orderId}`).setLabel(`🛒 Carrinho (${count})`).setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cat_checkout_${orderId}`).setLabel("💳 Finalizar Compra").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`loja_fechar_${orderId}`).setLabel("✖").setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [actionsRow] });
}

async function handleCatViewCart(interaction, orderId) {
  await interaction.deferUpdate();
  const order = await Order.findById(orderId);
  if (!order) return interaction.followUp({ content: "❌ Pedido não encontrado.", ephemeral: true });

  const items = order.cartItems || [];
  if (items.length === 0) {
    return interaction.editReply({
      embeds: [new EmbedBuilder()
        .setTitle("🛒 Carrinho Vazio")
        .setDescription("Seu carrinho está vazio. Selecione produtos para continuar.")
        .setColor(0x2b2d31)
        .setFooter({ text: "Heaven's Market" })],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`cat_back_games_${orderId}`).setLabel("🛍️ Continuar Comprando").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`loja_fechar_${orderId}`).setLabel("✖ Fechar").setStyle(ButtonStyle.Danger)
      )],
    });
  }

  const total = items.reduce((s, i) => s + i.price, 0);
  const grouped = {};
  for (const item of items) {
    if (!grouped[item.gameName]) grouped[item.gameName] = { emoji: item.gameEmoji, items: [] };
    grouped[item.gameName].items.push(item);
  }
  let cartText = "";
  for (const [name, data] of Object.entries(grouped)) {
    cartText += `${data.emoji} **${name}**\n`;
    for (const item of data.items) cartText += `> ╰ ${item.productName} — **R$ ${item.price.toFixed(2).replace(".", ",")}**\n`;
    cartText += "\n";
  }
  if (order.couponCode) cartText += `🏷️ Cupom: \`${order.couponCode}\`\n`;

  const embed = new EmbedBuilder()
    .setTitle("🛒 Seu Carrinho — Heaven's Market")
    .setDescription(cartText.trim())
    .addFields(
      { name: "📦 Itens", value: `${items.length} produto${items.length > 1 ? "s" : ""}`, inline: true },
      { name: "💰 Total", value: `**${formatBRL(total)}**`, inline: true },
    )
    .setColor(0x2b2d31)
    .setFooter({ text: "Heaven's Market • Revise seu pedido antes de pagar" })
    .setTimestamp();

  const removeRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`cat_remove_${orderId}`)
      .setPlaceholder("🗑️ Selecionar item para remover...")
      .addOptions(items.slice(0, 25).map((item, i) => ({
        label: `${item.gameName} — ${item.productName}`.slice(0, 100),
        value: String(i),
        description: `R$ ${item.price.toFixed(2).replace(".", ",")}`,
      })))
  );

  const actionsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cat_back_games_${orderId}`).setLabel("🛍️ Continuar").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cat_coupon_${orderId}`).setLabel("🏷️ Cupom").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`cat_checkout_${orderId}`).setLabel("💳 Finalizar Compra").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cat_clear_${orderId}`).setLabel("🗑️ Esvaziar").setStyle(ButtonStyle.Danger)
  );

  await interaction.editReply({ embeds: [embed], components: [removeRow, actionsRow] });
}

async function handleCatRemove(interaction, orderId, itemIndex) {
  await interaction.deferUpdate();
  const order = await Order.findById(orderId);
  if (!order) return;
  const items = [...(order.cartItems || [])];
  items.splice(itemIndex, 1);
  await Order.findByIdAndUpdate(orderId, { cartItems: items });
  await handleCatViewCart(interaction, orderId);
}

async function handleCatClear(interaction, orderId) {
  await interaction.deferUpdate();
  await Order.findByIdAndUpdate(orderId, { cartItems: [], couponCode: null, discountAmount: 0 });
  const order = await Order.findById(orderId);
  await showCatalogInTicket(interaction, order);
}

async function handleCatCoupon(interaction, orderId) {
  const modal = new ModalBuilder().setCustomId(`cat_modal_coupon_${orderId}`).setTitle("Adicionar Cupom");
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId("cupom").setLabel("Código do cupom").setStyle(TextInputStyle.Short).setPlaceholder("Ex: PROMO10").setRequired(true).setMinLength(1).setMaxLength(30)
  ));
  await interaction.showModal(modal);
}

async function handleModalCatCoupon(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });
  const cupom = interaction.fields.getTextInputValue("cupom").trim().toUpperCase();

  const { valid, desconto } = applyCoupon(cupom);
  if (valid) {
    await Order.findByIdAndUpdate(orderId, { couponCode: cupom, discountAmount: desconto });
    await interaction.editReply({ content: `✅ Cupom **${cupom}** aplicado! Desconto de **${formatBRL(desconto)}** no total.` });
  } else {
    await interaction.editReply({ content: `❌ Cupom **${cupom}** inválido ou esgotado.` });
  }
}

async function handleCatCheckout(interaction, orderId) {
  await interaction.deferUpdate();
  const order = await Order.findById(orderId);
  if (!order) return interaction.followUp({ content: "❌ Pedido não encontrado.", ephemeral: true });

  const items = order.cartItems || [];
  if (items.length === 0) return interaction.followUp({ content: "❌ Carrinho vazio! Adicione produtos antes de pagar.", ephemeral: true });

  if (!order.robloxUsername) {
    return interaction.followUp({
      ephemeral: true,
      content: "Para prosseguir, precisamos do seu nick no Roblox:",
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`loja_nick_${orderId}`).setLabel("📝 Inserir Nickname do Roblox").setStyle(ButtonStyle.Primary)
      )],
    });
  }

  await sendCartPayment({ guild: interaction.guild, channel: interaction.channel }, order);
}

async function sendCartPayment(ctx, order) {
  const guild = ctx.guild;
  const channel = ctx.channel;
  const items = order.cartItems || [];
  const subtotal = items.reduce((s, i) => s + i.price, 0);
  const total = Math.max(0, subtotal - (order.discountAmount || 0));

  const grouped = {};
  for (const item of items) {
    if (!grouped[item.gameName]) grouped[item.gameName] = { emoji: item.gameEmoji, items: [] };
    grouped[item.gameName].items.push(item);
  }
  let cartText = "";
  for (const [name, data] of Object.entries(grouped)) {
    cartText += `${data.emoji} **${name}**\n`;
    for (const item of data.items) cartText += `> • ${item.productName} 1x — R$ ${item.price.toFixed(2).replace(".", ",")}\n`;
    cartText += "\n";
  }

  // Renomear canal
  try {
    const safeName = (order.robloxUsername || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 15) || order.userId.slice(-4);
    const ticketCh = guild.channels.cache.get(order.channelId);
    if (ticketCh) await ticketCh.setName(`🟡・gp-${safeName}`);
  } catch { /* ignora */ }

  await channel.send({ content: "⏳ Gerando PIX, aguarde..." });

  // Montar adicionais para Codex
  const produtos = items.map(i => ({
    name: i.productName,
    quantidade: 1,
    preco: i.price,
    game_name: i.gameName,
  }));

  const adicionais = {
    tipo_venda: "gamepass_ingame",
    produtos,
    info_adicionais: {
      nick: order.robloxUsername || "—",
      display: order.robloxDisplayName || "—",
      avatar_url: "https://i.imgur.com/NxqBMbD.png",
      game_name: items[0]?.gameName || "Gamepass",
    },
  };

  const codexData = await codexNewPayment(total, adicionais);

  const updatedOrder = await Order.findByIdAndUpdate(
    order._id,
    { status: "pending_payment", totalAmount: total, ...(codexData ? { codexPaymentId: codexData.id } : {}) },
    { new: true }
  );

  if (codexData) {
    const qrBuffer = Buffer.from(codexData.base64.replace("data:image/png;base64,", ""), "base64");
    const { AttachmentBuilder } = require("discord.js");
    const attachment = new AttachmentBuilder(qrBuffer, { name: "qrcode.png" });

    const embed = new EmbedBuilder()
      .setTitle("💳 Pagamento PIX — Gamepass In-Game")
      .setDescription(
        cartText.trim() + "\n\n" +
        `**📋 Código PIX — Copia e Cola:**\n\`\`\`\n${codexData.copiaCola}\n\`\`\`\n` +
        `> ⏱️ Validade de **30 minutos**.\n` +
        `> ✅ Confirmação **automática** após pagamento.`
      )
      .addFields(
        { name: "👤 Roblox", value: `${order.robloxDisplayName} (@${order.robloxUsername})`, inline: true },
        { name: "💰 Total", value: `**R$ ${total.toFixed(2).replace(".", ",")}**`, inline: true },
        ...(order.couponCode ? [{ name: "🏷️ Cupom", value: `\`${order.couponCode}\``, inline: true }] : []),
      )
      .setImage("attachment://qrcode.png")
      .setColor(0xfee75c)
      .setFooter({ text: `Pedido #${order._id} • Heaven's Market` })
      .setTimestamp();

    await channel.send({ embeds: [embed], files: [attachment] });
    startPaymentPolling(client, guild, updatedOrder, codexData.id);
  } else {
    // Fallback
    let pixSection = PIX_KEY
      ? `\n**📋 Copia e Cola PIX:**\n\`\`\`\n${generatePixPayload(PIX_KEY, PIX_MERCHANT_NAME, PIX_CITY, total)}\n\`\`\``
      : "\n> ⚠️ *Gateway indisponível. Contate um admin.*";

    const embed = new EmbedBuilder()
      .setTitle("💳 Resumo do Pedido — Gamepass In-Game")
      .setDescription(cartText.trim() + "\n" + pixSection)
      .addFields(
        { name: "👤 Roblox", value: `${order.robloxDisplayName} (@${order.robloxUsername})`, inline: true },
        { name: "💰 Total", value: `**R$ ${total.toFixed(2).replace(".", ",")}**`, inline: true },
      )
      .setColor(0xfee75c)
      .setFooter({ text: `Pedido #${order._id} • Heaven's Market` })
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  }
}

async function handleCatNotFound(interaction, orderId) {
  const modal = new ModalBuilder()
    .setCustomId(`cat_modal_not_found_${orderId}`)
    .setTitle("🎮 Jogo não encontrado");

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("game_name")
        .setLabel("Nome do jogo")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: Anime Adventures")
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(100)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("gamepass_name")
        .setLabel("Nome da Gamepass/Produto")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: VIP, 2x XP, Dragão Permanente...")
        .setRequired(true)
        .setMinLength(2)
        .setMaxLength(100)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("robux_amount")
        .setLabel("Quantidade de Robux taxados")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("Ex: 1000")
        .setRequired(true)
        .setMinLength(1)
        .setMaxLength(10)
    )
  );
  await interaction.showModal(modal);
}

async function handleModalCatNotFound(interaction, orderId) {
  await interaction.deferReply({ ephemeral: true });

  const gameName = interaction.fields.getTextInputValue("game_name").trim();
  const gamepassName = interaction.fields.getTextInputValue("gamepass_name").trim();
  const robuxRaw = interaction.fields.getTextInputValue("robux_amount").trim();
  const robuxAmount = parseInt(robuxRaw.replace(/\D/g, ""), 10);

  if (isNaN(robuxAmount) || robuxAmount < 1) {
    return interaction.editReply({ content: "❌ Quantidade de Robux inválida. Digite apenas números. Ex: 1000" });
  }

  const price = robuxAmount * GAMEPASS_PRICE_BRL;

  // Adiciona direto ao carrinho como item normal
  await Order.findByIdAndUpdate(orderId, {
    $push: {
      cartItems: {
        gameName: gameName,
        gameEmoji: "🎮",
        categoryName: "Gamepass",
        productName: gamepassName,
        price,
        quantity: 1,
      },
    },
  });

  const updatedOrder = await Order.findById(orderId);
  const total = (updatedOrder.cartItems || []).reduce((s, i) => s + i.price, 0);
  const count = updatedOrder.cartItems.length;

  await interaction.editReply({
    content:
      `✅ **${gameName} — ${gamepassName}** adicionado ao carrinho!\n\n` +
      `> 💎 ${robuxAmount} Robux → **${formatBRL(price)}**\n` +
      `> 🛒 Total: **${formatBRL(total)}** (${count} item${count > 1 ? "s" : ""})\n\n` +
      `Use o botão **"🛒 Carrinho"** para finalizar ou continuar comprando.`,
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cat_view_cart_${orderId}`).setLabel(`🛒 Ver Carrinho (${count})`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cat_checkout_${orderId}`).setLabel("💳 Finalizar Compra").setStyle(ButtonStyle.Success),
    )],
  });
}

// ========== CODEX PAY API ==========

async function codexNewPayment(amount, adicionais = {}) {
  if (!CODEX_EMAIL || !CODEX_SENHA) return null;
  try {
    const res = await fetch(`${CODEX_BASE}/payments/new`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        valor: Number(amount.toFixed(2)),
        email: CODEX_EMAIL,
        senha: CODEX_SENHA,
        adicionais,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const json = await res.json();
    return {
      id: json.id,
      copiaCola: json.copia_cola,
      base64: json.base64,       // "data:image/png;base64,..."
      qrcodeUrl: json.qrcode_url,
    };
  } catch (err) {
    console.error("[codex] Erro ao criar pagamento:", err.message);
    return null;
  }
}

async function codexGetStatus(paymentId) {
  try {
    const res = await fetch(`${CODEX_BASE}/payments/get`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: paymentId }),
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json();
    return json.status || "pending";
  } catch {
    return "pending";
  }
}

// Polling automático — verifica pagamento a cada 30s por até 30 minutos
// Quando aprovado dispara todos os logs automaticamente
function startPaymentPolling(client, guild, order, codexPaymentId) {
  const MAX_ATTEMPTS = 60; // 60 * 30s = 30 minutos
  let attempts = 0;

  const interval = setInterval(async () => {
    attempts++;
    if (attempts > MAX_ATTEMPTS) {
      clearInterval(interval);
      // Expirado — avisa no ticket
      try {
        const ch = guild.channels.cache.get(order.channelId);
        if (ch) await ch.send({ content: "⏱️ O tempo de pagamento expirou. Use `/loja` para criar um novo pedido." });
      } catch { /* ignora */ }
      return;
    }

    const status = await codexGetStatus(codexPaymentId);
    if (status !== "approved") return;

    clearInterval(interval);

    // Atualiza order para paid
    const updatedOrder = await Order.findByIdAndUpdate(
      order._id,
      { status: "paid", codexPaymentId },
      { new: true }
    );
    if (!updatedOrder) return;

    // Dispara todos os logs
    await Promise.allSettled([
      logCompraPublica(guild, updatedOrder),
      logCompraAdmin(guild, updatedOrder, codexPaymentId),
      logEntrega(guild, updatedOrder),
      logRef(guild, updatedOrder),
      logPvMembro(guild, updatedOrder, codexPaymentId),
    ]);

    // Avisa no ticket que o pagamento foi aprovado
    try {
      const ch = guild.channels.cache.get(updatedOrder.channelId);
      if (ch) {
        // Desbloqueia o canal para o cliente poder falar novamente (só Robux, pois Gamepass nunca travou)
        if (updatedOrder.productType === "robux") {
          await ch.permissionOverwrites.edit(updatedOrder.userId, { SendMessages: true }).catch(() => {});
        }

        const embed = new EmbedBuilder()
          .setTitle("✅ Pagamento Aprovado!")
          .setDescription(
            `<@${updatedOrder.userId}>, seu pagamento foi **confirmado automaticamente**!\n\n` +
            `📦 Sua entrega será processada em breve pelo admin.\n` +
            `⭐ Deixe sua avaliação em <#${CH_REFS}> após receber.`
          )
          .setColor(0x57f287)
          .setTimestamp();
        await ch.send({ embeds: [embed] });
      }
    } catch { /* ignora */ }
  }, 30_000); // 30 segundos
}

// ========== FUNÇÕES DE LOG ==========

// Manda mensagem em um canal por ID, silenciosamente
async function sendToChannel(guild, channelId, payload) {
  try {
    const ch = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
    if (ch) await ch.send(payload);
  } catch (err) {
    console.error(`[log] Erro ao mandar para canal ${channelId}:`, err.message);
  }
}

// Log 1: Canal de compras públicas — quando pagamento é confirmado
async function logCompraPublica(guild, order) {
  const productLabel = order.productType === "gamepass"
    ? (order.cartItems?.length > 0 ? "Gamepass In-Game" : "Gamepass")
    : "Robux";

  const qty = order.productType === "robux"
    ? `${order.quantity} Robux (Taxados)`
    : order.cartItems?.length > 0
      ? `${order.cartItems.length} item(s) in-game`
      : `${order.quantity} Robux (Taxados)`;

  const embed = new EmbedBuilder()
    .setTitle("✅ Compra registrada com sucesso!")
    .setDescription(
      `💎 Você adquiriu **${qty}**\n\n` +
      `⏳ **Prazo de entrega:** até 48 horas\n\n` +
      `💬 Obrigado pela preferência e confiança na **Heaven's Market**!`
    )
    .setImage("https://i.imgur.com/compra_sucesso_banner.png")
    .setColor(0x57f287)
    .setTimestamp();

  await sendToChannel(guild, CH_COMPRAS, { content: `<@${order.userId}>`, embeds: [embed] });
}

// Log 2: Canal de logs admins — detalhes privados da compra
async function logCompraAdmin(guild, order, paymentId) {
  const total = order.totalAmount || calcTotal(order.quantity, order.discountAmount, order.productType);

  const embed = new EmbedBuilder()
    .setTitle("📋 Detalhes da Compra")
    .setDescription("Informações sobre a compra realizada:")
    .addFields(
      { name: "💳 Cupom Utilizado", value: order.couponCode || "Sem cupom", inline: true },
      { name: "🔑 ID do Pagamento", value: paymentId || order._id.toString(), inline: true },
      { name: "💎 Quantidade", value: order.productType === "robux" ? `${order.quantity} Robux (Taxados)` : "Gamepass In-Game", inline: true },
      { name: "💰 Valor Pago", value: formatBRL(total), inline: true },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "• Detalhes Privados" })
    .setTimestamp();

  await sendToChannel(guild, CH_LOGS, { content: `<@${order.userId}> #${order._id}`, embeds: [embed] });
}

// Log 3: Canal de entregas — quando admin usa /entregar
async function logEntrega(guild, order) {
  const qty = order.productType === "robux"
    ? `${order.quantity} Robux`
    : order.cartItems?.map(i => `${i.productName}`).join(", ") || "Gamepass";

  const tipo = order.productType === "robux" ? "Taxados" : "Gamepass In-Game";

  const embed = new EmbedBuilder()
    .setTitle("🚚 Nova Entrega Registrada!")
    .addFields(
      { name: "📦 Quantidade", value: qty, inline: true },
      { name: "🏷️ Tipo", value: tipo, inline: true },
    )
    .setDescription(
      `⚠️ Seus Robux chegaram e estão atualmente **pendentes**.\n` +
      `🔄 Assim que forem entregues ao comprador, o status será atualizado automaticamente.`
    )
    .setImage("https://i.imgur.com/entrega_banner.png")
    .setColor(0x5865f2)
    .setTimestamp();

  const verPendentesBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Ver Pendentes")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${guild.id}/${CH_ENTREGAS}`)
  );

  await sendToChannel(guild, CH_ENTREGAS, { content: `<@${order.userId}>`, embeds: [embed], components: [verPendentesBtn] });
}

// Log 4: Canal de refs — marca membro para avaliar
async function logRef(guild, order) {
  const embed = new EmbedBuilder()
    .setTitle("🎉 Nova Entrega!")
    .addFields(
      { name: "👤 Cliente", value: `<@${order.userId}>`, inline: true },
      { name: "📦 Produto", value: order.productType === "robux" ? `${order.quantity} Robux` : (order.cartItems?.[0]?.productName || "Gamepass"), inline: true },
    )
    .setDescription(
      `⭐ Avalie sua experiência: <#${CH_REFS}>\n` +
      `💙 Agradecemos seu feedback e confiança na **Heaven's Market**!`
    )
    .setColor(0xfee75c)
    .setTimestamp();

  await sendToChannel(guild, CH_REFS, { content: `<@${order.userId}>`, embeds: [embed] });
}

// Log 5: PV do membro — quando pagamento é confirmado
async function logPvMembro(guild, order, paymentId) {
  try {
    const member = await guild.members.fetch(order.userId).catch(() => null);
    if (!member) return;

    const qty = order.productType === "robux" ? `${order.quantity} Robux (Taxados)` : "Gamepass In-Game";
    const total = order.totalAmount || calcTotal(order.quantity, order.discountAmount, order.productType);

    const embed = new EmbedBuilder()
      .setTitle("🚚 Seu pedido chegou Registrada!")
      .addFields(
        { name: "📦 Quantidade", value: qty, inline: true },
        { name: "🏷️ Tipo", value: order.productType === "robux" ? "Taxados" : "Gamepass", inline: true },
      )
      .setDescription(
        `⚠️ Seus Robux chegaram e estão atualmente **pendentes**.\n` +
        `🔄 Assim que forem entregues ao comprador, o status será atualizado automaticamente.`
      )
      .setColor(0x57f287)
      .setTimestamp();

    await member.send({ embeds: [embed] }).catch(() => {
      console.warn(`[log] Não foi possível enviar PV para ${order.userId} (DMs fechadas)`);
    });
  } catch (err) {
    console.error("[log] Erro ao enviar PV:", err.message);
  }
}

// ========== /gerarpix ==========
async function handleGerarPixCommand(interaction) {
  if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const valor = interaction.options.getNumber("valor");

  if (!CODEX_EMAIL || !CODEX_SENHA) {
    return interaction.editReply({ content: "❌ CODEX_EMAIL e CODEX_SENHA não configurados no .env." });
  }

  const codexData = await codexNewPayment(valor, {});

  if (!codexData) {
    return interaction.editReply({ content: "❌ Erro ao gerar PIX. Verifique as credenciais da Codex." });
  }

  const qrBuffer = Buffer.from(codexData.base64.replace("data:image/png;base64,", ""), "base64");
  const { AttachmentBuilder } = require("discord.js");
  const attachment = new AttachmentBuilder(qrBuffer, { name: "qrcode.png" });

  const embed = new EmbedBuilder()
    .setTitle("💳 PIX Gerado")
    .addFields(
      { name: "💰 Valor", value: `**${formatBRL(valor)}**`, inline: true },
      { name: "🔑 ID", value: `\`${codexData.id}\``, inline: true },
    )
    .setDescription(
      `**📋 Copia e Cola:**\n\`\`\`\n${codexData.copiaCola}\n\`\`\``
    )
    .setImage("attachment://qrcode.png")
    .setColor(0xfee75c)
    .setFooter({ text: "Heaven's Market • PIX Avulso" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed], files: [attachment] });
}

// ========== /entregar ==========
async function handleEntregarCommand(interaction) {
  if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Você não tem permissão.", ephemeral: true });
  }

  const targetUser = interaction.options.getUser("usuario");
  const produto = interaction.options.getString("produto");
  const imagem = interaction.options.getAttachment("imagem");

  // Busca pedido antes de confirmar
  const order = await Order.findOne({
    guildId: interaction.guildId,
    userId: targetUser.id,
    status: { $in: ["open", "pending_payment", "paid", "awaiting_gamepass"] },
  }).sort({ createdAt: -1 });

  const valorStr = order?.totalAmount > 0 ? formatBRL(order.totalAmount) : "—";
  const tipoStr = order?.productType === "gamepass" ? "🎮 Gamepass" : "💎 Robux";
  const robloxStr = order?.robloxUsername ? `**${order.robloxDisplayName}** (@${order.robloxUsername})` : "—";
  const itensStr = order?.cartItems?.length
    ? order.cartItems.map(i => `• ${i.gameName} — ${i.productName}`).join("\n")
    : order?.quantity > 0 ? `${order.quantity} Robux` : "—";

  // Embed de confirmação
  const confirmEmbed = new EmbedBuilder()
    .setTitle("⚠️ Confirmar Entrega")
    .setDescription(`Revise os dados antes de confirmar a entrega para <@${targetUser.id}>:`)
    .addFields(
      { name: "👤 Usuário", value: `${targetUser.tag}`, inline: true },
      { name: "🎮 Roblox", value: robloxStr, inline: true },
      { name: "📦 Produto informado", value: produto, inline: false },
      { name: "🛒 Itens do pedido", value: itensStr, inline: false },
      { name: "💰 Valor", value: valorStr, inline: true },
      { name: "🏷️ Tipo", value: tipoStr, inline: true },
      ...(order?.couponCode ? [{ name: "🎟️ Cupom", value: `\`${order.couponCode}\``, inline: true }] : []),
    )
    .setColor(0xfee75c)
    .setFooter({ text: "Esta ação não pode ser desfeita" })
    .setTimestamp();

  const confirmId = `entregar_confirm_${targetUser.id}_${Date.now()}`;
  const cancelId = `entregar_cancel_${Date.now()}`;

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(confirmId).setLabel("✅ Confirmar Entrega").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(cancelId).setLabel("✖ Cancelar").setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({ embeds: [confirmEmbed], components: [row], ephemeral: true });

  // Aguarda clique por 60s
  const filter = i => i.user.id === interaction.user.id && (i.customId === confirmId || i.customId === cancelId);
  const collector = interaction.channel.createMessageComponentCollector({ filter, time: 60_000, max: 1 });

  collector.on("collect", async (btn) => {
    await btn.deferUpdate();
    if (btn.customId === cancelId) {
      return interaction.editReply({ content: "❌ Entrega cancelada.", embeds: [], components: [] });
    }

    // Confirma entrega
    const paymentId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    if (order) {
      await Order.findByIdAndUpdate(order._id, { status: "delivered" });
      try {
        const ticketCh = interaction.guild.channels.cache.get(order.channelId);
        if (ticketCh) {
          await ticketCh.setName(`✅・entregue-${targetUser.id.slice(-4)}`);
          const deliveredEmbed = new EmbedBuilder()
            .setTitle("✅ Pedido Entregue!")
            .setDescription(
              `<@${targetUser.id}>, seu pedido foi **entregue com sucesso**!\n\n` +
              `📦 **Produto:** ${produto}\n\n` +
              `Obrigado pela confiança na **Heaven's Market**! 💙\n` +
              `⭐ Deixe sua avaliação em <#${CH_REFS}>`
            )
            .setColor(0x57f287)
            .setTimestamp();
          if (imagem) deliveredEmbed.setImage(imagem.url);
          await ticketCh.send({ embeds: [deliveredEmbed] });
          await ticketCh.send({ content: "🗑️ Este canal será apagado em **60 segundos**." });
          setTimeout(async () => { try { await ticketCh.delete(); } catch { } }, 60_000);
        }
      } catch { }
    }

    const logData = order || {
      _id: paymentId, userId: targetUser.id, productType: "robux",
      quantity: 0, totalAmount: 0, couponCode: null, cartItems: [], discountAmount: 0,
    };

  // ── Canal de compras públicas ──
  const embedPublic = new EmbedBuilder()
    .setTitle("✅ Compra registrada com sucesso!")
    .setDescription(
      `💎 Você adquiriu **${produto}**\n\n` +
      `⏳ **Prazo de entrega:** até 48 horas\n\n` +
      `💬 Obrigado pela preferência e confiança na **Heaven's Market**!`
    )
    .setColor(0x57f287)
    .setTimestamp();
  if (imagem) embedPublic.setImage(imagem.url);

  // ── Canal de entregas ──
  const embedEntrega = new EmbedBuilder()
    .setTitle("🚚 Nova Entrega Registrada!")
    .addFields(
      { name: "📦 Quantidade", value: produto, inline: true },
      { name: "🏷️ Tipo", value: "Taxados", inline: true },
    )
    .setDescription(
      `⚠️ Seus Robux chegaram e estão atualmente **pendentes**.\n` +
      `🔄 Assim que forem entregues ao comprador, o status será atualizado automaticamente.`
    )
    .setColor(0x5865f2)
    .setTimestamp();
  if (imagem) embedEntrega.setImage(imagem.url);

  const verPendentesBtn = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel("Ver Pendentes")
      .setStyle(ButtonStyle.Link)
      .setURL(`https://discord.com/channels/${interaction.guildId}/${CH_ENTREGAS}`)
  );

  // ── Canal de refs ──
  const embedRef = new EmbedBuilder()
    .setTitle("🎉 Nova Entrega!")
    .addFields(
      { name: "👤 Cliente", value: `<@${targetUser.id}>`, inline: true },
      { name: "📦 Produto", value: produto, inline: true },
    )
    .setDescription(
      `⭐ Avalie sua experiência: <#${CH_REFS}>\n` +
      `💙 Agradecemos seu feedback e confiança na **Heaven's Market**!`
    )
    .setColor(0xfee75c)
    .setTimestamp();

  // ── Canal de logs admins ──
  const total = order?.totalAmount || 0;
  const embedLog = new EmbedBuilder()
    .setTitle("📋 Detalhes da Compra")
    .setDescription("Informações sobre a compra realizada:")
    .addFields(
      { name: "💳 Cupom Utilizado", value: order?.couponCode || "Sem cupom", inline: true },
      { name: "🔑 ID do Pagamento", value: paymentId, inline: true },
      { name: "💎 Quantidade", value: produto, inline: true },
      { name: "💰 Valor Pago", value: total > 0 ? formatBRL(total) : "—", inline: true },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "• Detalhes Privados" })
    .setTimestamp();

  // ── PV do membro ──
  const embedPV = new EmbedBuilder()
    .setTitle("🚚 Seu pedido chegou!")
    .addFields(
      { name: "📦 Produto", value: produto, inline: true },
      { name: "🏷️ Tipo", value: "Taxados", inline: true },
    )
    .setDescription(
      `⚠️ Seus Robux chegaram e estão atualmente **pendentes**.\n` +
      `🔄 Assim que forem entregues, o status será atualizado automaticamente.`
    )
    .setColor(0x57f287)
    .setTimestamp();
  if (imagem) embedPV.setImage(imagem.url);

  // Dispara todos em paralelo
    await Promise.allSettled([
      sendToChannel(interaction.guild, CH_COMPRAS, { content: `<@${targetUser.id}>`, embeds: [embedPublic] }),
      sendToChannel(interaction.guild, CH_ENTREGAS, { content: `<@${targetUser.id}>`, embeds: [embedEntrega], components: [verPendentesBtn] }),
      sendToChannel(interaction.guild, CH_REFS, { content: `<@${targetUser.id}>`, embeds: [embedRef] }),
      sendToChannel(interaction.guild, CH_LOGS, { content: `<@${targetUser.id}> #${paymentId}`, embeds: [embedLog] }),
      (async () => {
        try {
          const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
          if (member) await member.send({ embeds: [embedPV] }).catch(() => {});
        } catch { }
      })(),
    ]);

    await interaction.editReply({ content: `✅ Entrega de **${produto}** para <@${targetUser.id}> registrada!`, embeds: [], components: [] });
  });

  collector.on("end", (_, reason) => {
    if (reason === "time") {
      interaction.editReply({ content: "⏱️ Tempo esgotado. Use `/entregar` novamente.", embeds: [], components: [] }).catch(() => {});
    }
  });
}

// ========== AVALIAÇÃO ==========
async function handleSolicitarAvaliacaoCommand(interaction) {
  if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setTitle("⭐ Avaliação —")
    .setDescription(
      "👋 Olá! Sua opinião é muito importante para nós.\n" +
      "Nos ajude deixando sua **avaliação de 1 a 5 estrelas** sobre sua experiência. 🚀\n\n" +
      "💙 Seu feedback faz toda a diferença e nos ajuda a melhorar cada vez mais!"
    )
    .setColor(0xfee75c);

  const starsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("avaliacao_1").setLabel("⭐ 1").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("avaliacao_2").setLabel("⭐ 2").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("avaliacao_3").setLabel("⭐ 3").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("avaliacao_4").setLabel("⭐ 4").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("avaliacao_5").setLabel("⭐ 5").setStyle(ButtonStyle.Success)
  );

  await interaction.reply({ content: "✅ Avaliação solicitada no chat atual!", ephemeral: true });
  await interaction.channel.send({ embeds: [embed], components: [starsRow] });
}

async function handleAvaliacaoButton(interaction, stars) {
  const modal = new ModalBuilder()
    .setCustomId(`avaliacao_modal_${stars}`)
    .setTitle(`Avaliação ${stars}/5!`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("texto_avaliacao")
        .setLabel("Digite a sua avaliação abaixo:")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder("Ex: Muito bom! Recebi o meu produto!")
        .setRequired(true)
        .setMinLength(3)
        .setMaxLength(500)
    )
  );

  await interaction.showModal(modal);
}

async function handleAvaliacaoModal(interaction, stars) {
  await interaction.deferReply({ ephemeral: true });

  const texto = interaction.fields.getTextInputValue("texto_avaliacao");
  const starsDisplay = "⭐".repeat(parseInt(stars));

  const embed = new EmbedBuilder()
    .setTitle(`${starsDisplay} Avaliação ${stars}/5`)
    .setDescription(`> ${texto}`)
    .setColor(parseInt(stars) >= 4 ? 0x57f287 : parseInt(stars) >= 3 ? 0xfee75c : 0xed4245)
    .setFooter({ text: `Avaliado por ${interaction.user.tag}` })
    .setTimestamp()
    .setThumbnail(interaction.user.displayAvatarURL());

  await interaction.channel.send({ embeds: [embed] });
  await interaction.editReply({ content: "✅ Avaliação enviada! Obrigado pelo seu feedback 💙" });
}

// ========== /calcular ==========
// Guarda ID da última mensagem do /calcular por canal para poder apagar
const calcularMessages = new Map(); // channelId → messageId

async function handleCalcularCommand(interaction) {
  const quantidade = interaction.options.getInteger("robux");

  const precoRobux = quantidade * ROBUX_PRICE_BRL;
  const precoGift  = quantidade * GAMEPASS_PRICE_BRL;
  const gamepassRobux = Math.ceil(quantidade / 0.7);

  // Apaga mensagem anterior do /calcular neste canal
  const oldMsgId = calcularMessages.get(interaction.channelId);
  if (oldMsgId) {
    try {
      const oldMsg = await interaction.channel.messages.fetch(oldMsgId).catch(() => null);
      if (oldMsg) await oldMsg.delete().catch(() => {});
    } catch { /* ignora */ }
  }

  const embedValores = new EmbedBuilder()
    .setTitle("💱 Valores dos Produtos")
    .addFields(
      { name: "💎 Quantidade desejada:", value: `${quantidade} Robux`, inline: false },
      { name: "🔸 Valor a pagar (taxado):", value: `R$ ${precoRobux.toFixed(2).replace(".", ",")}`, inline: false },
      { name: "🔹 Gamepass (para receber " + quantidade + "):", value: `${gamepassRobux} Robux`, inline: false },
      { name: "🎁 Valor via Gift (em game):", value: `R$ ${precoGift.toFixed(2).replace(".", ",")}`, inline: false },
    )
    .setDescription("🔗 **Clique aqui para comprar**\n⏱️ *Os valores podem variar conforme taxas e disponibilidade.*")
    .setColor(0x57f287)
    .setThumbnail("https://i.imgur.com/NxqBMbD.png");

  const embedTutorial = new EmbedBuilder()
    .setTitle("✨ Como Calcular os Preços")
    .setDescription(
      "1️⃣ Use o comando `/calcular` e insira o valor desejado em **Robux**.\n" +
      "2️⃣ Confira com atenção os preços exibidos para evitar confusão.\n" +
      "3️⃣ **Lembre-se:**\n\n" +
      "> 🔸 O preço de Robux mostrado **já inclui todas as taxas**.\n" +
      "> 🎁 O valor via **Gift (em game)** é sem taxa, usado para Gamepasses e jogos.\n\n" +
      "⏱️ *Dúvidas? Fale com nossa equipe no canal de suporte!*"
    )
    .setColor(0x2b2d31);

  // Responde ephemeral para não poluir (o bot manda a mensagem pública separado)
  await interaction.reply({ content: "✅", ephemeral: true });

  const sent = await interaction.channel.send({ embeds: [embedValores, embedTutorial] });
  calcularMessages.set(interaction.channelId, sent.id);
}

// ========== /gastos ==========
async function handleGastosCommand(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const target = interaction.options.getUser("usuario") || interaction.user;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);

  const orders = await Order.find({
    guildId: interaction.guildId,
    userId: target.id,
    status: { $in: ["paid", "delivered", "awaiting_gamepass"] },
  });

  const totalGeral = orders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const totalRobux = orders
    .filter(o => o.productType === "robux")
    .reduce((s, o) => s + (o.totalAmount || 0), 0);
  const totalGamepass = orders
    .filter(o => o.productType === "gamepass")
    .reduce((s, o) => s + (o.totalAmount || 0), 0);

  const embed = new EmbedBuilder()
    .setTitle(`${member?.displayName || target.username} (@${target.username})`)
    .setThumbnail(target.displayAvatarURL())
    .setDescription(
      `💸 Gastou **${formatBRL(totalGeral)}** na loja\n` +
      `💎 Robux: **${formatBRL(totalRobux)}**\n` +
      `🎮 Gamepass: **${formatBRL(totalGamepass)}**`
    )
    .setColor(0x5865f2)
    .setFooter({ text: `${orders.length} pedido(s) concluído(s) • Heaven's Market` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ========== /aprovar ==========
async function handleAprovarCommand(interaction) {
  if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser("usuario");

  const order = await Order.findOne({
    guildId: interaction.guildId,
    userId: target.id,
    status: { $in: ["open", "pending_payment"] },
  }).sort({ createdAt: -1 });

  if (!order) {
    return interaction.editReply({ content: `❌ Nenhum pedido pendente encontrado para <@${target.id}>.` });
  }

  await Order.findByIdAndUpdate(order._id, { status: "paid" });

  // Avisa no ticket
  try {
    const ticketCh = interaction.guild.channels.cache.get(order.channelId);
    if (ticketCh) {
      const embed = new EmbedBuilder()
        .setTitle("✅ Pagamento Aprovado!")
        .setDescription(
          `<@${order.userId}>, seu pagamento foi **aprovado pelo admin**!\n\n` +
          `📦 Sua entrega será processada em breve.\n` +
          `⭐ Deixe sua avaliação em <#${CH_REFS}> após receber.`
        )
        .setColor(0x57f287)
        .setTimestamp();
      await ticketCh.send({ embeds: [embed] });
    }
  } catch { /* ignora */ }

  // Dispara logs
  await Promise.allSettled([
    logCompraPublica(interaction.guild, order),
    logCompraAdmin(interaction.guild, order, order._id.toString()),
    logEntrega(interaction.guild, order),
    logRef(interaction.guild, order),
    logPvMembro(interaction.guild, order, order._id.toString()),
  ]);

  await interaction.editReply({ content: `✅ Pedido de <@${target.id}> aprovado e logs enviados!` });
}

// ========== /status ==========
async function handleStatusCommand(interaction) {
  if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
  }

  const acao = interaction.options.getString("acao");
  lojaAberta = acao === "abrir";

  const embed = new EmbedBuilder()
    .setTitle(lojaAberta ? "🟢 Loja Aberta!" : "🔴 Loja Fechada!")
    .setDescription(
      lojaAberta
        ? "A loja está **aberta**. Os clientes já podem realizar compras."
        : "A loja está **fechada**. Nenhuma nova compra pode ser iniciada até ser reaberta."
    )
    .setColor(lojaAberta ? 0x57f287 : 0xed4245)
    .setFooter({ text: `Alterado por ${interaction.user.tag}` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ========== /ticket fechar ==========
async function handleTicketCommand(interaction) {
  if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
  }

  const sub = interaction.options.getSubcommand();
  if (sub === "fechar") {
    const order = await Order.findOne({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      status: { $nin: ["delivered", "cancelled"] },
    });

    if (order) {
      await Order.findByIdAndUpdate(order._id, { status: "cancelled" });
    }

    const embed = new EmbedBuilder()
      .setTitle("🔒 Ticket Encerrado")
      .setDescription(
        `Este ticket foi encerrado por <@${interaction.user.id}>.\n` +
        `O canal será apagado em **10 segundos**.`
      )
      .setColor(0xed4245)
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });

    setTimeout(async () => {
      try { await interaction.channel.delete(); } catch { /* ignora */ }
    }, 10_000);
  }
}

// ========== AUTO-FECHAR POR INATIVIDADE ==========
// Mapa: channelId → { timeout, orderId }
const inactivityTimers = new Map();
const INACTIVITY_WARN_MS  = 25 * 60 * 1000; // 25 minutos → aviso
const INACTIVITY_CLOSE_MS = 30 * 60 * 1000; // 30 minutos → fecha

function resetInactivityTimer(channel, orderId) {
  // Limpa timer anterior se existir
  const existing = inactivityTimers.get(channel.id);
  if (existing) {
    clearTimeout(existing.warnTimeout);
    clearTimeout(existing.closeTimeout);
  }

  const warnTimeout = setTimeout(async () => {
    try {
      await channel.send({
        content: `⚠️ Este ticket está **inativo há 25 minutos**. Será fechado automaticamente em 5 minutos caso não haja atividade.`,
      });
    } catch { /* ignora */ }
  }, INACTIVITY_WARN_MS);

  const closeTimeout = setTimeout(async () => {
    try {
      if (orderId) {
        await Order.findByIdAndUpdate(orderId, { status: "cancelled" }).catch(() => {});
      }
      const embed = new EmbedBuilder()
        .setTitle("⏱️ Ticket Encerrado por Inatividade")
        .setDescription("Este ticket foi fechado automaticamente após **30 minutos** sem atividade.")
        .setColor(0xed4245)
        .setTimestamp();
      await channel.send({ embeds: [embed] });
      setTimeout(async () => { try { await channel.delete(); } catch { /* ignora */ } }, 5_000);
    } catch { /* ignora */ }
    inactivityTimers.delete(channel.id);
  }, INACTIVITY_CLOSE_MS);

  inactivityTimers.set(channel.id, { warnTimeout, closeTimeout });
}

// ========== /cupom ==========
const Coupon = new Map(); // codigo → { desconto, usos, usosRestantes }

async function handleCupomCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "criar") {
    const codigo = interaction.options.getString("codigo").toUpperCase().trim();
    const desconto = interaction.options.getNumber("desconto");
    const usos = interaction.options.getInteger("usos") ?? 0;
    Coupon.set(codigo, { desconto, usos, usosRestantes: usos === 0 ? Infinity : usos });
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder()
        .setTitle("✅ Cupom Criado")
        .addFields(
          { name: "🏷️ Código", value: `\`${codigo}\``, inline: true },
          { name: "💰 Desconto", value: formatBRL(desconto), inline: true },
          { name: "🔢 Usos", value: usos === 0 ? "Ilimitado" : String(usos), inline: true },
        )
        .setColor(0x57f287)],
    });
  }

  if (sub === "deletar") {
    const codigo = interaction.options.getString("codigo").toUpperCase().trim();
    if (!Coupon.has(codigo)) return interaction.reply({ content: `❌ Cupom \`${codigo}\` não encontrado.`, ephemeral: true });
    Coupon.delete(codigo);
    return interaction.reply({ content: `✅ Cupom \`${codigo}\` deletado.`, ephemeral: true });
  }

  if (sub === "listar") {
    if (Coupon.size === 0) return interaction.reply({ content: "Nenhum cupom ativo no momento.", ephemeral: true });
    const lines = [...Coupon.entries()].map(([cod, data]) =>
      `\`${cod}\` — ${formatBRL(data.desconto)} — Usos: ${data.usosRestantes === Infinity ? "∞" : data.usosRestantes}`
    );
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder().setTitle("🏷️ Cupons Ativos").setDescription(lines.join("\n")).setColor(0x5865f2)],
    });
  }
}

// Função para aplicar cupom (chamada no checkout)
function applyCoupon(codigo) {
  const cod = (codigo || "").toUpperCase().trim();
  const coupon = Coupon.get(cod);
  if (!coupon) return { valid: false, desconto: 0 };
  if (coupon.usosRestantes <= 0) return { valid: false, desconto: 0 };
  if (coupon.usosRestantes !== Infinity) coupon.usosRestantes--;
  return { valid: true, desconto: coupon.desconto };
}

// ========== /perfil ==========
async function handlePerfilCommand(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getUser("usuario") || interaction.user;
  const member = await interaction.guild.members.fetch(target.id).catch(() => null);

  const orders = await Order.find({ guildId: interaction.guildId, userId: target.id }).sort({ createdAt: -1 });
  const entregues = orders.filter(o => ["paid", "delivered", "awaiting_gamepass"].includes(o.status));
  const totalGasto = entregues.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const totalRobux = entregues.filter(o => o.productType === "robux").reduce((s, o) => s + (o.totalAmount || 0), 0);
  const totalGp = entregues.filter(o => o.productType === "gamepass").reduce((s, o) => s + (o.totalAmount || 0), 0);

  // Última conta Roblox vinculada
  const lastOrder = orders.find(o => o.robloxUsername);

  const embed = new EmbedBuilder()
    .setTitle(`👤 Perfil — ${member?.displayName || target.username}`)
    .setThumbnail(target.displayAvatarURL())
    .addFields(
      { name: "🎮 Roblox", value: lastOrder ? `**${lastOrder.robloxDisplayName}** (@${lastOrder.robloxUsername})` : "`Não vinculado`", inline: false },
      { name: "📦 Pedidos concluídos", value: String(entregues.length), inline: true },
      { name: "💸 Total gasto", value: `**${formatBRL(totalGasto)}**`, inline: true },
      { name: "💎 Em Robux", value: formatBRL(totalRobux), inline: true },
      { name: "🎮 Em Gamepass", value: formatBRL(totalGp), inline: true },
    )
    .setColor(0x5865f2)
    .setFooter({ text: `ID: ${target.id} • Heaven's Market` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ========== /jogo ==========
async function handleJogoCommand(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === "adicionar") {
    const nome = interaction.options.getString("nome").trim();
    const emoji = interaction.options.getString("emoji").trim();
    const grupo = interaction.options.getString("grupo").trim();

    const existing = await Catalog.findOne({ name: new RegExp(`^${nome}$`, "i") });
    if (existing) return interaction.reply({ content: `❌ Jogo **${nome}** já existe no catálogo.`, ephemeral: true });

    await Catalog.create({ name: nome, emoji, group: grupo, categories: [] });
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder()
        .setTitle("✅ Jogo Adicionado")
        .setDescription(`**${emoji} ${nome}** foi adicionado ao catálogo no grupo **${grupo}**.\n\nUse \`/produto adicionar\` para adicionar produtos a este jogo.`)
        .setColor(0x57f287)],
    });
  }

  if (sub === "remover") {
    const nome = interaction.options.getString("nome").trim();
    const jogo = await Catalog.findOneAndDelete({ name: new RegExp(`^${nome}$`, "i") });
    if (!jogo) return interaction.reply({ content: `❌ Jogo **${nome}** não encontrado.`, ephemeral: true });
    return interaction.reply({ content: `✅ **${jogo.emoji} ${jogo.name}** removido do catálogo.`, ephemeral: true });
  }

  if (sub === "listar") {
    await interaction.deferReply({ ephemeral: true });
    const games = await Catalog.find({ active: true }).sort({ group: 1, name: 1 });
    if (games.length === 0) return interaction.editReply({ content: "Nenhum jogo cadastrado." });

    const grouped = {};
    for (const g of games) {
      if (!grouped[g.group]) grouped[g.group] = [];
      grouped[g.group].push(`${g.emoji} **${g.name}** (${g.categories.reduce((s, c) => s + c.products.length, 0)} produtos)`);
    }

    const desc = Object.entries(grouped).map(([grp, list]) => `**${grp}**\n${list.join("\n")}`).join("\n\n");
    return interaction.editReply({
      embeds: [new EmbedBuilder().setTitle(`🎮 Catálogo (${games.length} jogos)`).setDescription(desc).setColor(0x5865f2)],
    });
  }
}

// ========== /produto ==========
async function handleProdutoCommand(interaction) {
  const sub = interaction.options.getSubcommand();
  const jogoNome = interaction.options.getString("jogo").trim();

  const jogo = await Catalog.findOne({ name: new RegExp(`^${jogoNome}$`, "i") });
  if (!jogo) return interaction.reply({ content: `❌ Jogo **${jogoNome}** não encontrado. Use \`/jogo listar\` para ver os jogos.`, ephemeral: true });

  if (sub === "adicionar") {
    const categoriaNome = interaction.options.getString("categoria").trim();
    const prodNome = interaction.options.getString("nome").trim();
    const preco = interaction.options.getNumber("preco");

    let categoria = jogo.categories.find(c => c.name.toLowerCase() === categoriaNome.toLowerCase());
    if (!categoria) {
      jogo.categories.push({ name: categoriaNome, products: [] });
      categoria = jogo.categories[jogo.categories.length - 1];
    }
    categoria.products.push({ name: prodNome, price: preco });
    await jogo.save();

    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder()
        .setTitle("✅ Produto Adicionado")
        .addFields(
          { name: "🎮 Jogo", value: `${jogo.emoji} ${jogo.name}`, inline: true },
          { name: "📂 Categoria", value: categoriaNome, inline: true },
          { name: "🏷️ Produto", value: prodNome, inline: true },
          { name: "💰 Preço", value: formatBRL(preco), inline: true },
        )
        .setColor(0x57f287)],
    });
  }

  if (sub === "remover") {
    const prodNome = interaction.options.getString("nome").trim();
    let removido = false;
    for (const cat of jogo.categories) {
      const idx = cat.products.findIndex(p => p.name.toLowerCase() === prodNome.toLowerCase());
      if (idx !== -1) { cat.products.splice(idx, 1); removido = true; break; }
    }
    if (!removido) return interaction.reply({ content: `❌ Produto **${prodNome}** não encontrado em **${jogo.name}**.`, ephemeral: true });
    await jogo.save();
    return interaction.reply({ content: `✅ Produto **${prodNome}** removido de **${jogo.emoji} ${jogo.name}**.`, ephemeral: true });
  }

  if (sub === "editar") {
    const prodNome = interaction.options.getString("nome").trim();
    const novoPreco = interaction.options.getNumber("preco");
    let encontrado = false;
    let precoAntigo = 0;
    for (const cat of jogo.categories) {
      const prod = cat.products.find(p => p.name.toLowerCase() === prodNome.toLowerCase());
      if (prod) {
        precoAntigo = prod.price;
        prod.price = novoPreco;
        encontrado = true;
        break;
      }
    }
    if (!encontrado) return interaction.reply({ content: `❌ Produto **${prodNome}** não encontrado em **${jogo.name}**.`, ephemeral: true });
    await jogo.save();
    return interaction.reply({
      ephemeral: true,
      embeds: [new EmbedBuilder()
        .setTitle("✏️ Produto Editado")
        .addFields(
          { name: "🎮 Jogo", value: `${jogo.emoji} ${jogo.name}`, inline: true },
          { name: "🏷️ Produto", value: prodNome, inline: true },
          { name: "💰 Preço anterior", value: formatBRL(precoAntigo), inline: true },
          { name: "💰 Novo preço", value: formatBRL(novoPreco), inline: true },
        )
        .setColor(0x5865f2)],
    });
  }
}

// ========== /ping ==========
async function handlePingCommand(interaction) {
  const sent = await interaction.reply({ content: "🏓 Calculando...", fetchReply: true });
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const wsLatency = client.ws.ping;

  let dbStatus = "✅ Online";
  try {
    await Order.findOne().limit(1);
  } catch {
    dbStatus = "❌ Offline";
  }

  const embed = new EmbedBuilder()
    .setTitle("🏓 Pong!")
    .addFields(
      { name: "📡 Latência", value: `**${latency}ms**`, inline: true },
      { name: "💓 WebSocket", value: `**${wsLatency}ms**`, inline: true },
      { name: "🗄️ MongoDB", value: dbStatus, inline: true },
    )
    .setColor(latency < 200 ? 0x57f287 : latency < 500 ? 0xfee75c : 0xed4245)
    .setFooter({ text: "Heaven's Market" })
    .setTimestamp();

  await interaction.editReply({ content: "", embeds: [embed] });
}

// ========== /ranking ==========
async function handleRankingCommand(interaction) {
  await interaction.deferReply();

  const orders = await Order.find({
    guildId: interaction.guildId,
    status: { $in: ["paid", "delivered", "awaiting_gamepass"] },
    totalAmount: { $gt: 0 },
  });

  // Agrupa por usuário
  const map = {};
  for (const o of orders) {
    if (!map[o.userId]) map[o.userId] = { total: 0, pedidos: 0 };
    map[o.userId].total += o.totalAmount || 0;
    map[o.userId].pedidos++;
  }

  const sorted = Object.entries(map)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 5);

  if (sorted.length === 0) {
    return interaction.editReply({ content: "Nenhuma compra registrada ainda." });
  }

  const medals = ["🥇", "🥈", "🥉", "4️⃣", "5️⃣"];
  const lines = await Promise.all(sorted.map(async ([userId, data], i) => {
    const user = await client.users.fetch(userId).catch(() => null);
    const name = user ? `**${user.username}**` : `<@${userId}>`;
    return `${medals[i]} ${name} — **${formatBRL(data.total)}** (${data.pedidos} pedido${data.pedidos > 1 ? "s" : ""})`;
  }));

  const embed = new EmbedBuilder()
    .setTitle("🏆 Ranking de Compradores")
    .setDescription(lines.join("\n"))
    .setColor(0xfee75c)
    .setFooter({ text: "Heaven's Market • Top 5 maiores compradores" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ========== /historico ==========
async function handleHistoricoCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const target = interaction.options.getUser("usuario") || interaction.user;

  const orders = await Order.find({ guildId: interaction.guildId, userId: target.id })
    .sort({ createdAt: -1 }).limit(10);

  if (orders.length === 0) return interaction.editReply({ content: `Nenhum pedido encontrado para <@${target.id}>.` });

  const statusEmoji = { open: "🟢", pending_payment: "🟡", paid: "✅", awaiting_gamepass: "🔵", delivered: "✅", cancelled: "❌" };
  const lines = orders.map((o, i) => {
    const emoji = statusEmoji[o.status] || "⚪";
    const tipo = o.productType === "robux" ? "💎 Robux" : "🎮 Gamepass";
    const valor = o.totalAmount > 0 ? formatBRL(o.totalAmount) : "—";
    const data = new Date(o.createdAt).toLocaleDateString("pt-BR");
    return `${i + 1}. ${emoji} ${tipo} — **${valor}** — ${data}`;
  });

  const embed = new EmbedBuilder()
    .setTitle(`📋 Histórico — ${target.username}`)
    .setDescription(lines.join("\n"))
    .setColor(0x5865f2)
    .setFooter({ text: `Últimos ${orders.length} pedido(s) • Heaven's Market` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ========== /buscar ==========
async function handleBuscarCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const query = interaction.options.getString("produto").toLowerCase().trim();

  const games = await Catalog.find({ active: true });
  const resultados = [];

  for (const game of games) {
    for (const cat of game.categories) {
      for (const prod of cat.products) {
        if (prod.name.toLowerCase().includes(query)) {
          resultados.push({
            jogo: `${game.emoji} ${game.name}`,
            categoria: cat.name,
            produto: prod.name,
            preco: prod.price,
          });
        }
      }
    }
  }

  if (resultados.length === 0) {
    return interaction.editReply({ content: `❌ Nenhum produto encontrado para **"${query}"**.` });
  }

  const lines = resultados.slice(0, 10).map(r =>
    `${r.jogo} › ${r.categoria}\n> **${r.produto}** — R$ ${r.preco.toFixed(2).replace(".", ",")}`
  );

  const embed = new EmbedBuilder()
    .setTitle(`🔍 Resultados para "${query}"`)
    .setDescription(lines.join("\n\n"))
    .setColor(0x5865f2)
    .setFooter({ text: `${resultados.length} resultado(s) encontrado(s)` });

  await interaction.editReply({ embeds: [embed] });
}

// ========== /cancelar ==========
async function handleCancelarCommand(interaction) {
  if (!interaction.member?.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "❌ Sem permissão.", ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser("usuario");
  const motivo = interaction.options.getString("motivo");

  const order = await Order.findOne({
    guildId: interaction.guildId,
    userId: target.id,
    status: { $nin: ["delivered", "cancelled"] },
  }).sort({ createdAt: -1 });

  if (!order) return interaction.editReply({ content: `❌ Nenhum pedido ativo para <@${target.id}>.` });

  await Order.findByIdAndUpdate(order._id, { status: "cancelled" });

  // Avisa no ticket
  try {
    const ch = interaction.guild.channels.cache.get(order.channelId);
    if (ch) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Pedido Cancelado")
        .setDescription(`Seu pedido foi cancelado por um administrador.\n\n**Motivo:** ${motivo}`)
        .setColor(0xed4245)
        .setTimestamp();
      await ch.send({ embeds: [embed] });
      setTimeout(async () => { try { await ch.delete(); } catch { } }, 10_000);
    }
  } catch { }

  // DM para o cliente
  try {
    const member = await interaction.guild.members.fetch(target.id).catch(() => null);
    if (member) {
      const embed = new EmbedBuilder()
        .setTitle("❌ Seu pedido foi cancelado")
        .setDescription(`Um administrador cancelou seu pedido na **Heaven's Market**.\n\n**Motivo:** ${motivo}\n\nSe tiver dúvidas, entre em contato com nossa equipe.`)
        .setColor(0xed4245)
        .setTimestamp();
      await member.send({ embeds: [embed] }).catch(() => { });
    }
  } catch { }

  await interaction.editReply({ content: `✅ Pedido de <@${target.id}> cancelado.\n**Motivo:** ${motivo}` });
}

// ========== /stats ==========
async function handleStatsCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const agora = new Date();
  const inicioDia = new Date(agora); inicioDia.setHours(0, 0, 0, 0);
  const inicioSemana = new Date(agora); inicioSemana.setDate(agora.getDate() - 7);
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

  const [totalOrders, paidOrders, cancelledOrders, ordersHoje, ordersSemana, ordersMes] = await Promise.all([
    Order.countDocuments({ guildId: interaction.guildId }),
    Order.find({ guildId: interaction.guildId, status: { $in: ["paid", "delivered"] } }),
    Order.countDocuments({ guildId: interaction.guildId, status: "cancelled" }),
    Order.find({ guildId: interaction.guildId, status: { $in: ["paid", "delivered"] }, createdAt: { $gte: inicioDia } }),
    Order.find({ guildId: interaction.guildId, status: { $in: ["paid", "delivered"] }, createdAt: { $gte: inicioSemana } }),
    Order.find({ guildId: interaction.guildId, status: { $in: ["paid", "delivered"] }, createdAt: { $gte: inicioMes } }),
  ]);

  const totalVendido = paidOrders.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const vendidoHoje = ordersHoje.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const vendidoSemana = ordersSemana.reduce((s, o) => s + (o.totalAmount || 0), 0);
  const vendidoMes = ordersMes.reduce((s, o) => s + (o.totalAmount || 0), 0);

  // Produto mais vendido
  const prodCount = {};
  for (const o of paidOrders) {
    if (o.productType === "robux") {
      prodCount["💎 Robux"] = (prodCount["💎 Robux"] || 0) + 1;
    } else if (o.cartItems?.length) {
      for (const item of o.cartItems) {
        const key = `${item.gameName} — ${item.productName}`;
        prodCount[key] = (prodCount[key] || 0) + 1;
      }
    }
  }
  const maisPedido = Object.entries(prodCount).sort((a, b) => b[1] - a[1])[0];

  const embed = new EmbedBuilder()
    .setTitle("📊 Estatísticas da Loja")
    .addFields(
      { name: "📅 Hoje", value: `**${formatBRL(vendidoHoje)}** (${ordersHoje.length} pedido${ordersHoje.length !== 1 ? "s" : ""})`, inline: true },
      { name: "📆 Esta semana", value: `**${formatBRL(vendidoSemana)}** (${ordersSemana.length} pedido${ordersSemana.length !== 1 ? "s" : ""})`, inline: true },
      { name: "🗓️ Este mês", value: `**${formatBRL(vendidoMes)}** (${ordersMes.length} pedido${ordersMes.length !== 1 ? "s" : ""})`, inline: true },
      { name: "💸 Total geral", value: `**${formatBRL(totalVendido)}**`, inline: true },
      { name: "📦 Total de pedidos", value: String(totalOrders), inline: true },
      { name: "❌ Cancelados", value: String(cancelledOrders), inline: true },
      { name: "🏆 Mais pedido", value: maisPedido ? `${maisPedido[0]} (${maisPedido[1]}x)` : "—", inline: false },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "Heaven's Market • Estatísticas" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ========== ANTI-SPAM DE TICKETS ==========
const ticketAttempts = new Map(); // userId → { count, resetAt }
const MAX_TICKETS_PER_WINDOW = 3;
const SPAM_WINDOW_MS = 10 * 60 * 1000; // 10 minutos

function checkTicketSpam(userId) {
  const agora = Date.now();

  // Limpa entradas expiradas para não vazar memória
  for (const [id, entry] of ticketAttempts.entries()) {
    if (agora > entry.resetAt) ticketAttempts.delete(id);
  }

  const entry = ticketAttempts.get(userId);
  if (!entry || agora > entry.resetAt) {
    ticketAttempts.set(userId, { count: 1, resetAt: agora + SPAM_WINDOW_MS });
    return false;
  }

  entry.count++;
  if (entry.count > MAX_TICKETS_PER_WINDOW) return true;
  return false;
}

// ========== /desconto ==========
async function handleDescontoCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser("usuario");
  const valor = interaction.options.getNumber("valor");

  const order = await Order.findOne({
    guildId: interaction.guildId,
    userId: target.id,
    status: { $in: ["open", "pending_payment", "awaiting_gamepass"] },
  }).sort({ createdAt: -1 });

  if (!order) return interaction.editReply({ content: `❌ Nenhum pedido ativo para <@${target.id}>.` });

  await Order.findByIdAndUpdate(order._id, { discountAmount: (order.discountAmount || 0) + valor });

  // Avisa no ticket
  try {
    const ch = interaction.guild.channels.cache.get(order.channelId);
    if (ch) {
      await ch.send({
        embeds: [new EmbedBuilder()
          .setTitle("🎉 Desconto Aplicado!")
          .setDescription(`Um administrador aplicou um desconto de **${formatBRL(valor)}** no seu pedido!`)
          .setColor(0x57f287)
          .setTimestamp()],
      });
    }
  } catch { }

  await interaction.editReply({ content: `✅ Desconto de **${formatBRL(valor)}** aplicado no pedido de <@${target.id}>.` });
}

// ========== /alterar-nick ==========
async function handleAlterarNickCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser("usuario");
  const novoNick = interaction.options.getString("nick").trim();

  const order = await Order.findOne({
    guildId: interaction.guildId,
    userId: target.id,
    productType: "gamepass",
    status: { $in: ["open", "pending_payment", "paid", "awaiting_gamepass"] },
  }).sort({ createdAt: -1 });

  if (!order) return interaction.editReply({ content: `❌ Nenhum pedido de gamepass ativo para <@${target.id}>.` });

  // Busca o usuário Roblox pelo nick novo
  const robloxUser = await fetchRobloxUser(novoNick);
  if (!robloxUser) {
    return interaction.editReply({ content: `❌ Usuário Roblox **${novoNick}** não encontrado.` });
  }

  await Order.findByIdAndUpdate(order._id, {
    robloxUsername: robloxUser.name,
    robloxDisplayName: robloxUser.displayName || robloxUser.name,
  });

  // Avisa no ticket
  try {
    const ch = interaction.guild.channels.cache.get(order.channelId);
    if (ch) {
      await ch.send({
        embeds: [new EmbedBuilder()
          .setTitle("✏️ Nick Roblox Alterado")
          .setDescription(`O nick Roblox do pedido foi atualizado para:\n**${robloxUser.displayName || robloxUser.name}** (@${robloxUser.name})`)
          .setColor(0x5865f2)
          .setTimestamp()],
      });
    }
  } catch { }

  await interaction.editReply({ content: `✅ Nick alterado para **${robloxUser.name}** no pedido de <@${target.id}>.` });
}

// ========== /reabrir ==========
async function handleReabrirCommand(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const target = interaction.options.getUser("usuario");

  const order = await Order.findOne({
    guildId: interaction.guildId,
    userId: target.id,
    status: "cancelled",
  }).sort({ createdAt: -1 });

  if (!order) return interaction.editReply({ content: `❌ Nenhum pedido cancelado encontrado para <@${target.id}>.` });

  // Verifica se canal ainda existe
  const chExistente = order.channelId ? interaction.guild.channels.cache.get(order.channelId) : null;

  if (chExistente) {
    // Canal ainda existe, só reativa o pedido
    await Order.findByIdAndUpdate(order._id, { status: "open" });
    await chExistente.send({
      embeds: [new EmbedBuilder()
        .setTitle("🔓 Ticket Reaberto")
        .setDescription(`<@${target.id}>, seu ticket foi reaberto por um administrador.`)
        .setColor(0x57f287)
        .setTimestamp()],
    });
    return interaction.editReply({ content: `✅ Pedido reaberto em <#${order.channelId}>.` });
  }

  // Canal foi apagado — cria novo
  const categoryChannel = interaction.guild.channels.cache.get(SHOP_CATEGORY_ID);
  if (!categoryChannel) return interaction.editReply({ content: "❌ Categoria de tickets não encontrada." });

  const prefix = order.productType === "gamepass" ? "🎮" : "💎";
  const shortId = String(order._id).slice(-4);
  const channel = await interaction.guild.channels.create({
    name: `${prefix}・reaberto-${shortId}`,
    type: ChannelType.GuildText,
    parent: SHOP_CATEGORY_ID,
    permissionOverwrites: await buildPermissionOverwrites(interaction.guild, target.id),
  });

  await Order.findByIdAndUpdate(order._id, { status: "open", channelId: channel.id });

  const embed = new EmbedBuilder()
    .setTitle("🔓 Ticket Reaberto")
    .setDescription(`<@${target.id}>, seu ticket foi reaberto por um administrador.\n\nContinue de onde parou.`)
    .setColor(0x57f287)
    .setTimestamp();

  await channel.send({ content: `<@${target.id}>`, embeds: [embed] });
  await interaction.editReply({ content: `✅ Novo canal criado: <#${channel.id}>.` });
}

// ========== SERVIDOR HTTP ==========
require("./api");

// ========== INICIAR ==========
connectDB().then(() => {
  client.login(BOT_TOKEN).catch((err) => {
    console.error("Erro ao conectar. Verifique o token no .env.");
    console.error(err);
    process.exit(1);
  });
});
