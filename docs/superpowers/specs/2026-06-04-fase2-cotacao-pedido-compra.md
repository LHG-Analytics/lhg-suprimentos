# Fase 2 — Cotação Interna + Pedido de Compra Automático no Omie

## Goal

Redesenhar o fluxo de aprovação da cotação para que o Pedido de Compra seja gerado automaticamente no Omie quando a Keila aprova uma cotação. Remover o sync de cotação com Omie (que hoje cria uma "Requisição de Compra" desnecessária). Remover completamente o módulo de Nota Fiscal da plataforma.

---

## Contexto

**Fluxo atual:**
- Cotação → sync ao Omie como "Requisição de Compra" (via `upsertReq`) → pedido criado manualmente depois → pedido enviado ao Omie manualmente
- NF: Keila registra entrada de NF na plataforma para fechar o ciclo

**Fluxo novo (Fase 2):**
- Cotação → 100% interna (sem sync Omie) → Keila seleciona fornecedor(es) vencedor(es) → clica "Aprovar compra" → pedidos criados automaticamente + enviados ao Omie + enviados por email ao fornecedor
- NF: removida completamente da plataforma

---

## Arquitetura

### 1. UI de Seleção de Fornecedor Vencedor

**Onde:** tela de detalhe da cotação (`/cotacoes/[id]`)

**Componentes novos:**
- `SelecionarFornecedorPanel` — painel lateral ou seção no bottom da matriz com:
  - Checkbox por linha de item da matriz
  - Checkbox "Selecionar todos" no header
  - Botão "Atribuir a fornecedor" (ativo quando ≥1 item selecionado) → popover com lista de fornecedores da cotação
  - Badge por item mostrando o fornecedor atribuído (cor do fornecedor + nome abreviado)
- `AprovarCompraButton` — botão principal:
  - Desabilitado (com tooltip) enquanto há itens sem fornecedor atribuído
  - Habilitado somente quando 100% dos itens têm fornecedor vencedor
  - Ao clicar: abre confirmação "Gerar X pedido(s) de compra?"

**Campo novo na tabela `cotacao_itens`:**
```sql
ALTER TABLE cotacao_itens ADD COLUMN IF NOT EXISTS fornecedor_vencedor_id UUID REFERENCES fornecedores(id);
```

---

### 2. Ação "Aprovar compra"

**Server Action:** `aprovarCotacao(cotacaoId: string)`

**Fluxo:**

```
1. Validar: todos cotacao_itens têm fornecedor_vencedor_id preenchido
   → Se não: retornar { erro: "X item(s) sem fornecedor atribuído" }

2. Agrupar itens por fornecedor_vencedor_id
   → Ex: { "forn-A": [item1, item2], "forn-B": [item3] }

3. Para cada grupo (fornecedor + itens):
   a. Criar registro em `pedidos`:
      - cotacao_id, fornecedor_id, comprador_id
      - status = "enviado"
      - valor_total = soma dos itens
      - entrega_prev = cotacao.prazo
   
   b. Criar registros em `pedido_itens`:
      - produto_id, quantidade, preco_unitario (da cotacao_matriz para aquele fornecedor)
   
   c. Criar registro em `pedido_unidades` (unidades da cotação)
   
   d. Tentar enviar ao Omie via `incluirPedCompra`:
      - ✅ Sucesso → pedido.omie_status = "sincronizado", pedido.omie_codigo = nCodPed
      - ❌ Falha → pedido.omie_status = "pendente", pedido.omie_erro = mensagem
   
   e. Tentar enviar email ao fornecedor com resumo do pedido
      - Falha silenciosa (log apenas, não bloqueia)

4. Atualizar cotação:
   - status = "aprovado"
   - revalidatePath("/cotacoes"), revalidatePath("/pedidos")

5. Retornar { pedidos: [{ id, numero, fornecedor, omieOk, emailOk }] }
```

**Botão "Tentar novamente" no pedido:**
- Aparece quando `pedido.omie_status = "pendente"`
- Chama `pushPedidoOmie(pedidoId)` (função já existente em `pedidos/actions.ts`)

---

### 3. Remover Sync Cotação → Omie

**Arquivos a modificar:**

- `app/(app)/cotacoes/actions.ts`:
  - Remover função `buildReqOmieParam`
  - Remover chamadas a `upsertReq`, `incluirReq`, `excluirReq` de cotações
  - Remover import de `lib/omie/requisicao` nos contextos de cotação
  - Remover campos `omie_codigo` e `omie_sincronizado_em` das operações de cotação

- `cotacoes/[id]/_components/` — remover qualquer referência a "Requisição Omie" no UI de cotação

> Nota: `lib/omie/requisicao.ts` permanece intacto — ainda é usado pelas Requisições (Fase 1).

---

### 4. Remover Nota Fiscal

**SQL (executar manualmente no Supabase):**

```sql
-- Remover tabelas de NF (dados apagados permanentemente)
DROP TABLE IF EXISTS nf_itens CASCADE;
DROP TABLE IF EXISTS notas_fiscais CASCADE;
```

**Arquivos a remover:**
- `app/(app)/notas-fiscais/` — diretório inteiro
- `lib/omie/recebimento.ts` — funções de recebimento Omie (consultarNotaEntrada, incluirNotaEntrada, listarRecebimentos, associarPedidoRecebimento, concluirRecebimento)
- Referências a NF em `app/(app)/layout.tsx` ou menu de navegação
- Referências a NF em `app/(app)/dashboard/` (KPIs de NF se houver)

**Campos a manter (não remover do banco):**
- `pedidos.status` mantém os valores: rascunho | aguardando_aprovacao | **enviado** | em_transito | recebido | finalizado | cancelado
  - "recebido" pode ser marcado manualmente no futuro
- `pedidos.omie_status` mantém: pendente | sincronizado | erro

---

## Ordem de Implementação

```
1. SQL: ADD COLUMN cotacao_itens.fornecedor_vencedor_id
2. UI: SelecionarFornecedorPanel + AprovarCompraButton na tela de cotação
3. Action: aprovarCotacao() com geração de pedidos + Omie + email
4. Remover sync cotação→Omie de cotacoes/actions.ts
5. SQL: DROP TABLE notas_fiscais, nf_itens
6. Remover diretório app/(app)/notas-fiscais/
7. Remover lib/omie/recebimento.ts
8. Remover link NF da navegação
9. Remover referências a NF no dashboard
```

---

## Notas Importantes

- **Fase 2 NÃO remove:** o sync inverso de pedidos Omie → plataforma (`syncPedidosCompra`), que continua rodando para puxar atualizações de status
- **WhatsApp:** integração com Chatwoot fica para Fase 3 — por ora apenas email
- **Pedido com aprovador:** o campo `aprovador_id` na tabela `pedidos` pode ficar vazio neste fluxo (Keila é quem aprova via cotação)
- **Dados de NF:** o usuário confirmou que dados históricos de NF podem ser apagados junto com as tabelas
