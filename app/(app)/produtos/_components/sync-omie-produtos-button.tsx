"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Download, Search, X, Clock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { importarProdutoOmie } from "../actions";

// ── Sync completo / inteligente ────────────────────────────────────────────────

function SyncButton() {
  const [syncing, setSyncing] = useState(false);
  const router = useRouter();

  async function handleSync(forcarCompleto = false) {
    if (syncing) return;
    setSyncing(true);

    toast.info(
      forcarCompleto ? "Sync completo iniciado" : "Verificando alterações no Omie…",
      { description: "Catálogo sendo atualizado em segundo plano", duration: 5_000 },
    );

    setTimeout(() => setSyncing(false), 2_000);

    fetch("/api/omie/sync", {
      method:    "POST",
      headers:   { "Content-Type": "application/json" },
      body:      JSON.stringify({ entidade: "produtos", incremental: !forcarCompleto }),
      keepalive: true,
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          toast.error(data.error ?? `Erro HTTP ${res.status}`);
          return;
        }
        const data = await res.json().catch(() => ({}));
        const detalhe = data?.results?.[0]?.detalhe;
        if (typeof detalhe?.info === "string") {
          toast.success("Catálogo já atualizado", { description: "Nenhuma alteração detectada no Omie" });
        }
        router.refresh();
      })
      .catch((err) => {
        if (err instanceof Error && err.name === "AbortError") return;
        toast.error("Erro ao iniciar sincronização com Omie");
      });
  }

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => handleSync(false)}
        disabled={syncing}
        title="Sync inteligente: verifica alterações antes de baixar tudo"
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
          "border-border bg-muted/60 text-foreground hover:bg-muted hover:border-border",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <RefreshCw size={14} className={cn("shrink-0", syncing && "animate-spin")} />
        {syncing ? "Iniciando…" : "Sincronizar Omie"}
      </button>

      {/* Forçar sync completo — botão ícone discreto */}
      <button
        onClick={() => handleSync(true)}
        disabled={syncing}
        title="Forçar sync completo (ignora verificação de alterações)"
        className={cn(
          "inline-flex items-center rounded-lg border px-2 py-2 text-xs transition-colors",
          "border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground",
          "disabled:opacity-50 disabled:cursor-not-allowed",
        )}
      >
        <RefreshCw size={11} className="shrink-0" />
      </button>
    </div>
  );
}

// ── Importar produto por código ────────────────────────────────────────────────

function ImportarPorCodigoButton() {
  const [aberto, setAberto] = useState(false);
  const [codigo, setCodigo] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  // Refs para o auto-retry: evita problemas de closure com estado React
  const handleImportarRef = useRef<(() => Promise<void>) | null>(null);
  const isAutoRetryRef = useRef(false);

  // Countdown decrescente: quando chega a 0, dispara auto-retry
  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      setCountdown(null);
      isAutoRetryRef.current = true; // sinaliza ao handleImportar para ignorar o guard de countdown
      handleImportarRef.current?.();
      return;
    }
    const timer = setTimeout(
      () => setCountdown(c => (c !== null ? c - 1 : null)),
      1_000,
    );
    return () => clearTimeout(timer);
  }, [countdown]);

  function abrir() {
    setAberto(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  function fechar() {
    setCountdown(null);
    setAberto(false);
    setCodigo("");
  }

  async function handleImportar() {
    // Bloqueia durante loading ou countdown — exceto quando auto-retry aciona (isAutoRetryRef)
    if (!codigo.trim() || carregando || (countdown !== null && !isAutoRetryRef.current)) return;
    isAutoRetryRef.current = false;
    setCarregando(true);

    try {
      const result = await importarProdutoOmie(codigo.trim());

      if ("redundante" in result) {
        // Omie bloqueou: inicia countdown e tenta de novo automaticamente
        setCountdown(result.aguardarSegundos);
        toast.info("Omie ocupado — tentando novamente", {
          description: `Aguardando ${result.aguardarSegundos}s…`,
          duration: result.aguardarSegundos * 1_000,
        });
      } else if ("erro" in result) {
        toast.error(result.erro);
      } else {
        toast.success("Produto importado", {
          description: `${result.produto.nome} (${result.produto.codigo})`,
        });
        fechar();
        router.refresh();
      }
    } finally {
      setCarregando(false);
    }
  }

  // Mantém sempre a versão mais recente do handler (com o código atual no closure)
  handleImportarRef.current = handleImportar;

  const travado = carregando || countdown !== null;

  if (!aberto) {
    return (
      <button
        onClick={abrir}
        title="Importar um produto específico pelo código Omie"
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors",
          "border-border bg-muted/60 text-foreground hover:bg-muted hover:border-border",
        )}
      >
        <Download size={14} className="shrink-0" />
        Importar por código
      </button>
    );
  }

  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-muted/60 px-2 py-1.5">
      <Search size={13} className="shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="text"
        value={codigo}
        onChange={(e) => setCodigo(e.target.value.toUpperCase())}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !travado) handleImportar();
          if (e.key === "Escape") fechar();
        }}
        placeholder="Ex: INS00123"
        className="w-32 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
        disabled={travado}
      />
      <button
        onClick={handleImportar}
        disabled={!codigo.trim() || travado}
        title={countdown !== null ? `Aguardando Omie — tentando novamente em ${countdown}s` : undefined}
        className={cn(
          "rounded px-2 py-0.5 text-xs font-medium transition-colors",
          "bg-primary text-primary-foreground hover:bg-primary/90",
          "disabled:opacity-50 disabled:cursor-not-allowed",
          countdown !== null && "bg-amber-600 hover:bg-amber-600",
        )}
      >
        {carregando
          ? "…"
          : countdown !== null
          ? `${countdown}s`
          : "Importar"}
      </button>
      {countdown !== null && (
        <Clock size={11} className="shrink-0 text-amber-500 animate-pulse" />
      )}
      <button
        onClick={fechar}
        disabled={carregando}
        className="rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );
}

// ── Export ─────────────────────────────────────────────────────────────────────

export function SyncOmieProdutosButton() {
  return (
    <div className="flex items-center gap-2">
      <SyncButton />
      <ImportarPorCodigoButton />
    </div>
  );
}
