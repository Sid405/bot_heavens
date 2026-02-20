# O que o bot faz — para criar o painel no Lovable

## Funcionalidade principal

O bot cria um **menu interativo** no Discord com **dropdown (select menu)** e **embeds**. Quando alguém usa o comando `/menu` (ou `!menu` / `?menu`), o bot envia uma mensagem com:

1. Um **embed** de boas-vindas (título e descrição configuráveis)
2. Um **dropdown** com várias opções (ex: "Regras", "Cargos", "Links", etc.)

Quando o usuário escolhe uma opção no dropdown, ele recebe um **embed personalizado** só para ele (ephemeral — não polui o canal).

**Objetivo:** concentrar várias informações (regras, cargos, links, ajuda) em um único servidor usando um menu organizado, em vez de ter vários servidores separados.

---

## O que o painel precisa gerenciar

O painel (site no Lovable) deve permitir editar **3 coisas principais**:

### 1. **Configuração do menu principal**

Quando alguém usa `/menu`, aparece um embed com título e descrição. O painel deve ter campos para:

- **Título do menu** (`menu.mainTitle`) — ex: "📋 Menu Principal — Tudo em um servidor"
- **Descrição do menu** (`menu.mainDescription`) — ex: "Use o dropdown abaixo para acessar as opções..."
- **Placeholder do dropdown** (`menu.placeholder`) — texto que aparece antes da pessoa escolher, ex: "📌 Escolha uma opção..."

### 2. **Opções do dropdown (select menu)**

Lista de opções que aparecem no dropdown. Cada opção tem:

- **Value** (`value`) — ID interno único (sem espaços, ex: "regras", "links", "ajuda")
- **Label** (`label`) — texto que aparece no dropdown (ex: "📜 Regras")
- **Description** (`description`) — texto menor abaixo do label (ex: "Ver as regras do servidor")
- **Emoji** (`emoji`) — um emoji (ex: "📜", "🔗")

**Limite:** máximo de 25 opções (limite do Discord).

O painel deve permitir:
- Adicionar nova opção
- Editar opção existente
- Remover opção
- Reordenar (opcional, mas útil)

### 3. **Embeds (resposta de cada opção)**

Para cada opção do dropdown (identificada pelo `value`), quando o usuário escolhe, ele recebe um embed. O painel deve permitir editar:

- **Título do embed** (`embeds.{value}.title`) — ex: "📜 Regras do Servidor"
- **Descrição do embed** (`embeds.{value}.description`) — o texto principal (pode ter várias linhas, markdown funciona)
- **Cor do embed** (`embeds.{value}.color`) — cor em hexadecimal **sem** o `#` (ex: "5865f2" para azul, "57f287" para verde)

**Importante:** cada `value` da lista de opções precisa ter um embed correspondente. Se você cria uma opção com `value: "regras"`, precisa ter `embeds.regras` configurado.

---

## Como o painel se conecta ao bot

O bot expõe uma **API HTTP** que o painel chama. Quando você roda o bot, ele sobe em uma porta (ex: 3001) e a API fica disponível.

### Endpoints da API

| Método | URL | O que faz |
|--------|-----|-----------|
| **GET** | `/api/config` | Retorna a configuração atual (para o painel carregar e exibir) |
| **PATCH** | `/api/config` | Salva alterações na configuração (recomendado — mescla com o que já existe) |
| **POST** | `/api/config` | Substitui toda a configuração |

### Autenticação

Para **PATCH** e **POST**, o painel precisa enviar no header:

```
Authorization: Bearer {CONFIG_API_KEY}
```

Onde `CONFIG_API_KEY` é uma senha que o dono do bot configura no `.env` do bot.

### Estrutura do JSON (o que o painel envia/recebe)

```json
{
  "menu": {
    "placeholder": "📌 Escolha uma opção...",
    "mainTitle": "📋 Menu Principal",
    "mainDescription": "Use o dropdown abaixo..."
  },
  "options": [
    {
      "value": "regras",
      "label": "📜 Regras",
      "description": "Ver as regras do servidor",
      "emoji": "📜"
    },
    {
      "value": "links",
      "label": "🔗 Links",
      "description": "Links importantes",
      "emoji": "🔗"
    }
  ],
  "embeds": {
    "regras": {
      "title": "📜 Regras do Servidor",
      "description": "• Respeite todos\n• Sem spam",
      "color": "5865f2"
    },
    "links": {
      "title": "🔗 Links Úteis",
      "description": "Aqui estão os links...",
      "color": "eb459e"
    }
  }
}
```

---

## Sugestão de telas do painel

### Tela 1: Configuração / Login
- Campo: **URL da API** (ex: `http://localhost:3001` ou `https://meu-servidor.com:3001`)
- Campo: **Chave da API** (`CONFIG_API_KEY`)
- Botão: "Conectar" — testa a conexão fazendo GET `/api/config`

### Tela 2: Dashboard principal
Três seções:

**Seção 1: Menu Principal**
- Input: Título do menu
- Textarea: Descrição do menu
- Input: Placeholder do dropdown

**Seção 2: Opções do Dropdown**
- Lista de cards (um por opção):
  - Input: Value (ID)
  - Input: Label (texto no menu)
  - Input: Description
  - Input: Emoji
  - Botão: Remover
- Botão: "+ Adicionar opção"
- Aviso: "Máximo 25 opções"

**Seção 3: Embeds**
- Para cada opção que existe em "Opções do Dropdown", um card:
  - Input: Título do embed
  - Textarea: Descrição do embed
  - Input: Cor (hex sem #) + seletor de cor visual (opcional)
- Se não existir embed para uma opção, criar automaticamente ao salvar

### Botão principal: "Salvar configuração"
- Faz PATCH `/api/config` com o JSON completo
- Mostra "Salvo!" ou mensagem de erro

---

## Exemplo de uso no Discord

1. Usuário digita `/menu` em um canal
2. Bot responde com embed: "📋 Menu Principal — Tudo em um servidor" + dropdown com opções
3. Usuário clica no dropdown e escolhe "📜 Regras"
4. Bot responde só para ele (ephemeral) com embed: "📜 Regras do Servidor" + texto das regras

---

## Resumo para o Lovable

**Bot:** Discord bot com menu interativo (dropdown + embeds)

**Painel precisa gerenciar:**
- Título e descrição do menu principal
- Lista de opções do dropdown (até 25)
- Para cada opção: título, descrição e cor do embed que aparece quando o usuário escolhe

**API do bot:**
- GET `/api/config` — carregar config atual
- PATCH `/api/config` — salvar (com header `Authorization: Bearer {chave}`)

**Formato:** JSON com `menu`, `options` (array) e `embeds` (objeto onde a chave é o `value` da opção).
