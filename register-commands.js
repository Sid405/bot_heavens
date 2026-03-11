// Registra os slash commands via REST API do Discord.
// Execute com: node register-commands.js
// Ou chame registerCommands() programaticamente na inicialização do bot.
require("dotenv").config();

const { REST, Routes } = require("discord.js");
const path = require("path");
const fs = require("fs");

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID;
const GUILD_ID = process.env.DISCORD_GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error(
    "DISCORD_BOT_TOKEN e DISCORD_CLIENT_ID são obrigatórios para registrar os comandos."
  );
  process.exit(1);
}

function loadCommands() {
  const commandsDir = path.join(__dirname, "commands");
  const files = fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"));
  return files.map((file) => {
    const cmd = require(path.join(commandsDir, file));
    return cmd.data.toJSON();
  });
}

async function registerCommands() {
  const commands = loadCommands();
  const rest = new REST({ version: "10" }).setToken(TOKEN);

  try {
    console.log(`Registrando ${commands.length} slash command(s)...`);

    if (GUILD_ID) {
      // Registro por guild (instantâneo — recomendado durante desenvolvimento)
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), {
        body: commands,
      });
      console.log(`✅ Slash commands registrados na guild ${GUILD_ID}.`);
    } else {
      // Registro global (pode levar até 1 hora para propagar)
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log("✅ Slash commands registrados globalmente.");
    }
  } catch (err) {
    console.error("Erro ao registrar slash commands:", err);
    throw err;
  }
}

module.exports = { registerCommands };

// Execução direta: node register-commands.js
if (require.main === module) {
  registerCommands().catch((err) => {
    console.error("Erro fatal ao registrar slash commands:", err);
    process.exit(1);
  });
}
