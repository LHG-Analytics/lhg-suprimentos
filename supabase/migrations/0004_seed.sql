-- =============================================================================
-- LHG Suprimentos — Migration 0004: Seed inicial
-- =============================================================================

-- ─── app_settings ─────────────────────────────────────────────────────────────
INSERT INTO app_settings (chave, valor) VALUES
  ('chat_default_model',  '"openai/gpt-4o"'),
  ('chat_max_tokens',     '4096'),
  ('cotacao_prazo_dias',  '7'),
  ('omie_sync_enabled',   'false'),
  ('resend_from_email',   '"compras@lhgmoteis.com.br"')
ON CONFLICT (chave) DO NOTHING;

-- ─── Unidades da Rede LHG ─────────────────────────────────────────────────────
-- Cores alinhadas com as do protótipo (tailwind → hex aproximado)
INSERT INTO unidades (slug, nome, cidade, uf, cor_hex, ativa) VALUES
  ('lush-ipiranga',    'Lush Ipiranga',     'São Paulo',  'SP', '#047857', true),  -- emerald-800
  ('lush-vila-mariana','Lush Vila Mariana',  'São Paulo',  'SP', '#065f46', true),  -- emerald-900
  ('lush-moema',       'Lush Moema',         'São Paulo',  'SP', '#0f766e', true),  -- teal-700
  ('lush-santo-amaro', 'Lush Santo Amaro',   'São Paulo',  'SP', '#0e7490', true),  -- cyan-700
  ('lush-tatuape',     'Lush Tatuapé',       'São Paulo',  'SP', '#0369a1', true),  -- sky-700
  ('lush-guarulhos',   'Lush Guarulhos',     'Guarulhos',  'SP', '#4338ca', true)   -- indigo-700
ON CONFLICT (slug) DO NOTHING;

-- ─── Produtos / Catálogo inicial ──────────────────────────────────────────────
-- Baseado nos dados do protótipo (mock.jsx)

-- Amenities
INSERT INTO produtos (codigo, nome, unidade_med, categoria, ativo) VALUES
  ('AME-001', 'Kit amenities premium (shampoo + condicionador + sabonete)', 'kit',   'Amenities', true),
  ('AME-002', 'Toalha facial branca 100% algodão 30x50cm 380g',             'un',    'Amenities', true),
  ('AME-003', 'Sabonete líquido refil 5L',                                  'galão', 'Amenities', true),
  ('AME-004', 'Touca de banho descartável (cx 100un)',                      'cx',    'Amenities', true)
ON CONFLICT (codigo) DO NOTHING;

-- Enxoval
INSERT INTO produtos (codigo, nome, unidade_med, categoria, ativo) VALUES
  ('ENX-101', 'Lençol queen size 250 fios percal branco',   'un', 'Enxoval', true),
  ('ENX-102', 'Fronha 50x70cm 250 fios',                    'un', 'Enxoval', true),
  ('ENX-103', 'Toalha banhão felpa 70x140cm 480g',          'un', 'Enxoval', true),
  ('ENX-104', 'Roupão felpa M/G unissex',                   'un', 'Enxoval', true)
ON CONFLICT (codigo) DO NOTHING;

-- Limpeza
INSERT INTO produtos (codigo, nome, unidade_med, categoria, ativo) VALUES
  ('LMP-201', 'Detergente desinfetante concentrado 5L',          'galão', 'Limpeza', true),
  ('LMP-202', 'Álcool isopropílico 5L',                          'galão', 'Limpeza', true),
  ('LMP-203', 'Saco de lixo 100L preto reforçado (pct 100un)',   'pct',   'Limpeza', true)
ON CONFLICT (codigo) DO NOTHING;

-- Frigobar
INSERT INTO produtos (codigo, nome, unidade_med, categoria, ativo) VALUES
  ('FRG-301', 'Água mineral sem gás 500ml (fardo 12un)',  'fardo', 'Frigobar', true),
  ('FRG-302', 'Energético 269ml (fardo 24un)',            'fardo', 'Frigobar', true)
ON CONFLICT (codigo) DO NOTHING;

-- Manutenção / MRO
INSERT INTO produtos (codigo, nome, unidade_med, categoria, ativo) VALUES
  ('MRO-401', 'Lâmpada LED 9W bivolt branca quente',  'un', 'Manutenção', true),
  ('MRO-402', 'Resistência ducha 5500W 220V',          'un', 'Manutenção', true)
ON CONFLICT (codigo) DO NOTHING;
