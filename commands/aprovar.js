const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getStoreConfig } = require("../services/configService");
const { log } = require("../services/logService");

const data = new SlashCommandBuilder()
  .setName("aprovar")
  .setDescription("Aprova um pedido (placeholder MVP)")
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
      .setTitle("✅ Pedido Aprovado")
      .setColor(0x57f287)
      .setDescription(`O pedido **${orderId}** foi marcado como **aprovado**.`)
      .addFields(
        { name: "Aprovado por", value: `<@${interaction.user.id}>`, inline: true },
        { name: "Canal", value: `<#${interaction.channelId}>`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });

    const logMsg = `✅ Pedido **${orderId}** aprovado por <@${interaction.user.id}> em <#${interaction.channelId}>`;
    await log(client, store, logMsg, false);
  } catch (err) {
    console.error("[/aprovar] Erro:", err);
    await interaction.editReply({
      content: "❌ Erro ao aprovar o pedido. Tente novamente.",
    });
  }
}

module.exports = { data, execute };
