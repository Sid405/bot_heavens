# Especificação do painel (dashboard) — estilo Dyno

Este doc descreve o que o **site no Lovable** precisa fazer para ser o painel de configuração do bot (como o site do Dyno).

## Visão geral

- **Painel** = site feito no Lovable (front + backend se precisar).
- **Bot** = este projeto; ao rodar, sobe o Discord bot + API em `CONFIG_API_PORT` (ex: 3001).
- O painel **lê** a config atual (GET) e **salva** alterações (PATCH/POST) na API do bot. A API usa `CONFIG_API_KEY` no header `Authorization: Bearer ...` para autorizar escrita.

## Onde a API do bot fica

- Em desenvolvimento: bot no seu PC → API em `http://localhost:3001`. O site Lovable (outro domínio) chama essa URL; por isso a API tem **CORS** habilitado.
- Em produção: bot rodando em um VPS/servidor → você usa a URL pública, ex: `https://seu-servidor.com:3001` ou o IP. No painel você configura essa URL como "API do bot".

## Endpoints

| Método | URL | Auth | Uso |
|--------|-----|------|-----|
| GET | `/api/config` | Não (hoje) | Carregar config para exibir no painel |
| PATCH | `/api/config` | Sim (Bearer) | Salvar alterações (recomendado) |
| POST | `/api/config` | Sim (Bearer) | Substituir config inteira |

Header para PATCH/POST:  
`Authorization: Bearer <CONFIG_API_KEY>`

## Estrutura da config (JSON)

O painel deve exibir e enviar um objeto com:

```ts
{
  menu: {
    placeholder: string;   // texto do dropdown antes de escolher
    mainTitle: string;      // título do embed do /menu
    mainDescription: string;
  };
  options: Array<{
    value: string;   // id único, ex: "regras"
    label: string;   // texto no dropdown
    description?: string;
    emoji?: string;  // um emoji, ex: "📜"
  }>;   // máx. 25
  embeds: Record<string, {
    title: string;
    description: string;
    color: string;   // hex sem #, ex: "5865f2"
  }>;   // chave = value da opção (ex: "regras")
}
```

- **options**: cada item vira uma linha do select menu no Discord. O `value` é o id usado em **embeds**.
- **embeds**: para cada `value` (ex: `regras`), o objeto com `title`, `description`, `color` é o embed que o usuário vê ao escolher essa opção.

Exemplo completo: **`config.example.json`**.

## Sugestão de telas no Lovable

1. **Configuração / Login**
   - Campo: URL da API (ex: `http://localhost:3001` ou URL do servidor).
   - Campo: Chave da API (CONFIG_API_KEY). Guardar no estado ou localStorage (evitar colocar em código).

2. **Página principal do painel**
   - Seção **Menu**: inputs para `menu.mainTitle`, `menu.mainDescription`, `menu.placeholder`.
   - Seção **Opções do dropdown**: lista de `options`. Cada item: value, label, description, emoji. Botões adicionar/remover. Máx. 25.
   - Seção **Embeds**: para cada `value` que existir em `options`, um card com título, descrição e cor do embed. (Pode gerar automaticamente um embed por opção.)

3. **Ao abrir**
   - GET `{API_URL}/api/config`, preencher os campos.

4. **Ao salvar**
   - Montar o objeto `{ menu, options, embeds }` e fazer PATCH `{API_URL}/api/config` com header `Authorization: Bearer {API_KEY}` e body JSON. Mostrar "Salvo!" ou erro.

Com isso o site vira um **painel estilo Dyno** para configurar o bot pelo navegador.
