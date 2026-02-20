# Bot Discord — Menu (dropdown) + Embeds

Bot com **select menu** (dropdown) e **embeds** para concentrar tudo em um único servidor. Você pode editar o menu e os textos **pelo código**, pelo **arquivo config.json** ou pelo **site (Lovable)** via API.

## ⚠️ Segurança do token

- **Nunca** coloque o token do bot no código nem no Git.
- Use sempre o arquivo **`.env`** (ele está no `.gitignore`).
- Se o token vazar, vá em [Discord Developer Portal](https://discord.com/developers/applications) → sua aplicação → **Bot** → **Reset Token** e gere um novo.

---

## O que o bot faz

- Comando **`/menu`** (ou **`!menu`** / **`?menu`**) que envia uma mensagem com embed e **dropdown**.
- Ao escolher uma opção no dropdown, o usuário recebe um **embed** (resposta só para ele, ephemeral).
- O conteúdo do menu e dos embeds vem do **config** (arquivo ou API), então você pode mudar tudo pelo **site Lovable**.

## Como configurar

### 1. Criar o bot no Discord

1. Acesse [Discord Developer Portal](https://discord.com/developers/applications)
2. **New Application** → dê um nome
3. Aba **Bot** → **Add Bot** → em **Token** use **Reset Token** e copie (guarde em lugar seguro)
4. Aba **OAuth2** → **URL Generator** — Scopes: `bot`, `applications.commands` — depois abra a URL e adicione o bot ao servidor

O **Client ID** está na aba **General Information** da aplicação.

### 2. Instalar e rodar

```bash
cd discord-bot
npm install
```

Copie o exemplo de env e preencha com seu **novo** token e o Client ID:

```bash
copy .env.example .env
```

Edite o **`.env`**:

```
DISCORD_BOT_TOKEN=seu_novo_token_aqui
DISCORD_CLIENT_ID=id_da_aplicacao
```

Depois:

```bash
npm start
```

### 3. Usar no Discord

Em qualquer canal: **`/menu`** (ou **`!menu`** / **`?menu`**). Use o dropdown para ver Regras, Cargos, Ajuda, Links, Informações.

---

## Painel no site (estilo Dyno)

A ideia é a mesma do **Dyno** e outros bots: você entra num **site (dashboard)** e configura o bot por lá — sem mexer em código. O site que você for criar no **Lovable** é esse painel.

- O **bot** fica rodando (no seu PC ou em um servidor) e abre a **API** (porta 3001).
- O **site** (feito no Lovable) é o painel onde você edita título do menu, opções do dropdown e texto de cada embed.
- Quando você clica em **Salvar** no site, ele chama a API do bot e a config é salva. No Discord, o próximo `/menu` já usa a config nova.

Ou seja: **um site normal onde você configura o bot**, como no Dyno.

### O que o painel (Lovable) precisa ter

1. **Login / API Key** — uma tela onde você coloca a URL da API (ex: `https://onde-o-bot-roda.com:3001`) e a chave (`CONFIG_API_KEY`). O site guarda isso (ex: no localStorage ou no backend) para usar nas requisições.
2. **Config do menu** — campos para:
   - Título da mensagem do menu
   - Descrição da mensagem
   - Texto do placeholder do dropdown (ex: "Escolha uma opção...")
3. **Opções do dropdown** — lista editável: para cada opção, **value** (id interno), **label** (texto no menu), **description** (texto menor), **emoji**. Botão "Adicionar opção" e "Remover". Máximo 25 opções (limite do Discord).
4. **Embeds** — para cada opção do menu (pelo **value**), um bloco: **título**, **descrição**, **cor** (hex sem #). Assim quando o usuário escolhe "Regras" no dropdown, o embed que aparece é o que você configurou aqui.
5. **Botão Salvar** — envia **PATCH** (ou POST) para `/api/config` com `Authorization: Bearer SUA_API_KEY` e o JSON da config. Depois mostra "Configuração salva".

Ao abrir o painel, o site faz **GET** `/api/config` (com a API key se você proteger o GET também; hoje o GET é público) para preencher os campos com a config atual.

Detalhes da API e do JSON estão abaixo e em **`config.example.json`**. Um resumo técnico para o painel está em **`DASHBOARD.md`**.

### Como funciona (técnico)

1. No **`.env`** do bot, defina uma chave secreta para a API:

```
CONFIG_API_KEY=uma_senha_forte_que_voce_escolher
CONFIG_API_PORT=3001
```

2. Ao rodar `npm start`, além do bot, sobe um servidor HTTP na porta `3001` (ou a que você definiu).

3. O site Lovable pode:
   - **GET** `http://SEU_SERVIDOR:3001/api/config` — ler a config atual (para exibir no painel).
   - **POST** ou **PATCH** `http://SEU_SERVIDOR:3001/api/config` — atualizar a config.  
     Envie o header: `Authorization: Bearer SUA_CONFIG_API_KEY` e o body em JSON.

### Exemplo de body para POST/PATCH

```json
{
  "menu": {
    "mainTitle": "Meu Menu",
    "mainDescription": "Descrição do menu."
  },
  "options": [
    { "value": "regras", "label": "📜 Regras", "description": "Ver regras", "emoji": "📜" },
    { "value": "links", "label": "🔗 Links", "description": "Links úteis", "emoji": "🔗" }
  ],
  "embeds": {
    "regras": {
      "color": "5865f2",
      "title": "📜 Regras",
      "description": "Suas regras aqui."
    }
  }
}
```

No Lovable, use **fetch** ou **axios** do front para chamar o backend; o backend do Lovable (ou um serverless) deve chamar a API do bot com a `CONFIG_API_KEY` no header. Se o bot e o site estiverem no mesmo servidor, a URL pode ser `http://localhost:3001`.

### Estrutura completa da config

Veja **`config.example.json`** para ver todos os campos (menu, options, embeds). Copie para `config.json` e edite, ou deixe o site criar/atualizar via API.

---

## Personalizar sem site

- **config.json** — copie `config.example.json` para `config.json` e edite. O bot lê esse arquivo a cada uso do menu.
- **config.example.json** — referência dos campos (menu, options, embeds com title, description, color).

Assim você mantém um único servidor e pode mudar tudo pelo arquivo ou pelo site Lovable.

---

## Hospedagem gratuita

Para deixar o bot online 24/7, você pode hospedar em:

### Railway (recomendado)
1. Coloque o código no GitHub (veja **`COMO-COLOCAR-NO-GITHUB.md`**)
2. Acesse https://railway.app e faça login com GitHub
3. **New Project** → **Deploy from GitHub repo**
4. Selecione seu repositório
5. Em **Variables**, adicione: `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID` (e opcionalmente `CONFIG_API_KEY`, `CONFIG_API_PORT`)
6. Pronto! Bot online 24/7.

**Limite grátis:** $5 de crédito/mês (suficiente para bot simples).

### Render
1. Coloque no GitHub
2. Acesse https://render.com e faça login com GitHub
3. **New** → **Web Service** → conecte seu repo
4. Configure: Build Command = `npm install`, Start Command = `npm start`
5. Adicione as variáveis de ambiente em **Environment**
6. **Create Web Service**

**Limite grátis:** serviço pode "dormir" após inatividade (não ideal para bot que precisa estar sempre online).

### Outras opções
- **Replit**: https://replit.com (importa do GitHub, mas precisa ficar ativo)
- **Oracle Cloud**: VPS sempre grátis (mais técnico)

Veja o guia completo em **`COMO-COLOCAR-NO-GITHUB.md`**.
