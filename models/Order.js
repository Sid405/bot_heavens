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
