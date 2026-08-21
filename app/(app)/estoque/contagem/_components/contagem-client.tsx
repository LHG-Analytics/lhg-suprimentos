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
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Check, AlertCircle, Boxes, Download, Info } from "lucide-react";
import { toast } from "sonner";
import { calcularARepor, calcularTeorico, calcularDivergencia, rotuloMes } from "@/lib/estoque/ciclo";
import {
  abrirCiclo,
  registrarContagem,
  registrarInventarioInicial,
  fecharCiclo,
  importarSaidasDoAutomo,
  importarEntradasDoOmie,
} from "../actions";
import type { CicloView, CicloItemView } from "./tipos";

interface Props {
  local:                        { id: string; nome: string };
  temItensControlados:         boolean;
  ciclo:                       CicloView | null;
  itens:                       CicloItemView[];
  /** True só no primeiro ciclo de um local — modo "saldo de abertura" (ver bloco 6). */
  ehPrimeiroCiclo:             boolean;
  /** True quando o local tem mais de uma unidade fiscal (CNPJ) — controla se o rateio por CNPJ aparece nos cards. */
  temMultiplasUnidadesFiscais: boolean;
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
  ehPrimeiroCiclo,
  temMultiplasUnidadesFiscais,
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
      ehPrimeiroCiclo={ehPrimeiroCiclo}
      temMultiplasUnidadesFiscais={temMultiplasUnidadesFiscais}
    />
  );
}

interface CicloAbertoViewProps {
  local:                       { id: string; nome: string };
  ciclo:                       CicloView;
  itensIniciais:               CicloItemView[];
  ehPrimeiroCiclo:             boolean;
  temMultiplasUnidadesFiscais: boolean;
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
  ehPrimeiroCiclo,
  temMultiplasUnidadesFiscais,
}: CicloAbertoViewProps) {
  const router = useRouter();
  const [itensLocal, setItensLocal] = useState(itensIniciais);
  const [fechando, setFechando] = useState(false);
  const [importando, setImportando] = useState(false);
  const [importandoEntradas, setImportandoEntradas] = useState(false);

  function handleItemSalvo(id: string, patch: Partial<CicloItemView>) {
    setItensLocal((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }

  const total = itensLocal.length;
  // No modo "primeiro ciclo" o que se registra é o saldo de abertura
  // (contagem_anterior) — a contagem de fechamento (contagem_atual) só entra
  // em cena no fim do período, quando este modo já não se aplica.
  const contados = itensLocal.filter((it) =>
    ehPrimeiroCiclo ? it.contagemAnterior != null : it.contagemAtual != null,
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
        {ehPrimeiroCiclo && (
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
        {itensLocal.map((item) => (
          <ItemCard
            key={item.id}
            item={item}
            ehPrimeiroCiclo={ehPrimeiroCiclo}
            temMultiplasUnidadesFiscais={temMultiplasUnidadesFiscais}
            onSalvo={handleItemSalvo}
          />
        ))}
      </main>

      <footer className="sticky bottom-0 z-20 bg-background/95 backdrop-blur border-t border-border px-4 py-3 space-y-2">
        {ehPrimeiroCiclo ? (
          <p className="text-xs text-center text-muted-foreground py-2.5">
            A contagem de fechamento deste ciclo fica disponível no fim do período.
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
    </div>
  );
}

type EstadoSalvar = "idle" | "salvando" | "salvo" | "erro";

interface ItemCardProps {
  item:                        CicloItemView;
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
 * No primeiro ciclo de um local (`ehPrimeiroCiclo`), o campo grava
 * `contagem_anterior` (saldo de abertura) via `registrarInventarioInicial`
 * em vez de `contagem_atual` via `registrarContagem` — ver bloco 6.
 */
function ItemCard({ item, ehPrimeiroCiclo, temMultiplasUnidadesFiscais, onSalvo }: ItemCardProps) {
  const valorSalvo = ehPrimeiroCiclo ? item.contagemAnterior : item.contagemAtual;
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
    const res = ehPrimeiroCiclo
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
      ehPrimeiroCiclo
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
    <div className="rounded-xl border border-border bg-card p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-foreground">{item.produtoNome}</p>
          <p className="text-xs text-muted-foreground">{item.produtoUnidadeMed}</p>
        </div>
        <div className="shrink-0 h-4 flex items-center">
          {estado === "salvando" && <Loader2 size={16} className="text-muted-foreground animate-spin" />}
          {estado === "salvo" && <Check size={16} className="text-emerald-500" />}
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Anterior: {item.contagemAnterior != null ? item.contagemAnterior : "—"}</span>
        <span>Ideal: {item.estoqueIdeal}</span>
        <span>Entradas: {item.entradas != null ? item.entradas : "—"}</span>
        <span>Vendas: {item.saidas != null ? item.saidas : "—"}</span>
      </div>

      {temMultiplasUnidadesFiscais && item.entradasDetalhe.length > 0 && (
        <p className="text-[11px] text-muted-foreground/70 -mt-2">
          {item.entradasDetalhe.map((d) => `${d.unidadeNome} ${d.quantidade}`).join(" · ")}
        </p>
      )}

      {ehPrimeiroCiclo && (
        <p className="text-xs font-medium text-muted-foreground">Saldo de abertura</p>
      )}

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
        className="w-full h-14 rounded-lg border border-border bg-background px-4 text-lg font-mono text-foreground text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
      />

      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span>Teórico: {teorico != null ? teorico : "—"}</span>
        {divergencia == null ? (
          <span>Divergência: —</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 font-medium">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                divergencia < 0
                  ? "bg-destructive"
                  : divergencia > 0
                    ? "bg-amber-500"
                    : "bg-emerald-500"
              }`}
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
              Divergência: {divergencia > 0 ? `+${divergencia}` : divergencia}
            </span>
          </span>
        )}
      </div>

      {aRepor != null && (
        <p className="text-xs text-muted-foreground">
          A repor: <span className="font-medium text-foreground">{aRepor}</span>
        </p>
      )}

      {estado === "erro" && erroMsg && (
        <p className="text-xs text-destructive flex items-center gap-1">
          <AlertCircle size={12} /> {erroMsg}
        </p>
      )}

      {valorSalvo != null && item.contadoPorNome && (
        <p className="text-[11px] text-muted-foreground/60">
          contado por {item.contadoPorNome}
          {horaContado ? ` · ${horaContado}` : ""}
        </p>
      )}
    </div>
  );
}
