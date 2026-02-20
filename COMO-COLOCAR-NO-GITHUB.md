# Como colocar o bot no GitHub e hospedar gratuitamente

## Parte 1: Colocar no GitHub

### Passo 1: Criar repositório no GitHub

1. Acesse: https://github.com/new
2. **Repository name**: escolha um nome (ex: `meu-bot-discord` ou `discord-menu-bot`)
3. **Description** (opcional): "Bot Discord com menu dropdown e embeds"
4. Escolha **Public** ou **Private** (recomendo Private se você não quer que outros vejam seu código)
5. **NÃO** marque "Add a README file" (já temos um)
6. Clique em **Create repository**

### Passo 2: Instalar Git (se ainda não tiver)

Se você não tem Git instalado:

1. Baixe: https://git-scm.com/download/win
2. Instale (só clicar "Next" em tudo)
3. Abra o **PowerShell** ou **Git Bash**

### Passo 3: Configurar Git (só uma vez)

No PowerShell ou Git Bash, digite:

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
```

(Use o mesmo email da sua conta GitHub)

### Passo 4: Inicializar o Git na pasta do bot

Abra o PowerShell ou Git Bash na pasta do bot:

```bash
cd C:\Users\poder\discord-bot
```

Depois execute:

```bash
git init
git add .
git commit -m "Primeiro commit - bot Discord com menu e embeds"
```

### Passo 5: Conectar com o GitHub e fazer push

No GitHub, depois de criar o repositório, você vai ver uma página com instruções. Use a parte "push an existing repository":

```bash
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git branch -M main
git push -u origin main
```

Substitua `SEU_USUARIO` e `SEU_REPOSITORIO` pelos seus valores.

Exemplo:
- Se seu usuário é `joaosilva` e o repo é `meu-bot-discord`:
```bash
git remote add origin https://github.com/joaosilva/meu-bot-discord.git
git branch -M main
git push -u origin main
```

Se pedir login, use seu usuário e senha do GitHub (ou um token de acesso pessoal).

---

## Parte 2: Hospedar gratuitamente

### Opção 1: Railway (recomendado — mais fácil)

1. Acesse: https://railway.app
2. Faça login com GitHub
3. Clique em **New Project**
4. Escolha **Deploy from GitHub repo**
5. Selecione seu repositório (`meu-bot-discord` ou o nome que você deu)
6. Railway vai detectar que é Node.js automaticamente
7. Vá em **Variables** (ou **Settings** → **Variables**)
8. Adicione as variáveis de ambiente:
   - `DISCORD_BOT_TOKEN` = seu token do bot
   - `DISCORD_CLIENT_ID` = seu Client ID
   - (Opcional) `CONFIG_API_KEY` = uma senha
   - (Opcional) `CONFIG_API_PORT` = 3001
9. O bot vai iniciar automaticamente!

**Limite grátis:** $5 de crédito por mês (suficiente para um bot simples rodar 24/7).

---

### Opção 2: Render

1. Acesse: https://render.com
2. Faça login com GitHub
3. Clique em **New** → **Web Service**
4. Conecte seu repositório do GitHub
5. Configure:
   - **Name**: nome do serviço (ex: `meu-bot-discord`)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
6. Vá em **Environment** e adicione as variáveis:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_CLIENT_ID`
   - (Opcional) `CONFIG_API_KEY`
   - (Opcional) `CONFIG_API_PORT`
7. Clique em **Create Web Service**

**Limite grátis:** o serviço "dorme" após 15 minutos sem uso, mas acorda quando alguém acessa. Para bot Discord, pode não ser ideal (o bot precisa ficar sempre online). Mas funciona!

---

### Opção 3: Replit

1. Acesse: https://replit.com
2. Faça login com GitHub
3. Clique em **Create Repl**
4. Escolha **Import from GitHub**
5. Cole a URL do seu repositório (ex: `https://github.com/SEU_USUARIO/meu-bot-discord`)
6. Clique em **Import**
7. No Replit, vá em **Secrets** (ícone de cadeado na barra lateral)
8. Adicione:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_CLIENT_ID`
   - (Opcional) `CONFIG_API_KEY`
9. Clique em **Run**

**Limite grátis:** o Repl fica online enquanto você está usando. Para ficar 24/7, precisa do plano pago ou usar um "keep-alive" (há serviços que fazem isso).

---

### Opção 4: Oracle Cloud (sempre grátis — VPS)

1. Acesse: https://www.oracle.com/cloud/free/
2. Crie uma conta (precisa de cartão, mas não cobra)
3. Crie uma VM (Always Free)
4. Instale Node.js na VM
5. Clone seu repositório do GitHub
6. Configure as variáveis de ambiente
7. Rode o bot

**Limite grátis:** sempre grátis, mas precisa configurar servidor Linux (mais técnico).

---

## Recomendação

Para começar rápido: **Railway** ou **Render**.

- **Railway**: mais fácil, crédito grátis, bot fica online 24/7
- **Render**: também fácil, mas o serviço grátis pode "dormir" (não ideal para bot que precisa estar sempre online)

---

## Dica importante

**Nunca** coloque o token do bot no código ou no GitHub!

- O arquivo `.env` está no `.gitignore` (não vai para o GitHub)
- Nas plataformas de hospedagem, você configura as variáveis de ambiente pelo painel deles (não no código)

---

## Depois de hospedar

Quando o bot estiver rodando na plataforma:

1. O bot vai aparecer online no Discord
2. Use `/menu` no seu servidor para testar
3. Se você configurou `CONFIG_API_KEY`, a API do painel vai estar disponível na URL que a plataforma der (ex: `https://seu-bot.railway.app:3001`)

Para o painel no Lovable, use essa URL da API quando configurar o site.
