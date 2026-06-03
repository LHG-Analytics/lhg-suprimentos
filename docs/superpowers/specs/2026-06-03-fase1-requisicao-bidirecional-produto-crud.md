# Fase 1 — Requisição Bidirecional + CRUD de Produtos no Omie

## Goal

Tornar as Requisições de Compra bidirecionais entre a plataforma LHG e o Omie ERP, permitindo que gerentes criem requisições pela plataforma (que vão para o Omie) e que requisições criadas por estoquistas diretamente no Omie apareçam automaticamente na plataforma. Implementar CRUD de Produtos no Omie via plataforma (Create + Update, sem Delete) para suportar o fluxo de produtos não cadastrados. Cotações e Pedidos permanecem inalterados nesta fase (Fase 2).

---

## Contexto

**Quem usa o quê:**
- **Gerentes de unidade** → criam requisições pela plataforma LHG
- **Estoquistas de unidade** → criam requisições diretamente no Omie
- **Keila (compradora)** → vê todas as requisições na plataforma, independente da origem, e age sobre elas

**Problema atual:** Requisições são apenas internas na plataforma. O Omie não as recebe, e requisições criadas no Omie não aparecem aqui.

**Por que produto CRUD agora:** Solicitantes buscam o produto no catálogo Omie ao criar a requisição. Se não encontrarem, digitam texto livre. A plataforma sinaliza esses itens como "produto novo". Keila precisa criar o produto no Omie (via plataforma) antes de poder cotar.

---

## Fluxo da Fase 1

```
[Gerente]              [Estoquista]
    |                       |
Cria na plataforma    Cria no Omie
    |                       |
    ↓                       ↓ (job de sync)
        ┌─────────────────────┐
        │  Requisição de Compra│  ← bidirecional
        │  (plataforma + Omie) │
        └─────────────────────┘
               |
        [cada item é:]
        ┌──────────┬─────────────┐
        │ Catálogo │ Texto livre │
        │ (tem     │ (produto    │
        │ omie_cod)│  novo ⚠)   │
        └──────────┴─────────────┘
               |
     [se tem produto novo]
               ↓
        ┌─────────────────────┐
        │ Keila cria produto  │  ← CRUD Omie
        │ no Omie via plataforma│   Create + Update
        └─────────────────────┘
               |
     [todos os itens vinculados]
               ↓
        Keila aprova requisição
               ↓
        Cotação (inalterada — Fase 2)
```

---

## Arquitetura

### 1. Banco de dados

#### Modificar: `requisicoes`
```sql
ALTER TABLE requisicoes
  ADD COLUMN omie_codigo        BIGINT,
  ADD COLUMN omie_unidade_id    UUID REFERENCES unidades(id),
  ADD COLUMN omie_sincronizado_em TIMESTAMPTZ;

ALTER TYPE requisicao_status ADD VALUE IF NOT EXISTS 'pendente_produto';
-- Status 'pendente_produto': requisição tem itens com produto não cadastrado no Omie
-- Status 'aguardando_cotacao': requisição aprovada, aguardando Keila criar cotação
```

#### Modificar: `requisicao_itens`
```sql
ALTER TABLE requisicao_itens
  ALTER COLUMN produto_id DROP NOT NULL,  -- passa a ser nullable
  ADD COLUMN produto_nome_livre TEXT,      -- texto livre quando produto não foi encontrado
  ADD COLUMN produto_unidade_med TEXT,     -- unidade de medida descrita pelo solicitante
  ADD COLUMN produto_novo BOOLEAN NOT NULL DEFAULT false;
  -- produto_novo = true quando produto_id IS NULL e produto_nome_livre IS NOT NULL

-- Constraint: produto_id OR produto_nome_livre, nunca ambos nulos
ALTER TABLE requisicao_itens
  ADD CONSTRAINT chk_produto_definido
  CHECK (produto_id IS NOT NULL OR produto_nome_livre IS NOT NULL);
```

#### Nova tabela: `omie_requisicoes`
Espelho das requisições vindas do Omie (análogo à `omie_pedidos_compra`).

```sql
CREATE TABLE omie_requisicoes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id            UUID NOT NULL REFERENCES unidades(id),
  omie_codigo           BIGINT NOT NULL,
  numero                TEXT,
  data_requisicao       DATE,
  data_necessidade      DATE,
  observacao            TEXT,
  situacao              TEXT,  -- ex: "Aberta", "Em Cotação", "Aprovada"
  departamento          TEXT,
  solicitante_nome      TEXT,
  valor_total           NUMERIC(12,2),
  itens                 JSONB, -- snapshot dos itens vindos do Omie
  requisicao_id         UUID REFERENCES requisicoes(id), -- se importada para cá
  omie_sincronizado_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(omie_codigo, unidade_id)
);
```

---

### 2. Omie API — novas funções em `lib/omie/`

#### `lib/omie/requisicao.ts` — adicionar:

```typescript
// Listar requisições do Omie (para sync bidirecional)
listAllRequisicoes(creds: OmieCredentials): Promise<OmieRequisicaoItem[]>

// Tipos necessários
interface OmieRequisicaoItem {
  nCodReqCompra:    number;
  cNumReq:          string;
  dDtRequisicao:    string;   // "DD/MM/YYYY"
  dDtNecessidade?:  string;
  cObs?:            string;
  cSituacao:        string;
  cDepartamento?:   string;
  cSolicitante?:    string;
  det: Array<{
    nCodProd:    number;
    cCodProd?:   string;
    cDescricao:  string;
    nQtde:       number;
    cUnid:       string;
    nValorUnit?: number;
  }>;
}

// Já existem: incluirReq, upsertReq, excluirReq
```

#### `lib/omie/produtos.ts` — novo arquivo:

```typescript
// Criar produto no Omie
incluirProduto(creds: OmieCredentials, produto: OmieProdutoIncluir): Promise<{ nCodProd: number; cCodInt: string }>

// Atualizar produto no Omie
alterarProduto(creds: OmieCredentials, produto: OmieProdutoAlterar): Promise<void>

// Sem excluir — apenas inativação via alterarProduto({ cInativo: "S" })

interface OmieProdutoIncluir {
  cCodInt:     string;    // UUID do produto LHG (idempotência)
  cDescricao:  string;
  cUnidade:    string;    // "UN", "KG", "CX", etc.
  cCodFamilia?: string;   // código da família no Omie
  nValorVenda?: number;
  nValorCusto?: number;
  cInativo:    "N";
}

interface OmieProdutoAlterar {
  nCodProd:    number;    // código Omie obrigatório para alterar
  cCodInt:     string;
  cDescricao?: string;
  cUnidade?:   string;
  nValorCusto?: number;
  cInativo?:   "S" | "N";
}
```

---

### 3. Sync job — `lib/omie/sync.ts`

#### Nova função: `syncRequisicoes`

```typescript
async function syncRequisicoes(
  supabase: SupabaseClient,
  creds: OmieCredentials,
  unidadeId: string
): Promise<SyncResult>
```

**O que faz:**
1. Chama `listAllRequisicoes(creds)` — pagina todas as requisições abertas do Omie
2. Para cada uma, faz upsert em `omie_requisicoes` (espelho)
3. Se `omie_requisicoes.requisicao_id IS NULL` → cria registro em `requisicoes` com `origem: 'omie'`
4. Vincula os itens em `requisicao_itens`: se o `nCodProd` existir em `produtos.omie_codigo` → vincula `produto_id`; senão → salva como `produto_nome_livre`
5. Registra em `integracao_logs`

**Quando roda:**
- Junto com o job existente em `/api/omie/sync` (entidade `"requisicoes"`)
- A cada 15 minutos via Vercel Cron (mesmo padrão dos pedidos)

---

### 4. Server Actions — `app/(app)/requisicoes/actions.ts`

```typescript
// Criar requisição na plataforma → sincroniza para Omie
criarRequisicao(data: RequisicaoFormData): Promise<{ id: string }>

// Aprovar requisição (muda status → 'aguardando_cotacao')
// Só possível quando todos os itens têm produto_id (nenhum produto_novo: true)
aprovarRequisicao(requisicaoId: string): Promise<void>

// Vincular produto recém-criado a um item de texto livre
vincularProdutoItem(requisicaoItemId: string, produtoId: string): Promise<void>

// CRUD de produto no Omie
criarProdutoOmie(data: ProdutoOmieFormData): Promise<{ produtoId: string }>
atualizarProdutoOmie(produtoId: string, data: Partial<ProdutoOmieFormData>): Promise<void>
```

---

### 5. Páginas e componentes

#### `/requisicoes` — página de listagem (modificar existente)
- **Filtros:** todas | criadas aqui | vindas do Omie | pendentes de produto | aguardando cotação
- **Badge de alerta:** requisições com `status = 'pendente_produto'` aparecem destacadas com ⚠
- **Origem:** ícone indicando se veio da plataforma ou do Omie

#### `/requisicoes/nova` — formulário de criação
- Campo de busca de produto (busca no catálogo Omie via `ListarProdutos`)
- Se não achar: botão "Não encontrei o produto" → campo de texto livre
- Campo quantidade + unidade de medida
- Unidade do hotel (da qual pertence a requisição)

#### `/requisicoes/[id]` — detalhe da requisição
- Lista de itens com badge ⚠ nos itens `produto_novo: true`
- Seção "Produtos pendentes de cadastro" (visível só para Keila/comprador)
- Botão "Cadastrar produto no Omie" → abre modal/drawer com formulário
- Botão "Aprovar requisição" (ativo só quando não há produto_novo pendente)
- Status timeline (rascunho → pendente_produto → aprovada → aguardando_cotacao)

#### Modal: `CriarProdutoOmieModal`
- Pré-preenchido com o `produto_nome_livre` do item
- Campos: Nome, Unidade de medida, Família Omie, Preço de custo (opcional)
- Submit → `criarProdutoOmie()` → produto criado no Omie → sync para `produtos` local → `vincularProdutoItem()`
- Ao vincular: `produto_novo` do item vira `false`, `produto_id` é preenchido
- Se todos os itens vinculados: status da requisição sai de `pendente_produto`

---

### 6. Rotas de API

#### `/api/omie/sync` — adicionar suporte a `entidade: "requisicoes"`
```typescript
case "requisicoes":
  result = await syncRequisicoes(supabase, creds, unidade.id);
  break;
```

#### Vercel Cron — `vercel.json`
```json
{
  "crons": [
    { "path": "/api/omie/sync?entidade=requisicoes", "schedule": "*/15 * * * *" }
  ]
}
```

---

## O que NÃO muda nesta fase

- **Cotações:** permanecem exatamente como estão. O sync cotação → Omie Requisição de Compra continua funcionando. Será removido na Fase 2.
- **Pedidos:** permanecem como estão.
- **Notas Fiscais:** permanecem (serão removidas na Fase 2).
- **Fornecedores e Produtos (leitura):** sync existente não muda.

---

## Lembrete — Fase 2 (não implementar agora)

Após a Fase 1 estar em produção e validada:
- Redesenho da Cotação: remove sync com Omie, sempre originada de Requisição(ões)
- Pedido de Compra redesenhado: gerado automaticamente na aprovação da cotação → enviado ao Omie
- Remoção do fluxo de Nota Fiscal
- Migração dos dados existentes de cotações e pedidos

---

## Ordem de implementação (Fase 1)

1. **SQL migrations** — modificar `requisicoes`, `requisicao_itens`; criar `omie_requisicoes`
2. **`lib/omie/produtos.ts`** — `incluirProduto` + `alterarProduto`
3. **`lib/omie/requisicao.ts`** — adicionar `listAllRequisicoes`
4. **`lib/omie/sync.ts`** — `syncRequisicoes`
5. **`/api/omie/sync`** — adicionar entidade `"requisicoes"` + cron
6. **Server Actions** — `criarRequisicao`, `aprovarRequisicao`, `vincularProdutoItem`, `criarProdutoOmie`, `atualizarProdutoOmie`
7. **`/requisicoes`** — listagem com filtros e badges
8. **`/requisicoes/nova`** — formulário com busca de produto + texto livre
9. **`/requisicoes/[id]`** — detalhe com aprovação e modal de produto
10. **`/produtos`** — adicionar Create/Update no Omie à página existente
