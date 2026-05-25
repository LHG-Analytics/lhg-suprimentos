# Handoff — LHG Suprimentos (Cotação & Compras)

> Para implementação em **Next.js 16 (App Router) + Supabase + shadcn/ui + Tailwind**.

## 1. O que tem aqui

Este pacote é um **handoff de design**. Os arquivos em `prototype/` são **referências em HTML/JSX** que mostram a aparência final e o comportamento esperado — eles **não são código de produção** e não devem ser copiados literalmente para o codebase. A tarefa é **recriar essas telas em Next.js 16** usando shadcn/ui, server components onde fizer sentido, server actions / route handlers para mutações, e Supabase como backend.

| Arquivo | Para que serve |
|---|---|
| `README.md` | Você está aqui. Visão geral + tokens + arquitetura. |
| `PRD.md` | Especificação original do produto (perfis, telas, fluxos). |
| `SCREENS.md` | Detalhamento tela por tela: layout, componentes, copy, interações. |
| `BACKEND.md` | Schema Supabase sugerido, RLS, integrações (Omie, Resend, OpenRouter). |
| `IMPLEMENTATION.md` | Estrutura de pastas Next.js + ordem sugerida de implementação (MVP → completo). |
| `prototype/` | HTML/JSX do protótipo navegável. Abra `prototype/index.html` em um browser para interagir. |

## 2. Fidelidade

**Hi-fi.** Cores, tipografia, espaçamentos e microinterações estão definidos. Reproduza pixel-perfect dentro do que a stack permite — use shadcn/ui como base e customize via tokens. Onde shadcn não cobrir (matriz comparativa, AI chip flutuante, gráficos), implemente componente customizado seguindo o protótipo.

## 3. Stack alvo (não negociável)

| Camada | Tecnologia |
|---|---|
| Framework | **Next.js 16** App Router · TypeScript · React Server Components + Client Components |
| UI | **shadcn/ui** (Radix sob o capô) + **Tailwind CSS** |
| Tipografia | **Geist Sans** + **Geist Mono** (`next/font/google`) |
| Estado servidor | React Server Components + Server Actions + `revalidatePath` |
| Estado cliente | TanStack Query (somente para mutações otimistas e fetch interativo) + Zustand (drawer, modal, UI ephemeral) |
| Auth | **Supabase Auth** (Google OAuth + Magic Link) |
| DB | **Supabase Postgres** + Row Level Security |
| Email | **Resend** (templates React Email) |
| LLM | **OpenRouter** (gateway para GPT-4o, Claude, etc.) |
| ERP | **Omie API** (criação de pedido, lançamento de NF, sincronização) |
| Charts | **Recharts** ou **visx** (line chart é o uso principal) |
| Dates | **date-fns** com locale pt-BR |
| Forms | **react-hook-form** + **zod** |
| Toasts | **sonner** (já é o padrão do shadcn) |

## 4. Identidade visual

### 4.1. Paleta — tokens semânticos

Defina em `app/globals.css` via CSS variables (compatível com shadcn `:root` + `.dark`):

```css
@layer base {
  :root {
    /* Base — light mode default values */
    --background: 0 0% 100%;             /* #ffffff */
    --foreground: 240 6% 10%;            /* zinc-950 #18181b → para texto primário */
    --muted: 240 5% 96%;                 /* zinc-50  #fafafa */
    --muted-foreground: 240 4% 46%;      /* zinc-500 #71717a */
    --card: 0 0% 100%;
    --card-foreground: 240 6% 10%;
    --popover: 0 0% 100%;
    --popover-foreground: 240 6% 10%;
    --border: 240 6% 90%;                /* zinc-200 #e4e4e7 */
    --input: 240 6% 90%;
    --ring: 152 70% 40%;                 /* lhg-500 emerald-ish */

    /* Brand */
    --primary: 158 80% 39%;              /* emerald-600 ~ #059669 (lhg-500 in dark, -600 in light) */
    --primary-foreground: 0 0% 100%;

    /* Semantic */
    --success: 158 80% 39%;
    --warning: 38 92% 50%;               /* amber-500 #f59e0b */
    --info: 199 89% 48%;                 /* sky-500 #0ea5e9 */
    --destructive: 0 84% 60%;            /* red-500 #ef4444 */
    --destructive-foreground: 0 0% 100%;

    --radius: 0.5rem;
  }

  .dark {
    --background: 240 10% 4%;            /* zinc-950 #09090b */
    --foreground: 0 0% 96%;              /* zinc-50 #fafafa */
    --muted: 240 6% 10%;                 /* zinc-900 #18181b */
    --muted-foreground: 240 5% 65%;      /* zinc-400 #a1a1aa */
    --card: 240 8% 7%;                   /* zinc-900 com mistura */
    --card-foreground: 0 0% 96%;
    --popover: 240 10% 4%;
    --popover-foreground: 0 0% 96%;
    --border: 240 4% 16%;                /* zinc-800 #27272a */
    --input: 240 4% 16%;
    --ring: 152 60% 50%;

    --primary: 152 76% 47%;              /* emerald-500 (LHG accent) ~ #10b981 */
    --primary-foreground: 240 10% 4%;
  }
}
```

> **Padrão:** dark mode é o tema **default**. Use `<ThemeProvider defaultTheme="dark">` do `next-themes`.

### 4.2. Acentos brutos (use só quando precisar do hex direto)

| Token | Hex | Uso |
|---|---|---|
| Brand emerald | `#10b981` | CTAs primários, "Sugestão IA", indicadores positivos |
| Amber | `#f59e0b` | "Em cotação", "Pendente", divergências |
| Red | `#ef4444` | "Rejeitado", "Erro Omie", urgência |
| Sky | `#0ea5e9` | Informativo, "Em trânsito", links |
| Zinc-500 | `#71717a` | "Rascunho", texto terciário |

### 4.3. Tipografia

```ts
// app/layout.tsx
import { Geist, Geist_Mono } from "next/font/google";
const geistSans = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });
```

Escala (siga estritamente):

| Token | Tamanho | Peso | Onde |
|---|---|---|---|
| `text-3xl` (28px) | 28px / 1.05 | 600 | Headlines de página |
| `text-2xl` (24px) | 24px / 1.1 | 600 | Headlines secundários, valores grandes em KPI |
| `text-xl` (20px) | 20px | 600 | Títulos de cards |
| `text-base` (16px) | 16px | 500/400 | Texto de UI primário |
| `text-sm` (14px) | 14px | 500/400 | Texto de UI secundário, tabelas |
| `text-xs` (12px) | 12px | 400 | Texto terciário, badges |
| `text-[11px]` | 11px | 500 | Labels de KPI (uppercase tracking-wider) |
| `text-[10px]` | 10px | 600 | Section headers da sidebar (uppercase) |

**Sempre use `font-mono` para:** valores monetários em tabelas, IDs (`COT-2026-0142`), CNPJs, números de KPI.

### 4.4. Espaçamento e densidade

- **Tabelas:** rows de 40-44px (`h-10`/`h-11`)
- **Cards:** padding 20-24px (`p-5`/`p-6`)
- **Sidebar:** 248px expandida, 64px colapsada
- **Topbar:** 56px
- **Espaçamento entre seções:** 24-32px (`gap-3`/`gap-4` em grids, `mb-6`/`mt-3`)
- **Border radius:** `--radius: 0.5rem`; cards usam `rounded-xl` (12px), botões `rounded-md` (6px)

### 4.5. Shadows

Use sutil. Em dark mode shadows praticamente invisíveis — confie nas borders. Em light, use shadows leves:
- Cards: `shadow-sm` (light), nenhuma sombra (dark)
- Floating elements (AI chip, sticky bars): `shadow-2xl`
- Modals/drawers: `shadow-2xl`

## 5. Arquitetura de Shell

```
┌─ Sidebar (248px) ─┬─ Topbar (56px, sticky) ──────────────┐
│ • Unit selector   │  ☰  breadcrumbs   [⌘K search]  🔔 ?  │
│ • Nav sections    ├──────────────────────────────────────┤
│   - Operação      │                                      │
│   - Cadastros     │   <page content>                     │
│   - Inteligência  │                                      │
│   - Admin (RBAC)  │                                      │
│                   │                                      │
│ • User footer     │                                      │
└───────────────────┴────────────────────────── 💬 AI chip ┘
                                              (fixed bottom-right)
```

**Implementação Next.js:**
- `app/(app)/layout.tsx` → renderiza Sidebar + Topbar + AI chip + `<main>{children}</main>`
- `app/login/page.tsx` → fora desse layout
- Sidebar é Client Component (precisa de state para colapsar + drawer mobile)
- Topbar parcialmente client (search modal, ⌘K), breadcrumbs podem ser server-rendered via `usePathname` no client
- AI chip = Client Component, sempre montado

**Multi-tenant visual (unidade selecionada):**
- Salvar `currentUnitId` em cookie HTTP-only ou em tabela `user_preferences`
- Server components leem via `cookies()` ou Supabase
- Trocar de unidade dispara `router.refresh()` para re-renderizar SSR com novo escopo
- RLS no Postgres aplica o filtro automaticamente (ver BACKEND.md)

## 6. Componentes-chave (shadcn + custom)

| Componente | Origem | Notas |
|---|---|---|
| Button | shadcn `<Button>` | variantes: default (primary), secondary, ghost, outline, destructive |
| Card | shadcn `<Card>` | use `<CardHeader>`, `<CardContent>`, `<CardFooter>` |
| Input | shadcn `<Input>` | suporte a ícone à esquerda (clone-edit do shadcn primitivo) |
| Badge | shadcn `<Badge>` | criar variantes semânticas: `success`, `warning`, `info`, `destructive`, `neutral` + sempre com bolinha colorida à esquerda (acessibilidade) |
| Dialog | shadcn `<Dialog>` | modais (envio email, novo wizard) |
| Sheet | shadcn `<Sheet>` | drawers laterais (detalhe de fornecedor, chat contextual) |
| DropdownMenu | shadcn | menus de ação (overflow `⋯`) |
| Tabs | shadcn `<Tabs>` | sub-navegação de Configurações |
| Toast | sonner | confirmações, erros — canto inferior direito |
| Command | shadcn `<Command>` | global search (⌘K), unit selector combobox |
| Table | shadcn `<Table>` | sticky header, hover, sortable |
| Toggle / Segmented | shadcn `<ToggleGroup>` | filtros de período, "a/a vs m/m" |
| **KPI Card** | **custom** | label uppercase + valor mono grande + delta chip + linhas META/PREV — ver `prototype/ui.jsx` `KPI` component |
| **AI Chip** | **custom** | botão fixo bottom-right, expande pra mini-chat panel; opcional botão pra abrir página dedicada |
| **Matriz comparativa** | **custom** | tabela items × fornecedores, células clicáveis, melhor preço destacado, coluna "Sugestão IA" — ver SCREENS.md §4 |
| **Timeline vertical** | **custom** | eventos com dot colorido + texto + autor (ver pedido detail) |
| **NF conferência** | **custom** | grid 3-col (pedido | diff | NF) com destaque de divergências |

## 7. Padrões de interação

- **Loading:** skeletons (não spinners) com mesma estrutura do conteúdo final — implemente `loading.tsx` por rota para Suspense streaming
- **Empty states:** ilustração geométrica minimalista + título + descrição + CTA primário
- **Confirmações destrutivas:** `<AlertDialog>` (cancelar pedido, excluir fornecedor)
- **Atalhos:** `⌘K` global search, `⌘N` nova requisição, `⌘/` abrir AI chip, `Esc` fechar drawers
- **Tabelas:** sticky header, hover `bg-muted/50`, ordenação por coluna, paginação no rodapé
- **Toasts:** sonner com ícone semântico (`success` emerald, `error` red, `info` sky)

## 8. Microinterações

- Transições padrão: **150-200ms ease-out** em hovers, drawers, modais
- Drawer lateral: **280ms** com `cubic-bezier(.32, .72, .27, 1)`
- Chat IA: **streaming de resposta token-a-token** (simular cursor piscando até completar — usar `useChat` da Vercel AI SDK)
- Best-price na matriz: **fade-in sutil** quando IA termina análise (animar a coluna IA com `framer-motion`)

## 9. Responsividade

Desktop-first. Breakpoints (Tailwind padrão):
- `sm` 640px — wrap em row de headers, esconder texto secundário em buttons
- `md` 768px — KPIs em 2 colunas, NF lado-a-lado vira stack
- `lg` 1024px — sidebar fixa volta a aparecer, NF e Pedidos em grid 2-col, KPIs em 4 colunas
- `xl` 1280px — detalhe de pedido em sidebar fixa

**Mobile (< 1024px):** sidebar vira drawer com backdrop; hamburger no topbar. Tabelas largas: scroll horizontal contido em `<div className="overflow-x-auto">`. Matriz comparativa: scroll horizontal preservando primeira coluna sticky (use `<table>` com `sticky left-0` na primeira td).

**Aprovador no celular** (caso de uso explícito do PRD): garantir que a fila de aprovação e o botão "Aprovar/Rejeitar" funcionem em viewport ≥ 360px.

## 10. RBAC (perfis)

```ts
type Role = 'admin' | 'comprador' | 'aprovador' | 'solicitante';
```

| Perfil | O que vê | O que faz |
|---|---|---|
| **admin** | Tudo | Configura unidades, usuários, fornecedores, integrações, regras |
| **comprador** | Tudo exceto Configurações | Cota, dispara emails, gera pedidos, lança NF |
| **aprovador** | Dashboard com fila de aprovação destacada | Aprova/rejeita dentro da alçada |
| **solicitante** | Dashboard simplificado, suas requisições | Cria requisições para sua unidade |

Implemente no middleware:
```ts
// middleware.ts — bloquear rotas por role baseado em path
const ROUTE_ROLES: Record<string, Role[]> = {
  '/config': ['admin'],
  '/fornecedores': ['admin', 'comprador'],
  // ...
};
```

E no DB via RLS (ver BACKEND.md).

## 11. Light mode

`next-themes` com `defaultTheme="dark"`, `enableSystem` desligado (controle manual). Toggle no rodapé da sidebar (botão sol/lua) + nos Tweaks (para preview).

Tokens semânticos do shadcn (HSL vars) são o suficiente — NÃO use `dark:` modifiers do Tailwind. Toda cor sai de `bg-card`, `text-foreground`, `border-border`, etc.

## 12. Acessibilidade

- **Badges de status:** sempre cor + texto + bolinha (nunca só cor — atende WCAG)
- **Contraste:** mantenha AA mínimo em ambos os temas (já calibrado no design)
- **Foco visível:** todos os botões/inputs com `focus-visible:ring-2 ring-ring`
- **Teclado:** ⌘K, ⌘/, Esc, navegação por Tab respeitando ordem visual
- **ARIA labels** em ícones-only buttons (sidebar collapse, sino, etc.)
- **Modais/drawers:** `<Dialog>` do Radix gerencia focus trap automaticamente

## 13. Próximos passos

Leia nessa ordem:
1. `PRD.md` — entenda o produto
2. `SCREENS.md` — entenda cada tela em detalhe
3. `BACKEND.md` — modele o banco antes de codar UI
4. `IMPLEMENTATION.md` — estrutura de pastas e ordem de implementação

Depois, abra `prototype/index.html` em um browser para sentir o produto navegando.
