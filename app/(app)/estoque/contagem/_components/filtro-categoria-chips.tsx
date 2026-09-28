"use client";

/**
 * filtro-categoria-chips.tsx — chips de "Categoria" no topo da lista de contagem.
 *
 * A equipe conta por prateleira (hortifruti, laticínios, secos), então o chip
 * escolhe uma categoria e a lista mostra só ela. Só a EXIBIÇÃO muda: o ciclo, o
 * progresso "contados de total", a importação e o PDF continuam sobre todos os
 * itens. O estado vive na URL (`?categoria=`) para poder recarregar e compartilhar.
 *
 * "Categoria" é a palavra da equipe; a fonte é `produtos.familia_omie` — ver
 * lib/estoque/filtro-categoria.ts.
 */
import { cn } from "@/lib/utils";
import { type ContagemCategoria, SEM_CATEGORIA } from "@/lib/estoque/filtro-categoria";

interface Props {
  categorias:  ContagemCategoria[];
  /** `null` = todas. */
  ativa:       string | null;
  total:       number;
  onSelecionar: (categoria: string | null) => void;
}

export function FiltroCategoriaChips({ categorias, ativa, total, onSelecionar }: Props) {
  // Com uma categoria só (ou nenhuma) o filtro não filtra nada — não ocupa espaço.
  if (categorias.length < 2) return null;

  const chip = (rotulo: string, quantidade: number, valor: string | null) => {
    const selecionado = ativa === valor;
    return (
      <button
        key={valor ?? "__todas"}
        type="button"
        onClick={() => onSelecionar(valor)}
        aria-pressed={selecionado}
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          selecionado
            ? "border-emerald-500 bg-emerald-500/15 text-foreground"
            : "border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground",
          valor === SEM_CATEGORIA && !selecionado && "italic",
        )}
      >
        {rotulo}
        <span className={cn("tabular-nums", selecionado ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground/80")}>
          {quantidade}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Categoria</p>
      {/* rolagem horizontal no celular; quebra em linhas no desktop */}
      <div
        role="group"
        aria-label="Filtrar por categoria"
        className="flex gap-1.5 overflow-x-auto pb-1 -mx-4 px-4 lg:mx-0 lg:px-0 lg:flex-wrap lg:overflow-visible"
      >
        {chip("Todas", total, null)}
        {categorias.map((c) => chip(c.categoria, c.quantidade, c.categoria))}
      </div>
    </div>
  );
}
