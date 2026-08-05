require("dotenv").config();

const { Client, Events, GatewayIntentBits } = require("discord.js");
const mongoose = require("mongoose");
const { connectDatabase } = require("./db");
const { importMissingGames } = require("./services/catalog-sync");
const { syncAllPanels } = require("./services/panel-sync");
const { handleInteraction } = require("./services/interactions");

const token = (process.env.DISCORD_TOKEN || process.env.DISCORD_BOT_TOKEN || "").trim();
if (!token) {
  console.error("A variável DISCORD_TOKEN não foi definida.");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Bot conectado: ${readyClient.user.tag}`);

  try {
    await importMissingGames();
    await syncAllPanels(readyClient);
  } catch (error) {
    console.error("Falha ao sincronizar o catálogo ou os painéis:", error);
  }
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleInteraction(interaction);
  } catch (error) {
    console.error("Erro ao processar interação:", error);

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: "Ocorreu um erro ao consultar esta opção." }).catch(() => {});
    } else {
      await interaction.reply({
        content: "Ocorreu um erro ao consultar esta opção.",
        ephemeral: true,
      }).catch(() => {});
    }
  }
});

process.on("unhandledRejection", (error) => {
  console.error("Promessa rejeitada sem tratamento:", error);
});

process.on("uncaughtException", (error) => {
  console.error("Erro não capturado:", error);
});

async function shutdown(signal) {
  console.log(`Recebido ${signal}. Encerrando...`);
  client.destroy();
  await mongoose.disconnect().catch(() => {});
  process.exit(0);
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

connectDatabase()
  .then(() => client.login(token))
  .catch((error) => {
    console.error("Não foi possível iniciar o bot:", error.message);
    process.exit(1);
  });
