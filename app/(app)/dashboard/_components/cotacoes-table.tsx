/**
 * cotacoes-table.tsx — LHG-204
 * Tabela "Cotações em andamento" — seção inferior do dashboard.
 * Tokens semânticos para suporte a light/dark mode.
 */
import Link from "next/link";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBRL, formatDate } from "@/lib/utils";

export type CotacaoRow = {
  id: string;
  numero: string;
  titulo: string;
  unidades: string[];
  itens: number;
  fornecedores: number;
  valorEstimado: number;
  economia: number | null;
  prazo: string | null;
  status: string;
  urgente?: boolean;
};

interface CotacoesTableProps {
  rows: CotacaoRow[];
  total: number;
}

const STATUS_STYLE: Record<string, string> = {
  rascunho:               "bg-muted    text-muted-foreground",
  cotacao:                "bg-sky-500/15  text-sky-600 dark:text-sky-400",
  pendente:               "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  aprovado:               "bg-lhg-500/15  text-lhg-600 dark:text-lhg-400",
  rejeitado:              "bg-red-500/15  text-red-600 dark:text-red-400",
  "aguardando-aprovacao": "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  enviado:                "bg-sky-500/15  text-sky-600 dark:text-sky-400",
  "em-transito":          "bg-sky-500/15  text-sky-600 dark:text-sky-400",
  recebido:               "bg-lhg-500/15  text-lhg-600 dark:text-lhg-400",
  finalizado:             "bg-muted    text-muted-foreground",
  "erro-omie":            "bg-red-500/15  text-red-600 dark:text-red-400",
};

const STATUS_LABEL: Record<string, string> = {
  rascunho:               "Rascunho",
  cotacao:                "Em cotação",
  pendente:               "Pendente",
  aprovado:               "Aprovado",
  rejeitado:              "Rejeitado",
  "aguardando-aprovacao": "Aguarda aprovação",
  enviado:                "Enviado",
  "em-transito":          "Em trânsito",
  recebido:               "Recebido",
  finalizado:             "Finalizado",
  "erro-omie":            "Erro Omie",
};

function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium",
        STATUS_STYLE[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

export function CotacoesTable({ rows, total }: CotacoesTableProps) {
  const HEADERS = [
    { label: "Nº",           align: "left" },
    { label: "Título",       align: "left" },
    { label: "Unidade(s)",   align: "left" },
    { label: "Itens",        align: "right" },
    { label: "Forn.",        align: "right" },
    { label: "Valor estim.", align: "right" },
    { label: "Economia IA",  align: "right" },
    { label: "Prazo",        align: "left" },
    { label: "Status",       align: "left" },
    { label: "",             align: "right" },
  ];

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div>
          <div className="text-sm font-medium text-foreground">Cotações em andamento</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Últimas atualizadas · {rows.length} ativas
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/cotacoes"
            className="text-xs text-lhg-500 dark:text-lhg-400 hover:text-lhg-600 dark:hover:text-lhg-300 transition-colors"
          >
            Ver todas →
          </Link>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[800px]">
          <thead>
            <tr>
              {HEADERS.map((h) => (
                <th
                  key={h.label}
                  className={cn(
                    "text-[11px] uppercase tracking-wider text-muted-foreground font-medium",
                    "px-4 h-9",
                    h.align === "right" ? "text-right" : "text-left",
                  )}
                >
                  {h.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr
                key={c.id}
                className="border-t border-border hover:bg-muted/40 cursor-pointer transition-colors h-11 group"
              >
                <td className="px-4">
                  <span className="font-mono text-xs text-foreground/70">{c.numero}</span>
                </td>
                <td className="px-4 max-w-[280px]">
                  <div className="flex items-center gap-1.5 truncate">
                    {c.urgente && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 dark:text-red-400 font-medium shrink-0">
                        urgente
                      </span>
                    )}
                    <span className="text-foreground truncate">{c.titulo}</span>
                  </div>
                </td>
                <td className="px-4 text-muted-foreground text-xs">
                  {c.unidades.length === 1 ? (
                    c.unidades[0]
                  ) : (
                    <>
                      {c.unidades[0]}{" "}
                      <span className="text-muted-foreground/50">+{c.unidades.length - 1}</span>
                    </>
                  )}
                </td>
                <td className="px-4 text-right font-mono text-xs text-muted-foreground">
                  {c.itens}
                </td>
                <td className="px-4 text-right font-mono text-xs text-muted-foreground">
                  {c.fornecedores}
                </td>
                <td className="px-4 text-right font-mono text-foreground">
                  {formatBRL(c.valorEstimado)}
                </td>
                <td className="px-4 text-right">
                  {c.economia != null && c.economia > 0 ? (
                    <span className="font-mono text-xs text-lhg-500 dark:text-lhg-400">
                      −{formatBRL(c.economia)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40 text-xs">—</span>
                  )}
                </td>
                <td className="px-4 text-muted-foreground text-xs">
                  {c.prazo ? formatDate(c.prazo, "dd/MM") : "—"}
                </td>
                <td className="px-4">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-4 text-right">
                  <ChevronRight
                    size={13}
                    className="text-muted-foreground/40 group-hover:text-muted-foreground transition-colors"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      <div className="px-5 py-3 border-t border-border flex items-center justify-between text-xs text-muted-foreground">
        <span>
          Mostrando {rows.length} de {total}
        </span>
        <div className="flex items-center gap-1">
          <button className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center transition-colors">
            <ChevronLeft size={12} />
          </button>
          <span className="font-mono px-1">1</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-mono px-1">{Math.ceil(total / rows.length) || 1}</span>
          <button className="w-6 h-6 rounded hover:bg-muted flex items-center justify-center transition-colors">
            <ChevronRight size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}
