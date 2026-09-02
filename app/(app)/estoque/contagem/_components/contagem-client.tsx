"use client";

/**
 * contagem-client.tsx — módulo de Estoque (bloco 2, contagem mensal)
 *
 * Tela mobile-first: a pessoa está de pé no estoque, celular na mão. Cada
 * item salva sozinho no blur/Enter — nada de "salvar tudo" no fim, que
 * perderia a contagem inteira se o sinal caísse no meio do corredor.
 *
 * Teórico e divergência aparecem quando entradas e saídas já foram
 * importadas (blocos 3 e 4) — `calcularTeorico`/`calcularDivergencia`
 * devolvem `null` enquanto qualquer uma das duas ainda não existe, e o card
 * mostra "—" nesse caso.
 *
 * `CicloAbertoView` é remontada via `key` a cada ciclo novo ou a cada
 * reimportação de entradas/saídas — é assim que o estado local (itens,
 * rascunhos) resincroniza com o servidor depois de abrir/fechar/importar,
 * sem precisar de setState dentro de useEffect (regra de lint do projeto
 * proíbe: cascata de renders desnecessária). Ver `chaveCiclo`.
 */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Check, AlertCircle, Boxes, Download, Info, Printer, FileSpreadsheet, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { calcularARepor, calcularTeorico, calcularDivergencia, rotuloMes } from "@/lib/estoque/ciclo";
import {
  abrirCiclo,
  registrarContagem,
  registrarInventarioInicial,
  fecharCiclo,
  descartarCiclo,
  importarSaidasDoAutomo,
  importarEntradasDoOmie,
  sincronizarItensDoCiclo,
  editarSaldoAbertura,
} from "../actions";
import type { CicloView, CicloItemView } from "./tipos";
import { EstoquePrintDoc } from "./estoque-print-doc";
import { ImportarContagemModal } from "./importar-contagem-modal";

interface Props {
  local:                        { id: string; nome: string };
  temItensControlados:         boolean;
  ciclo:                       CicloView | null;
  itens:                       CicloItemView[];
  /** Itens controlados que ficaram fora do ciclo aberto (cadastrados após a abertura). */
  itensForaDoCiclo:            number;
  /**
   * Primeiro ciclo deste local. Não existe mês anterior, então o campo
   * `contagem_anterior` é rotulado "Saldo de abertura" — chamá-lo de "contagem
   * anterior" fez a compradora pedir para remover números que eram justamente
   * a abertura que ela mesma tinha lançado.
   */
  ehPrimeiroCiclo:             boolean;
  /** True enquanto sobrar item sem saldo de abertura (`contagem_anterior` null) no primeiro ciclo do local — modo "saldo de abertura" (ver bloco 6). Vira false sozinho quando o último saldo é registrado. */
  faltaSaldoAbertura:          boolean;
  /** True quando o local tem mais de uma unidade fiscal (CNPJ) — controla se o rateio por CNPJ aparece nos cards. */
  temMultiplasUnidadesFiscais: boolean;
  /** Nomes dos CNPJs que abastecem o local — usado no cabeçalho do PDF. */
  unidadesFiscais:             string[];
}

/** Mês corrente em ISO (dia 1), só para o rótulo do botão "Abrir contagem" — a
 *  fonte da verdade é sempre o mês calculado no servidor por `abrirCiclo`. */
function mesAtualIsoClient(): string {
  const agora = new Date();
  return `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Chave de remount de `CicloAbertoView`. Inclui `saidas` e `entradas` de
 * cada item de propósito: é o único jeito de o `useState(itensIniciais)`
 * reler o valor fresco depois de "Importar saídas do Automo" ou "Importar
 * entradas do Omie" sem precisar de setState em useEffect (proibido pelo
 * lint do projeto) — muda só quando o dado em si muda, então um clique em
 * "salvar contagem" (que não toca nenhum dos dois) não força remontagem à toa.
 */
function chaveCiclo(cicloId: string, itens: CicloItemView[]): string {
  return `${cicloId}:${itens.map((it) => `${it.id}=${it.saidas ?? ""}:${it.entradas ?? ""}`).join(",")}`;
}

export function ContagemClient({
  local,
  temItensControlados,
  ciclo,
  itens,
  itensForaDoCiclo,
  ehPrimeiroCiclo,
  faltaSaldoAbertura,
  temMultiplasUnidadesFiscais,
  unidadesFiscais,
}: Props) {
  const router = useRouter();
  const [abrindo, setAbrindo] = useState(false);

  async function handleAbrir() {
    setAbrindo(true);
    try {
      const res = await abrirCiclo(local.id);
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      toast.success("Contagem aberta");
      router.refresh();
    } finally {
      setAbrindo(false);
    }
  }

  if (!temItensControlados) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center gap-3">
        <Boxes size={28} className="text-muted-foreground/30" />
        <div className="space-y-1">
          <p className="text-sm text-foreground font-medium">Nenhum item controlado em {local.nome}</p>
          <p className="text-xs text-muted-foreground">
            Cadastre os itens em{" "}
            <Link href="/estoque" className="text-emerald-500 underline underline-offset-2">
              Estoque
            </Link>{" "}
            antes de abrir a contagem.
          </p>
        </div>
      </div>
    );
  }

  if (!ciclo) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] px-6">
        <div className="rounded-xl border border-border bg-card p-6 w-full max-w-sm space-y-4 text-center">
          <div>
            <h1 className="text-base font-semibold text-foreground">{local.nome}</h1>
            <p className="text-sm text-muted-foreground mt-1">Nenhuma contagem aberta neste mês.</p>
          </div>
          <button
            onClick={handleAbrir}
            disabled={abrindo}
            className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-lg bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition-colors disabled:opacity-60"
          >
            {abrindo && <Loader2 size={16} className="animate-spin" />}
            Abrir contagem de {rotuloMes(mesAtualIsoClient())}
          </button>
        </div>
      </div>
    );
  }

  return (
    <CicloAbertoView
      key={chaveCiclo(ciclo.id, itens)}
      local={local}
      ciclo={ciclo}
      itensIniciais={itens}
      itensForaDoCiclo={itensForaDoCiclo}
      ehPrimeiroCiclo={ehPrimeiroCiclo}
      faltaSaldoAbertura={faltaSaldoAbertura}
      temMultiplasUnidadesFiscais={temMultiplasUnidadesFiscais}
      unidadesFiscais={unidadesFiscais}
    />
  );
}

interface CicloAbertoViewProps {
  local:                       { id: string; nome: string };
  ciclo:                       CicloView;
  itensIniciais:               CicloItemView[];
  itensForaDoCiclo:            number;
  ehPrimeiroCiclo:             boolean;
  faltaSaldoAbertura:          boolean;
  temMultiplasUnidadesFiscais: boolean;
  unidadesFiscais:             string[];
}

/**
 * Corpo da tela com o ciclo já aberto. Componente próprio (não inline em
 * `ContagemClient`) para que a `key` do pai (`chaveCiclo`) force uma
 * montagem nova — e portanto um `useState(itensIniciais)` fresco — a cada
 * ciclo novo ou reimportação de saídas.
 */
function CicloAbertoView({
  local,
  ciclo,
  itensIniciais,
  itensForaDoCiclo,
  ehPrimeiroCiclo,
  faltaSaldoAbertura,
  temMultiplasUnidadesFiscais,
  unidadesFiscais,
}: CicloAbertoViewProps) {
  const router = useRouter();
  const [itensLocal, setItensLocal] = useState(itensIniciais);
  const [fechando, setFechando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importandoEntradas, setImportandoEntradas] = useState(false);
  const [printOpen, setPrintOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [virandoMes, setVirandoMes] = useState(false);
  const [descartando, setDescartando] = useState(false);
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);

  /*
   * O ciclo aberto é de um mês que já passou.
   *
   * Comparar as strings "YYYY-MM-01" direto equivale a comparar as datas e evita
   * `new Date(ciclo.mes)`, que leria a string como UTC meia-noite e voltaria um
   * dia em fuso negativo (mesmo cuidado de `rotuloMes` em lib/estoque/ciclo.ts).
   */
  const cicloAtrasado = ciclo.mes < mesAtualIsoClient();
  // Nenhum número digitado por ninguém — é a mesma condição que `descartarCiclo`
  // exige no servidor. Repetida aqui só para não oferecer um botão que voltaria
  // com erro; a checagem que vale é a de lá.
  const nadaContado = itensLocal.every((it) => it.contadoEm == null);

  async function handleVirarMes() {
    setVirandoMes(true);
    try {
      // `abrirCiclo` fecha o ciclo aberto de mês anterior antes de criar o do mês
      // corrente — o ciclo velho vira histórico em vez de desaparecer.
      const res = await abrirCiclo(local.id);
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      toast.success(`Contagem de ${rotuloMes(mesAtualIsoClient())} aberta`);
      router.refresh();
    } finally {
      setVirandoMes(false);
    }
  }

  async function handleDescartar() {
    setDescartando(true);
    try {
      const res = await descartarCiclo(ciclo.id);
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      toast.success("Contagem descartada");
      router.refresh();
    } finally {
      setDescartando(false);
    }
  }

  async function handleSincronizar() {
    setSincronizando(true);
    try {
      const res = await sincronizarItensDoCiclo(ciclo.id);
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      toast.success(
        res.adicionados === 0
          ? "Nenhum item novo a trazer"
          : `${res.adicionados} ${res.adicionados === 1 ? "item trazido" : "itens trazidos"} para a contagem`,
      );
      router.refresh();
    } finally {
      setSincronizando(false);
    }
  }

  // Sem guard de "montado": `printOpen` nasce false, então o portal nunca é
  // renderizado no servidor. Ele só vira true por clique, que já é client-side.
  // (O jeito comum — `useEffect(() => setMounted(true), [])` — é proibido pelo
  //  lint do projeto: setState direto dentro de effect.)

  // Liga o modo de impressão escopado (CSS em globals.css) enquanto o overlay
  // está aberto — assim window.print() imprime só o documento, não a tela.
  useEffect(() => {
    document.body.classList.toggle("estoque-print-mode", printOpen);
    return () => document.body.classList.remove("estoque-print-mode");
  }, [printOpen]);

  function handleItemSalvo(id: string, patch: Partial<CicloItemView>) {
    setItensLocal((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  const total = itensLocal.length;
  // Enquanto faltar saldo de abertura, o progresso conta contagem_anterior
  // (o que está sendo registrado agora); depois que o último item ganha esse
  // valor, `faltaSaldoAbertura` vira false e o progresso passa a contar
  // contagem_atual — a contagem de fechamento normal.
  const contados = itensLocal.filter((it) =>
    faltaSaldoAbertura ? it.contagemAnterior != null : it.contagemAtual != null,
  ).length;
  const faltam = total - contados;

  async function handleFechar() {
    setFechando(true);
    try {
      const res = await fecharCiclo(ciclo.id);
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      toast.success("Contagem fechada");
      router.refresh();
    } finally {
      setFechando(false);
    }
  }

  async function handleImportar() {
    setImportando(true);
    try {
      const res = await importarSaidasDoAutomo(ciclo.id);
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      const rotuloItens = res.itensAtualizados === 1 ? "item atualizado" : "itens atualizados";
      const complemento =
        res.produtosIgnorados > 0
          ? ` · ${res.produtosIgnorados} ${res.produtosIgnorados === 1 ? "produto" : "produtos"} do Automo sem mapeamento foram ignorados`
          : "";
      toast.success(`${res.itensAtualizados} ${rotuloItens}${complemento}`);
      router.refresh();
    } finally {
      setImportando(false);
    }
  }

  async function handleImportarEntradas() {
    setImportandoEntradas(true);
    try {
      const res = await importarEntradasDoOmie(ciclo.id);
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      const rotuloItens = res.itensAtualizados === 1 ? "item atualizado" : "itens atualizados";
      toast.success(`${res.itensAtualizados} ${rotuloItens}`);
      if (res.itensParciais > 0) {
        toast.warning(
          `${res.itensParciais} ${res.itensParciais === 1 ? "item" : "itens"} ` +
            `${res.itensParciais === 1 ? "recebeu" : "receberam"} entrada de apenas parte dos CNPJs do local`,
        );
      }
      if (res.ajustesDetectados > 0) {
        toast.info(
          `${res.ajustesDetectados} ${res.ajustesDetectados === 1 ? "ajuste" : "ajustes"} de inventário ` +
            `${res.ajustesDetectados === 1 ? "lançado" : "lançados"} no Omie no período`,
        );
      }
      router.refresh();
    } finally {
      setImportandoEntradas(false);
    }
  }

  return (
    <div className="flex flex-col -m-4 sm:-m-6">
      <header className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border px-4 py-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold text-foreground">{local.nome}</h1>
            <p className="text-xs text-muted-foreground">{rotuloMes(ciclo.mes)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={handleImportar}
              disabled={importando}
              title="Importar saídas do Automo"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              {importando ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              <span className="hidden sm:inline">Importar saídas do Automo</span>
            </button>
            <button
              onClick={handleImportarEntradas}
              disabled={importandoEntradas}
              title="Importar entradas do Omie"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors disabled:opacity-60"
            >
              {importandoEntradas ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Download size={14} />
              )}
              <span className="hidden sm:inline">Importar entradas do Omie</span>
            </button>

            {/* Exportações — a planilha atual circula por e-mail e é discutida em
                reunião, então a tela precisa ter saída para os dois formatos. */}
            <button
              onClick={() => setPrintOpen(true)}
              title="Exportar PDF"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              <Printer size={14} />
              <span className="hidden lg:inline">PDF</span>
            </button>
            <a
              href={`/api/estoque/ciclo/${ciclo.id}/xlsx`}
              title="Exportar Excel"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              <FileSpreadsheet size={14} />
              <span className="hidden lg:inline">Excel</span>
            </a>
            {/* Caminho inverso da exportação: a equipe preenche a coluna de
                contagem na planilha e sobe o mesmo arquivo de volta. É o que
                torna viável o saldo de abertura, com centenas de itens. */}
            <button
              onClick={() => setImportOpen(true)}
              title="Importar contagem do Excel"
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              <Upload size={14} />
              <span className="hidden lg:inline">Importar Excel</span>
            </button>

            <p className="text-xs font-medium text-muted-foreground">
              {contados} de {total} contados
            </p>
          </div>
        </div>
        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-300"
            style={{ width: `${total > 0 ? (contados / total) * 100 : 0}%` }}
          />
        </div>
      </header>

      <main className="flex-1 px-4 py-4 space-y-3">
        {/*
          O mês virou e o ciclo aberto é do mês passado.

          Sem este aviso o módulo ficava trancado: `fecharCiclo` exige todos os
          itens contados e o botão "Abrir contagem" só aparece quando NÃO há
          ciclo aberto — então não havia caminho nenhum até o mês novo. Aconteceu
          com o ciclo de agosto/2026 do Lush Ipiranga, aberto num teste.
        */}
        {cicloAtrasado && (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 flex gap-3">
            <AlertCircle size={16} className="text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-semibold text-foreground">
                Esta contagem é de {rotuloMes(ciclo.mes)} e o mês já virou
              </p>
              <p className="text-xs text-muted-foreground">
                A tela mostra sempre a contagem aberta. Abrir a de{" "}
                {rotuloMes(mesAtualIsoClient())} fecha esta aqui e leva o que já foi
                contado para o histórico
                {nadaContado && " — ou descarte, já que ninguém preencheu nada nela"}.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={handleVirarMes}
                  disabled={virandoMes || descartando}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-amber-500/40 bg-amber-500/10 text-xs font-semibold text-amber-300 hover:bg-amber-500/20 transition-colors disabled:opacity-60"
                >
                  {virandoMes ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                  Abrir contagem de {rotuloMes(mesAtualIsoClient())}
                </button>

                {/* Descarte só quando não há número digitado para perder — a
                    condição que vale é a do servidor, em `descartarCiclo`.
                    Confirmação inline, nunca window.confirm (CLAUDE.md §11). */}
                {nadaContado && !confirmandoDescarte && (
                  <button
                    onClick={() => setConfirmandoDescarte(true)}
                    disabled={virandoMes || descartando}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground transition-colors disabled:opacity-60"
                  >
                    descartar esta contagem
                  </button>
                )}
                {nadaContado && confirmandoDescarte && (
                  <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
                    Apagar a contagem de {rotuloMes(ciclo.mes)}?
                    <button
                      onClick={handleDescartar}
                      disabled={descartando}
                      className="inline-flex items-center gap-1 font-semibold text-red-400 hover:text-red-300 transition-colors disabled:opacity-60"
                    >
                      {descartando && <Loader2 size={12} className="animate-spin" />}
                      apagar
                    </button>
                    <button
                      onClick={() => setConfirmandoDescarte(false)}
                      disabled={descartando}
                      className="hover:text-foreground transition-colors disabled:opacity-60"
                    >
                      cancelar
                    </button>
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        {/*
          Item cadastrado depois da abertura não entra no ciclo sozinho —
          `abrirCiclo` materializa as linhas no momento da abertura. Sem este
          aviso o item simplesmente não aparecia, sem nenhuma pista do porquê.
        */}
        {itensForaDoCiclo > 0 && (
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/10 p-4 flex gap-3">
            <AlertCircle size={16} className="text-sky-400 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-2">
              <p className="text-sm font-semibold text-foreground">
                {itensForaDoCiclo} {itensForaDoCiclo === 1 ? "item novo" : "itens novos"} desde a abertura
              </p>
              <p className="text-xs text-muted-foreground">
                {itensForaDoCiclo === 1 ? "Ele foi cadastrado" : "Eles foram cadastrados"} depois
                que esta contagem abriu, então ainda não {itensForaDoCiclo === 1 ? "aparece" : "aparecem"} na
                lista. Traga {itensForaDoCiclo === 1 ? "ele" : "eles"} para o ciclo para poder contar.
              </p>
              <button
                onClick={handleSincronizar}
                disabled={sincronizando}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-sky-500/40 bg-sky-500/10 text-xs font-semibold text-sky-300 hover:bg-sky-500/20 transition-colors disabled:opacity-60"
              >
                {sincronizando ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Trazer para a contagem
              </button>
            </div>
          </div>
        )}
        {faltaSaldoAbertura && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex gap-3">
            <Info size={16} className="text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-foreground">Primeiro ciclo deste local</p>
              <p className="text-xs text-muted-foreground">
                O número que você lança agora é o saldo de abertura: o que já tem em cada item
                hoje, antes de entrar qualquer entrada ou saída deste mês. A contagem de
                fechamento — para apurar o que sobrou no fim do período — fica disponível
                separadamente, mais adiante.
              </p>
            </div>
          </div>
        )}
        {/*
          No desktop a lista vira tabela com as colunas do PDF; no celular
          continua sendo cards, que é como a contagem é feita de fato. O
          agrupamento com `lg:space-y-0` remove o espaço entre cards para as
          linhas ficarem encostadas, como numa tabela.
        */}
        <div className="space-y-3 lg:space-y-0 lg:rounded-xl lg:border lg:border-border lg:bg-card lg:pt-3 lg:pb-1">
          <CabecalhoContagem ehPrimeiroCiclo={ehPrimeiroCiclo} />
          {itensLocal.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              faltaSaldoAbertura={faltaSaldoAbertura}
              ehPrimeiroCiclo={ehPrimeiroCiclo}
              temMultiplasUnidadesFiscais={temMultiplasUnidadesFiscais}
              onSalvo={handleItemSalvo}
            />
          ))}
        </div>
      </main>

      <footer className="sticky bottom-0 z-20 bg-background/95 backdrop-blur border-t border-border px-4 py-3 space-y-2">
        {faltaSaldoAbertura ? (
          <p className="text-xs text-center text-muted-foreground py-2.5">
            {faltam > 0
              ? `Faltam ${faltam} ${faltam === 1 ? "item" : "itens"} sem saldo de abertura. Assim que todos estiverem preenchidos, esta tela passa a mostrar a contagem de fechamento.`
              : "Saldo de abertura completo. Atualize a página para ver a contagem de fechamento."}
          </p>
        ) : (
          <button
            onClick={handleFechar}
            disabled={fechando || faltam > 0}
            className="w-full inline-flex items-center justify-center gap-2 h-12 rounded-lg bg-emerald-500 text-white font-semibold text-sm hover:bg-emerald-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {fechando && <Loader2 size={16} className="animate-spin" />}
            {faltam > 0 ? `Fechar contagem (faltam ${faltam})` : "Fechar contagem"}
          </button>
        )}
      </footer>

      {importOpen && (
        <ImportarContagemModal
          cicloId={ciclo.id}
          mesRotulo={`${local.nome} · ${rotuloMes(ciclo.mes)}`}
          onClose={() => setImportOpen(false)}
        />
      )}

      {/* Overlay de impressão — portal como filho direto do <body> para o CSS de
          print poder esconder todo o resto do app pelo seletor de irmãos. */}
      {printOpen && createPortal(
        <div
          data-estoque-print
          className="fixed inset-0 z-[200] flex flex-col bg-zinc-200/95 backdrop-blur-sm"
        >
          <div className="no-print flex items-center justify-between gap-3 border-b border-zinc-300 bg-white px-4 py-3">
            <div className="text-sm font-semibold text-zinc-800">
              Contagem de estoque · {local.nome}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 transition-colors"
              >
                <Printer size={13} />
                Imprimir / Salvar PDF
              </button>
              <button
                onClick={() => setPrintOpen(false)}
                className="rounded-md p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition-colors"
                aria-label="Fechar"
              >
                <X size={16} />
              </button>
            </div>
          </div>
          <div className="print-scroll flex-1 overflow-auto p-4 sm:p-8">
            <EstoquePrintDoc
              localNome={local.nome}
              mesIso={ciclo.mes}
              status="aberto"
              itens={itensLocal}
              dataEmissao={new Date().toLocaleDateString("pt-BR")}
              unidadesFiscais={unidadesFiscais}
              ehPrimeiroCiclo={ehPrimeiroCiclo}
            />
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

type EstadoSalvar = "idle" | "salvando" | "salvo" | "erro";

/**
 * Colunas do desktop, na ordem e na proporção do PDF (`estoque-print-doc`).
 * Compartilhado entre o cabeçalho e cada linha — se as duas listas divergirem,
 * a tabela desalinha, então precisa ser uma constante só.
 */
const GRID_CONTAGEM =
  "lg:grid-cols-[minmax(0,1fr)_3rem_6rem_5rem_5rem_5rem_8rem_6.5rem_5rem_9rem]";

/**
 * Rótulo do campo `contagem_anterior`.
 *
 * ⚠️ No primeiro ciclo de um local, "Contagem anterior" é mentira: não existe
 * mês anterior, e aquele número é o saldo de abertura que a própria pessoa
 * lançou hoje. Foi exatamente essa confusão que gerou o pedido de "remover
 * esses valores" — os valores estavam certos (são a base do teórico), o nome
 * estava errado.
 */
function rotuloAnterior(ehPrimeiroCiclo: boolean): string {
  return ehPrimeiroCiclo ? "Saldo de abertura" : "Contagem anterior";
}

/**
 * Célula do saldo de abertura, clicável para corrigir.
 *
 * Só é editável no primeiro ciclo do local. Havendo ciclo anterior, este número
 * é a contagem de fechamento de lá — corrigir aqui criaria duas verdades para o
 * mesmo saldo, e a action recusa (ver `editarSaldoAbertura`).
 */
function CelulaAbertura({
  item,
  editavel,
  onSalvo,
}: {
  item: CicloItemView;
  editavel: boolean;
  onSalvo: (id: string, patch: Partial<CicloItemView>) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [draft, setDraft] = useState("");
  const [salvando, setSalvando] = useState(false);

  const valor = item.contagemAnterior;

  async function salvar() {
    const q = parseFloat(draft.replace(",", "."));
    if (!Number.isFinite(q) || q < 0) {
      toast.error("Valor inválido");
      return;
    }
    if (q === valor) {
      setEditando(false);
      return;
    }
    setSalvando(true);
    try {
      const res = await editarSaldoAbertura({ cicloItemId: item.id, quantidade: q });
      if ("erro" in res) {
        toast.error(res.erro);
        return;
      }
      // Atualiza o estado local para teórico e divergência recalcularem na hora
      // — os dois derivam deste valor e são calculados na leitura.
      onSalvo(item.id, { contagemAnterior: q });
      setEditando(false);
      toast.success("Saldo de abertura corrigido");
    } finally {
      setSalvando(false);
    }
  }

  if (!editavel) {
    return <>{valor ?? "—"}</>;
  }

  if (editando) {
    return (
      <span className="inline-flex items-center gap-1">
        <input
          autoFocus
          inputMode="decimal"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => void salvar()}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); void salvar(); }
            if (e.key === "Escape") setEditando(false);
          }}
          className="w-16 h-6 rounded border border-emerald-500/50 bg-background px-1.5 text-xs font-mono text-right text-foreground focus:outline-none"
        />
        {salvando && <Loader2 size={11} className="animate-spin text-muted-foreground shrink-0" />}
      </span>
    );
  }

  return (
    <button
      onClick={() => { setDraft(valor != null ? String(valor) : ""); setEditando(true); }}
      title="Corrigir o saldo de abertura"
      className="rounded px-1 -mx-1 hover:bg-emerald-500/10 hover:text-emerald-400 transition-colors"
    >
      {valor ?? "—"}
    </button>
  );
}

/** Cabeçalho da tabela — só no desktop; no celular cada valor traz seu rótulo. */
function CabecalhoContagem({ ehPrimeiroCiclo }: { ehPrimeiroCiclo: boolean }) {
  const TH = "text-[10px] uppercase tracking-wider text-muted-foreground/70 font-medium";
  return (
    <div
      className={cn(
        "hidden lg:grid lg:items-end lg:gap-2 lg:px-3 lg:pb-2 lg:border-b lg:border-border",
        GRID_CONTAGEM,
      )}
    >
      <span className={TH}>Item</span>
      <span className={cn(TH, "text-center")}>Un</span>
      <span className={cn(TH, "text-right")}>{rotuloAnterior(ehPrimeiroCiclo)}</span>
      <span className={cn(TH, "text-right")}>Entradas</span>
      <span className={cn(TH, "text-right")}>Vendas período</span>
      <span className={cn(TH, "text-right")}>Teórico</span>
      <span className={cn(TH, "text-right")}>Estoque atual</span>
      <span className={cn(TH, "text-right")}>Divergência</span>
      <span className={cn(TH, "text-right")}>A repor</span>
      <span className={TH}>Contado por</span>
    </div>
  );
}

interface ItemCardProps {
  item:                        CicloItemView;
  faltaSaldoAbertura:          boolean;
  /** Primeiro ciclo do local — muda o rótulo de `contagem_anterior`. */
  ehPrimeiroCiclo:             boolean;
  temMultiplasUnidadesFiscais: boolean;
  onSalvo:                     (id: string, patch: Partial<CicloItemView>) => void;
}

/**
 * Card de item, definido no nível do módulo (não aninhado nos componentes
 * acima) para não recriar a função a cada render do pai.
 *
 * O rascunho (`valor`) nasce do `item` no momento da montagem e depois só é
 * tocado pelas próprias ações do usuário (digitar, salvar) — não precisa de
 * useEffect para "seguir" o prop porque o pai (`CicloAbertoView`) já foi
 * remontado do zero sempre que o ciclo muda.
 *
 * Enquanto faltar saldo de abertura (`faltaSaldoAbertura`), o campo grava
 * `contagem_anterior` via `registrarInventarioInicial` em vez de
 * `contagem_atual` via `registrarContagem` — ver bloco 6. O flag some por
 * conta própria assim que o último item do ciclo tiver `contagem_anterior`
 * preenchido, então o mesmo card volta a gravar `contagem_atual` sem
 * precisar de nenhuma ação explícita de "encerrar abertura".
 */
function ItemCard({ item, faltaSaldoAbertura, ehPrimeiroCiclo, temMultiplasUnidadesFiscais, onSalvo }: ItemCardProps) {
  const valorSalvo = faltaSaldoAbertura ? item.contagemAnterior : item.contagemAtual;
  const [valor, setValor] = useState(valorSalvo != null ? String(valorSalvo) : "");
  const [estado, setEstado] = useState<EstadoSalvar>("idle");
  const [erroMsg, setErroMsg] = useState<string | null>(null);

  async function salvar(raw: string) {
    const quantidade = parseFloat(raw.replace(",", "."));
    if (!Number.isFinite(quantidade) || quantidade < 0) {
      setEstado("erro");
      setErroMsg("Valor inválido");
      return;
    }
    setEstado("salvando");
    setErroMsg(null);
    const res = faltaSaldoAbertura
      ? await registrarInventarioInicial({ cicloItemId: item.id, quantidade })
      : await registrarContagem({ cicloItemId: item.id, quantidade });
    if ("erro" in res) {
      setEstado("erro");
      setErroMsg(res.erro);
      return;
    }
    setEstado("salvo");
    onSalvo(
      item.id,
      faltaSaldoAbertura
        ? { contagemAnterior: quantidade, contadoPorNome: "você", contadoEm: new Date().toISOString() }
        : { contagemAtual: quantidade, contadoPorNome: "você", contadoEm: new Date().toISOString() },
    );
    setTimeout(() => setEstado((atual) => (atual === "salvo" ? "idle" : atual)), 1500);
  }

  function handleBlur() {
    const raw = valor.trim();
    if (raw === "") {
      // Campo limpo sem querer: não apaga uma contagem já salva.
      setValor(valorSalvo != null ? String(valorSalvo) : "");
      return;
    }
    void salvar(raw);
  }

  const aRepor = calcularARepor(item.estoqueIdeal, item.contagemAtual);
  const teorico = calcularTeorico({
    contagem_anterior: item.contagemAnterior,
    entradas: item.entradas,
    saidas: item.saidas,
  });
  const divergencia = calcularDivergencia(item.contagemAtual, teorico);
  const horaContado = item.contadoEm
    ? new Date(item.contadoEm).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-4 space-y-3",
        // No desktop o card se desfaz em linha de tabela, com as MESMAS colunas
        // e na MESMA ordem do PDF. Uma DOM só, responsiva: renderizar tabela e
        // cards em paralelo duplicaria os inputs (300 deles com 150 itens).
        "lg:rounded-none lg:border-0 lg:border-b lg:border-border/40 lg:p-0 lg:space-y-0",
        "lg:grid lg:items-center lg:gap-2 lg:px-3 lg:py-2 lg:hover:bg-muted/30 lg:transition-colors",
        GRID_CONTAGEM,
      )}
    >
      {/* Item + unidade */}
      <div className="flex items-start justify-between gap-2 lg:contents">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground lg:truncate">{item.produtoNome}</p>
          <p className="text-xs text-muted-foreground lg:hidden">{item.produtoUnidadeMed}</p>
          {temMultiplasUnidadesFiscais && item.entradasDetalhe.length > 0 && (
            <p className="hidden lg:block text-[10px] text-muted-foreground/60 truncate">
              {item.entradasDetalhe.map((d) => `${d.unidadeNome} ${d.quantidade}`).join(" · ")}
            </p>
          )}
        </div>
        <span className="hidden lg:block text-xs text-muted-foreground text-center">
          {item.produtoUnidadeMed}
        </span>
      </div>

      {/*
        `lg:contents` dissolve este agrupamento no desktop: os filhos passam a
        ser células diretas do grid. No celular ele continua sendo uma linha
        corrida de metadados, que é como se lê andando pelo estoque.
      */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground lg:contents">
        <span className="lg:text-right lg:tabular-nums">
          <span className="lg:hidden">{rotuloAnterior(ehPrimeiroCiclo)}: </span>
          {/*
            Editável só quando é abertura de verdade E o campo principal já não
            é ele: enquanto `faltaSaldoAbertura`, o input grande da linha JÁ
            grava `contagem_anterior`, e dois caminhos para o mesmo campo na
            mesma linha seria confusão.
          */}
          <CelulaAbertura
            item={item}
            editavel={ehPrimeiroCiclo && !faltaSaldoAbertura}
            onSalvo={onSalvo}
          />
        </span>
        {/* Ideal fica só no celular: o PDF não tem essa coluna, e "A repor" já
            carrega a parte acionável dela. */}
        <span className="lg:hidden">Ideal: {item.estoqueIdeal}</span>
        <span className="lg:text-right lg:tabular-nums">
          <span className="lg:hidden">Entradas: </span>
          {item.entradas ?? "—"}
        </span>
        <span className="lg:text-right lg:tabular-nums">
          <span className="lg:hidden">Vendas: </span>
          {item.saidas ?? "—"}
        </span>
        <span className="lg:text-right lg:tabular-nums">
          <span className="lg:hidden">Teórico: </span>
          {teorico ?? "—"}
        </span>
      </div>

      {temMultiplasUnidadesFiscais && item.entradasDetalhe.length > 0 && (
        <p className="text-[11px] text-muted-foreground/70 -mt-2 lg:hidden">
          {item.entradasDetalhe.map((d) => `${d.unidadeNome} ${d.quantidade}`).join(" · ")}
        </p>
      )}

      {faltaSaldoAbertura && (
        <p className="text-xs font-medium text-muted-foreground lg:hidden">Saldo de abertura</p>
      )}

      {/* Estoque atual — a única célula editável */}
      <div className="relative">
        <input
          type="text"
          inputMode="decimal"
          value={valor}
          placeholder="0"
          onChange={(e) => setValor(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              e.currentTarget.blur();
            }
          }}
          className="w-full h-14 lg:h-9 rounded-lg border border-border bg-background px-4 lg:px-2 lg:pr-6 text-lg lg:text-sm font-mono text-foreground text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
        />
        {/* Status dentro da célula do input: é o campo que ele reporta, e no
            desktop não há cabeçalho de card onde pousar. */}
        <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
          {estado === "salvando" && <Loader2 size={14} className="text-muted-foreground animate-spin" />}
          {estado === "salvo" && <Check size={14} className="text-emerald-500" />}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground lg:contents">
        {divergencia == null ? (
          <span className="lg:text-right">
            <span className="lg:hidden">Divergência: </span>—
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-medium lg:justify-end lg:tabular-nums">
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full shrink-0",
                divergencia < 0 ? "bg-destructive" : divergencia > 0 ? "bg-amber-500" : "bg-emerald-500",
              )}
            />
            <span
              className={
                divergencia < 0
                  ? "text-destructive"
                  : divergencia > 0
                    ? "text-amber-500"
                    : "text-emerald-500"
              }
            >
              <span className="lg:hidden">Divergência: </span>
              {divergencia > 0 ? `+${divergencia}` : divergencia}
            </span>
          </span>
        )}
        <span className="lg:text-right lg:tabular-nums">
          <span className="lg:hidden">A repor: </span>
          {aRepor ?? "—"}
        </span>
        <span className="hidden lg:block truncate text-muted-foreground/70">
          {item.contadoPorNome ?? "—"}
          {horaContado ? ` · ${horaContado}` : ""}
        </span>
      </div>

      {estado === "erro" && erroMsg && (
        <p className="text-xs text-destructive flex items-center gap-1 lg:col-span-full">
          <AlertCircle size={12} /> {erroMsg}
        </p>
      )}

      {/* No desktop esta informação já é a última coluna da linha. */}
      {valorSalvo != null && item.contadoPorNome && (
        <p className="text-[11px] text-muted-foreground/60 lg:hidden">
          contado por {item.contadoPorNome}
          {horaContado ? ` · ${horaContado}` : ""}
        </p>
      )}
    </div>
  );
}
