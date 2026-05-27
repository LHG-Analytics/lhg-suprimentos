# LHG Suprimentos — Instruções para Claude Code

> Arquivo local — ignorado pelo git. Serve como contexto persistente para sessões com Claude Code.

---

## 0. Missão

Você é o desenvolvedor principal do **LHG Suprimentos**, sistema fullstack de cotação e compras para a Rede de Motéis Lush (LHG). É o segundo sistema do ecossistema LHG (o primeiro é o LHG Revenue Manager).

---

## 1. ⚠️ Fluxo obrigatório antes de cada commit/push

**SEMPRE** executar antes de `git commit` e `git push`:

1. **Atualizar issues concluídas no Linear** via MCP (`mcp__claude_ai_Linear__save_issue` com `stateId` → Done)
2. **Atualizar a seção "Status das Tarefas"** deste arquivo para refletir o que foi concluído

Não pular esse passo mesmo que as mudanças pareçam pequenas.

---

## 2. Como navegar o pacote de documentação (`docs/`)

Leia nessa ordem **antes de escrever qualquer linha de código** em uma nova feature:

1. **`docs/README.md`** — visão geral, stack obrigatória, tokens de design, arquitetura de shell
2. **`docs/PRD.md`** — especificação funcional completa (perfis, telas, fluxos)
3. **`docs/SCREENS.md`** — detalhamento visual tela a tela (**prevalece em caso de conflito**)
4. **`docs/BACKEND.md`** — schema Supabase, RLS, integrações (Omie, Resend, OpenRouter)
5. **`docs/IMPLEMENTATION.md`** — estrutura de pastas, comandos, roadmap em sprints

### Hierarquia em caso de conflito

1. **SCREENS.md** (mais recente, mais visual) — **vence sobre tudo**
2. BACKEND.md (schema/RLS)
3. PRD.md (requisitos)
4. README.md (tokens/stack)
5. IMPLEMENTATION.md (pastas/sprints)
6. `prototype/` (referência visual — **não copiar literalmente**)
7. Issues do Linear (roadmap macro)

Se nada explica → **pergunte antes de inventar**.

---

## 3. Sobre `prototype/`

Arquivos em `prototype/` são React vanilla (browser-side Babel, sem build) — **referência visual e de comportamento, não código**.

**Abra `prototype/index.html` no browser** para navegar as telas e entender interações reais.

### O que descartar
- Sistema "Tweaks" (`tweaks-panel.jsx`) — era ferramenta de design preview, não vai pro app
- Tailwind via CDN, Babel browser, `window.Foo = Foo` exports
- Dados mockados inline — viram queries Supabase reais (use como seed)

### O que recriar com fidelidade (**hi-fi — pixel-perfect**)
- Shell (`shell.jsx`): sidebar 248px colapsável, seletor de unidade, topbar 56px com breadcrumb + ⌘K, AI chip bottom-right
- Login (`screen-login.jsx`): split 60/40, glows emerald, stats strip 3-col
- Dashboard (`screen-dashboard.jsx`): 4 KPIs, Recharts com toggle por unidade, feed de ações
- **Cotação detalhe (`screen-cotacao-detalhe.jsx`) — peça mais complexa, leia inteiro:**
  - Matriz comparativa (linhas = itens, colunas = fornecedores + coluna "Sugestão IA")
  - Célula picker (melhor preço / não atende / selecionado)
  - Sticky bottom summary bar + wizard "Gerar pedidos"
  - Drawer chat lateral
- Chat IA (`screen-chat.jsx`): streaming token-a-token, sugestões contextuais, bloco FONTES
- Pedidos (`screen-pedidos.jsx`): 2-col xl, timeline vertical, modal email com preview Resend
- Entrada de NF (`screen-nf.jsx`): drag-and-drop, conferência grid com divergências
- Fornecedores (`screen-fornecedores.jsx`): grid cards + modo lista + drawer com gauges

---

## 4. Stack — não negociável

| Tecnologia | Versão | Notas |
|---|---|---|
| Next.js | **16.2.6** | App Router, React 19, Turbopack |
| React | 19.2.4 | |
| TypeScript | strict | |
| Tailwind CSS | **v4** | CSS-first, sem `tailwind.config.ts` |
| Supabase | latest | Auth + Postgres + RLS + Storage |
| Node | ≥ 20 | |
| Package Manager | **pnpm v10** | |

Outras libs: `shadcn/ui`, `Geist`, `Resend` (email), `OpenRouter` via `ai` SDK (`useChat`), `Omie API`, `Recharts`, `TanStack Query`, `Zustand`, `react-hook-form + Zod`, `sonner`, `next-themes`, `fast-xml-parser`, `date-fns`, `lucide-react`

**Upstash Redis** (ainda não provisionado) — cache + rate limit.

---

## 5. ⚠️ Next.js 16 — Breaking Changes vs 14/15

### `middleware.ts` → `proxy.ts`
- Arquivo: **`proxy.ts`** (não `middleware.ts`)
- Função exportada: **`proxy()`** (não `middleware()`)
- Config: **`proxyConfig`** (não `config`)
- `middleware.ts` é **ignorado silenciosamente** no Next.js 16

### `searchParams` async em Pages/Layouts
- Em `page.tsx` / `layout.tsx` → `await searchParams` e `await params`
- Em **Route Handlers** (`route.ts`) → `request.nextUrl.searchParams` (Web API síncrona, sem `await`)

### `cookies()` e `headers()` assíncronos
- `await cookies()` e `await headers()` em Server Components, Server Actions, Route Handlers

---

## 6. Tailwind v4 — CSS-first

**Não existe `tailwind.config.ts`** — toda config em `app/globals.css` com `@theme inline`.

### Regras críticas do `@theme inline`
```css
/* ✅ CORRETO — nomes literais */
--font-sans: "Geist", "Geist Fallback", ui-sans-serif, system-ui, sans-serif;

/* ❌ ERRADO — var() em @theme (resolve em parse time, não runtime) */
--font-sans: var(--font-geist-sans);
```

### Dark mode com next-themes
```css
/* Obrigatório para estratégia class do next-themes */
@custom-variant dark (&:is(.dark *));
```

Tokens HSL: `:root` → light mode · `.dark` → dark mode (default da app) · `@theme inline` → mapeia para `hsl(var(--*))`

---

## 7. Fontes

Usar pacote **`geist`** (npm), **NÃO** `next/font/google`:
```ts
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
```

---

## 8. Supabase

| Item | Valor |
|---|---|
| Project ID | `pjwsmmxnwkfklycwnptf` |
| Region | `sa-east-1` |
| URL | `https://pjwsmmxnwkfklycwnptf.supabase.co` |

### Clientes (`lib/supabase/`)
- **`client.ts`** → `createBrowserClient()` — Client Components
- **`server.ts`** → `createServerClient()` com `await cookies()` — SSR (RSC, SA, RH)
- **`service.ts`** → `createServiceClient()` com `service_role` — **só** em Route Handlers server-side
- **`types.ts`** → usar o helper PowerShell após migrations (ver seção abaixo):
  ```powershell
  . .\scripts\supabase-lhg.ps1
  $types = Get-LhgTypes
  $types | Out-File lib/supabase/types.ts -Encoding utf8
  ```
  ⚠️ Última migration aplicada: **0017** (`cotacoes.omie_codigo` + `notas_fiscais.omie_receb_id/omie_concluido`)

### ⚠️ MCP Supabase no Cursor — Workaround obrigatório

O Claude Code dentro do **Cursor** não spawna MCPs locais (`mcpServers` em `settings.json`). Apenas integrações cloud (`mcp__claude_ai_Supabase__*`) funcionam, e essas apontam para outra conta.

**Para interagir com o banco LHG Suprimentos, usar sempre o helper PowerShell:**

```powershell
# Carregar o helper (lê SUPABASE_LHG_TOKEN do .env.local)
. .\scripts\supabase-lhg.ps1

# Executar SQL
Invoke-LhgSql -Query "SELECT COUNT(*) FROM requisicoes"

# Listar tabelas e colunas
Get-LhgTables
Get-LhgColumns -TableName "notas_fiscais"

# Aplicar migration DDL
Apply-LhgMigration -Name "0010_nome" -Query "ALTER TABLE ... ADD COLUMN ..."

# Regenerar lib/supabase/types.ts (fazer após TODA migration)
$types = Get-LhgTypes
$types | Out-File lib/supabase/types.ts -Encoding utf8
```

O token fica em `.env.local` como `SUPABASE_LHG_TOKEN` (nunca commitar o token).

### Regras
- **SEMPRE** `getUser()` no servidor, **NUNCA** `getSession()` (não valida JWT)
- **NUNCA** expor `service_role` key no browser
- `proxy.ts` é responsável pelo refresh do JWT
- `createClient()` (sessão do usuário) respeita RLS e é suficiente para leituras onde RLS já libera
- `createServiceClient()` bypassa RLS — necessário na rota `/api/omie/sync` para ler `unidades`

### ⚠️ BOM (U+FEFF) em env vars — CRÍTICO

Env vars copiadas de editores Windows (VSCode, Notepad) ou do browser podem conter BOM invisível (U+FEFF = char 65279).

**Sintoma principal:** Query retorna 0 registros silenciosamente. Nos logs da Vercel aparece:
```
TypeError: Cannot convert argument to a ByteString because the character at index 0 has a value of 65279 which is greater than 255.
```
Isso significa que a `SUPABASE_SERVICE_ROLE_KEY` tem BOM → JWT inválido → RLS não bypassa → query retorna vazio (sem `dbErr` no código).

**Fix:** Deletar e recriar a env var na Vercel — copiar direto do dashboard do Supabase sem BOM.

**Regra de código:** Strip BOM em **TODOS** os pontos de criação de cliente Supabase:

```ts
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/^﻿/, "");
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!.replace(/^﻿/, "");
```

Arquivos afetados (todos já corrigidos):
- `lib/supabase/client.ts`
- `lib/supabase/server.ts`
- `app/auth/callback/route.ts`
- `proxy.ts` ← **crítico**: sem isso causa `ERR_TOO_MANY_REDIRECTS`

### ⚠️ `setAll` cookies — try-catch apenas em Server Components

```ts
// ✅ CORRETO para Route Handlers (cookies graváveis)
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
}

// ✅ CORRETO para Server Components (read-only, try-catch seguro)
setAll(cookiesToSet) {
  try {
    cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
  } catch { /* ignorar — Server Components são read-only */ }
}
```

### Schema `user_profiles`

Colunas reais (não o PRD):
```sql
id, nome, email, role, avatar_url, created_at, updated_at
```
⚠️ **Não existe** `full_name` nem `active`.

---

## 9. RBAC (difere do PRD original)

| Role | O que faz |
|---|---|
| `solicitante` | Só dá entrada em NF da sua unidade |
| `comprador` | Faz tudo: requisições, cotações, pedidos, aprovações (Keila) |
| `aprovador` | Mantido no enum do banco para uso futuro; **sem UI no MVP** |
| `admin` | Configurações do sistema |

---

## 10. shadcn/ui

- **Versão:** `shadcn@^4.8.0` · componentes instalados: `button badge card dialog sheet table input command dropdown-menu tabs alert-dialog tooltip popover toggle-group select textarea checkbox label scroll-area separator avatar`
- `TooltipProvider` já está no `app/layout.tsx` — não adicionar novamente
- ⚠️ `shadcn add` pode sobrescrever `globals.css` (checar tokens oklch) e `layout.tsx` (import circular)

---

## 11. Princípios não negociáveis

- **RLS é a verdade.** Toda regra de visibilidade vive no Postgres. Frontend filtra só pra UX.
- **Server Components por default.** Client Components só quando precisa de interatividade.
- **Server Actions** para mutações simples; **Route Handlers** para webhooks, cron, streaming.
- **Sempre Zod** na borda de Server Actions e Route Handlers.
- **Skeletons fiéis** — criar `loading.tsx` por rota, nunca spinners genéricos.
- **Badges com bolinha + texto** (cor sozinha não atende WCAG).
- **Dark mode default**, light mode totalmente funcional via tokens HSL (`:root`/`.dark`, não `dark:` modifiers).
- **Tabelas:** sticky header, hover `bg-muted/50`, ordenação por coluna, paginação no rodapé.
- **Confirmações destrutivas:** `<AlertDialog>`, **nunca** `window.confirm`.
- **Atalhos:** `⌘K` busca global, `⌘N` nova requisição/cotação, `⌘/` AI chip, `Esc` fecha drawers.
- **NUNCA** chamar `service-role` Supabase client em Client Components.
- **Sempre** `revalidatePath` / `revalidateTag` após mutações.
- **Sempre** regenerar `lib/supabase/types.ts` após mudar schema — usar `scripts/supabase-lhg.ps1` (ver §8).

---

## 12. Estrutura de Diretórios

```
app/
  (auth)/          # grupo de rotas de autenticação
  (app)/           # grupo de rotas protegidas
    dashboard/
    fornecedores/
    produtos/
    cotacoes/
    pedidos/
    admin/
  api/
    omie/sync/     # POST — sincronização com Omie ERP
  auth/callback/   # Route Handler PKCE callback
  login/
  globals.css
  layout.tsx
components/
  ui/              # componentes shadcn
  lhg/             # componentes customizados LHG
    shell/         # nav-config.ts, cmd-k.tsx, sidebar, topbar
hooks/
lib/
  supabase/        # clientes Supabase (client, server, service)
  utils.ts         # cn(), formatBRL(), formatDate(), etc.
emails/            # templates React Email
supabase/
  migrations/      # SQL migrations
docs/              # handoff de design (LOCAL — gitignore)
prototype/         # React vanilla reference (LOCAL — gitignore)
proxy.ts           # middleware Next.js 16
```

---

## 13. Scripts

```bash
pnpm dev          # localhost:3001
pnpm build        # next build
pnpm typecheck    # tsc --noEmit
pnpm lint         # eslint
```

---

## 14. GitHub / Vercel / Linear

- **Repositório:** `LHG-Analytics/lhg-suprimentos` (público)
- **Linear:** workspace `LHG Moteis` · projeto "LHG Suprimentos" · 36 issues · prefixo `LHG-`
- **Vercel CLI:** instalar com `npm i -g vercel` (ainda não instalado)
- **Branch principal:** `main` · **dev:** `dev` · **features:** `feat/lhg-<numero>-<descricao>`
- **Domínio produção:** `supplies.lhgmoteis.com.br` (CNAME → `cname.vercel-dns.com`, Cloudflare DNS-only)

---

## 15. Variáveis de Ambiente

### Local (`.env.local`)
```bash
NEXT_PUBLIC_SUPABASE_URL=https://pjwsmmxnwkfklycwnptf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<já configurado>
SUPABASE_SERVICE_ROLE_KEY=<já configurado>
NEXT_PUBLIC_SITE_URL=http://localhost:3001

# Ainda não provisionados:
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=
OPENROUTER_KEY=
OPENROUTER_DEFAULT_MODEL=openai/gpt-4o
```

### Produção (Vercel Dashboard)
```bash
NEXT_PUBLIC_SITE_URL=https://supplies.lhgmoteis.com.br
# Demais variáveis: mesmas do .env.local, mas sem BOM
```

> ⚠️ `OMIE_APP_KEY` e `OMIE_APP_SECRET` **NÃO estão em env vars** — ficam na coluna `omie_app_key`/`omie_app_secret` da tabela `unidades` no Supabase. Cada unidade tem suas próprias credenciais Omie.

---

## 16. Padrões de Server Actions com redirect

`redirect()` do Next.js lança `NEXT_REDIRECT` internamente. **NUNCA** engolir esse erro:

```ts
// ✅ CORRETO — em Client Components com try-catch
import { unstable_rethrow } from "next/navigation";

try {
  await signInWithGoogle(); // pode conter redirect()
} catch (err) {
  unstable_rethrow(err); // repassa NEXT_REDIRECT ao framework
  toast.error(err instanceof Error ? err.message : "Erro inesperado.");
}
```

---

## 17. Favicon

Arquivo: `app/icon.png` (Next.js 16 detecta automaticamente como favicon e apple-touch-icon).
Deletar `app/favicon.ico` se existir para evitar conflito.

---

## 18. Integração Omie ERP

### Credenciais
- **NÃO** ficam em variáveis de ambiente da Vercel
- Ficam na tabela `unidades` do Supabase: colunas `omie_app_key` e `omie_app_secret`
- Cada unidade tem seu par de credenciais cadastrado no dashboard Omie

### Rota de sincronização
- **Endpoint:** `POST /api/omie/sync`
- **Body:** `{ entidade: "fornecedores" | "produtos" }`
- **Auth:** qualquer usuário autenticado (não requer role específica)
- **Client Supabase:** usa `createServiceClient()` para buscar unidades (bypassa RLS)
- **Logs:** tabela `integracao_logs` — registra cada sync com total, novos, status

### Fluxo do sync
1. Autentica usuário (`getUser()`)
2. Busca unidades via service client: `ativa=true AND omie_app_key IS NOT NULL AND omie_app_secret IS NOT NULL`
3. Para cada unidade, chama Omie API com as credenciais da unidade
4. Upsert no Supabase (tabela `fornecedores` ou `produtos`)
5. Insere log em `integracao_logs`

### Diagnóstico de problemas comuns
- **"Nenhuma unidade com credenciais Omie configurada"** → verificar na tabela `unidades` se `ativa=true` e se `omie_app_key`/`omie_app_secret` não são null
- **0 registros silencioso + BOM error nos logs** → deletar e recriar `SUPABASE_SERVICE_ROLE_KEY` na Vercel (ver §8)
- **Credenciais erradas** → verificar no dashboard Omie (não confundir app_key de unidades diferentes)

---

## 19. Status das Tarefas

### ✅ M1 — Sprint 0 (Fundação)
- ✅ LHG-197: Bootstrap Next.js 16 + Tailwind v4
- ✅ LHG-198: shadcn/ui + componentes + tokens LHG + dark mode
- ✅ LHG-199: Supabase clients + proxy.ts + auth/callback
- ✅ LHG-200: Schema Supabase (migrations iniciais) — `user_profiles`, `unidades`, `fornecedores`, RLS
- ✅ LHG-201: Auth Google OAuth — PKCE, callback, BOM fix, domínio `supplies.lhgmoteis.com.br`
- ✅ LHG-202: Tela de Login (UI) — 3D marquee 5 colunas, card centralizado
- ✅ LHG-203: Layout principal — Sidebar 240px + Topbar + Seletor de Unidade + ⌘K
- ✅ LHG-204: RBAC (roles + RLS)
- ✅ LHG-205: Dashboard placeholder

### ✅ M2 — Sprint 1 (Cadastros básicos)
- ✅ LHG-206: Produtos & Catálogo — tabela com busca, filtro por categoria, stats
- ✅ LHG-207: Sincronização Omie Produtos — botão sync + route handler + logs + `familia_omie` (migration 0006)
- ✅ LHG-208: Fornecedores — página com listagem sincronizada do Omie

### ✅ M3 — Sprint 2 (Requisições → Cotações)
- ✅ LHG-209: CRUD de Requisições + wizard de criação + filtro por família Omie + coluna "Últ. Custo" inline
- ✅ LHG-210: CRUD de Cotações + criação a partir de requisições + seleção de fornecedores
- ✅ LHG-211: Matriz comparativa de fornecedores (linhas=itens, colunas=fornecedores, sticky summary bar)
- ✅ LHG-212: Email cotação via Resend — `enviarEmailCotacao` action; template HTML dark com tabela de itens; botão "Solicitar cotação" + modal com campo de observação; rastreio `cotacao_fornecedores.email_enviado_em` (migration 0012)

### ✅ M4 — Sprint 3 (Aprovação e Pedido de Compra)
- ✅ LHG-213: Aprovação de pedidos — alçada de aprovação por usuário (`alcada_valor` migration 0011); `aprovarPedido` bloqueia se valor > alçada; admin tem aprovação ilimitada; soft budget check via Sheets mantido
- ✅ LHG-214: Push Omie — `criarPedidoCompra()` em `lib/omie/client.ts`; Server Action `pushPedidoOmie(id)`; botão UI tri-estado (pendente/erro/sincronizado) em `pedidos-client.tsx`
- ✅ LHG-215: Email ao fornecedor — `enviarEmailFornecedor` com React Email template (`emails/pedido-compra-fornecedor.tsx`); tema dark, header emerald, tabela de itens, entrega/pgto, footer LHG; Resend dinâmico; modo "simulado" sem `RESEND_API_KEY`

### ✅ M5 — Sprint 4 (Entrada de NF) — redesenhado
- ✅ LHG-216 + LHG-217: Módulo NF redesenhado — entrada por número NF + consulta Omie API
  - Busca NF pelo número no Omie (`/produtos/notaentrada/` → `ConsultarNota`)
  - Itens retornados com `familia_omie` pré-preenchida (editável pelo usuário)
  - NF pode ser registrada sem vínculo a pedido (`fornecedor_id` + `unidade_id` direto)
  - Lançamento no Omie via `lancarNFOmie` (action server)
  - Migrations aplicadas: **0009** (colunas NF), **0010** (`pedido_id` nullable)
  - ⚠️ XML upload removido — fluxo novo é exclusivamente por número da NF

### 🔄 M6 — Sprint 5 (IA, Dashboard e Sheets)
- ✅ LHG-218: Chat IA (OpenRouter/Gemini, streaming SSE, budget context no system prompt)
- ✅ LHG-219: Google Sheets — `fetchOrcamento()` via CSV público, usado no dashboard + chat + aprovação
- ✅ LHG-220: Dashboard + Relatórios — KPIs operacionais + seção CMV (CMV Real, CMV % orçado, Custo Serviços, Total Insumos); `computeCmvMetrics()` separa gastos por seção do Google Sheets; delta mês anterior; gráfico gastos/unidade 6m; OrcamentoWidget; tabela cotações; relatórios com exportação CSV

### ✅ M7 — Sprint 6 (Polimento e Deploy)
- ✅ LHG-221: ⌘N + Ações Rápidas CmdK + hook `useRealtimeNotifications` (pedidos/cotações → sonner toasts globais); pendente: audit_log + tela admin
- ✅ LHG-222: Deploy produção ativo (`supplies.lhgmoteis.com.br`); auto-deploy `main` → Vercel; `README.md` + `ONBOARDING.md` completos

### 🔄 M8 — Sprint 7 (Correções e Polimento)
- ✅ LHG-223: Fix sync Omie Produtos — campo correto é `descricao_familia` (não `familia_produto`); UPDATE no re-sync agora atualiza `categoria`; banco corrigido via SQL direto (599 produtos)
- ✅ LHG-224: Limpeza tela Fornecedores — removidas colunas STATUS (ativo/inativo, não vem do Omie) e OMIE (redundante); e-mail destacado; stats: TOTAL/COM E-MAIL/OMIE
- ✅ Dashboard CMV redesenhado: 6 KPIs em grid único, "Total Insumos Mês" como 6ª card, seção CMV 3 cards removida, `cmvOrcado` (só produtos) substituiu `totalOrcado` (produtos+serviços)
- ✅ RLS fix: migration 0013 — política `authenticated_read_all_units` em `unidades` para leitura server-side de `google_sheet_id`
- ✅ Altana desativada: `disabled: true` na interface `Unidade`, opaca/não clicável no sidebar, excluída do consolidado
- ✅ `familia-map.ts` atualizado: 17 categorias com nomes exatos da aba "Custos" da planilha
- ✅ Credenciais Omie de produção configuradas para Lush Ipiranga, Lush Lapa e Andar de Cima
- ✅ LHG-225: Seletor de unidade exibe código `(RCC)` ao lado do nome (Lush Ipiranga); campo `codigo?` opcional na interface `Unidade`
- ✅ LHG-226: Widget Orçamento vs Realizado filtra apenas categorias rastreáveis via Omie (`CATEGORIAS_ORCAMENTO`); exclui custos fixos da planilha
- ✅ LHG-227: Troca de unidade recarrega Fornecedores — `router.refresh()` no `setUnidade`; query filtrada por `omie_unidade_id` via cookie
- ✅ LHG-228: Produtos e fornecedores por unidade — migration 0014 (`omie_unidade_id` em `produtos`, constraint composta `omie_codigo,omie_unidade_id`); `sync.ts` sincroniza catálogo por unidade; `produtos/page.tsx` e `requisicoes/page.tsx` filtram por cookie de unidade

- ✅ Dashboard light mode + performance: 6 componentes reescritos com tokens semânticos (`bg-card`, `border-border`, `text-foreground`, `text-muted-foreground`) substituindo zinc hardcoded; `useTheme` no gastos-chart para cores do recharts; `OrcamentoSection` async Server Component + `<Suspense>` — KPIs carregam ~300ms (Supabase) enquanto Google Sheets carrega independente
- ✅ LHG-229: Tour interativo estilo quadrinho — spotlight (4 painéis + borda verde), balão comic book (borda 2.5px, sombra offset), cauda CSS pura, 7 passos Requisição→Cotação→Pedido; `TourProvider` no shell-client; botão ❓ do topbar dispara `startTour()`

- ✅ LHG-229: Editar Produto e Fornecedor com sync bidirecional Omie — `alterarProduto()` / `alterarFornecedor()` em `lib/omie/client.ts`; Server Actions `editarProduto` / `editarFornecedor`; modais com banner âmbar (sem omie_codigo) e banner vermelho (erro Omie); linhas da tabela clicáveis; `fornecedores/page.tsx` busca `endereco` e `cep`

- ✅ LHG-230: Admin settings, perfil, histórico de chat IA e convites
  - `/admin`: aba Usuários (role selector inline) + aba Convites (Resend email ou link manual fallback); revogar/remover via service client
  - `/perfil`: editar nome (usado pela IA) + upload avatar → Supabase Storage `avatars/{uid}/`; sidebar mostra foto real e linka para /perfil
  - `auth/callback`: auto-cria `user_profiles` para usuários convidados ao primeiro login Google — match por email em `invites` → role do convite → marca usado
  - `api/chat/route.ts`: system prompt reescrito como "LHG IA — especialista sênior em compras hoteleiras"; personaliza pelo nome do usuário
  - `/chat`: sidebar de sessões persistentes (estilo ChatGPT) via Supabase browser client; criar/carregar/deletar sessões; mensagens persistidas em `ai_chat_messages`
  - Migration 0015: tabelas `invites`, `ai_chat_sessions`, `ai_chat_messages` + bucket `avatars` (RLS por uid)
  - `lib/supabase/types.ts` atualizado com as 3 novas tabelas
  - ✅ Fix `aprovador` = mesmo acesso que `comprador`: textos descritivos em `admin-client.tsx`, `invite-dialog.tsx` e `admin/usuarios/page.tsx` atualizados; funcionalmente já não havia guards separando os dois papéis
  - ✅ LHG-231: Sync pedidos de compra Omie — migration 0016 (`omie_pedidos_compra`); `lib/omie/client.ts` com `listAllPedidosCompra`; `lib/omie/sync.ts` com `syncPedidosCompra`; cron dedicado `*/5 * * * *` em `/api/omie/sync-pedidos`; aba "Pedidos Omie" em `/pedidos` com tabela completa (situação, etapa, aprovação, nº fornecedor), filtro por unidade, busca e botão "Sincronizar agora"
  - ⚠️ Migration 0016 pendente de execução manual no SQL Editor do Supabase (ver SQL abaixo)

### ✅ M9 — Sprint 8 (Omie Sync Bidirecional Completo)
- ✅ LHG-232: Omie Sync Bidirecional Completo — CRUD completo LHG ↔ Omie ERP
  - `lib/omie/requisicao.ts`: `incluirReq`, `upsertReq`, `excluirReq` (Cotação ↔ Requisição de Compra)
  - `lib/omie/pedidos.ts`: `incluirPedCompra`, `alterarPedCompra`, `excluirPedCompra` — endpoint correto `/produtos/pedidocompra/` (fix do legado `/compras/pedidocompras/`)
  - `lib/omie/recebimento.ts`: `listarRecebimentos`, `associarPedidoRecebimento`, `concluirRecebimento`
  - `lib/omie/client.ts`: add `incluirCliente` (fornecedor) + `incluirProduto`
  - Cotações: `editarCotacao` + sync automático IncluirReq/UpsertReq/ExcluirReq + `EditarCotacaoModal` na lista
  - Pedidos: fix `pushPedidoOmie` + `editarPedido` + `excluirPedidoOmie`
  - NF: auto-associar recebimento após `lancarNFOmie` + `concluirRecebimentoOmie` + botão "Concluir no Omie"
  - Fornecedores: `criarFornecedor` atômico (Omie first) + modal "+ Novo Fornecedor"
  - Produtos: `criarProduto` atômico (NCM obrigatório, Omie first) + modal "+ Novo Produto"
  - Migrations 0017: `cotacoes.omie_codigo`, `cotacoes.omie_sincronizado_em`, `notas_fiscais.omie_receb_id`, `notas_fiscais.omie_concluido`
