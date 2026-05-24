"use client";

/**
 * adicionar-fornecedor-modal.tsx — LHG-211
 * Modal para adicionar fornecedores a uma cotação.
 * Filtra os já adicionados, permite busca e seleção múltipla.
 */
import { useState, useTransition, useMemo, useEffect, useRef } from "react";
import { X, Search, Check, Users, Loader2, Star } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { adicionarFornecedorCotacao } from "../../actions";

interface Fornecedor {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  rating: number | null;
  pontualidade_pct: number | null;
}

interface Props {
  open:             boolean;
  onClose:          () => void;
  cotacaoId:        string;
  todosFornecedores: Fornecedor[];
  jaAdicionados:    string[];
}

function getFornNome(f: Fornecedor) {
  return f.nome_fantasia || f.razao_social;
}

export function AdicionarFornecedorModal({
  open, onClose, cotacaoId, todosFornecedores, jaAdicionados,
}: Props) {
  const [pending, start]   = useTransition();
  const [busca, setBusca]   = useState("");
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setBusca("");
      setSelecionados(new Set());
      setTimeout(() => inputRef.current?.focus(), 60);
    }
  }, [open]);

  const disponiveis = useMemo(() =>
    todosFornecedores.filter(f => !jaAdicionados.includes(f.id)),
    [todosFornecedores, jaAdicionados],
  );

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase().trim();
    if (!q) return disponiveis;
    return disponiveis.filter(f =>
      getFornNome(f).toLowerCase().includes(q) ||
      f.razao_social.toLowerCase().includes(q),
    );
  }, [disponiveis, busca]);

  function toggleForn(id: string) {
    setSelecionados(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleConfirmar() {
    if (!selecionados.size) return;
    start(async () => {
      try {
        await adicionarFornecedorCotacao(cotacaoId, [...selecionados]);
        toast.success(
          `${selecionados.size} fornecedor${selecionados.size !== 1 ? "es" : ""} adicionado${selecionados.size !== 1 ? "s" : ""}`,
        );
        onClose();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao adicionar fornecedores");
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-[520px] rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2">
            <Users size={15} className="text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-50">Adicionar fornecedores</h2>
            {selecionados.size > 0 && (
              <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 text-[11px] font-bold ring-1 ring-emerald-500/30">
                {selecionados.size}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Busca */}
        <div className="px-5 pt-3 pb-2">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
            <input
              ref={inputRef}
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar fornecedor…"
              className={cn(
                "w-full rounded-lg border border-zinc-800 bg-zinc-900/60",
                "pl-8 pr-3 py-2 text-sm text-zinc-200 placeholder-zinc-600",
                "focus:outline-none focus:ring-1 focus:ring-zinc-600 transition-all",
              )}
            />
          </div>
        </div>

        {/* Lista */}
        <div className="px-2 pb-2 max-h-[44vh] overflow-y-auto">
          {disponiveis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Users size={24} className="text-zinc-700" />
              <p className="text-sm text-zinc-500">Todos os fornecedores já foram adicionados</p>
            </div>
          ) : filtrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2">
              <Search size={24} className="text-zinc-700" />
              <p className="text-sm text-zinc-500">Nenhum resultado para "{busca}"</p>
            </div>
          ) : (
            filtrados.map(f => {
              const sel = selecionados.has(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => toggleForn(f.id)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors",
                    sel
                      ? "bg-emerald-500/10 hover:bg-emerald-500/15"
                      : "hover:bg-zinc-800/60",
                  )}
                >
                  {/* Checkbox */}
                  <div className={cn(
                    "w-4 h-4 rounded flex items-center justify-center shrink-0 transition-all",
                    sel
                      ? "bg-emerald-500 ring-1 ring-emerald-400"
                      : "bg-zinc-800 ring-1 ring-zinc-700",
                  )}>
                    {sel && <Check size={10} className="text-zinc-950" strokeWidth={3} />}
                  </div>

                  {/* Avatar */}
                  <div className={cn(
                    "w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0",
                    sel ? "bg-emerald-500/20 text-emerald-300" : "bg-zinc-800 text-zinc-400",
                  )}>
                    {getFornNome(f).slice(0, 2).toUpperCase()}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className={cn(
                      "text-sm font-medium truncate",
                      sel ? "text-emerald-300" : "text-zinc-200",
                    )}>
                      {getFornNome(f)}
                    </div>
                    {f.nome_fantasia && f.nome_fantasia !== f.razao_social && (
                      <div className="text-[11px] text-zinc-600 truncate">{f.razao_social}</div>
                    )}
                  </div>

                  {/* Rating */}
                  {f.rating !== null && (
                    <div className="flex items-center gap-1 shrink-0 text-[11px] text-zinc-600">
                      <Star size={10} className="text-amber-500/70 fill-amber-500/40" />
                      {f.rating.toFixed(1)}
                      {f.pontualidade_pct !== null && (
                        <span className="ml-1 text-zinc-700">· {f.pontualidade_pct}%</span>
                      )}
                    </div>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-3.5 border-t border-zinc-800/60">
          <span className="text-[12px] text-zinc-600">
            {disponiveis.length} disponíve{disponiveis.length !== 1 ? "is" : "l"}
            {selecionados.size > 0 && ` · ${selecionados.size} selecionado${selecionados.size !== 1 ? "s" : ""}`}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-sm text-zinc-500 hover:text-zinc-300 px-3 py-2 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirmar}
              disabled={selecionados.size === 0 || pending}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border",
                "border-emerald-700/60 bg-emerald-500/10 px-4 py-2",
                "text-sm font-semibold text-emerald-400",
                "hover:bg-emerald-500/20 transition-colors",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              )}
            >
              {pending
                ? <><Loader2 size={13} className="animate-spin" /> Adicionando…</>
                : `Adicionar${selecionados.size > 0 ? ` ${selecionados.size}` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
