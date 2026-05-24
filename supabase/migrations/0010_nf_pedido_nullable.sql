-- migration 0010 — notas_fiscais.pedido_id nullable
-- NFs podem ser registradas sem vínculo a um pedido de compra.

ALTER TABLE notas_fiscais
  ALTER COLUMN pedido_id DROP NOT NULL;
