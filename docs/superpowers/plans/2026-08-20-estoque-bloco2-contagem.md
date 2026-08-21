# Estoque — Bloco 2 (Ciclos e contagem) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development

**Goal:** A equipe conta o estoque no celular, dentro do estoque, e o LHG substitui a planilha de contagem — sem depender de nenhuma integração.

**Architecture:** Ciclo = mês, um aberto por local. Abrir o ciclo materializa uma linha por item controlado, puxando `contagem_anterior` do ciclo anterior. A contagem salva item a item. `teorico`, `divergencia` e `a_repor` são funções puras que devolvem `null` quando falta insumo, e a tela mostra `—` em vez de número inventado.

**Decisões que vêm do spec:** D6b (mobile, salva item a item, `contado_por`/`contado_em`), D6c (`entradas`/`saidas` NULL até importar), D4 (teórico ≠ ideal).

**Spec:** `docs/superpowers/specs/2026-08-20-modulo-estoque-design.md`

---

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `supabase/migrations/0027_estoque_ciclos.sql` | `estoque_ciclos`, `estoque_ciclo_itens`, RLS |
| `lib/estoque/ciclo.ts` | Cálculos puros: teórico, divergência, a repor, rótulo do mês |
| `tests/lib/estoque-ciclo.test.ts` | Testes dos cálculos, com foco nos casos NULL |
| `app/(app)/estoque/contagem/page.tsx` | Server Component do ciclo aberto |
| `app/(app)/estoque/contagem/actions.ts` | `abrirCiclo`, `registrarContagem`, `fecharCiclo` |
| `app/(app)/estoque/contagem/_components/contagem-client.tsx` | Tela mobile-first |

---

## Task 1: Migration dos ciclos

**Files:** Create `supabase/migrations/0027_estoque_ciclos.sql`

- [ ] **Step 1: Escrever a migration**

```sql
-- 0027_estoque_ciclos.sql
--
-- Ciclos de contagem de estoque. Um ciclo = um mês por local; a equipe conta no
-- celular, dentro do estoque, e o resultado alimenta a divergência.
--
-- Ver spec: D6b (mobile, item a item, quem contou) e D6c (movimento NULL).

CREATE TABLE IF NOT EXISTS estoque_ciclos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id    uuid NOT NULL REFERENCES locais_estoque(id) ON DELETE CASCADE,
  -- Sempre o dia 1 do mês de referência (contagem é mensal)
  mes         date NOT NULL,
  status      text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'fechado')),
  aberto_em   timestamptz NOT NULL DEFAULT now(),
  aberto_por  uuid REFERENCES user_profiles(id),
  fechado_em  timestamptz,
  fechado_por uuid REFERENCES user_profiles(id),
  UNIQUE (local_id, mes)
);

-- Um único ciclo aberto por local: contagem mensal não se sobrepõe, e dois
-- ciclos abertos deixariam ambíguo em qual a equipe está contando.
CREATE UNIQUE INDEX IF NOT EXISTS estoque_ciclos_um_aberto_idx
  ON estoque_ciclos (local_id) WHERE status = 'aberto';

CREATE TABLE IF NOT EXISTS estoque_ciclo_itens (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ciclo_id          uuid NOT NULL REFERENCES estoque_ciclos(id) ON DELETE CASCADE,
  estoque_item_id   uuid NOT NULL REFERENCES estoque_itens(id) ON DELETE CASCADE,
  -- Do contagem_atual do ciclo anterior deste mesmo item
  contagem_anterior numeric(12,3),
  -- NULL = ainda não importado (D6c). NUNCA default 0: com zero o teórico viraria
  -- contagem_anterior e a divergência acusaria furo inventado.
  entradas          numeric(12,3),
  saidas            numeric(12,3),
  contagem_atual    numeric(12,3),
  contado_por       uuid REFERENCES user_profiles(id),
  contado_em        timestamptz,
  UNIQUE (ciclo_id, estoque_item_id)
);

CREATE INDEX IF NOT EXISTS estoque_ciclo_itens_ciclo_idx ON estoque_ciclo_itens (ciclo_id);

ALTER TABLE estoque_ciclos      ENABLE ROW LEVEL SECURITY;
ALTER TABLE estoque_ciclo_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated read estoque_ciclos"  ON estoque_ciclos;
DROP POLICY IF EXISTS "authenticated write estoque_ciclos" ON estoque_ciclos;
CREATE POLICY "authenticated read estoque_ciclos" ON estoque_ciclos
  FOR SELECT USING (auth.uid() IS NOT NULL);
-- Contagem é trabalho de campo: solicitante também conta, não só comprador.
CREATE POLICY "authenticated write estoque_ciclos" ON estoque_ciclos
  FOR ALL USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated read estoque_ciclo_itens"  ON estoque_ciclo_itens;
DROP POLICY IF EXISTS "authenticated write estoque_ciclo_itens" ON estoque_ciclo_itens;
CREATE POLICY "authenticated read estoque_ciclo_itens" ON estoque_ciclo_itens
  FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "authenticated write estoque_ciclo_itens" ON estoque_ciclo_itens
  FOR ALL USING (auth.uid() IS NOT NULL);

COMMENT ON TABLE estoque_ciclos IS
  'Ciclo mensal de contagem por local. Índice parcial garante um único aberto por local.';
COMMENT ON COLUMN estoque_ciclo_itens.entradas IS
  'NULL = ainda não importado do Omie. Nunca 0 por default — ver D6c do spec.';
```

- [ ] **Step 2: Aplicar, verificar, regenerar tipos, commitar**

```powershell
. .\scripts\supabase-lhg.ps1
Apply-LhgMigration -Path "supabase/migrations/0027_estoque_ciclos.sql"
Invoke-LhgSql -Query "select table_name from information_schema.tables where table_name like 'estoque_ciclo%'" | ConvertTo-Json -Compress
$types = Get-LhgTypes; $types | Out-File lib/supabase/types.ts -Encoding utf8
pnpm typecheck
```

---

## Task 2: Cálculos do ciclo (funções puras, TDD)

**Files:** Create `lib/estoque/ciclo.ts` e `tests/lib/estoque-ciclo.test.ts`

O coração do bloco. `null` significa "não sei" e tem que propagar — é a regra D6c e o único jeito de não inventar divergência.

- [ ] **Step 1: Escrever os testes**

```typescript
import { describe, it, expect } from "vitest";
import { calcularTeorico, calcularDivergencia, calcularARepor, rotuloMes } from "@/lib/estoque/ciclo";

describe("calcularTeorico", () => {
  it("soma anterior + entradas - saidas", () => {
    expect(calcularTeorico({ contagem_anterior: 100, entradas: 60, saidas: 50 })).toBe(110);
  });

  it("é null se entradas ainda não foram importadas", () => {
    expect(calcularTeorico({ contagem_anterior: 100, entradas: null, saidas: 50 })).toBeNull();
  });

  it("é null se saidas ainda não foram importadas", () => {
    expect(calcularTeorico({ contagem_anterior: 100, entradas: 60, saidas: null })).toBeNull();
  });

  it("trata contagem anterior ausente como zero — primeiro ciclo do item", () => {
    expect(calcularTeorico({ contagem_anterior: null, entradas: 60, saidas: 50 })).toBe(10);
  });
});

describe("calcularDivergencia", () => {
  it("é o contado menos o teórico", () => {
    expect(calcularDivergencia(109, 110)).toBe(-1);
  });

  it("é null quando o teórico é desconhecido", () => {
    expect(calcularDivergencia(109, null)).toBeNull();
  });

  it("é null quando o item ainda não foi contado", () => {
    expect(calcularDivergencia(null, 110)).toBeNull();
  });

  it("zero quando bate exato", () => {
    expect(calcularDivergencia(110, 110)).toBe(0);
  });
});

describe("calcularARepor", () => {
  it("é o ideal menos o contado", () => {
    expect(calcularARepor(24, 10)).toBe(14);
  });

  it("nunca é negativo — sobra não é reposição", () => {
    expect(calcularARepor(24, 30)).toBe(0);
  });

  it("é null quando o item ainda não foi contado", () => {
    expect(calcularARepor(24, null)).toBeNull();
  });

  it("é zero quando não há ideal configurado", () => {
    expect(calcularARepor(0, 10)).toBe(0);
  });
});

describe("rotuloMes", () => {
  it("formata o mês de referência em português", () => {
    expect(rotuloMes("2026-08-01")).toBe("agosto de 2026");
  });

  it("não desloca o mês por fuso — dia 1 continua no mês certo", () => {
    expect(rotuloMes("2026-01-01")).toBe("janeiro de 2026");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar. Step 3: Implementar**

```typescript
/**
 * lib/estoque/ciclo.ts
 * Cálculos do ciclo de contagem. Puros, sem Supabase e sem React.
 *
 * A regra central: `null` significa "não sei ainda" e PROPAGA. Um teórico
 * calculado com entradas desconhecidas produziria uma divergência inventada, e
 * divergência errada é pior que divergência ausente — uma manda investigar o
 * nada, a outra só informa que falta dado (D6c do spec).
 */

export interface InsumosTeorico {
  contagem_anterior: number | null;
  entradas:          number | null;
  saidas:            number | null;
}

/**
 * Quanto deveria haver: anterior + entradas − saídas.
 *
 * `contagem_anterior` ausente conta como 0 — é o primeiro ciclo daquele item,
 * então "não havia nada antes" é a leitura correta. Já `entradas`/`saidas`
 * ausentes tornam o teórico desconhecido, porque não houve importação.
 */
export function calcularTeorico({ contagem_anterior, entradas, saidas }: InsumosTeorico): number | null {
  if (entradas == null || saidas == null) return null;
  return (contagem_anterior ?? 0) + entradas - saidas;
}

/** Contado − teórico. Negativo = falta física (perda, quebra, consumo não lançado). */
export function calcularDivergencia(
  contagemAtual: number | null,
  teorico: number | null,
): number | null {
  if (contagemAtual == null || teorico == null) return null;
  return contagemAtual - teorico;
}

/**
 * Quanto comprar para chegar ao ideal. Nunca negativo: estoque acima do ideal
 * não vira "reposição negativa", vira zero.
 */
export function calcularARepor(
  estoqueIdeal: number,
  contagemAtual: number | null,
): number | null {
  if (contagemAtual == null) return null;
  return Math.max(0, estoqueIdeal - contagemAtual);
}

/**
 * "agosto de 2026" a partir de "2026-08-01".
 *
 * Concatena T12:00:00 de propósito: `new Date("2026-08-01")` é interpretado como
 * UTC meia-noite e, em fuso negativo como o de São Paulo, volta para 31/07 —
 * o rótulo mostraria o mês errado.
 */
export function rotuloMes(mesIso: string): string {
  const d = new Date(`${mesIso.slice(0, 10)}T12:00:00`);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })
    .replace(" de ", " de ");
}
```

- [ ] **Step 4: Rodar (14 testes novos, 63 no total), commitar**

---

## Task 3: Server Actions do ciclo

**Files:** Create `app/(app)/estoque/contagem/actions.ts`

Três actions. A de abrir é a mais delicada: materializa as linhas e encadeia a contagem anterior.

- [ ] **Step 1: Implementar**

```typescript
"use server";

/**
 * actions.ts — contagem de estoque (bloco 2)
 */
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/** Primeiro dia do mês corrente, em ISO date. */
function mesCorrente(): string {
  const hoje = new Date();
  return `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Abre (ou reabre) o ciclo do mês corrente para o local e materializa uma linha
 * por item controlado ativo, puxando `contagem_anterior` do ciclo anterior.
 *
 * Idempotente: se o ciclo do mês já existe, devolve o existente em vez de criar
 * outro — o índice parcial já barraria um segundo aberto, mas a mensagem de erro
 * do banco não serve para a tela.
 */
export async function abrirCiclo(
  localId: string,
): Promise<{ ok: true; cicloId: string } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const mes = mesCorrente();

  const { data: existente } = await supabase
    .from("estoque_ciclos")
    .select("id")
    .eq("local_id", localId)
    .eq("mes", mes)
    .maybeSingle();
  if (existente) return { ok: true, cicloId: existente.id };

  // Fecha ciclo aberto de mês anterior: o índice parcial só permite um aberto.
  await supabase
    .from("estoque_ciclos")
    .update({ status: "fechado", fechado_em: new Date().toISOString(), fechado_por: user.id })
    .eq("local_id", localId)
    .eq("status", "aberto");

  const { data: ciclo, error: errCiclo } = await supabase
    .from("estoque_ciclos")
    .insert({ local_id: localId, mes, aberto_por: user.id })
    .select("id")
    .single();
  if (errCiclo || !ciclo) return { erro: errCiclo?.message ?? "Erro ao abrir ciclo" };

  const { data: itens } = await supabase
    .from("estoque_itens")
    .select("id")
    .eq("local_id", localId)
    .eq("ativo", true);

  if (!itens?.length) {
    return { erro: "Nenhum item controlado neste local. Cadastre os itens antes de abrir a contagem." };
  }

  // contagem_anterior: última contagem registrada de cada item, de qualquer
  // ciclo anterior deste local. Buscar por item evita depender de "o ciclo
  // imediatamente anterior existir".
  const { data: anteriores } = await supabase
    .from("estoque_ciclo_itens")
    .select("estoque_item_id, contagem_atual, estoque_ciclos!inner(local_id, mes)")
    .eq("estoque_ciclos.local_id", localId)
    .lt("estoque_ciclos.mes", mes)
    .not("contagem_atual", "is", null)
    .order("estoque_ciclos(mes)", { ascending: false });

  const ultimaContagem = new Map<string, number>();
  for (const a of anteriores ?? []) {
    const row = a as unknown as { estoque_item_id: string; contagem_atual: number };
    if (!ultimaContagem.has(row.estoque_item_id)) {
      ultimaContagem.set(row.estoque_item_id, row.contagem_atual);
    }
  }

  const { error: errItens } = await supabase.from("estoque_ciclo_itens").insert(
    itens.map(i => ({
      ciclo_id:          ciclo.id,
      estoque_item_id:   i.id,
      contagem_anterior: ultimaContagem.get(i.id) ?? null,
      // entradas/saidas ficam NULL: serão importadas nos blocos 3 e 4 (D6c)
    })),
  );
  if (errItens) return { erro: errItens.message };

  revalidatePath("/estoque/contagem");
  return { ok: true, cicloId: ciclo.id };
}

const ContagemSchema = z.object({
  cicloItemId: z.string().uuid(),
  quantidade:  z.number().min(0, "Quantidade não pode ser negativa"),
});

/**
 * Salva a contagem de UM item. Item a item de propósito: um "salvar tudo" no fim
 * perderia a contagem inteira se o sinal caísse no corredor do estoque (D6b).
 */
export async function registrarContagem(
  input: z.infer<typeof ContagemSchema>,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const parsed = ContagemSchema.safeParse(input);
  if (!parsed.success) return { erro: parsed.error.issues[0]?.message ?? "Dados inválidos" };

  const { error } = await supabase
    .from("estoque_ciclo_itens")
    .update({
      contagem_atual: parsed.data.quantidade,
      contado_por:    user.id,
      contado_em:     new Date().toISOString(),
    })
    .eq("id", parsed.data.cicloItemId);

  if (error) return { erro: error.message };
  revalidatePath("/estoque/contagem");
  return { ok: true };
}

export async function fecharCiclo(
  cicloId: string,
): Promise<{ ok: true } | { erro: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: "Não autenticado" };

  const { count: naoContados } = await supabase
    .from("estoque_ciclo_itens")
    .select("*", { count: "exact", head: true })
    .eq("ciclo_id", cicloId)
    .is("contagem_atual", null);

  if (naoContados && naoContados > 0) {
    return { erro: `Faltam ${naoContados} ${naoContados === 1 ? "item" : "itens"} sem contagem. Conte todos antes de fechar.` };
  }

  const { error } = await supabase
    .from("estoque_ciclos")
    .update({ status: "fechado", fechado_em: new Date().toISOString(), fechado_por: user.id })
    .eq("id", cicloId);

  if (error) return { erro: error.message };
  revalidatePath("/estoque/contagem");
  revalidatePath("/estoque");
  return { ok: true };
}
```

- [ ] **Step 2: Typecheck e commit**

---

## Task 4: Página e tela mobile-first

**Files:** Create `app/(app)/estoque/contagem/page.tsx` e `_components/contagem-client.tsx`

Requisitos de tela (D6b):
- **Lista vertical**, um card por item — não tabela
- Campo numérico grande, `inputMode="decimal"`, `text-lg`
- Salva ao sair do campo (blur) ou no Enter; indicador visual por item (salvando / salvo / erro)
- Mostra `contagem_anterior`, `a repor`, e `—` onde falta insumo
- Cabeçalho fixo com progresso: "12 de 15 contados"
- Botão "Fechar contagem" desabilitado enquanto faltar item
- Quem contou e quando, por item, em texto pequeno
- Se não há ciclo aberto: botão "Abrir contagem de {mês}"
- Se não há item controlado: manda para `/estoque` cadastrar

A página resolve o local pelo cookie de unidade, igual `/estoque`, e busca o ciclo aberto com seus itens e os dados do `estoque_itens` (nome do produto, unidade, estoque ideal).

---

## Task 5: Menu e verificação

- [ ] Entrada "Contagem" no menu, seção Operação, ícone `ClipboardCheck`, href `/estoque/contagem` + breadcrumb
- [ ] `pnpm typecheck`, `pnpm test` (63), `pnpm build` com as duas rotas
- [ ] `pnpm lint` sem problema novo
- [ ] Verificar no banco: abrir ciclo cria N linhas; contar item grava `contado_por`
