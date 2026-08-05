const {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const BotState = require("../models/BotState");
const Catalog = require("../models/Catalog");
const { CHANNELS, GROUPS } = require("../config");
const {
  OFFICIAL_FOOTER,
  PANELS,
  PANEL_COLOR,
  buildPanelPayload,
} = require("./static-panels");

const STATE_ID = "heavens-panel-messages-static-v3";
const MAX_SCAN_MESSAGES = 500;

function splitEvery(items, size) {
  const chunks = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function makeCatalogPayload(group, games) {
  const embed = new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(`${group.emoji} Catálogo — ${group.name}`)
    .setDescription(
      "Consulte os jogos disponíveis nesta categoria usando o menu abaixo. Ao selecionar um jogo, você verá os **produtos e preços atuais** carregados diretamente do catálogo da loja.\n\n" +
      "A **Heaven's Market** trabalha apenas com produtos que possuem sistema de gift e não exigem nível, missão, passe ou outro desbloqueio para permitir a entrega.\n\n" +
      "Antes de pagar, confirme dentro do jogo se o produto possui gift e se o valor informado está correto."
    )
    .setFooter({ text: OFFICIAL_FOOTER });

  const chunks = splitEvery(games, 25);
  const rows = chunks.slice(0, 5).map((chunk, index) => {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`catalog:${group.id}:${index}`)
      .setPlaceholder(
        chunks.length === 1
          ? group.placeholder
          : `${group.placeholder} (${index + 1}/${chunks.length})`
      )
      .addOptions(
        chunk.map((game) => ({
          label: String(game.name).slice(0, 100),
          value: `game:${game._id}`,
          emoji: game.emoji || "🎮",
          description: `${
            game.categories?.reduce(
              (sum, category) => sum + (category.products?.length || 0),
              0
            ) || 0
          } produto(s)`.slice(0, 100),
        }))
      );

    return new ActionRowBuilder().addComponents(menu);
  });

  if (games.length === 0) {
    embed.addFields({
      name: "Indisponível",
      value: "Nenhum jogo ativo nesta categoria no momento.",
    });
  } else if (chunks.length > 5) {
    embed.addFields({
      name: "Limite atingido",
      value: `Esta categoria possui ${games.length} jogos. Os primeiros 125 foram exibidos; divida a categoria antes de adicionar mais.`,
    });
  }

  return {
    embeds: [embed],
    components: rows,
    allowedMentions: { parse: [] },
  };
}

async function getState() {
  let state = await BotState.findById(STATE_ID);
  if (!state) {
    state = await BotState.create({
      _id: STATE_ID,
      panelMessages: {},
    });
  }
  return state;
}

function messageHasCustomId(message, customId) {
  if (!customId) return false;
  return (message.components || []).some((row) =>
    (row.components || []).some((component) => component.customId === customId)
  );
}

function scoreMessage(message, definition) {
  const title = message.embeds?.[0]?.title || "";

  if (definition.customId && messageHasCustomId(message, definition.customId)) {
    return 100;
  }

  if (definition.preferredTitle && title === definition.preferredTitle) {
    return 90;
  }

  if (definition.titleCandidates?.includes(title)) {
    return 70;
  }

  return 0;
}

async function fetchBotMessages(channel) {
  let before;
  let scanned = 0;
  const messages = [];

  while (scanned < MAX_SCAN_MESSAGES) {
    const batch = await channel.messages.fetch({
      limit: 100,
      ...(before ? { before } : {}),
    });

    if (batch.size === 0) break;

    for (const message of batch.values()) {
      if (message.author?.id === channel.client.user.id) {
        messages.push(message);
      }
    }

    scanned += batch.size;
    before = batch.last()?.id;
    if (batch.size < 100 || !before) break;
  }

  return messages;
}

async function findExistingMessage(channel, definition, botMessages) {
  const ranked = botMessages
    .map((message) => ({
      message,
      score: scoreMessage(message, definition),
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Number(BigInt(a.message.id) - BigInt(b.message.id));
    });

  return ranked[0]?.message || null;
}

function isDuplicateForDefinition(message, definition) {
  return scoreMessage(message, definition) > 0;
}

async function removeKnownDuplicates(botMessages, keptMessage, definition) {
  for (const message of botMessages) {
    if (message.id === keptMessage.id) continue;
    if (!isDuplicateForDefinition(message, definition)) continue;

    await message.delete().catch((error) => {
      console.warn(
        `Não foi possível remover mensagem duplicada ${message.id} do painel ${definition.id}: ${error.message}`
      );
    });
  }
}

async function upsertPanelMessage(client, state, definition, payload) {
  const channel = await client.channels.fetch(definition.channelId).catch(() => null);
  if (!channel?.isTextBased() || !channel.messages) {
    throw new Error(
      `Canal ${definition.channelId} não encontrado ou não é um canal de texto.`
    );
  }

  const botMessages = await fetchBotMessages(channel);
  let message = null;

  const saved = state.panelMessages.get(definition.id);
  if (saved?.channelId === definition.channelId && saved?.messageId) {
    message = await channel.messages.fetch(saved.messageId).catch(() => null);
    if (message?.author?.id !== client.user.id) message = null;
  }

  if (!message) {
    message = await findExistingMessage(channel, definition, botMessages);
  }

  if (message) {
    await message.edit(payload);
  } else {
    message = await channel.send(payload);
    botMessages.push(message);
  }

  await removeKnownDuplicates(botMessages, message, definition);

  state.panelMessages.set(definition.id, {
    channelId: definition.channelId,
    messageId: message.id,
  });
  await state.save();

  console.log(`Painel atualizado: ${definition.id}`);
}

async function syncStaticPanels(client, state) {
  const slots = [
    { panel: PANELS.terms, channelId: CHANNELS.terms },
    { panel: PANELS.support, channelId: CHANNELS.support },
    { panel: PANELS.faq, channelId: CHANNELS.faq },
  ];

  for (const { panel, channelId } of slots) {
    await upsertPanelMessage(
      client,
      state,
      {
        id: panel.id,
        channelId,
        customId: panel.customId,
        preferredTitle: panel.main.title,
        titleCandidates: panel.titleCandidates,
      },
      buildPanelPayload(panel)
    );
  }
}

async function syncCatalogPanels(client, state) {
  for (const group of GROUPS) {
    const games = await Catalog.find({
      active: true,
      group: group.name,
    })
      .sort({ name: 1 })
      .lean();

    const id = `catalog_${group.id}`;
    const title = `${group.emoji} Catálogo — ${group.name}`;

    await upsertPanelMessage(
      client,
      state,
      {
        id,
        channelId: CHANNELS.catalog,
        customId: `catalog:${group.id}:0`,
        preferredTitle: title,
        titleCandidates: [title],
      },
      makeCatalogPayload(group, games)
    );
  }
}

async function syncAllPanels(client) {
  const state = await getState();

  await syncStaticPanels(client, state);
  await syncCatalogPanels(client, state);

  console.log("Todos os painéis foram sincronizados.");
}

module.exports = {
  makeCatalogPayload,
  syncAllPanels,
};
