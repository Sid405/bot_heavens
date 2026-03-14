# O que mudar em cada arquivo para o bot funcionar

Este arquivo explica **tudo** que você precisa alterar nos arquivos do bot para ele funcionar. Siga na ordem.

---

## Antes de começar: o que você precisa ter

1. **Conta no Discord** e um **servidor** onde o bot vai entrar.
2. **Aplicação do bot no Discord:**
   - Acesse: https://discord.com/developers/applications
   - Clique em **New Application** e dê um nome (ex: "Meu Bot").
   - No menu da esquerda: **Bot** → **Add Bot**.
   - Em **Token**, clique em **Reset Token** e copie o token (guarde em lugar seguro; não compartilhe).
   - No menu da esquerda: **General Information** → copie o **Application ID** (é o Client ID que o bot usa).
3. **Convidar o bot para o servidor:**
   - **OAuth2** → **URL Generator**.
   - Em **Scopes** marque: `bot` e `applications.commands`.
   - Em **Bot Permissions** marque pelo menos: Send Messages, Embed Links, Use Application Commands (e as que você precisar).
   - Copie a URL gerada, abra no navegador, escolha seu servidor e autorize.

Depois disso você tem:
- **Token do bot** (ex: `MTM1ODI1NDg4...`)
- **Client ID** = Application ID (ex: `1358254889947631769`)

---

## 1. Arquivo `.env` (obrigatório para o bot rodar)

O bot **não** usa token dentro do código. Tudo fica no `.env`.

### O que fazer

1. Na pasta do bot (`discord-bot`), **copie** o arquivo `.env.example` e salve como **`.env`** (sem o .example).
   - No Windows (PowerShell): `Copy-Item .env.example .env`
   - Ou: crie um arquivo novo chamado `.env` e copie o conteúdo de `.env.example` para dentro.

2. **Abra o arquivo `.env`** e troque **apenas** estas duas linhas:

| O que está no .env              | O que você coloca                                      |
|---------------------------------|--------------------------------------------------------|
| `DISCORD_BOT_TOKEN=seu_token_do_bot` | `DISCORD_BOT_TOKEN=SEU_TOKEN_REAL` (o token que você copiou do Discord) |
| `DISCORD_CLIENT_ID=id_da_aplicacao_do_bot` | `DISCORD_CLIENT_ID=SEU_APPLICATION_ID` (o Application ID da sua aplicação) |

Exemplo (use seus valores de verdade):

```env
DISCORD_BOT_TOKEN=MTM1ODI1NDg4OTk0NzYzMTc2OQ.xxxxx.xxxxxxxxxxxx
DISCORD_CLIENT_ID=1358254889947631769
```

- **Não** deixe espaços em volta do `=`.
- **Não** coloque o token ou o .env no Git, nem mande para ninguém.

Só com isso o bot já pode rodar. O resto do `.env` é opcional (para o painel no site).

### Opcional: se você for usar o painel no site (Lovable)

No mesmo `.env`, descomente ou adicione:

```env
CONFIG_API_KEY=uma_senha_forte_que_voce_escolher
CONFIG_API_PORT=3001
```

- **CONFIG_API_KEY**: qualquer senha que você inventar; o site usa essa senha no header para poder salvar a config. Troque `uma_senha_forte_que_voce_escolher` por algo só seu.
- **CONFIG_API_PORT**: porta onde a API do painel sobe (3001 já está ok; só mude se precisar).

Se você **não** colocar `CONFIG_API_KEY`, o bot roda normal, mas a API do painel não sobe. O bot (comando `/menu`) funciona do mesmo jeito.

### Opcional: loja de Robux e Gamepass (`/loja`)

#### Fluxo de dois passos do `/loja`

O comando `/loja` usa o seguinte fluxo:

1. **Tela inicial** — exibe o embed "Heaven's Market" com **2 botões**:
   - **💎 Comprar Robux!**
   - **🎮 Comprar Gamepass!**
2. **Clique em qualquer botão** — o bot cria um **canal de ticket** imediatamente na categoria configurada, posta os termos de uso dentro do ticket com o botão **📝 Inserir Nickname do Roblox**, e remove os botões da mensagem original.
3. **Dentro do ticket** — o usuário clica em **Inserir Nickname do Roblox**, confirma a conta Roblox, define a quantidade e segue para o pagamento.

O produto escolhido (Robux ou Gamepass) é salvo no pedido para que a equipe saiba o que entregar.

**Preços:**
- **Robux:** R$ 0,045 por Robux taxado (1 000 → R$ 45,00)
- **Gamepass:** R$ 0,034 por Robux taxado (1 000 → R$ 34,00)
- **Gamepass — valor da gamepass:** calculado como `ceil(quantidadeTaxada / 0,7)` (ex.: 1 000 Robux taxados → criar gamepass com 1 429 Robux)

> **Obs.:** Qualquer membro pode clicar nos botões da home e abrir seu próprio ticket.

Para usar os comandos `/loja` e `/pedidos-pendentes`, adicione ao `.env`:

```env
# ID da categoria do Discord onde os tickets de compra serão criados
SHOP_CATEGORY_ID=123456789012345678

# Preço de 1 Robux em reais (ex: 0.045 = R$ 0,045 por Robux)
ROBUX_PRICE_BRL=0.045

# Preço de 1 Robux em reais para compra via Gamepass
GAMEPASS_PRICE_BRL=0.034

# Chave PIX para geração do código Copia e Cola (deixe em branco para usar placeholder)
PIX_KEY=sua_chave_pix_aqui
PIX_MERCHANT_NAME=Nome da Loja
PIX_CITY=Sua Cidade
```

| Variável | Obrigatória? | Descrição |
|---|---|---|
| `SHOP_CATEGORY_ID` | Não (padrão: `1395903305623932979`) | ID da categoria onde os tickets são criados |
| `ROBUX_PRICE_BRL` | Não (padrão: `0.045`) | Valor em reais por unidade de Robux (compra normal) |
| `GAMEPASS_PRICE_BRL` | Não (padrão: `0.034`) | Valor em reais por unidade de Robux (compra via Gamepass) |
| `PIX_KEY` | Não | Chave PIX (CPF, email, celular ou chave aleatória). Se vazia, exibe placeholder |
| `PIX_MERCHANT_NAME` | Não (padrão: `Loja`) | Nome que aparece no código PIX |
| `PIX_CITY` | Não (padrão: `Brasil`) | Cidade que aparece no código PIX |

> **Permissões necessárias para a loja:** o bot precisa de **Manage Channels** na categoria de tickets e **Send Messages** + **Embed Links** nos canais criados.

> **Slash commands:** os comandos `/loja` e `/pedidos-pendentes` são registrados automaticamente ao iniciar o bot. Pode levar alguns minutos para aparecerem no Discord pela primeira vez.

> **Admin:** o comando `/pedidos-pendentes` requer permissão de **Administrator** no servidor.

---

## 2. Arquivo `config.json` (opcional — texto do menu e dos embeds)

O bot mostra o menu e os embeds com base na **config**. Se não existir `config.json`, ele usa um padrão interno.

### Se quiser personalizar sem usar o site

1. **Copie** o arquivo `config.example.json` e salve como **`config.json`** (na mesma pasta do bot).
2. **Abra `config.json`** e edite o que quiser:

| Parte do arquivo | O que é | O que mudar |
|------------------|--------|--------------|
| **menu.placeholder** | Texto do dropdown antes da pessoa escolher | Ex: "Escolha uma opção..." |
| **menu.mainTitle** | Título da mensagem quando alguém usa /menu | Ex: "Menu do Meu Servidor" |
| **menu.mainDescription** | Texto que aparece abaixo do título no /menu | Sua descrição |
| **options** | Lista das opções do dropdown (máx. 25) | Cada item tem: **value** (id interno, sem espaços), **label** (texto no menu), **description** (texto menor), **emoji** (um emoji). Pode adicionar, remover ou mudar. |
| **embeds** | O que aparece quando a pessoa escolhe cada opção | Para cada **value** (ex: "regras", "links"), você define **title**, **description** e **color** (cor em hex **sem** #, ex: "5865f2"). |

- O **value** de cada opção em `options` tem que ter um correspondente em **embeds** (com o mesmo nome da chave). Ex: se tem `"value": "regras"` em options, em `embeds` precisa ter `"regras": { "title": "...", "description": "...", "color": "..." }`.
- Se você **não** criar `config.json`, o bot usa o padrão (Regras, Cargos, Ajuda, Links, Informações). Ou seja, **não é obrigatório** criar esse arquivo para o bot funcionar.

---

## 3. Arquivo `index.js`

**Você não precisa mudar nada aqui** para o bot funcionar.

- O token e o Client ID vêm do `.env` (ele lê `DISCORD_BOT_TOKEN` e `DISCORD_CLIENT_ID`).
- O conteúdo do menu e dos embeds vem do `config.json` (ou do padrão).

Só mexa no `index.js` se quiser alterar a lógica do bot (por exemplo, outros comandos).

---

## 4. Arquivo `api.js`

**Não precisa mudar nada.**

- A porta e a chave da API vêm do `.env` (`CONFIG_API_PORT` e `CONFIG_API_KEY`).
- Esse arquivo só é carregado quando você define `CONFIG_API_KEY` no `.env`.

---

## 5. Arquivo `config-loader.js`

**Não precisa mudar nada.**

- Ele só lê o `config.json` (ou o padrão) e entrega os dados para o `index.js`. Não tem token nem nada que você precise configurar.

---

## 6. Arquivos `package.json`, `config.example.json`, `.env.example`

- **package.json**: não precisa alterar para o bot rodar.
- **config.example.json**: é só um modelo; você edita o **config.json** (ou copia o example para config.json e edita).
- **.env.example**: é só um modelo; você edita o **.env** (veja o item 1).

---

## Resumo: o que é obrigatório mudar

| Arquivo    | Obrigatório? | O que fazer |
|-----------|----------------|-------------|
| **.env**  | **Sim**        | Criar a partir de `.env.example` e preencher **DISCORD_BOT_TOKEN** e **DISCORD_CLIENT_ID** com seus valores do Discord. |
| config.json | Não        | Opcional. Se quiser personalizar menu e embeds sem usar o site, copie `config.example.json` para `config.json` e edite. |
| index.js  | Não            | Não precisa mudar. |
| api.js    | Não            | Não precisa mudar. |
| config-loader.js | Não     | Não precisa mudar. |

---

## Depois de configurar: como rodar

Na pasta do bot (`discord-bot`):

```bash
npm install
npm start
```

- **npm install**: instala as dependências (só precisa fazer uma vez).
- **npm start**: inicia o bot (e a API do painel, se tiver `CONFIG_API_KEY` no .env).

Quando aparecer algo como "Bot online: SeuBot#1234", o bot está no ar. No Discord, use `/menu` (ou `!menu` / `?menu`) em qualquer canal para testar.

---

## Problemas comuns

- **"Defina DISCORD_BOT_TOKEN e DISCORD_CLIENT_ID"**  
  O arquivo `.env` não existe ou está com nome errado, ou as variáveis estão vazias. Crie/edite o `.env` na pasta do bot com os dois valores corretos.

- **Bot não responde no Discord**  
  Confira se o token é o correto (e se você fez Reset Token no Discord e atualizou o .env). Confira se o bot foi convidado com as permissões **Send Messages**, **Embed Links** e **Use Application Commands**.

- **Comando /menu não aparece**  
  Pode levar alguns minutos para o Discord atualizar os comandos. Tente reiniciar o bot e esperar um pouco.

- **Quero mudar os textos do menu**  
  Edite o `config.json` (ou crie a partir de `config.example.json`). O bot lê de novo a cada vez que alguém usa o menu; não precisa reiniciar para mudar texto.

Se algo não funcionar, confira de novo o **.env** (token e Client ID) e se o bot está no servidor com as permissões certas.
