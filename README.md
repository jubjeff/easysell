# EasySell

Plataforma pessoal de prospecção e venda de landing pages via WhatsApp
(disparo **manual e assistido** — a plataforma prepara, cadencia e guia;
quem envia é você).

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres) ·
Google Places API · Web Audio API · Vercel.

## Setup (3 passos)

### 1. Supabase
1. Crie um projeto em [supabase.com](https://supabase.com).
2. Abra **SQL Editor** → cole o conteúdo de [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
   (cria todas as tabelas + 2 templates de exemplo)
3. Em **Settings → API**, copie a **Project URL** e a **service_role key**.

### 2. Fonte de leads (escolha uma)
- **OpenStreetMap (grátis, default)** — não precisa de nada. Sem rating/avaliações
  e cobertura menor de telefones, mas zero custo e sem cartão.
- **Google Places (opcional)** — no [Google Cloud Console](https://console.cloud.google.com),
  ative a **Places API (New)** e crie uma API Key. Tem cota mensal gratuita
  generosa, mas exige cadastrar um cartão na conta Google Cloud.

### 3. Variáveis de ambiente
```bash
copy .env.example .env.local
```
Preencha `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GOOGLE_PLACES_API_KEY`
e `APP_PASSWORD` (senha de acesso ao app — sem ela definida, o acesso é livre,
útil no dev local).

## Rodar

```bash
npm run dev
```
→ http://localhost:3000

## Deploy na Vercel

1. Suba o repositório para o GitHub (`git init`, commit e push).
2. Em [vercel.com/new](https://vercel.com/new), importe o repositório.
3. Em **Environment Variables**, adicione as 4 variáveis do `.env.local`.
4. Deploy. O middleware pedirá o `APP_PASSWORD` no primeiro acesso.

## Fluxo de uso

1. **Config** — informe a data de ativação do chip (define o limite diário
   automático: <30d → 15/dia · 30–90d → 40/dia · >90d → 80/dia) e a janela
   de envio (default 8h–18h seg–sex).
2. **Templates** — já vêm 2 de exemplo. Variáveis: `{nome_negocio}`,
   `{cidade}`, `{nicho}`, `{rating}`, `{qtd_avaliacoes}`, bloco opcional
   `{social_proof}`; spin syntax `{Oi|Olá|Opa}`.
3. **Captação** — busque por nicho + cidade (Places) ou importe CSV
   (`nome,telefone,cidade,nicho`). Sem site = lead quente; Instagram/Linktree
   como site = morno. Dedupe automático por telefone e place_id.
4. **Campanhas** — nicho + cidade + templates + limite diário.
5. **Sessão de disparo** — a plataforma monta a fila do dia por score, gera
   mensagem única por lead, e cadencia com timer randomizado (3–9 min) com
   som, notificação e título piscando. Marcar "Enviado" move o lead para
   **Contactado** e loga tudo para as métricas.
6. **Funil** — kanban arrastável; detalhe do lead com notas, demo, valor e
   histórico completo de mensagens.

## Proteções anti-ban (mesmo sendo manual)

- Limite diário global do chip (compartilhado entre campanhas), com bloqueio
  suave ao atingir — a sessão encerra com resumo.
- Janela de envio configurável; iniciar fora dela exige confirmação explícita.
- Intervalo randomizado entre envios, nunca fixo.
- 1 mensagem por lead até ele responder (a fila só pega leads em "Novo").
- Mensagens da mesma sessão nunca saem idênticas (validação por hash).
- Alerta quando a taxa de resposta da campanha cai abaixo do limiar.
