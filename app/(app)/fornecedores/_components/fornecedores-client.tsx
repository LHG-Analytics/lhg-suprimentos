"use client";

/**
 * fornecedores-client.tsx — LHG-207
 * Tabela interativa de fornecedores com busca, paginação e botão de sync Omie.
 * LHG-224: removidas colunas STATUS (ativo/inativo — não vem do Omie)
 *           e OMIE (redundante); email destacado na coluna CONTATO.
 */
import { useState, useMemo } from "react";
import { useDebounce } from "@/hooks/use-debounce";
import { Search, Building2, MapPin, Phone, Mail, RefreshCw, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { SyncOmieButton } from "./sync-omie-button";
import { EditarFornecedorModal } from "./editar-fornecedor-modal";
import { CriarFornecedorModal } from "./criar-fornecedor-modal";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Fornecedor {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  email: string | null;
  telefone: string | null;
  contato: string | null;
  endereco: string | null;
  cep: string | null;
  cidade: string | null;
  uf: string | null;
  ativo: boolean;
  omie_codigo: string | null;
  omie_sincronizado_em: string | null;
}

interface LastLog {
  created_at: string;
  total: number | null;
  novos: number | null;
  status: string | null;
}

interface FornecedoresClientProps {
  fornecedores: Fornecedor[];
  lastLog: LastLog | null;
  unidades: Array<{ id: string; nome: string }>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCnpj(v: string) {
  const n = v.replace(/\D/g, "");
  if (n.length === 14)
    return n.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  if (n.length === 11)
    return n.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  return v;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const min  = Math.floor(diff / 60_000);
  const h    = Math.floor(diff / 3_600_000);
  const d    = Math.floor(diff / 86_400_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min}min atrás`;
  if (h < 24)  return `${h}h atrás`;
  return `${d}d atrás`;
}

// ── Filtros de chip — campo API Omie: clientesFiltro.inativo ─────────────────

type FiltroKey = "todos" | "ativos" | "inativos" | "com_email" | "sem_email";

/**
 * Chips que espelham os parâmetros da API Omie:
 *   ativos   → clientesFiltro.inativo: "N"  (padrão do sync)
 *   inativos → clientesFiltro.inativo: "S"
 */
const FILTROS: { key: FiltroKey; label: string; omieParam: string | null; activeClass: string }[] = [
  { key: "todos",     label: "Todos",     omieParam: null,                        activeClass: "bg-muted text-foreground" },
  { key: "ativos",    label: "Ativos",    omieParam: "inativo: \"N\"",             activeClass: "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500/30" },
  { key: "inativos",  label: "Inativos",  omieParam: "inativo: \"S\"",             activeClass: "bg-red-500/20 text-red-400 ring-1 ring-red-500/30" },
  { key: "com_email", label: "Com e-mail",omieParam: null,                        activeClass: "bg-amber-500/20 text-amber-400 ring-1 ring-amber-500/30" },
  { key: "sem_email", label: "Sem e-mail",omieParam: null,                        activeClass: "bg-muted text-muted-foreground ring-1 ring-border/60" },
];

// ── Paginação ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

// ── Componente ────────────────────────────────────────────────────────────────

export function FornecedoresClient({ fornecedores, lastLog, unidades }: FornecedoresClientProps) {
  const router = useRouter();
  const [query,               setQuery]               = useState("");
  const queryDebounced = useDebounce(query, 300);
  // Padrão: "ativos" espelha o comportamento do sync Omie (inativo: "N")
  const [filtroChip,          setFiltroChip]          = useState<FiltroKey>("ativos");
  const [fornecedorEditando,  setFornecedorEditando]  = useState<Fornecedor | null>(null);
  const [page,                setPage]                = useState(0);
  const [criarOpen,           setCriarOpen]           = useState(false);

  // Helpers que resetam a página ANTES do próximo render (mesmo batch do React 18)
  function handleQuery(v: string)      { setQuery(v);       setPage(0); }
  function handleChip(k: FiltroKey)    { setFiltroChip(k);  setPage(0); }
  function handleLimpar()              { setFiltroChip("ativos"); setQuery(""); setPage(0); }

  const q = queryDebounced.toLowerCase().trim();

  // Chip filter — sempre aplicado
  const chipFiltered = useMemo(() => fornecedores.filter((f) => {
    if (filtroChip === "ativos"    && !f.ativo)  return false;
    if (filtroChip === "inativos"  && f.ativo)   return false;
    if (filtroChip === "com_email" && !f.email)  return false;
    if (filtroChip === "sem_email" && !!f.email) return false;
    return true;
  }), [fornecedores, filtroChip]);

  // Busca textual — só ativa com 2+ caracteres (1 letra sozinha é comum demais)
  const filtered = useMemo(() => {
    if (q.length < 2) return chipFiltered;
    // CNPJ só compara se a busca contém dígitos — evita "".includes("") = true para todo mundo
    const qDigits = q.replace(/\D/g, "");
    return chipFiltered.filter((f) =>
      f.razao_social.toLowerCase().includes(q) ||
      (f.nome_fantasia ?? "").toLowerCase().includes(q) ||
      (qDigits.length > 0 && f.cnpj.replace(/\D/g, "").includes(qDigits)) ||
      (f.cidade ?? "").toLowerCase().includes(q) ||
      (f.email ?? "").toLowerCase().includes(q) ||
      (f.telefone ?? "").toLowerCase().includes(q) ||
      (f.contato ?? "").toLowerCase().includes(q)
    );
  }, [chipFiltered, q, queryDebounced]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginados   = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const buscaAtiva  = q.length >= 2;
  const buscaCurta  = q.length === 1;

  return (
    <div className="max-w-[1600px] mx-auto space-y-4 pb-8">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground leading-tight">
            Fornecedores
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Cadastro sincronizado com o Omie ERP
          </p>
        </div>

        {/* Sync info + botão */}
        <div className="flex items-center gap-3 shrink-0">
          {lastLog && (
            <div className="text-right hidden sm:block">
              <div className="text-[11px] text-muted-foreground leading-tight">
                Última sincronização
              </div>
              <div className="text-[12px] text-muted-foreground font-mono leading-tight mt-0.5 flex items-center gap-1.5 justify-end">
                <RefreshCw size={10} className={cn(lastLog.status === "ok" ? "text-emerald-400" : "text-red-400")} />
                {relativeTime(lastLog.created_at)}
                <span className="text-muted-foreground/60">·</span>
                <span>{lastLog.total ?? 0} registros</span>
              </div>
            </div>
          )}
          <button
            onClick={() => setCriarOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-emerald-700/60 bg-emerald-500/10 px-3.5 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20 transition-colors"
          >
            <Plus size={14} />
            Novo Fornecedor
          </button>
          <SyncOmieButton />
        </div>
      </div>

      {/* ── Busca ───────────────────────────────────────────────────────── */}
      <div className="space-y-1.5">
        <div className="relative">
          <Search
            size={14}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
          />
          <input
            type="text"
            placeholder="Buscar por nome, CNPJ, cidade ou e-mail…"
            value={query}
            onChange={(e) => handleQuery(e.target.value)}
            className={cn(
              "w-full rounded-lg border bg-muted/60 pl-9 py-2.5 transition-colors",
              "text-sm text-foreground placeholder:text-muted-foreground/50",
              "focus:outline-none focus:ring-0",
              buscaAtiva
                ? "border-emerald-500/40 pr-28"
                : "border-border pr-9",
            )}
          />
          {/* Badge de resultado — aparece ao buscar */}
          {buscaAtiva && (
            <span className={cn(
              "absolute right-8 top-1/2 -translate-y-1/2 text-[11px] font-mono px-2 py-0.5 rounded-full",
              filtered.length === 0
                ? "bg-red-500/10 text-red-400"
                : "bg-emerald-500/10 text-emerald-400",
            )}>
              {filtered.length} resultado{filtered.length !== 1 ? "s" : ""}
            </span>
          )}
          {query && (
            <button
              onClick={() => handleQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-foreground text-xs"
            >
              ✕
            </button>
          )}
        </div>
        {/* Dica quando só tem 1 caractere */}
        {buscaCurta && (
          <p className="text-[11px] text-muted-foreground/60 pl-1">
            Digite mais um caractere para buscar…
          </p>
        )}
      </div>

      {/* ── Filtros de chip — espelham parâmetros da API Omie ──────────── */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {FILTROS.map((f) => {
          const isActive = filtroChip === f.key;
          return (
            <button
              key={f.key}
              onClick={() => handleChip(f.key)}
              title={f.omieParam ? `API Omie: clientesFiltro.${f.omieParam}` : undefined}
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-medium transition-colors",
                isActive ? f.activeClass : "bg-muted/40 text-muted-foreground hover:text-foreground/80 hover:bg-muted/60",
              )}
            >
              {f.label}
            </button>
          );
        })}
        {(filtroChip !== "ativos" || query) && (
          <button
            onClick={handleLimpar}
            className="rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground/70 hover:text-foreground/80 hover:bg-muted/40 transition-colors ml-1"
          >
            ✕ Limpar
          </button>
        )}
      </div>

      {/* ── Tabela ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr] gap-4 px-5 py-3 border-b border-border/80">
          {["EMPRESA", "CNPJ", "CONTATO", "LOCALIZAÇÃO"].map(
            (h) => (
              <div
                key={h}
                className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground"
              >
                {h}
              </div>
            ),
          )}
        </div>

        {/* Linhas */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Building2 size={28} className="text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              {buscaAtiva
                ? `Nenhum fornecedor encontrado para "${query.trim()}"`
                : filtroChip !== "todos"
                  ? "Nenhum fornecedor para o filtro selecionado"
                  : "Nenhum fornecedor cadastrado"}
            </p>
            {buscaAtiva && (
              <button
                onClick={() => handleQuery("")}
                className="text-xs text-emerald-400/70 hover:text-emerald-400 transition-colors"
              >
                Limpar busca
              </button>
            )}
            {!buscaAtiva && filtroChip === "todos" && (
              <p className="text-xs text-muted-foreground/60">
                Clique em &quot;Sincronizar Omie&quot; para importar
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {paginados.map((f) => (
              <li
                key={f.id}
                onClick={() => setFornecedorEditando(f)}
                className="grid grid-cols-[2fr_1fr_1.5fr_1fr] gap-4 px-5 py-3.5 hover:bg-muted/40 transition-colors cursor-pointer"
              >
                {/* Empresa */}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-foreground truncate leading-tight">
                    {f.nome_fantasia || f.razao_social}
                  </div>
                  {f.nome_fantasia && (
                    <div className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {f.razao_social}
                    </div>
                  )}
                </div>

                {/* CNPJ */}
                <div className="font-mono text-[12px] text-muted-foreground self-center">
                  {formatCnpj(f.cnpj)}
                </div>

                {/* Contato — e-mail em destaque, telefone abaixo */}
                <div className="min-w-0 self-center space-y-0.5">
                  {f.email ? (
                    <div className="flex items-center gap-1.5 text-[12px] text-foreground/80 truncate">
                      <Mail size={10} className="text-muted-foreground shrink-0" />
                      <span className="truncate">{f.email}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground/60">
                      <Mail size={10} className="text-muted-foreground/40 shrink-0" />
                      <span>sem e-mail</span>
                    </div>
                  )}
                  {f.telefone && (
                    <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <Phone size={10} className="text-muted-foreground/60 shrink-0" />
                      {f.telefone}
                    </div>
                  )}
                </div>

                {/* Localização */}
                <div className="self-center">
                  {f.cidade ? (
                    <div className="flex items-center gap-1.5 text-[12px] text-muted-foreground">
                      <MapPin size={10} className="text-muted-foreground/60 shrink-0" />
                      <span className="truncate">
                        {f.cidade}
                        {f.uf && `, ${f.uf}`}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[12px] text-muted-foreground/60">—</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Footer com contagem + paginação */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between gap-4">
            <span className="text-[12px] text-muted-foreground/60">
              {filtered.length === fornecedores.length
                ? `${fornecedores.length} fornecedor${fornecedores.length !== 1 ? "es" : ""}`
                : `${filtered.length} de ${fornecedores.length} filtrado${filtered.length !== 1 ? "s" : ""}`}
            </span>

            {/* Controles de página */}
            {totalPages > 1 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[12px] text-muted-foreground/80 font-mono tabular-nums">
                  {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            )}

            <span className="text-[11px] text-muted-foreground/40 hidden sm:block">
              Clique em uma linha para editar
            </span>
          </div>
        )}
      </div>

      {/* Modal de edição — key garante remount com dados frescos ao trocar de fornecedor */}
      <EditarFornecedorModal
        key={fornecedorEditando?.id ?? "closed"}
        fornecedor={fornecedorEditando}
        onClose={() => setFornecedorEditando(null)}
      />

      {/* Modal de criação */}
      <CriarFornecedorModal
        open={criarOpen}
        onClose={() => setCriarOpen(false)}
        onCreated={() => router.refresh()}
        unidades={unidades}
      />
    </div>
  );
}
