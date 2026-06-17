-- 0024_ativar_altana.sql
-- Libera a unidade Altana para uso interno (requisição, cotação, pedido).
-- Continua sem credenciais Omie — o envio ao Omie permanece indisponível
-- até as credenciais serem cadastradas, mas todo o fluxo interno funciona.

UPDATE unidades SET ativa = true WHERE slug = 'altana';
