"use client";

/**
 * nf-client.tsx — LHG-216/217 v2
 * Entrada de NF via número → consulta Omie → classificação por Família de Produto.
 * Remove o fluxo de upload de XML.
 */
import { useState, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ReceiptText, Search, Loader2, X, ChevronDown,
  CheckCircle2, AlertTriangle, Sparkles, Package,
  ArrowRight, Check, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { registrarNF, lancarNFOmie, concluirRecebimentoOmie } from "../actions";

// ── Famílias Omie ─────────────────────────────────────────────────────────────
// Valores brutos como cadastrados no Omie ERP (migration 0006).

const FAMILIAS_OMIE = [
  // Alimentos
  "ACOMPANHAMENTOS","ADICIONAIS","AVES","CARNES BOVINAS","CONGELADOS",
  "DOCES E CHOCOLATES","EMBUTIDOS E FRIOS","ENTRADAS","ESTOQUE SECO",
  "HORTIFRUTI","LANCHES","LATICINIOS","MENU DE VERAO","PAES",
  "PESCADOS E FRUTOS DO MAR","PETISCOS","PRATOS PRINCIPAIS",
  "SOBREMESAS","SORVETES",
  // Bebidas Alcoólicas
  "BEBIDAS INSUMO","CERVEJAS","COQUETEIS","DESTILADOS","DOSES",
  "VINHOS E ESPUMANTES",
  // Bebidas Não-Alcoólicas
  "CAFE DA MANHA E CHA","SOFT DRINK",
  // Amenities
  "BOMBONIERE","CORTESIAS","SACHES",
  // Outros
  "BRINDES E PRESENTES","CAUCAO","COLABORADORES","CONVENIENCIA",
  "ITENS EXTRAS","PRODUTOS EROTICOS","RESERVAS","SERVICOS",
  "TABACARIA","TAXAS DE REEMBOLSOS",
] as const;

type FamiliaOmie = (typeof FAMILIAS_OMIE)[number] | string;

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface OmieNFCabecalho {
  omie_cod_nf:   number;
  numero:        string;
  serie:         string;
  data_emissao:  string;
  fornecedor_id: number;
  razao_social:  string | null;
  cnpj:          string | null;
  valor_total:   number;
  chave_acesso:  string | null;
}

interface OmieNFItem {
  n_item:       number;
  codigo:       string;
  descricao:    string;
  unidade:      string;
  qtd:          number;
  preco_unit:   number;
  valor_total:  number;
  familia_omie: FamiliaOmie | null; // pré-fill do Omie
}

interface OmieNFData {
  unidade_id:   string;
  unidade_nome: string;
  cabecalho:    OmieNFCabecalho;
  itens:        OmieNFItem[];
}

interface NotaFiscal {
  id: string;
  numero: string | null;
  omie_num_nf: string | null;
  serie: string | null;
  emissao: string | null;
  valor_total: number | null;
  status: string;
  lancada_no_omie: boolean | null;
  lancada_em: string | null;
  omie_receb_id: number | null;
  omie_concluido: boolean | null;
  created_at: string;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
  pedidos: { numero: string } | null;
  nf_itens: Array<{
    id: string;
    descricao_omie: string | null;
    familia_omie: string | null;
    qtd_nf: number | null;
    preco_nf: number | null;
  }>;
}

interface Props {
  notas: NotaFiscal[];
  unidades: Array<{ id: string; nome: string; slug: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBRL(v: number | null) {
  if (v === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(iso: string) {
  const str = iso.includes("T") ? iso : `${iso}T12:00:00`;
  return new Date(str).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}

// ── Select de Família ─────────────────────────────────────────────────────────

function FamiliaSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={cn(
          "w-full appearance-none rounded-lg border px-3 py-1.5 pr-7",
          "text-[12px] font-medium bg-muted transition-colors",
          "focus:outline-none focus:ring-1 focus:ring-border",
          value
            ? "border-emerald-700/60 text-emerald-300"
            : "border-border text-muted-foreground",
        )}
      >
        <option value="">Selecione a família…</option>
        {FAMILIAS_OMIE.map(f => (
          <option key={f} value={f}>{f}</option>
        ))}
      </select>
      <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
    </div>
  );
}

// ── Painel de busca + confirmação ─────────────────────────────────────────────

function PainelEntradaNF({
  unidades,
  onRegistrada,
}: {
  unidades: Props["unidades"];
  onRegistrada: () => void;
}) {
  const [numeroBusca, setNumeroBusca] = useState("");
  const [unidadeId, setUnidadeId]     = useState(unidades[0]?.id ?? "");
  const [buscando, setBuscando]       = useState(false);
  const [nfData, setNfData]           = useState<OmieNFData | null>(null);
  const [erroOmie, setErroOmie]       = useState("");
  const [familias, setFamilias]       = useState<Record<number, string>>({});
  const [pending, start]              = useTransition();

  const todosSelecionados = nfData
    ? nfData.itens.every(i => (familias[i.n_item] ?? i.familia_omie ?? "").length > 0)
    : false;

  const buscarNF = useCallback(async () => {
    if (!numeroBusca.trim()) return;
    setBuscando(true);
    setErroOmie("");
    setNfData(null);
    setFamilias({});

    try {
      const params = new URLSearchParams({ numero: numeroBusca.trim() });
      if (unidadeId) params.set("unidade_id", unidadeId);

      const res = await fetch(`/api/omie/buscar-nf?${params}`);
      const json = await res.json();

      if (!res.ok) {
        setErroOmie(json.error ?? "Erro ao buscar no Omie");
        return;
      }

      const data = json as OmieNFData;
      setNfData(data);
      // Pré-preencher famílias que o Omie já retornou
      const pre: Record<number, string> = {};
      data.itens.forEach(i => {
        if (i.familia_omie) pre[i.n_item] = i.familia_omie;
      });
      setFamilias(pre);
    } catch {
      setErroOmie("Falha de conexão ao buscar no Omie");
    } finally {
      setBuscando(false);
    }
  }, [numeroBusca, unidadeId]);

  function handleRegistrar() {
    if (!nfData) return;
    start(async () => {
      try {
        await registrarNF({
          unidade_id:   nfData.unidade_id,
          chave_acesso: nfData.cabecalho.chave_acesso ?? undefined,
          numero:       nfData.cabecalho.numero,
          omie_num_nf:  nfData.cabecalho.numero,
          serie:        nfData.cabecalho.serie,
          emissao:      nfData.cabecalho.data_emissao,
          valor_total:  nfData.cabecalho.valor_total,
          itens: nfData.itens.map(i => ({
            descricao_omie: i.descricao,
            familia_omie:   familias[i.n_item] ?? i.familia_omie ?? null,
            qtd_nf:         i.qtd,
            preco_nf:       i.preco_unit,
            divergencia:    "ok" as const,
          })),
        });
        toast.success(`NF ${nfData.cabecalho.numero} registrada com sucesso`);
        setNfData(null);
        setNumeroBusca("");
        setFamilias({});
        onRegistrada();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao registrar NF");
      }
    });
  }

  return (
    <div className="space-y-4">
      {/* Barra de busca */}
      <div className="rounded-xl border border-border/80 bg-muted/40 p-4">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60 mb-3 font-medium">
          Consultar NF no Omie
        </div>

        <div className="flex items-center gap-2">
          {/* Unidade */}
          {unidades.length > 1 && (
            <div className="relative shrink-0">
              <select
                value={unidadeId}
                onChange={e => setUnidadeId(e.target.value)}
                className="appearance-none rounded-lg border border-border bg-muted px-3 py-2.5 pr-7 text-sm text-foreground/80 focus:outline-none focus:ring-1 focus:ring-border"
              >
                {unidades.map(u => (
                  <option key={u.id} value={u.id}>{u.nome}</option>
                ))}
              </select>
              <ChevronDown size={11} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            </div>
          )}

          {/* Input número */}
          <input
            type="text"
            value={numeroBusca}
            onChange={e => setNumeroBusca(e.target.value)}
            onKeyDown={e => e.key === "Enter" && buscarNF()}
            placeholder="Número da NF (ex: 12345)"
            className="flex-1 rounded-lg border border-border bg-muted px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border font-mono"
          />

          <button
            onClick={buscarNF}
            disabled={buscando || !numeroBusca.trim()}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors",
              "border border-sky-700/60 bg-sky-500/10 text-sky-400",
              "hover:bg-sky-500/20 disabled:opacity-40 disabled:cursor-not-allowed",
            )}
          >
            {buscando
              ? <><Loader2 size={13} className="animate-spin" /> Buscando…</>
              : <><Search size={13} /> Buscar no Omie</>
            }
          </button>
        </div>

        {/* Erro */}
        {erroOmie && (
          <div className="mt-3 flex items-center gap-2 rounded-lg border border-red-700/40 bg-red-500/[0.06] px-3 py-2 text-[12px] text-red-400">
            <AlertTriangle size={12} className="shrink-0" />
            {erroOmie}
          </div>
        )}
      </div>

      {/* Resultado */}
      {nfData && (
        <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
          {/* Cabeçalho da NF */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-border/60 bg-muted/60">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
              <div>
                <div className="text-sm font-semibold text-foreground">
                  NF-e {nfData.cabecalho.numero} · Série {nfData.cabecalho.serie}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {nfData.cabecalho.razao_social ?? `CNPJ ${nfData.cabecalho.cnpj ?? "—"}`}
                  {" · "}Emissão: {nfData.cabecalho.data_emissao}
                  {" · "}{nfData.unidade_nome}
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="font-mono text-lg font-bold text-foreground">
                {formatBRL(nfData.cabecalho.valor_total)}
              </div>
              <div className="text-[11px] text-muted-foreground/60">{nfData.itens.length} iten{nfData.itens.length !== 1 ? "s" : ""}</div>
            </div>
          </div>

          {/* Tabela de itens com seleção de família */}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border/60">
                  <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground/60">Produto (Omie)</th>
                  <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60">Qtd</th>
                  <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60">Valor Unit.</th>
                  <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60">Total</th>
                  <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground/60 w-[220px]">
                    Família de Produto
                    <span className="ml-1 text-red-400">*</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {nfData.itens.map(item => (
                  <tr key={item.n_item} className="border-b border-border/40 last:border-0 hover:bg-muted/40 transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="text-sm text-foreground truncate max-w-[260px]">{item.descricao}</div>
                      <div className="text-[10px] text-muted-foreground/60 font-mono">{item.codigo} · {item.unidade}</div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-mono text-foreground/80">
                      {item.qtd}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-mono text-foreground/80">
                      {formatBRL(item.preco_unit)}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-mono font-semibold text-foreground">
                      {formatBRL(item.valor_total)}
                    </td>
                    <td className="px-4 py-2.5">
                      <FamiliaSelect
                        value={familias[item.n_item] ?? item.familia_omie ?? ""}
                        onChange={v => setFamilias(prev => ({ ...prev, [item.n_item]: v }))}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-border/60 bg-muted/40">
            <div className="text-[12px] text-muted-foreground">
              {todosSelecionados
                ? <span className="text-emerald-400 flex items-center gap-1"><Check size={12} /> Todas as famílias selecionadas</span>
                : <span className="text-amber-400">Selecione a família de todos os itens para continuar</span>
              }
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setNfData(null); setFamilias({}); }}
                className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegistrar}
                disabled={!todosSelecionados || pending}
                className={cn(
                  "inline-flex items-center gap-2 rounded-lg border",
                  "border-emerald-700/60 bg-emerald-500/10 px-4 py-2",
                  "text-sm font-semibold text-emerald-400",
                  "hover:bg-emerald-500/20 transition-colors",
                  "disabled:opacity-40 disabled:cursor-not-allowed",
                )}
              >
                {pending ? <Loader2 size={13} className="animate-spin" /> : <ReceiptText size={13} />}
                {pending ? "Registrando…" : "Registrar NF"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Card de NF registrada ─────────────────────────────────────────────────────

function NFCard({ nf }: { nf: NotaFiscal }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [concluindo, startConcluir] = useTransition();
  const [expandida, setExpandida] = useState(false);

  function handleLancarOmie() {
    start(async () => {
      try {
        await lancarNFOmie(nf.id);
        toast.success("NF lançada no Omie com sucesso");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao lançar no Omie");
      }
    });
  }

  function handleConcluirOmie() {
    startConcluir(async () => {
      try {
        const res = await concluirRecebimentoOmie(nf.id);
        if ("erro" in res) {
          toast.error(res.erro);
        } else {
          toast.success("Recebimento concluído no Omie!");
          router.refresh();
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao concluir");
      }
    });
  }

  const numDisplay = nf.numero ?? nf.omie_num_nf ?? "—";
  const fornNome   = nf.fornecedores
    ? nf.fornecedores.nome_fantasia || nf.fornecedores.razao_social
    : nf.pedidos?.numero ? `Pedido ${nf.pedidos.numero}` : "—";

  return (
    <div className={cn(
      "rounded-xl border bg-muted/40 overflow-hidden transition-all",
      nf.status === "erro_omie" ? "border-red-700/40" : "border-border/80",
    )}>
      <div
        className="flex items-center justify-between px-5 py-3.5 cursor-pointer hover:bg-muted/60 transition-colors"
        onClick={() => setExpandida(v => !v)}
      >
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-1.5 h-1.5 rounded-full shrink-0",
            nf.lancada_no_omie ? "bg-emerald-400" : nf.status === "erro_omie" ? "bg-red-400" : "bg-amber-400",
          )} />
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-foreground">NF-e {numDisplay}</span>
              {nf.serie && <span className="text-[11px] text-muted-foreground/60">Série {nf.serie}</span>}
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                nf.lancada_no_omie
                  ? "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20"
                  : nf.status === "erro_omie"
                  ? "text-red-400 bg-red-500/10 ring-red-500/20"
                  : "text-amber-400 bg-amber-500/10 ring-amber-500/20",
              )}>
                {nf.lancada_no_omie ? "✓ No Omie" : nf.status === "erro_omie" ? "Erro Omie" : "Ag. Omie"}
              </span>
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {fornNome}
              {nf.emissao && ` · Emissão: ${formatDate(nf.emissao)}`}
              {` · Registrada: ${formatDate(nf.created_at)}`}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="font-mono text-sm font-semibold text-foreground">{formatBRL(nf.valor_total)}</div>
            <div className="text-[10px] text-muted-foreground/60">{nf.nf_itens.length} iten{nf.nf_itens.length !== 1 ? "s" : ""}</div>
          </div>
          {!nf.lancada_no_omie && nf.status !== "lancada" && (
            <button
              onClick={e => { e.stopPropagation(); handleLancarOmie(); }}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-700/60 bg-amber-500/10 px-3 py-1.5 text-[12px] font-medium text-amber-400 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
            >
              {pending ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {pending ? "Lançando…" : "Lançar Omie"}
            </button>
          )}
          {nf.lancada_no_omie && nf.omie_receb_id && !nf.omie_concluido && (
            <button
              onClick={e => { e.stopPropagation(); handleConcluirOmie(); }}
              disabled={concluindo}
              className="inline-flex items-center gap-1.5 rounded-md border border-emerald-700/60 bg-emerald-500/10 px-3 py-1.5 text-[12px] font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors disabled:opacity-50"
            >
              {concluindo ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
              Concluir no Omie
            </button>
          )}
          <ArrowRight size={13} className={cn("text-muted-foreground/60 transition-transform", expandida && "rotate-90")} />
        </div>
      </div>

      {/* Itens expandidos */}
      {expandida && nf.nf_itens.length > 0 && (
        <div className="border-t border-border/60 overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/40">
                <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground/60">Produto</th>
                <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-muted-foreground/60">Família</th>
                <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60">Qtd</th>
                <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60">Preço Unit.</th>
                <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-muted-foreground/60">Total</th>
              </tr>
            </thead>
            <tbody>
              {nf.nf_itens.map(item => (
                <tr key={item.id} className="border-b border-border/30 last:border-0">
                  <td className="px-4 py-2 text-sm text-foreground/80 max-w-[200px] truncate">{item.descricao_omie ?? "—"}</td>
                  <td className="px-4 py-2">
                    {item.familia_omie
                      ? <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 text-sky-400 bg-sky-500/10 ring-sky-500/20">{item.familia_omie}</span>
                      : <span className="text-[10px] text-muted-foreground/60">—</span>
                    }
                  </td>
                  <td className="px-4 py-2 text-right text-sm font-mono text-muted-foreground">{item.qtd_nf ?? "—"}</td>
                  <td className="px-4 py-2 text-right text-sm font-mono text-muted-foreground">{formatBRL(item.preco_nf)}</td>
                  <td className="px-4 py-2 text-right text-sm font-mono font-semibold text-foreground">
                    {formatBRL(item.qtd_nf != null && item.preco_nf != null ? item.qtd_nf * item.preco_nf : null)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function NFClient({ notas: notasInit, unidades }: Props) {
  const [notas, setNotas]   = useState(notasInit);
  const [busca, setBusca]   = useState("");
  const [aba, setAba]       = useState<"notas" | "entrada">("notas");

  const notasFiltradas = notas.filter(n => {
    const q = busca.toLowerCase().trim();
    if (!q) return true;
    const num = n.numero ?? n.omie_num_nf ?? "";
    return (
      num.toLowerCase().includes(q) ||
      (n.fornecedores?.razao_social?.toLowerCase().includes(q) ?? false) ||
      (n.fornecedores?.nome_fantasia?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 space-y-4 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Entrada de Notas Fiscais</h1>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            Consulta Omie · Classificação por Família de Produto
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
          <span className="text-emerald-400 font-semibold">{notas.filter(n => n.lancada_no_omie).length}</span> lançadas
          <span>·</span>
          <span className="text-amber-400 font-semibold">{notas.filter(n => !n.lancada_no_omie).length}</span> pendentes
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Registradas",    value: notas.length,                                            color: "text-foreground" },
          { label: "No Omie",        value: notas.filter(n => n.lancada_no_omie).length,             color: "text-emerald-400" },
          { label: "Ag. Lançamento", value: notas.filter(n => !n.lancada_no_omie && n.status !== "conferencia").length, color: "text-amber-400" },
        ].map(k => (
          <div key={k.label} className="rounded-xl border border-border/80 bg-muted/40 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground/60">{k.label}</div>
            <div className={cn("text-2xl font-mono font-semibold mt-0.5", k.color)}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-muted/60 rounded-lg p-0.5 border border-border">
          {([
            { key: "notas",   label: `NFs Registradas (${notas.length})` },
            { key: "entrada", label: "Nova Entrada" },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setAba(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                aba === t.key ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground/80",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {aba === "notas" && (
          <div className="relative flex-1 max-w-[300px]">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 pointer-events-none" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por número ou fornecedor…"
              className="w-full rounded-lg border border-border bg-muted/40 pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-border transition-all"
            />
          </div>
        )}
      </div>

      {/* Conteúdo */}
      {aba === "entrada" ? (
        <PainelEntradaNF
          unidades={unidades}
          onRegistrada={() => setAba("notas")}
        />
      ) : (
        <div className="space-y-2">
          {notasFiltradas.length === 0 ? (
            <div className="rounded-xl border border-border/80 bg-muted/40 flex flex-col items-center justify-center py-16 gap-3">
              <ReceiptText size={32} className="text-muted-foreground/40" strokeWidth={1.2} />
              <p className="text-sm text-muted-foreground">Nenhuma nota fiscal registrada</p>
              <p className="text-[12px] text-muted-foreground/60">
                Use a aba <strong className="text-muted-foreground">Nova Entrada</strong> para registrar uma NF pelo número
              </p>
              <button
                onClick={() => setAba("entrada")}
                className="mt-2 inline-flex items-center gap-2 rounded-lg border border-sky-700/60 bg-sky-500/10 px-4 py-2 text-sm font-medium text-sky-400 hover:bg-sky-500/20 transition-colors"
              >
                <Package size={13} />
                Fazer primeira entrada
              </button>
            </div>
          ) : (
            notasFiltradas.map(nf => <NFCard key={nf.id} nf={nf} />)
          )}
        </div>
      )}
    </div>
  );
}
