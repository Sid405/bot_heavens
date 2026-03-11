const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getStoreConfig } = require("../services/configService");
const { log } = require("../services/logService");

const data = new SlashCommandBuilder()
  .setName("entregar")
  .setDescription("Registra a entrega de um pedido (placeholder MVP)")
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
      .setTitle("📦 Entrega Registrada")
      .setColor(0xfee75c)
      .setDescription(`O pedido **${orderId}** está sendo entregue.`)
      .addFields(
        { name: "Responsável", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Status", value: "Em entrega 🚚", inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const logMsg = `📦 Entrega iniciada para pedido **${orderId}** por <@${interaction.user.id}>`;
    await log(client, store, logMsg, false);
  } catch (err) {
    console.error("[/entregar] Erro:", err);
    await interaction.editReply({
      content: "❌ Erro ao registrar a entrega. Tente novamente.",
    });
  }
}

module.exports = { data, execute };
