"use client";

/**
 * importar-contagem-modal.tsx
 *
 * Sobe a planilha preenchida e mostra o que vai mudar ANTES de gravar.
 *
 * A prévia não é enfeite: um import de contagem sobrescreve o mês inteiro de uma
 * vez, e arquivo do mês errado, coluna trocada ou planilha preenchida pela metade
 * só apareceriam depois de o dano estar no banco. Aqui a pessoa vê linha por
 * linha o que entra, o que substitui e o que foi ignorado — e só então confirma.
 */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X, Loader2, FileSpreadsheet, AlertCircle, Check, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { Previa, StatusLinha } from "@/lib/estoque/import-contagem";
import { analisarPlanilhaContagem, aplicarContagemImportada } from "../actions";

interface Props {
  cicloId: string;
  /** Rótulo do mês, só para o cabeçalho do modal. */
  mesRotulo: string;
  onClose: () => void;
}

interface Analise {
  modo: "abertura" | "fechamento";
  previa: Previa;
  linhasLidas: number;
  linhasSemVinculo: number;
}

/** Teto da tabela na tela. Nunca truncar em silêncio — o rodapé diz o total. */
const MAX_LINHAS_VISIVEIS = 250;

const ESTILO_STATUS: Record<StatusLinha, { rotulo: string; bolinha: string; texto: string }> = {
  novo:       { rotulo: "novo",      bolinha: "bg-emerald-500", texto: "text-emerald-400" },
  substitui:  { rotulo: "substitui", bolinha: "bg-amber-500",   texto: "text-amber-400" },
  igual:      { rotulo: "igual",     bolinha: "bg-muted-foreground/50", texto: "text-muted-foreground" },
  ignorado:   { rotulo: "ignorado",  bolinha: "bg-red-500",     texto: "text-red-400" },
};

function formatarQtd(valor: number): string {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
}

export function ImportarContagemModal({ cicloId, mesRotulo, onClose }: Props) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [nomeArquivo, setNomeArquivo] = useState<string | null>(null);
  const [analisando, setAnalisando] = useState(false);
  const [aplicando, setAplicando] = useState(false);
  const [analise, setAnalise] = useState<Analise | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function fechar() {
    if (analisando || aplicando) return;
    onClose();
  }

  async function analisar(arquivo: File) {
    setNomeArquivo(arquivo.name);
    setErro(null);
    setAnalise(null);
    setAnalisando(true);
    try {
      const fd = new FormData();
      fd.set("cicloId", cicloId);
      fd.set("arquivo", arquivo);
      const res = await analisarPlanilhaContagem(fd);
      if ("erro" in res) {
        setErro(res.erro);
        return;
      }
      if (res.previa.erroArquivo) {
        setErro(res.previa.erroArquivo);
        return;
      }
      setAnalise({
        modo: res.modo,
        previa: res.previa,
        linhasLidas: res.linhasLidas,
        linhasSemVinculo: res.linhasSemVinculo,
      });
    } finally {
      setAnalisando(false);
    }
  }

  async function aplicar() {
    if (!analise) return;
    setAplicando(true);
    try {
      const res = await aplicarContagemImportada({
        cicloId,
        linhas: analise.previa.aplicaveis,
      });
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        `${res.gravados} ${res.gravados === 1 ? "item gravado" : "itens gravados"} da planilha`,
      );
      router.refresh();
      onClose();
    } finally {
      setAplicando(false);
    }
  }

  const resumo = analise?.previa.resumo;
  const aGravar = analise?.previa.aplicaveis.length ?? 0;
  const linhas = analise?.previa.linhas ?? [];
  const visiveis = linhas.slice(0, MAX_LINHAS_VISIVEIS);

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-[6vh] px-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={fechar} />
      <div className="relative w-full max-w-[760px] rounded-xl border border-border bg-background shadow-2xl overflow-hidden">

        <div className="flex items-center justify-between px-5 py-4 border-b border-border/80">
          <div>
            <h2 className="text-base font-semibold text-foreground">Importar contagem do Excel</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{mesRotulo}</p>
          </div>
          <button
            onClick={fechar}
            disabled={analisando || aplicando}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50"
          >
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* ── Escolha do arquivo ── */}
          <div className="space-y-2">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const arquivo = e.target.files?.[0];
                // Limpa o input para que escolher o MESMO arquivo de novo (depois
                // de corrigir a planilha) dispare o onChange outra vez.
                e.target.value = "";
                if (arquivo) void analisar(arquivo);
              }}
            />
            <button
              onClick={() => inputRef.current?.click()}
              disabled={analisando || aplicando}
              className="w-full flex items-center justify-center gap-2 h-11 rounded-lg border border-dashed border-border text-sm font-medium text-muted-foreground hover:border-emerald-500/40 hover:text-foreground transition-colors disabled:opacity-60"
            >
              {analisando
                ? <Loader2 size={15} className="animate-spin" />
                : <Upload size={15} />}
              {analisando ? "Lendo a planilha…" : nomeArquivo ?? "Escolher a planilha preenchida (.xlsx)"}
            </button>
            {nomeArquivo && !analisando && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <FileSpreadsheet size={11} />
                {nomeArquivo}
              </p>
            )}
          </div>

          {erro && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 flex gap-2.5">
              <AlertCircle size={15} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-foreground leading-relaxed">{erro}</p>
            </div>
          )}

          {analise && resumo && (
            <>
              {analise.modo === "abertura" && (
                <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
                  <p className="text-xs text-foreground">
                    Esta contagem está lançando <strong>saldo de abertura</strong> — os números da
                    planilha vão para a coluna de saldo inicial, não para a contagem de fechamento.
                  </p>
                </div>
              )}

              {/* Linha preenchida à mão não pode desaparecer calada: alguém
                  digitou aquele número e ele não vai entrar. */}
              {analise.linhasSemVinculo > 0 && (
                <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 flex gap-2.5">
                  <AlertCircle size={15} className="text-amber-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-foreground leading-relaxed">
                    <strong>
                      {analise.linhasSemVinculo}{" "}
                      {analise.linhasSemVinculo === 1 ? "linha preenchida foi" : "linhas preenchidas foram"}{" "}
                      descartada{analise.linhasSemVinculo === 1 ? "" : "s"}
                    </strong>{" "}
                    por não {analise.linhasSemVinculo === 1 ? "vir" : "virem"} da exportação — linha
                    acrescentada à mão na planilha não entra. Cadastre o item em{" "}
                    <span className="text-emerald-400">Estoque</span> e traga-o para a contagem antes
                    de importar.
                  </p>
                </div>
              )}

              {/* ── Resumo ── */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {([
                  ["novos", resumo.novos, "text-emerald-400"],
                  ["substituem", resumo.substituidos, "text-amber-400"],
                  ["sem mudança", resumo.iguais, "text-muted-foreground"],
                  ["ignorados", resumo.ignorados, "text-red-400"],
                ] as const).map(([rotulo, valor, cor]) => (
                  <div key={rotulo} className="rounded-lg border border-border bg-card px-3 py-2">
                    <p className={cn("text-lg font-semibold tabular-nums", cor)}>{valor}</p>
                    <p className="text-[11px] text-muted-foreground">{rotulo}</p>
                  </div>
                ))}
              </div>

              {linhas.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">
                  A planilha foi lida ({analise.linhasLidas}{" "}
                  {analise.linhasLidas === 1 ? "linha" : "linhas"}), mas nenhuma célula de contagem
                  estava preenchida. Célula em branco significa &ldquo;não contei&rdquo; e é
                  deixada como está.
                </p>
              ) : (
                <div className="rounded-lg border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                        <th className="px-3 py-2 font-medium">Item</th>
                        <th className="px-3 py-2 font-medium text-right">Valor</th>
                        <th className="px-3 py-2 font-medium">Efeito</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visiveis.map((linha) => {
                        const estilo = ESTILO_STATUS[linha.status];
                        return (
                          <tr key={`${linha.linhaExcel}-${linha.nome}`} className="border-t border-border/60">
                            <td className="px-3 py-2 text-foreground">
                              {linha.nome}
                              <span className="text-muted-foreground/60 ml-1.5">
                                linha {linha.linhaExcel}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-foreground">
                              {linha.valor != null ? formatarQtd(linha.valor) : "—"}
                            </td>
                            <td className="px-3 py-2">
                              {/* Bolinha + texto: cor sozinha não atende WCAG. */}
                              <span className={cn("inline-flex items-center gap-1.5", estilo.texto)}>
                                <span className={cn("size-1.5 rounded-full shrink-0", estilo.bolinha)} />
                                {linha.status === "substitui" && linha.de != null
                                  ? `substitui ${formatarQtd(linha.de)}`
                                  : estilo.rotulo}
                              </span>
                              {linha.motivo && (
                                <span className="text-muted-foreground ml-1.5">— {linha.motivo}</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {linhas.length > visiveis.length && (
                    <p className="px-3 py-2 text-[11px] text-muted-foreground border-t border-border/60 bg-muted/30">
                      Mostrando {visiveis.length} de {linhas.length} linhas. Confirmar aplica todas.
                    </p>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {analise && (
          <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-t border-border/80 bg-card">
            <p className="text-xs text-muted-foreground">
              {aGravar === 0
                ? "Nada a gravar."
                : `${aGravar} ${aGravar === 1 ? "item será gravado" : "itens serão gravados"}.`}
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={fechar}
                disabled={aplicando}
                className="h-9 px-3 rounded-md text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={aplicar}
                disabled={aplicando || aGravar === 0}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-emerald-500 text-white text-xs font-semibold hover:bg-emerald-600 transition-colors disabled:opacity-50"
              >
                {aplicando ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Gravar contagem
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
