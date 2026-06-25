"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertTriangle, ArrowLeft, PackagePlus, Clock, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { aprovarRequisicao, excluirItemRequisicao } from "../../actions";
import { ProdutoOmieModal } from "./produto-omie-modal";

interface Item {
  id:                  string;
  quantidade:          number;
  observacao:          string | null;
  produto_novo:        boolean;
  produto_nome_livre:  string | null;
  produto_unidade_med: string | null;
  produtos: { id: string; nome: string; unidade_med: string; preco_custo: number | null; categoria: string | null } | null;
}

interface Req {
  id: string; numero: string; titulo: string; urgencia: string;
  status: string; origem: string; justificativa: string | null;
  omie_codigo: number | null; created_at: string;
  requisicao_itens: Item[];
  requisicao_unidades: Array<{ unidade_id: string; unidades: { id: string; nome: string } | null }>;
}

interface Props { req: Req; unidadeId: string; }

const STATUS_LABEL: Record<string, string> = {
  rascunho:            "Rascunho",
  pendente_produto:    "Produto pendente",
  aguardando_cotacao:  "Aguardando cotação",
  cotacao:             "Em cotação",
  aprovado:            "Aprovado",
  cancelado:           "Cancelado",
};

export function RequisicaoDetalhe({ req, unidadeId }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [modalItem, setModalItem] = useState<Item | null>(null);
  const [confirmandoExclusao, setConfirmandoExclusao] = useState<string | null>(null);
  const [excluindoItem, setExcluindoItem] = useState<string | null>(null);

  const itensPendentes = req.requisicao_itens.filter(i => i.produto_novo);
  // Produtos não cadastrados NÃO bloqueiam mais o avanço para cotação:
  // a cotação aceita itens livres e o aviso persiste até o cadastro.
  const podAprovar = req.status !== "aguardando_cotacao"
    && req.status !== "aprovado"
    && req.status !== "cotacao";

  // Itens só podem ser removidos enquanto a requisição não foi aprovada/cotada
  const podeExcluirItens =
    req.status !== "aprovado" && req.status !== "cotacao" && req.requisicao_itens.length > 1;

  function handleAprovar() {
    startTransition(async () => {
      try {
        await aprovarRequisicao(req.id);
        toast.success("Requisição liberada para cotação");
        router.refresh();
      } catch (err) {
        toast.error((err as Error).message);
      }
    });
  }

  async function handleExcluirItem(itemId: string) {
    // Primeiro clique pede confirmação; segundo clique exclui
    if (confirmandoExclusao !== itemId) {
      setConfirmandoExclusao(itemId);
      setTimeout(() => setConfirmandoExclusao(c => (c === itemId ? null : c)), 3_000);
      return;
    }
    setConfirmandoExclusao(null);
    setExcluindoItem(itemId);

    try {
      const result = await excluirItemRequisicao(itemId);
      if ("erro" in result) {
        toast.error(result.erro);
      } else {
        toast.success("Item removido da requisição");
        router.refresh();
      }
    } finally {
      setExcluindoItem(null);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-6 px-4 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <Link href="/requisicoes" className="mt-1 text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg font-semibold text-foreground">{req.titulo}</h1>
            <span className="text-xs font-mono text-muted-foreground">{req.numero}</span>
            {req.origem === "omie" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">Omie</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className={cn(
              "text-xs font-medium px-2 py-0.5 rounded",
              req.status === "pendente_produto"   ? "bg-orange-500/12 text-orange-400 border border-orange-500/25" :
              req.status === "aguardando_cotacao" ? "bg-violet-500/12 text-violet-400 border border-violet-500/25" :
              req.status === "aprovado"           ? "bg-emerald-500/12 text-emerald-400 border border-emerald-500/25" :
              "bg-muted text-muted-foreground",
            )}>
              {STATUS_LABEL[req.status] ?? req.status}
            </span>
            {req.urgencia === "urgente" && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-red-500/15 text-red-400">URGENTE</span>
            )}
            {req.omie_codigo && (
              <span className="text-[10px] text-muted-foreground/50 font-mono">Omie #{req.omie_codigo}</span>
            )}
          </div>
        </div>

        {podAprovar && (
          <button onClick={handleAprovar} disabled={pending}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-white font-medium text-sm transition-colors disabled:opacity-50">
            <CheckCircle2 size={14} />
            Aprovar
          </button>
        )}
      </div>

      {/* Alerta produtos pendentes */}
      {itensPendentes.length > 0 && (
        <div className="rounded-lg bg-amber-500/08 border border-amber-500/25 p-4">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle size={14} className="text-amber-400" />
            <span className="text-sm font-semibold text-amber-300">
              {itensPendentes.length} produto{itensPendentes.length > 1 ? "s" : ""} não cadastrado{itensPendentes.length > 1 ? "s" : ""} no Omie
            </span>
          </div>
          <p className="text-xs text-amber-300/70">Você pode cotar mesmo assim — o aviso permanece até o cadastro. O produto deve ser cadastrado antes de gerar o pedido de compra.</p>
        </div>
      )}

      {/* Justificativa */}
      {req.justificativa && (
        <div className="rounded-lg bg-muted/30 border border-border/60 p-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">Justificativa</p>
          <p className="text-sm text-foreground/80">{req.justificativa}</p>
        </div>
      )}

      {/* Lista de itens */}
      <div className="rounded-xl border border-border/80 bg-card overflow-hidden">
        <div className="px-4 py-3 border-b border-border/60">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Itens ({req.requisicao_itens.length})
          </span>
        </div>
        <div className="divide-y divide-border/50">
          {req.requisicao_itens.map(item => (
            <div key={item.id} className="flex items-center gap-3 px-4 py-3">
              <div className="shrink-0">
                {item.produto_novo
                  ? <AlertTriangle size={14} className="text-amber-400" />
                  : <CheckCircle2 size={14} className="text-emerald-400" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground flex items-center gap-2 flex-wrap">
                  <span>{item.produto_novo ? item.produto_nome_livre : (item.produtos?.nome ?? "—")}</span>
                  {!item.produto_novo && item.produtos?.categoria && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      {item.produtos.categoria}
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  {item.quantidade}× {item.produto_novo ? item.produto_unidade_med : item.produtos?.unidade_med}
                  {item.produto_novo && <span className="ml-2 text-amber-400/70">produto não cadastrado no Omie</span>}
                  {item.observacao && <span className="ml-2 text-muted-foreground/60">· {item.observacao}</span>}
                </div>
              </div>
              {item.produto_novo && (
                <button
                  onClick={() => setModalItem(item)}
                  className="flex items-center gap-1.5 h-7 px-3 rounded-md bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-medium transition-colors shrink-0">
                  <PackagePlus size={12} />
                  Cadastrar produto
                </button>
              )}
              {podeExcluirItens && (
                <button
                  onClick={() => handleExcluirItem(item.id)}
                  disabled={excluindoItem === item.id}
                  title={confirmandoExclusao === item.id ? "Clique de novo para confirmar" : "Remover item"}
                  className={cn(
                    "flex items-center gap-1.5 h-7 rounded-md border text-xs font-medium transition-all shrink-0",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    confirmandoExclusao === item.id
                      ? "px-3 bg-red-500/20 hover:bg-red-500/30 border-red-500/40 text-red-300"
                      : "px-2 bg-muted/40 hover:bg-red-500/15 border-border/60 hover:border-red-500/30 text-muted-foreground hover:text-red-400",
                  )}>
                  <Trash2 size={12} />
                  {confirmandoExclusao === item.id && "Confirmar?"}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Status aguardando_cotacao + botão criar cotação */}
      {req.status === "aguardando_cotacao" && (
        <div className="rounded-lg bg-violet-500/08 border border-violet-500/25 p-4 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Clock size={16} className="text-violet-400 shrink-0" />
            <div>
              <p className="text-sm font-medium text-violet-300">Aguardando cotação</p>
              <p className="text-xs text-violet-300/60">Esta requisição está aprovada e pronta para ser cotada.</p>
            </div>
          </div>
          <Link
            href={`/cotacoes?nova=1&requisicao_id=${req.id}&titulo=${encodeURIComponent(req.titulo)}`}
            className="flex items-center gap-1.5 h-9 px-4 rounded-lg bg-violet-500 hover:bg-violet-600 text-white font-medium text-sm transition-colors shrink-0"
          >
            <Scale size={14} />
            Criar cotação
          </Link>
        </div>
      )}

      {modalItem && (
        <ProdutoOmieModal
          open={true}
          onClose={() => setModalItem(null)}
          requisicaoItemId={modalItem.id}
          unidadeId={unidadeId}
          nomeSugerido={modalItem.produto_nome_livre ?? ""}
        />
      )}
    </div>
  );
}
