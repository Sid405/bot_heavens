const {
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");

const PANEL_COLOR = 0x4b303f;
const OFFICIAL_FOOTER = "Heaven's Market • Informações oficiais";

const PANELS = Object.freeze({
  terms: {
    id: "terms",
    customId: "hm:panel:terms",
    titleCandidates: [
      "📄 Termos e Políticas — Heaven's Market",
      "📄 Termos — Heaven's Market",
    ],
    main: {
      title: "📄 Termos e Políticas — Heaven's Market",
      description:
        "Leia as informações antes de comprar ou utilizar os serviços da **Heaven's Market**.\n\n" +
        "📄 **Termos de Serviço:** produtos, pagamentos, prazo de entrega, dados incorretos e reembolsos.\n" +
        "📘 **Termos de Uso:** atendimento, tickets, conduta e utilização dos canais oficiais.\n\n" +
        "Selecione uma opção abaixo para consultar.",
    },
    placeholder: "📄 Escolha um termo...",
    options: [
      {
        label: "Termos de Serviço",
        value: "terms_service",
        description: "Compras, entregas, dados e reembolsos",
        emoji: "📄",
      },
      {
        label: "Termos de Uso",
        value: "terms_use",
        description: "Atendimento, tickets e uso dos serviços",
        emoji: "📘",
      },
    ],
    responses: {
      terms_service: {
        title: "📄 Termos de Serviço — Heaven's Market",
        description:
          "Leia antes de comprar. Ao realizar o pagamento, você confirma que conferiu os dados do pedido e concorda com estas condições.\n\n" +
          "📦 **Produtos e prazo**\n" +
          "• Vendemos produtos e Gamepasses por gift, além de Robux por Gamepass ou via grupo.\n" +
          "• A entrega é realizada em até **48 horas após a confirmação do pagamento.**\n" +
          "• Para Robux via grupo, a conta precisa estar no grupo há pelo menos **15 dias.**\n" +
          "• Em Robux por Gamepass, as 48 horas correspondem à compra da Gamepass. Depois disso, os Robux ficam pendentes pelo prazo definido pelo Roblox, normalmente de 5 a 7 dias.\n\n" +
          "✅ **Confira antes de pagar**\n" +
          "Verifique nick, conta, jogo, produto, quantidade, preço, link e valor da Gamepass.\n" +
          "Para produtos dentro de jogos, confirme se existe gift e se ele não exige nível, missão, passe ou outro desbloqueio.\n\n" +
          "Se a entrega for feita corretamente conforme os dados enviados pelo cliente, não haverá reembolso nem novo envio gratuito. Robux e produtos já utilizados não podem ser recuperados pela loja. Se o erro for avisado antes da entrega, os dados poderão ser corrigidos.\n\n" +
          "💰 **Valor informado incorretamente**\n" +
          "Se o total real ultrapassar o valor pago, o cliente poderá escolher produtos dentro do limite, pagar a diferença ou decidir o destino do saldo restante: outro produto, Robux quando possível ou reembolso proporcional. Nada será escolhido sem autorização.\n\n" +
          "🔄 **Reembolsos**\n" +
          "• Desistência ou erro do cliente antes da entrega: **95% do valor reembolsável**, devido à taxa de 5% da gateway.\n" +
          "• Falha da Heaven's Market após as 48 horas: o cliente escolhe entre continuar aguardando ou receber **100% do valor pago.**\n" +
          "• Pedido entregue corretamente conforme os dados enviados: sem reembolso ou reenvio gratuito.\n\n" +
          "Falhas do Roblox ou dos jogos podem causar atrasos. As entregas poderão ser comprovadas pelo histórico do ticket, prints e registros das transações.",
      },
      terms_use: {
        title: "📘 Termos de Uso — Heaven's Market",
        description:
          "Ao utilizar o atendimento e os serviços da Heaven's Market, você concorda com as condições abaixo.\n\n" +
          "💬 **Atendimento oficial**\n" +
          "• Atendimento e negociações devem ocorrer pelos canais oficiais e tickets.\n" +
          "• Não realize pagamentos por mensagem privada.\n" +
          "• A gateway confirma os pagamentos automaticamente. Em caso de instabilidade, a equipe poderá verificar a transação e aprovar o carrinho manualmente.\n" +
          "• Não envie dados pessoais ou comprovantes em canais públicos.\n\n" +
          "🎫 **Tickets**\n" +
          "• Abra apenas um ticket por assunto.\n" +
          "• Explique o pedido ou problema com clareza e envie as informações solicitadas.\n" +
          "• Não marque a equipe repetidamente nem abra vários tickets para tentar furar a fila.\n" +
          "• Tickets abandonados poderão ser encerrados.\n\n" +
          "🚫 **Condutas proibidas**\n" +
          "Não é permitido falsificar comprovantes, mentir sobre pagamentos ou entregas, tentar receber o mesmo pedido novamente, usar contas alternativas para evitar punições ou divulgar links e serviços sem autorização.\n\n" +
          "⚠️ **Punições**\n" +
          "Dependendo da gravidade, o usuário poderá receber advertência, ter o ticket encerrado ou ser banido. O banimento não cancela automaticamente pedidos já pagos, que continuarão sendo analisados conforme os Termos de Serviço.",
      },
    },
  },

  support: {
    id: "support",
    customId: "hm:panel:support",
    titleCandidates: [
      "🏅 Como apoiar a Heaven's Market",
      "💖 Como apoiar a Heaven's Market",
      "🤝 Como apoiar a Heaven's Market",
    ],
    main: {
      title: "🏅 Como apoiar a Heaven's Market",
      description:
        "Conheça as formas de apoiar a **Heaven's Market** e os benefícios de cada uma.\n\n" +
        "💸 **Afiliados:** divulgue seu cupom e receba comissão pelas vendas concluídas.\n" +
        "🎬 **Parcerias:** colaboração com criadores de conteúdo e comunidades.\n" +
        "💎 **VIP:** informações e benefícios do cargo.\n" +
        "❤️ **Booster:** vantagens para quem impulsiona o servidor.\n\n" +
        "Selecione uma opção abaixo para saber mais.",
    },
    placeholder: "🏅 Escolha uma opção...",
    options: [
      {
        label: "Programa de Afiliados",
        value: "support_affiliates",
        description: "Ganhe comissão usando seu cupom",
        emoji: "💸",
      },
      {
        label: "Parceria com Criadores",
        value: "support_partners",
        description: "Divulgação para criadores e comunidades",
        emoji: "🎬",
      },
      {
        label: "Cargo VIP",
        value: "support_vip",
        description: "Informações e benefícios do cargo",
        emoji: "💎",
      },
      {
        label: "Vantagens do Booster",
        value: "support_booster",
        description: "Benefícios por impulsionar o servidor",
        emoji: "❤️",
      },
    ],
    responses: {
      support_affiliates: {
        title: "💸 Programa de Afiliados",
        description:
          "Divulgue a **Heaven's Market** usando seu cupom exclusivo e receba comissão pelas vendas concluídas.\n\n" +
          "**Como funciona**\n" +
          "• Você recebe um cupom personalizado.\n" +
          "• O cliente utiliza o cupom durante a compra.\n" +
          "• Após o pedido ser pago e concluído, você recebe a porcentagem definida para o seu cupom.\n" +
          "• Pedidos cancelados, reembolsados ou não pagos não geram comissão.\n\n" +
          "**Exemplo:** em uma venda de **R$100** com comissão de **10%**, você recebe **R$10**.\n\n" +
          "O percentual e as demais condições são informados pela equipe. Para participar, abra o canal `🔗・suporte` e diga onde pretende divulgar a loja.",
      },
      support_partners: {
        title: "🎬 Parceria com Criadores",
        description:
          "Produz conteúdo no TikTok, YouTube ou outra plataforma e quer divulgar a **Heaven's Market**?\n\n" +
          "Abra o canal `🔗・suporte` e envie:\n" +
          "• link do canal ou perfil;\n" +
          "• quantidade de seguidores;\n" +
          "• média de visualizações;\n" +
          "• tipo de conteúdo produzido;\n" +
          "• proposta de divulgação.\n\n" +
          "Cada perfil é analisado individualmente. Parceiros aprovados poderão receber cupom personalizado, comissão pelas vendas, condições especiais em compras, apoio para campanhas e outros benefícios definidos na parceria.",
      },
      support_vip: {
        title: "💎 VIP — Em reformulação",
        description:
          "Os benefícios e a forma de obtenção do cargo VIP estão sendo atualizados.\n\n" +
          "Quando o novo sistema estiver pronto, todas as informações serão publicadas neste painel. Por enquanto, o cargo VIP não está disponível para novas solicitações.",
      },
      support_booster: {
        title: "❤️ Vantagens do Booster",
        description:
          "Ao impulsionar o servidor da **Heaven's Market**, você recebe benefícios enquanto o boost permanecer ativo:\n\n" +
          "• cargo de Booster em destaque;\n" +
          "• desconto em compras acima de R$15;\n" +
          "• 10% de bônus nas recompensas de eventos;\n" +
          "• quatro vezes mais entradas em sorteios;\n" +
          "• acesso a sorteios exclusivos;\n" +
          "• permissão para alterar o apelido;\n" +
          "• envio de links, imagens, vídeos e GIFs nos canais permitidos;\n" +
          "• permissão para transmitir a tela;\n" +
          "• acesso a emojis externos.\n\n" +
          "O valor do desconto e a disponibilidade dos benefícios podem ser confirmados com a equipe. Obrigado por apoiar o servidor!",
      },
    },
  },

  faq: {
    id: "faq",
    customId: "hm:panel:faq",
    titleCandidates: [
      "❓ FAQ — Heaven's Market",
      "📋 Dúvidas Gerais",
    ],
    main: {
      title: "❓ FAQ — Heaven's Market",
      description:
        "Encontre respostas sobre compras, entregas e o funcionamento dos serviços da **Heaven's Market**.\n\n" +
        "Neste menu você encontra informações sobre **Robux, taxa do Roblox, Gamepasses, tutoriais de compra e convites do servidor.**\n\n" +
        "Selecione o assunto desejado. Caso sua dúvida não esteja listada, abra o canal `🔗・suporte`.",
    },
    placeholder: "❓ Escolha uma dúvida...",
    options: [
      {
        label: "Dúvidas sobre Robux",
        value: "faq_robux",
        description: "Métodos de entrega, prazos e requisitos",
        emoji: "🪙",
      },
      {
        label: "Taxa do Roblox",
        value: "faq_tax",
        description: "Entenda a diferença entre com e sem taxa",
        emoji: "📊",
      },
      {
        label: "Dúvidas sobre Gamepasses",
        value: "faq_gamepasses",
        description: "Entrega, disponibilidade e prazo",
        emoji: "🎮",
      },
      {
        label: "Como comprar Gamepass",
        value: "faq_buy_gamepass",
        description: "Passo a passo no bot de vendas",
        emoji: "📦",
      },
      {
        label: "Como comprar Robux",
        value: "faq_buy_robux",
        description: "Passo a passo no bot de vendas",
        emoji: "💰",
      },
      {
        label: "Como convidar",
        value: "faq_invite",
        description: "Convide seus amigos para o servidor",
        emoji: "✉️",
      },
    ],
    responses: {
      faq_robux: {
        title: "🪙 Dúvidas sobre Robux",
        description:
          "A **Heaven's Market** trabalha com Robux com a taxa do Roblox já coberta. A entrega pode ocorrer de duas formas:\n\n" +
          "**Por Gamepass**\n" +
          "A equipe compra a Gamepass enviada pelo cliente em até **48 horas após o pagamento.** Depois da compra, os Robux ficam pendentes pelo prazo do Roblox, normalmente de 5 a 7 dias.\n\n" +
          "**Via grupo**\n" +
          "O cliente deve informar o nick correto e estar no grupo há pelo menos **15 dias.** Quando a conta estiver apta e o pagamento confirmado, a entrega será realizada em até 48 horas.\n\n" +
          "Em qualquer método, confira cuidadosamente o nick, a conta e os dados enviados. Se a entrega for feita conforme uma informação incorreta fornecida pelo cliente, não haverá reembolso nem novo envio gratuito.",
      },
      faq_tax: {
        title: "📊 Como funciona a taxa do Roblox?",
        description:
          "Nas vendas por Gamepass, o Roblox desconta **30%** do valor.\n\n" +
          "**Robux sem taxa coberta**\n" +
          "Uma Gamepass de 1.000 Robux gera aproximadamente 700 Robux para o vendedor.\n\n" +
          "**Robux com taxa coberta**\n" +
          "O valor da Gamepass é ajustado para que, depois do desconto, você receba exatamente a quantidade comprada.\n\n" +
          "A **Heaven's Market** trabalha com Robux com a taxa coberta. Para consultar ou calcular valores, utilize o canal `🛠️・comandos`.",
      },
      faq_gamepasses: {
        title: "🎮 Dúvidas sobre Gamepasses",
        description:
          "Os produtos são enviados pelo sistema de gift disponível dentro de cada jogo. Dependendo do jogo, a entrega pode ser global ou exigir que o cliente aceite amizade e entre no mesmo servidor do entregador.\n\n" +
          "Vendemos apenas produtos de jogos que possuem gift e que não exigem nível, missão, passe ou outro desbloqueio para liberar o envio. Mesmo assim, confirme essas informações e os valores antes de pagar.\n\n" +
          "Se o jogo ou produto não estiver cadastrado, abra o canal `🔗・suporte` e informe o nome do jogo, o produto e o valor correto para análise.\n\n" +
          "O prazo de entrega é de até **48 horas após a confirmação do pagamento.**",
      },
      faq_buy_gamepass: {
        title: "📦 Como comprar Gamepass",
        description:
          "1. Acesse o canal `📄・compre-aqui` e escolha **Gamepass.**\n" +
          "2. No ticket privado, leia os termos e inicie a compra.\n" +
          "3. Selecione o jogo e os produtos desejados. Se não encontrar, escolha **Não estou vendo meu jogo** e responda ao que o bot solicitar.\n" +
          "4. Abra o carrinho. Você poderá continuar comprando, adicionar um cupom ou esvaziar o carrinho.\n" +
          "5. Clique em **Ir para o pagamento** e pague pelo Pix gerado.\n" +
          "6. A gateway aprovará o pagamento automaticamente. Em caso de instabilidade, a equipe poderá aprovar o carrinho manualmente após verificar a transação.\n" +
          "7. Informe e confirme corretamente seu nick do Roblox.\n" +
          "8. Aguarde um entregador continuar o atendimento no ticket.\n\n" +
          "Confira o jogo, os produtos e os valores antes de pagar.",
      },
      faq_buy_robux: {
        title: "💰 Como comprar Robux",
        description:
          "1. Acesse o canal `📄・compre-aqui` e escolha **Robux.**\n" +
          "2. No ticket privado, leia os termos e inicie a compra.\n" +
          "3. Informe seu nick e confirme se a conta exibida é realmente a sua.\n" +
          "4. Escolha a quantidade desejada. O mínimo é **99 Robux**; para alterar, use **Selecionar uma opção → Alterar quantidade.**\n" +
          "5. Confira a quantidade, o valor e finalize o pagamento pelo Pix gerado.\n" +
          "6. A gateway aprovará o pagamento automaticamente. Em caso de instabilidade, a equipe poderá verificar e aprovar o carrinho manualmente.\n" +
          "7. O bot tentará localizar sua Gamepass. Se não encontrar, escolha **Inserir ID da Gamepass** e envie o ID correto.\n" +
          "8. A equipe comprará a Gamepass manualmente em até **48 horas após o pagamento.** Depois da compra, os Robux normalmente ficam pendentes de 5 a 7 dias, conforme o Roblox.\n\n" +
          "Confira o nick e a Gamepass antes de confirmar.",
      },
      faq_invite: {
        title: "✉️ Como convidar alguém",
        description:
          "Abra a **Heaven's Market** no Discord, clique no nome do servidor e selecione **Convidar pessoas.** Depois, copie o link e envie para quem deseja convidar.\n\n" +
          "No celular, a opção também aparece ao tocar no nome do servidor ou no botão de convite.\n\n" +
          "Link oficial: https://discord.gg/heavensmarket\n\n" +
          "Não faça spam nem divulgue em locais onde convites não sejam permitidos.",
      },
    },
  },
});

function buildEmbed(data) {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle(data.title)
    .setDescription(data.description)
    .setFooter({ text: OFFICIAL_FOOTER });
}

function buildPanelPayload(panel) {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(panel.customId)
    .setPlaceholder(panel.placeholder)
    .addOptions(panel.options);

  return {
    embeds: [buildEmbed(panel.main)],
    components: [new ActionRowBuilder().addComponents(menu)],
    allowedMentions: { parse: [] },
  };
}

function findPanelByCustomId(customId) {
  return Object.values(PANELS).find((panel) => panel.customId === customId) || null;
}

function findResponse(panel, value) {
  return panel?.responses?.[value] || null;
}

module.exports = {
  OFFICIAL_FOOTER,
  PANELS,
  PANEL_COLOR,
  buildEmbed,
  buildPanelPayload,
  findPanelByCustomId,
  findResponse,
};
