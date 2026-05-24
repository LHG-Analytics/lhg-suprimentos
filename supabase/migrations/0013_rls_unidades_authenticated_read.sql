-- Migration: 0013_rls_unidades_authenticated_read
-- Adiciona política SELECT que permite usuários autenticados lerem TODAS as unidades.
-- Necessário para que o servidor consiga buscar google_sheet_id independente
-- de qual unidade o usuário está associado (inclusive no modo "todas").
--
-- Contexto: a política existente "users read their units" restringe por
-- user_has_unidade(id), bloqueando a leitura de configurações globais como
-- google_sheet_id no getUnidadeSheetConfig() server-side.

CREATE POLICY "authenticated_read_all_units"
ON unidades FOR SELECT
TO authenticated
USING (true);
