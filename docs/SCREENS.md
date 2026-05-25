# Screens — detalhamento por tela

Cada seção referencia os arquivos do protótipo em `prototype/` que servem de fonte da verdade visual.

---

## 1. Login

> Referência: `prototype/screen-login.jsx`

### Layout
Split 60/40 em `lg`, single-column abaixo de `lg`.

**Esquerda (60% / `hidden lg:flex`):**
- Fundo: dark grid pattern (linhas 48px) + glows emerald em `top-left` e `bottom-right` (blur 120px, opacidade 10%)
- Top: logo + wordmark "LHG **Suprimentos**" (zinc-500 no segundo termo)
- Centro: kicker `text-[11px] uppercase tracking-[0.15em] text-lhg-400` + linha 6px emerald, headline `text-5xl font-semibold leading-[1.05]`:
  - "Cotações que se pagam." (zinc-50)
  - "Da requisição à NF, em um só lugar." (zinc-500)
- Parágrafo de apoio (zinc-400, max-w-xl)
- Strip de 3 stats no rodapé do bloco: `12,8%` economia, `6` unidades, `< 4h` ciclo — separadas por borders zinc-800
- Bottom: build version (font-mono zinc-600) + ilustração SVG abstrata mostrando o fluxo REQ → COT → IA → PED (linhas com curvas, ponto IA em emerald)

**Direita (40%):**
- Card centralizado (max-w-[400px])
- H2 "Entrar" (text-2xl)
- Subtítulo "Acesso restrito a colaboradores LHG."
- Botão **"Continuar com Google"** — `bg-white text-zinc-900`, ícone Google oficial colorido (não monocromático)
- Divisor "OU" entre dois `<hr>` zinc-800
- Label "Email corporativo" + Input grande (h-11)
- Botão **"Enviar magic link"** — `bg-lhg-500 text-zinc-950`, com loading spinner durante envio
- Footer: links Suporte / Política de uso / Status (com dot emerald pulsante)

### Implementação
- Server Component leitura de session; redireciona pra `/dashboard` se já logado
- Botão Google: server action que chama `supabase.auth.signInWithOAuth({ provider: 'google' })`
- Magic link: server action `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: '/auth/callback' }})`
- `/auth/callback` (Route Handler) troca code por session e redireciona

### Estados
- **Loading magic link:** spinner inline, botão disabled, label "Enviando link…"
- **Sucesso magic link:** trocar todo o card pelo state "Verifique seu email — enviamos um link para X" com botão "Reenviar" depois de 30s
- **Erro auth:** toast vermelho com mensagem específica

---

## 2. Dashboard do Comprador

> Referência: `prototype/screen-dashboard.jsx`

### Estrutura vertical

#### 2.1. Header
- Greet sutil "Bom/Boa tarde/noite, {primeiroNome}" (text-xs zinc-500)
- Headline: nome da unidade atual (text-3xl, ou "Todas as unidades")
- Linha meta: ícone calendário + range de datas + segmented control de período ("Últ. 7 dias / Este mês / Mês fechado / Custom")
- Right: botão outline "Exportar" + botão primary "+ Nova cotação"

#### 2.2. Toggle de comparação
Strip pequeno alinhado à direita: "COMPARAR COM" + segmented `[a/a | m/m]`

#### 2.3. KPI Grid (4 cards)

> Padrão: **label uppercase tracking-wider** + **valor mono grande (28px font-semibold)** + **delta chip** + **linha META** + **linha PREV/ANT.**

| KPI | Valor exemplo | Delta | META | Notas |
|---|---|---|---|---|
| COTAÇÕES ABERTAS | `12` | `+33.3% a/a` | `10` | mono |
| VALOR EM COTAÇÃO | `R$ 184.260,00` | `+16.3% a/a` | `R$ 180.000,00` | mono BRL |
| ECONOMIA DO MÊS | `R$ 28.640,00` | `+44.3% a/a` | `12.8%` (% s/ ORÇ.) | **accent emerald** |
| PEDIDOS PEND. APROVAÇÃO | `4` | `−33.3% a/a` (inverse — menos é melhor) | `< 24h` (SLA) | mono |

Delta chip: `bg-{color}-500/10 text-{color}-500 px-1.5 py-0.5 rounded-md` com seta ↑/↓ e "X% a/a".

#### 2.4. Grid 2/3 + 1/3

**Esquerda (lg:col-span-2): Gastos por unidade**
- Card padding-5
- Header: título + subtitle ("Últimos 6 meses · soma de pedidos aprovados") + chips toggleáveis (uma por unidade, com bolinha colorida; clicar oculta a série)
- Body: line chart 6 pontos (Dez-Mai), múltiplas séries, cada cor única por unidade
- **Implementar com Recharts**:
  ```tsx
  <ResponsiveContainer width="100%" aspect={3}>
    <LineChart data={data}>
      <CartesianGrid strokeDasharray="2 4" stroke="hsl(var(--border))" vertical={false} />
      <XAxis tick={{ fontFamily: 'var(--font-mono)', fill: 'hsl(var(--muted-foreground))', fontSize: 10 }} />
      <YAxis tick={{ fontFamily: 'var(--font-mono)', fontSize: 10 }} tickFormatter={(v) => (v/1000).toFixed(0) + 'k'} />
      <Tooltip />
      {units.map(u => <Line key={u.id} type="monotone" dataKey={u.id} stroke={u.color} dot={{ r: 2.5 }} strokeWidth={1.75} />)}
    </LineChart>
  </ResponsiveContainer>
  ```

**Direita (lg:col-span-1): Ações pendentes**
- Card padding-5
- Header: título + contador + link "Tudo"
- Lista de ~6 itens. Cada item:
  - Avatar 26px
  - Texto: **Nome** {ação} <span mono>{alvo (ID ou nome fornecedor)}</span>
  - Meta line: tempo relativo + valor BRL
  - CTA pill no hover: "Aprovar →" / "Cotar →" / "Conferir →" — texto emerald-400
- Clicar navega para o alvo (COT-* → cotação, PED-* → pedido, REQ-* → requisição)

#### 2.5. Tabela "Cotações em andamento"
- Card overflow-hidden
- Header com título "Cotações em andamento" + busca inline + botão "Filtros"
- Tabela densa (h-10 rows), colunas:
  - Nº (font-mono text-xs)
  - Título (text-zinc-100, truncate) — badge `urgente` à esquerda se aplicável
  - Unidade(s) — "Lush Ipiranga" ou "Lush Ipiranga +1"
  - Itens (mono, right)
  - Forn. (count, mono right)
  - Valor estim. (mono BRL right)
  - Economia IA (emerald, "−R$ X,XX (Y%)" — mostra `—` se zero)
  - Prazo (data curta)
  - Status (Badge)
  - Action chevron
- Row hover: `bg-zinc-900/60`, cursor pointer
- Click → abre `cotacao-detalhe`
- Footer: paginação simples "1 / 3" + chevrons

### Dashboard do Solicitante
- 1 KPI grande: "Minhas requisições" (count + valor total)
- Big CTA card "+ Nova requisição" (full-width, h-32, gradient emerald sutil + ícone grande)
- Lista vertical "Minhas requisições" com status badges

### Dashboard do Aprovador
- KPI no topo: "Aguardando sua aprovação" (count + valor total)
- **Cards verticais** de cotações aguardando — cada um com:
  - Header: ID + título + valor grande
  - Linha de fornecedores envolvidos (avatars pequenos lado-a-lado)
  - Mini-comparativo: "Higipack R$ X · Texlar R$ Y · IA sugere mix R$ Z"
  - Footer: botões inline `[Aprovar (primary emerald)] [Rejeitar (outline red)] [Ver detalhe →]`

---

## 3. Requisições

> Referência: `prototype/screen-requisicoes.jsx`

### Lista
- Header: H1 + descrição + botão primary "+ Nova requisição"
- Segmented filtro por status com contagens entre parênteses: "Todas · 6 | Rascunho · 1 | Em cotação · 2 | Pendente · 1 | Aprovado · 1 | Rejeitado · 1"
- Strip filter row: busca + filtros + exportar
- Tabela:
  - Nº (mono)
  - Título (truncate, badge `urgente` opcional)
  - Solicitante (avatar + nome)
  - Unidade
  - Itens (mono right)
  - Valor est. (mono BRL right)
  - Status (Badge)
  - Criada (relTime ex. "6h atrás")
  - Action chevron

### Nova requisição (modal)
- Modal width 760, full-screen em mobile (`Dialog` shadcn)
- Header: "Nova requisição" + "Passo X de 3 · Y"
- **Passo 1 — Unidades + Urgência:**
  - Chips multi-select de unidades. Primeira chip "✓ Todas as unidades" com destaque emerald (selecionada por default)
  - Radio cards lado-a-lado: "Normal" (cotação em 48h) / "Urgente" (cotação em 6h, notifica gerência)
  - Textarea "Justificativa"
- **Passo 2 — Itens:**
  - Tabela editável: linhas adicionáveis
  - Colunas: Produto (autocomplete do catálogo), Qtd, Un. medida, Observação, [trash]
  - Botão "+ Adicionar item"
  - Atalho: digitar código abre autocomplete de produto
- **Passo 3 — Revisar:**
  - Resumo read-only de tudo
  - Sidebar direita persistente em todos os passos: "X unidades · estimativa R$ Y" + "X itens"
- Footer: `[Cancelar (ghost)] [← Voltar (ghost)] [Continuar → / Criar requisição (primary)]`

---

## 4. Cotações — Lista

> Referência: `prototype/screen-cotacoes.jsx`

Similar a Requisições. Adicionais:
- **3 mini-KPIs no topo:** "EM COTAÇÃO ATIVA" / "ECONOMIA IA ACUMULADA" / "CICLO MÉDIO (dias)"
- Coluna "Economia IA" mostra "−R$ X (Y%)" em emerald, ou `—` se nenhuma
- Coluna "Título" tem ícone ✨ (sparkles) quando IA já analisou

---

## 5. Cotação — Detalhe (a tela HERO)

> Referência: `prototype/screen-cotacao-detalhe.jsx` — **leia esse arquivo inteiro, é a peça mais complexa do design.**

### Header
- Top breadcrumb: "← Voltar · Atualizada Xh atrás · ✨ IA analisou esta cotação"
- ID font-mono + Badge de status
- Headline title (text-2xl/[26px])
- Linha meta horizontal com ícones: unidades / prazo / solicitante
- Right actions (wrap em mobile): `[Duplicar (ghost icon-only mobile)] [PDF (ghost)] [Enviar cotação (outline)] [Gerar pedido(s) (primary emerald)]`

### Banner Sugestão IA
- Card gradient `from-lhg-500/[0.06] via-sky-500/[0.04]` border `border-lhg-500/30`
- Ícone redondo gradient emerald 32px
- Título "Sugestão da IA" + badge mini "ECONOMIA DETECTADA"
- Body: explicação em prosa da combinação ótima (~2-3 linhas)
- Actions: `[✓ Aplicar sugestão IA (primary sm)] [Ver análise detalhada (ghost sm)]`
- Right: "ECONOMIA ESTIMADA" + valor grande emerald + percent
- Botão fechar (x) — esconde o banner

### Matriz comparativa (componente custom)

> O coração do produto. Tabela com **linhas = itens cotados** e **colunas = fornecedores + 1 coluna especial "Sugestão IA"**.

**Estrutura HTML:**
```
| Item (sticky left)         | Fornecedor A | Fornecedor B | Fornecedor C | ... | ✨ Sugestão IA |
| AME-001                    |              |              |              |     |                |
| Kit amenities premium...   | célula       | célula       | célula       |     | célula AI      |
| 320 kit · Amenities        |              |              |              |     |                |
```

**Célula de fornecedor (clicável, é um picker):**
- Preço unitário grande mono (`R$ 28,40`)
- Linha "total" + total mono (`total R$ 9.088,00`)
- Linha mini: `3d entrega    30 dias` (left/right)
- **Se for melhor preço da linha:** fundo `bg-lhg-500/[0.06]` + ícone `✓` verde no canto + texto em emerald-400
- **Se fornecedor não atende esse item:** célula fica com `border-dashed border-zinc-800` e label "não atende" centralizado, opacity reduzida
- **Se selecionada (picked):** ring `ring-1 ring-lhg-500/40 bg-lhg-500/10`

**Coluna especial "Sugestão IA":**
- Header: ícone gradient + texto "Sugestão IA" + sub "mix ótimo por item"
- Background sutil: `bg-gradient-to-b from-lhg-500/[0.04] to-transparent`
- Border esquerda: `border-l-2 border-lhg-500/40`
- Célula: mostra o fornecedor sugerido pra cada linha (avatar mini + nome) + preço + total — em emerald

**Header da coluna fornecedor:**
- Avatar mini 24px (colored letter tile)
- Nome do fornecedor
- Sub: `⭐ {rating}  ·  {pontualidade}% pontual`

**Footer da matriz (totals row):**
- Label "Total se 100% no fornecedor"
- Para cada coluna: total se aquele fornecedor atendesse todos os itens (mono) + "Xd entrega total"
- Se fornecedor não atende todos os itens: mostra "parcial · X/Y"
- Melhor coluna fica destacada em emerald
- Coluna IA mostra "MELHOR COMBINAÇÃO" — em emerald, total geral

**Legenda no header:**
- `🟩 melhor preço` `🔲 não atende`

### Layout alternativo (Tweak: cards)
Modo "cards" mostra **um card por item**, com grid de tiles internos (1 por fornecedor + 1 da IA). Útil para mobile.

### Bottom sticky summary bar
Fica sticky no rodapé enquanto rola. Cols:
- "SELEÇÃO ATUAL" — valor mono + "X/Y itens"
- "✨ MIX ÓTIMO IA" — valor emerald
- "SEM OTIMIZAÇÃO" — line-through zinc-400
- Spacer
- "ECONOMIA" — valor emerald + percent
- Botão primary "Gerar pedido(s) de compra →"

### Wizard "Gerar pedidos"
Modal width 620:
- Texto: "A cotação será dividida em **X pedidos**, um por fornecedor"
- Lista de cards: cada fornecedor + #itens + valor + pgto
- Disclaimer: "Os pedidos seguirão para aprovação de {aprovador} (alçada R$ Y) antes de serem enviados aos fornecedores e sincronizados com o Omie."
- Footer: `[Cancelar] [Confirmar e gerar →]`

### AI chat drawer (contextual)
Botão "💬" abre Sheet lateral 480px com chat contextualizado nessa cotação. Sugestões iniciais:
- "Por que a sugestão IA prefere Texlar para toalhas?"
- "Tem fornecedor mais barato no mercado para esse SKU?"
- "Vale a pena consolidar tudo no Higipack?"

---

## 6. Pedidos de Compra

> Referência: `prototype/screen-pedidos.jsx`

### Layout 2-col (xl) ou stack (< xl)

**Esquerda (lista):**
- Segmented filtro por status com contagens
- Tabela colunas: Nº, Fornecedor (avatar+nome), Valor (mono), Entrega (data), Omie (chip status: ok/pend./erro), Status (Badge)
- Row clicada destaca em `bg-zinc-900/80` e popula o painel direito

**Direita (detail panel):**
Sticky em xl, height calculada. Estrutura:
- Header: ID + status badges (incl. "erro Omie" se aplicável)
- Block fornecedor: avatar grande + nome + CNPJ + valor grande à direita + "X itens · Y pgto"
- Sub-grid 3 cols meta: Cotação / Entrega prev. / Unidade(s)
- Action bar inline: `[Enviar cotação (primary, abre modal email)] [PDF (outline)] [Duplicar (outline)] [⋯ overflow]`
- **Timeline vertical** com eventos:
  - Bolinhas coloridas por tipo (criado=plus-zinc, aprovado=check-emerald, omie=refresh-zinc, email=mail-sky, erro=alert-red)
  - Linha conectora `bg-zinc-800` vertical
  - Cada evento: título + meta line (data formatada `DD MMM · HH:mm · autor`)
- Block "Nota fiscal" (se houver): card compacto com chave NFe + badge "conferida"

### Modal "Enviar cotação por email"
Width 680. Estrutura form:
- Subheader: "via Resend · template padrão LHG"
- Grid `[label 80px | input]`:
  - Para: chips de emails (default email do fornecedor)
  - CC: input livre
  - Assunto: input pré-preenchido `"Cotação {COT} — LHG / {Fornecedor}"`
- Preview do email body em card scrollable (rendering do React Email template)
- Anexo: mini-row `📎 cotacao-{COT}.pdf · 124 KB`
- Footer: checkbox "Solicitar confirmação de leitura" + `[Cancelar] [Enviar (primary)]`

### Status do pedido
- `rascunho` (zinc) → ainda não enviado
- `aguardando-aprovacao` (amber) → fila do aprovador
- `enviado` (sky) → email disparado, aguarda confirmação
- `em-transito` (sky) → fornecedor confirmou
- `recebido` (emerald) → NF lançada
- `finalizado` (emerald) → fechado
- `erro-omie` (red) → falha na sincronização

### Status Omie (chip separado)
`sincronizado` (emerald dot) / `pendente` (amber dot) / `erro` (red dot)

---

## 7. Entrada de NF

> Referência: `prototype/screen-nf.jsx`

### Step 1: Upload
- Zona drag-and-drop grande (border-2 dashed)
- Estados:
  - `idle`: ícone upload + "Arraste o arquivo .xml aqui" + "ou clique para selecionar" + botão alternativo
  - `dragover`: border emerald, bg `bg-lhg-500/5`
  - `uploading`: spinner inline + progress bar emerald
  - `error`: msg vermelha
- Abaixo: divisor + "Ou cole a chave de acesso (44 dígitos)" + Input mono

### Step 2: Conferência (a tela complexa)

**Top:**
- Breadcrumb "← Nova NF · NF importada com sucesso · X itens detectados"
- Headline "Conferência de NF" + descrição

**Alert banner:**
- Card border-amber bg `amber-500/[0.06]`
- Ícone alert
- "X divergências detectadas" + explicação

**Header cards lado-a-lado (md+):**
- Card "Pedido original": avatar fornecedor + ID pedido + total mono
- Card "NF recebida" (border-amber): badge "divergente" + NFe número/série + chave mascarada + total amber + delta

**Tabela items linha-a-linha:**
Grid `[1fr | 140px | 1fr]` em md+ (stack em mobile). Header: "No pedido | Δ | Na NF".

Cada item:
- Coluna esquerda (pedido): código + nome + grid [QTD | UNIT. | TOTAL] mono
- Coluna central (diff): status badge + delta mono em amber/emerald + seta →
  - Status:
    - `ok` → badge "ok" emerald
    - `preco` → badge "preço divergente" amber + amber no preço NF
    - `qtd` → badge "qtd divergente" amber + amber na qtd NF
    - `extra` → badge "item adicional" sky + esquerda fica opacity-40 com "não estava no pedido"
  - Ações se não OK: `[Aceitar (outline emerald sm)] [Contestar (outline zinc sm)]`
- Coluna direita (NF): mesma estrutura, com valores em amber se divergentes

**Bottom row (totals):**
- Pedido: total mono | Δ (diferença total) | NF: total amber

**Sticky action bar fixo bottom-center:**
- "Diferença total" + delta mono
- Botões: `[Salvar como pendente (ghost)] [Recusar NF (outline)] [Lançar no Omie (primary emerald, com loading)]`

### Step 3: Sucesso
- Tela cheia centralizada com ícone check grande emerald + "NF lançada no Omie" + descrição
- CTA "Lançar outra NF" (primary)

---

## 8. Assistente IA (página dedicada)

> Referência: `prototype/screen-chat.jsx`

### Layout
Two-pane fullscreen (excluindo topbar):

**Esquerda (272px, hidden em md-):**
- Botão "+ Nova conversa" full-width
- Section "HISTÓRICO" com lista de conversas anteriores (título + tempo relativo)
- Footer: "Powered by OpenRouter v1.4"

**Direita (flex-1):**
- Header (h-12): título "Assistente IA · Compras LHG" + indicador "Acesso a X cotações · Y pedidos · Z fornecedores" + (admin only) toggle de modelo
- Body scrollable com mensagens — max-w-3xl mx-auto
- Footer: input grande com textarea (auto-resize), pill "Contexto: Cotações" (chip clicável que abre filtro), paperclip, send button

### Mensagens

**User:**
- Bubble `bg-zinc-800 rounded-2xl rounded-tr-md` (cantos arredondados, ângulo invertido em cima-direita)
- Alinhada à direita

**AI:**
- Avatar gradient emerald 28px à esquerda
- Conteúdo full-width respeitando max-w-3xl
- Markdown rendering:
  - **Negrito** com `text-zinc-50 font-semibold`
  - Listas com bullets ou números
  - Tabelas em pipe `| col1 | col2 |` → renderizar como `<table>` com border zinc-800/80 + header `bg-zinc-900/60` + colunas mono right-aligned
  - Headers `**TITLE**` em linha sozinha → `text-zinc-50 font-semibold mt-2`
- **Streaming token-a-token** — cursor `|` piscando enquanto digita
- Fontes consultadas (após streaming termina): bloco "FONTES CONSULTADAS" com chips clicáveis (`COT-2026-0142 · 20 mai · Higipack`)
- Actions: copy / refresh / 👍 / 👎 em row pequena cinza

### Empty state (nova conversa)
- Avatar grande emerald centro
- H2 "Como posso ajudar hoje?"
- Sub: "Pergunte sobre cotações, fornecedores, gastos por unidade ou padrões históricos."
- Grid 2-col de prompts sugeridos (4 cards). Cada um: ícone emerald + label "Sugestão" + texto do prompt clicável

### AI Chip (sempre presente)
Botão flutuante bottom-right (`fixed bottom-5 right-5 z-40`):
- Estado fechado: pill `h-11 bg-zinc-900 border-zinc-700/70`, ícone gradient emerald, label "Assistente IA", kbd `⌘ /`
- Estado aberto: panel 420×560 com header (avatar + título + contexto + open-full + close), body com mensagens, sugestões iniciais (3), footer com input simples
- **Contexto contextual:** muda baseado na rota. Em `/cotacoes/{id}` mostra "Contexto: Cotação X" e sugere prompts específicos sobre aquela cotação.

### Implementação chat

Use **Vercel AI SDK** (`useChat` hook) com endpoint `/api/chat` (Route Handler) que faz streaming via OpenRouter:

```ts
// app/api/chat/route.ts
import { streamText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_KEY });

export async function POST(req: Request) {
  const { messages, context } = await req.json();
  // Inject RAG context based on `context` (cotação ID, etc) — fetch from Supabase
  const ragContext = await buildContext(context);
  const result = streamText({
    model: openrouter('openai/gpt-4o'),
    system: `Você é o copiloto de compras LHG. Use os dados a seguir:\n${ragContext}`,
    messages,
  });
  return result.toDataStreamResponse();
}
```

Contexto RAG: buscar cotações, pedidos e fornecedores relevantes do Supabase e injetar no system prompt. Para perguntas amplas, usar embeddings (pgvector).

---

## 9. Fornecedores

> Referência: `prototype/screen-fornecedores.jsx`

### Lista grid (default)
- Header padrão
- Strip: chips de categorias + busca + toggle grid/list à direita
- Grid responsivo: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3`
- Card por fornecedor:
  - Avatar colored 48px + nome + CNPJ mono
  - Linha categoria (zinc-400)
  - Linha rating: 5 estrelas (filled/empty) + nº rating + "(X cotações)"
  - Grid de 3 mini-stats: Pontualidade / Competitividade / Ticket médio
- Click → abre Drawer com detalhe

### Modo lista
Tabela colunas: Fornecedor (avatar+nome), Categoria, CNPJ, Rating (⭐ N), Cotações, Pontual., Ticket

### Drawer detalhe (Sheet shadcn, width 520)
- Header: CNPJ mono + avatar + nome + categoria
- Body:
  - Grid 2-col stats grandes (Pontualidade / Competitividade) com bar gauges
  - Card "Contato" com email
  - Card "Histórico de pedidos · 6 meses" com mini bar chart + meta line
- Footer: `[Nova cotação (outline)] [Editar (ghost)]`

---

## 10. Configurações (admin only)

### Layout
Tabs horizontais no topo (shadcn `<Tabs>`):
- Unidades
- Usuários
- Regras de aprovação
- Integrações
- Logs de auditoria

### Aba "Integrações"
Grid de cards:
- **Omie ERP** — status verde/vermelho dot + última sync + `[Testar conexão] [Configurar]`
- **Resend** — idem
- **OpenRouter** — idem + dropdown de modelo padrão

Cada card: header (logo + nome + dot status), métrica chave (ex: "X sincronizações nas últimas 24h"), botões.

### Aba "Regras de aprovação"
Tabela: nº regra + alçada (R$ máx) + perfis envolvidos + escopo (centro de custo, categoria, etc) + status (ativo/inativo) + ações.

Botão "+ Nova regra" abre modal multi-step.

---

## Padrões transversais

### Empty states
Para qualquer tela sem dados:
```tsx
<div className="flex flex-col items-center justify-center text-center py-16">
  <div className="w-14 h-14 rounded-2xl border bg-muted/40 flex items-center justify-center text-muted-foreground">
    <Icon className="w-5 h-5" />
  </div>
  <h3 className="mt-4 text-sm font-medium">Título do empty state</h3>
  <p className="mt-1 text-xs text-muted-foreground max-w-xs">Descrição contextual.</p>
  <Button className="mt-4" size="sm">CTA</Button>
</div>
```

### Loading skeletons
Por rota, criar `loading.tsx` com layout idêntico ao final, substituindo conteúdo por:
```tsx
<div className="skeleton h-4 w-32 rounded" />
```
Onde `.skeleton` é uma classe global com animação shimmer (ver protótipo `index.html`).

### Toasts (sonner)
- Success: `toast.success("NF lançada no Omie", { description: "Pedido PED-X fechado · R$ Y" })`
- Error: `toast.error("Falha ao sincronizar com Omie", { description: errorMessage })`
- Info: `toast.info("3 novas cotações disponíveis")`

### Confirmações destrutivas
Sempre `<AlertDialog>` shadcn. Nunca confirmar com `window.confirm()` ou apenas toast.
