-- =============================================================================
-- LHG Suprimentos — Migration 0001: Schema inicial
-- =============================================================================

-- ─── ENUMS ───────────────────────────────────────────────────────────────────
CREATE TYPE user_role   AS ENUM ('admin', 'comprador', 'aprovador', 'solicitante');
CREATE TYPE req_status  AS ENUM ('rascunho', 'cotacao', 'pendente', 'aprovado', 'rejeitado', 'cancelado');
CREATE TYPE cot_status  AS ENUM ('rascunho', 'cotacao', 'pendente', 'aprovado', 'rejeitado', 'cancelado');
CREATE TYPE ped_status  AS ENUM (
  'rascunho', 'aguardando_aprovacao', 'enviado',
  'em_transito', 'recebido', 'finalizado', 'cancelado', 'erro_omie'
);
CREATE TYPE omie_status  AS ENUM ('pendente', 'sincronizado', 'erro');
CREATE TYPE nf_item_kind AS ENUM ('ok', 'preco', 'qtd', 'extra', 'faltante');
CREATE TYPE urgencia      AS ENUM ('normal', 'urgente');

-- ─── UNIDADES (tenants visuais) ───────────────────────────────────────────────
CREATE TABLE unidades (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text        NOT NULL UNIQUE,        -- 'lush-ipiranga'
  nome            text        NOT NULL,               -- 'Lush Ipiranga'
  cidade          text,
  uf              text,
  cor_hex         text,                               -- chip color na sidebar
  omie_cnpj       text,                              -- CNPJ no Omie
  omie_empresa_id text,                              -- ID da empresa no Omie
  ativa           boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ─── USER PROFILES (extende auth.users) ──────────────────────────────────────
CREATE TABLE user_profiles (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        text        NOT NULL,
  email       text        NOT NULL UNIQUE,
  role        user_role   NOT NULL DEFAULT 'solicitante',
  avatar_url  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Pivot: quais unidades cada usuário acessa
CREATE TABLE user_unidades (
  user_id    uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES unidades(id)      ON DELETE CASCADE,
  PRIMARY KEY (user_id, unidade_id)
);

-- ─── FORNECEDORES ─────────────────────────────────────────────────────────────
CREATE TABLE fornecedores (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social        text        NOT NULL,
  nome_fantasia       text,
  cnpj                text        NOT NULL UNIQUE,
  categoria           text,                          -- 'Amenities & Higiene', etc
  email               text,
  telefone            text,
  rating              numeric(2,1) DEFAULT 0,        -- 0.0 – 5.0
  pontualidade_pct    numeric(5,2) DEFAULT 0,
  competitividade_pct numeric(5,2) DEFAULT 0,
  omie_codigo         text,                          -- ID no Omie
  ativo               boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ─── PRODUTOS / CATÁLOGO ──────────────────────────────────────────────────────
CREATE TABLE produtos (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      text        NOT NULL UNIQUE,            -- 'AME-001'
  nome        text        NOT NULL,
  unidade_med text        NOT NULL,                   -- 'kit', 'un', 'galão'
  categoria   text        NOT NULL,                   -- 'Amenities', 'Enxoval'
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── REQUISIÇÕES ─────────────────────────────────────────────────────────────
CREATE TABLE requisicoes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero         text        NOT NULL UNIQUE,         -- 'REQ-2026-0001' (trigger)
  titulo         text        NOT NULL,
  solicitante_id uuid        NOT NULL REFERENCES user_profiles(id),
  urgencia       urgencia    NOT NULL DEFAULT 'normal',
  justificativa  text,
  status         req_status  NOT NULL DEFAULT 'rascunho',
  valor_estimado numeric(14,2) DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Pivot: quais unidades uma requisição atende
CREATE TABLE requisicao_unidades (
  requisicao_id uuid REFERENCES requisicoes(id) ON DELETE CASCADE,
  unidade_id    uuid REFERENCES unidades(id),
  PRIMARY KEY (requisicao_id, unidade_id)
);

CREATE TABLE requisicao_itens (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicao_id uuid        NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
  produto_id    uuid        NOT NULL REFERENCES produtos(id),
  quantidade    numeric(12,3) NOT NULL,
  observacao    text
);

-- ─── COTAÇÕES ────────────────────────────────────────────────────────────────
CREATE TABLE cotacoes (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          text        NOT NULL UNIQUE,        -- 'COT-2026-0001' (trigger)
  requisicao_id   uuid        REFERENCES requisicoes(id),
  titulo          text        NOT NULL,
  comprador_id    uuid        REFERENCES user_profiles(id),
  status          cot_status  NOT NULL DEFAULT 'rascunho',
  prazo           date,
  valor_estimado  numeric(14,2) DEFAULT 0,
  economia        numeric(14,2) DEFAULT 0,
  economia_pct    numeric(5,2)  DEFAULT 0,
  ai_resumo       text,                              -- markdown da sugestão IA
  ai_analisada_em timestamptz,
  urgente         boolean     DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cotacao_unidades (
  cotacao_id uuid REFERENCES cotacoes(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES unidades(id),
  PRIMARY KEY (cotacao_id, unidade_id)
);

CREATE TABLE cotacao_itens (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id       uuid NOT NULL REFERENCES cotacoes(id) ON DELETE CASCADE,
  produto_id       uuid NOT NULL REFERENCES produtos(id),
  quantidade       numeric(12,3) NOT NULL,
  melhor_forn      uuid REFERENCES fornecedores(id),    -- escolha IA
  selecionado_forn uuid REFERENCES fornecedores(id)     -- escolha comprador
);

CREATE TABLE cotacao_fornecedores (
  cotacao_id    uuid REFERENCES cotacoes(id) ON DELETE CASCADE,
  fornecedor_id uuid REFERENCES fornecedores(id),
  PRIMARY KEY (cotacao_id, fornecedor_id)
);

-- Matriz comparativa: célula = (cotacao_item × fornecedor)
CREATE TABLE cotacao_matriz (
  cotacao_item_id    uuid        NOT NULL REFERENCES cotacao_itens(id) ON DELETE CASCADE,
  fornecedor_id      uuid        NOT NULL REFERENCES fornecedores(id),
  preco_unitario     numeric(12,4),                  -- NULL = não atende
  prazo_entrega_dias int,
  condicao_pagamento text,                            -- '30 dias', '30/60', etc
  observacao         text,
  cotado_em          timestamptz,
  PRIMARY KEY (cotacao_item_id, fornecedor_id)
);

-- ─── PEDIDOS DE COMPRA ────────────────────────────────────────────────────────
CREATE TABLE pedidos (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero           text        NOT NULL UNIQUE,       -- 'PED-2026-0001' (trigger)
  cotacao_id       uuid        REFERENCES cotacoes(id),
  fornecedor_id    uuid        NOT NULL REFERENCES fornecedores(id),
  comprador_id     uuid        REFERENCES user_profiles(id),
  aprovador_id     uuid        REFERENCES user_profiles(id),
  status           ped_status  NOT NULL DEFAULT 'rascunho',
  valor_total      numeric(14,2) NOT NULL,
  condicao_pgto    text,
  entrega_prev     date,
  omie_status      omie_status NOT NULL DEFAULT 'pendente',
  omie_codigo      text,                              -- # do pedido no Omie
  omie_erro        text,                              -- mensagem se erro
  email_enviado_em timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pedido_unidades (
  pedido_id  uuid REFERENCES pedidos(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES unidades(id),
  PRIMARY KEY (pedido_id, unidade_id)
);

CREATE TABLE pedido_itens (
  id             uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id      uuid          NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id     uuid          NOT NULL REFERENCES produtos(id),
  quantidade     numeric(12,3) NOT NULL,
  preco_unitario numeric(12,4) NOT NULL,
  valor_total    numeric(14,2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED
);

CREATE TABLE pedido_eventos (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id  uuid        NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo       text        NOT NULL,  -- 'criado','aprovado','omie','email','confirmado','erro','recebido'
  texto      text        NOT NULL,
  autor_id   uuid        REFERENCES user_profiles(id),
  autor_nome text,                  -- 'Sistema' quando autor_id IS NULL
  metadata   jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─── NOTAS FISCAIS ────────────────────────────────────────────────────────────
CREATE TABLE notas_fiscais (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id        uuid        NOT NULL REFERENCES pedidos(id),
  chave_acesso     text        NOT NULL UNIQUE,        -- 44 dígitos
  numero           text,
  serie            text,
  emissao          timestamptz,
  valor_total      numeric(14,2),
  xml_url          text,                              -- Supabase Storage URL
  status           text        NOT NULL DEFAULT 'pendente_conferencia',
  lancada_no_omie  boolean     DEFAULT false,
  lancada_em       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nf_itens (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_id         uuid          NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  produto_id    uuid          REFERENCES produtos(id),
  qtd_pedido    numeric(12,3),
  qtd_nf        numeric(12,3),
  preco_pedido  numeric(12,4),
  preco_nf      numeric(12,4),
  divergencia   nf_item_kind  NOT NULL DEFAULT 'ok',
  decisao       text                                 -- 'aceitar', 'contestar', null
);

-- ─── REGRAS DE APROVAÇÃO ──────────────────────────────────────────────────────
CREATE TABLE regras_aprovacao (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nome         text        NOT NULL,
  valor_min    numeric(14,2) DEFAULT 0,
  valor_max    numeric(14,2),                        -- NULL = sem teto (super-aprovador)
  categoria    text,                                 -- NULL = qualquer categoria
  unidade_id   uuid        REFERENCES unidades(id),  -- NULL = qualquer unidade
  aprovador_id uuid        NOT NULL REFERENCES user_profiles(id),
  ativa        boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- ─── AUDITORIA ────────────────────────────────────────────────────────────────
CREATE TABLE audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES user_profiles(id),
  acao        text        NOT NULL,    -- 'pedido.aprovado', 'fornecedor.atualizado', etc
  entidade    text        NOT NULL,    -- 'pedido', 'cotacao', 'fornecedor'
  entidade_id uuid,
  diff        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── CONFIGURAÇÕES DA APP ─────────────────────────────────────────────────────
CREATE TABLE app_settings (
  chave text    PRIMARY KEY,
  valor jsonb   NOT NULL
);

-- ─── EMBEDDINGS (pgvector — RAG para chat IA) ─────────────────────────────────
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade    text        NOT NULL,   -- 'cotacao', 'pedido', 'fornecedor'
  entidade_id uuid        NOT NULL,
  texto       text        NOT NULL,
  embedding   vector(1536),
  updated_at  timestamptz DEFAULT now()
);

-- ─── ÍNDICES ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_cotacoes_status         ON cotacoes(status);
CREATE INDEX idx_pedidos_status          ON pedidos(status);
CREATE INDEX idx_pedidos_fornecedor      ON pedidos(fornecedor_id);
CREATE INDEX idx_cotacao_unidades_u      ON cotacao_unidades(unidade_id);
CREATE INDEX idx_pedido_unidades_u       ON pedido_unidades(unidade_id);
CREATE INDEX idx_audit_log_entidade      ON audit_log(entidade, entidade_id);
CREATE INDEX idx_embeddings_entidade     ON embeddings(entidade, entidade_id);
CREATE INDEX idx_embeddings_hnsw         ON embeddings USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_requisicoes_solicitante ON requisicoes(solicitante_id);
CREATE INDEX idx_requisicoes_status      ON requisicoes(status);
CREATE INDEX idx_pedido_eventos_pedido   ON pedido_eventos(pedido_id);
CREATE INDEX idx_notas_fiscais_pedido    ON notas_fiscais(pedido_id);
