const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    robux: { type: Number, min: 0 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: true }
);

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    products: { type: [productSchema], default: [] },
  },
  { _id: true }
);

const catalogSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    emoji: { type: String, default: "🎮" },
    group: { type: String, default: "Aventura & Diversos", index: true },
    active: { type: Boolean, default: true, index: true },
    categories: { type: [categorySchema], default: [] },
  },
  { timestamps: true }
);

module.exports = mongoose.models.Catalog || mongoose.model("Catalog", catalogSchema);
