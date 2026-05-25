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

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface Fornecedor {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string;
  email: string | null;
  telefone: string | null;
  contato: string | null;
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
  const [query, setQuery] = useState("");

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
          <h1 className="text-xl font-semibold text-zinc-50 leading-tight">
            Fornecedores
          </h1>
          <p className="text-[13px] text-zinc-500 mt-0.5">
            Cadastro sincronizado com o Omie ERP
          </p>
        </div>

        {/* Sync info + botão */}
        <div className="flex items-center gap-3 shrink-0">
          {lastLog && (
            <div className="text-right hidden sm:block">
              <div className="text-[11px] text-zinc-500 leading-tight">
                Última sincronização
              </div>
              <div className="text-[12px] text-zinc-400 font-mono leading-tight mt-0.5 flex items-center gap-1.5 justify-end">
                <RefreshCw size={10} className={cn(lastLog.status === "ok" ? "text-emerald-400" : "text-red-400")} />
                {relativeTime(lastLog.created_at)}
                <span className="text-zinc-600">·</span>
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
          { label: "TOTAL",      value: fornecedores.length, color: "text-zinc-50",     sub: null },
          { label: "COM E-MAIL", value: totalComEmail,       color: "text-amber-400",   sub: `${fornecedores.length - totalComEmail} sem e-mail` },
          { label: "OMIE",       value: totalOmie,           color: "text-sky-400",     sub: null },
        ].map(({ label, value, color, sub }) => (
          <div
            key={label}
            className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 px-5 py-4"
          >
            <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-zinc-500">
              {label}
            </div>
            <div className={cn("text-2xl font-mono font-semibold mt-1.5", color)}>
              {value}
            </div>
            {sub && (
              <div className="text-[11px] text-zinc-600 mt-0.5">{sub}</div>
            )}
          </div>
        ))}
      </div>

      {/* ── Busca ───────────────────────────────────────────────────────── */}
      <div className="relative">
        <Search
          size={14}
          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none"
        />
        <input
          type="text"
          placeholder="Buscar por nome, CNPJ, cidade ou e-mail…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-zinc-800 bg-zinc-900/60 pl-9 pr-4 py-2.5",
            "text-sm text-zinc-200 placeholder:text-zinc-600",
            "focus:outline-none focus:border-zinc-600 focus:ring-0 transition-colors",
          )}
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400 text-xs"
          >
            ✕
          </button>
        )}
      </div>

      {/* ── Tabela ──────────────────────────────────────────────────────── */}
      <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1fr_1.5fr_1fr] gap-4 px-5 py-3 border-b border-zinc-800/80">
          {["EMPRESA", "CNPJ", "CONTATO", "LOCALIZAÇÃO"].map(
            (h) => (
              <div
                key={h}
                className="text-[10px] uppercase tracking-[0.12em] font-medium text-zinc-500"
              >
                {h}
              </div>
            ),
          )}
        </div>

        {/* Linhas */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-2">
            <Building2 size={28} className="text-zinc-700" />
            <p className="text-sm text-zinc-500">
              {query ? "Nenhum fornecedor encontrado" : "Nenhum fornecedor cadastrado"}
            </p>
            {!query && (
              <p className="text-xs text-zinc-600">
                Clique em &quot;Sincronizar Omie&quot; para importar
              </p>
            )}
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800/60">
            {filtered.map((f) => (
              <li
                key={f.id}
                className="grid grid-cols-[2fr_1fr_1.5fr_1fr] gap-4 px-5 py-3.5 hover:bg-zinc-800/20 transition-colors"
              >
                {/* Empresa */}
                <div className="min-w-0">
                  <div className="text-sm font-medium text-zinc-100 truncate leading-tight">
                    {f.nome_fantasia || f.razao_social}
                  </div>
                  {f.nome_fantasia && (
                    <div className="text-[11px] text-zinc-500 truncate mt-0.5">
                      {f.razao_social}
                    </div>
                  )}
                </div>

                {/* CNPJ */}
                <div className="font-mono text-[12px] text-zinc-400 self-center">
                  {formatCnpj(f.cnpj)}
                </div>

                {/* Contato — e-mail em destaque, telefone abaixo */}
                <div className="min-w-0 self-center space-y-0.5">
                  {f.email ? (
                    <div className="flex items-center gap-1.5 text-[12px] text-zinc-300 truncate">
                      <Mail size={10} className="text-zinc-500 shrink-0" />
                      <span className="truncate">{f.email}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1.5 text-[12px] text-zinc-600">
                      <Mail size={10} className="text-zinc-700 shrink-0" />
                      <span>sem e-mail</span>
                    </div>
                  )}
                  {f.telefone && (
                    <div className="flex items-center gap-1.5 text-[12px] text-zinc-500">
                      <Phone size={10} className="text-zinc-600 shrink-0" />
                      {f.telefone}
                    </div>
                  )}
                </div>

                {/* Localização */}
                <div className="self-center">
                  {f.cidade ? (
                    <div className="flex items-center gap-1.5 text-[12px] text-zinc-400">
                      <MapPin size={10} className="text-zinc-600 shrink-0" />
                      <span className="truncate">
                        {f.cidade}
                        {f.uf && `, ${f.uf}`}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[12px] text-zinc-600">—</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {/* Footer com contagem */}
        {filtered.length > 0 && (
          <div className="px-5 py-3 border-t border-zinc-800/60 flex items-center justify-between">
            <span className="text-[12px] text-zinc-600">
              {filtered.length === fornecedores.length
                ? `${fornecedores.length} fornecedor${fornecedores.length !== 1 ? "es" : ""}`
                : `${filtered.length} de ${fornecedores.length} fornecedor${fornecedores.length !== 1 ? "es" : ""}`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
