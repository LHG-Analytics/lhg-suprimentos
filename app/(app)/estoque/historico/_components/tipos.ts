/** Tipos compartilhados entre a página de histórico e a tabela cliente. */

export interface CicloFechadoView {
  id:                  string;
  mes:                 string; // ISO, dia 1 do mês — ver rotuloMes em lib/estoque/ciclo.ts
  totalItens:          number;
  itensComDivergencia: number;
  /** Soma das divergências negativas do ciclo (contado < teórico) — a perda do mês. Nunca positivo. */
  perda:               number;
  fechadoPorNome:      string;
  fechadoEm:           string | null;
}
