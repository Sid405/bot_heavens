const data = require("./data/catalog-import.json");
const { GROUPS } = require("./config");
const { PANELS } = require("./services/static-panels");
const { calculateProductPrice } = require("./services/catalog-sync");

const games = data.games || [];
const productCount = games.reduce(
  (total, game) =>
    total + game.categories.reduce(
      (sum, category) => sum + category.products.length,
      0
    ),
  0
);

if (games.length !== 44) {
  throw new Error(`Esperado: 44 jogos. Encontrado: ${games.length}.`);
}

if (productCount !== 664) {
  throw new Error(`Esperado: 664 produtos. Encontrado: ${productCount}.`);
}

for (const game of games) {
  if (!GROUPS.some((group) => group.name === game.group)) {
    throw new Error(`Grupo inválido em ${game.name}: ${game.group}`);
  }

  for (const category of game.categories) {
    for (const product of category.products) {
      const expected = calculateProductPrice(product.robux);
      if (expected === null) {
        throw new Error(`Robux inválido em ${game.name} / ${product.name}.`);
      }
    }
  }
}

const expectedPanels = ["terms", "support", "faq"];
for (const panelId of expectedPanels) {
  const panel = PANELS[panelId];
  if (!panel) throw new Error(`Painel ausente: ${panelId}`);
  if (!panel.options.length) throw new Error(`Painel sem opções: ${panelId}`);
  if (panel.options.length > 25) throw new Error(`Painel acima do limite: ${panelId}`);
  if (panel.main.title.length > 256) throw new Error(`Título principal longo: ${panelId}`);
  if (panel.main.description.length > 4096) throw new Error(`Descrição principal longa: ${panelId}`);

  for (const option of panel.options) {
    if (!panel.responses[option.value]) {
      throw new Error(`Resposta ausente: ${panelId}/${option.value}`);
    }
    const response = panel.responses[option.value];
    if (response.title.length > 256) {
      throw new Error(`Título de resposta longo: ${panelId}/${option.value}`);
    }
    if (response.description.length > 4096) {
      throw new Error(`Descrição de resposta longa: ${panelId}/${option.value}`);
    }
  }
}

console.log(
  `Validação concluída: ${games.length} jogos, ${productCount} produtos, preços calculados a R$ 34,99/1.000 Robux e ${expectedPanels.length} painéis informativos.`
);
