const importData = require("../data/catalog-import.json");
const Catalog = require("../models/Catalog");

function normalizeGameName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

async function importMissingGames() {
  const existing = await Catalog.find({}, { name: 1 }).lean();
  const knownNames = new Set(existing.map((game) => normalizeGameName(game.name)));

  let inserted = 0;
  let ignored = 0;

  for (const game of importData.games) {
    const normalized = normalizeGameName(game.name);
    if (knownNames.has(normalized)) {
      ignored += 1;
      continue;
    }

    await Catalog.create({
      name: game.name,
      emoji: game.emoji,
      group: game.group,
      active: true,
      categories: game.categories,
    });

    knownNames.add(normalized);
    inserted += 1;
  }

  console.log(
    `Importação do catálogo: ${inserted} jogo(s) novo(s) adicionado(s), ${ignored} existente(s) ignorado(s).`
  );

  return { inserted, ignored };
}

module.exports = { importMissingGames, normalizeGameName };
