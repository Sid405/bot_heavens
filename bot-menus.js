/**
 * Envia ou atualiza as mensagens de menu em cada canal configurado.
 * Usa message-ids.json para guardar IDs e editar em vez de criar duplicatas.
 */
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./config-loader");

const MESSAGE_IDS_PATH = path.join(__dirname, "message-ids.json");

function loadMessageIds() {
  try {
    if (fs.existsSync(MESSAGE_IDS_PATH)) {
      return JSON.parse(fs.readFileSync(MESSAGE_IDS_PATH, "utf8"));
    }
  } catch (e) {
    console.warn("Erro ao ler message-ids.json:", e.message);
  }
  return {};
}

function saveMessageId(panelId, channelId, messageId) {
  const data = loadMessageIds();
  data[panelId] = { channelId, messageId };
  fs.writeFileSync(MESSAGE_IDS_PATH, JSON.stringify(data, null, 2), "utf8");
}

function clearMessageId(panelId) {
  const data = loadMessageIds();
  delete data[panelId];
  fs.writeFileSync(MESSAGE_IDS_PATH, JSON.stringify(data, null, 2), "utf8");
}

async function refreshMenus(client, createEmbed, createMenuRow) {
  if (!client?.isReady()) return;

  const config = loadConfig();
  const panels = config.panels || [];
  const messageIds = loadMessageIds();

  for (const panel of panels) {
    const channelId = panel.channelId;
    if (!channelId || typeof channelId !== "string" || channelId.trim() === "") continue;

    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        console.warn(`Canal ${channelId} (painel "${panel.name}") não encontrado.`);
        continue;
      }

      const payload = {
        embeds: [createEmbed(panel)],
      };
      const row = createMenuRow(panel);
      if (row) payload.components = [row];

      const stored = messageIds[panel.id];
      const channelChanged = stored && stored.channelId !== channelId;

      if (stored?.messageId && !channelChanged) {
        try {
          const msg = await channel.messages.fetch(stored.messageId).catch(() => null);
          if (msg) {
            await msg.edit(payload);
            continue;
          }
        } catch {
          // Mensagem deletada, postar nova
        }
      }

      if (channelChanged && stored?.channelId) {
        try {
          const oldChannel = await client.channels.fetch(stored.channelId).catch(() => null);
          if (oldChannel) {
            const oldMsg = await oldChannel.messages.fetch(stored.messageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
          }
        } catch {
          // Ignorar
        }
        clearMessageId(panel.id);
      }

      const sent = await channel.send(payload);
      saveMessageId(panel.id, channelId, sent.id);
    } catch (e) {
      console.error(`Erro ao enviar menu do painel "${panel.name}" no canal ${channelId}:`, e.message);
    }
  }
}

module.exports = { refreshMenus, loadMessageIds, saveMessageId, clearMessageId };
