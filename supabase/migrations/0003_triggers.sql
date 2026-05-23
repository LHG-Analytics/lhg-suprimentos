-- =============================================================================
-- LHG Suprimentos — Migration 0003: Triggers e funções automáticas
-- =============================================================================

-- ─── updated_at automático ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_requisicoes_updated_at
  BEFORE UPDATE ON requisicoes
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ─── Auto-numeração: REQ-YYYY-NNNN ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gerar_numero_requisicao()
RETURNS trigger AS $$
DECLARE
  ano  text := to_char(now(), 'YYYY');
  prox int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(numero FROM 10)::int), 0) + 1
  INTO prox
  FROM public.requisicoes
  WHERE numero LIKE 'REQ-' || ano || '-%';

  NEW.numero := 'REQ-' || ano || '-' || LPAD(prox::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_numero_requisicao
  BEFORE INSERT ON requisicoes
  FOR EACH ROW
  WHEN (NEW.numero IS NULL OR NEW.numero = '')
  EXECUTE FUNCTION gerar_numero_requisicao();

-- ─── Auto-numeração: COT-YYYY-NNNN ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gerar_numero_cotacao()
RETURNS trigger AS $$
DECLARE
  ano  text := to_char(now(), 'YYYY');
  prox int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(numero FROM 10)::int), 0) + 1
  INTO prox
  FROM public.cotacoes
  WHERE numero LIKE 'COT-' || ano || '-%';

  NEW.numero := 'COT-' || ano || '-' || LPAD(prox::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_numero_cotacao
  BEFORE INSERT ON cotacoes
  FOR EACH ROW
  WHEN (NEW.numero IS NULL OR NEW.numero = '')
  EXECUTE FUNCTION gerar_numero_cotacao();

-- ─── Auto-numeração: PED-YYYY-NNNN ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.gerar_numero_pedido()
RETURNS trigger AS $$
DECLARE
  ano  text := to_char(now(), 'YYYY');
  prox int;
BEGIN
  SELECT COALESCE(MAX(SUBSTRING(numero FROM 10)::int), 0) + 1
  INTO prox
  FROM public.pedidos
  WHERE numero LIKE 'PED-' || ano || '-%';

  NEW.numero := 'PED-' || ano || '-' || LPAD(prox::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_numero_pedido
  BEFORE INSERT ON pedidos
  FOR EACH ROW
  WHEN (NEW.numero IS NULL OR NEW.numero = '')
  EXECUTE FUNCTION gerar_numero_pedido();

-- ─── User profile automático ao criar auth.users ─────────────────────────────
-- Cria um registro mínimo em user_profiles quando um usuário se registra
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.user_profiles (id, nome, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    NEW.email,
    'solicitante'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ─── Audit log automático para pedidos ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_pedido_change()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.audit_log (user_id, acao, entidade, entidade_id, diff)
  VALUES (
    auth.uid(),
    CASE
      WHEN TG_OP = 'INSERT' THEN 'pedido.criado'
      WHEN TG_OP = 'UPDATE' THEN 'pedido.atualizado'
      ELSE 'pedido.removido'
    END,
    'pedido',
    COALESCE(NEW.id, OLD.id),
    jsonb_build_object(
      'old', CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
      'new', CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_pedidos
  AFTER INSERT OR UPDATE OR DELETE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION public.log_pedido_change();

-- ─── Evento automático ao criar pedido ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pedido_evento_criado()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.pedido_eventos (pedido_id, tipo, texto, autor_nome)
  VALUES (NEW.id, 'criado', 'Pedido criado', 'Sistema');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_pedido_evento_criado
  AFTER INSERT ON pedidos
  FOR EACH ROW EXECUTE FUNCTION public.pedido_evento_criado();
