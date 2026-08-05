const mongoose = require("mongoose");

const panelMessageSchema = new mongoose.Schema(
  {
    channelId: { type: String, required: true },
    messageId: { type: String, required: true },
  },
  { _id: false }
);

const botStateSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    panelMessages: {
      type: Map,
      of: panelMessageSchema,
      default: {},
    },
  },
  { timestamps: true }
);

module.exports = mongoose.models.BotState || mongoose.model("BotState", botStateSchema);
