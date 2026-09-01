import { describe, it, expect } from "vitest";
import { normalizarProdutoAutomo } from "@/lib/automo/client";

/**
 * Regressão de um bug que derrubou a tela em produção.
 *
 * `produto.codigo` é `integer` nos quatro bancos do Automo e o driver `pg` o
 * devolve como NUMBER. A interface declarava `string | null`, e a busca no
 * catálogo fazia `(p.codigo ?? "").toLowerCase()`: `??` protege de null, não de
 * tipo, então cada tecla digitada estourava
 * `p.codigo.toLowerCase is not a function`.
 *
 * O TypeScript não pegou porque o tipo vinha de um genérico escrito à mão em
 * `client.query<{...}>()` — afirmação, não validação. Estes testes são a
 * validação que faltava.
 */
describe("normalizarProdutoAutomo", () => {
  it("converte o código numérico do banco em string", () => {
    const p = normalizarProdutoAutomo({
      id: 1780, codigo: 6694, descricao: "COCA COLA", tipo: "01 - SOFT DRINK",
    });
    expect(p.codigo).toBe("6694");
    // O que quebrava: operação de string em cima do valor.
    expect(() => p.codigo?.toLowerCase()).not.toThrow();
  });

  it("preserva código que já vem como string", () => {
    const p = normalizarProdutoAutomo({ id: 1, codigo: "ABC-12", descricao: "X", tipo: null });
    expect(p.codigo).toBe("ABC-12");
  });

  it("mantém código ausente como null, sem virar a string 'null'", () => {
    const p = normalizarProdutoAutomo({ id: 1, codigo: null, descricao: "X", tipo: null });
    expect(p.codigo).toBeNull();
  });

  // Código 0 é um valor, não ausência: `codigo || null` transformaria em null.
  it("trata código zero como código, não como ausência", () => {
    const p = normalizarProdutoAutomo({ id: 1, codigo: 0, descricao: "X", tipo: null });
    expect(p.codigo).toBe("0");
  });

  it("converte id que venha como string", () => {
    const p = normalizarProdutoAutomo({ id: "42", codigo: 1, descricao: "X", tipo: null });
    expect(p.id).toBe(42);
    expect(typeof p.id).toBe("number");
  });

  // Descrição nula quebraria `.toLowerCase()` na busca do mesmo jeito que o
  // código. Não há nenhuma hoje, mas o tipo não pode voltar a mentir.
  it("descrição ausente vira string vazia, não null", () => {
    const p = normalizarProdutoAutomo({ id: 1, codigo: 1, descricao: null, tipo: null });
    expect(p.descricao).toBe("");
    expect(() => p.descricao.toLowerCase()).not.toThrow();
  });
});
