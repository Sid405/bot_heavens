const importData = require("../data/catalog-import.json");
const Catalog = require("../models/Catalog");

const BRL_PER_ROBUX = 0.03499;

function normalizeGameName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function calculateProductPrice(robux) {
  const amount = Number(robux);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return Math.round(amount * BRL_PER_ROBUX * 100) / 100;
}

function normalizeImportedCategories(categories) {
  return (Array.isArray(categories) ? categories : []).map((category) => ({
    ...category,
    products: (Array.isArray(category.products) ? category.products : []).map((product) => {
      const price = calculateProductPrice(product.robux);
      return price === null ? product : { ...product, price };
    }),
  }));
}

function updateDocumentPrices(game) {
  let updatedProducts = 0;

  for (const category of game.categories || []) {
    for (const product of category.products || []) {
      const price = calculateProductPrice(product.robux);
      if (price === null || product.price === price) continue;
      product.price = price;
      updatedProducts += 1;
    }
  }

  return updatedProducts;
}

async function importMissingGames() {
  const existing = await Catalog.find({});
  const knownGames = new Map(
    existing.map((game) => [normalizeGameName(game.name), game])
  );

  let inserted = 0;
  let ignored = 0;
  let updatedProducts = 0;

  for (const game of importData.games) {
    const normalized = normalizeGameName(game.name);
    const existingGame = knownGames.get(normalized);

    if (existingGame) {
      const changed = updateDocumentPrices(existingGame);
      if (changed > 0) {
        await existingGame.save();
        updatedProducts += changed;
      }
      ignored += 1;
      continue;
    }

    const created = await Catalog.create({
      name: game.name,
      emoji: game.emoji,
      group: game.group,
      active: true,
      categories: normalizeImportedCategories(game.categories),
    });

    knownGames.set(normalized, created);
    inserted += 1;
  }

  console.log(
    `Importação do catálogo: ${inserted} jogo(s) novo(s), ${ignored} existente(s), ${updatedProducts} preço(s) atualizado(s) para R$ 34,99/1.000 Robux.`
  );

  return { inserted, ignored, updatedProducts };
}

module.exports = {
  BRL_PER_ROBUX,
  calculateProductPrice,
  importMissingGames,
  normalizeGameName,
};
