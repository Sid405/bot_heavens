const mongoose = require("mongoose");

async function connectDatabase() {
  const uri = process.env.MONGODB_URI?.trim();
  if (!uri) {
    throw new Error("A variável MONGODB_URI não foi definida.");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15_000,
  });

  console.log("Catálogo conectado ao MongoDB.");
}

module.exports = { connectDatabase };
