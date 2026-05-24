"use client";

/**
 * nf-client.tsx — LHG-216/217
 * Entrada de NF: lista de notas + conferência de itens + lançamento Omie.
 * Upload de XML NFe feito client-side com parser DOM nativo.
 */
import { useState, useTransition, useRef } from "react";
import {
  ReceiptText, Upload, Check, X, AlertTriangle, Sparkles,
  Loader2, ChevronRight, Package, FileText, Search,
  CheckCircle2, Clock, ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { registrarNF, lancarNFOmie } from "../actions";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type NfItemKind = "ok" | "preco" | "qtd" | "extra" | "faltante";

interface NfItem {
  id: string;
  divergencia: NfItemKind;
  decisao: string | null;
  qtd_nf: number | null;
  qtd_pedido: number | null;
  preco_nf: number | null;
  preco_pedido: number | null;
  produtos: { id: string; nome: string; codigo: string; unidade_med: string } | null;
}

interface NotaFiscal {
  id: string;
  chave_acesso: string;
  numero: string | null;
  serie: string | null;
  emissao: string | null;
  valor_total: number | null;
  status: string;
  lancada_no_omie: boolean | null;
  lancada_em: string | null;
  xml_url: string | null;
  created_at: string;
  pedidos: { id: string; numero: string; fornecedores: { razao_social: string; nome_fantasia: string | null } | null } | null;
  nf_itens: NfItem[];
}

interface PedidoItem {
  id: string;
  quantidade: number;
  preco_unitario: number;
  produtos: { id: string; nome: string; codigo: string; unidade_med: string } | null;
}

interface PedidoPendente {
  id: string;
  numero: string;
  valor_total: number;
  status: string;
  created_at: string;
  fornecedores: { razao_social: string; nome_fantasia: string | null } | null;
  pedido_itens: PedidoItem[];
}

interface Props {
  notas:             NotaFiscal[];
  pedidosPendentes:  PedidoPendente[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBRL(v: number | null) {
  if (v === null) return "—";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
}

function getFornNome(f: { razao_social: string; nome_fantasia: string | null } | null) {
  if (!f) return "—";
  return f.nome_fantasia || f.razao_social;
}

const DIVERGENCIA_CONFIG: Record<NfItemKind, { label: string; color: string }> = {
  ok:       { label: "OK",          color: "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20" },
  preco:    { label: "Preço",       color: "text-amber-400 bg-amber-500/10 ring-amber-500/20" },
  qtd:      { label: "Quantidade",  color: "text-amber-400 bg-amber-500/10 ring-amber-500/20" },
  extra:    { label: "Extra",       color: "text-violet-400 bg-violet-500/10 ring-violet-500/20" },
  faltante: { label: "Faltante",    color: "text-red-400 bg-red-500/10 ring-red-500/20" },
};

// ── Parser XML NFe ────────────────────────────────────────────────────────────

interface NFeData {
  chave_acesso:  string;
  numero:        string;
  serie:         string;
  emissao:       string;
  valor_total:   number;
  itens: Array<{
    produto_codigo: string;
    produto_desc:   string;
    qtd:            number;
    preco_unit:     number;
    valor_total:    number;
  }>;
}

function parseNFeXML(xmlText: string): NFeData | null {
  try {
    const parser  = new DOMParser();
    const xmlDoc  = parser.parseFromString(xmlText, "text/xml");

    const getVal = (sel: string) => xmlDoc.querySelector(sel)?.textContent ?? "";

    // Chave de acesso fica no atributo Id da tag infNFe
    const infNFe = xmlDoc.querySelector("infNFe");
    let chave = infNFe?.getAttribute("Id") ?? "";
    if (chave.startsWith("NFe")) chave = chave.slice(3);

    const numero      = getVal("nNF");
    const serie       = getVal("serie");
    const emissao     = getVal("dhEmi") || getVal("dEmi");
    const valor_total = parseFloat(getVal("vNF") || getVal("vTotTrib") || "0");

    // Itens
    const detNodes = xmlDoc.querySelectorAll("det");
    const itens: NFeData["itens"] = [];
    detNodes.forEach(det => {
      const prod   = det.querySelector("prod");
      itens.push({
        produto_codigo: prod?.querySelector("cProd")?.textContent ?? "",
        produto_desc:   prod?.querySelector("xProd")?.textContent ?? "",
        qtd:            parseFloat(prod?.querySelector("qCom")?.textContent ?? "0"),
        preco_unit:     parseFloat(prod?.querySelector("vUnCom")?.textContent ?? "0"),
        valor_total:    parseFloat(prod?.querySelector("vProd")?.textContent ?? "0"),
      });
    });

    if (!chave || !numero) return null;
    return { chave_acesso: chave, numero, serie, emissao, valor_total, itens };
  } catch {
    return null;
  }
}

// Calcula divergências comparando itens do XML com itens do pedido
function calcularDivergencias(
  nfeItens: NFeData["itens"],
  pedidoItens: PedidoItem[],
  produtosPorCodigo: Map<string, PedidoItem["produtos"]>,
) {
  const resultado: Array<{
    produto_id:   string | null;
    qtd_nf:       number;
    preco_nf:     number;
    qtd_pedido:   number | null;
    preco_pedido: number | null;
    divergencia:  NfItemKind;
  }> = [];

  const pedidoMap = new Map(pedidoItens.map(i => [i.produtos?.codigo ?? "", i]));

  for (const nfeItem of nfeItens) {
    const pedItem = pedidoMap.get(nfeItem.produto_codigo);
    const prod    = pedItem?.produtos ?? null;

    if (!pedItem) {
      // Item extra na NF
      resultado.push({
        produto_id:   null,
        qtd_nf:       nfeItem.qtd,
        preco_nf:     nfeItem.preco_unit,
        qtd_pedido:   null,
        preco_pedido: null,
        divergencia:  "extra",
      });
      continue;
    }

    const qtdOk   = Math.abs(nfeItem.qtd   - pedItem.quantidade)   < 0.001;
    const precoOk = Math.abs(nfeItem.preco_unit - pedItem.preco_unitario) < 0.01;

    let divergencia: NfItemKind = "ok";
    if (!qtdOk && !precoOk)  divergencia = "qtd";   // trata como qtd (pior)
    else if (!qtdOk)          divergencia = "qtd";
    else if (!precoOk)        divergencia = "preco";

    resultado.push({
      produto_id:   prod?.id ?? null,
      qtd_nf:       nfeItem.qtd,
      preco_nf:     nfeItem.preco_unit,
      qtd_pedido:   pedItem.quantidade,
      preco_pedido: pedItem.preco_unitario,
      divergencia,
    });
  }

  // Itens faltantes (no pedido mas não na NF)
  for (const pedItem of pedidoItens) {
    const inNF = nfeItens.some(n => n.produto_codigo === pedItem.produtos?.codigo);
    if (!inNF && pedItem.produtos) {
      resultado.push({
        produto_id:   pedItem.produtos.id,
        qtd_nf:       0,
        preco_nf:     0,
        qtd_pedido:   pedItem.quantidade,
        preco_pedido: pedItem.preco_unitario,
        divergencia:  "faltante",
      });
    }
  }

  return resultado;
}

// ── Modal Upload XML ──────────────────────────────────────────────────────────

function ModalUploadNF({
  pedido,
  onClose,
  onRegistrada,
}: {
  pedido: PedidoPendente;
  onClose: () => void;
  onRegistrada: () => void;
}) {
  const [pending, start] = useTransition();
  const [nfeData, setNfeData] = useState<NFeData | null>(null);
  const [xmlText, setXmlText]  = useState("");
  const [parseError, setParseError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setXmlText(text);
      const parsed = parseNFeXML(text);
      if (!parsed) {
        setParseError("Não foi possível interpretar o XML. Verifique se é um arquivo NFe válido.");
        setNfeData(null);
      } else {
        setParseError("");
        setNfeData(parsed);
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  const divergencias = nfeData
    ? calcularDivergencias(nfeData.itens, pedido.pedido_itens, new Map())
    : [];

  const temDivergencias = divergencias.some(d => d.divergencia !== "ok");

  function handleRegistrar() {
    if (!nfeData) return;
    start(async () => {
      try {
        await registrarNF({
          pedido_id:    pedido.id,
          chave_acesso: nfeData.chave_acesso,
          numero:       nfeData.numero,
          serie:        nfeData.serie,
          emissao:      nfeData.emissao,
          valor_total:  nfeData.valor_total,
          itens:        divergencias.map(d => ({
            produto_id:   d.produto_id,
            qtd_nf:       d.qtd_nf,
            preco_nf:     d.preco_nf,
            qtd_pedido:   d.qtd_pedido,
            preco_pedido: d.preco_pedido,
            divergencia:  d.divergencia,
          })),
        });
        toast.success("NF registrada com sucesso");
        onRegistrada();
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao registrar NF");
      }
    });
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[8vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[720px] rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-sky-400" />
            <h2 className="text-sm font-semibold text-zinc-50">Registrar Nota Fiscal</h2>
            <span className="text-[11px] text-zinc-600 font-mono">{pedido.numero}</span>
          </div>
          <button onClick={onClose} className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors">
            <X size={14} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {/* Info do pedido */}
          <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 px-4 py-3 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600 mb-1">Pedido</div>
              <div className="text-sm font-medium text-zinc-200">{getFornNome(pedido.fornecedores)} · {pedido.numero}</div>
              <div className="text-[11px] text-zinc-500">{pedido.pedido_itens.length} itens</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">Valor do pedido</div>
              <div className="font-mono text-sm font-semibold text-zinc-100">{formatBRL(pedido.valor_total)}</div>
            </div>
          </div>

          {/* Upload XML */}
          <div>
            <div
              onClick={() => fileRef.current?.click()}
              className={cn(
                "border-2 border-dashed rounded-xl px-6 py-8 text-center cursor-pointer transition-colors",
                nfeData
                  ? "border-emerald-500/40 bg-emerald-500/[0.04]"
                  : "border-zinc-800 hover:border-zinc-600 bg-zinc-900/20",
              )}
            >
              {nfeData ? (
                <div className="flex flex-col items-center gap-2">
                  <CheckCircle2 size={24} className="text-emerald-400" />
                  <div className="text-sm font-medium text-emerald-300">XML interpretado com sucesso</div>
                  <div className="text-[12px] text-zinc-500">
                    NF-e {nfeData.numero} · Série {nfeData.serie} · {formatBRL(nfeData.valor_total)}
                  </div>
                  <div className="text-[11px] font-mono text-zinc-600 mt-1">{nfeData.chave_acesso}</div>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload size={24} className="text-zinc-600" />
                  <div className="text-sm text-zinc-400">Clique para fazer upload do XML da NFe</div>
                  <div className="text-[11px] text-zinc-600">Arquivos .xml · NFe 4.0</div>
                </div>
              )}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              onChange={handleFile}
              className="hidden"
            />
            {parseError && (
              <div className="mt-2 flex items-center gap-2 text-[12px] text-red-400">
                <AlertTriangle size={12} />
                {parseError}
              </div>
            )}
          </div>

          {/* Grid de conferência */}
          {nfeData && divergencias.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-wider text-zinc-600 font-medium">Conferência de itens</span>
                {temDivergencias && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 ring-1 ring-amber-500/20 rounded-full px-2 py-0.5">
                    <AlertTriangle size={9} />
                    {divergencias.filter(d => d.divergencia !== "ok").length} divergência{divergencias.filter(d => d.divergencia !== "ok").length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800/60">
                      <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-600">Produto</th>
                      <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-600">Qtd Pedido</th>
                      <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-600">Qtd NF</th>
                      <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-600">Preço Pedido</th>
                      <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-600">Preço NF</th>
                      <th className="px-4 py-2 text-center text-[10px] uppercase tracking-wider text-zinc-600">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {divergencias.map((div, i) => {
                      const cfg = DIVERGENCIA_CONFIG[div.divergencia];
                      const pedItem = pedido.pedido_itens.find(pi => pi.produtos?.id === div.produto_id);
                      const nfeItemData = nfeData.itens[i];
                      return (
                        <tr key={i} className={cn(
                          "border-b border-zinc-800/40 last:border-0",
                          div.divergencia !== "ok" && "bg-amber-500/[0.02]",
                        )}>
                          <td className="px-4 py-2.5">
                            <div className="text-sm text-zinc-200 truncate max-w-[180px]">
                              {pedItem?.produtos?.nome ?? nfeItemData?.produto_desc ?? "Produto extra"}
                            </div>
                            <div className="text-[10px] text-zinc-600 font-mono">{nfeItemData?.produto_codigo}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-mono text-zinc-400">
                            {div.qtd_pedido ?? "—"}
                          </td>
                          <td className={cn(
                            "px-4 py-2.5 text-right text-sm font-mono font-semibold",
                            div.divergencia === "qtd" || div.divergencia === "faltante" || div.divergencia === "extra"
                              ? "text-amber-300"
                              : "text-zinc-200",
                          )}>
                            {div.qtd_nf || "—"}
                          </td>
                          <td className="px-4 py-2.5 text-right text-sm font-mono text-zinc-400">
                            {formatBRL(div.preco_pedido)}
                          </td>
                          <td className={cn(
                            "px-4 py-2.5 text-right text-sm font-mono font-semibold",
                            div.divergencia === "preco" ? "text-amber-300" : "text-zinc-200",
                          )}>
                            {formatBRL(div.preco_nf)}
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                              cfg.color,
                            )}>
                              {cfg.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3.5 border-t border-zinc-800/60 shrink-0">
          <div>
            {nfeData && (
              <div className="text-[12px] text-zinc-500">
                Total NF: <span className="font-mono font-semibold text-zinc-300">{formatBRL(nfeData.valor_total)}</span>
                {temDivergencias && (
                  <span className="ml-3 text-amber-500">⚠ Existem divergências — registre e revise antes de lançar no Omie</span>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="text-sm text-zinc-500 hover:text-zinc-300 px-3 py-2 transition-colors">
              Cancelar
            </button>
            <button
              onClick={handleRegistrar}
              disabled={!nfeData || pending}
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
    </div>
  );
}

// ── Detalhe de NF registrada ──────────────────────────────────────────────────

function NFDetalhe({ nf }: { nf: NotaFiscal }) {
  const [pending, start] = useTransition();

  const temDivergencias = nf.nf_itens.some(i => i.divergencia !== "ok");
  const divergencias    = nf.nf_itens.filter(i => i.divergencia !== "ok");

  function handleLancarOmie() {
    start(async () => {
      try {
        await lancarNFOmie(nf.id);
        toast.success("NF enviada para o Omie");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao lançar no Omie");
      }
    });
  }

  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
      {/* Header NF */}
      <div className="flex items-start justify-between px-5 py-4 border-b border-zinc-800/60">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={cn(
              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
              nf.lancada_no_omie
                ? "text-emerald-400 bg-emerald-500/10 ring-emerald-500/20"
                : "text-amber-400 bg-amber-500/10 ring-amber-500/20",
            )}>
              {nf.lancada_no_omie ? "✓ Lançada no Omie" : "Aguardando Omie"}
            </span>
            {temDivergencias && (
              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 text-amber-400 bg-amber-500/10 ring-amber-500/20">
                <AlertTriangle size={9} />
                {divergencias.length} divergência{divergencias.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <div className="text-sm font-semibold text-zinc-100">
            NF-e {nf.numero ?? "—"} · Série {nf.serie ?? "—"}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono mt-0.5">{nf.chave_acesso}</div>
          <div className="flex items-center gap-3 mt-1.5 text-[11px] text-zinc-600">
            <span>Pedido: {nf.pedidos?.numero}</span>
            {nf.emissao && <span>Emissão: {formatDate(nf.emissao)}</span>}
            {nf.lancada_em && <span>Lançada: {formatDate(nf.lancada_em)}</span>}
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-zinc-600">Valor total</div>
          <div className="font-mono text-lg font-bold text-zinc-100">{formatBRL(nf.valor_total)}</div>
          {!nf.lancada_no_omie && (
            <button
              onClick={handleLancarOmie}
              disabled={pending}
              className={cn(
                "mt-2 inline-flex items-center gap-1.5 rounded-lg border",
                "border-amber-700/60 bg-amber-500/10 px-3 py-1.5 text-[12px] font-medium text-amber-400",
                "hover:bg-amber-500/20 transition-colors disabled:opacity-50",
              )}
            >
              {pending ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
              {pending ? "Lançando…" : "Lançar no Omie"}
            </button>
          )}
        </div>
      </div>

      {/* Grid de conferência */}
      {nf.nf_itens.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-800/60">
                <th className="px-4 py-2 text-left text-[10px] uppercase tracking-wider text-zinc-600">Produto</th>
                <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-600">Qtd Ped.</th>
                <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-600">Qtd NF</th>
                <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-600">Preço Ped.</th>
                <th className="px-4 py-2 text-right text-[10px] uppercase tracking-wider text-zinc-600">Preço NF</th>
                <th className="px-4 py-2 text-center text-[10px] uppercase tracking-wider text-zinc-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {nf.nf_itens.map((item, i) => {
                const cfg = DIVERGENCIA_CONFIG[item.divergencia];
                return (
                  <tr key={item.id} className="border-b border-zinc-800/40 last:border-0">
                    <td className="px-4 py-2.5">
                      <div className="text-sm text-zinc-200 truncate max-w-[200px]">
                        {item.produtos?.nome ?? "Produto extra"}
                      </div>
                      {item.produtos?.codigo && (
                        <div className="text-[10px] text-zinc-600 font-mono">{item.produtos.codigo}</div>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-mono text-zinc-500">{item.qtd_pedido ?? "—"}</td>
                    <td className={cn(
                      "px-4 py-2.5 text-right text-sm font-mono font-semibold",
                      item.divergencia === "qtd" ? "text-amber-300" : "text-zinc-200",
                    )}>
                      {item.qtd_nf ?? "—"}
                    </td>
                    <td className="px-4 py-2.5 text-right text-sm font-mono text-zinc-500">
                      {formatBRL(item.preco_pedido)}
                    </td>
                    <td className={cn(
                      "px-4 py-2.5 text-right text-sm font-mono font-semibold",
                      item.divergencia === "preco" ? "text-amber-300" : "text-zinc-200",
                    )}>
                      {formatBRL(item.preco_nf)}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ring-1",
                        cfg.color,
                      )}>
                        {cfg.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function NFClient({ notas, pedidosPendentes }: Props) {
  const [busca, setBusca]         = useState("");
  const [uploadPedido, setUploadPedido] = useState<PedidoPendente | null>(null);
  const [abaSelecionada, setAba]  = useState<"notas" | "pedidos">("notas");

  const notasFiltradas = notas.filter(n => {
    const q = busca.toLowerCase().trim();
    if (!q) return true;
    return (
      (n.numero?.toLowerCase().includes(q) ?? false) ||
      n.chave_acesso.toLowerCase().includes(q) ||
      getFornNome(n.pedidos?.fornecedores ?? null).toLowerCase().includes(q)
    );
  });

  const pedidosFiltrados = pedidosPendentes.filter(p => {
    const q = busca.toLowerCase().trim();
    if (!q) return true;
    return (
      p.numero.toLowerCase().includes(q) ||
      getFornNome(p.fornecedores).toLowerCase().includes(q)
    );
  });

  return (
    <div className="max-w-[1100px] mx-auto px-4 py-6 space-y-4 pb-10">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-50">Entrada de Notas Fiscais</h1>
          <p className="text-[12px] text-zinc-500 mt-0.5">
            Conferência automática de itens e lançamento no Omie
          </p>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-zinc-500">
          <span className="text-emerald-400 font-semibold">{notas.filter(n => n.lancada_no_omie).length}</span> lançadas
          <span>·</span>
          <span className="text-amber-400 font-semibold">{notas.filter(n => !n.lancada_no_omie).length}</span> pendentes
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Registradas",  value: notas.length,                                 color: "text-zinc-100" },
          { label: "No Omie",      value: notas.filter(n => n.lancada_no_omie).length,  color: "text-emerald-400" },
          { label: "Ag. Lançamento", value: notas.filter(n => !n.lancada_no_omie && n.status !== "conferencia").length, color: "text-amber-400" },
        ].map(k => (
          <div key={k.label} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-zinc-600">{k.label}</div>
            <div className={cn("text-2xl font-mono font-semibold mt-0.5", k.color)}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Tabs + busca */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1 bg-zinc-900/60 rounded-lg p-0.5 border border-zinc-800">
          {([
            { key: "notas", label: `NFs registradas (${notas.length})` },
            { key: "pedidos", label: `Pedidos aguardando NF (${pedidosPendentes.length})` },
          ] as const).map(t => (
            <button
              key={t.key}
              onClick={() => setAba(t.key)}
              className={cn(
                "rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors",
                abaSelecionada === t.key
                  ? "bg-zinc-700 text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-300",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-[300px]">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar…"
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900/40 pl-8 pr-3 py-2 text-sm text-zinc-300 placeholder-zinc-600 focus:outline-none focus:ring-1 focus:ring-zinc-700 transition-all"
          />
        </div>
      </div>

      {/* Conteúdo */}
      {abaSelecionada === "notas" ? (
        <div className="space-y-3">
          {notasFiltradas.length === 0 ? (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 flex flex-col items-center justify-center py-16 gap-3">
              <ReceiptText size={32} className="text-zinc-700" strokeWidth={1.2} />
              <p className="text-sm text-zinc-500">Nenhuma nota fiscal registrada</p>
              <p className="text-[12px] text-zinc-600">Selecione um pedido na aba "Pedidos" e faça o upload do XML</p>
            </div>
          ) : (
            notasFiltradas.map(nf => <NFDetalhe key={nf.id} nf={nf} />)
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {pedidosFiltrados.length === 0 ? (
            <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 flex flex-col items-center justify-center py-16 gap-2">
              <Package size={32} className="text-zinc-700" strokeWidth={1.2} />
              <p className="text-sm text-zinc-500">Nenhum pedido aguardando NF</p>
            </div>
          ) : (
            pedidosFiltrados.map(p => (
              <div
                key={p.id}
                className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-5 py-4 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-[11px] text-zinc-500">{p.numero}</span>
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1 text-sky-400 bg-sky-500/10 ring-sky-500/20">
                      <Clock size={9} />
                      {p.status === "enviado" ? "Enviado" : p.status === "em_transito" ? "Em trânsito" : "Recebido"}
                    </span>
                  </div>
                  <div className="text-sm font-medium text-zinc-200">{getFornNome(p.fornecedores)}</div>
                  <div className="text-[11px] text-zinc-600 mt-0.5">
                    {p.pedido_itens.length} iten{p.pedido_itens.length !== 1 ? "s" : ""} · {formatDate(p.created_at)}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="font-mono text-sm font-semibold text-zinc-100">{formatBRL(p.valor_total)}</div>
                  </div>
                  <button
                    onClick={() => setUploadPedido(p)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-sky-700/60 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-400 hover:bg-sky-500/20 transition-colors"
                  >
                    <Upload size={13} />
                    Upload XML
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Modal Upload */}
      {uploadPedido && (
        <ModalUploadNF
          pedido={uploadPedido}
          onClose={() => setUploadPedido(null)}
          onRegistrada={() => setUploadPedido(null)}
        />
      )}
    </div>
  );
}
