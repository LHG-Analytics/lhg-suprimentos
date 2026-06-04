# Omie Sync Bidirecional Completo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar o CRUD completo bidirecional LHG Suprimentos ↔ Omie ERP, cobrindo Cotações (Requisição de Compra), Pedidos (fix + edit/delete), NF → Recebimento → Conclusão, Criar Fornecedores e Criar Produtos.

**Architecture:** Novos módulos isolados em `lib/omie/` (requisicao.ts, pedidos.ts, recebimento.ts). Helpers `incluirCliente` e `incluirProduto` vão em `lib/omie/client.ts`. Server Actions seguem padrão existente: `"use server"`, `createClient()`, `getUser()`, operação Omie, operação Supabase, `revalidatePath`.

**Tech Stack:** Next.js 15 App Router, Supabase (PostgreSQL), Omie ERP API, TypeScript, Zod, Sonner (toasts).

---

## Arquitetura de Arquivos

**Criar:**
- `lib/omie/requisicao.ts` — incluirReq, upsertReq, excluirReq
- `lib/omie/pedidos.ts` — incluirPedCompra, alterarPedCompra, excluirPedCompra, consultarPedCompra
- `lib/omie/recebimento.ts` — listarRecebimentos, associarPedidoRecebimento, concluirRecebimento
- `app/(app)/cotacoes/_components/editar-cotacao-modal.tsx` — modal de edição
- `app/(app)/fornecedores/_components/criar-fornecedor-modal.tsx` — modal de criação
- `app/(app)/produtos/_components/criar-produto-modal.tsx` — modal de criação

**Modificar:**
- `lib/omie/client.ts` — add `incluirCliente`, `incluirProduto`
- `app/(app)/cotacoes/actions.ts` — add `editarCotacao`, sync Omie em `criarCotacao`/`deletarCotacao`
- `app/(app)/cotacoes/_components/cotacoes-client.tsx` — add edit button + modal
- `app/(app)/pedidos/actions.ts` — fix `pushPedidoOmie`, add `editarPedido`, `excluirPedidoOmie`
- `app/(app)/notas-fiscais/actions.ts` — extend `lancarNFOmie` (auto-associate), add `concluirRecebimentoOmie`
- `app/(app)/notas-fiscais/_components/nf-client.tsx` — add "Concluir no Omie" button
- `app/(app)/fornecedores/actions.ts` — add `criarFornecedor`
- `app/(app)/fornecedores/_components/fornecedores-client.tsx` — add "Novo Fornecedor" button + modal
- `app/(app)/produtos/actions.ts` — add `criarProduto`
- `app/(app)/produtos/_components/produtos-client.tsx` — add "Novo Produto" button + modal

---

## Task 1: SQL Migrations

**Files:**
- SQL para executar no Supabase SQL Editor

- [ ] **Step 1: Rodar migration das cotações**

Abrir o Supabase SQL Editor e executar:

```sql
ALTER TABLE cotacoes
  ADD COLUMN IF NOT EXISTS omie_codigo          TEXT,
  ADD COLUMN IF NOT EXISTS omie_sincronizado_em TIMESTAMPTZ;
```

Verificar: `SELECT column_name FROM information_schema.columns WHERE table_name = 'cotacoes' AND column_name = 'omie_codigo';` — deve retornar 1 linha.

- [ ] **Step 2: Rodar migration das notas_fiscais**

```sql
ALTER TABLE notas_fiscais
  ADD COLUMN IF NOT EXISTS omie_receb_id  INTEGER,
  ADD COLUMN IF NOT EXISTS omie_concluido BOOLEAN DEFAULT FALSE;
```

Verificar: `SELECT column_name FROM information_schema.columns WHERE table_name = 'notas_fiscais' AND column_name IN ('omie_receb_id','omie_concluido') ORDER BY column_name;` — deve retornar 2 linhas.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: SQL migrations — cotacoes.omie_codigo + notas_fiscais.omie_receb_id/omie_concluido"
```

---

## Task 2: lib/omie/requisicao.ts

**Files:**
- Create: `lib/omie/requisicao.ts`

- [ ] **Step 1: Criar o arquivo com os três helpers Omie**

Criar `lib/omie/requisicao.ts` com o conteúdo completo:

```typescript
/**
 * lib/omie/requisicao.ts
 * Operações Omie para Requisição de Compra.
 * LHG "Cotação" = Omie "Requisição de Compra" (/produtos/requisicaocompra/).
 *
 * codIntReqCompra = cotacao.id (UUID)
 * Fornecedor registrado em obsReqCompra: "Fornecedor: {nome_fantasia}"
 */
import { omiePost, OmieCredentials } from "./client";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface OmieReqItem {
  codIntItem:  string;   // UUID do cotacao_item
  codProd?:    number;   // produto.omie_codigo (se existir)
  qtde:        number;
  precoUnit:   number;   // 0 se não houver preço ainda
  obsItem?:    string;
}

export interface OmieReqParam {
  codIntReqCompra:  string;           // cotacao.id
  dtSugestao?:      string;           // DD/MM/YYYY
  obsReqCompra?:    string;           // "Fornecedor: {nome}"
  ItensReqCompra:   OmieReqItem[];
}

interface IncluirReqResponse {
  nCodReqCompra?: number;
  cCodIntReqCompra?: string;
}

// ── incluirReq ─────────────────────────────────────────────────────────────────

/**
 * Cria uma Requisição de Compra no Omie.
 * Retorna o nCodReqCompra gerado pelo Omie (salvar em cotacoes.omie_codigo).
 */
export async function incluirReq(
  creds: OmieCredentials,
  param: OmieReqParam,
): Promise<number> {
  const res = await omiePost<
    { requisicaoCadastro: OmieReqParam },
    IncluirReqResponse
  >(
    "/produtos/requisicaocompra/",
    "IncluirReq",
    creds,
    { requisicaoCadastro: param },
  );
  return res.nCodReqCompra ?? 0;
}

// ── upsertReq ─────────────────────────────────────────────────────────────────

/**
 * Cria ou atualiza (idempotente) uma Requisição de Compra no Omie.
 * Usar em editarCotacao.
 */
export async function upsertReq(
  creds: OmieCredentials,
  param: OmieReqParam,
): Promise<void> {
  await omiePost<
    { requisicaoCadastro: OmieReqParam },
    Record<string, unknown>
  >(
    "/produtos/requisicaocompra/",
    "UpsertReq",
    creds,
    { requisicaoCadastro: param },
  );
}

// ── excluirReq ─────────────────────────────────────────────────────────────────

/**
 * Exclui uma Requisição de Compra no Omie pelo código de integração.
 */
export async function excluirReq(
  creds: OmieCredentials,
  codIntReqCompra: string,
): Promise<void> {
  await omiePost<
    { requisicaoCadastro: { codIntReqCompra: string } },
    Record<string, unknown>
  >(
    "/produtos/requisicaocompra/",
    "ExcluirReq",
    creds,
    { requisicaoCadastro: { codIntReqCompra } },
  );
}
```

- [ ] **Step 2: Verificar que não há erros de TypeScript**

```bash
cd C:\Users\danil\Desktop\LHG-SUPRIMENTOS\lhg-suprimentos
npx tsc --noEmit --project tsconfig.json 2>&1 | Select-String "requisicao"
```

Esperado: nenhuma linha de erro envolvendo `requisicao.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/omie/requisicao.ts
git commit -m "feat: lib/omie/requisicao.ts — incluirReq, upsertReq, excluirReq"
```

---

## Task 3: lib/omie/pedidos.ts

**Files:**
- Create: `lib/omie/pedidos.ts`

- [ ] **Step 1: Criar o arquivo**

Criar `lib/omie/pedidos.ts`:

```typescript
/**
 * lib/omie/pedidos.ts
 * Operações Omie para Pedido de Compra.
 * Endpoint correto: /produtos/pedidocompra/ (não /compras/pedidocompras/).
 *
 * Este módulo substitui o uso de criarPedidoCompra() (legado) em pushPedidoOmie.
 * A função legada é mantida em client.ts para compatibilidade com código existente.
 */
import { omiePost, OmieCredentials } from "./client";

// ── Tipos ──────────────────────────────────────────────────────────────────────

export interface OmiePedItemIncluir {
  cCodIntItem: string;   // UUID do pedido_item
  nCodProd:    number;   // produto.omie_codigo
  nQtde:       number;
  nValUnit:    number;
}

export interface OmiePedCabecalhoIncluir {
  cCodIntPed:   string;   // pedido.id
  nCodFor:      number;   // fornecedor.omie_codigo
  dDtPrevisao?: string;   // DD/MM/YYYY
  cObs?:        string;
}

export interface OmiePedParamIncluir {
  cabecalho_incluir: OmiePedCabecalhoIncluir;
  produtos_incluir:  OmiePedItemIncluir[];
}

interface IncluirPedCompraResponse {
  nCodPed?: number;
  cCodIntPed?: string;
}

// ── incluirPedCompra ───────────────────────────────────────────────────────────

/**
 * Cria um Pedido de Compra no Omie.
 * Endpoint: POST /produtos/pedidocompra/ — call: IncluirPedCompra
 * Retorna nCodPed (salvar em pedidos.omie_codigo).
 */
export async function incluirPedCompra(
  creds: OmieCredentials,
  param: OmiePedParamIncluir,
): Promise<number> {
  const res = await omiePost<OmiePedParamIncluir, IncluirPedCompraResponse>(
    "/produtos/pedidocompra/",
    "IncluirPedCompra",
    creds,
    param,
  );
  return res.nCodPed ?? 0;
}

// ── alterarPedCompra ───────────────────────────────────────────────────────────

export interface OmiePedCabecalhoAlterar {
  nCodPed:      number;   // pedidos.omie_codigo
  cCodIntPed?:  string;
  nCodFor?:     number;
  dDtPrevisao?: string;
  cObs?:        string;
}

export interface OmiePedParamAlterar {
  cabecalho_alterar: OmiePedCabecalhoAlterar;
  produtos_alterar:  OmiePedItemIncluir[];
}

/**
 * Altera um Pedido de Compra no Omie.
 * Endpoint: POST /produtos/pedidocompra/ — call: AlteraPedCompra
 */
export async function alterarPedCompra(
  creds: OmieCredentials,
  param: OmiePedParamAlterar,
): Promise<void> {
  await omiePost<OmiePedParamAlterar, Record<string, unknown>>(
    "/produtos/pedidocompra/",
    "AlteraPedCompra",
    creds,
    param,
  );
}

// ── excluirPedCompra ───────────────────────────────────────────────────────────

/**
 * Exclui um Pedido de Compra no Omie pelo nCodPed.
 * Endpoint: POST /produtos/pedidocompra/ — call: ExcluirPedCompra
 */
export async function excluirPedCompra(
  creds: OmieCredentials,
  nCodPed: number,
): Promise<void> {
  await omiePost<{ nCodPed: number }, Record<string, unknown>>(
    "/produtos/pedidocompra/",
    "ExcluirPedCompra",
    creds,
    { nCodPed },
  );
}

// ── consultarPedCompra ─────────────────────────────────────────────────────────

/**
 * Consulta um Pedido de Compra no Omie.
 */
export async function consultarPedCompra(
  creds: OmieCredentials,
  nCodPed: number,
): Promise<Record<string, unknown>> {
  return omiePost<{ nCodPed: number }, Record<string, unknown>>(
    "/produtos/pedidocompra/",
    "ConsultarPedCompra",
    creds,
    { nCodPed },
  );
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | Select-String "pedidos.ts"
```

Esperado: sem erros em `pedidos.ts`.

- [ ] **Step 3: Commit**

```bash
git add lib/omie/pedidos.ts
git commit -m "feat: lib/omie/pedidos.ts — incluirPedCompra, alterarPedCompra, excluirPedCompra"
```

---

## Task 4: lib/omie/recebimento.ts

**Files:**
- Create: `lib/omie/recebimento.ts`

> ⚠️ Os parâmetros exatos do endpoint `/produtos/recebimento/` devem ser verificados na documentação Omie ou via teste real. Os parâmetros abaixo são baseados na documentação disponível e podem precisar de ajuste.

- [ ] **Step 1: Criar o arquivo**

Criar `lib/omie/recebimento.ts`:

```typescript
/**
 * lib/omie/recebimento.ts
 * Gerencia vínculo NF → Pedido e conclusão do recebimento no Omie.
 * Endpoint: /produtos/recebimento/
 *
 * ATENÇÃO: Verificar parâmetros exatos na doc Omie antes de chamar em prod.
 * Os campos nCodNota, nIdReceb, nCodPed foram confirmados no suporte Omie.
 */
import { omiePost, OmieCredentials } from "./client";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface ListarRecebimentosParam {
  nCodNota: number;   // ID da nota no Omie (retornado por IncluirNota)
}

interface OmieRecebimento {
  nIdReceb:  number;
  nCodNota:  number;
  nCodPed?:  number;
  cStatus?:  string;
}

interface ListarRecebimentosResponse {
  recebimentos?: OmieRecebimento[];
  lista_recebimentos?: OmieRecebimento[];
}

// ── listarRecebimentos ─────────────────────────────────────────────────────────

/**
 * Lista os recebimentos associados a uma nota fiscal pelo nCodNota.
 * Retorna o nIdReceb necessário para associar pedido e concluir.
 */
export async function listarRecebimentos(
  creds: OmieCredentials,
  nCodNota: number,
): Promise<OmieRecebimento[]> {
  const res = await omiePost<ListarRecebimentosParam, ListarRecebimentosResponse>(
    "/produtos/recebimento/",
    "ListarRecebimentos",
    creds,
    { nCodNota },
  );
  return res.recebimentos ?? res.lista_recebimentos ?? [];
}

// ── associarPedidoRecebimento ──────────────────────────────────────────────────

/**
 * Associa um Pedido de Compra a um recebimento (vínculo NF → Pedido).
 * Chama AlterarRecebimento com a ação ASSOCIAR-PEDIDO.
 */
export async function associarPedidoRecebimento(
  creds: OmieCredentials,
  nIdReceb: number,
  nCodPed: number,
): Promise<void> {
  await omiePost<
    { nIdReceb: number; nCodPed: number; cAcao: string },
    Record<string, unknown>
  >(
    "/produtos/recebimento/",
    "AlterarRecebimento",
    creds,
    { nIdReceb, nCodPed, cAcao: "ASSOCIAR-PEDIDO" },
  );
}

// ── concluirRecebimento ────────────────────────────────────────────────────────

/**
 * Conclui o recebimento no Omie (finaliza o fluxo de compra).
 */
export async function concluirRecebimento(
  creds: OmieCredentials,
  nIdReceb: number,
): Promise<void> {
  await omiePost<{ nIdReceb: number }, Record<string, unknown>>(
    "/produtos/recebimento/",
    "ConcluirRecebimento",
    creds,
    { nIdReceb },
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/omie/recebimento.ts
git commit -m "feat: lib/omie/recebimento.ts — listarRecebimentos, associarPedido, concluirRecebimento"
```

---

## Task 5: lib/omie/client.ts — incluirCliente + incluirProduto

**Files:**
- Modify: `lib/omie/client.ts`

- [ ] **Step 1: Adicionar incluirCliente ao final de client.ts**

Abrir `lib/omie/client.ts` e adicionar após a função `alterarFornecedor` (linha ~1067):

```typescript
// ── IncluirCliente ─────────────────────────────────────────────────────────────

interface IncluirClienteParam {
  razao_social:   string;
  cnpj_cpf:       string;
  nome_fantasia:  string;
  email?:         string;
  telefone1_ddd?: string;
  telefone1_numero?: string;
  contato?:       string;
  endereco?:      string;
  cep?:           string;
  cidade?:        string;
  estado?:        string;
  tags?:          Array<{ tag: string }>;
  codigo_cliente_integracao?: string;
}

interface IncluirClienteResponse {
  codigo_cliente_omie: number;
  codigo_cliente_integracao?: string;
}

/**
 * Cria um novo cliente/fornecedor no Omie.
 * Sempre inclui tag "Fornecedor" para o sync reverso funcionar.
 * Endpoint: POST /geral/clientes/ — call: IncluirCliente
 * Retorna codigo_cliente_omie para salvar em fornecedores.omie_codigo.
 */
export async function incluirCliente(
  creds: OmieCredentials,
  params: {
    razao_social:   string;
    cnpj_cpf:       string;
    nome_fantasia:  string;
    email?:         string;
    telefone?:      string;
    contato?:       string;
    endereco?:      string;
    cep?:           string;
    cidade?:        string;
    uf?:            string;
    codigo_integracao?: string;
  },
): Promise<number> {
  const digits  = (params.telefone ?? "").replace(/\D/g, "");
  const ddd     = digits.length >= 10 ? digits.slice(0, 2) : "";
  const numero  = digits.length >= 10 ? digits.slice(2)    : digits;

  const res = await omiePost<IncluirClienteParam, IncluirClienteResponse>(
    "/geral/clientes/",
    "IncluirCliente",
    creds,
    {
      razao_social:              params.razao_social,
      cnpj_cpf:                  params.cnpj_cpf.replace(/\D/g, ""),
      nome_fantasia:             params.nome_fantasia,
      email:                     params.email ?? "",
      telefone1_ddd:             ddd,
      telefone1_numero:          numero,
      contato:                   params.contato ?? "",
      endereco:                  params.endereco ?? "",
      cep:                       (params.cep ?? "").replace(/\D/g, ""),
      cidade:                    params.cidade ?? "",
      estado:                    params.uf ?? "",
      tags:                      [{ tag: "Fornecedor" }],
      codigo_cliente_integracao: params.codigo_integracao ?? "",
    },
  );
  return res.codigo_cliente_omie;
}

// ── IncluirProduto ─────────────────────────────────────────────────────────────

interface IncluirProdutoParam {
  codigo_produto_integracao: string;
  descricao:                 string;
  unidade:                   string;
  ncm:                       string;
  valor_unitario:            number;
  descricao_familia?:        string;
  codigo?:                   string;
}

interface IncluirProdutoResponse {
  codigo_produto:             number;
  codigo_produto_integracao?: string;
}

/**
 * Cria um novo produto no Omie.
 * NCM é obrigatório pela API Omie.
 * Endpoint: POST /geral/produtos/ — call: IncluirProduto
 * Retorna codigo_produto para salvar em produtos.omie_codigo.
 */
export async function incluirProduto(
  creds: OmieCredentials,
  params: {
    nome:            string;
    unidade:         string;
    ncm:             string;
    valor_unitario:  number;
    familia_omie?:   string;
    codigo_interno?: string;
    codigo_integracao: string;   // LHG-{uuid.slice(0,8)}
  },
): Promise<number> {
  const res = await omiePost<IncluirProdutoParam, IncluirProdutoResponse>(
    "/geral/produtos/",
    "IncluirProduto",
    creds,
    {
      codigo_produto_integracao: params.codigo_integracao,
      descricao:                 params.nome,
      unidade:                   params.unidade,
      ncm:                       params.ncm.replace(/\D/g, ""),
      valor_unitario:            params.valor_unitario,
      descricao_familia:         params.familia_omie ?? "",
      codigo:                    params.codigo_interno ?? "",
    },
  );
  return res.codigo_produto;
}
```

- [ ] **Step 2: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | Select-String "client.ts"
```

Esperado: sem erros.

- [ ] **Step 3: Commit**

```bash
git add lib/omie/client.ts
git commit -m "feat: omie/client.ts — add incluirCliente + incluirProduto"
```

---

## Task 6: cotacoes/actions.ts — Omie sync

**Files:**
- Modify: `app/(app)/cotacoes/actions.ts`

- [ ] **Step 1: Adicionar imports no topo de actions.ts**

No arquivo `app/(app)/cotacoes/actions.ts`, substituir a linha de imports do início do arquivo para adicionar as importações Omie:

```typescript
"use server";

/**
 * actions.ts — LHG-210/211/212/220
 * Server Actions para o módulo de Cotações.
 *   LHG-212: enviarEmailCotacao — solicita cotação por email via Resend
 *   LHG-220: editarCotacao + Omie Requisição de Compra sync
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { incluirReq, upsertReq, excluirReq, type OmieReqParam } from "@/lib/omie/requisicao";
import { OmieError } from "@/lib/omie/client";
```

- [ ] **Step 2: Criar helper para montar payload da Requisição**

Adicionar o helper logo após os imports (antes de `deletarCotacao`):

```typescript
// ── Helper: monta payload da Requisição Omie a partir dos dados da cotação ──────

interface CotacaoParaReqOmie {
  id:     string;
  prazo:  string | null;
  cotacao_itens: Array<{
    id:         string;
    quantidade: number;
    produtos:   { omie_codigo: string | null } | null;
    cotacao_matriz: Array<{ preco_unitario: number | null }>;
  }>;
  cotacao_fornecedores: Array<{
    fornecedores: { nome_fantasia: string | null; razao_social: string } | null;
  }>;
}

function buildReqOmieParam(cot: CotacaoParaReqOmie): OmieReqParam {
  // Pega nome do primeiro fornecedor como obs
  const fornName = cot.cotacao_fornecedores[0]?.fornecedores?.nome_fantasia
    ?? cot.cotacao_fornecedores[0]?.fornecedores?.razao_social
    ?? "";

  // Formata data de entrega sugerida
  let dtSugestao: string | undefined;
  if (cot.prazo) {
    const d = new Date(cot.prazo.includes("T") ? cot.prazo : `${cot.prazo}T12:00:00`);
    if (!isNaN(d.getTime())) {
      dtSugestao = [
        String(d.getDate()).padStart(2, "0"),
        String(d.getMonth() + 1).padStart(2, "0"),
        d.getFullYear(),
      ].join("/");
    }
  }

  const itens = cot.cotacao_itens.map((item) => {
    // Pega o primeiro preço da matriz (se houver)
    const preco = item.cotacao_matriz[0]?.preco_unitario ?? 0;
    const codProduto = item.produtos?.omie_codigo
      ? { codProd: Number(item.produtos.omie_codigo) }
      : {};
    return {
      codIntItem: item.id,
      ...codProduto,
      qtde:      item.quantidade,
      precoUnit: preco,
    };
  });

  return {
    codIntReqCompra: cot.id,
    dtSugestao,
    obsReqCompra: fornName ? `Fornecedor: ${fornName}` : undefined,
    ItensReqCompra: itens,
  };
}
```

- [ ] **Step 3: Modificar deletarCotacao para chamar ExcluirReq**

Substituir a função `deletarCotacao` existente (linhas 15–54) por:

```typescript
export async function deletarCotacao(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: cot, error: fetchErr } = await supabase
    .from("cotacoes")
    .select("id, status, numero, omie_codigo, cotacao_unidades(unidades(omie_app_key, omie_app_secret))")
    .eq("id", id)
    .single();

  if (fetchErr || !cot) throw new Error("Cotação não encontrada");

  if (cot.status === "aprovado") {
    throw new Error("Não é possível excluir uma cotação já aprovada (pedidos já foram gerados).");
  }

  // Tentar ExcluirReq no Omie antes de deletar (não bloqueia se falhar)
  type UnidRow = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
  const unids = cot.cotacao_unidades as UnidRow[] | null;
  const unid  = unids?.[0]?.unidades;

  if (cot.omie_codigo && unid?.omie_app_key && unid?.omie_app_secret) {
    try {
      await excluirReq(
        { appKey: unid.omie_app_key, appSecret: unid.omie_app_secret },
        cot.id,
      );
    } catch (err) {
      console.warn("[deletarCotacao] ExcluirReq Omie falhou (não bloqueia):", err instanceof Error ? err.message : err);
    }
  }

  // Remove filhos na ordem correta (FK: matriz → itens → fornecedores → unidades → cotação)
  const { data: itens } = await supabase
    .from("cotacao_itens")
    .select("id")
    .eq("cotacao_id", id);

  if (itens?.length) {
    await supabase
      .from("cotacao_matriz")
      .delete()
      .in("cotacao_item_id", itens.map(i => i.id));
  }

  await supabase.from("cotacao_itens").delete().eq("cotacao_id", id);
  await supabase.from("cotacao_fornecedores").delete().eq("cotacao_id", id);
  await supabase.from("cotacao_unidades").delete().eq("cotacao_id", id);

  const { error } = await supabase.from("cotacoes").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/cotacoes");
  return { numero: cot.numero };
}
```

- [ ] **Step 4: Modificar criarCotacao para chamar IncluirReq após criação**

Localizar o `return { id: cot.id, numero: cot.numero };` no final de `criarCotacao` e substituir por:

```typescript
  // ── Sync Omie: IncluirReq (não bloqueia se falhar) ────────────────────────
  // Busca credenciais da unidade (se cotação veio de requisição e tem unidade)
  if (requisicao_id) {
    try {
      const { data: unidRows } = await supabase
        .from("cotacao_unidades")
        .select("unidades(omie_app_key, omie_app_secret)")
        .eq("cotacao_id", cot.id)
        .limit(1);

      type UnidRow = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
      const unid = (unidRows as UnidRow[] | null)?.[0]?.unidades;

      if (unid?.omie_app_key && unid?.omie_app_secret) {
        // Busca itens da cotação recém-criada
        const { data: cotItens } = await supabase
          .from("cotacao_itens")
          .select("id, quantidade, produtos(omie_codigo), cotacao_matriz(preco_unitario)")
          .eq("cotacao_id", cot.id);

        const { data: cotForns } = await supabase
          .from("cotacao_fornecedores")
          .select("fornecedores(nome_fantasia, razao_social)")
          .eq("cotacao_id", cot.id);

        type CotItemRow = { id: string; quantidade: number; produtos: { omie_codigo: string | null } | null; cotacao_matriz: Array<{ preco_unitario: number | null }> };
        type CotFornRow = { fornecedores: { nome_fantasia: string | null; razao_social: string } | null };

        const param = buildReqOmieParam({
          id: cot.id,
          prazo: null,
          cotacao_itens: (cotItens as CotItemRow[] | null) ?? [],
          cotacao_fornecedores: (cotForns as CotFornRow[] | null) ?? [],
        });

        const nCodReq = await incluirReq(
          { appKey: unid.omie_app_key, appSecret: unid.omie_app_secret },
          param,
        );

        if (nCodReq) {
          await supabase
            .from("cotacoes")
            .update({ omie_codigo: String(nCodReq), omie_sincronizado_em: new Date().toISOString() })
            .eq("id", cot.id);
        }
      }
    } catch (err) {
      console.warn("[criarCotacao] IncluirReq Omie falhou (não bloqueia):", err instanceof Error ? err.message : err);
    }
  }

  revalidatePath("/cotacoes");
  return { id: cot.id, numero: cot.numero };
```

**Atenção:** remover o `revalidatePath("/cotacoes"); return { id: cot.id, numero: cot.numero };` original que estava antes desta inserção.

- [ ] **Step 5: Adicionar editarCotacao no final do arquivo (antes de enviarEmailCotacao)**

```typescript
// ── editarCotacao ─────────────────────────────────────────────────────────────

const EditarCotacaoSchema = z.object({
  titulo:  z.string().min(3),
  urgente: z.boolean().optional(),
  prazo:   z.string().nullable().optional(),
});

export async function editarCotacao(
  id: string,
  input: z.infer<typeof EditarCotacaoSchema>,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const parsed = EditarCotacaoSchema.safeParse(input);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  // Busca cotação + creds Omie
  const { data: cot, error: fetchErr } = await supabase
    .from("cotacoes")
    .select(`
      id, status, omie_codigo, prazo,
      cotacao_unidades(unidades(omie_app_key, omie_app_secret)),
      cotacao_itens(
        id, quantidade,
        produtos(omie_codigo),
        cotacao_matriz(preco_unitario)
      ),
      cotacao_fornecedores(fornecedores(nome_fantasia, razao_social))
    `)
    .eq("id", id)
    .single();

  if (fetchErr || !cot) return { erro: "Cotação não encontrada" };
  if (!["rascunho", "cotacao"].includes(cot.status)) {
    return { erro: "Apenas cotações em rascunho ou em cotação podem ser editadas" };
  }

  // Atualiza Supabase
  const { error: updateErr } = await supabase
    .from("cotacoes")
    .update({
      titulo:  parsed.data.titulo.trim(),
      urgente: parsed.data.urgente ?? false,
      prazo:   parsed.data.prazo ?? null,
    })
    .eq("id", id);

  if (updateErr) return { erro: updateErr.message };

  // UpsertReq no Omie (não bloqueia)
  type UnidRow = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
  const unid = (cot.cotacao_unidades as UnidRow[])?.[0]?.unidades;

  if (unid?.omie_app_key && unid?.omie_app_secret) {
    try {
      type CotItemRow = { id: string; quantidade: number; produtos: { omie_codigo: string | null } | null; cotacao_matriz: Array<{ preco_unitario: number | null }> };
      type CotFornRow = { fornecedores: { nome_fantasia: string | null; razao_social: string } | null };

      const param = buildReqOmieParam({
        id: cot.id,
        prazo: parsed.data.prazo ?? cot.prazo ?? null,
        cotacao_itens: (cot.cotacao_itens as CotItemRow[]) ?? [],
        cotacao_fornecedores: (cot.cotacao_fornecedores as CotFornRow[]) ?? [],
      });

      await upsertReq(
        { appKey: unid.omie_app_key, appSecret: unid.omie_app_secret },
        param,
      );

      await supabase
        .from("cotacoes")
        .update({ omie_sincronizado_em: new Date().toISOString() })
        .eq("id", id);
    } catch (err) {
      console.warn("[editarCotacao] UpsertReq Omie falhou (não bloqueia):", err instanceof OmieError ? err.message : err);
    }
  }

  revalidatePath("/cotacoes");
  return { ok: true };
}
```

- [ ] **Step 6: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | Select-String "cotacoes.actions"
```

Esperado: sem erros.

- [ ] **Step 7: Commit**

```bash
git add "app/(app)/cotacoes/actions.ts"
git commit -m "feat: cotacoes/actions — editarCotacao + Omie IncluirReq/UpsertReq/ExcluirReq sync"
```

---

## Task 7: cotacoes-client.tsx — botão editar + modal

**Files:**
- Create: `app/(app)/cotacoes/_components/editar-cotacao-modal.tsx`
- Modify: `app/(app)/cotacoes/_components/cotacoes-client.tsx`

- [ ] **Step 1: Criar editar-cotacao-modal.tsx**

```typescript
"use client";

/**
 * editar-cotacao-modal.tsx
 * Modal de edição básica de cotação (título, urgente, prazo).
 * Após salvar, UpsertReq é chamado automaticamente no server action.
 */
import { useState, useTransition } from "react";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { editarCotacao } from "../actions";

interface CotacaoEditavel {
  id:     string;
  numero: string;
  titulo: string;
  urgente: boolean | null;
  prazo:   string | null;
}

interface EditarCotacaoModalProps {
  open:    boolean;
  cotacao: CotacaoEditavel | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditarCotacaoModal({ open, cotacao, onClose, onSaved }: EditarCotacaoModalProps) {
  const [pending, start] = useTransition();
  const [titulo,  setTitulo]  = useState(cotacao?.titulo ?? "");
  const [urgente, setUrgente] = useState(cotacao?.urgente ?? false);
  const [prazo,   setPrazo]   = useState(cotacao?.prazo?.slice(0, 10) ?? "");

  // Sincroniza quando modal abre com nova cotação
  if (open && cotacao && titulo !== cotacao.titulo && !pending) {
    setTitulo(cotacao.titulo);
    setUrgente(cotacao.urgente ?? false);
    setPrazo(cotacao.prazo?.slice(0, 10) ?? "");
  }

  function handleSubmit() {
    if (!cotacao) return;
    if (!titulo.trim() || titulo.trim().length < 3) {
      toast.error("Título deve ter ao menos 3 caracteres");
      return;
    }
    start(async () => {
      const res = await editarCotacao(cotacao.id, {
        titulo: titulo.trim(),
        urgente,
        prazo:  prazo || null,
      });
      if ("erro" in res) {
        toast.error(res.erro);
      } else {
        toast.success(`Cotação ${cotacao.numero} atualizada`);
        onSaved();
        onClose();
      }
    });
  }

  if (!open || !cotacao) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[18vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-xl border border-border bg-background shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div>
            <h2 className="text-base font-semibold text-foreground">Editar cotação</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">{cotacao.numero}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {/* Título */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
              Título *
            </label>
            <input
              autoFocus
              type="text"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-colors"
            />
          </div>

          {/* Prazo */}
          <div>
            <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
              Prazo <span className="normal-case text-muted-foreground/70">(opcional)</span>
            </label>
            <input
              type="date"
              value={prazo}
              onChange={(e) => setPrazo(e.target.value)}
              className="w-full rounded-lg border border-border bg-muted/60 px-4 py-2.5 text-sm text-foreground focus:outline-none transition-colors"
            />
          </div>

          {/* Urgente */}
          <label className="flex items-center gap-3 cursor-pointer">
            <div
              onClick={() => setUrgente(u => !u)}
              className={cn(
                "w-9 h-5 rounded-full border transition-colors relative",
                urgente ? "bg-red-500/30 border-red-500/50" : "bg-muted border-border",
              )}
            >
              <div className={cn(
                "absolute top-0.5 w-4 h-4 rounded-full transition-all",
                urgente ? "left-[18px] bg-red-400" : "left-0.5 bg-muted-foreground",
              )} />
            </div>
            <span className={cn("text-sm font-medium", urgente ? "text-red-300" : "text-muted-foreground")}>
              Urgente
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2",
              "border-emerald-700/60 bg-emerald-500/10 text-sm font-medium text-emerald-400",
              "hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {pending ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Modificar cotacoes-client.tsx — adicionar omie_codigo ao tipo Cotacao**

No arquivo `cotacoes-client.tsx`, localizar a interface `Cotacao` e adicionar `omie_codigo`:

```typescript
interface Cotacao {
  id:             string;
  numero:         string;
  titulo:         string;
  status:         CotStatus;
  urgente:        boolean | null;
  omie_codigo:    string | null;   // ← ADICIONAR
  valor_estimado: number | null;
  // ... resto igual
```

- [ ] **Step 3: Adicionar import do modal e estado de edição em cotacoes-client.tsx**

Localizar os imports no topo do arquivo e adicionar:

```typescript
import { EditarCotacaoModal } from "./editar-cotacao-modal";
```

Adicionar `Pencil` ao import do lucide-react existente.

- [ ] **Step 4: Adicionar estado do modal de edição em CotacoesClient**

Dentro de `CotacoesClient`, após as declarações de estado existentes:

```typescript
const [editCot, setEditCot] = useState<Cotacao | null>(null);
```

- [ ] **Step 5: Adicionar botão de editar na coluna de ações de cada linha**

Localizar o bloco da coluna "Ações" (comentário `{/* Ações */}`) e substituir por:

```tsx
{/* Ações */}
<div className="self-center flex justify-end gap-1">
  {c.status !== "aprovado" && (
    <>
      <button
        onClick={(e) => { e.stopPropagation(); setEditCot(c); }}
        title="Editar cotação"
        className="p-1 rounded text-muted-foreground/30 hover:text-sky-400 hover:bg-sky-500/10 opacity-0 group-hover:opacity-100 transition-all"
      >
        <Pencil size={13} />
      </button>
      <button
        onClick={(e) => handleDelete(e, c)}
        disabled={deletingId === c.id}
        title="Excluir cotação"
        className="p-1 rounded text-muted-foreground/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all disabled:cursor-not-allowed"
      >
        {deletingId === c.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
      </button>
    </>
  )}
  {c.status === "aprovado" && (
    <ChevronRight size={14} className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors" />
  )}
</div>
```

**Atenção:** Atualizar o grid da tabela para acomodar os dois botões — mudar a última coluna de `32px` para `64px` no `grid-cols`:
- Linha do header: `grid-cols-[100px_1fr_100px_60px_60px_110px_110px_120px_80px_64px]`
- Linha dos itens: mesma string

- [ ] **Step 6: Adicionar o modal de edição antes do fechamento do JSX**

Após o `<ConfirmModal .../>` e antes do `</div>` que fecha o componente:

```tsx
{/* ── Modal editar cotação ─────────────────────────────────────────────────── */}
<EditarCotacaoModal
  open={!!editCot}
  cotacao={editCot}
  onClose={() => setEditCot(null)}
  onSaved={() => router.refresh()}
/>
```

- [ ] **Step 7: Verificar build**

```bash
npx tsc --noEmit 2>&1 | Select-String "cotacoes-client|editar-cotacao"
```

Esperado: sem erros.

- [ ] **Step 8: Commit**

```bash
git add "app/(app)/cotacoes/_components/"
git commit -m "feat: cotacoes UI — botão editar + EditarCotacaoModal com sync Omie"
```

---

## Task 8: pedidos/actions.ts — fix pushPedidoOmie + editarPedido + excluirPedidoOmie

**Files:**
- Modify: `app/(app)/pedidos/actions.ts`

- [ ] **Step 1: Atualizar imports no topo do arquivo**

Substituir a linha de import do omie:

```typescript
import { criarPedidoCompra, OmieError } from "@/lib/omie/client";
```

por:

```typescript
import { OmieError } from "@/lib/omie/client";
import { incluirPedCompra, alterarPedCompra, excluirPedCompra } from "@/lib/omie/pedidos";
```

- [ ] **Step 2: Substituir pushPedidoOmie por versão com endpoint correto**

Localizar a função `pushPedidoOmie` (linhas ~147–277) e substituir completamente por:

```typescript
// ── pushPedidoOmie (LHG-214) — FIXED: /produtos/pedidocompra/ ─────────────────

export async function pushPedidoOmie(
  pedidoId: string,
): Promise<{ omie_codigo?: string; erro?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pedido, error: pedErr } = await supabase
    .from("pedidos")
    .select(`
      id, numero, valor_total, condicao_pgto, entrega_prev,
      fornecedores ( omie_codigo, razao_social, nome_fantasia ),
      pedido_itens (
        id, quantidade, preco_unitario,
        produtos ( omie_codigo, nome, unidade_med )
      ),
      pedido_unidades (
        unidades ( omie_app_key, omie_app_secret )
      )
    `)
    .eq("id", pedidoId)
    .single();

  if (pedErr || !pedido) {
    return { erro: pedErr?.message ?? "Pedido não encontrado" };
  }

  type PedidoUnidade = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
  const pus     = pedido.pedido_unidades as PedidoUnidade[] | null;
  const unidade = pus?.[0]?.unidades;

  if (!unidade?.omie_app_key || !unidade?.omie_app_secret) {
    const msg = "Unidade sem credenciais Omie configuradas.";
    await supabase.from("pedidos").update({ omie_status: "erro", omie_erro: msg }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { erro: msg };
  }

  const creds = { appKey: unidade.omie_app_key, appSecret: unidade.omie_app_secret };

  const forn = pedido.fornecedores as { omie_codigo: string | null; razao_social: string; nome_fantasia: string | null } | null;
  if (!forn?.omie_codigo) {
    const msg = "Fornecedor sem código Omie. Sincronize os fornecedores primeiro.";
    await supabase.from("pedidos").update({ omie_status: "erro", omie_erro: msg }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { erro: msg };
  }

  type PedidoItemRaw = {
    id: string;
    quantidade: number;
    preco_unitario: number;
    produtos: { omie_codigo: string | null; nome: string; unidade_med: string } | null;
  };
  const itens = pedido.pedido_itens as PedidoItemRaw[] | null;

  const produtosIncluir = (itens ?? [])
    .filter((item) => item.produtos?.omie_codigo)
    .map((item, i) => ({
      cCodIntItem: `${pedidoId.slice(0, 8)}-${i + 1}`,
      nCodProd:    Number(item.produtos!.omie_codigo!),
      nQtde:       item.quantidade,
      nValUnit:    item.preco_unitario,
    }));

  if (produtosIncluir.length === 0) {
    const msg = "Nenhum item com código Omie. Sincronize os produtos primeiro.";
    await supabase.from("pedidos").update({ omie_status: "erro", omie_erro: msg }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { erro: msg };
  }

  const dataPrevisao = pedido.entrega_prev
    ? new Date(pedido.entrega_prev).toLocaleDateString("pt-BR")
    : new Date(Date.now() + 7 * 86_400_000).toLocaleDateString("pt-BR");

  try {
    const nCodPed = await incluirPedCompra(creds, {
      cabecalho_incluir: {
        cCodIntPed:  pedidoId,
        nCodFor:     Number(forn.omie_codigo),
        dDtPrevisao: dataPrevisao,
        cObs:        `Pedido gerado pelo sistema LHG Suprimentos — ${pedido.numero}`,
      },
      produtos_incluir: produtosIncluir,
    });

    const omieRef = String(nCodPed);

    await supabase
      .from("pedidos")
      .update({ omie_status: "sincronizado", omie_codigo: omieRef, omie_erro: null })
      .eq("id", pedidoId);

    await supabase.from("pedido_eventos").insert({
      pedido_id: pedidoId,
      tipo:      "omie",
      texto:     `Pedido enviado ao Omie (/produtos/pedidocompra/) — nCodPed: ${omieRef}`,
      autor_id:  user.id,
    });

    revalidatePath("/pedidos");
    return { omie_codigo: omieRef };
  } catch (err) {
    const msg = err instanceof OmieError
      ? `Omie: ${err.message}`
      : err instanceof Error ? err.message : "Erro desconhecido ao enviar ao Omie";

    await supabase.from("pedidos").update({ omie_status: "erro", omie_erro: msg }).eq("id", pedidoId);
    revalidatePath("/pedidos");
    return { erro: msg };
  }
}
```

- [ ] **Step 3: Adicionar editarPedido e excluirPedidoOmie ao final do arquivo**

```typescript
// ── editarPedido ───────────────────────────────────────────────────────────────

export async function editarPedido(
  pedidoId: string,
  dados: { entrega_prev?: string | null; condicao_pgto?: string | null },
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pedido, error: fetchErr } = await supabase
    .from("pedidos")
    .select(`
      id, omie_codigo, omie_status, status,
      fornecedores(omie_codigo),
      pedido_itens(id, quantidade, preco_unitario, produtos(omie_codigo)),
      pedido_unidades(unidades(omie_app_key, omie_app_secret))
    `)
    .eq("id", pedidoId)
    .single();

  if (fetchErr || !pedido) return { erro: "Pedido não encontrado" };
  if (["recebido", "finalizado"].includes(pedido.status)) {
    return { erro: "Pedidos recebidos ou finalizados não podem ser editados" };
  }

  // Atualiza localmente
  await supabase
    .from("pedidos")
    .update({
      entrega_prev:  dados.entrega_prev ?? null,
      condicao_pgto: dados.condicao_pgto ?? null,
    })
    .eq("id", pedidoId);

  // Sync Omie (se sincronizado)
  if (pedido.omie_status === "sincronizado" && pedido.omie_codigo) {
    type PedUnid = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
    const unid = (pedido.pedido_unidades as PedUnid[])?.[0]?.unidades;

    if (unid?.omie_app_key && unid?.omie_app_secret) {
      try {
        type ItemRaw = { id: string; quantidade: number; preco_unitario: number; produtos: { omie_codigo: string | null } | null };
        const produtosAlterar = (pedido.pedido_itens as ItemRaw[])
          .filter(i => i.produtos?.omie_codigo)
          .map((i, idx) => ({
            cCodIntItem: `${pedidoId.slice(0, 8)}-${idx + 1}`,
            nCodProd:    Number(i.produtos!.omie_codigo!),
            nQtde:       i.quantidade,
            nValUnit:    i.preco_unitario,
          }));

        const dataPrevisao = dados.entrega_prev
          ? new Date(dados.entrega_prev).toLocaleDateString("pt-BR")
          : undefined;

        await alterarPedCompra(
          { appKey: unid.omie_app_key, appSecret: unid.omie_app_secret },
          {
            cabecalho_alterar: {
              nCodPed:      Number(pedido.omie_codigo),
              dDtPrevisao:  dataPrevisao,
            },
            produtos_alterar: produtosAlterar,
          },
        );

        await supabase
          .from("pedidos")
          .update({ omie_status: "sincronizado" })
          .eq("id", pedidoId);
      } catch (err) {
        console.warn("[editarPedido] AlteraPedCompra falhou:", err instanceof Error ? err.message : err);
        await supabase
          .from("pedidos")
          .update({ omie_status: "pendente_sync", omie_erro: err instanceof Error ? err.message : "Erro Omie" })
          .eq("id", pedidoId);
      }
    }
  }

  revalidatePath("/pedidos");
  return { ok: true };
}

// ── excluirPedidoOmie ──────────────────────────────────────────────────────────

export async function excluirPedidoOmie(
  pedidoId: string,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: pedido, error: fetchErr } = await supabase
    .from("pedidos")
    .select(`
      id, omie_codigo, omie_status, status,
      pedido_unidades(unidades(omie_app_key, omie_app_secret))
    `)
    .eq("id", pedidoId)
    .single();

  if (fetchErr || !pedido) return { erro: "Pedido não encontrado" };
  if (!["enviado", "cancelado"].includes(pedido.status)) {
    return { erro: "Apenas pedidos enviados ou cancelados podem ser excluídos no Omie" };
  }
  if (pedido.omie_status !== "sincronizado" || !pedido.omie_codigo) {
    return { erro: "Pedido não está sincronizado com o Omie" };
  }

  type PedUnid = { unidades: { omie_app_key: string | null; omie_app_secret: string | null } | null };
  const unid = (pedido.pedido_unidades as PedUnid[])?.[0]?.unidades;
  if (!unid?.omie_app_key || !unid?.omie_app_secret) {
    return { erro: "Credenciais Omie não encontradas" };
  }

  try {
    await excluirPedCompra(
      { appKey: unid.omie_app_key, appSecret: unid.omie_app_secret },
      Number(pedido.omie_codigo),
    );
  } catch (err) {
    return { erro: err instanceof OmieError ? err.message : "Erro ao excluir no Omie" };
  }

  await supabase
    .from("pedidos")
    .update({ omie_status: "excluido", omie_erro: null })
    .eq("id", pedidoId);

  revalidatePath("/pedidos");
  return { ok: true };
}
```

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | Select-String "pedidos.actions"
```

Esperado: sem erros.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/pedidos/actions.ts"
git commit -m "feat: pedidos/actions — fix pushPedidoOmie (endpoint correto) + editarPedido + excluirPedidoOmie"
```

---

## Task 9: notas-fiscais — auto-associar pedido + concluirRecebimentoOmie + UI

**Files:**
- Modify: `app/(app)/notas-fiscais/actions.ts`
- Modify: `app/(app)/notas-fiscais/_components/nf-client.tsx`

- [ ] **Step 1: Adicionar import de recebimento em notas-fiscais/actions.ts**

No topo do arquivo, adicionar após os imports existentes:

```typescript
import { listarRecebimentos, associarPedidoRecebimento, concluirRecebimento } from "@/lib/omie/recebimento";
```

- [ ] **Step 2: Estender lancarNFOmie — auto-associar recebimento ao pedido**

Localizar o bloco após `omieNodNota` ser definido (linhas ~269–285):

```typescript
  await supabase
    .from("notas_fiscais")
    .update({ lancada_no_omie: true, lancada_em: new Date().toISOString(), status: "lancada" })
    .eq("id", nfId);

  revalidatePath("/notas-fiscais");
  return { ok: true, omieNodNota };
```

Substituir por:

```typescript
  // Marca NF como lançada
  await supabase
    .from("notas_fiscais")
    .update({ lancada_no_omie: true, lancada_em: new Date().toISOString(), status: "lancada" })
    .eq("id", nfId);

  // ── Auto-associar Pedido ao Recebimento (se NF tem pedido com omie_codigo) ──
  type PedidoReceb = { id: string; fornecedores: unknown; pedido_unidades: unknown } | null;
  const pedidoReceb = nf.pedidos as PedidoReceb;

  if (pedidoReceb) {
    // Buscar omie_codigo do pedido
    const { data: pedData } = await supabase
      .from("pedidos")
      .select("omie_codigo")
      .eq("id", (pedidoReceb as { id: string }).id)
      .single();

    if (pedData?.omie_codigo) {
      try {
        const recebimentos = await listarRecebimentos(creds, omieNodNota);
        const receb = recebimentos[0];

        if (receb?.nIdReceb) {
          await associarPedidoRecebimento(creds, receb.nIdReceb, Number(pedData.omie_codigo));

          await supabase
            .from("notas_fiscais")
            .update({ omie_receb_id: receb.nIdReceb })
            .eq("id", nfId);
        }
      } catch (err) {
        // Não bloqueia — botão "Vincular" aparecerá na UI para associação manual
        console.warn("[lancarNFOmie] Associação automática de recebimento falhou:", err instanceof Error ? err.message : err);
      }
    }
  }

  revalidatePath("/notas-fiscais");
  return { ok: true, omieNodNota };
```

- [ ] **Step 3: Adicionar concluirRecebimentoOmie ao final do arquivo**

```typescript
// ── concluirRecebimentoOmie ────────────────────────────────────────────────────

export async function concluirRecebimentoOmie(
  nfId: string,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: nf, error: nfErr } = await supabase
    .from("notas_fiscais")
    .select(`
      id, omie_receb_id, omie_concluido, lancada_no_omie,
      pedidos(id),
      unidades!notas_fiscais_unidade_id_fkey(omie_app_key, omie_app_secret),
      pedidos(pedido_unidades(unidades(omie_app_key, omie_app_secret)))
    `)
    .eq("id", nfId)
    .single();

  if (nfErr || !nf) return { erro: "NF não encontrada" };
  if (!nf.lancada_no_omie) return { erro: "NF ainda não foi lançada no Omie" };
  if (nf.omie_concluido)  return { erro: "Recebimento já foi concluído" };
  if (!nf.omie_receb_id)  return { erro: "NF sem ID de recebimento Omie — vincule ao pedido primeiro" };

  // Resolver creds
  type UnitCreds = { omie_app_key: string | null; omie_app_secret: string | null } | null;
  const unidDireta = nf.unidades as UnitCreds;
  type PedType = { pedido_unidades: Array<{ unidades: UnitCreds }> } | null;
  const pedType = nf.pedidos as PedType;
  const unidPed = pedType?.pedido_unidades?.[0]?.unidades ?? null;
  const unid    = (unidDireta?.omie_app_key ? unidDireta : unidPed) as UnitCreds;

  if (!unid?.omie_app_key || !unid?.omie_app_secret) {
    return { erro: "Credenciais Omie não encontradas para esta NF" };
  }

  const creds = { appKey: String(unid.omie_app_key), appSecret: String(unid.omie_app_secret) };

  try {
    await concluirRecebimento(creds, nf.omie_receb_id);
  } catch (err) {
    return { erro: err instanceof OmieError ? `Omie: ${err.message}` : "Erro ao concluir recebimento" };
  }

  // Marca NF como concluída + pedido como finalizado
  await supabase
    .from("notas_fiscais")
    .update({ omie_concluido: true, status: "lancada" })
    .eq("id", nfId);

  type PedSimple = { id: string } | null;
  const pedSimple = nf.pedidos as PedSimple;
  if (pedSimple?.id) {
    await supabase
      .from("pedidos")
      .update({ status: "finalizado" })
      .eq("id", pedSimple.id);
    revalidatePath("/pedidos");
  }

  revalidatePath("/notas-fiscais");
  return { ok: true };
}
```

Adicionar também no topo do arquivo o import de `OmieError`:

```typescript
import {
  incluirNotaEntrada,
  OmieError,
  type OmieCredentials,
  type OmieNotaEntradaDet,
} from "@/lib/omie/client";
```

O `OmieError` já está importado — apenas confirme que está presente.

- [ ] **Step 4: Adicionar botão "Concluir no Omie" em nf-client.tsx**

Abrir `app/(app)/notas-fiscais/_components/nf-client.tsx` e localizar onde estão os botões de ação por NF.

Adicionar import:

```typescript
import { concluirRecebimentoOmie } from "../actions";
```

Adicionar estado + handler no componente:

```typescript
const [concluindoId, setConcluindoId] = useState<string | null>(null);
const [, startConcluir] = useTransition();

function handleConcluirOmie(nfId: string) {
  setConcluindoId(nfId);
  startConcluir(async () => {
    try {
      const res = await concluirRecebimentoOmie(nfId);
      if ("erro" in res) {
        toast.error(res.erro);
      } else {
        toast.success("Recebimento concluído no Omie!");
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao concluir");
    } finally {
      setConcluindoId(null);
    }
  });
}
```

Adicionar o botão na linha de cada NF, visível quando:
`nf.lancada_no_omie === true && nf.omie_receb_id !== null && nf.omie_concluido === false`

```tsx
{nf.lancada_no_omie && nf.omie_receb_id && !nf.omie_concluido && (
  <button
    onClick={() => handleConcluirOmie(nf.id)}
    disabled={concluindoId === nf.id}
    className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700/60 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
  >
    {concluindoId === nf.id ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
    Concluir no Omie
  </button>
)}
```

Adicionar `CheckCircle` ao import do lucide-react se não existir. A interface da NF na listagem deve incluir `omie_receb_id` e `omie_concluido`.

- [ ] **Step 5: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | Select-String "notas-fiscais"
```

- [ ] **Step 6: Commit**

```bash
git add "app/(app)/notas-fiscais/"
git commit -m "feat: notas-fiscais — auto-associar recebimento + concluirRecebimentoOmie + botão UI"
```

---

## Task 10: fornecedores — criarFornecedor + UI modal

**Files:**
- Modify: `app/(app)/fornecedores/actions.ts`
- Create: `app/(app)/fornecedores/_components/criar-fornecedor-modal.tsx`
- Modify: `app/(app)/fornecedores/_components/fornecedores-client.tsx`

- [ ] **Step 1: Adicionar criarFornecedor em fornecedores/actions.ts**

Adicionar ao final do arquivo:

```typescript
import { incluirCliente } from "@/lib/omie/client";

// ── criarFornecedor ────────────────────────────────────────────────────────────

export interface CriarFornecedorInput {
  razao_social:  string;
  cnpj_cpf:      string;
  nome_fantasia: string;
  email?:        string;
  telefone?:     string;
  contato?:      string;
  endereco?:     string;
  cep?:          string;
  cidade?:       string;
  uf?:           string;
  unidade_id:    string;   // qual unidade Omie usar para criar
}

export async function criarFornecedor(
  dados: CriarFornecedorInput,
): Promise<{ ok: true; id: string } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Validações
  if (!dados.razao_social?.trim())  return { erro: "Razão social é obrigatória" };
  if (!dados.cnpj_cpf?.trim())      return { erro: "CNPJ/CPF é obrigatório" };
  if (!dados.nome_fantasia?.trim()) return { erro: "Nome fantasia é obrigatório" };

  const cnpjLimpo = dados.cnpj_cpf.replace(/\D/g, "");
  if (cnpjLimpo.length !== 14 && cnpjLimpo.length !== 11) {
    return { erro: "CNPJ deve ter 14 dígitos ou CPF 11 dígitos" };
  }

  // Verificar duplicidade de CNPJ
  const { data: existente } = await supabase
    .from("fornecedores")
    .select("id")
    .eq("cnpj_cpf", cnpjLimpo)
    .maybeSingle();

  if (existente) return { erro: "Já existe um fornecedor com este CNPJ/CPF" };

  // Buscar credenciais Omie da unidade
  const { data: unidade, error: unidErr } = await supabase
    .from("unidades")
    .select("id, omie_app_key, omie_app_secret")
    .eq("id", dados.unidade_id)
    .single();

  if (unidErr || !unidade) return { erro: "Unidade não encontrada" };
  if (!unidade.omie_app_key || !unidade.omie_app_secret) {
    return { erro: "Unidade sem credenciais Omie configuradas" };
  }

  const creds = { appKey: unidade.omie_app_key, appSecret: unidade.omie_app_secret };

  // IncluirCliente no Omie PRIMEIRO (atômico — falha bloqueia criação local)
  let omieCodigoCli: number;
  try {
    omieCodigoCli = await incluirCliente(creds, {
      razao_social:  dados.razao_social.trim(),
      cnpj_cpf:      cnpjLimpo,
      nome_fantasia: dados.nome_fantasia.trim(),
      email:         dados.email?.trim(),
      telefone:      dados.telefone?.trim(),
      contato:       dados.contato?.trim(),
      endereco:      dados.endereco?.trim(),
      cep:           dados.cep?.replace(/\D/g, ""),
      cidade:        dados.cidade?.trim(),
      uf:            dados.uf?.trim(),
      codigo_integracao: `LHG-FORN-${Date.now()}`,
    });
  } catch (err) {
    return { erro: `Erro ao criar no Omie: ${err instanceof Error ? err.message : "Erro desconhecido"}` };
  }

  // Inserir no Supabase com omie_codigo já preenchido
  const { data: novoForn, error: insertErr } = await supabase
    .from("fornecedores")
    .insert({
      razao_social:         dados.razao_social.trim(),
      cnpj_cpf:             cnpjLimpo,
      nome_fantasia:        dados.nome_fantasia.trim(),
      email:                dados.email?.trim() || null,
      telefone:             dados.telefone?.trim() || null,
      contato:              dados.contato?.trim() || null,
      endereco:             dados.endereco?.trim() || null,
      cep:                  dados.cep?.replace(/\D/g, "") || null,
      cidade:               dados.cidade?.trim() || null,
      uf:                   dados.uf?.trim() || null,
      omie_codigo:          String(omieCodigoCli),
      omie_sincronizado_em: new Date().toISOString(),
      omie_unidade_id:      dados.unidade_id,
    })
    .select("id")
    .single();

  if (insertErr || !novoForn) {
    // Omie foi criado mas Supabase falhou — log para auditoria
    console.error(`[criarFornecedor] Supabase insert falhou após Omie sucesso (omie_codigo=${omieCodigoCli}):`, insertErr?.message);
    return { erro: insertErr?.message ?? "Erro ao salvar no banco de dados" };
  }

  revalidatePath("/fornecedores");
  return { ok: true, id: novoForn.id };
}
```

**Nota:** Mover o `import { incluirCliente }` para o topo do arquivo junto com os outros imports.

- [ ] **Step 2: Criar criar-fornecedor-modal.tsx**

```typescript
"use client";

/**
 * criar-fornecedor-modal.tsx
 * Modal para criação de fornecedor — cria no Omie PRIMEIRO, depois no Supabase.
 * Requer seleção de unidade para determinar qual credencial Omie usar.
 */
import { useState, useTransition } from "react";
import { Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { criarFornecedor } from "../actions";

interface Unidade { id: string; nome: string }

interface CriarFornecedorModalProps {
  open:      boolean;
  onClose:   () => void;
  onCreated: () => void;
  unidades:  Unidade[];
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
        {label} {required && <span className="text-red-400 normal-case">*</span>}
      </label>
      {children}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-muted/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-colors";

export function CriarFornecedorModal({ open, onClose, onCreated, unidades }: CriarFornecedorModalProps) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    razao_social: "", cnpj_cpf: "", nome_fantasia: "",
    email: "", telefone: "", contato: "",
    endereco: "", cep: "", cidade: "", uf: "",
    unidade_id: unidades[0]?.id ?? "",
  });

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleSubmit() {
    start(async () => {
      const res = await criarFornecedor({
        ...form,
        unidade_id: form.unidade_id,
      });
      if ("erro" in res) {
        toast.error(res.erro);
      } else {
        toast.success("Fornecedor criado e sincronizado com o Omie!");
        onCreated();
        onClose();
        setForm({
          razao_social: "", cnpj_cpf: "", nome_fantasia: "",
          email: "", telefone: "", contato: "",
          endereco: "", cep: "", cidade: "", uf: "",
          unidade_id: unidades[0]?.id ?? "",
        });
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[5vh] px-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl overflow-hidden mb-8">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <h2 className="text-base font-semibold text-foreground">Novo Fornecedor</h2>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          {/* Unidade Omie */}
          <Field label="Unidade Omie" required>
            <select
              value={form.unidade_id}
              onChange={e => set("unidade_id", e.target.value)}
              className={cn(inputCls, "appearance-none cursor-pointer")}
            >
              {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Razão Social" required>
                <input type="text" value={form.razao_social} onChange={e => set("razao_social", e.target.value)} className={inputCls} placeholder="Ex: NSA Distribuidora Ltda" />
              </Field>
            </div>
            <Field label="Nome Fantasia" required>
              <input type="text" value={form.nome_fantasia} onChange={e => set("nome_fantasia", e.target.value)} className={inputCls} placeholder="Ex: NSA" />
            </Field>
            <Field label="CNPJ/CPF" required>
              <input type="text" value={form.cnpj_cpf} onChange={e => set("cnpj_cpf", e.target.value)} className={inputCls} placeholder="00.000.000/0000-00" />
            </Field>
            <Field label="E-mail">
              <input type="email" value={form.email} onChange={e => set("email", e.target.value)} className={inputCls} />
            </Field>
            <Field label="Telefone">
              <input type="text" value={form.telefone} onChange={e => set("telefone", e.target.value)} className={inputCls} placeholder="(11) 9 0000-0000" />
            </Field>
            <div className="col-span-2">
              <Field label="Contato">
                <input type="text" value={form.contato} onChange={e => set("contato", e.target.value)} className={inputCls} placeholder="Nome do contato" />
              </Field>
            </div>
            <div className="col-span-2">
              <Field label="Endereço">
                <input type="text" value={form.endereco} onChange={e => set("endereco", e.target.value)} className={inputCls} />
              </Field>
            </div>
            <Field label="CEP">
              <input type="text" value={form.cep} onChange={e => set("cep", e.target.value)} className={inputCls} placeholder="00000-000" />
            </Field>
            <Field label="UF">
              <input type="text" value={form.uf} onChange={e => set("uf", e.target.value)} className={inputCls} maxLength={2} placeholder="SP" />
            </Field>
            <div className="col-span-2">
              <Field label="Cidade">
                <input type="text" value={form.cidade} onChange={e => set("cidade", e.target.value)} className={inputCls} />
              </Field>
            </div>
          </div>

          <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2">
            <p className="text-[11px] text-amber-400/80">
              O fornecedor será criado primeiro no Omie e depois salvo no sistema. Se o Omie falhar, nenhum dado será salvo.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2",
              "border-emerald-700/60 bg-emerald-500/10 text-sm font-medium text-emerald-400",
              "hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            {pending ? "Criando no Omie…" : "Criar Fornecedor"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Adicionar botão "+ Novo Fornecedor" em fornecedores-client.tsx**

Abrir `app/(app)/fornecedores/_components/fornecedores-client.tsx`.

Adicionar import:

```typescript
import { CriarFornecedorModal } from "./criar-fornecedor-modal";
```

Adicionar prop `unidades` ao componente e estado:

```typescript
const [criarOpen, setCriarOpen] = useState(false);
```

Adicionar botão no header do componente (ao lado de botões existentes):

```tsx
<button
  onClick={() => setCriarOpen(true)}
  className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-3.5 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
>
  <Plus size={14} />
  Novo Fornecedor
</button>
```

Adicionar o modal no final do JSX:

```tsx
<CriarFornecedorModal
  open={criarOpen}
  onClose={() => setCriarOpen(false)}
  onCreated={() => router.refresh()}
  unidades={unidades}
/>
```

A prop `unidades` deve ser passada da page.tsx para o componente client. Verificar `app/(app)/fornecedores/page.tsx` — adicionar query de unidades com credenciais Omie:

```typescript
// Em page.tsx, adicionar query:
const { data: unidades } = await supabase
  .from("unidades")
  .select("id, nome")
  .not("omie_app_key", "is", null)
  .order("nome");
```

Passar `unidades={unidades ?? []}` ao componente cliente.

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | Select-String "fornecedores"
```

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/fornecedores/"
git commit -m "feat: fornecedores — criarFornecedor + IncluirCliente Omie + UI modal"
```

---

## Task 11: produtos — criarProduto + UI modal

**Files:**
- Modify: `app/(app)/produtos/actions.ts`
- Create: `app/(app)/produtos/_components/criar-produto-modal.tsx`
- Modify: `app/(app)/produtos/_components/produtos-client.tsx`

- [ ] **Step 1: Adicionar criarProduto em produtos/actions.ts**

No topo do arquivo, adicionar:

```typescript
import { alterarProduto, incluirProduto } from "@/lib/omie/client";
```

(O `alterarProduto` já deve estar importado — confirmar e ajustar.)

Adicionar ao final do arquivo:

```typescript
// ── criarProduto ───────────────────────────────────────────────────────────────

export interface CriarProdutoInput {
  nome:          string;
  descricao?:    string;
  unidade:       string;      // "UN", "KG", "LT", etc.
  ncm:           string;      // obrigatório — 8 dígitos
  valor_unitario: number;
  familia_omie:  string;
  codigo?:       string;      // código interno opcional
  unidade_id:    string;      // qual unidade Omie usar
}

export async function criarProduto(
  dados: CriarProdutoInput,
): Promise<{ ok: true; id: string } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Validações
  if (!dados.nome?.trim())         return { erro: "Nome é obrigatório" };
  if (!dados.unidade?.trim())      return { erro: "Unidade de medida é obrigatória" };
  if (!dados.ncm?.trim())          return { erro: "NCM é obrigatório (exigido pelo Omie)" };
  if (dados.valor_unitario <= 0)   return { erro: "Valor unitário deve ser maior que zero" };
  if (!dados.familia_omie?.trim()) return { erro: "Família é obrigatória" };

  const ncmLimpo = dados.ncm.replace(/\D/g, "");
  if (ncmLimpo.length !== 8) return { erro: "NCM deve ter exatamente 8 dígitos (ex: 84331110)" };

  // Buscar credenciais Omie da unidade
  const { data: unidade, error: unidErr } = await supabase
    .from("unidades")
    .select("id, omie_app_key, omie_app_secret")
    .eq("id", dados.unidade_id)
    .single();

  if (unidErr || !unidade) return { erro: "Unidade não encontrada" };
  if (!unidade.omie_app_key || !unidade.omie_app_secret) {
    return { erro: "Unidade sem credenciais Omie" };
  }

  const creds = { appKey: unidade.omie_app_key, appSecret: unidade.omie_app_secret };
  const newId = crypto.randomUUID();
  const codigoIntegracao = `LHG-${newId.slice(0, 8)}`;

  // IncluirProduto no Omie PRIMEIRO (atômico)
  let omieCodigoProd: number;
  try {
    omieCodigoProd = await incluirProduto(creds, {
      nome:             dados.nome.trim(),
      unidade:          dados.unidade.trim().toUpperCase(),
      ncm:              ncmLimpo,
      valor_unitario:   dados.valor_unitario,
      familia_omie:     dados.familia_omie.trim(),
      codigo_interno:   dados.codigo?.trim(),
      codigo_integracao: codigoIntegracao,
    });
  } catch (err) {
    return { erro: `Erro ao criar no Omie: ${err instanceof Error ? err.message : "Erro desconhecido"}` };
  }

  // Calcular categoria local
  const { FAMILIA_TO_CATEGORIA } = await import("@/lib/omie/familia-map");
  const categoria = FAMILIA_TO_CATEGORIA[dados.familia_omie.toUpperCase()] ?? "Outros";

  // Inserir no Supabase
  const { data: novoProd, error: insertErr } = await supabase
    .from("produtos")
    .insert({
      id:                    newId,
      nome:                  dados.nome.trim(),
      descricao:             dados.descricao?.trim() || null,
      unidade_med:           dados.unidade.trim().toUpperCase(),
      ncm:                   ncmLimpo,
      preco_custo:           dados.valor_unitario,
      familia_omie:          dados.familia_omie.trim(),
      categoria,
      codigo:                dados.codigo?.trim() || null,
      omie_codigo:           String(omieCodigoProd),
      omie_sincronizado_em:  new Date().toISOString(),
      omie_unidade_id:       dados.unidade_id,
      codigo_produto_integracao: codigoIntegracao,
    })
    .select("id")
    .single();

  if (insertErr || !novoProd) {
    console.error(`[criarProduto] Supabase insert falhou após Omie (omie_codigo=${omieCodigoProd}):`, insertErr?.message);
    return { erro: insertErr?.message ?? "Erro ao salvar no banco de dados" };
  }

  revalidatePath("/produtos");
  return { ok: true, id: novoProd.id };
}
```

- [ ] **Step 2: Criar criar-produto-modal.tsx**

```typescript
"use client";

/**
 * criar-produto-modal.tsx
 * Modal para criação de produto — cria no Omie PRIMEIRO (NCM obrigatório).
 */
import { useState, useTransition } from "react";
import { Loader2, Package, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { criarProduto } from "../actions";

interface Unidade { id: string; nome: string }

interface CriarProdutoModalProps {
  open:      boolean;
  onClose:   () => void;
  onCreated: () => void;
  unidades:  Unidade[];
}

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-1.5 font-medium">
        {label} {required && <span className="text-red-400 normal-case">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[10px] text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

const inputCls = "w-full rounded-lg border border-border bg-muted/60 px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none transition-colors";

const UNIDADES_MED = ["UN", "KG", "LT", "CX", "PC", "MT", "M2", "GL", "DZ"];
const FAMILIAS_OMIE = [
  "Alimentos e Bebidas", "Produtos de Limpeza", "Amenidades",
  "Material de Escritório", "Equipamentos", "Utensílios", "Outros",
];

export function CriarProdutoModal({ open, onClose, onCreated, unidades }: CriarProdutoModalProps) {
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    nome: "", descricao: "", unidade: "UN", ncm: "",
    valor_unitario: "", familia_omie: "Outros", codigo: "",
    unidade_id: unidades[0]?.id ?? "",
  });

  function set(k: keyof typeof form, v: string) {
    setForm(f => ({ ...f, [k]: v }));
  }

  function handleSubmit() {
    const valorNum = parseFloat(form.valor_unitario.replace(",", "."));
    if (isNaN(valorNum) || valorNum <= 0) {
      toast.error("Informe um valor unitário válido");
      return;
    }
    start(async () => {
      const res = await criarProduto({
        nome:           form.nome,
        descricao:      form.descricao || undefined,
        unidade:        form.unidade,
        ncm:            form.ncm,
        valor_unitario: valorNum,
        familia_omie:   form.familia_omie,
        codigo:         form.codigo || undefined,
        unidade_id:     form.unidade_id,
      });
      if ("erro" in res) {
        toast.error(res.erro);
      } else {
        toast.success("Produto criado e sincronizado com o Omie!");
        onCreated();
        onClose();
        setForm({ nome: "", descricao: "", unidade: "UN", ncm: "", valor_unitario: "", familia_omie: "Outros", codigo: "", unidade_id: unidades[0]?.id ?? "" });
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[5vh] px-4 overflow-y-auto">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-background shadow-2xl overflow-hidden mb-8">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <h2 className="text-base font-semibold text-foreground">Novo Produto</h2>
          <button onClick={onClose} className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors">
            <X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-5 space-y-4">
          <Field label="Unidade Omie" required>
            <select value={form.unidade_id} onChange={e => set("unidade_id", e.target.value)} className={cn(inputCls, "appearance-none cursor-pointer")}>
              {unidades.map(u => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Field label="Nome do Produto" required>
                <input type="text" value={form.nome} onChange={e => set("nome", e.target.value)} className={inputCls} placeholder="Ex: Shampoo 300ml" />
              </Field>
            </div>

            <Field label="NCM" required hint="8 dígitos — ex: 33051000">
              <input type="text" value={form.ncm} onChange={e => set("ncm", e.target.value)} className={inputCls} placeholder="33051000" maxLength={10} />
            </Field>
            <Field label="Unidade de Medida" required>
              <select value={form.unidade} onChange={e => set("unidade", e.target.value)} className={cn(inputCls, "appearance-none cursor-pointer")}>
                {UNIDADES_MED.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>

            <Field label="Valor Unitário (R$)" required>
              <input type="text" value={form.valor_unitario} onChange={e => set("valor_unitario", e.target.value)} className={inputCls} placeholder="0,00" />
            </Field>
            <Field label="Código Interno">
              <input type="text" value={form.codigo} onChange={e => set("codigo", e.target.value)} className={inputCls} placeholder="Ex: SHAM001" />
            </Field>

            <div className="col-span-2">
              <Field label="Família Omie" required>
                <select value={form.familia_omie} onChange={e => set("familia_omie", e.target.value)} className={cn(inputCls, "appearance-none cursor-pointer")}>
                  {FAMILIAS_OMIE.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
              </Field>
            </div>
          </div>

          <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 px-3 py-2">
            <p className="text-[11px] text-amber-400/80">
              NCM é obrigatório pelo Omie. O produto será criado primeiro no Omie e depois salvo no sistema.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border/60">
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={pending}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg border px-4 py-2",
              "border-emerald-700/60 bg-emerald-500/10 text-sm font-medium text-emerald-400",
              "hover:bg-emerald-500/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
            {pending ? "Criando no Omie…" : "Criar Produto"}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Integrar modal em produtos-client.tsx**

Abrir `app/(app)/produtos/_components/produtos-client.tsx`.

Adicionar import:

```typescript
import { CriarProdutoModal } from "./criar-produto-modal";
```

Adicionar prop `unidades` ao componente e estado:

```typescript
const [criarOpen, setCriarOpen] = useState(false);
```

Adicionar botão no header:

```tsx
<button
  onClick={() => setCriarOpen(true)}
  className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-3.5 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
>
  <Plus size={14} />
  Novo Produto
</button>
```

Adicionar modal no final do JSX:

```tsx
<CriarProdutoModal
  open={criarOpen}
  onClose={() => setCriarOpen(false)}
  onCreated={() => router.refresh()}
  unidades={unidades}
/>
```

Atualizar `app/(app)/produtos/page.tsx` para buscar unidades com Omie e passar ao componente (idêntico ao padrão de fornecedores acima).

- [ ] **Step 4: Verificar TypeScript**

```bash
npx tsc --noEmit 2>&1 | Select-String "produtos"
```

Esperado: sem erros relevantes.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/produtos/"
git commit -m "feat: produtos — criarProduto + IncluirProduto Omie + UI modal (NCM obrigatório)"
```

---

## Task 12: Verificação Final + Build

- [ ] **Step 1: Verificar TypeScript completo**

```bash
npx tsc --noEmit 2>&1
```

Esperado: 0 erros. Warnings de tipos legados são aceitáveis.

- [ ] **Step 2: Testar build Next.js**

```bash
cd C:\Users\danil\Desktop\LHG-SUPRIMENTOS\lhg-suprimentos
npm run build 2>&1 | tail -30
```

Esperado: `✓ Compiled successfully` ou similar sem erros.

- [ ] **Step 3: Verificar lint**

```bash
npm run lint 2>&1 | Select-String "error"
```

Esperado: sem erros de lint.

- [ ] **Step 4: Commit final**

```bash
git add -A
git commit -m "feat: Omie sync bidirecional completo — Sub-projetos 1–5 implementados"
```

---

## Checklist de SQL para o Usuário

Executar manualmente no Supabase SQL Editor (Task 1):

```sql
-- Migration 1: cotacoes
ALTER TABLE cotacoes
  ADD COLUMN IF NOT EXISTS omie_codigo          TEXT,
  ADD COLUMN IF NOT EXISTS omie_sincronizado_em TIMESTAMPTZ;

-- Migration 2: notas_fiscais
ALTER TABLE notas_fiscais
  ADD COLUMN IF NOT EXISTS omie_receb_id  INTEGER,
  ADD COLUMN IF NOT EXISTS omie_concluido BOOLEAN DEFAULT FALSE;
```

---

## Ordem de Execução

| Task | Descrição | Bloqueante para |
|------|-----------|-----------------|
| 1 | SQL Migrations | Task 6, 9, 10 |
| 2 | `lib/omie/requisicao.ts` | Task 6 |
| 3 | `lib/omie/pedidos.ts` | Task 8 |
| 4 | `lib/omie/recebimento.ts` | Task 9 |
| 5 | `client.ts` incluirCliente/incluirProduto | Task 10, 11 |
| 6 | `cotacoes/actions.ts` | Task 7 |
| 7 | `cotacoes-client.tsx` + modal | — |
| 8 | `pedidos/actions.ts` | — |
| 9 | `notas-fiscais/actions.ts` + UI | — |
| 10 | `fornecedores` create | — |
| 11 | `produtos` create | — |
| 12 | Verificação final | — |
