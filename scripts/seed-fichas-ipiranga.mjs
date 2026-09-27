/**
 * scripts/seed-fichas-ipiranga.mjs — carga das fichas técnicas do Lush Ipiranga
 *
 * Lê a transcrição revisada (docs/fichas-tecnicas/lush-ipiranga/fichas.csv — pasta
 * gitignored, local) e grava em `estoque_itens`, `fichas_tecnicas` e
 * `ficha_tecnica_itens` SÓ para o local `lush-ipiranga`.
 *
 *   node scripts/seed-fichas-ipiranga.mjs            → DRY-RUN: só mostra o plano
 *   node scripts/seed-fichas-ipiranga.mjs --apply    → grava (idempotente: pode rodar de novo)
 *
 * Idempotência: estoque_itens por (local_id, produto_id); ficha de venda por
 * (local_id, automo_produto_id, vigencia_inicio); sub-preparo por (local_id, nome);
 * itens de cada ficha são apagados e reinseridos. Nunca toca outros locais.
 *
 * Regras vindas das decisões do Danilo (27/09/2026):
 * - status_insumo exato/aceito → estoque_item; sub_preparo → ficha filha (com receita
 *   quando existe no manual, vazia e pendente quando não); ambíguo, não casado e
 *   pendente_unidade → item PENDENTE (insumo_pendente), sem baixa e com aviso.
 * - status_casamento exato/aceito → ficha de venda; pendente_cadastro e descartada → fora.
 * - MISTO QUENTE vira 2 fichas (o Automo tem os 2 produtos); outros "OU" usam o primeiro.
 * - vigencia_inicio 2026-09-01 para todas.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), "..");
const CSV = join(RAIZ, "docs/fichas-tecnicas/lush-ipiranga/fichas.csv");
const APPLY = process.argv.includes("--apply");
const LOCAL_SLUG = "lush-ipiranga";
const VIGENCIA = "2026-09-01";
const UNIDADES = new Set(["g", "kg", "ml", "L", "un"]);

// ── env ──────────────────────────────────────────────────────────────────────
const env = {};
for (const linha of readFileSync(join(RAIZ, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim().replace(/^﻿/, "");
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  env[m[1]] = v;
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL.replace(/^﻿/, ""), env.SUPABASE_SERVICE_ROLE_KEY.replace(/^﻿/, ""), { auth: { persistSession: false } });
const falhar = (msg, err) => { console.error("ERRO:", msg, err ? JSON.stringify(err) : ""); process.exit(1); };

// ── CSV ──────────────────────────────────────────────────────────────────────
function parseCsv(texto) {
  const linhas = []; let campo = "", linha = [], aspas = false;
  const t = texto.replace(/^﻿/, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (aspas) { if (ch === '"') { if (t[i + 1] === '"') { campo += '"'; i++; } else aspas = false; } else campo += ch; }
    else if (ch === '"') aspas = true;
    else if (ch === ",") { linha.push(campo); campo = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && t[i + 1] === "\n") i++; linha.push(campo); linhas.push(linha); linha = []; campo = ""; }
    else campo += ch;
  }
  if (campo.length || linha.length) { linha.push(campo); linhas.push(linha); }
  return linhas.filter((l) => l.length > 1 || (l.length === 1 && l[0] !== ""));
}
const l = parseCsv(readFileSync(CSV, "utf8"));
const cab = l[0];
const rows = l.slice(1).map((r) => Object.fromEntries(cab.map((c, i) => [c, r[i] ?? ""])));
const num = (s) => { const v = Number(String(s ?? "").replace(",", ".")); return Number.isFinite(v) && v > 0 ? v : null; };

// ── banco: local, unidades, catálogo, estoque atual ──────────────────────────
async function todas(tabela, select, filtro = (q) => q) {
  const acc = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await filtro(sb.from(tabela).select(select).range(from, from + 999));
    if (error) falhar(`lendo ${tabela}`, error);
    acc.push(...data);
    if (data.length < 1000) break;
  }
  return acc;
}
const { data: local, error: eLocal } = await sb.from("locais_estoque").select("id, nome, slug").eq("slug", LOCAL_SLUG).single();
if (eLocal || !local) falhar("local lush-ipiranga não encontrado", eLocal);
const lu = await todas("local_unidade", "unidade_id, unidades(id, slug)", (q) => q.eq("local_id", local.id));
const unidadeIds = lu.map((r) => r.unidade_id);
const rccId = lu.find((r) => r.unidades?.slug === "lush-ipiranga")?.unidade_id;
const produtos = await todas("produtos", "id, codigo, nome, unidade_med, omie_unidade_id, ativo", (q) => q.in("omie_unidade_id", unidadeIds));
const estoqueAtual = await todas("estoque_itens", "id, produto_id, ativo, local_id", (q) => q.eq("local_id", local.id));
const locais = await todas("locais_estoque", "id, slug");
const estoqueTodos = await todas("estoque_itens", "id, local_id");
const porLocalAntes = Object.fromEntries(locais.map((x) => [x.slug, estoqueTodos.filter((e) => e.local_id === x.id).length]));

// produto por código: prefere a linha do CNPJ RCC (lush-ipiranga), senão CONCAVO
const produtoPorCodigo = new Map();
for (const p of produtos) {
  const atual = produtoPorCodigo.get(p.codigo);
  if (!atual || (p.omie_unidade_id === rccId && atual.omie_unidade_id !== rccId)) produtoPorCodigo.set(p.codigo, p);
}

// ── plano ────────────────────────────────────────────────────────────────────
const normalizar = (s) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toUpperCase().replace(/\((PROD\.|PRODU[CÇ][AÃ]O|PROD|[ÀA] PARTE|PARA FINALIZAR|CONGELADO|TA[CÇ]A)\)/g, "").replace(/\s+/g, " ").trim();
const ehProducao = (p) => p.startsWith("[PRODUÇÃO]");
const nomeProducao = (p) => p.replace(/^\[PRODUÇÃO\]\s*/, "").trim();
// unidade do lote das fichas de produção (o CSV só tem o número do rendimento)
const UNIDADE_LOTE = {
  "AÇÚCAR E CANELA - CHURROS": "kg", "CACHAÇA AZUL": "L", "CALDA DE AMORA": "L", "CARAMELO SALGADO": "kg",
  "CHÁ MATE": "L", "CREME DE ABACAXI": "L", "ESPUMA DE GENGIBRE": "L", "ESPUMA DE JAMBU": "un",
  "GELEIA DE MAÇÃ E CANELA": "L", "MOEDA DE CHOCOLATE": "un", "XAROPE DE BAUNILHA": "L", "XAROPE DE CARDAMOMO": "L", "XAROPE DE GENGIBRE": "L",
};
// ficha de produção referenciada por página ("ficha própria em DRINKS p.39")
const producaoPorPagina = new Map();
for (const r of rows) if (ehProducao(r.prato_automo)) producaoPorPagina.set(r.origem, nomeProducao(r.prato_automo));

const avisosPlano = [];
const pendentes = { ambiguo: 0, nao_casado: 0, pendente_unidade: 0, sem_quantidade: 0, sub_preparo_sem_receita: 0, ou_sem_produto: 0 };
const insumosAceitos = new Map(); // nome do insumo → produto (para resolver "OU")
for (const r of rows) if ((r.status_insumo === "exato" || r.status_insumo === "aceito") && r.lhg_codigo) {
  const p = produtoPorCodigo.get(r.lhg_codigo);
  if (p) insumosAceitos.set(r.insumo, p); else avisosPlano.push(`código ${r.lhg_codigo} (${r.insumo}) não achado no catálogo do local`);
}

// itens de uma ficha a partir das linhas do CSV
const fichasSubPreparo = new Map(); // nome normalizado → { nome, rendimento, unidade, itens, origem, pendente }
function garantirSubPreparoVazio(nomeBruto, unidadeRef) {
  const nome = normalizar(nomeBruto);
  if (!fichasSubPreparo.has(nome)) {
    fichasSubPreparo.set(nome, { nome, rendimento: 1, rendimento_unidade: UNIDADES.has(unidadeRef) ? unidadeRef : "un", origem: null, pendente: true, itens: [], obs: "PENDENTE: receita de produção não recebida (decisão c, 27/09/2026)" });
    pendentes.sub_preparo_sem_receita++;
  }
  return nome;
}
function itemDeLinha(r, contexto) {
  const quantidade = num(r.quantidade);
  const unidade = UNIDADES.has(r.unidade) ? r.unidade : null;
  const perda = num(r.perda_pct) ?? 0;
  const base = { quantidade, unidade, perda_pct: perda, obs: r.obs || null, origem: r.origem };
  const pendente = (motivo, chave) => { pendentes[chave]++; return { ...base, insumo_pendente: r.insumo, pendente_motivo: motivo }; };

  // "OU": MISTO QUENTE já foi desdobrado pelo chamador; os demais usam o primeiro
  let insumo = r.insumo;
  if (/\bOU\b/.test(insumo) && contexto.ouSubstituto) insumo = contexto.ouSubstituto;
  else if (/\bOU\b/.test(insumo)) {
    const primeiro = insumo.split(/\bOU\b/)[0].trim().replace(/\s*\(.*$/, "");
    const p = [...insumosAceitos.entries()].find(([n]) => normalizar(n) === normalizar(primeiro))?.[1];
    if (p) return { ...base, produto: p };
    return pendente(`alternativo OU: primeiro (${primeiro}) não é insumo aceito`, "ou_sem_produto");
  }

  if (r.status_insumo === "exato" || r.status_insumo === "aceito") {
    const p = insumosAceitos.get(insumo) ?? produtoPorCodigo.get(r.lhg_codigo);
    if (!p) return pendente("produto aceito não encontrado no catálogo", "nao_casado");
    if (quantidade == null || !unidade) return pendente("sem quantidade/unidade (q.b.)", "sem_quantidade");
    return { ...base, produto: p };
  }
  if (r.status_insumo === "sub_preparo") {
    const pagina = (r.obs.match(/ficha (?:própria em |CH[ÁA] MATTE em |MOEDAS DE CHOCOLATE em )?(DRINKS p\.\d+)/) ?? [])[1];
    const nomeFicha = pagina && producaoPorPagina.get(pagina) ? normalizar(producaoPorPagina.get(pagina)) : garantirSubPreparoVazio(insumo, unidade);
    if (quantidade == null || !unidade) return pendente("sub-preparo sem quantidade (q.b.)", "sem_quantidade");
    return { ...base, ficha_filha: nomeFicha };
  }
  if (r.status_insumo === "ambiguo") return pendente("ambíguo: mais de um produto candidato, decisão pendente", "ambiguo");
  if (r.status_insumo === "pendente_unidade") return pendente("sem conversão de unidade possível (porção sem peso)", "pendente_unidade");
  return pendente("sem produto no catálogo de compra pelo nome", "nao_casado");
}

// fichas de produção (13 do manual)
for (const r of rows) {
  if (!ehProducao(r.prato_automo)) continue;
  const nomeBruto = nomeProducao(r.prato_automo);
  const nome = normalizar(nomeBruto);
  if (!fichasSubPreparo.has(nome)) {
    fichasSubPreparo.set(nome, { nome, rendimento: num(r.rendimento) ?? 1, rendimento_unidade: UNIDADE_LOTE[nomeBruto] ?? "un", origem: r.origem, pendente: false, itens: [], obs: null });
    if (!UNIDADE_LOTE[nomeBruto]) avisosPlano.push(`ficha de produção sem unidade de lote mapeada: ${nomeBruto}`);
  }
  fichasSubPreparo.get(nome).itens.push(itemDeLinha(r, {}));
}

// fichas de venda
const fichasVenda = new Map(); // chave → { automo_produto_id, nome, itens, origem, obs }
const DESDOBRAR = { "MISTO QUENTE": [{ automo: 1545, nome: "MISTO QUENTE COM PRESUNTO", ou: "Presunto" }, { automo: 549, nome: "MISTO QUENTE COM PEITO DE PERU", ou: "Peito de peru" }] };
const rendimentoVenda = () => 1; // DUO DE BRUSCHETTAS diz 4 unidades = 1 pedido (2+2); todas as fichas de venda são 1 porção
let linhasIgnoradas = { pendente_cadastro: 0, descartada: 0 };
for (const r of rows) {
  if (ehProducao(r.prato_automo)) continue;
  if (r.status_casamento === "pendente_cadastro") { linhasIgnoradas.pendente_cadastro++; continue; }
  if (r.status_casamento === "descartada") { linhasIgnoradas.descartada++; continue; }
  if (r.status_casamento !== "exato" && r.status_casamento !== "aceito") { avisosPlano.push(`status inesperado ${r.status_casamento} em ${r.prato_automo}`); continue; }
  const variantes = DESDOBRAR[r.prato_automo] ?? [{ automo: Number(r.automo_id), nome: r.automo_nome, ou: null }];
  for (const v of variantes) {
    const chave = `${v.automo}`;
    if (!fichasVenda.has(chave)) fichasVenda.set(chave, { automo_produto_id: v.automo, nome: v.nome, itens: [], origem: r.origem, obs: v.ou ? `desdobrada de ${r.prato_automo} (alternativo OU)` : null, rendimento: rendimentoVenda() });
    fichasVenda.get(chave).itens.push(itemDeLinha(r, { ouSubstituto: v.ou && /\bOU\b/.test(r.insumo) ? v.ou : null }));
  }
}

// estoque_itens novos = produtos usados por algum item, ainda sem estoque_item no local
const produtosUsados = new Map();
for (const f of [...fichasVenda.values(), ...fichasSubPreparo.values()]) for (const it of f.itens) if (it.produto) produtosUsados.set(it.produto.id, it.produto);
const jaNoEstoque = new Set(estoqueAtual.map((e) => e.produto_id));
const estoqueNovos = [...produtosUsados.values()].filter((p) => !jaNoEstoque.has(p.id));

const todosItens = [...fichasVenda.values(), ...fichasSubPreparo.values()].flatMap((f) => f.itens);
const resumo = {
  modo: APPLY ? "APPLY" : "DRY-RUN",
  local: `${local.nome} (${local.slug}, ${local.id})`,
  unidades_fiscais_do_local: lu.map((r) => r.unidades?.slug),
  estoque_itens_novos: estoqueNovos.length,
  estoque_itens_ja_existentes_usados: [...produtosUsados.keys()].filter((id) => jaNoEstoque.has(id)).length,
  fichas_venda: fichasVenda.size,
  fichas_sub_preparo_com_receita: [...fichasSubPreparo.values()].filter((f) => !f.pendente).length,
  fichas_sub_preparo_vazias_pendentes: [...fichasSubPreparo.values()].filter((f) => f.pendente).length,
  itens_total: todosItens.length,
  itens_com_estoque_item: todosItens.filter((i) => i.produto).length,
  itens_com_ficha_filha: todosItens.filter((i) => i.ficha_filha).length,
  itens_pendentes: todosItens.filter((i) => i.insumo_pendente).length,
  itens_pendentes_por_motivo: pendentes,
  linhas_ignoradas: linhasIgnoradas,
  estoque_itens_por_local_antes: porLocalAntes,
  toca_outros_locais: false,
  avisos_plano: avisosPlano,
};

if (!APPLY) { console.log(JSON.stringify(resumo, null, 1)); process.exit(0); }

// ── APPLY ────────────────────────────────────────────────────────────────────
// 1) estoque_itens (só produto_id + local_id; fator 1, sem vínculo Automo)
if (estoqueNovos.length) {
  const { error } = await sb.from("estoque_itens").upsert(estoqueNovos.map((p) => ({ local_id: local.id, produto_id: p.id, fator_conversao: 1, estoque_ideal: 0, ativo: true })), { onConflict: "local_id,produto_id", ignoreDuplicates: false });
  if (error) falhar("upsert estoque_itens", error);
}
const estoqueDepois = await todas("estoque_itens", "id, produto_id", (q) => q.eq("local_id", local.id));
const estoquePorProduto = new Map(estoqueDepois.map((e) => [e.produto_id, e.id]));

// 2) fichas (venda e sub-preparo): select-then-insert/update por chave natural
async function garantirFicha({ tipo, automo_produto_id, nome, rendimento, rendimento_unidade, origem, obs }) {
  let q = sb.from("fichas_tecnicas").select("id").eq("local_id", local.id).eq("tipo", tipo);
  q = tipo === "venda" ? q.eq("automo_produto_id", automo_produto_id).eq("vigencia_inicio", VIGENCIA) : q.eq("nome", nome);
  const { data: ex, error: e1 } = await q.maybeSingle();
  if (e1) falhar(`lendo ficha ${nome}`, e1);
  const payload = { local_id: local.id, tipo, automo_produto_id: automo_produto_id ?? null, nome, rendimento, rendimento_unidade, vigencia_inicio: VIGENCIA, origem, obs, ativo: true, updated_at: new Date().toISOString() };
  if (ex) { const { error } = await sb.from("fichas_tecnicas").update(payload).eq("id", ex.id); if (error) falhar(`update ficha ${nome}`, error); return ex.id; }
  const { data, error } = await sb.from("fichas_tecnicas").insert(payload).select("id").single();
  if (error) falhar(`insert ficha ${nome}`, error);
  return data.id;
}
const idSub = new Map();
for (const f of fichasSubPreparo.values()) idSub.set(f.nome, await garantirFicha({ tipo: "sub_preparo", automo_produto_id: null, nome: f.nome, rendimento: f.rendimento, rendimento_unidade: f.rendimento_unidade, origem: f.origem, obs: f.obs }));
const idVenda = new Map();
for (const f of fichasVenda.values()) idVenda.set(f.automo_produto_id, await garantirFicha({ tipo: "venda", automo_produto_id: f.automo_produto_id, nome: f.nome, rendimento: f.rendimento, rendimento_unidade: "un", origem: f.origem, obs: f.obs }));

// 3) itens: apaga e reinsere por ficha
async function gravarItens(fichaId, itens) {
  const { error: eDel } = await sb.from("ficha_tecnica_itens").delete().eq("ficha_id", fichaId);
  if (eDel) falhar(`limpando itens da ficha ${fichaId}`, eDel);
  if (!itens.length) return;
  const payload = itens.map((it, ordem) => ({
    ficha_id: fichaId, ordem,
    estoque_item_id: it.produto ? (estoquePorProduto.get(it.produto.id) ?? null) : null,
    ficha_filha_id: it.ficha_filha ? (idSub.get(it.ficha_filha) ?? null) : null,
    insumo_pendente: it.insumo_pendente ?? null, pendente_motivo: it.pendente_motivo ?? null,
    quantidade: it.quantidade, unidade: it.unidade, perda_pct: it.perda_pct, obs: [it.origem, it.obs].filter(Boolean).join(" · "),
  }));
  for (const p of payload) if (!p.estoque_item_id && !p.ficha_filha_id && !p.insumo_pendente) falhar(`item sem destino na ficha ${fichaId}`, p);
  const { error } = await sb.from("ficha_tecnica_itens").insert(payload);
  if (error) falhar(`inserindo itens da ficha ${fichaId}`, error);
}
for (const f of fichasSubPreparo.values()) await gravarItens(idSub.get(f.nome), f.itens);
for (const f of fichasVenda.values()) await gravarItens(idVenda.get(f.automo_produto_id), f.itens);

// 4) conferência
const cont = async (tabela, filtro) => { const { count, error } = await filtro(sb.from(tabela).select("*", { count: "exact", head: true })); if (error) falhar(`contando ${tabela}`, error); return count; };
const fichasPorLocal = {};
for (const x of locais) fichasPorLocal[x.slug] = await cont("fichas_tecnicas", (q) => q.eq("local_id", x.id));
const estoquePorLocalDepois = {};
for (const x of locais) estoquePorLocalDepois[x.slug] = await cont("estoque_itens", (q) => q.eq("local_id", x.id));
const idsFichas = [...idSub.values(), ...idVenda.values()];
let itensGravados = 0;
for (let i = 0; i < idsFichas.length; i += 100) itensGravados += await cont("ficha_tecnica_itens", (q) => q.in("ficha_id", idsFichas.slice(i, i + 100)));
console.log(JSON.stringify({ ...resumo, gravado: { fichas_por_local: fichasPorLocal, estoque_itens_por_local_depois: estoquePorLocalDepois, itens_de_ficha_gravados: itensGravados, fichas_venda_gravadas: idVenda.size, fichas_sub_preparo_gravadas: idSub.size } }, null, 1));
