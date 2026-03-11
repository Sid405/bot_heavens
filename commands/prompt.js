const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js");
const { getStoreConfig } = require("../services/configService");

const data = new SlashCommandBuilder()
  .setName("prompt")
  .setDescription("Exibe o prompt da loja de Robux no canal");

const STYLE_MAP = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

async function execute(interaction) {
  await interaction.deferReply();
  try {
    const store = await getStoreConfig();
    const promptConfig = store.prompt;

    const color =
      parseInt(String(promptConfig.color || "5865f2").replace(/^#/, ""), 16) ||
      0x5865f2;

    const embed = new EmbedBuilder()
      .setTitle(promptConfig.title || "🛒 Loja de Robux")
      .setDescription(promptConfig.description || "Bem-vindo à nossa loja!")
      .setColor(color);

    if (promptConfig.image) embed.setImage(promptConfig.image);

    const buttons = Array.isArray(promptConfig.buttons) ? promptConfig.buttons : [];
    const validButtons = buttons
      .filter((b) => b && b.label && b.customId)
      .slice(0, 5);

    const rows = [];
    if (validButtons.length > 0) {
      const row = new ActionRowBuilder();
      for (const btn of validButtons) {
        const button = new ButtonBuilder()
          .setCustomId(btn.customId)
          .setLabel(btn.label)
          .setStyle(STYLE_MAP[btn.style] || ButtonStyle.Primary);
        if (btn.emoji) button.setEmoji(btn.emoji);
        row.addComponents(button);
      }
      rows.push(row);
    }

    await interaction.editReply({ embeds: [embed], components: rows });
  } catch (err) {
    console.error("[/prompt] Erro:", err);
    await interaction.editReply({
      content: "❌ Erro ao carregar o prompt da loja. Tente novamente.",
    });
  }
}

module.exports = { data, execute };
