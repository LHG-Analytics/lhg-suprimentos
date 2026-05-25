"use client";

/**
 * fornecedores-client.tsx — LHG-207
 * Tabela interativa de fornecedores com busca e botão de sync Omie.
 * LHG-224: removidas colunas STATUS (ativo/inativo — não vem do Omie)
 *           e OMIE (redundante); email destacado na coluna CONTATO.
 */
import { useState, useMemo } from "react";
import { Search, Building2, MapPin, Phone, Mail, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { SyncOmieButton } from "./sync-omie-button";
import { EditarFornecedorModal } from "./editar-fornecedor-modal";

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

// ── Componente ────────────────────────────────────────────────────────────────

export function FornecedoresClient({ fornecedores, lastLog }: FornecedoresClientProps) {
  const [query,               setQuery]               = useState("");
  const [fornecedorEditando,  setFornecedorEditando]  = useState<Fornecedor | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return fornecedores;
    return fornecedores.filter(
      (f) =>
        f.razao_social.toLowerCase().includes(q) ||
        (f.nome_fantasia ?? "").toLowerCase().includes(q) ||
        f.cnpj.replace(/\D/g, "").includes(q.replace(/\D/g, "")) ||
        (f.cidade ?? "").toLowerCase().includes(q) ||
        (f.email ?? "").toLowerCase().includes(q),
    );
  }, [fornecedores, query]);

  const totalOmie      = fornecedores.filter((f) => f.omie_codigo).length;
  const totalComEmail  = fornecedores.filter((f) => f.email).length;

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
          <SyncOmieButton />
        </div>
      </div>

      {/* ── Stats ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "TOTAL",      value: fornecedores.length, color: "text-foreground",  sub: null },
          { label: "COM E-MAIL", value: totalComEmail,       color: "text-amber-400",   sub: `${fornecedores.length - totalComEmail} sem e-mail` },
          { label: "OMIE",       value: totalOmie,           color: "text-sky-400",     sub: null },
        ].map(({ label, value, color, sub }) => (
          <div
            key={label}
            className="rounded-xl border border-border/80 bg-muted/40 px-5 py-4"
          >
            <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">
              {label}
            </div>
            <div className={cn("text-2xl font-mono font-semibold mt-1.5", color)}>
              {value}
            </div>
            {sub && (
              <div className="text-[11px] text-muted-foreground/60 mt-0.5">{sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Busca ───────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type="text"
          placeholder="Buscar por nome, CNPJ, cidade ou e-mail…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-border bg-muted/60 pl-9 pr-4 py-2.5",
            "text-sm text-foreground placeholder:text-muted-foreground/50",
            "focus:outline-none focus:border-border focus:ring-0 transition-colors",
          )}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 hover:text-muted-foreground text-xs"
          >
            ✕
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
              {query ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor cadastrado"}
            </p>
            {!query && (
              <p className="text-xs text-muted-foreground/60">
                Clique em &quot;Sincronizar Omie&quot; para importar
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-border/60">
            {filtered.map((f) => (
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

        {/* Footer com contagem */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-border/60 flex items-center justify-between">
            <span className="text-[12px] text-muted-foreground/60">
              {filtered.length === fornecedores.length
                ? `${fornecedores.length} fornecedor${fornecedores.length !== 1 ? "es" : ""}`
                : `${filtered.length} de ${fornecedores.length} fornecedor${fornecedores.length !== 1 ? "es" : ""}`}
            </span>
            <span className="text-[11px] text-muted-foreground/40">
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
    </div>
  );
}
