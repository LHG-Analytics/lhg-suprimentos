"use client";

/**
 * cotacao-detalhe-client.tsx — LHG-211
 * Tela hero da cotação: header + banner IA + matriz comparativa + bottom summary bar.
 * Toda a lógica de seleção de fornecedor por item é gerenciada aqui client-side.
 */
import { useState, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Sparkles, X, ChevronDown, Plus,
  Loader2, AlertTriangle, Calendar, Users, Check,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { selecionarFornecedorItem } from "../../actions";
import { WizardGerarPedidos } from "./wizard-gerar-pedidos";
import { AdicionarFornecedorModal } from "./adicionar-fornecedor-modal";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Produto        { id: string; codigo: string; nome: string; unidade_med: string; categoria: string }
interface MatrizCell     { cotacao_item_id: string; fornecedor_id: string; preco_unitario: number | null; prazo_entrega_dias: number | null; condicao_pagamento: string | null }
interface CotacaoItem    { id: string; quantidade: number; melhor_forn: string | null; selecionado_forn: string | null; produtos: Produto | null; cotacao_matriz: MatrizCell[] }
interface FornecedorBase { id: string; razao_social: string; nome_fantasia: string | null; rating: number | null; pontualidade_pct: number | null }
interface CotacaoForn    { fornecedor_id: string; fornecedores: FornecedorBase | null }

interface Cotacao {
  id: string; numero: string; titulo: string; status: string; urgente: boolean | null;
  valor_estimado: number | null; economia: number | null; economia_pct: number | null;
  prazo: string | null; created_at: string; ai_resumo: string | null; ai_analisada_em: string | null;
  comprador: { nome: string; avatar_url: string | null } | null;
  cotacao_unidades: { unidade_id: string; unidades: { nome: string } | null }[];
  cotacao_fornecedores: CotacaoForn[];
  cotacao_itens: CotacaoItem[];
}

interface Props {
  cotacao:           Cotacao;
  todosFornecedores: { id: string; razao_social: string; nome_fantasia: string | null; rating: number | null; pontualidade_pct: number | null }[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBRL(v: number | null) {
  if (!v) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getFornecedorNome(f: FornecedorBase) {
  return f.nome_fantasia || f.razao_social;
}

function getInitials(nome: string) {
  return nome.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

// Cores para avatares de fornecedores
const AVATAR_COLORS = [
  "bg-violet-500/20 text-violet-300",
  "bg-sky-500/20 text-sky-300",
  "bg-amber-500/20 text-amber-300",
  "bg-emerald-500/20 text-emerald-300",
  "bg-rose-500/20 text-rose-300",
  "bg-cyan-500/20 text-cyan-300",
];

// ── Componente ────────────────────────────────────────────────────────────────

export function CotacaoDetalheClient({ cotacao, todosFornecedores }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Estado local de seleções (otimista — persiste via server action)
  const [selecoes, setSelecoes] = useState<Record<string, string | null>>(() => {
    const m: Record<string, string | null> = {};
    for (const item of cotacao.cotacao_itens) {
      m[item.id] = item.selecionado_forn;
    }
    return m;
  });

  const [iaBannerOpen,      setIaBannerOpen]     = useState(true);
  const [wizardOpen,        setWizardOpen]        = useState(false);
  const [addFornModalOpen,  setAddFornModalOpen]  = useState(false);

  // Fornecedores desta cotação
  const fornecedores = cotacao.cotacao_fornecedores
    .map(cf => cf.fornecedores)
    .filter(Boolean) as FornecedorBase[];

  // Mapa item → células da matriz
  const matrizMap = useMemo(() => {
    const m: Record<string, Record<string, MatrizCell>> = {};
    for (const item of cotacao.cotacao_itens) {
      m[item.id] = {};
      for (const cell of item.cotacao_matriz) {
        m[item.id][cell.fornecedor_id] = cell;
      }
    }
    return m;
  }, [cotacao.cotacao_itens]);

  // Melhor preço por item
  const melhorPreco = useMemo(() => {
    const m: Record<string, number> = {};
    for (const item of cotacao.cotacao_itens) {
      const precos = item.cotacao_matriz
        .map(c => c.preco_unitario)
        .filter((p): p is number => p !== null && p > 0);
      if (precos.length > 0) m[item.id] = Math.min(...precos);
    }
    return m;
  }, [cotacao.cotacao_itens]);

  // Total da seleção atual
  const totalSelecao = useMemo(() => {
    let total = 0;
    for (const item of cotacao.cotacao_itens) {
      const fornId = selecoes[item.id];
      if (!fornId) continue;
      const cell = matrizMap[item.id]?.[fornId];
      if (cell?.preco_unitario) total += cell.preco_unitario * item.quantidade;
    }
    return total;
  }, [selecoes, matrizMap, cotacao.cotacao_itens]);

  // Total do mix ótimo IA
  const totalIA = useMemo(() => {
    let total = 0;
    for (const item of cotacao.cotacao_itens) {
      const fornId = item.melhor_forn;
      if (!fornId) continue;
      const cell = matrizMap[item.id]?.[fornId];
      if (cell?.preco_unitario) total += cell.preco_unitario * item.quantidade;
    }
    return total;
  }, [matrizMap, cotacao.cotacao_itens]);

  // Total sem otimização (melhor fornecedor único)
  const totalSemOtimizacao = useMemo(() => {
    const totais = fornecedores.map(f => {
      let t = 0;
      for (const item of cotacao.cotacao_itens) {
        const cell = matrizMap[item.id]?.[f.id];
        if (cell?.preco_unitario) t += cell.preco_unitario * item.quantidade;
        else return Infinity;
      }
      return t;
    }).filter(t => t !== Infinity);
    return totais.length > 0 ? Math.min(...totais) : 0;
  }, [fornecedores, matrizMap, cotacao.cotacao_itens]);

  const economia = totalSemOtimizacao > 0 && totalSelecao > 0
    ? totalSemOtimizacao - totalSelecao : 0;
  const itensComSelecao = cotacao.cotacao_itens.filter(i => selecoes[i.id]).length;

  // ── Selecionar fornecedor ──────────────────────────────────────────────────
  function toggleSelecao(itemId: string, fornId: string) {
    const atual = selecoes[itemId];
    const novo = atual === fornId ? null : fornId;

    // Atualização otimista
    setSelecoes(s => ({ ...s, [itemId]: novo }));

    startTransition(async () => {
      try {
        await selecionarFornecedorItem(itemId, novo);
      } catch {
        // Reverter em caso de erro
        setSelecoes(s => ({ ...s, [itemId]: atual }));
        toast.error("Erro ao salvar seleção");
      }
    });
  }

  // ── Aplicar sugestão IA ────────────────────────────────────────────────────
  function aplicarSugestaoIA() {
    const novas: Record<string, string | null> = { ...selecoes };
    for (const item of cotacao.cotacao_itens) {
      if (item.melhor_forn) novas[item.id] = item.melhor_forn;
    }
    setSelecoes(novas);

    startTransition(async () => {
      try {
        await Promise.all(
          cotacao.cotacao_itens
            .filter(i => i.melhor_forn)
            .map(i => selecionarFornecedorItem(i.id, i.melhor_forn))
        );
        toast.success("Sugestão IA aplicada a todos os itens");
      } catch {
        toast.error("Erro ao aplicar sugestão IA");
      }
    });
  }

  const temSugestaoIA = cotacao.cotacao_itens.some(i => i.melhor_forn);
  const nomeUnidades  = cotacao.cotacao_unidades.map(cu => cu.unidades?.nome).filter(Boolean).join(", ");

  return (
    <div className="max-w-[1600px] mx-auto pb-24 space-y-4">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="space-y-3">
        {/* Breadcrumb + meta */}
        <div className="flex items-center gap-3 text-[12px] text-zinc-500">
          <button
            onClick={() => router.push("/cotacoes")}
            className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
          >
            <ArrowLeft size={12} />
            Cotações
          </button>
          <span>·</span>
          <span className="font-mono">{cotacao.numero}</span>
          {cotacao.ai_analisada_em && (
            <>
              <span>·</span>
              <span className="flex items-center gap-1 text-emerald-500">
                <Sparkles size={11} />
                IA analisou esta cotação
              </span>
            </>
          )}
        </div>

        {/* Título + ações */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                cotacao.status === "cotacao"   ? "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20" :
                cotacao.status === "aprovado"  ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20" :
                cotacao.status === "pendente"  ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20" :
                "bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700/50",
              )}>
                {cotacao.status === "cotacao" ? "Em cotação" :
                 cotacao.status === "aprovado" ? "Aprovado" :
                 cotacao.status === "pendente" ? "Pendente" :
                 cotacao.status === "rascunho" ? "Rascunho" : cotacao.status}
              </span>
              {cotacao.urgente && (
                <span className="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-500/10 text-red-400 ring-1 ring-red-500/20">
                  <AlertTriangle size={9} />
                  urgente
                </span>
              )}
            </div>
            <h1 className="text-2xl font-semibold text-zinc-50 leading-tight">{cotacao.titulo}</h1>
            <div className="flex items-center gap-4 mt-2 text-[12px] text-zinc-500">
              {nomeUnidades && (
                <span className="flex items-center gap-1">
                  <Users size={11} />
                  {nomeUnidades}
                </span>
              )}
              {cotacao.prazo && (
                <span className="flex items-center gap-1">
                  <Calendar size={11} />
                  Prazo: {formatDate(cotacao.prazo)}
                </span>
              )}
              {cotacao.comprador && (
                <span>Comprador: {cotacao.comprador.nome}</span>
              )}
            </div>
          </div>

          {/* Ações */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setAddFornModalOpen(true)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg border border-zinc-700",
                "bg-zinc-800/60 px-3 py-2 text-sm font-medium text-zinc-300",
                "hover:bg-zinc-700/60 transition-colors",
              )}
            >
              <Plus size={13} />
              Fornecedor
            </button>
            <button
              onClick={() => setWizardOpen(true)}
              disabled={itensComSelecao === 0}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-semibold transition-colors",
                "border-emerald-700/60 bg-emerald-500/10 text-emerald-400",
                "hover:bg-emerald-500/20",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              Gerar pedido{itensComSelecao > 0 && `s`}
            </button>
          </div>
        </div>
      </div>

      {/* ── Banner Sugestão IA ───────────────────────────────────────────────── */}
      {temSugestaoIA && iaBannerOpen && cotacao.ai_resumo && (
        <div className={cn(
          "relative rounded-xl border border-emerald-500/30 p-4",
          "bg-gradient-to-r from-emerald-500/[0.06] via-sky-500/[0.04] to-transparent",
        )}>
          <button
            onClick={() => setIaBannerOpen(false)}
            className="absolute top-3 right-3 p-1 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={14} />
          </button>
          <div className="flex items-start gap-4 pr-8">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-zinc-100">Sugestão da IA</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20 uppercase tracking-wider">
                  Economia detectada
                </span>
              </div>
              <p className="text-[13px] text-zinc-400 leading-relaxed">{cotacao.ai_resumo}</p>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={aplicarSugestaoIA}
                  disabled={pending}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/60",
                    "bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-400",
                    "hover:bg-emerald-500/25 transition-colors",
                    "disabled:opacity-50",
                  )}
                >
                  {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  Aplicar sugestão IA
                </button>
              </div>
            </div>
            {cotacao.economia && cotacao.economia > 0 && (
              <div className="text-right shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-zinc-600">Economia estimada</div>
                <div className="text-2xl font-mono font-semibold text-emerald-400 mt-0.5">
                  -{formatBRL(cotacao.economia)}
                </div>
                {cotacao.economia_pct && (
                  <div className="text-[12px] text-emerald-600">{cotacao.economia_pct.toFixed(1)}%</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Matriz comparativa ──────────────────────────────────────────────── */}
      {cotacao.cotacao_itens.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 flex flex-col items-center justify-center py-16 gap-2">
          <Sparkles size={28} className="text-zinc-700" />
          <p className="text-sm text-zinc-500">Nenhum item nesta cotação</p>
          <p className="text-xs text-zinc-600">Crie a cotação a partir de uma requisição para importar os itens</p>
        </div>
      ) : fornecedores.length === 0 ? (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 flex flex-col items-center justify-center py-16 gap-2">
          <Users size={28} className="text-zinc-700" />
          <p className="text-sm text-zinc-500">Nenhum fornecedor adicionado</p>
          <button
            onClick={() => setAddFornModalOpen(true)}
            className="mt-1 text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            + Adicionar fornecedor
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">

          {/* Legenda */}
          <div className="flex items-center gap-4 px-5 py-2.5 border-b border-zinc-800/60 bg-zinc-900/60">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <div className="w-3 h-3 rounded-sm bg-emerald-500/20 ring-1 ring-emerald-500/40" />
              melhor preço
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <div className="w-3 h-3 rounded-sm border border-dashed border-zinc-700" />
              não atende
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-500">
              <div className="w-3 h-3 rounded-sm bg-emerald-500/25 ring-1 ring-emerald-500/60" />
              selecionado
            </div>
          </div>

          {/* Scroll horizontal */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-max">
              <colgroup>
                <col className="w-64 min-w-64" />
                {fornecedores.map(f => <col key={f.id} className="w-44 min-w-44" />)}
                {temSugestaoIA && <col className="w-44 min-w-44" />}
              </colgroup>

              {/* Header: fornecedores */}
              <thead>
                <tr className="border-b border-zinc-800/60">
                  <th className="px-5 py-3 text-left">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-medium">
                      Item
                    </span>
                  </th>
                  {fornecedores.map((f, idx) => (
                    <th key={f.id} className="px-3 py-3 text-center border-l border-zinc-800/60">
                      <div className="flex flex-col items-center gap-1">
                        <div className={cn(
                          "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold",
                          AVATAR_COLORS[idx % AVATAR_COLORS.length],
                        )}>
                          {getInitials(getFornecedorNome(f))}
                        </div>
                        <div className="text-[12px] font-medium text-zinc-300 text-center leading-tight">
                          {getFornecedorNome(f)}
                        </div>
                        {f.pontualidade_pct !== null && (
                          <div className="text-[10px] text-zinc-600">
                            ⭐ {f.rating?.toFixed(1) ?? "—"} · {f.pontualidade_pct}% pontual
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                  {temSugestaoIA && (
                    <th className="px-3 py-3 text-center border-l-2 border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.04] to-transparent">
                      <div className="flex flex-col items-center gap-1">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center">
                          <Sparkles size={13} className="text-white" />
                        </div>
                        <div className="text-[12px] font-medium text-emerald-400">Sugestão IA</div>
                        <div className="text-[10px] text-emerald-600">mix ótimo por item</div>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>

              {/* Body: itens */}
              <tbody>
                {cotacao.cotacao_itens.map((item) => {
                  const prod = item.produtos;
                  return (
                    <tr key={item.id} className="border-b border-zinc-800/40 hover:bg-zinc-800/10 transition-colors">
                      {/* Nome do item */}
                      <td className="px-5 py-3">
                        <div className="text-sm font-medium text-zinc-200 truncate max-w-[220px]">
                          {prod?.nome ?? "—"}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-mono mt-0.5">
                          {item.quantidade} {prod?.unidade_med} · {prod?.categoria}
                        </div>
                      </td>

                      {/* Células de fornecedor */}
                      {fornecedores.map((f, idx) => {
                        const cell  = matrizMap[item.id]?.[f.id];
                        const naoAtende = !cell || cell.preco_unitario === null;
                        const ehMelhor  = !naoAtende && melhorPreco[item.id] === cell.preco_unitario;
                        const ehSel     = selecoes[item.id] === f.id;
                        const total     = cell?.preco_unitario ? cell.preco_unitario * item.quantidade : null;

                        return (
                          <td
                            key={f.id}
                            className={cn(
                              "px-3 py-2.5 text-center border-l border-zinc-800/60",
                              !naoAtende && "cursor-pointer",
                            )}
                            onClick={() => !naoAtende && toggleSelecao(item.id, f.id)}
                          >
                            {naoAtende ? (
                              <div className="flex items-center justify-center h-14 rounded-lg border border-dashed border-zinc-800/80 opacity-40">
                                <span className="text-[11px] text-zinc-600">não atende</span>
                              </div>
                            ) : (
                              <div className={cn(
                                "rounded-lg px-2 py-2 transition-all",
                                ehSel
                                  ? "bg-emerald-500/20 ring-1 ring-emerald-500/50"
                                  : ehMelhor
                                    ? "bg-emerald-500/[0.07] hover:bg-emerald-500/15"
                                    : "hover:bg-zinc-800/40",
                              )}>
                                <div className="flex items-center justify-center gap-1">
                                  {ehMelhor && !ehSel && (
                                    <div className="w-3 h-3 rounded-full bg-emerald-500/30 ring-1 ring-emerald-500 flex items-center justify-center">
                                      <Check size={7} className="text-emerald-400" />
                                    </div>
                                  )}
                                  {ehSel && (
                                    <div className="w-3 h-3 rounded-full bg-emerald-500 ring-1 ring-emerald-400 flex items-center justify-center">
                                      <Check size={7} className="text-zinc-950" />
                                    </div>
                                  )}
                                  <span className={cn(
                                    "font-mono text-sm font-semibold",
                                    ehSel ? "text-emerald-300" :
                                    ehMelhor ? "text-emerald-400" : "text-zinc-200",
                                  )}>
                                    {formatBRL(cell.preco_unitario)}
                                  </span>
                                </div>
                                {total !== null && (
                                  <div className={cn("text-[10px] mt-0.5", ehSel ? "text-emerald-600" : "text-zinc-600")}>
                                    total {formatBRL(total)}
                                  </div>
                                )}
                                <div className="flex items-center justify-between gap-1 mt-1">
                                  {cell.prazo_entrega_dias !== null && (
                                    <span className="text-[10px] text-zinc-600">{cell.prazo_entrega_dias}d</span>
                                  )}
                                  {cell.condicao_pagamento && (
                                    <span className="text-[10px] text-zinc-600 truncate">{cell.condicao_pagamento}</span>
                                  )}
                                </div>
                              </div>
                            )}
                          </td>
                        );
                      })}

                      {/* Coluna IA */}
                      {temSugestaoIA && (
                        <td className="px-3 py-2.5 text-center border-l-2 border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.03] to-transparent">
                          {item.melhor_forn ? (() => {
                            const forn  = fornecedores.find(f => f.id === item.melhor_forn);
                            const cell  = matrizMap[item.id]?.[item.melhor_forn];
                            const total = cell?.preco_unitario ? cell.preco_unitario * item.quantidade : null;
                            return (
                              <div className="rounded-lg px-2 py-2">
                                {forn && (
                                  <div className="text-[10px] text-emerald-600 mb-0.5 truncate">
                                    {getFornecedorNome(forn)}
                                  </div>
                                )}
                                <div className="font-mono text-sm font-semibold text-emerald-400">
                                  {formatBRL(cell?.preco_unitario ?? null) ?? "—"}
                                </div>
                                {total !== null && (
                                  <div className="text-[10px] text-emerald-700 mt-0.5">
                                    total {formatBRL(total)}
                                  </div>
                                )}
                              </div>
                            );
                          })() : (
                            <span className="text-[11px] text-zinc-700">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer: totais por fornecedor */}
              <tfoot>
                <tr className="border-t border-zinc-700/60 bg-zinc-900/60">
                  <td className="px-5 py-3 text-[11px] uppercase tracking-wider text-zinc-600 font-medium">
                    Total se 100%
                  </td>
                  {fornecedores.map((f) => {
                    let totalForn = 0;
                    let atendeAll = true;
                    for (const item of cotacao.cotacao_itens) {
                      const cell = matrizMap[item.id]?.[f.id];
                      if (!cell || !cell.preco_unitario) { atendeAll = false; continue; }
                      totalForn += cell.preco_unitario * item.quantidade;
                    }
                    const ehMelhorForn = atendeAll && totalForn === totalSemOtimizacao && totalSemOtimizacao > 0;
                    return (
                      <td key={f.id} className="px-3 py-3 text-center border-l border-zinc-800/60">
                        {totalForn > 0 ? (
                          <div>
                            <div className={cn(
                              "font-mono text-sm font-semibold",
                              ehMelhorForn ? "text-emerald-400" : "text-zinc-300",
                            )}>
                              {formatBRL(totalForn)}
                            </div>
                            {!atendeAll && (
                              <div className="text-[10px] text-zinc-600">parcial</div>
                            )}
                          </div>
                        ) : (
                          <span className="text-[12px] text-zinc-700">—</span>
                        )}
                      </td>
                    );
                  })}
                  {temSugestaoIA && (
                    <td className="px-3 py-3 text-center border-l-2 border-emerald-500/40">
                      {totalIA > 0 ? (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider text-emerald-600 font-medium mb-0.5">
                            melhor combinação
                          </div>
                          <div className="font-mono text-sm font-semibold text-emerald-400">
                            {formatBRL(totalIA)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-[12px] text-zinc-700">—</span>
                      )}
                    </td>
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Bottom Summary Bar (sticky) ──────────────────────────────────────── */}
      {itensComSelecao > 0 && (
        <div className={cn(
          "fixed bottom-0 left-0 right-0 z-30",
          "border-t border-zinc-800 bg-zinc-950/95 backdrop-blur-md",
          "px-6 py-3.5",
        )}>
          <div className="max-w-[1600px] mx-auto flex items-center gap-6">
            {/* Seleção atual */}
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-600">Seleção atual</div>
              <div className="font-mono text-sm font-semibold text-zinc-100">
                {formatBRL(totalSelecao) ?? "—"}
                <span className="text-zinc-600 text-[11px] ml-1.5">
                  {itensComSelecao}/{cotacao.cotacao_itens.length} itens
                </span>
              </div>
            </div>

            {temSugestaoIA && totalIA > 0 && (
              <>
                <div className="w-px h-8 bg-zinc-800" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700">✨ Mix ótimo IA</div>
                  <div className="font-mono text-sm font-semibold text-emerald-400">
                    {formatBRL(totalIA)}
                  </div>
                </div>
              </>
            )}

            {totalSemOtimizacao > 0 && (
              <>
                <div className="w-px h-8 bg-zinc-800" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-zinc-600">Sem otimização</div>
                  <div className="font-mono text-sm font-semibold text-zinc-500 line-through">
                    {formatBRL(totalSemOtimizacao)}
                  </div>
                </div>
              </>
            )}

            <div className="flex-1" />

            {economia > 0 && (
              <div className="text-right mr-4">
                <div className="text-[10px] uppercase tracking-wider text-emerald-700">Economia</div>
                <div className="font-mono text-lg font-bold text-emerald-400">
                  -{formatBRL(economia)}
                </div>
              </div>
            )}

            <button
              onClick={() => setWizardOpen(true)}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border",
                "border-emerald-700/60 bg-emerald-500/15 px-4 py-2.5",
                "text-sm font-semibold text-emerald-400",
                "hover:bg-emerald-500/25 transition-colors",
              )}
            >
              Gerar pedidos de compra →
            </button>
          </div>
        </div>
      )}

      {/* ── Wizard Gerar Pedidos ─────────────────────────────────────────────── */}
      <WizardGerarPedidos
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        cotacao={cotacao}
        selecoes={selecoes}
        fornecedores={fornecedores}
        matrizMap={matrizMap}
      />

      {/* ── Adicionar Fornecedor ─────────────────────────────────────────────── */}
      <AdicionarFornecedorModal
        open={addFornModalOpen}
        onClose={() => setAddFornModalOpen(false)}
        cotacaoId={cotacao.id}
        todosFornecedores={todosFornecedores}
        jaAdicionados={fornecedores.map(f => f.id)}
      />
    </div>
  );
}
