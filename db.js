const mongoose = require("mongoose");

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI não está definida. Configure essa variável de ambiente.");
    process.exit(1);
  }
  try {
    await mongoose.connect(uri);
    console.log("Conectado ao MongoDB Atlas.");
  } catch (err) {
    console.error("Falha ao conectar ao MongoDB:", err.message);
    process.exit(1);
  }
}

module.exports = { connectDB };
