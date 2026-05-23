-- =============================================================================
-- LHG Suprimentos — Migration 0002: Row Level Security
-- =============================================================================

-- ─── Habilitar RLS em todas as tabelas ───────────────────────────────────────
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
ALTER TABLE app_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE embeddings           ENABLE ROW LEVEL SECURITY;

-- ─── Helper functions (SECURITY DEFINER — bypass RLS internamente) ───────────
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_has_unidade(p_unidade uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_unidades
    WHERE user_id = auth.uid() AND unidade_id = p_unidade
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.user_unidades_ids()
RETURNS uuid[] AS $$
  SELECT array_agg(unidade_id) FROM public.user_unidades WHERE user_id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- ─── user_profiles ────────────────────────────────────────────────────────────
-- Cada usuário vê e edita apenas o seu; admin vê e gerencia todos
CREATE POLICY "users read own profile" ON user_profiles
  FOR SELECT USING (id = auth.uid() OR current_user_role() = 'admin');

CREATE POLICY "users update own profile" ON user_profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE POLICY "admin manages profiles" ON user_profiles
  FOR ALL USING (current_user_role() = 'admin');

-- ─── user_unidades ────────────────────────────────────────────────────────────
CREATE POLICY "users read own unidades" ON user_unidades
  FOR SELECT USING (user_id = auth.uid() OR current_user_role() = 'admin');

CREATE POLICY "admin manages user_unidades" ON user_unidades
  FOR ALL USING (current_user_role() = 'admin');

-- ─── unidades ─────────────────────────────────────────────────────────────────
CREATE POLICY "users read their units" ON unidades
  FOR SELECT USING (
    user_has_unidade(id) OR current_user_role() IN ('admin', 'comprador')
  );

CREATE POLICY "admin manages units" ON unidades
  FOR ALL USING (current_user_role() = 'admin');

-- ─── fornecedores ─────────────────────────────────────────────────────────────
-- Todos os autenticados leem; comprador e admin escrevem
CREATE POLICY "authenticated read fornecedores" ON fornecedores
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "comprador admin write fornecedores" ON fornecedores
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

-- ─── produtos ─────────────────────────────────────────────────────────────────
CREATE POLICY "authenticated read produtos" ON produtos
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "comprador admin write produtos" ON produtos
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

-- ─── requisicoes ──────────────────────────────────────────────────────────────
-- Solicitante vê as suas + as da sua unidade; comprador/admin/aprovador veem tudo
CREATE POLICY "users read requisicoes" ON requisicoes
  FOR SELECT USING (
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

CREATE POLICY "owner or comprador updates requisicoes" ON requisicoes
  FOR UPDATE USING (
    solicitante_id = auth.uid() OR current_user_role() IN ('comprador', 'admin')
  );

CREATE POLICY "comprador admin delete requisicoes" ON requisicoes
  FOR DELETE USING (current_user_role() IN ('comprador', 'admin'));

-- ─── requisicao_unidades ──────────────────────────────────────────────────────
CREATE POLICY "users read req_unidades" ON requisicao_unidades
  FOR SELECT USING (
    user_has_unidade(unidade_id)
    OR current_user_role() IN ('comprador', 'admin', 'aprovador')
  );

CREATE POLICY "owner or comprador write req_unidades" ON requisicao_unidades
  FOR ALL USING (current_user_role() IN ('comprador', 'admin', 'solicitante'));

-- ─── requisicao_itens ─────────────────────────────────────────────────────────
CREATE POLICY "users read req_itens" ON requisicao_itens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM requisicoes r WHERE r.id = requisicao_itens.requisicao_id
        AND (
          r.solicitante_id = auth.uid()
          OR current_user_role() IN ('comprador', 'admin', 'aprovador')
        )
    )
  );

CREATE POLICY "owner or comprador write req_itens" ON requisicao_itens
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM requisicoes r WHERE r.id = requisicao_itens.requisicao_id
        AND (r.solicitante_id = auth.uid() OR current_user_role() IN ('comprador', 'admin'))
    )
  );

-- ─── cotacoes ─────────────────────────────────────────────────────────────────
CREATE POLICY "users read cotacoes" ON cotacoes
  FOR SELECT USING (
    current_user_role() IN ('comprador', 'admin', 'aprovador')
    OR EXISTS (
      SELECT 1 FROM cotacao_unidades cu
      WHERE cu.cotacao_id = cotacoes.id AND user_has_unidade(cu.unidade_id)
    )
  );

CREATE POLICY "comprador admin write cotacoes" ON cotacoes
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

-- ─── cotacao_unidades / cotacao_itens / cotacao_fornecedores / cotacao_matriz ─
CREATE POLICY "users read cotacao_unidades" ON cotacao_unidades
  FOR SELECT USING (
    user_has_unidade(unidade_id) OR current_user_role() IN ('comprador', 'admin', 'aprovador')
  );

CREATE POLICY "comprador admin write cotacao_unidades" ON cotacao_unidades
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

CREATE POLICY "users read cotacao_itens" ON cotacao_itens
  FOR SELECT USING (
    current_user_role() IN ('comprador', 'admin', 'aprovador')
    OR EXISTS (
      SELECT 1 FROM cotacoes c
      JOIN cotacao_unidades cu ON cu.cotacao_id = c.id
      WHERE c.id = cotacao_itens.cotacao_id AND user_has_unidade(cu.unidade_id)
    )
  );

CREATE POLICY "comprador admin write cotacao_itens" ON cotacao_itens
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

CREATE POLICY "authenticated read cotacao_fornecedores" ON cotacao_fornecedores
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "comprador admin write cotacao_fornecedores" ON cotacao_fornecedores
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

CREATE POLICY "users read cotacao_matriz" ON cotacao_matriz
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "comprador admin write cotacao_matriz" ON cotacao_matriz
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

-- ─── pedidos ──────────────────────────────────────────────────────────────────
CREATE POLICY "users read pedidos" ON pedidos
  FOR SELECT USING (
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

-- ─── pedido_unidades / pedido_itens / pedido_eventos ─────────────────────────
CREATE POLICY "users read pedido_unidades" ON pedido_unidades
  FOR SELECT USING (
    user_has_unidade(unidade_id) OR current_user_role() IN ('comprador', 'admin', 'aprovador')
  );

CREATE POLICY "comprador admin write pedido_unidades" ON pedido_unidades
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

CREATE POLICY "users read pedido_itens" ON pedido_itens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM pedidos p WHERE p.id = pedido_itens.pedido_id
        AND (
          current_user_role() IN ('comprador', 'admin')
          OR p.aprovador_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM pedido_unidades pu
            WHERE pu.pedido_id = p.id AND user_has_unidade(pu.unidade_id)
          )
        )
    )
  );

CREATE POLICY "comprador admin write pedido_itens" ON pedido_itens
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

CREATE POLICY "users read pedido_eventos" ON pedido_eventos
  FOR SELECT USING (
    current_user_role() IN ('comprador', 'admin', 'aprovador')
    OR autor_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM pedidos p
      JOIN pedido_unidades pu ON pu.pedido_id = p.id
      WHERE p.id = pedido_eventos.pedido_id AND user_has_unidade(pu.unidade_id)
    )
  );

CREATE POLICY "comprador admin write pedido_eventos" ON pedido_eventos
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

-- ─── notas_fiscais / nf_itens ─────────────────────────────────────────────────
CREATE POLICY "users read notas_fiscais" ON notas_fiscais
  FOR SELECT USING (
    current_user_role() IN ('comprador', 'admin')
    OR EXISTS (
      SELECT 1 FROM pedidos p
      JOIN pedido_unidades pu ON pu.pedido_id = p.id
      WHERE p.id = notas_fiscais.pedido_id AND user_has_unidade(pu.unidade_id)
    )
  );

CREATE POLICY "solicitante inserts own nf" ON notas_fiscais
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM pedidos p
      JOIN pedido_unidades pu ON pu.pedido_id = p.id
      WHERE p.id = notas_fiscais.pedido_id AND user_has_unidade(pu.unidade_id)
    )
  );

CREATE POLICY "comprador admin write notas_fiscais" ON notas_fiscais
  FOR ALL USING (current_user_role() IN ('comprador', 'admin'));

CREATE POLICY "users read nf_itens" ON nf_itens
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM notas_fiscais nf WHERE nf.id = nf_itens.nf_id
        AND (
          current_user_role() IN ('comprador', 'admin')
          OR EXISTS (
            SELECT 1 FROM pedidos p
            JOIN pedido_unidades pu ON pu.pedido_id = p.id
            WHERE p.id = nf.pedido_id AND user_has_unidade(pu.unidade_id)
          )
        )
    )
  );

CREATE POLICY "write nf_itens" ON nf_itens
  FOR ALL USING (current_user_role() IN ('comprador', 'admin', 'solicitante'));

-- ─── regras_aprovacao ─────────────────────────────────────────────────────────
CREATE POLICY "authenticated read regras" ON regras_aprovacao
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin manages regras" ON regras_aprovacao
  FOR ALL USING (current_user_role() = 'admin');

-- ─── audit_log ────────────────────────────────────────────────────────────────
-- Ninguém escreve direto — apenas via trigger ou service-role
CREATE POLICY "authenticated read audit" ON audit_log
  FOR SELECT USING (
    current_user_role() IN ('admin', 'comprador') OR user_id = auth.uid()
  );

-- ─── app_settings ─────────────────────────────────────────────────────────────
CREATE POLICY "authenticated read settings" ON app_settings
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "admin write settings" ON app_settings
  FOR ALL USING (current_user_role() = 'admin');

-- ─── embeddings ───────────────────────────────────────────────────────────────
-- Apenas comprador/admin/sistema acessam
CREATE POLICY "comprador admin read embeddings" ON embeddings
  FOR SELECT USING (current_user_role() IN ('comprador', 'admin'));
