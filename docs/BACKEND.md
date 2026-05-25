# Backend — Supabase + integrações

> Modele o banco antes de codar UI. RLS é não-negociável: a operação é multi-tenant (multi-unidade) e cada perfil só vê o que pode.

---

## 1. Schema Postgres (Supabase)

Crie em `supabase/migrations/0001_init.sql`. Esta é uma versão funcional/mínima; refine conforme entender melhor o domínio.

```sql
-- =====================================================================
-- ENUMS
-- =====================================================================
CREATE TYPE user_role     AS ENUM ('admin', 'comprador', 'aprovador', 'solicitante');
CREATE TYPE req_status    AS ENUM ('rascunho', 'cotacao', 'pendente', 'aprovado', 'rejeitado', 'cancelado');
CREATE TYPE cot_status    AS ENUM ('rascunho', 'cotacao', 'pendente', 'aprovado', 'rejeitado', 'cancelado');
CREATE TYPE ped_status    AS ENUM ('rascunho', 'aguardando_aprovacao', 'enviado', 'em_transito', 'recebido', 'finalizado', 'cancelado', 'erro_omie');
CREATE TYPE omie_status   AS ENUM ('pendente', 'sincronizado', 'erro');
CREATE TYPE nf_item_kind  AS ENUM ('ok', 'preco', 'qtd', 'extra', 'faltante');
CREATE TYPE urgencia      AS ENUM ('normal', 'urgente');

-- =====================================================================
-- UNIDADES (tenants visuais — todas pertencem a LHG)
-- =====================================================================
CREATE TABLE unidades (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text NOT NULL UNIQUE,           -- 'lush-ipiranga'
  nome            text NOT NULL,                  -- 'Lush Ipiranga'
  cidade          text,
  uf              text,
  cor_hex         text,                           -- chip color in sidebar
  omie_cnpj       text,                           -- CNPJ usado no Omie
  omie_empresa_id text,                           -- ID da empresa correspondente no Omie
  ativa           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- USERS — extende auth.users do Supabase
-- =====================================================================
CREATE TABLE user_profiles (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome            text NOT NULL,
  email           text NOT NULL UNIQUE,
  role            user_role NOT NULL DEFAULT 'solicitante',
  avatar_url      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Pivot: que unidades cada usuário tem acesso
CREATE TABLE user_unidades (
  user_id    uuid REFERENCES user_profiles(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES unidades(id)      ON DELETE CASCADE,
  PRIMARY KEY (user_id, unidade_id)
);

-- =====================================================================
-- FORNECEDORES
-- =====================================================================
CREATE TABLE fornecedores (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  razao_social      text NOT NULL,
  nome_fantasia     text,
  cnpj              text NOT NULL UNIQUE,
  categoria         text,                         -- 'Amenities & Higiene', etc
  email             text,
  telefone          text,
  rating            numeric(2,1) DEFAULT 0,       -- 0.0 - 5.0
  pontualidade_pct  numeric(5,2) DEFAULT 0,
  competitividade_pct numeric(5,2) DEFAULT 0,
  omie_codigo       text,                         -- ID no Omie
  ativo             boolean NOT NULL DEFAULT true,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- PRODUTOS / CATÁLOGO
-- =====================================================================
CREATE TABLE produtos (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo       text NOT NULL UNIQUE,              -- 'AME-001'
  nome         text NOT NULL,
  unidade_med  text NOT NULL,                     -- 'kit', 'un', 'galão'
  categoria    text NOT NULL,                     -- 'Amenities', 'Enxoval'
  ativo        boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- REQUISIÇÕES
-- =====================================================================
CREATE TABLE requisicoes (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero         text NOT NULL UNIQUE,            -- 'REQ-2026-0238' (gerado por trigger)
  titulo         text NOT NULL,
  solicitante_id uuid NOT NULL REFERENCES user_profiles(id),
  urgencia       urgencia NOT NULL DEFAULT 'normal',
  justificativa  text,
  status         req_status NOT NULL DEFAULT 'rascunho',
  valor_estimado numeric(14,2) DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE requisicao_unidades (
  requisicao_id uuid REFERENCES requisicoes(id) ON DELETE CASCADE,
  unidade_id    uuid REFERENCES unidades(id),
  PRIMARY KEY (requisicao_id, unidade_id)
);

CREATE TABLE requisicao_itens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requisicao_id uuid NOT NULL REFERENCES requisicoes(id) ON DELETE CASCADE,
  produto_id    uuid NOT NULL REFERENCES produtos(id),
  quantidade    numeric(12,3) NOT NULL,
  observacao    text
);

-- =====================================================================
-- COTAÇÕES
-- =====================================================================
CREATE TABLE cotacoes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          text NOT NULL UNIQUE,
  requisicao_id   uuid REFERENCES requisicoes(id),
  titulo          text NOT NULL,
  comprador_id    uuid REFERENCES user_profiles(id),
  status          cot_status NOT NULL DEFAULT 'rascunho',
  prazo           date,
  valor_estimado  numeric(14,2) DEFAULT 0,
  economia        numeric(14,2) DEFAULT 0,
  economia_pct    numeric(5,2)  DEFAULT 0,
  ai_resumo       text,                           -- texto markdown explicando a sugestão
  ai_analisada_em timestamptz,
  urgente         boolean DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cotacao_unidades (
  cotacao_id uuid REFERENCES cotacoes(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES unidades(id),
  PRIMARY KEY (cotacao_id, unidade_id)
);

CREATE TABLE cotacao_itens (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id   uuid NOT NULL REFERENCES cotacoes(id) ON DELETE CASCADE,
  produto_id   uuid NOT NULL REFERENCES produtos(id),
  quantidade   numeric(12,3) NOT NULL,
  melhor_forn  uuid REFERENCES fornecedores(id),   -- escolha da IA
  selecionado_forn uuid REFERENCES fornecedores(id) -- escolha do comprador
);

CREATE TABLE cotacao_fornecedores (
  cotacao_id    uuid REFERENCES cotacoes(id) ON DELETE CASCADE,
  fornecedor_id uuid REFERENCES fornecedores(id),
  PRIMARY KEY (cotacao_id, fornecedor_id)
);

-- A matriz comparativa: célula = (cotacao_item, fornecedor)
CREATE TABLE cotacao_matriz (
  cotacao_item_id    uuid NOT NULL REFERENCES cotacao_itens(id) ON DELETE CASCADE,
  fornecedor_id      uuid NOT NULL REFERENCES fornecedores(id),
  preco_unitario     numeric(12,4),               -- NULL = não atende
  prazo_entrega_dias int,
  condicao_pagamento text,                         -- '30 dias', '30/60', etc
  observacao         text,
  cotado_em          timestamptz,
  PRIMARY KEY (cotacao_item_id, fornecedor_id)
);

-- =====================================================================
-- PEDIDOS DE COMPRA
-- =====================================================================
CREATE TABLE pedidos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero        text NOT NULL UNIQUE,
  cotacao_id    uuid REFERENCES cotacoes(id),
  fornecedor_id uuid NOT NULL REFERENCES fornecedores(id),
  comprador_id  uuid REFERENCES user_profiles(id),
  aprovador_id  uuid REFERENCES user_profiles(id),
  status        ped_status NOT NULL DEFAULT 'rascunho',
  valor_total   numeric(14,2) NOT NULL,
  condicao_pgto text,
  entrega_prev  date,
  omie_status   omie_status NOT NULL DEFAULT 'pendente',
  omie_codigo   text,                              -- # do pedido no Omie
  omie_erro     text,                              -- mensagem se erro
  email_enviado_em timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE pedido_unidades (
  pedido_id  uuid REFERENCES pedidos(id) ON DELETE CASCADE,
  unidade_id uuid REFERENCES unidades(id),
  PRIMARY KEY (pedido_id, unidade_id)
);

CREATE TABLE pedido_itens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id       uuid NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  produto_id      uuid NOT NULL REFERENCES produtos(id),
  quantidade      numeric(12,3) NOT NULL,
  preco_unitario  numeric(12,4) NOT NULL,
  valor_total     numeric(14,2) GENERATED ALWAYS AS (quantidade * preco_unitario) STORED
);

CREATE TABLE pedido_eventos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id  uuid NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  tipo       text NOT NULL,                        -- 'criado', 'aprovado', 'omie', 'email', 'confirmado', 'erro', 'recebido'
  texto      text NOT NULL,
  autor_id   uuid REFERENCES user_profiles(id),
  autor_nome text,                                  -- 'Sistema' quando autor_id is null
  metadata   jsonb,                                 -- payload do evento
  created_at timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- NOTAS FISCAIS
-- =====================================================================
CREATE TABLE notas_fiscais (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pedido_id        uuid NOT NULL REFERENCES pedidos(id),
  chave_acesso     text NOT NULL UNIQUE,            -- 44 dígitos
  numero           text,                            -- '8920'
  serie            text,
  emissao          timestamptz,
  valor_total      numeric(14,2),
  xml_url          text,                            -- Supabase Storage URL
  status           text NOT NULL DEFAULT 'pendente_conferencia',  -- 'pendente', 'lancada', 'recusada'
  lancada_no_omie  boolean DEFAULT false,
  lancada_em       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE nf_itens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_id         uuid NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  produto_id    uuid REFERENCES produtos(id),
  qtd_pedido    numeric(12,3),
  qtd_nf        numeric(12,3),
  preco_pedido  numeric(12,4),
  preco_nf      numeric(12,4),
  divergencia   nf_item_kind NOT NULL DEFAULT 'ok',
  decisao       text                                -- 'aceitar', 'contestar', null
);

-- =====================================================================
-- REGRAS DE APROVAÇÃO
-- =====================================================================
CREATE TABLE regras_aprovacao (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            text NOT NULL,
  valor_min       numeric(14,2) DEFAULT 0,
  valor_max       numeric(14,2),                   -- NULL = sem teto (super-aprovador)
  categoria       text,                             -- NULL = qualquer
  unidade_id      uuid REFERENCES unidades(id),     -- NULL = qualquer
  aprovador_id    uuid NOT NULL REFERENCES user_profiles(id),
  ativa           boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- AUDITORIA
-- =====================================================================
CREATE TABLE audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES user_profiles(id),
  acao        text NOT NULL,                       -- 'pedido.aprovado', 'fornecedor.atualizado', etc
  entidade    text NOT NULL,                       -- 'pedido', 'cotacao', 'fornecedor'
  entidade_id uuid,
  diff        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- =====================================================================
-- ÍNDICES (os comuns)
-- =====================================================================
CREATE INDEX idx_cotacoes_status     ON cotacoes(status);
CREATE INDEX idx_pedidos_status      ON pedidos(status);
CREATE INDEX idx_pedidos_fornecedor  ON pedidos(fornecedor_id);
CREATE INDEX idx_cotacao_unidades_u  ON cotacao_unidades(unidade_id);
CREATE INDEX idx_pedido_unidades_u   ON pedido_unidades(unidade_id);
CREATE INDEX idx_audit_log_entidade  ON audit_log(entidade, entidade_id);
```

## 2. Row Level Security (RLS) — CRÍTICO

```sql
-- =====================================================================
-- Habilitar RLS em todas as tabelas
-- =====================================================================
ALTER TABLE user_profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_unidades        ENABLE ROW LEVEL SECURITY;
ALTER TABLE unidades             ENABLE ROW LEVEL SECURITY;
ALTER TABLE fornecedores         ENABLE ROW LEVEL SECURITY;
ALTER TABLE produtos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisicoes          ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisicao_unidades  ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisicao_itens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotacoes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotacao_unidades     ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotacao_itens        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotacao_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE cotacao_matriz       ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedidos              ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_unidades      ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_itens         ENABLE ROW LEVEL SECURITY;
ALTER TABLE pedido_eventos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_fiscais        ENABLE ROW LEVEL SECURITY;
ALTER TABLE nf_itens             ENABLE ROW LEVEL SECURITY;
ALTER TABLE regras_aprovacao     ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log            ENABLE ROW LEVEL SECURITY;

-- =====================================================================
-- Helper functions
-- =====================================================================
CREATE OR REPLACE FUNCTION public.current_user_role() RETURNS user_role AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_has_unidade(p_unidade uuid) RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_unidades
    WHERE user_id = auth.uid() AND unidade_id = p_unidade
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_unidades_ids() RETURNS uuid[] AS $$
  SELECT array_agg(unidade_id) FROM user_unidades WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =====================================================================
-- POLICIES — alguns exemplos críticos. Espelhe para todas as tabelas.
-- =====================================================================

-- user_profiles: cada um vê o seu; admin vê todos
CREATE POLICY "users read own" ON user_profiles
  FOR SELECT USING (id = auth.uid() OR current_user_role() = 'admin');

CREATE POLICY "admin manages users" ON user_profiles
  FOR ALL USING (current_user_role() = 'admin');

-- unidades: todos veem as suas; admin vê todas
CREATE POLICY "users read their units" ON unidades
  FOR SELECT USING (user_has_unidade(id) OR current_user_role() = 'admin');

CREATE POLICY "admin manages units" ON unidades
  FOR ALL USING (current_user_role() = 'admin');

-- fornecedores: todos leem; comprador/admin escrevem
CREATE POLICY "all read fornecedores" ON fornecedores FOR SELECT USING (true);
CREATE POLICY "comprador writes fornecedores" ON fornecedores
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

-- requisicoes: solicitante vê as suas + as da sua unidade; comprador/admin veem tudo
CREATE POLICY "users read requisicoes" ON requisicoes FOR SELECT USING (
  solicitante_id = auth.uid()
  OR current_user_role() IN ('comprador', 'admin', 'aprovador')
  OR EXISTS (
    SELECT 1 FROM requisicao_unidades ru
    WHERE ru.requisicao_id = requisicoes.id
      AND user_has_unidade(ru.unidade_id)
  )
);

CREATE POLICY "users create own requisicoes" ON requisicoes
  FOR INSERT WITH CHECK (solicitante_id = auth.uid());

CREATE POLICY "owner or comprador updates" ON requisicoes
  FOR UPDATE USING (
    solicitante_id = auth.uid() OR current_user_role() IN ('comprador', 'admin')
  );

-- cotacoes: comprador/admin sempre; outros se for da sua unidade
CREATE POLICY "users read cotacoes in scope" ON cotacoes FOR SELECT USING (
  current_user_role() IN ('comprador', 'admin', 'aprovador')
  OR EXISTS (
    SELECT 1 FROM cotacao_unidades cu
    WHERE cu.cotacao_id = cotacoes.id AND user_has_unidade(cu.unidade_id)
  )
);

CREATE POLICY "comprador admin write cotacoes" ON cotacoes
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

-- pedidos: aprovador vê os da sua alçada + comprador/admin tudo
CREATE POLICY "users read pedidos in scope" ON pedidos FOR SELECT USING (
  current_user_role() IN ('comprador', 'admin')
  OR aprovador_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM pedido_unidades pu
    WHERE pu.pedido_id = pedidos.id AND user_has_unidade(pu.unidade_id)
  )
);

CREATE POLICY "comprador admin write pedidos" ON pedidos
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

CREATE POLICY "aprovador updates aprovacao" ON pedidos
  FOR UPDATE USING (aprovador_id = auth.uid())
  WITH CHECK (aprovador_id = auth.uid());

-- audit_log: ninguém escreve direto (via trigger ou service-role); todos com acesso leem
CREATE POLICY "all auth read audit" ON audit_log FOR SELECT USING (auth.uid() IS NOT NULL);
```

> **Cuidado:** as policies acima são um esqueleto. Refine com o cliente: provavelmente solicitantes só podem ver requisições da SUA unidade, aprovadores só pedidos da SUA alçada, etc. Sempre testar com usuários de cada role.

## 3. Triggers úteis

```sql
-- Auto-gera número de requisição
CREATE OR REPLACE FUNCTION gerar_numero_requisicao() RETURNS trigger AS $$
DECLARE
  ano text := to_char(now(), 'YYYY');
  prox int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(numero FROM 10)::int), 0) + 1
  INTO prox FROM requisicoes WHERE numero LIKE 'REQ-' || ano || '-%';
  NEW.numero := 'REQ-' || ano || '-' || LPAD(prox::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_numero_requisicao BEFORE INSERT ON requisicoes
  FOR EACH ROW WHEN (NEW.numero IS NULL) EXECUTE FUNCTION gerar_numero_requisicao();

-- Similar para cotacoes (COT-YYYY-NNNN) e pedidos (PED-YYYY-NNNN)

-- Audit log automático para pedidos (exemplo)
CREATE OR REPLACE FUNCTION log_pedido_change() RETURNS trigger AS $$
BEGIN
  INSERT INTO audit_log(user_id, acao, entidade, entidade_id, diff)
  VALUES (
    auth.uid(),
    CASE WHEN TG_OP = 'INSERT' THEN 'pedido.criado'
         WHEN TG_OP = 'UPDATE' THEN 'pedido.atualizado'
         ELSE 'pedido.removido' END,
    'pedido',
    COALESCE(NEW.id, OLD.id),
    jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_pedidos AFTER INSERT OR UPDATE OR DELETE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION log_pedido_change();
```

## 4. Integração Omie

### Endpoints relevantes
A API do Omie é REST/JSON com call/param convention. Operações principais:
- `geral/produtos/` — cadastro de produtos (sync bidirecional)
- `geral/clientes/` — fornecedores (categoria "Fornecedor")
- `produtos/pedidos/` — gerar PC (Pedido de Compra)
- `produtos/recebimentos/` ou via documento fiscal — lançamento de entrada de NF

### Cliente Omie
Crie `lib/omie.ts`:

```ts
const OMIE_BASE = "https://app.omie.com.br/api/v1";

async function omieCall(path: string, call: string, param: any[]) {
  const res = await fetch(`${OMIE_BASE}/${path}/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      call,
      app_key:    process.env.OMIE_APP_KEY,
      app_secret: process.env.OMIE_APP_SECRET,
      param,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Omie ${call} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (data.faultstring) throw new Error(`Omie fault: ${data.faultstring}`);
  return data;
}

export const omie = {
  criarPedidoCompra: (p: any) =>
    omieCall("produtos/pedidos", "IncluirPedido", [p]),
  consultarPedido: (codigo: string) =>
    omieCall("produtos/pedidos", "ConsultarPedido", [{ codigo_pedido_integracao: codigo }]),
  // ...
};
```

### Fluxo de sincronização
1. Comprador clica "Confirmar e gerar" no wizard → server action cria N `pedidos` em transação no Supabase com `omie_status = 'pendente'`
2. Para cada pedido, enfileira job (Vercel Cron + queue, ou Supabase Edge Function, ou Trigger.dev) que:
   - Monta payload Omie a partir do pedido + itens
   - Chama `omie.criarPedidoCompra(payload)`
   - Em sucesso: atualiza pedido com `omie_codigo = retorno.codigo_pedido` e `omie_status = 'sincronizado'`. Insere `pedido_evento` tipo `omie`.
   - Em erro: `omie_status = 'erro'`, `omie_erro = mensagem`. Insere evento tipo `erro`. Retry exponencial até 3x.
3. UI mostra dot status ao lado do pedido. Botão "Sincronizar Omie" no header da tela permite retry manual.

### Cron de reconciliação
Edge Function que roda 1×/hora:
- Pega todos pedidos `omie_status = 'pendente'` ou com erro com mais de N minutos
- Reprocessa ou consulta status no Omie pra detectar pedidos criados mas não atualizados aqui

## 5. Integração Resend

### Templates React Email
`emails/cotacao.tsx`:

```tsx
import { Body, Container, Heading, Text, Link, Section, Img } from '@react-email/components';

export default function CotacaoEmail({ fornecedor, cotacao, prazo, itens }) {
  return (
    <Body style={{ fontFamily: 'sans-serif', backgroundColor: '#fafafa', padding: '32px' }}>
      <Container style={{ background: 'white', padding: 32, borderRadius: 8, maxWidth: 600 }}>
        <Img src="https://lhg.com.br/logo.png" width="80" />
        <Heading>Cotação {cotacao.numero}</Heading>
        <Text>Olá, equipe {fornecedor.nome}, ...</Text>
        {/* lista de itens, prazo, condições */}
      </Container>
    </Body>
  );
}
```

### Server action de envio
```ts
'use server';
import { Resend } from 'resend';
import CotacaoEmail from '@/emails/cotacao';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function enviarCotacao(pedidoId: string, opts: { para: string[]; cc?: string[]; assunto: string }) {
  const pedido = await getPedidoCompleto(pedidoId);
  const { data, error } = await resend.emails.send({
    from: 'LHG Compras <compras@lhgmoteis.com.br>',
    to: opts.para,
    cc: opts.cc,
    subject: opts.assunto,
    react: CotacaoEmail({ fornecedor: pedido.fornecedor, cotacao: pedido.cotacao, prazo: pedido.entrega_prev, itens: pedido.itens }),
    attachments: [{ filename: `${pedido.cotacao.numero}.pdf`, path: pedido.pdf_url }],
  });
  if (error) throw error;
  await registrarEvento(pedidoId, 'email', `Email enviado para ${opts.para.join(', ')}`);
  return data;
}
```

### Webhook de delivery/open
Configure webhook no Resend → `/api/webhooks/resend` → atualiza `pedido_eventos` com confirmação de leitura quando aplicável.

## 6. Integração OpenRouter (Chat IA)

### Setup
```ts
// lib/ai.ts
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
export const openrouter = createOpenRouter({ apiKey: process.env.OPENROUTER_KEY });
```

### Endpoint streaming
```ts
// app/api/chat/route.ts
import { streamText, convertToModelMessages } from 'ai';
import { openrouter } from '@/lib/ai';
import { buildRagContext } from '@/lib/rag';

export async function POST(req: Request) {
  const { messages, context, model = 'openai/gpt-4o' } = await req.json();
  const rag = await buildRagContext(context);  // fetches cotações/pedidos relevantes

  const result = streamText({
    model: openrouter(model),
    system: `Você é o copiloto de compras LHG. Use estritamente os dados a seguir e cite suas fontes.

DADOS DISPONÍVEIS:
${rag}

Quando referenciar uma cotação ou pedido, use o formato [COT-XXXX-YYYY] ou [PED-XXXX-YYYY] no texto. Use markdown com tabelas para comparações.`,
    messages: convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
```

### RAG
- Para perguntas amplas, busque por embeddings (pgvector) em `cotacoes`, `pedidos`, `fornecedores`
- Para perguntas com contexto fixo (cotação específica), injete os dados literais

```sql
-- pgvector setup
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE embeddings (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade     text NOT NULL,         -- 'cotacao', 'pedido', 'fornecedor'
  entidade_id  uuid NOT NULL,
  texto        text NOT NULL,
  embedding    vector(1536),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX ON embeddings USING hnsw (embedding vector_cosine_ops);
```

Pipeline: ao criar/atualizar uma cotação, gerar embedding de um resumo textual e salvar.

### Modelo padrão / variável
Tabela `app_settings`:
```sql
CREATE TABLE app_settings (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL
);
INSERT INTO app_settings VALUES ('chat_default_model', '"openai/gpt-4o"'::jsonb);
```
Admin pode trocar nas configurações.

## 7. Variáveis de ambiente

```bash
# .env.local
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # apenas server, nunca expor

OMIE_APP_KEY=
OMIE_APP_SECRET=

RESEND_API_KEY=
RESEND_WEBHOOK_SECRET=

OPENROUTER_KEY=
OPENROUTER_DEFAULT_MODEL=openai/gpt-4o

# Auth Google (configurado no Supabase Dashboard, mas redirect:)
NEXT_PUBLIC_SITE_URL=https://compras.lhgmoteis.com.br
```

## 8. Storage

Bucket Supabase Storage:
- `nfes/` — XMLs originais das NFes (privado, signed URLs)
- `cotacoes-pdf/` — PDFs gerados das cotações (privado)
- `avatars/` — fotos de usuários (público)

Policies de storage também aplicam RLS — só usuários autenticados podem baixar XMLs de pedidos da sua unidade.

## 9. Realtime (opcional)

Use Supabase Realtime para:
- Atualizar dashboards quando há novos pedidos/aprovações
- Notificar aprovadores quando algo entra na fila deles

```ts
const channel = supabase
  .channel('pedidos-changes')
  .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `aprovador_id=eq.${userId}` }, (payload) => {
    // toast
  })
  .subscribe();
```
