const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, default: null },
    ticketMessageId: { type: String, default: null },
    userId: { type: String, required: true },
    robloxUserId: { type: String, default: null },
    robloxUsername: { type: String, default: null },
    robloxDisplayName: { type: String, default: null },
    productType: {
      type: String,
      enum: ["robux", "gamepass"],
      default: "robux",
    },
    quantity: { type: Number, default: 0 },
    couponCode: { type: String, default: null },
    discountAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    gamepassLink: { type: String, default: null },
    gamepassRequiredRobux: { type: Number, default: null },
    codexPaymentId: { type: String, default: null },
    // Carrinho in-game
    cartItems: {
      type: [{
        gameName: String,
        gameEmoji: String,
        categoryName: String,
        productName: String,
        price: Number,
        quantity: { type: Number, default: 1 },
        subtotal: { type: Number, default: 0 },
      }],
      default: [],
    },
    catalogMenuMessageId: { type: String, default: null },
    // Campos do catálogo in-game
    catalogGameId: { type: String, default: null },
    catalogGameName: { type: String, default: null },
    catalogGameEmoji: { type: String, default: null },
    catalogCategoryName: { type: String, default: null },
    catalogProductName: { type: String, default: null },
    status: {
      type: String,
      enum: [
        "open",
        "pending_payment",
        "paid",
        "awaiting_gamepass",
        "delivered",
        "cancelled",
      ],
      default: "open",
    },
  },
  { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);
module.exports = Order;
