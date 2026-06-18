"use client";

/**
 * cotacao-detalhe-client.tsx — LHG-211/212
 * Mapa de cotação no estilo do quadro comparativo do setor de compras:
 *   cabeçalho documento → tabela (empresa/contato/telefone × itens) → rodapé
 *   (valor total · frete · total geral · cond. pgto · prazo · garantia).
 * Preserva seleção por item, sugestão IA, e geração de pedidos.
 */
import { useState, useMemo, useTransition, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Sparkles, X, Plus,
  Loader2, AlertTriangle, Calendar, Users, Check, Mail, Send, Info, Truck, ShieldCheck,
  FileDown, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { selecionarFornecedorItem, enviarEmailCotacao, removerFornecedorCotacao, vincularProdutoCotacaoItem } from "../../actions";
import { WizardGerarPedidos } from "./wizard-gerar-pedidos";
import { AdicionarFornecedorModal } from "./adicionar-fornecedor-modal";
import { AprovarCompraPanel } from "./aprovar-compra-panel";
import { MatrizCelula, type MatrizCellData } from "./matriz-celula";
import { ProdutoOmieModal } from "@/app/(app)/requisicoes/[id]/_components/produto-omie-modal";
import { CotacaoPrintDoc } from "./cotacao-print-doc";
import { calcularEconomia, type ItemEconomia } from "@/lib/cotacao/economia";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Produto        { id: string; codigo: string; nome: string; unidade_med: string; categoria: string; omie_codigo: string | null }
interface CotacaoItem    { id: string; quantidade: number; melhor_forn: string | null; selecionado_forn: string | null; produtos: Produto | null; cotacao_matriz: MatrizCellData[]; produto_nome_livre: string | null; produto_unidade_med: string | null; produto_novo: boolean | null }
interface FornecedorBase { id: string; razao_social: string; nome_fantasia: string | null; rating: number | null; pontualidade_pct: number | null; email?: string | null; telefone?: string | null; contato?: string | null }
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

function formatBRL(v: number | null | undefined) {
  if (v == null) return null;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

function getFornecedorNome(f: FornecedorBase) {
  return f.nome_fantasia || f.razao_social;
}

function getInitials(nome: string) {
  return nome.split(" ").slice(0, 2).map(n => n[0]).join("").toUpperCase();
}

function formatDate(iso: string) {
  const str = iso.includes("T") ? iso : `${iso}T12:00:00`;
  return new Date(str).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

function formatDataCompleta(iso: string) {
  const str = iso.includes("T") ? iso : `${iso}T12:00:00`;
  return new Date(str).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function renderStars(rating: number | null) {
  if (rating == null) return null;
  const full = Math.round(rating);
  return (
    <span className="text-amber-400/80" title={`Avaliação: ${rating.toFixed(1)} de 5`}>
      {"★".repeat(full)}{"☆".repeat(5 - full)}
    </span>
  );
}

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

  // Seleção por item (otimista)
  const [selecoes, setSelecoes] = useState<Record<string, string | null>>(() => {
    const m: Record<string, string | null> = {};
    for (const item of cotacao.cotacao_itens) m[item.id] = item.selecionado_forn;
    return m;
  });

  // Overrides locais para células editadas sem aguardar revalidação
  const [matrizOverrides, setMatrizOverrides] = useState<Record<string, Record<string, Partial<MatrizCellData>>>>({});

  const [iaBannerOpen,     setIaBannerOpen]    = useState(true);
  const [wizardOpen,       setWizardOpen]       = useState(false);
  const [addFornModalOpen, setAddFornModalOpen] = useState(false);
  const [emailModalOpen,   setEmailModalOpen]   = useState(false);
  const [emailMensagem,    setEmailMensagem]    = useState("");
  const [removingFornId,   setRemovingFornId]   = useState<string | null>(null);
  const [cadastroItem,     setCadastroItem]     = useState<{ id: string; nome: string } | null>(null);
  const [printOpen,        setPrintOpen]        = useState(false);
  const [mounted,          setMounted]          = useState(false);

  const unidadeIdCotacao = cotacao.cotacao_unidades[0]?.unidade_id ?? "";

  useEffect(() => setMounted(true), []);

  // Liga o modo de impressão escopado (CSS em globals.css) enquanto o overlay
  // de PDF está aberto — assim window.print() imprime só o documento.
  useEffect(() => {
    document.body.classList.toggle("cotacao-print-mode", printOpen);
    return () => document.body.classList.remove("cotacao-print-mode");
  }, [printOpen]);

  const editavel = cotacao.status !== "aprovado" && cotacao.status !== "aprovada" && cotacao.status !== "fechada";

  async function handleRemoverFornecedor(fornecedorId: string, nome: string) {
    if (!confirm(`Remover "${nome}" desta cotação?`)) return;
    setRemovingFornId(fornecedorId);
    try {
      await removerFornecedorCotacao(cotacao.id, fornecedorId);
      toast.success("Fornecedor removido");
      router.refresh();
    } catch {
      toast.error("Erro ao remover fornecedor");
    } finally {
      setRemovingFornId(null);
    }
  }

  const fornecedores = cotacao.cotacao_fornecedores
    .map(cf => cf.fornecedores)
    .filter(Boolean) as FornecedorBase[];

  // Mapa item → fornecedor → célula (mesclado com overrides locais)
  const matrizMap = useMemo(() => {
    const m: Record<string, Record<string, MatrizCellData>> = {};
    for (const item of cotacao.cotacao_itens) {
      m[item.id] = {};
      for (const cell of item.cotacao_matriz) {
        const override = matrizOverrides[item.id]?.[cell.fornecedor_id] ?? {};
        m[item.id][cell.fornecedor_id] = { ...cell, ...override };
      }
      for (const [fornId, override] of Object.entries(matrizOverrides[item.id] ?? {})) {
        if (!m[item.id][fornId]) {
          m[item.id][fornId] = {
            cotacao_item_id: item.id,
            fornecedor_id: fornId,
            preco_unitario: null,
            prazo_entrega_dias: null,
            condicao_pagamento: null,
            observacao: null,
            frete: null,
            garantia: null,
            ...override,
          } as MatrizCellData;
        }
      }
    }
    return m;
  }, [cotacao.cotacao_itens, matrizOverrides]);

  // Menor preço por item
  const melhorPreco = useMemo(() => {
    const m: Record<string, number> = {};
    for (const item of cotacao.cotacao_itens) {
      const precos = Object.values(matrizMap[item.id] ?? {})
        .map(c => c.preco_unitario)
        .filter((p): p is number => p != null && p > 0);
      if (precos.length > 0) m[item.id] = Math.min(...precos);
    }
    return m;
  }, [matrizMap, cotacao.cotacao_itens]);

  // Soma dos itens por fornecedor (sem frete) + soma de frete das células
  function subtotalItensForn(fornId: string): { total: number; atendeAll: boolean } {
    let total = 0;
    let atendeAll = true;
    for (const item of cotacao.cotacao_itens) {
      const cell = matrizMap[item.id]?.[fornId];
      if (!cell?.preco_unitario) { atendeAll = false; continue; }
      total += cell.preco_unitario * item.quantidade;
    }
    return { total, atendeAll };
  }
  // Frete total do fornecedor = soma do frete das células cotadas
  function freteForn(fornId: string): number {
    let frete = 0;
    for (const item of cotacao.cotacao_itens) {
      const cell = matrizMap[item.id]?.[fornId];
      if (cell?.preco_unitario && cell.frete) frete += cell.frete;
    }
    return frete;
  }
  // Total efetivamente SELECIONADO deste fornecedor (itens marcados como vencedor
  // dele) + frete dessas células — é o valor do pedido que sairá. Usado para
  // conferir pedido mínimo. { total, itens } com itens = nº de itens escolhidos.
  function totalSelecionadoForn(fornId: string): { total: number; itens: number } {
    let total = 0;
    let qtdItens = 0;
    for (const item of cotacao.cotacao_itens) {
      if (selecoes[item.id] !== fornId) continue;
      const cell = matrizMap[item.id]?.[fornId];
      if (!cell?.preco_unitario) continue;
      total += cell.preco_unitario * item.quantidade + (cell.frete ?? 0);
      qtdItens++;
    }
    return { total, itens: qtdItens };
  }
  // Garantias distintas informadas pelo fornecedor (consolidado para o rodapé)
  function garantiaForn(fornId: string): string | null {
    const set = new Set<string>();
    for (const item of cotacao.cotacao_itens) {
      const g = matrizMap[item.id]?.[fornId]?.garantia?.trim();
      if (g) set.add(g);
    }
    return set.size > 0 ? Array.from(set).join(" · ") : null;
  }

  // Prazo de entrega agregado (maior prazo entre itens cotados) e condição predominante
  function prazoForn(fornId: string): number | null {
    const prazos = cotacao.cotacao_itens
      .map(i => matrizMap[i.id]?.[fornId]?.prazo_entrega_dias)
      .filter((p): p is number => p != null);
    return prazos.length > 0 ? Math.max(...prazos) : null;
  }
  function pagamentoForn(fornId: string): string | null {
    const cond = cotacao.cotacao_itens
      .map(i => matrizMap[i.id]?.[fornId]?.condicao_pagamento)
      .find(c => c && c.trim());
    return cond ?? null;
  }

  // Totais de seleção (mix): soma itens selecionados + frete da célula selecionada
  const totalSelecao = useMemo(() => {
    let total = 0;
    for (const item of cotacao.cotacao_itens) {
      const fornId = selecoes[item.id];
      if (!fornId) continue;
      const cell = matrizMap[item.id]?.[fornId];
      if (cell?.preco_unitario) total += cell.preco_unitario * item.quantidade + (cell.frete ?? 0);
    }
    return total;
  }, [selecoes, matrizMap, cotacao.cotacao_itens]);

  const totalIA = useMemo(() => {
    let total = 0;
    for (const item of cotacao.cotacao_itens) {
      const fornId = item.melhor_forn;
      if (!fornId) continue;
      const cell = matrizMap[item.id]?.[fornId];
      if (cell?.preco_unitario) total += cell.preco_unitario * item.quantidade + (cell.frete ?? 0);
    }
    return total;
  }, [matrizMap, cotacao.cotacao_itens]);

  // Total por fornecedor (itens + frete) e o menor entre fornecedores que atendem tudo
  // Economia em tempo real — MESMO critério gravado na aprovação e mostrado na
  // lista (calcularEconomia: vs maior preço cotado por item, só com concorrência).
  // Antes a barra usava "mix vs fornecedor único", divergindo da lista.
  const economia = useMemo(() => {
    const itensEcon: ItemEconomia[] = cotacao.cotacao_itens
      .filter(i => selecoes[i.id])
      .map(i => {
        const venc = selecoes[i.id]!;
        const cell = matrizMap[i.id]?.[venc];
        return {
          quantidade:    i.quantidade,
          precoVencedor: cell?.preco_unitario ?? 0,
          precosCotados: Object.values(matrizMap[i.id] ?? {})
            .map(c => c.preco_unitario)
            .filter((p): p is number => p != null && p > 0),
        };
      })
      .filter(it => it.precoVencedor > 0);
    return calcularEconomia(itensEcon).economia ?? 0;
  }, [selecoes, matrizMap, cotacao.cotacao_itens]);

  const itensComSelecao = cotacao.cotacao_itens.filter(i => selecoes[i.id]).length;

  // ── Handlers ──────────────────────────────────────────────────────────────

  function toggleSelecao(itemId: string, fornId: string) {
    const atual = selecoes[itemId];
    const novo = atual === fornId ? null : fornId;
    setSelecoes(s => ({ ...s, [itemId]: novo }));
    startTransition(async () => {
      try {
        await selecionarFornecedorItem(itemId, novo);
      } catch {
        setSelecoes(s => ({ ...s, [itemId]: atual }));
        toast.error("Erro ao salvar seleção");
      }
    });
  }

  function handleCellSaved(itemId: string, fornId: string, data: Partial<MatrizCellData>) {
    setMatrizOverrides(prev => ({
      ...prev,
      [itemId]: { ...(prev[itemId] ?? {}), [fornId]: { ...(prev[itemId]?.[fornId] ?? {}), ...data } },
    }));
  }

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
            .map(i => selecionarFornecedorItem(i.id, i.melhor_forn)),
        );
        toast.success("Sugestão IA aplicada a todos os itens");
      } catch {
        toast.error("Erro ao aplicar sugestão IA");
      }
    });
  }

  function handleEnviarEmail() {
    startTransition(async () => {
      try {
        const res = await enviarEmailCotacao(cotacao.id, { mensagem: emailMensagem || undefined });
        setEmailModalOpen(false);
        setEmailMensagem("");
        if (res.erros.length > 0) {
          toast.warning(`${res.enviados} email(s) enviado(s). ${res.erros.length} erro(s): ${res.erros[0]}`);
        } else {
          toast.success(`Cotação enviada para ${res.enviados} fornecedor(es)`);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao enviar email");
      }
    });
  }

  const temSugestaoIA = cotacao.cotacao_itens.some(i => i.melhor_forn);
  const nomeUnidades  = cotacao.cotacao_unidades.map(cu => cu.unidades?.nome).filter(Boolean).join(", ");
  const fornComEmail  = fornecedores.filter(f => f.email);

  // Larguras de coluna
  const colItem = "w-[320px] min-w-[320px]";
  const colForn = "w-[200px] min-w-[200px]";

  return (
    <div className="max-w-[1600px] mx-auto pb-24 space-y-4">

      {/* ── Navegação + ações ───────────────────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center gap-3 text-[12px] text-muted-foreground">
          <button
            onClick={() => router.push("/cotacoes")}
            className="flex items-center gap-1 hover:text-foreground/80 transition-colors"
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

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className={cn(
                "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium",
                cotacao.status === "cotacao"  ? "bg-sky-500/10 text-sky-400 ring-1 ring-sky-500/20" :
                cotacao.status === "aprovado" ? "bg-emerald-500/10 text-emerald-400 ring-1 ring-emerald-500/20" :
                cotacao.status === "pendente" ? "bg-amber-500/10 text-amber-400 ring-1 ring-amber-500/20" :
                "bg-muted text-muted-foreground ring-1 ring-border/50",
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
            <h1 className="text-2xl font-semibold text-foreground leading-tight">{cotacao.titulo}</h1>
            <div className="flex items-center gap-4 mt-2 text-[12px] text-muted-foreground">
              {nomeUnidades && (
                <span className="flex items-center gap-1"><Users size={11} />{nomeUnidades}</span>
              )}
              {cotacao.prazo && (
                <span className="flex items-center gap-1"><Calendar size={11} />Prazo: {formatDate(cotacao.prazo)}</span>
              )}
              {cotacao.comprador && <span>Comprador: {cotacao.comprador.nome}</span>}
            </div>
          </div>

          {/* Ações */}
          <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
            {fornComEmail.length > 0 && (
              <button
                onClick={() => setEmailModalOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-700/60 bg-sky-500/10 px-3 py-2 text-sm font-medium text-sky-400 hover:bg-sky-500/20 transition-colors"
              >
                <Mail size={13} />
                <span className="hidden sm:inline">Solicitar cotação</span>
                <span className="sm:hidden">Cotação</span>
              </button>
            )}
            <button
              onClick={() => setAddFornModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-muted transition-colors"
            >
              <Plus size={13} />
              Fornecedor
            </button>
            <button
              onClick={() => setPrintOpen(true)}
              disabled={cotacao.cotacao_itens.length === 0 || fornecedores.length === 0}
              title="Exportar o mapa de cotação em PDF"
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-3 py-2 text-sm font-medium text-foreground/80 hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <FileDown size={13} />
              <span className="hidden sm:inline">Exportar </span>PDF
            </button>
            <button
              onClick={() => setWizardOpen(true)}
              disabled={itensComSelecao === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-3.5 py-2 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Gerar pedido{itensComSelecao > 0 ? "s" : ""}
            </button>
          </div>
        </div>
      </div>

      {/* ── Banner Sugestão IA ───────────────────────────────────────────────── */}
      {temSugestaoIA && iaBannerOpen && cotacao.ai_resumo && (
        <div className="relative rounded-xl border border-emerald-500/30 p-4 bg-gradient-to-r from-emerald-500/[0.06] via-sky-500/[0.04] to-transparent">
          <button
            onClick={() => setIaBannerOpen(false)}
            className="absolute top-3 right-3 p-1 text-muted-foreground hover:text-foreground/80 transition-colors"
          >
            <X size={14} />
          </button>
          <div className="flex items-start gap-4 pr-8">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center shrink-0">
              <Sparkles size={14} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-sm font-semibold text-foreground">Sugestão da IA</span>
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/20 uppercase tracking-wider">
                  Economia detectada
                </span>
              </div>
              <p className="text-[13px] text-muted-foreground leading-relaxed">{cotacao.ai_resumo}</p>
              <button
                onClick={aplicarSugestaoIA}
                disabled={pending}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-emerald-700/60 bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-400 hover:bg-emerald-500/25 transition-colors disabled:opacity-50"
              >
                {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Aplicar sugestão IA
              </button>
            </div>
            {cotacao.economia && cotacao.economia > 0 && (
              <div className="text-right shrink-0">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Economia estimada</div>
                <div className="text-2xl font-mono font-semibold text-emerald-400 mt-0.5">-{formatBRL(cotacao.economia)}</div>
                {cotacao.economia_pct && (
                  <div className="text-[12px] text-emerald-600">{cotacao.economia_pct.toFixed(1)}%</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Mapa de cotação (documento) ─────────────────────────────────────── */}
      {cotacao.cotacao_itens.length === 0 ? (
        <div className="rounded-xl border border-border/80 bg-muted/40 flex flex-col items-center justify-center py-16 gap-2">
          <Sparkles size={28} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhum item nesta cotação</p>
          <p className="text-xs text-muted-foreground/70">Crie a cotação a partir de uma requisição para importar os itens</p>
        </div>
      ) : fornecedores.length === 0 ? (
        <div className="rounded-xl border border-border/80 bg-muted/40 flex flex-col items-center justify-center py-16 gap-2">
          <Users size={28} className="text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Nenhum fornecedor adicionado</p>
          <button
            onClick={() => setAddFornModalOpen(true)}
            className="mt-1 text-xs text-emerald-500 hover:text-emerald-400 transition-colors"
          >
            + Adicionar fornecedor
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-border/80 bg-card overflow-hidden shadow-sm">

          {/* Faixa de cabeçalho do documento */}
          <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-border/70 bg-gradient-to-r from-muted/70 to-muted/30">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-foreground/[0.06] ring-1 ring-border/60 flex items-center justify-center">
                <Scale className="text-foreground/70" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground/70 font-semibold">Mapa de Cotação</div>
                <div className="text-sm font-semibold text-foreground leading-tight">{cotacao.titulo}</div>
              </div>
            </div>
            <div className="flex items-center gap-6 text-right">
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Data</div>
                <div className="text-[12px] font-mono text-foreground/80">{formatDataCompleta(cotacao.created_at)}</div>
              </div>
              {cotacao.comprador && (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Comprador</div>
                  <div className="text-[12px] text-foreground/80">{cotacao.comprador.nome}</div>
                </div>
              )}
              <div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground/60">Fornecedores</div>
                <div className="text-[12px] font-mono text-foreground/80">{fornecedores.length}</div>
              </div>
            </div>
          </div>

          {/* Legenda */}
          <div className="flex items-center gap-5 px-5 py-2 border-b border-border/50 bg-muted/30">
            <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium">Legenda:</span>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
              <div className="w-3 h-3 rounded-sm bg-emerald-500/[0.07] ring-1 ring-emerald-500/40" />
              Menor preço do item
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/70">
              <div className="w-3 h-3 rounded-sm bg-emerald-500/20 ring-1 ring-emerald-500/60" />
              Escolhido (clique para selecionar)
            </div>
            <div className="ml-auto flex items-center gap-1 text-[10px] text-muted-foreground/40">
              <Info size={10} />
              Lápis = preço/prazo · rodapé = frete e garantia
            </div>
          </div>

          {/* Tabela */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-max border-separate border-spacing-0">
              <colgroup>
                <col className={colItem} />
                {fornecedores.map(f => <col key={f.id} className={colForn} />)}
                {temSugestaoIA && <col className="w-[190px] min-w-[190px]" />}
              </colgroup>

              {/* Header: blocos de fornecedor (empresa / contato / telefone) */}
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 bg-card px-5 py-3 text-left align-bottom border-b-2 border-border/70">
                    <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground font-semibold">Descrição dos produtos</div>
                  </th>
                  {fornecedores.map((f, idx) => (
                    <th key={f.id} className="px-3 py-3 text-center align-top border-l border-b-2 border-border/70 relative">
                      {editavel && (
                        <button
                          onClick={() => handleRemoverFornecedor(f.id, getFornecedorNome(f))}
                          disabled={removingFornId === f.id}
                          title="Remover fornecedor"
                          className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center bg-muted/60 hover:bg-destructive/20 hover:text-destructive text-muted-foreground transition-colors disabled:opacity-50"
                        >
                          {removingFornId === f.id ? <Loader2 size={9} className="animate-spin" /> : <X size={9} />}
                        </button>
                      )}
                      <div className="flex flex-col items-center gap-1.5">
                        <div className={cn(
                          "w-9 h-9 rounded-lg flex items-center justify-center text-[12px] font-bold",
                          AVATAR_COLORS[idx % AVATAR_COLORS.length],
                        )}>
                          {getInitials(getFornecedorNome(f))}
                        </div>
                        <div className="text-[12px] font-semibold text-foreground text-center leading-tight max-w-[170px] break-words">
                          {getFornecedorNome(f)}
                        </div>
                        {/* Contato / telefone */}
                        <div className="text-[10px] text-muted-foreground/70 leading-snug text-center space-y-0.5">
                          <div className="truncate max-w-[170px]" title={f.contato ?? undefined}>
                            {f.contato || <span className="text-muted-foreground/30">contato —</span>}
                          </div>
                          <div className="font-mono" title={f.telefone ?? undefined}>
                            {f.telefone || <span className="text-muted-foreground/30">tel —</span>}
                          </div>
                        </div>
                        {/* Rating */}
                        {(f.rating != null || f.pontualidade_pct != null) && (
                          <div className="flex flex-col items-center gap-0.5 pt-0.5">
                            {f.rating != null && (
                              <div className="flex items-center gap-1 text-[10px]" title={`Avaliação histórica: ${f.rating.toFixed(1)} de 5`}>
                                {renderStars(f.rating)}
                                <span className="text-muted-foreground/50">{f.rating.toFixed(1)}</span>
                              </div>
                            )}
                            {f.pontualidade_pct != null && (
                              <div className="text-[10px] text-muted-foreground/50" title="Entregas no prazo combinado">
                                {f.pontualidade_pct}% no prazo
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </th>
                  ))}
                  {temSugestaoIA && (
                    <th className="px-3 py-3 text-center align-top border-l-2 border-b-2 border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.05] to-transparent">
                      <div className="flex flex-col items-center gap-1.5">
                        <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-emerald-500 to-sky-500 flex items-center justify-center">
                          <Sparkles size={14} className="text-white" />
                        </div>
                        <div className="text-[12px] font-semibold text-emerald-400">Sugestão IA</div>
                        <div className="text-[10px] text-emerald-600 max-w-[150px] leading-snug">melhor combinação por item</div>
                      </div>
                    </th>
                  )}
                </tr>
              </thead>

              {/* Body: itens numerados */}
              <tbody>
                {cotacao.cotacao_itens.map((item, idx) => {
                  const prod = item.produtos;
                  // Item livre (sem produto no catálogo) precisa ser cadastrado
                  // para virar pedido. Produtos do catálogo já servem (com ou sem
                  // vínculo Omie — unidades internas como Altana não têm omie_codigo).
                  const precisaCadastro = item.produto_novo === true && !prod;
                  const nomeItem = prod?.nome ?? item.produto_nome_livre ?? "—";
                  const unidItem = prod?.unidade_med ?? item.produto_unidade_med ?? "";
                  return (
                    <tr key={item.id} className="group/row hover:bg-muted/20 transition-colors">
                      {/* Item */}
                      <td className="sticky left-0 z-10 bg-card px-5 py-3 align-top border-b border-border/40">
                        <div className="flex items-start gap-2.5">
                          <span className="mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded bg-muted text-[10px] font-mono font-semibold text-muted-foreground/80 shrink-0 tabular-nums">
                            {idx + 1}
                          </span>
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-foreground leading-snug">
                              {nomeItem}
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="inline-flex items-center rounded bg-foreground/[0.05] px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground/80 tabular-nums">
                                {item.quantidade} {unidItem}
                              </span>
                              {prod?.codigo && (
                                <span className="text-[10px] text-muted-foreground/40 font-mono">{prod.codigo}</span>
                              )}
                              {precisaCadastro && (
                                editavel ? (
                                  <button
                                    onClick={() => setCadastroItem({ id: item.id, nome: nomeItem })}
                                    title="Cadastrar este produto no catálogo — necessário antes de gerar o pedido de compra"
                                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/25 hover:bg-amber-500/25 uppercase tracking-wide transition-colors"
                                  >
                                    <AlertTriangle size={9} />
                                    cadastrar produto
                                  </button>
                                ) : (
                                  <span
                                    title="Produto ainda não cadastrado no catálogo — necessário antes de gerar o pedido."
                                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium bg-amber-500/12 text-amber-400 ring-1 ring-amber-500/25 uppercase tracking-wide"
                                  >
                                    <AlertTriangle size={9} />
                                    produto não cadastrado
                                  </span>
                                )
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Células de fornecedor */}
                      {fornecedores.map((f) => {
                        const cell = matrizMap[item.id]?.[f.id] ?? null;
                        const temPreco = cell?.preco_unitario != null && cell.preco_unitario > 0;
                        const ehMelhor = temPreco && melhorPreco[item.id] === cell?.preco_unitario;
                        const ehSel = selecoes[item.id] === f.id;
                        return (
                          <td key={f.id} className="px-2.5 py-2.5 align-top border-l border-b border-border/40">
                            <MatrizCelula
                              itemId={item.id}
                              fornecedorId={f.id}
                              quantidade={item.quantidade}
                              cell={cell}
                              ehMelhorPreco={ehMelhor}
                              ehSelecionado={ehSel}
                              onToggleSelecao={toggleSelecao}
                              onCellSaved={handleCellSaved}
                            />
                          </td>
                        );
                      })}

                      {/* Coluna IA */}
                      {temSugestaoIA && (
                        <td className="px-3 py-2.5 align-top text-center border-l-2 border-b border-emerald-500/30 bg-gradient-to-b from-emerald-500/[0.03] to-transparent">
                          {item.melhor_forn ? (() => {
                            const forn = fornecedores.find(f => f.id === item.melhor_forn);
                            const cell = matrizMap[item.id]?.[item.melhor_forn];
                            const total = cell?.preco_unitario ? cell.preco_unitario * item.quantidade : null;
                            return (
                              <div className="rounded-lg px-2 py-2">
                                {forn && (
                                  <div className="text-[10px] text-emerald-600 mb-0.5 truncate">{getFornecedorNome(forn)}</div>
                                )}
                                <div className="font-mono text-sm font-semibold text-emerald-400">
                                  {formatBRL(cell?.preco_unitario) ?? "—"}
                                </div>
                                {total !== null && (
                                  <div className="text-[10px] text-emerald-700 mt-0.5">total {formatBRL(total)}</div>
                                )}
                              </div>
                            );
                          })() : (
                            <span className="text-[11px] text-muted-foreground/40">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer: subtotal · frete · total · pagamento · prazo · garantia */}
              <tfoot className="text-[12px]">
                {/* Subtotal itens */}
                <RodapeLinha
                  label="Subtotal itens"
                  colItemClass={colItem}
                  fornecedores={fornecedores}
                  render={(f) => {
                    const { total, atendeAll } = subtotalItensForn(f.id);
                    return total > 0 ? (
                      <div className="font-mono text-foreground/70">
                        {formatBRL(total)}
                        {!atendeAll && <span className="block text-[9px] text-muted-foreground/50">parcial</span>}
                      </div>
                    ) : <span className="text-muted-foreground/30">—</span>;
                  }}
                  temIA={temSugestaoIA}
                  iaContent={<span className="text-muted-foreground/40">—</span>}
                  topBorder
                />

                {/* Frete (consolidado das células) */}
                <RodapeLinha
                  label="Frete"
                  icon={<Truck size={11} className="text-muted-foreground/50" />}
                  colItemClass={colItem}
                  fornecedores={fornecedores}
                  render={(f) => {
                    const { atendeAll } = subtotalItensForn(f.id);
                    const frete = freteForn(f.id);
                    const temCotacao = atendeAll || subtotalItensForn(f.id).total > 0;
                    if (!temCotacao) return <span className="text-muted-foreground/30">—</span>;
                    return frete > 0
                      ? <span className="font-mono text-foreground/70">{formatBRL(frete)}</span>
                      : <span className="text-[11px] text-emerald-500/70">grátis</span>;
                  }}
                  temIA={temSugestaoIA}
                  iaContent={<span className="text-muted-foreground/40">—</span>}
                />

                {/* Total selecionado por fornecedor (o que vai virar pedido) */}
                <RodapeLinha
                  label="Total selecionado"
                  strong
                  colItemClass={colItem}
                  fornecedores={fornecedores}
                  render={(f) => {
                    const { total, itens } = totalSelecionadoForn(f.id);
                    return itens > 0 ? (
                      <div className="font-mono text-sm font-bold text-emerald-400">
                        {formatBRL(total)}
                        <span className="block text-[9px] font-medium text-emerald-600/80 uppercase tracking-wider">
                          {itens} {itens === 1 ? "item" : "itens"}
                        </span>
                      </div>
                    ) : <span className="text-muted-foreground/30">—</span>;
                  }}
                  temIA={temSugestaoIA}
                  iaContent={totalIA > 0
                    ? <div className="font-mono text-sm font-bold text-emerald-400">{formatBRL(totalIA)}</div>
                    : <span className="text-muted-foreground/40">—</span>}
                />

                {/* Condição de pagamento */}
                <RodapeLinha
                  label="Cond. pgto"
                  colItemClass={colItem}
                  fornecedores={fornecedores}
                  render={(f) => {
                    const p = pagamentoForn(f.id);
                    return p ? <span className="text-foreground/70">{p}</span> : <span className="text-muted-foreground/30">—</span>;
                  }}
                  temIA={temSugestaoIA}
                  iaContent={null}
                />

                {/* Prazo de entrega */}
                <RodapeLinha
                  label="Prazo entrega"
                  colItemClass={colItem}
                  fornecedores={fornecedores}
                  render={(f) => {
                    const p = prazoForn(f.id);
                    return p != null ? <span className="font-mono text-foreground/70">{p} dias</span> : <span className="text-muted-foreground/30">—</span>;
                  }}
                  temIA={temSugestaoIA}
                  iaContent={null}
                />

                {/* Garantia (consolidada das células) */}
                <RodapeLinha
                  label="Garantia"
                  icon={<ShieldCheck size={11} className="text-muted-foreground/50" />}
                  colItemClass={colItem}
                  fornecedores={fornecedores}
                  render={(f) => {
                    const g = garantiaForn(f.id);
                    return g ? <span className="text-foreground/70">{g}</span> : <span className="text-muted-foreground/30">—</span>;
                  }}
                  temIA={temSugestaoIA}
                  iaContent={null}
                  last
                />
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* ── Bottom Summary Bar (sticky) ──────────────────────────────────────── */}
      {itensComSelecao > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-30 border-t border-border bg-background/95 backdrop-blur-md px-6 py-3.5">
          <div className="max-w-[1600px] mx-auto flex items-center gap-6">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Seleção atual (c/ frete)</div>
              <div className="font-mono text-sm font-semibold text-foreground">
                {formatBRL(totalSelecao) ?? "—"}
                <span className="text-muted-foreground/70 text-[11px] ml-1.5">
                  {itensComSelecao}/{cotacao.cotacao_itens.length} itens
                </span>
              </div>
            </div>
            {temSugestaoIA && totalIA > 0 && (
              <>
                <div className="w-px h-8 bg-border" />
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-emerald-700">✨ Mix ótimo IA</div>
                  <div className="font-mono text-sm font-semibold text-emerald-400">{formatBRL(totalIA)}</div>
                </div>
              </>
            )}
            <div className="flex-1" />
            {economia > 0 && (
              <div className="text-right mr-4">
                <div className="text-[10px] uppercase tracking-wider text-emerald-700">Economia (vs maior preço)</div>
                <div className="font-mono text-lg font-bold text-emerald-400">{formatBRL(economia)}</div>
              </div>
            )}
            <button
              onClick={() => setWizardOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-500/15 px-4 py-2.5 text-sm font-semibold text-emerald-400 hover:bg-emerald-500/25 transition-colors"
            >
              Gerar pedidos de compra →
            </button>
          </div>
        </div>
      )}

      {/* ── Painel de aprovação ──────────────────────────────────────────────── */}
      {(cotacao.status === "cotacao" || cotacao.status === "pendente" || cotacao.status === "rascunho") && (
        <AprovarCompraPanel
          cotacaoId={cotacao.id}
          cotacaoStatus={cotacao.status as string}
          itens={(cotacao.cotacao_itens as any[]).map((item: any) => ({
            id:               item.id,
            quantidade:       item.quantidade,
            selecionado_forn: (selecoes as Record<string, string | null>)[item.id] ?? item.selecionado_forn ?? null,
            produtos:         item.produtos ? { nome: item.produtos.nome } : null,
          }))}
          fornecedores={(cotacao.cotacao_fornecedores as any[])
            .map((cf: any) => cf.fornecedores)
            .filter(Boolean)}
        />
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

      {/* ── Overlay de exportação PDF (portal no body p/ impressão limpa) ────── */}
      {mounted && printOpen && createPortal(
        <div data-cotacao-print className="fixed inset-0 z-[200] flex flex-col bg-zinc-200/95 backdrop-blur-sm">
          {/* Barra de ações — não vai para o PDF */}
          <div className="no-print flex items-center justify-between gap-3 bg-zinc-900 px-4 sm:px-6 py-3 text-white shadow-lg">
            <span className="text-sm font-medium flex items-center gap-2">
              <FileDown size={15} className="text-emerald-400" />
              <span className="hidden sm:inline">Pré-visualização — </span>Mapa de Cotação
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white hover:bg-emerald-600 transition-colors"
              >
                <Printer size={14} />
                Imprimir / Salvar PDF
              </button>
              <button
                onClick={() => setPrintOpen(false)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-600 px-3 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 transition-colors"
              >
                <X size={14} />
                Fechar
              </button>
            </div>
          </div>

          {/* Área de papel — rolável na tela, fluxo normal no print */}
          <div className="print-scroll flex-1 overflow-auto p-4 sm:p-8">
            <div className="print-paper mx-auto w-full max-w-[1100px] rounded-sm bg-white shadow-2xl">
              <CotacaoPrintDoc
                numero={cotacao.numero}
                titulo={cotacao.titulo}
                unidades={nomeUnidades}
                comprador={cotacao.comprador?.nome ?? null}
                dataEmissao={formatDataCompleta(cotacao.created_at)}
                prazo={cotacao.prazo ? formatDate(cotacao.prazo) : null}
                fornecedores={fornecedores.map(f => ({
                  id: f.id, razao_social: f.razao_social, nome_fantasia: f.nome_fantasia,
                  telefone: f.telefone ?? null, contato: f.contato ?? null,
                }))}
                itens={cotacao.cotacao_itens}
                selecoes={selecoes}
                matrizMap={matrizMap}
              />
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ── Modal Cadastrar Produto no Omie (item livre da cotação) ──────────── */}
      {cadastroItem && unidadeIdCotacao && (
        <ProdutoOmieModal
          open={true}
          onClose={() => setCadastroItem(null)}
          unidadeId={unidadeIdCotacao}
          nomeSugerido={cadastroItem.nome}
          onCreated={async (produtoId) => {
            const res = await vincularProdutoCotacaoItem(cadastroItem.id, produtoId);
            if ("erro" in res) { toast.error(res.erro); return; }
            setCadastroItem(null);
            router.refresh();
          }}
        />
      )}

      {/* ── Modal Email Solicitar Cotação ────────────────────────────────────── */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" aria-modal="true" role="dialog">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => { setEmailModalOpen(false); setEmailMensagem(""); }}
          />
          <div className="relative w-full max-w-md rounded-xl border border-border bg-background shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/60">
              <div className="flex items-center gap-2">
                <Mail size={14} className="text-sky-400" />
                <span className="text-sm font-semibold text-foreground">Solicitar Cotação por E-mail</span>
              </div>
              <button
                onClick={() => { setEmailModalOpen(false); setEmailMensagem(""); }}
                className="text-muted-foreground hover:text-foreground/80 transition-colors"
              >
                <X size={15} />
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="rounded-lg border border-border/60 bg-muted/40 px-4 py-3 space-y-1.5">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">Será enviado para</div>
                <div className="space-y-1">
                  {fornComEmail.map(f => (
                    <div key={f.id} className="flex items-center gap-2 text-sm text-foreground/80">
                      <div className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
                      {f.nome_fantasia ?? f.razao_social}
                    </div>
                  ))}
                </div>
                <div className="text-[11px] text-muted-foreground/70 pt-0.5">
                  {cotacao.cotacao_itens.length} {cotacao.cotacao_itens.length === 1 ? "item" : "itens"} solicitados
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground uppercase tracking-wider mb-1.5 block">
                  Observação (opcional)
                </label>
                <textarea
                  value={emailMensagem}
                  onChange={e => setEmailMensagem(e.target.value)}
                  placeholder="Ex: Prezamos pelo prazo de entrega máximo de 5 dias úteis…"
                  rows={3}
                  className="w-full rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-sky-500/50 focus:border-sky-700 resize-none transition-colors"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-border/60">
              <button
                onClick={() => { setEmailModalOpen(false); setEmailMensagem(""); }}
                className="text-sm text-muted-foreground hover:text-foreground/80 px-3 py-2 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleEnviarEmail}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-sky-700/60 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-400 hover:bg-sky-500/20 transition-colors disabled:opacity-40"
              >
                {pending
                  ? <><Loader2 size={13} className="animate-spin" /> Enviando…</>
                  : <><Send size={13} /> Enviar para {fornComEmail.length} fornecedor(es)</>
                }
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Subcomponentes do rodapé ────────────────────────────────────────────────────

function Scale({ className }: { className?: string }) {
  // Ícone simples de balança (mapa de cotação) sem nova dependência
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M12 3v18M6 21h12M3 7l3-4 3 4M15 7l3-4 3 4" />
      <path d="M3 7a3 3 0 0 0 6 0M15 7a3 3 0 0 0 6 0" />
    </svg>
  );
}

interface RodapeLinhaProps {
  label: string;
  icon?: React.ReactNode;
  colItemClass: string;
  fornecedores: FornecedorBase[];
  render: (f: FornecedorBase) => React.ReactNode;
  temIA: boolean;
  iaContent: React.ReactNode;
  topBorder?: boolean;
  last?: boolean;
  strong?: boolean;
}

function RodapeLinha({ label, icon, fornecedores, render, temIA, iaContent, topBorder, last, strong }: RodapeLinhaProps) {
  const bg = strong ? "bg-muted" : "bg-muted/70";
  return (
    <tr className={cn(bg, topBorder && "border-t-2")}>
      <td className={cn(
        "sticky left-0 z-10 px-5 py-2.5 align-middle border-border/50 bg-muted",
        topBorder && "border-t-2 border-t-border/70",
        !last && "border-b",
      )}>
        <div className="flex items-center gap-1.5">
          {icon}
          <span className={cn(
            "uppercase tracking-wider font-semibold",
            strong ? "text-[11px] text-foreground/80" : "text-[10px] text-muted-foreground/70",
          )}>
            {label}
          </span>
        </div>
      </td>
      {fornecedores.map((f) => (
        <td key={f.id} className={cn(
          "px-2.5 py-2.5 text-center align-middle border-l border-border/50",
          topBorder && "border-t-2 border-t-border/70",
          !last && "border-b",
        )}>
          {render(f)}
        </td>
      ))}
      {temIA && (
        <td className={cn(
          "px-3 py-2.5 text-center align-middle border-l-2 border-emerald-500/40 bg-gradient-to-b from-emerald-500/[0.04] to-transparent",
          topBorder && "border-t-2 border-t-emerald-500/40",
          !last && "border-b border-b-emerald-500/20",
        )}>
          {iaContent}
        </td>
      )}
    </tr>
  );
}
