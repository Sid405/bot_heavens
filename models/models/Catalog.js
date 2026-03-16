const mongoose = require("mongoose");

const productSchema = new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true }, // em BRL
});

const categorySchema = new mongoose.Schema({
  name: { type: String, required: true }, // ex: "Gamepass", "Frutas", "Moedas"
  products: [productSchema],
});

const catalogSchema = new mongoose.Schema(
  {
    name: { type: String, required: true }, // ex: "Blox Fruits"
    emoji: { type: String, default: "🎮" },
    group: { type: String, default: "Outros" }, // ex: "Anime & Luta", "Simuladores & RPG"
    active: { type: Boolean, default: true },
    categories: [categorySchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Catalog", catalogSchema);
