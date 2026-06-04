# LHG ↔ Omie Sync Bidirecional Completo — Design Spec

> **Para workers agênticos:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development ou superpowers:executing-plans para implementar este plano.

**Goal:** Implementar o CRUD completo bidirecional entre o LHG Suprimentos e o Omie ERP, cobrindo o ciclo de vida completo de compras desde a Cotação (criada pela compradora com preços do fornecedor) até a Conclusão do Recebimento no Omie.

**Data:** 2026-05-26

---

## Fluxo de Negócio Real

```
LHG Suprimentos                     Omie ERP
──────────────────────────────────────────────────────────────────
Requisição (interno, sem Omie)  →   [sem equivalente]
     ↓
Compradora solicita preços ao fornecedor (email/WhatsApp)
     ↓
Fornecedor responde com preços
     ↓
Cotação criada (fornecedor + qtd + preços)  →  Requisição de Compra (IncluirReq)
Cotação editada                             →  Requisição de Compra (UpsertReq)
Cotação excluída                            →  Requisição de Compra (ExcluirReq)
     ↓ (cotação aprovada)
Pedido de Compra criado         →  Pedido de Compra (IncluirPedCompra) [endpoint CORRIGIDO]
Pedido editado                  →  Pedido de Compra (AlteraPedCompra)
Pedido excluído                 →  Pedido de Compra (ExcluirPedCompra)
     ↓
NF lançada no Omie (já existe)  →  Nota de Entrada (IncluirNota) [já implementado]
NF vinculada ao pedido          →  AlterarRecebimento (ASSOCIAR-PEDIDO) [NOVO]
     ↓
Recebimento concluído           →  ConcluirRecebimento [NOVO]
──────────────────────────────────────────────────────────────────
Fornecedor criado no LHG        →  IncluirCliente [NOVO]
Produto criado no LHG           →  IncluirProduto [NOVO]
```

---

## Mapeamento de Terminologia

| LHG Suprimentos | Omie ERP | Endpoint Omie |
|---|---|---|
| Requisição | *(sem equivalente — interno)* | — |
| Cotação | Requisição de Compra | `/produtos/requisicaocompra/` |
| Pedido de Compra | Pedido de Compra | `/produtos/pedidocompra/` |
| NF do Fornecedor | Nota de Entrada | `/produtos/notaentrada/` |
| Recebimento | Recebimento (nIdReceb) | `/produtos/recebimento/` |

---

## Arquitetura — Módulos Novos/Modificados

### NOVO: `lib/omie/requisicao.ts`
Encapsula todas as operações Omie para Requisição de Compra.

```typescript
incluirReq(creds, param)          // IncluirReq — cria
upsertReq(creds, param)           // UpsertReq — cria ou atualiza (idempotente)
excluirReq(creds, codReqCompra)   // ExcluirReq — exclui
```

**Estrutura do param (requisicaoCadastro):**
- `codIntReqCompra: string`  — cotacao.id (UUID)
- `dtSugestao?: string`      — data de entrega (DD/MM/YYYY)
- `obsReqCompra?: string`    — ex: "Fornecedor: NSA Distribuidora"
- `ItensReqCompra: Array<{ codIntItem, codProd, qtde, precoUnit, obsItem }>`

### NOVO: `lib/omie/pedidos.ts`
Substitui o endpoint legado `/compras/pedidocompras/`.

```typescript
incluirPedCompra(creds, param)          // IncluirPedCompra
alterarPedCompra(creds, param)          // AlteraPedCompra
excluirPedCompra(creds, nCodPed)        // ExcluirPedCompra
consultarPedCompra(creds, nCodPed)      // ConsultarPedCompra
```

**Endpoint correto:** `https://app.omie.com.br/api/v1/produtos/pedidocompra/`

**Estrutura `cabecalho_incluir`:**
- `cCodIntPed: string`    — pedido.id
- `nCodFor: number`       — fornecedor.omie_codigo
- `dDtPrevisao?: string`  — DD/MM/YYYY
- `cObs?: string`

**Estrutura `produtos_incluir` (array):**
- `cCodIntItem: string`   — item ID
- `nCodProd: number`      — produto.omie_codigo
- `nQtde: number`
- `nValUnit: number`

### NOVO: `lib/omie/recebimento.ts`
Gerencia o vínculo NF → Pedido e a conclusão do recebimento.

```typescript
listarRecebimentos(creds, nCodNota)                     // lista recebimentos da NF
associarPedidoRecebimento(creds, nIdReceb, nCodPed)     // ASSOCIAR-PEDIDO
concluirRecebimento(creds, nIdReceb)                    // ConcluirRecebimento
```

> ⚠️ Os parâmetros exatos de `ListarRecebimentos`, `AlterarRecebimento` e `ConcluirRecebimento` devem ser verificados na documentação Omie no início da implementação do Sub-projeto 3, pois o endpoint `/produtos/recebimento/` não foi completamente documentado aqui.

### MODIFICAR: `lib/omie/client.ts`
Adicionar dois novos helpers:

```typescript
incluirCliente(creds, param)    // IncluirCliente — criar fornecedor no Omie
incluirProduto(creds, param)    // IncluirProduto — criar produto no Omie
```

---

## Sub-projetos Detalhados

---

### Sub-projeto 1: Cotações — Edição + Sync Omie Requisição

**Arquivos:**
- **CRIAR:** `lib/omie/requisicao.ts`
- **MODIFICAR:** `app/(app)/cotacoes/actions.ts` — add `editarCotacao` + sync Omie em `criarCotacao`
- **MODIFICAR:** `app/(app)/cotacoes/_components/cotacoes-client.tsx` — botão editar + modal

**Regras de negócio:**
- Cotação criada → `IncluirReq` no Omie (automático, não bloqueia se falhar)
- Cotação editada → `UpsertReq` no Omie (se `omie_codigo` existir)
- Cotação excluída → `ExcluirReq` no Omie (se `omie_codigo` existir)
- `codIntReqCompra` = cotacao.id (UUID)
- Itens da requisição: `codProd` = produto.omie_codigo (deve existir no Omie)
- Produtos sem `omie_codigo`: incluídos com `codIntProd` como fallback, log de aviso
- Fornecedor registrado em `obsReqCompra`: "Fornecedor: {nome_fantasia}"
- Somente cotações com status `rascunho` ou `aberta` podem ser editadas
- Edição: altera titulo, justificativa, data, itens (add/remove/editar qtd+obs)

**Migration SQL:**
```sql
ALTER TABLE cotacoes
  ADD COLUMN IF NOT EXISTS omie_codigo         TEXT,
  ADD COLUMN IF NOT EXISTS omie_sincronizado_em TIMESTAMPTZ;
```

---

### Sub-projeto 2: Pedidos — CRUD no Omie (fix + extend)

**Arquivos:**
- **CRIAR:** `lib/omie/pedidos.ts`
- **MODIFICAR:** `app/(app)/pedidos/actions.ts` — fix `pushPedidoOmie` + add `editarPedido` + `excluirPedidoOmie`
- **MODIFICAR:** UI pedidos — botões editar/excluir onde aplicável

**Problema atual:** `pushPedidoOmie` usa `/compras/pedidocompras/` (endpoint legado, diferente formato de parâmetros). O endpoint correto é `/produtos/pedidocompra/` com `IncluirPedCompra`.

**Fix do create:**
```typescript
// ANTES (legado, formato antigo):
// POST /compras/pedidocompras/ — IncluirPedidoCompra
// cabecalho: { numero_pedido, codigo_parceiro, ... }

// DEPOIS (correto):
// POST /produtos/pedidocompra/ — IncluirPedCompra
// cabecalho_incluir: { cCodIntPed, nCodFor, dDtPrevisao, cObs }
// produtos_incluir: [{ cCodIntItem, nCodProd, nQtde, nValUnit }]
```

**Regras para editar pedido:**
- Só disponível se `omie_status === "sincronizado"` e status local não é `recebido`/`finalizado`
- Chama `AlteraPedCompra` com `nCodPed` (omie_codigo) + itens atualizados
- Em caso de erro Omie: salva local, marca `omie_status = "pendente_sync"`, exibe aviso

**Regras para excluir pedido no Omie:**
- Só disponível se `omie_status === "sincronizado"` e status local é `enviado` ou `cancelado`
- Chama `ExcluirPedCompra` com `nCodPed`
- Marca `omie_status = "excluido"` localmente

---

### Sub-projeto 3: NF → Recebimento → Conclusão no Omie

**Arquivos:**
- **CRIAR:** `lib/omie/recebimento.ts`
- **MODIFICAR:** `app/(app)/notas-fiscais/actions.ts` — atualizar `lancarNFOmie` + add `concluirRecebimentoOmie`
- **MODIFICAR:** UI notas-fiscais — botão "Concluir no Omie"

**Fluxo detalhado:**
1. `lancarNFOmie` (já existe) → cria NF no Omie via `IncluirNota`, retorna `nCodNota`
2. **NOVO** — após criar NF: se pedido tem `omie_codigo`, chama `listarRecebimentos(nCodNota)` → pega `nIdReceb` → chama `associarPedidoRecebimento(nIdReceb, nCodPed)`
3. Guarda `nIdReceb` em `notas_fiscais.omie_receb_id`
4. **NOVO** — `concluirRecebimentoOmie(nfId)`:
   - Lê `omie_receb_id` da NF
   - Chama `concluirRecebimento(nIdReceb)`
   - Atualiza pedido.status = `finalizado`
   - Atualiza `notas_fiscais.omie_concluido = true`

**UI:** botão "Concluir no Omie" visível quando:
- `nf.lancada_no_omie = true` AND
- `nf.omie_receb_id IS NOT NULL` AND
- `nf.omie_concluido = false`

**Migration SQL:**
```sql
ALTER TABLE notas_fiscais
  ADD COLUMN IF NOT EXISTS omie_receb_id  INTEGER,
  ADD COLUMN IF NOT EXISTS omie_concluido BOOLEAN DEFAULT FALSE;
```

---

### Sub-projeto 4: Fornecedores — Criar no Omie

**Arquivos:**
- **MODIFICAR:** `lib/omie/client.ts` — add `incluirCliente`
- **MODIFICAR:** `app/(app)/fornecedores/actions.ts` — add `criarFornecedor`
- **MODIFICAR:** UI fornecedores — botão "+ Novo Fornecedor" + modal

**Campos do formulário:**
- `razao_social` *(obrigatório)*
- `cnpj_cpf` *(obrigatório)* — validação de formato
- `nome_fantasia` *(obrigatório)*
- `email` *(opcional)*
- `telefone` *(opcional)*
- `endereco`, `cep`, `cidade`, `uf` *(opcionais)*

**Comportamento:**
1. Valida CNPJ: não pode existir já em `fornecedores` (cnpj unique)
2. Chama `IncluirCliente` no Omie com `tags: [{ tag: "Fornecedor" }]`
3. Recebe `codigo_cliente_omie` na resposta
4. Insere no Supabase com `omie_codigo = codigo_cliente_omie` já preenchido
5. Se Omie retornar erro: não insere no Supabase (criação atômica)

---

### Sub-projeto 5: Produtos — Criar no Omie

**Arquivos:**
- **MODIFICAR:** `lib/omie/client.ts` — add `incluirProduto`
- **MODIFICAR:** `app/(app)/produtos/actions.ts` — add `criarProduto`
- **MODIFICAR:** UI produtos — botão "+ Novo Produto" + modal

**Campos do formulário:**
- `nome` / `descricao` *(obrigatório)*
- `unidade` *(obrigatório)* — ex: "UN", "KG", "LT"
- `ncm` *(obrigatório)* — 8 dígitos, obrigatório pela API Omie
- `valor_unitario` / `preco_custo` *(obrigatório)*
- `familia_omie` *(obrigatório)* — mapeado via `familia-map.ts`
- `codigo` *(opcional)* — código interno

**Comportamento:**
1. `codigo_produto_integracao` gerado automaticamente: `LHG-{uuid.slice(0,8)}`
2. `descricao_familia` = `familia_omie` do input (string exata — Omie aceita nome da família)
3. Chama `IncluirProduto` no Omie → recebe `codigo_produto`
4. Insere no Supabase com `omie_codigo = codigo_produto`
5. Se Omie retornar erro: não insere no Supabase (criação atômica)

**Constraint crítica:** `ncm` é obrigatório pela API Omie. Campo marcado como obrigatório no formulário com hint de formato (ex: "8433.11.10").

---

## Tratamento de Erros — Política Geral

| Operação | Comportamento em caso de falha Omie |
|---|---|
| Cotação criar/editar/excluir | Salva local; log de aviso; omie_codigo fica null/inalterado |
| Pedido criar | Salva local com `omie_status = "erro"` e `omie_erro = msg` |
| Pedido editar/excluir | Salva local; marca `omie_status = "pendente_sync"`; exibe toast aviso |
| NF lançar (já existe) | Marca `status = "erro_omie"` |
| NF vincular pedido | Log de aviso; `omie_receb_id` fica null; botão "Vincular" aparece |
| Concluir recebimento | Toast de erro; omie_concluido fica false |
| Criar fornecedor | Bloqueia criação (rollback) — fornecedor sem Omie ID é inútil |
| Criar produto | Bloqueia criação (rollback) — produto sem Omie ID é inútil |

---

## Constraints Técnicas Importantes

1. **Omie Rate Limit:** 240 req/min. O throttle de 280ms por app_key já está implementado em `omiePost`.
2. **Produtos sem omie_codigo:** Cotação com produtos não sincronizados → envia Requisição sem `codProd`, usando `codIntProd` como fallback. Não bloqueia o fluxo.
3. **NCM obrigatório para produto:** Campo não pode ficar vazio no formulário de criação.
4. **Endpoint de pedidos:** A função `criarPedidoCompra` legada em `client.ts` é mantida para compatibilidade com pedidos antigos. O `pushPedidoOmie` é atualizado para usar `incluirPedCompra` do novo módulo `lib/omie/pedidos.ts` (`/produtos/pedidocompra/`). Pedidos já enviados pelo endpoint antigo continuam funcionando em alter/exclude pois o `nCodPed` (omie_codigo) é o mesmo identificador.
5. **Pedido omie_codigo:** Após fix do `pushPedidoOmie`, o retorno de `IncluirPedCompra` inclui `nCodPed` (integer) que deve ser salvo como `omie_codigo`.

---

## Migrations SQL Completas

```sql
-- Sub-projeto 1: cotacoes recebe omie_codigo
ALTER TABLE cotacoes
  ADD COLUMN IF NOT EXISTS omie_codigo          TEXT,
  ADD COLUMN IF NOT EXISTS omie_sincronizado_em TIMESTAMPTZ;

-- Sub-projeto 3: notas_fiscais recebe campos de recebimento
ALTER TABLE notas_fiscais
  ADD COLUMN IF NOT EXISTS omie_receb_id  INTEGER,
  ADD COLUMN IF NOT EXISTS omie_concluido BOOLEAN DEFAULT FALSE;
```

---

## Ordem de Implementação

| # | Sub-projeto | Dependências | Est. |
|---|---|---|---|
| 1 | Cotações — Edição + Sync Omie Requisição | `lib/omie/requisicao.ts` novo | ~4h |
| 2 | Pedidos — CRUD no Omie (fix + extend) | `lib/omie/pedidos.ts` novo | ~4h |
| 3 | NF → Recebimento → Conclusão | `lib/omie/recebimento.ts` novo | ~5h |
| 4 | Fornecedores — Criar no Omie | client.ts + actions | ~3h |
| 5 | Produtos — Criar no Omie | client.ts + actions | ~3h |
