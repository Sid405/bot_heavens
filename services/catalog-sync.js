const importData = require("../data/catalog-import.json");
const Catalog = require("../models/Catalog");

const OLD_BRL_PER_ROBUX = 0.034;
const BRL_PER_ROBUX = 0.03499;

function normalizeKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeGameName(value) {
  return normalizeKey(value);
}

function roundBRL(value) {
  return Math.round(Number(value) * 100) / 100;
}

function calculateProductPrice(robux) {
  const amount = Number(robux);
  if (!Number.isFinite(amount) || amount < 0) return null;
  return roundBRL(amount * BRL_PER_ROBUX);
}

function inferRobuxFromLegacyPrice(price) {
  const amount = Number(price);
  if (!Number.isFinite(amount) || amount < 0) return null;

  const inferredRobux = Math.round(amount / OLD_BRL_PER_ROBUX);
  const expectedOldPrice = roundBRL(inferredRobux * OLD_BRL_PER_ROBUX);

  // Só aceita a inferência quando o preço atual realmente bate com a fórmula antiga.
  if (Math.abs(expectedOldPrice - amount) > 0.011) return null;
  return inferredRobux;
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

function buildImportedProductLookup(importedGame) {
  const byCategory = new Map();
  const byUniqueName = new Map();
  const duplicatedNames = new Set();

  for (const category of importedGame.categories || []) {
    const categoryKey = normalizeKey(category.name);
    const productMap = new Map();

    for (const product of category.products || []) {
      const productKey = normalizeKey(product.name);
      productMap.set(productKey, product);

      if (byUniqueName.has(productKey)) {
        duplicatedNames.add(productKey);
      } else {
        byUniqueName.set(productKey, product);
      }
    }

    byCategory.set(categoryKey, productMap);
  }

  for (const key of duplicatedNames) {
    byUniqueName.delete(key);
  }

  return { byCategory, byUniqueName };
}

function syncExistingGamePrices(existingGame, importedGame) {
  const lookup = buildImportedProductLookup(importedGame);
  let sourceMatched = 0;
  let existingRobuxUsed = 0;
  let legacyPriceInferred = 0;
  let updatedProducts = 0;
  let skippedProducts = 0;

  for (const category of existingGame.categories || []) {
    const categoryProducts = lookup.byCategory.get(normalizeKey(category.name));

    for (const product of category.products || []) {
      const productKey = normalizeKey(product.name);
      const sourceProduct =
        categoryProducts?.get(productKey) || lookup.byUniqueName.get(productKey);

      let robux = null;

      if (sourceProduct && Number.isFinite(Number(sourceProduct.robux))) {
        robux = Number(sourceProduct.robux);
        sourceMatched += 1;
      } else if (Number.isFinite(Number(product.robux)) && Number(product.robux) >= 0) {
        robux = Number(product.robux);
        existingRobuxUsed += 1;
      } else {
        robux = inferRobuxFromLegacyPrice(product.price);
        if (robux !== null) legacyPriceInferred += 1;
      }

      if (robux === null) {
        skippedProducts += 1;
        continue;
      }

      const price = calculateProductPrice(robux);
      let changed = false;

      if (Number(product.robux) !== robux) {
        product.robux = robux;
        changed = true;
      }

      if (price !== null && Number(product.price) !== price) {
        product.price = price;
        changed = true;
      }

      if (changed) updatedProducts += 1;
    }
  }

  return {
    sourceMatched,
    existingRobuxUsed,
    legacyPriceInferred,
    updatedProducts,
    skippedProducts,
  };
}

async function importMissingGames() {
  const existing = await Catalog.find({});
  const knownGames = new Map(
    existing.map((game) => [normalizeGameName(game.name), game])
  );

  let inserted = 0;
  let existingGames = 0;
  let sourceMatched = 0;
  let existingRobuxUsed = 0;
  let legacyPriceInferred = 0;
  let updatedProducts = 0;
  let skippedProducts = 0;

  for (const importedGame of importData.games) {
    const normalized = normalizeGameName(importedGame.name);
    const existingGame = knownGames.get(normalized);

    if (existingGame) {
      const result = syncExistingGamePrices(existingGame, importedGame);

      if (result.updatedProducts > 0) {
        await existingGame.save();
      }

      existingGames += 1;
      sourceMatched += result.sourceMatched;
      existingRobuxUsed += result.existingRobuxUsed;
      legacyPriceInferred += result.legacyPriceInferred;
      updatedProducts += result.updatedProducts;
      skippedProducts += result.skippedProducts;
      continue;
    }

    const created = await Catalog.create({
      name: importedGame.name,
      emoji: importedGame.emoji,
      group: importedGame.group,
      active: true,
      categories: normalizeImportedCategories(importedGame.categories),
    });

    knownGames.set(normalized, created);
    inserted += 1;
  }

  console.log(
    `Sincronização do catálogo: ${inserted} jogo(s) novo(s), ${existingGames} existente(s), ` +
      `${sourceMatched} produto(s) pelo arquivo-base, ${existingRobuxUsed} pelo Robux salvo, ` +
      `${legacyPriceInferred} inferido(s) pela fórmula antiga, ${updatedProducts} atualizado(s) para ` +
      `R$ 34,99/1.000 Robux, ${skippedProducts} ignorado(s) por segurança.`
  );

  return {
    inserted,
    existingGames,
    sourceMatched,
    existingRobuxUsed,
    legacyPriceInferred,
    updatedProducts,
    skippedProducts,
  };
}

module.exports = {
  BRL_PER_ROBUX,
  calculateProductPrice,
  importMissingGames,
  normalizeGameName,
};
