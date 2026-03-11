const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getStoreConfig } = require("../services/configService");
const { log } = require("../services/logService");

const data = new SlashCommandBuilder()
  .setName("entregue")
  .setDescription("Marca um pedido como entregue (placeholder MVP)")
  .addStringOption((opt) =>
    opt
      .setName("orderid")
      .setDescription("ID do pedido (opcional)")
      .setRequired(false)
  );

async function execute(interaction, client) {
  await interaction.deferReply();
  try {
    const orderId = interaction.options.getString("orderid") || "N/A";
    const store = await getStoreConfig();

    const embed = new EmbedBuilder()
      .setTitle("✅ Pedido Entregue")
      .setColor(0x57f287)
      .setDescription(
        `O pedido **${orderId}** foi marcado como **entregue** com sucesso!`
      )
      .addFields(
        { name: "Entregue por", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Status", value: "Entregue ✅", inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const logMsg = `✅ Pedido **${orderId}** marcado como entregue por <@${interaction.user.id}>`;
    await log(client, store, logMsg, true);
  } catch (err) {
    console.error("[/entregue] Erro:", err);
    await interaction.editReply({
      content: "❌ Erro ao marcar o pedido como entregue. Tente novamente.",
    });
  }
}

module.exports = { data, execute };
