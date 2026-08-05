const { EmbedBuilder } = require("discord.js");
const Catalog = require("../models/Catalog");
const {
  PANEL_COLOR,
  buildEmbed,
  findPanelByCustomId,
  findResponse,
} = require("./static-panels");

function formatBRL(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
  }).format(Number(value || 0));
}

function splitProductLines(lines, maxLength = 3600) {
  const chunks = [];
  let current = "";

  for (const line of lines) {
    if (current && current.length + line.length + 1 > maxLength) {
      chunks.push(current);
      current = line;
    } else {
      current = current ? `${current}\n${line}` : line;
    }
  }

  if (current) chunks.push(current);
  return chunks;
}

function buildGameEmbeds(game) {
  const embeds = [];
  const categories = Array.isArray(game.categories) ? game.categories : [];

  for (const category of categories) {
    const products = Array.isArray(category.products) ? category.products : [];
    const lines = products.map((product) => {
      const robux = Number.isFinite(product.robux)
        ? ` • ${product.robux.toLocaleString("pt-BR")} Robux`
        : "";
      return `• **${product.name}** — ${formatBRL(product.price)}${robux}`;
    });

    const chunks = splitProductLines(
      lines.length ? lines : ["Nenhum produto cadastrado nesta seção."]
    );

    chunks.forEach((description, index) => {
      const first = embeds.length === 0;
      embeds.push(
        new EmbedBuilder()
          .setColor(PANEL_COLOR)
          .setTitle(first ? `${game.emoji || "🎮"} ${game.name}` : `${game.name} — continuação`)
          .setDescription(description)
          .setAuthor({
            name: index === 0
              ? category.name || "Produtos"
              : `${category.name || "Produtos"} — continuação`,
          })
          .setFooter({ text: "Heaven's Market • Consulte o valor antes do pagamento" })
      );
    });
  }

  if (!embeds.length) {
    embeds.push(
      new EmbedBuilder()
        .setColor(PANEL_COLOR)
        .setTitle(`${game.emoji || "🎮"} ${game.name}`)
        .setDescription("Nenhum produto cadastrado para este jogo.")
    );
  }

  return embeds.slice(0, 10);
}

async function handleStaticPanel(interaction, panel) {
  const selectedValue = interaction.values[0];
  const response = findResponse(panel, selectedValue);

  if (!response) {
    await interaction.reply({
      content: "Esta opção não está disponível.",
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    embeds: [buildEmbed(response)],
    ephemeral: true,
    allowedMentions: { parse: [] },
  });
}

async function handleCatalog(interaction) {
  const selected = interaction.values[0];
  if (!selected?.startsWith("game:")) return;

  await interaction.deferReply({ ephemeral: true });

  const gameId = selected.slice("game:".length);
  const game = await Catalog.findOne({ _id: gameId, active: true }).lean();

  if (!game) {
    await interaction.editReply({
      content: "Este jogo não está mais disponível no catálogo.",
    });
    return;
  }

  await interaction.editReply({
    embeds: buildGameEmbeds(game),
    allowedMentions: { parse: [] },
  });
}

async function handleInteraction(interaction) {
  if (!interaction.isStringSelectMenu()) return;

  const staticPanel = findPanelByCustomId(interaction.customId);
  if (staticPanel) {
    await handleStaticPanel(interaction, staticPanel);
    return;
  }

  if (interaction.customId.startsWith("catalog:")) {
    await handleCatalog(interaction);
  }
}

module.exports = {
  buildGameEmbeds,
  formatBRL,
  handleInteraction,
};
