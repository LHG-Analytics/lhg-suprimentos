# LHG Suprimentos

> Sistema de cotação e compras para a **Rede de Motéis Lush (LHG)**.
> Gerencia o ciclo completo: Requisição → Cotação → Aprovação → Pedido de Compra → Entrada de NF.

🌐 **Produção:** [supplies.lhgmoteis.com.br](https://supplies.lhgmoteis.com.br)  
📋 **Linear:** [LHG Moteis / LHG Suprimentos](https://linear.app/lhg-moteis)

---

## Stack

| Tecnologia | Versão | Uso |
|---|---|---|
| **Next.js** | 16.2 | App Router, React 19, Turbopack |
| **TypeScript** | strict | Tipagem completa |
| **Tailwind CSS** | v4 | CSS-first, sem `tailwind.config.ts` |
| **Supabase** | latest | Auth · Postgres · RLS · Realtime |
| **shadcn/ui** | 4.8 | Componentes base |
| **Resend** | latest | Email transacional (`compras@lhgmoteis.com.br`) |
| **Omie ERP** | REST API | Sync produtos/fornecedores/pedidos |
| **OpenRouter** | AI SDK | Chat IA com contexto de orçamento |
| **Recharts** | 2.x | Gráficos do dashboard |

---

## Desenvolvimento local

### Pré-requisitos

- Node.js ≥ 20
- pnpm v10 (`npm i -g pnpm`)
- Acesso ao projeto Supabase `pjwsmmxnwkfklycwnptf`

### Setup

```bash
git clone https://github.com/LHG-Analytics/lhg-suprimentos.git
cd lhg-suprimentos
pnpm install
```

Crie `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://pjwsmmxnwkfklycwnptf.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<Supabase → Settings → API>
SUPABASE_SERVICE_ROLE_KEY=<Supabase → Settings → API>
NEXT_PUBLIC_SITE_URL=http://localhost:3001
RESEND_API_KEY=<Resend dashboard>
OPENROUTER_API_KEY=<OpenRouter dashboard>
SUPABASE_LHG_TOKEN=<Supabase → Settings → Access Tokens>
```

```bash
pnpm dev   # http://localhost:3001
```

### Scripts

```bash
pnpm dev          # servidor de desenvolvimento (porta 3001)
pnpm build        # build de produção
pnpm typecheck    # tsc --noEmit
pnpm lint         # ESLint

# Banco (PowerShell — requer SUPABASE_LHG_TOKEN no .env.local)
. .\scripts\supabase-lhg.ps1
Invoke-LhgSql -Query "SELECT COUNT(*) FROM pedidos"
Get-LhgTables
Apply-LhgMigration -Name "00XX_nome" -Query "ALTER TABLE ..."
$types = Get-LhgTypes; $types | Out-File lib/supabase/types.ts -Encoding utf8
```

---

## Arquitetura

```
app/
  (auth)/          # rotas de autenticação
  (app)/           # rotas protegidas (shell autenticado)
    dashboard/     # KPIs, CMV, gráficos, orçamento Google Sheets
    requisicoes/   # CRUD de requisições de compra
    cotacoes/      # cotações + matriz comparativa de fornecedores
    pedidos/       # pedidos de compra + aprovação + Omie + email
    notas-fiscais/ # entrada de NF via número Omie
    fornecedores/  # listagem + sincronização Omie
    produtos/      # catálogo + sincronização Omie
    chat/          # assistente IA (OpenRouter, streaming SSE)
    relatorios/    # exportação CSV
    admin/         # gestão de usuários e roles
  api/
    omie/sync/     # POST — sincronização Omie (cron diário 06h)
    chat/          # POST — streaming de IA

components/lhg/shell/   # Sidebar, Topbar, CmdK, AI Chip, ShellClient
hooks/                  # useRealtimeNotifications (Supabase Realtime)
lib/supabase/           # client · server · service · types
lib/omie/               # cliente REST Omie ERP
lib/sheets/             # fetchOrcamento() via Google Sheets CSV
supabase/migrations/    # DDL versionado (0001–0012)
```

### Fluxo principal

```
Requisição (solicitante)
  → Cotação (comprador cria + adiciona fornecedores)
    → Matriz comparativa (preços por fornecedor × item)
      → Solicitar cotação por email (Resend)
        → Wizard "Gerar pedidos" (agrupado por fornecedor)
          → Pedido de compra (aprovação por alçada)
            → Email ao fornecedor (Resend)
            → Push ao Omie ERP
              → Entrada de NF (número NF → consulta Omie)
```

---

## Banco de dados

Projeto Supabase: `pjwsmmxnwkfklycwnptf` · região `sa-east-1`  
Migrations aplicadas: **0001 → 0012**

### Roles (RBAC via RLS)

| Role | Permissões |
|---|---|
| `solicitante` | Entrada de NF da sua unidade |
| `comprador` | Tudo: requisições, cotações, pedidos, aprovações |
| `admin` | Tudo + aprovação sem limite de alçada |

---

## Integrações

### Omie ERP
- Credenciais por **unidade** (`unidades.omie_app_key/secret`) — não em env vars
- Sync automático diário às 06h via cron `vercel.json`
- Push de pedidos requer módulo "Compras" habilitado na conta Omie

### Resend
- Remetente: `compras@lhgmoteis.com.br` (domínio verificado)
- Modo simulado automático quando `RESEND_API_KEY` ausente

### Google Sheets
- Orçamento mensal via CSV público
- Config por unidade: `google_sheet_id` + `google_sheet_name` em `unidades`

---

## Deploy

Push para `main` → deploy automático de produção na Vercel.

```bash
vercel --prod   # deploy manual, se necessário
```

| Item | Valor |
|---|---|
| Repositório | `LHG-Analytics/lhg-suprimentos` |
| Plataforma | Vercel |
| Domínio | `supplies.lhgmoteis.com.br` |
| Branch produção | `main` |

---

## Contribuindo

1. Branch: `feat/lhg-<numero>-<descricao>`
2. `pnpm typecheck && pnpm lint` antes do commit
3. Regenerar types após migrations: `Get-LhgTypes | Out-File lib/supabase/types.ts`
4. Atualizar issue no Linear antes do push para `main`

---

*Uso interno — Rede de Motéis Lush (LHG)*
