# PRD — LHG Compras / Suprimentos

> Cópia integral da especificação original do produto, para contexto de quem for desenvolver. Use como fonte de verdade dos requisitos funcionais.

---

# LHG Compras — Sistema de Cotação e Compras

## Visão Geral do Produto

Sistema fullstack de gestão de cotações e compras integrado ao Omie ERP, voltado para a operação multi-unidade da LHG (rede de motéis). O sistema centraliza solicitações de compra das unidades, executa cotações multi-fornecedor com apoio de IA para sugestão de melhores preços, gerencia aprovações hierárquicas, dispara cotações por email e registra a entrada de notas fiscais no Omie.

**Stack alvo:** Next.js 15/16 (App Router), Supabase (Auth + Postgres + RLS), Resend, OpenRouter (GPT), Omie API, shadcn/ui, Tailwind.

## Identidade Visual (consistente com LHG Revenue Manager)

**Tom geral:** SaaS profissional, denso em dados, mas respirável. Inspiração em Linear, Vercel e Stripe Dashboard. Nada de gradientes chamativos, nada de glassmorphism. Foco em legibilidade, hierarquia tipográfica e uso disciplinado de cor.

**Paleta:**
- Background principal: zinc-950 (dark) / white (light) — dark mode como default
- Surface (cards, painéis): zinc-900 / zinc-50
- Borders: zinc-800 / zinc-200
- Texto primário: zinc-50 / zinc-950
- Texto secundário: zinc-400 / zinc-500
- Brand accent: emerald-500 (LHG) — usado com parcimônia, só em CTAs primários e indicadores positivos
- Estados semânticos:
  - Sucesso/aprovado: emerald-500
  - Pendente/em cotação: amber-500
  - Rejeitado/cancelado: red-500
  - Informativo: sky-500
  - Neutro/rascunho: zinc-500

**Tipografia:**
- Sans: Geist Sans (interface)
- Mono: Geist Mono (códigos, IDs de pedido, valores monetários em tabelas)
- Hierarquia: 32px/28px/20px/16px/14px/12px com pesos 600/500/400

**Espaçamento e densidade:**
- Densidade média-alta nas tabelas (rows ~40px)
- Cards com padding 20-24px
- Espaçamento entre seções: 32px
- Grid principal: sidebar fixa 240px + conteúdo fluido

**Componentes shadcn/ui** como base, customizados.

## Perfis de Usuário (RBAC)

1. **Admin** — controle total: configuração de unidades, usuários, fornecedores, integrações, regras de aprovação.
2. **Comprador** — executa cotações, cadastra fornecedores, dispara emails, lança entrada de NF, integra com Omie.
3. **Solicitante** (gerente de unidade) — cria requisições de compra para sua unidade.
4. **Aprovador** — aprova/rejeita cotações dentro de alçada definida (por valor e/ou centro de custo).

Cada perfil tem **dashboard próprio** e itens de menu filtrados.

## Estrutura de Navegação

**Sidebar (sempre visível, colapsável):**
- Logo LHG + seletor de unidade (multi-tenant visual)
- Dashboard
- Requisições
- Cotações
- Pedidos de Compra
- Entrada de NF
- Fornecedores
- Produtos/Catálogo
- Chat IA (badge "novo")
- Relatórios
- Configurações (só admin)
- Footer da sidebar: avatar do usuário, papel, toggle dark/light, logout

**Topbar:**
- Breadcrumb à esquerda
- Busca global (Cmd+K) no centro — busca por nº pedido, fornecedor, produto, requisição
- Notificações (sino com contador) à direita
- Avatar + menu

## Telas Principais (descrição visual detalhada)

### 1. Login
- Layout split: esquerda 60% com fundo zinc-950 + frase de impacto sutil ("Compras inteligentes para a operação LHG") + ilustração minimalista (linhas geométricas, não stock art)
- Direita 40%: card centralizado com logo LHG, título "Entrar", botão "Continuar com Google" (cor branca, ícone Google oficial), divisor "ou", input de email (magic link como fallback)
- Microcopy embaixo: "Acesso restrito a colaboradores LHG"

### 2. Dashboard (varia por perfil)

**Admin/Comprador** — 4 KPI cards no topo:
- Cotações abertas (com delta vs semana anterior)
- Valor total em cotação (R$)
- Economia gerada no mês (R$ + %) — destaque emerald
- Pedidos pendentes de aprovação

Abaixo, grid 2 colunas:
- **Esquerda (2/3):** gráfico de linha (Recharts) — "Gastos por unidade nos últimos 6 meses", com toggle entre unidades
- **Direita (1/3):** lista de "Ações pendentes" — feed vertical com avatar, ação, tempo relativo, CTA inline

Linha inferior:
- Tabela "Cotações em andamento" (últimas 10), com colunas: nº, unidade, itens, fornecedores envolvidos, valor estimado, status (badge colorido), prazo, ações
- Cada row clicável abre o detalhe lateral (sheet)

**Solicitante** — dashboard simplificado:
- Card grande "Nova requisição" (CTA primário, ícone +)
- Lista "Minhas requisições" com status visual

**Aprovador** — fila de aprovação em destaque:
- Cards verticais de cotações aguardando, com resumo, valor, comparativo de fornecedores miniaturizado, e botões "Aprovar" / "Rejeitar" inline

### 3. Requisições de Compra
- Header: título + filtros (unidade, status, período) + botão "Nova requisição" (emerald)
- Tabela densa com: nº, solicitante (avatar+nome), unidade, qtd itens, valor estimado, status, criada em, ações
- Filtros laterais retráteis (chips de filtros ativos no topo)
- Empty state ilustrado para quando não há requisições

**Nova requisição (modal full-screen ou rota dedicada):**
- Passo 1: seleção de unidade(s) — chips multi-select com badge "Todas as unidades" como opção destacada
- Passo 2: itens — tabela editável (autocomplete de produtos do catálogo, qtd, unidade de medida, observação)
- Passo 3: justificativa + urgência (radio: normal/urgente)
- Sidebar direita com resumo dinâmico (total estimado, unidades afetadas)

### 4. Cotações (coração do sistema)

**Lista de cotações** — similar a Requisições.

**Detalhe da cotação** — layout em 3 zonas:
- **Topo:** header com nº, status (badge grande), unidade(s), prazo, ações (duplicar, cancelar, exportar PDF)
- **Centro — Matriz comparativa de fornecedores** (a tela mais importante do sistema):
  - Tabela onde **linhas = itens cotados** e **colunas = fornecedores**
  - Cada célula mostra: preço unitário, preço total, prazo de entrega, condição de pagamento (compacto)
  - Melhor preço por linha destacado com fundo emerald-500/10 e ícone de check
  - Coluna final "Sugestão IA" com badge especial (gradient sutil sky→emerald) mostrando o mix ótimo
  - Rodapé da tabela: totais por fornecedor + "Melhor combinação" (pode ser split entre fornecedores)
- **Lateral direita (drawer):** Chat IA contextual sobre essa cotação ("por que esse fornecedor?", "tem mais barato no mercado?")

**Ação primária:** botão "Gerar Pedido(s) de Compra" que abre wizard de divisão por fornecedor.

### 5. Chat IA (página dedicada + drawer contextual)

- Layout estilo Claude/ChatGPT: histórico à esquerda, conversa ao centro
- Input com sugestões de prompts ("compare preços do item X", "qual fornecedor mais usado em outubro?", "sugira economia para a unidade Liv")
- Mensagens com avatar, markdown, tabelas inline, citações de fontes (cotações ou web)
- Toggle de modelo (visível só pra admin): GPT-4, GPT-4o-mini etc. via OpenRouter
- Indicador discreto "Powered by OpenRouter" no rodapé

### 6. Pedidos de Compra
- Lista com filtros + tabela
- Detalhe do pedido: dados do fornecedor, itens, condições, status de envio ao Omie (badge: "sincronizado" / "pendente" / "erro"), histórico de eventos (timeline vertical)
- Ação "Enviar cotação por email" abre modal com preview do email (Resend template), destinatários, assunto editável

### 7. Entrada de Nota Fiscal
- Upload de XML da NFe (drag-and-drop em zona destacada) ou busca por chave de acesso
- Após parse: tela de conferência lado a lado — esquerda: pedido original; direita: NF recebida; diferenças destacadas (preço, quantidade, item divergente) em amber/red
- Botão "Lançar no Omie" (emerald, primário) com loading state e confirmação

### 8. Fornecedores
- Cards em grid 3 colunas com logo (avatar), nome, CNPJ, categoria, rating interno (5 estrelas), nº de cotações, ticket médio
- Detalhe: aba "Dados", "Histórico de cotações", "Performance" (gráfico de pontualidade + competitividade)

### 9. Configurações (admin)
- Sub-navegação por tabs: Unidades, Usuários, Regras de aprovação, Integrações (Omie, Resend, OpenRouter), Logs de auditoria
- Cada integração: card com status (verde/vermelho), última sincronização, botão "Testar conexão"

## Padrões de Interação

- **Loading:** skeletons (não spinners) em tabelas e cards; skeletons fiéis ao layout final
- **Empty states:** ilustração geométrica minimalista + título + descrição + CTA
- **Toasts:** canto inferior direito, sonner-style, com ícone semântico
- **Confirmações destrutivas:** AlertDialog (cancelar pedido, excluir fornecedor)
- **Atalhos:** Cmd+K busca global, Cmd+N nova requisição, Esc fecha drawers
- **Tabelas:** sticky header, row hover com fundo zinc-900/50, ordenação por coluna, paginação no rodapé
- **Badges de status:** pill com bolinha colorida à esquerda + texto (não usar só cor para acessibilidade)

## Microinterações
- Transições suaves (150-200ms ease-out) em hovers, drawers, modais
- Drawer lateral desliza com 280ms
- Chat IA: streaming de resposta token por token (efeito digitação real)
- Best-price na matriz comparativa: animação sutil de fade-in quando IA termina análise

## Responsividade
- Desktop-first (uso primário em desktop pelo time de compras)
- Tablet: sidebar vira drawer
- Mobile: apenas leitura e aprovações (aprovador na rua precisa aprovar pelo celular) — sem edição complexa
