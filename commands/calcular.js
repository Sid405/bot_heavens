const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");
const { getStoreConfig } = require("../services/configService");

const data = new SlashCommandBuilder()
  .setName("calcular")
  .setDescription("Calcula o valor de Robux ou Gamepass")
  .addIntegerOption((opt) =>
    opt
      .setName("quantidade")
      .setDescription("Quantidade de Robux (mínimo: 1000)")
      .setRequired(true)
      .setMinValue(1000)
  )
  .addStringOption((opt) =>
    opt
      .setName("tipo")
      .setDescription("Tipo de compra")
      .setRequired(true)
      .addChoices(
        { name: "Robux (Conta)", value: "robux" },
        { name: "Robux (Gamepass)", value: "gamepass" }
      )
  );

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const store = await getStoreConfig();
    const pricing = store.pricing;

    const quantidade = interaction.options.getInteger("quantidade");
    const tipo = interaction.options.getString("tipo");

    const minQty = pricing.minQuantity || 1000;
    if (quantidade < minQty) {
      return interaction.editReply({
        content: `❌ Quantidade mínima: **${minQty.toLocaleString("pt-BR")} Robux**.`,
      });
    }

    const isGamepass = tipo === "gamepass";
    const valorPor1000 = isGamepass
      ? pricing.gamepassPer1000
      : pricing.robuxPer1000;
    const prazo = isGamepass
      ? pricing.deliveryHoursGamepass
      : pricing.deliveryHoursRobux;

    const total = (quantidade / 1000) * valorPor1000;

    const embed = new EmbedBuilder()
      .setTitle("💰 Simulação de Valor")
      .setColor(0x57f287)
      .addFields(
        {
          name: "Tipo",
          value: isGamepass ? "Gamepass 🎮" : "Robux (Conta) 💎",
          inline: true,
        },
        {
          name: "Quantidade",
          value: `${quantidade.toLocaleString("pt-BR")} Robux`,
          inline: true,
        },
        {
          name: "Valor Total",
          value: `R$ ${total.toFixed(2).replace(".", ",")}`,
          inline: true,
        },
        {
          name: "Prazo de Entrega",
          value: `Até ${prazo} hora${prazo !== 1 ? "s" : ""}`,
          inline: true,
        }
      )
      .setFooter({ text: "Valores sujeitos a alteração sem aviso prévio." });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    console.error("[/calcular] Erro:", err);
    await interaction.editReply({
      content: "❌ Erro ao calcular o valor. Tente novamente.",
    });
  }
}

module.exports = { data, execute };
