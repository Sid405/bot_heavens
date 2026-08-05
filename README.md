# Heaven's Market — painéis + catálogo

Bot secundário dedicado somente a:

- Termos e Políticas;
- Como apoiar;
- FAQ;
- catálogo de jogos e produtos.

Não contém loja automática, tickets, PIX, pedidos, API, site ou comandos comerciais.

## Variáveis da hospedagem

```env
DISCORD_TOKEN=
MONGODB_URI=
```

Também aceita `DISCORD_BOT_TOKEN` como nome alternativo para o token.

## Canais

- Termos: `1395903363324973186`
- Como apoiar: `1395903365954928792`
- FAQ: `1395903395671576668`
- Catálogo: `1475966115954819123`

Os IDs podem ser substituídos opcionalmente pelas variáveis:

- `TERMS_CHANNEL_ID`
- `SUPPORT_CHANNEL_ID`
- `FAQ_CHANNEL_ID`
- `CATALOG_CHANNEL_ID`

## Sincronização

Ao iniciar, o bot:

1. conecta ao MongoDB e ao Discord;
2. importa somente jogos que ainda não existem;
3. localiza ou cria as mensagens dos três painéis informativos;
4. localiza ou cria os três painéis do catálogo;
5. edita as mensagens existentes nas próximas inicializações, evitando duplicação;
6. remove duplicatas conhecidas publicadas pelo mesmo bot.

Os textos de Termos, Como apoiar e FAQ ficam no código e não dependem da coleção `configs`.
O MongoDB é usado para o catálogo e para armazenar os IDs das mensagens sincronizadas.

## Catálogo incluído

O arquivo de importação contém 44 jogos e 664 produtos. O preço é calculado por:

```text
Robux × 0,034
```

Jogos já existentes no MongoDB são ignorados, sem substituir seus produtos.

## Início

```bash
npm install
npm start
```

Node.js 20.19 ou superior.
