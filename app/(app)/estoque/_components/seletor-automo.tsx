"use client";

/**
 * seletor-automo.tsx — escolha do produto correspondente no Automo.
 *
 * Compartilhado pelo cadastro de item e pela edição do vínculo, porque a decisão
 * é a mesma nos dois lugares e duplicá-la deixaria as duas telas divergirem.
 *
 * O que aparece aqui carrega peso: um vínculo errado não dá erro nenhum — ele
 * gera divergência de estoque errada todo mês, em silêncio. Por isso a sugestão
 * não é apresentada como percentual, e sim classificada pelo tipo de relação
 * entre os nomes (ver `classificarSugestao`), que na medição do catálogo de
 * produção previu o acerto melhor que o score.
 */
import { useMemo, useState } from "react";
import { Search, Check, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { sugerirCandidatos, classificarSugestao, type ClasseSugestao } from "@/lib/estoque/mapeamento";
import type { ProdutoAutomo } from "@/lib/automo/client";

const MAX_LISTA = 40;

/**
 * Rótulo de cada classe. Bolinha + texto porque cor sozinha não atende WCAG
 * (§11) — e porque "38%" não diz a ninguém se pode confiar.
 */
const SELO: Record<ClasseSugestao, { texto: string; bolinha: string; cor: string }> = {
  identico: { texto: "nome idêntico",  bolinha: "bg-emerald-400",        cor: "text-emerald-400" },
  contido:  { texto: "nome genérico",  bolinha: "bg-emerald-400/70",     cor: "text-emerald-400/90" },
  insumo:   { texto: "prato com este insumo", bolinha: "bg-amber-400",   cor: "text-amber-400" },
  parcial:  { texto: "confira",        bolinha: "bg-muted-foreground/50", cor: "text-muted-foreground" },
};

interface Props {
  produtosAutomo: ProdutoAutomo[];
  /** Nome do produto do LHG/Omie — base da sugestão. */
  nomeAlvo:       string;
  automoId:       number | null;
  onChange:       (id: number | null) => void;
}

export function SeletorAutomo({ produtosAutomo, nomeAlvo, automoId, onChange }: Props) {
  const [busca, setBusca] = useState("");

  const sugestoes = useMemo(() => {
    if (produtosAutomo.length === 0) return [];
    return sugerirCandidatos(
      nomeAlvo,
      produtosAutomo.map((p) => ({ id: String(p.id), nome: p.descricao })),
      { limite: 5 },
    );
  }, [nomeAlvo, produtosAutomo]);

  /**
   * A lista mostra sugestões quando a busca está vazia, resultado da busca
   * quando não está. A classe acompanha nos dois casos: mesmo num resultado de
   * busca, saber que o item escolhido é um PRATO que usa o insumo importa.
   */
  const lista = useMemo<{ item: ProdutoAutomo; classe: ClasseSugestao; sugerido: boolean }[]>(() => {
    const q = busca.toLowerCase().trim();

    if (q) {
      return produtosAutomo
        .filter((p) => p.descricao.toLowerCase().includes(q) || (p.codigo ?? "").toLowerCase().includes(q))
        .slice(0, MAX_LISTA)
        .map((item) => ({ item, classe: classificarSugestao(nomeAlvo, item.descricao), sugerido: false }));
    }

    return sugestoes
      .map((s) => {
        const item = produtosAutomo.find((p) => p.id === Number(s.id));
        return item ? { item, classe: s.classe, sugerido: true } : null;
      })
      .filter((v): v is { item: ProdutoAutomo; classe: ClasseSugestao; sugerido: boolean } => v != null);
  }, [busca, produtosAutomo, sugestoes, nomeAlvo]);

  const escolhido = automoId != null ? produtosAutomo.find((p) => p.id === automoId) ?? null : null;
  const classeEscolhida = escolhido ? classificarSugestao(nomeAlvo, escolhido.descricao) : null;

  if (produtosAutomo.length === 0) {
    return (
      <p className="text-xs text-amber-400/80 rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2">
        Catálogo do Automo indisponível. Você pode salvar sem vínculo e completar depois —
        sem ele as vendas deste item não serão importadas.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar no catálogo do Automo…"
          className="w-full h-9 rounded-lg border border-border bg-muted/30 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-emerald-500/50"
        />
      </div>

      <p className="text-[11px] text-muted-foreground/60">
        {busca.trim()
          ? `${lista.length} de ${produtosAutomo.length} produtos`
          : sugestoes.length > 0
            ? "Sugestões por semelhança de nome — confira antes de aceitar"
            : "Nenhum nome parecido o bastante para sugerir. Use a busca acima."}
      </p>

      {lista.length === 0 ? (
        <p className="text-xs text-muted-foreground/60 rounded-lg border border-border/60 px-3 py-2">
          {busca.trim()
            ? "Nada encontrado com esse texto."
            : "Sem sugestão confiável para este produto. Busque pelo nome como ele aparece no Automo — pode salvar sem vínculo e completar depois."}
        </p>
      ) : (
        <div className="max-h-[220px] overflow-y-auto space-y-1">
          {lista.map(({ item, classe, sugerido }) => {
            const selecionado = automoId === item.id;
            const selo = SELO[classe];
            return (
              <button
                key={item.id}
                onClick={() => onChange(selecionado ? null : item.id)}
                className={cn(
                  "w-full flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left transition-colors",
                  selecionado
                    ? "border-emerald-500/50 bg-emerald-500/10"
                    : "border-border/60 hover:bg-muted/50",
                )}
              >
                <div className="min-w-0">
                  <div className="text-sm text-foreground truncate flex items-center gap-1.5">
                    {selecionado && <Check size={12} className="text-emerald-400 shrink-0" />}
                    {item.descricao}
                  </div>
                  <div className="text-[11px] text-muted-foreground/60">
                    {item.tipo ?? "sem tipo"} · Automo #{item.id}
                  </div>
                </div>
                {/*
                  Selo em vez de percentual. O número não dizia se podia confiar:
                  38% era tanto `SORVETE … COM FLOR DE SAL` (armadilha) quanto
                  `TRAVESSEIRO → CAUCAO TRAVESSEIRO` (acerto). A classe diz.
                  No resultado de busca o selo só aparece quando é um alerta —
                  ela digitou o nome, não precisa ser parabenizada pelo acerto.
                */}
                {(sugerido || classe === "insumo") && (
                  <span className={cn("text-[10px] shrink-0 flex items-center gap-1", selo.cor)}>
                    <span className={cn("size-1.5 rounded-full shrink-0", selo.bolinha)} />
                    {selo.texto}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/*
        Aviso do limite do modelo, não de erro de digitação.

        Um-para-um só funciona quando o item vendido É o item comprado. Quando o
        item do Automo é um prato que consome o insumo, a baixa vem pelo prato
        inteiro e um `fator_conversao` único não representa uma receita com vários
        ingredientes — a divergência deste item sai errada todo mês. Medido: os 3
        casos dessa forma no catálogo do Ipiranga eram todos essa armadilha.
      */}
      {classeEscolhida === "insumo" && escolhido && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.08] px-3 py-2.5 flex gap-2">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200/90 leading-relaxed">
            <strong>&ldquo;{escolhido.descricao}&rdquo;</strong> parece ser um prato que{" "}
            <em>usa</em> este insumo, não o próprio insumo. Vinculando assim, a baixa vem pela
            venda do prato inteiro — e o fator de conversão único não representa uma receita com
            vários ingredientes, então a divergência deste item pode sair errada. Confirme se é
            mesmo isso que você quer.
          </p>
        </div>
      )}
    </div>
  );
}
