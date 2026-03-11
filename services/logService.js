async function sendLog(client, channelId, message) {
  if (channelId) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (channel && channel.isTextBased()) {
        await channel.send(message);
        return;
      }
    } catch (err) {
      console.error("[logService] Falha ao enviar log para o canal:", err);
    }
  }
  if (typeof message === "string") {
    console.log(`[LOG] ${message}`);
  } else if (message && message.content) {
    console.log(`[LOG] ${message.content}`);
  } else {
    console.log("[LOG]", JSON.stringify(message));
  }
}

async function log(client, storeConfig, entry, isPrivate = false) {
  const channelId = isPrivate
    ? storeConfig?.logs?.privateChannelId
    : storeConfig?.logs?.publicChannelId;
  await sendLog(client, channelId, entry);
}

module.exports = { log, sendLog };
