-- =============================================================================
-- LHG Suprimentos — Migration 0006: Família de Produto do Omie
-- Separa familia_omie (campo bruto do Omie) de categoria (mapeamento orçamento).
-- =============================================================================

-- Adiciona coluna para guardar a família exata como vem do Omie ERP.
-- "categoria" passa a ser o campo de mapeamento para o orçamento.
ALTER TABLE produtos
  ADD COLUMN IF NOT EXISTS familia_omie text;

-- ── Passo 1: copia o valor atual de categoria → familia_omie ──────────────────
-- Produtos sincronizados do Omie tinham categoria = familia_omie (valor bruto).
UPDATE produtos
  SET familia_omie = categoria
  WHERE familia_omie IS NULL
    AND omie_codigo IS NOT NULL;

-- ── Passo 2: re-mapeia categoria para as categorias de orçamento ──────────────
-- Converte os valores brutos do Omie para as categorias financeiras da planilha.
-- (Migração única — edições manuais futuras serão preservadas pelo sync.)
UPDATE produtos
  SET categoria = CASE
    -- Alimentos
    WHEN familia_omie IN (
      'ACOMPANHAMENTOS','ADICIONAIS','AVES','CARNES BOVINAS','CONGELADOS',
      'DOCES E CHOCOLATES','EMBUTIDOS E FRIOS','ENTRADAS','ESTOQUE SECO',
      'HORTIFRUTI','LANCHES','LATICINIOS','MENU DE VERAO','PAES',
      'PESCADOS E FRUTOS DO MAR','PETISCOS','PRATOS PRINCIPAIS',
      'SOBREMESAS','SORVETES'
    ) THEN 'Alimentos'
    -- Bebidas Alcoólicas
    WHEN familia_omie IN (
      'BEBIDAS INSUMO','CERVEJAS','COQUETEIS','DESTILADOS','DOSES',
      'VINHOS E ESPUMANTES'
    ) THEN 'Bebidas Alcoólicas'
    -- Bebidas Não-Alcoólicas
    WHEN familia_omie IN (
      'CAFE DA MANHA E CHA','SOFT DRINK'
    ) THEN 'Bebidas Não-Alcoólicas'
    -- Amenities
    WHEN familia_omie IN (
      'BOMBONIERE','CORTESIAS','SACHES'
    ) THEN 'Amenities'
    -- Outros (sem correspondência direta no orçamento)
    WHEN familia_omie IN (
      'BRINDES E PRESENTES','CAUCAO','COLABORADORES','CONVENIENCIA',
      'ITENS EXTRAS','PRODUTOS EROTICOS','RESERVAS','SERVICOS',
      'TABACARIA','TAXAS DE REEMBOLSOS'
    ) THEN 'Outros'
    ELSE categoria  -- mantém o valor atual para famílias não reconhecidas
  END
  WHERE omie_codigo IS NOT NULL;

-- ── Índice para filtro rápido por família no frontend ─────────────────────────
CREATE INDEX IF NOT EXISTS idx_produtos_familia_omie
  ON produtos (familia_omie)
  WHERE familia_omie IS NOT NULL;

COMMENT ON COLUMN produtos.familia_omie IS
  'Família de produto conforme cadastrada no Omie ERP (ex: ESTOQUE SECO, BEBIDAS INSUMO). Somente leitura — atualizada pelo sync Omie, nunca pelo usuário.';

COMMENT ON COLUMN produtos.categoria IS
  'Categoria de orçamento (ex: Alimentos, Bebidas Alcoólicas). Mapeada automaticamente a partir de familia_omie no sync. Pode ser editada manualmente para alinhar com a planilha de custos.';
