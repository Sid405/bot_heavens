const mongoose = require("mongoose");

const configSchema = new mongoose.Schema(
  {
    _id: String,
    panels: { type: [mongoose.Schema.Types.Mixed], default: [] },
  },
  { _id: false }
);

const Config = mongoose.model("Config", configSchema);

module.exports = Config;
