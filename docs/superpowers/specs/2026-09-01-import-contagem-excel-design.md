# Importação da contagem por Excel — design

**Data:** 2026-09-01
**Escopo aprovado:** só a contagem. `entradas` e `saidas` continuam vindo exclusivamente do Omie e do Automo — nenhum caminho manual que possa divergir da origem.

---

## Problema

A contagem é digitada item a item na tela, um item por vez (decisão do bloco 2: um sinal ruim no corredor não pode custar a contagem inteira). Isso funciona para a contagem de fechamento, feita andando pelo estoque com o celular.

Não funciona para a **abertura**. O Lush Ipiranga tem 1.439 produtos elegíveis; se a lista curada tiver algumas centenas de itens, lançar o saldo de abertura um por um no celular é inviável. A equipe já trabalha em planilha, e a exportação `.xlsx` já existe e já circula.

## Solução

Ida e volta do mesmo arquivo: baixa o Excel exportado, preenche a coluna `ESTOQUE ATUAL`, sobe de volta. Sem formato novo, e a planilha continua servindo de guia de contagem impresso.

O valor lido vai para o campo que o ciclo está coletando — `contagem_anterior` no modo saldo de abertura, `contagem_atual` na contagem de fechamento. É a mesma regra que a tela já usa (`faltaSaldoAbertura`), recalculada no servidor tanto na exportação quanto no import, e a prévia diz explicitamente qual dos dois está sendo preenchido.

### A planilha de abertura é mais curta

**Decidido na implementação.** No modo saldo de abertura o campo preenchido é `contagem_anterior`, e `ESTOQUE ATUAL` fica vazia sem uso — duas colunas vazias, sendo que a de nome mais convidativo é a errada ("estoque atual" descreve exatamente o que a pessoa está medindo no dia 01/09).

Aceitar as duas criaria ambiguidade sobre qual campo gravar; ignorar a errada em silêncio seria pior (a pessoa preenche, o import diz "0 itens" e não há pista do motivo). Então o arquivo de abertura **não tem** as colunas que ainda não se aplicam — `TEÓRICO`, `ESTOQUE ATUAL`, `DIVERGÊNCIA`, `A REPOR`, todas "—" nesse estágio — e a coluna a preencher chama `SALDO DE ABERTURA`. Sobra uma única coluna de número.

A escolha da coluna no parser é pelo **modo**, nunca pela primeira que aparece: depender da ordem faria o import gravar no campo errado se o layout da exportação mudasse.

---

## Regras de borda

Cada linha desta tabela é um jeito silencioso de estragar o mês. São o motivo de o parser ser um módulo puro e testado, separado da action.

| Célula no arquivo | Interpretação | Por quê |
|---|---|---|
| vazia | **ignora a linha** | Vazio é "não contei". Converter em 0 faria uma planilha preenchida pela metade declarar o estoque zerado e gerar divergência negativa gigante em item que ninguém tocou. O rodapé da exportação já documenta a convenção. |
| `—` | **ignora a linha** | Mesmo caso: é o que a própria exportação escreve para dado ausente. |
| `0` | grava zero | Medição legítima com resultado zero. Distinguir isto de vazio é a razão de `entradas`/`saidas`/`contagem_*` serem nullable e nunca `DEFAULT 0`. |
| `12,5` (texto) | grava 12,5 | Excel em português deixa decimal como texto com vírgula. Mesma normalização de `matriz-celula.tsx`: remove ponto de milhar, troca vírgula por ponto. |
| negativa | **rejeita a linha**, com motivo | Estoque físico negativo não existe. `registrarContagem` já valida `min(0)`. |
| texto não numérico | **rejeita a linha**, com motivo | Ex.: "ver com o Paulo". Rejeita só aquela linha; as boas seguem. |

Rejeitada ≠ ignorada: rejeitada aparece na prévia com o motivo, ignorada é simplesmente linha em branco.

## Casamento das linhas

Três níveis, na ordem:

1. **`ciclo_item_id`** — coluna nova na exportação, oculta (`ws.getColumn(n).hidden = true`). Casamento exato.
2. **`CÓDIGO`** — para planilha montada à mão ou colada em arquivo novo, onde a coluna oculta não sobreviveu.
3. **Nome normalizado, em igualdade exata** — último recurso.

⚠️ **Nenhuma similaridade fuzzy aqui.** `sugerirCandidatos` usa Jaccard e é o certo para *sugerir* mapeamento com um humano confirmando; num import em lote a mesma técnica casaria errado sem ninguém ver. Foi fuzzy a 20% que fez `OLLA GEL` casar com `BOOSTER 20ML` na auditoria de correlação.

### Detecção de arquivo do mês errado

Um `ciclo_item_id` que não pertence ao ciclo destino é **erro do arquivo inteiro**, não da linha: significa que subiram a planilha de outro mês. Sem isso, o arquivo de setembro importa liso e errado no ciclo de outubro.

O fallback por código não tem essa proteção — daí a coluna oculta existir, mesmo custando uma coluna na exportação.

## Fluxo

```
Upload → parse (não escreve nada) → prévia → confirma → grava
```

A prévia lista, por item: valor atual, valor do arquivo, e o efeito — `novo`, `substitui 8 → 12`, `igual` (sem mudança), `ignorado (motivo)`. Confirmar aplica só as linhas que mudam.

Sobrescrever a contagem de um mês inteiro sem ver o diff é risco que não precisa existir. Ao gravar, `contado_por` recebe quem importou e `contado_em` o momento — quem sobe o arquivo está assumindo os números.

Linhas do arquivo que não são itens controlados do ciclo entram na prévia como ignoradas com contagem própria. Não são inseridas: trazer item para o ciclo é papel de `sincronizarItensDoCiclo`, que já existe e tem botão.

Ciclo fechado rejeita o import, igual aos dois importadores que já existem.

## Estrutura

| Arquivo | Responsabilidade |
|---|---|
| `lib/estoque/import-contagem.ts` | Puro: `normalizarValorCelula`, `localizarColunas`, `montarPrevia`. Sem exceljs, sem Supabase, sem React. **30 testes.** |
| `lib/estoque/planilha-contagem.ts` | Ponte com o exceljs: coerção de célula e busca do cabeçalho. Separado porque é a parte que só um `.xlsx` de verdade exercita. **9 testes com workbook real.** |
| `app/api/estoque/ciclo/[cicloId]/xlsx/route.ts` | Coluna oculta com `ciclo_item_id`; colunas declarativas; dois layouts (abertura/fechamento). |
| `app/(app)/estoque/contagem/actions.ts` | `analisarPlanilhaContagem(FormData)` (lê e monta prévia, não grava) e `aplicarContagemImportada` (grava em lotes de 200 por upsert). |
| `contagem/_components/importar-contagem-modal.tsx` | Seleção do arquivo e tabela de prévia. |
| `contagem/_components/contagem-client.tsx` | Botão "Importar Excel" ao lado do "Excel". |

O parse fica em Server Action com `FormData` em vez de Route Handler: `exceljs` já roda server-side na exportação (fora do bundle, ~1 MB), e reaproveitar a mesma biblioteca garante que leitura e escrita concordem sobre o formato. O import dele é dinâmico (`await import`) porque o mesmo arquivo exporta `registrarContagem`, chamada a cada item salvo no celular.

Os cabeçalhos são **constantes compartilhadas** entre quem escreve e quem lê (`CABECALHO_VALOR_ABERTURA`, `CABECALHO_VALOR_FECHAMENTO`, `CABECALHO_ID_INTERNO`). É o que impede a exportação e o import de divergirem sem ninguém notar — divergência de texto passa a ser erro de compilação.

**Limite de corpo de Server Action: medido, não presumido.** Uma planilha de 1.500 linhas × 14 colunas com formato numérico dá **86 KB** — 12× abaixo do teto de 1 MB do padrão do Next. Nenhuma configuração alterada.

### Achados da implementação

Dois bugs que só o teste com workbook real revelou:

1. **O rodapé da exportação entrava como item.** `DIVERGÊNCIA NEGATIVA ACUMULADA` cai na coluna `ITEM` e, por estar em célula **mesclada** (`A8:D8`), o exceljs repete o texto em B, C e D — então "tem nome" e "tem código" ambos passavam. Toda prévia teria 2 linhas ignoradas fantasmas e o contador de ignorados nunca zeraria. Resolvido exigindo UUID na coluna de id quando ela existe (todo arquivo da nossa exportação tem).
2. **A mensagem de erro mais útil era descartada.** A varredura do cabeçalho sobrescrevia o erro a cada linha, e as linhas de dados/vazias (que também falham, com texto genérico) apagavam o diagnóstico bom vindo do cabeçalho real. Resolvido com `reconhecidas` no erro: vence a linha que reconheceu mais cabeçalhos.

## Fora de escopo

- Preencher `entradas`/`saidas` pela planilha (decidido: só a contagem).
- Criar itens controlados a partir do arquivo.
- Import de ciclo fechado.
