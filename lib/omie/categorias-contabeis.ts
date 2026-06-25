/**
 * lib/omie/categorias-contabeis.ts
 * Snapshot do plano de contas de DESPESA do Omie (call ListarCategorias),
 * capturado da Lush Ipiranga. Usado como categorias INTERNAS para unidades
 * que não têm vínculo com o Omie (ex: Altana) — assim a compradora escolhe
 * a mesma categoria contábil que escolheria numa unidade integrada, sem
 * precisar de credenciais Omie.
 *
 * Mantido em sincronia manual: se o plano de contas do Omie mudar, recapturar.
 * Filtro aplicado na captura: conta_despesa="S", conta_inativa="N",
 *   nao_exibir≠"S", totalizadora≠"S".
 */

export interface CategoriaContabil {
  codigo:    string;
  descricao: string;
}

/** Normaliza texto p/ casar nomes: minúsculo, sem acento, espaços colapsados. */
function norm(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
}

/**
 * Aliases categoria de ORÇAMENTO → descrição da conta CONTÁBIL, para os casos
 * em que o nome não bate exatamente com uma linha do plano de contas.
 */
const ALIAS_CATEGORIA_CONTABIL: Record<string, string> = {
  "materiais de limpeza":       "produtos de limpeza",
  "materiais de manutencao":    "manutencao - operacional",
  "reposicoes loucas e talheres": "reposicoes loucas e talheres",
};

/**
 * Resolve o código contábil do Omie (cCodCateg, ex "2.02.87") a partir da
 * categoria de orçamento de um produto (ex "Alimentos"). Casa pelo nome
 * (normalizado) com o plano de contas; usa aliases quando o nome difere.
 * Retorna null se não houver correspondência (ex: "Outros").
 */
export function codigoContabilParaCategoria(categoria: string | null | undefined): string | null {
  if (!categoria) return null;
  const n = norm(categoria);
  const alvo = ALIAS_CATEGORIA_CONTABIL[n] ?? n;
  const hit = CATEGORIAS_CONTABEIS_PADRAO.find((c) => norm(c.descricao) === norm(alvo));
  return hit?.codigo ?? null;
}

export const CATEGORIAS_CONTABEIS_PADRAO: CategoriaContabil[] = [
  { codigo: "2.01.01", descricao: "Chargeback" },
  { codigo: "2.01.02", descricao: "Ressarcimento a Clientes" },
  { codigo: "2.01.03", descricao: "Cancelamento de Reservas" },
  { codigo: "2.01.04", descricao: "Descontos sobre Vendas e Serviços" },
  { codigo: "2.02.01", descricao: "Serviços de Lavanderia" },
  { codigo: "2.02.02", descricao: "Serviços de limpeza - Operacional" },
  { codigo: "2.02.03", descricao: "Manutenção - Operacional" },
  { codigo: "2.02.04", descricao: "Dedetização" },
  { codigo: "2.02.78", descricao: "Produtos de Limpeza" },
  { codigo: "2.02.79", descricao: "Música e TV a Cabo" },
  { codigo: "2.02.80", descricao: "Água - Caminhão PIPA" },
  { codigo: "2.02.81", descricao: "Tabacaria" },
  { codigo: "2.02.82", descricao: "Produtos Eróticos" },
  { codigo: "2.02.83", descricao: "Conveniência" },
  { codigo: "2.02.84", descricao: "Bomboniere" },
  { codigo: "2.02.85", descricao: "Bebidas Não alcoólicas" },
  { codigo: "2.02.86", descricao: "Bebidas Alcoólicas" },
  { codigo: "2.02.87", descricao: "Alimentos" },
  { codigo: "2.02.88", descricao: "Reposições louças e talheres" },
  { codigo: "2.02.89", descricao: "Cardápios e Lista de Preços" },
  { codigo: "2.02.90", descricao: "Produtos Químicos -Piscina" },
  { codigo: "2.02.91", descricao: "Produtos de Lavanderia" },
  { codigo: "2.02.92", descricao: "Utensílios de Suítes" },
  { codigo: "2.02.93", descricao: "Enxoval de Cozinha" },
  { codigo: "2.02.94", descricao: "Enxoval Têxtil" },
  { codigo: "2.02.95", descricao: "Descartáveis" },
  { codigo: "2.02.96", descricao: "Decorações e Experiências" },
  { codigo: "2.02.97", descricao: "Amenities" },
  { codigo: "2.02.98", descricao: "Ecad" },
  { codigo: "2.02.99", descricao: "Locação de Equipamentos" },
  { codigo: "2.03.01", descricao: "Salários" },
  { codigo: "2.03.02", descricao: "Horas Extras" },
  { codigo: "2.03.03", descricao: "Férias" },
  { codigo: "2.03.04", descricao: "Rescisões" },
  { codigo: "2.03.05", descricao: "13º Salário" },
  { codigo: "2.03.06", descricao: "INSS" },
  { codigo: "2.03.07", descricao: "FGTS" },
  { codigo: "2.03.08", descricao: "Bônus e Gratificações" },
  { codigo: "2.03.09", descricao: "Pensão Alimentícia" },
  { codigo: "2.03.10", descricao: "Assistência Médica" },
  { codigo: "2.03.11", descricao: "Vale Transporte" },
  { codigo: "2.03.12", descricao: "Vale Refeição" },
  { codigo: "2.03.13", descricao: "Vale Alimentação" },
  { codigo: "2.03.14", descricao: "Seguro de Vida" },
  { codigo: "2.03.88", descricao: "Alimentação de Colaboradores" },
  { codigo: "2.03.89", descricao: "Outros Benefícios" },
  { codigo: "2.03.90", descricao: "Pró Labore" },
  { codigo: "2.03.91", descricao: "IRRF sobre Pró Labore" },
  { codigo: "2.03.92", descricao: "IRRF sobre Salários" },
  { codigo: "2.03.93", descricao: "Contratos PJ" },
  { codigo: "2.03.94", descricao: "Diaristas, Temporários e Free lancers" },
  { codigo: "2.03.95", descricao: "Indenizações" },
  { codigo: "2.03.96", descricao: "Sindicatos" },
  { codigo: "2.03.97", descricao: "Uniforme e EPI" },
  { codigo: "2.03.98", descricao: "Saúde Ocupacional" },
  { codigo: "2.03.99", descricao: "Confraternizações" },
  { codigo: "2.04.01", descricao: "Aluguel" },
  { codigo: "2.04.02", descricao: "RH - Recrutamento e Seleção" },
  { codigo: "2.04.03", descricao: "Combustível" },
  { codigo: "2.04.04", descricao: "Estacionamento" },
  { codigo: "2.04.05", descricao: "Locomoção" },
  { codigo: "2.04.06", descricao: "Material de Escritório" },
  { codigo: "2.04.07", descricao: "Manutenção de Imobilizado" },
  { codigo: "2.04.08", descricao: "Seguros" },
  { codigo: "2.04.09", descricao: "Outsourcing" },
  { codigo: "2.04.10", descricao: "Contabilidade" },
  { codigo: "2.04.11", descricao: "Advogados" },
  { codigo: "2.04.12", descricao: "Consultorias" },
  { codigo: "2.04.13", descricao: "Segurança" },
  { codigo: "2.04.14", descricao: "Limpeza" },
  { codigo: "2.04.90", descricao: "Telefonia e Internet (Consumo)" },
  { codigo: "2.04.91", descricao: "Saneamento Básico (Consumo)" },
  { codigo: "2.04.92", descricao: "Gás (Consumo)" },
  { codigo: "2.04.93", descricao: "Energia Elétrica (Consumo)" },
  { codigo: "2.04.94", descricao: "Cartórios, Correios, Taxas e Licenças" },
  { codigo: "2.04.95", descricao: "Serviços de TI, Informatica e Periféricos" },
  { codigo: "2.04.96", descricao: "Software - Licença de Uso" },
  { codigo: "2.04.97", descricao: "Jardinagem" },
  { codigo: "2.04.98", descricao: "Manutenção Predial" },
  { codigo: "2.04.99", descricao: "Fretes e Carretos" },
  { codigo: "2.05.01", descricao: "Juros sobre Operações Financeiras" },
  { codigo: "2.05.02", descricao: "Multas Pagas" },
  { codigo: "2.05.03", descricao: "Juros Pagos" },
  { codigo: "2.05.04", descricao: "Tarifas Bancárias" },
  { codigo: "2.05.96", descricao: "Outros Encargos Financeiros" },
  { codigo: "2.05.97", descricao: "Comissões sobre Cartão Crédito e Débito" },
  { codigo: "2.05.98", descricao: "Multas sobre Parcelamentos" },
  { codigo: "2.05.99", descricao: "Juros sobre Parcelamentos" },
  { codigo: "2.06.01", descricao: "Marketing" },
  { codigo: "2.06.02", descricao: "Bonificações e Brindes a Clientes e Parceiros" },
  { codigo: "2.06.03", descricao: "Comissões Agências" },
  { codigo: "2.06.04", descricao: "Representação Comercial" },
  { codigo: "2.06.05", descricao: "Material Gráfico" },
  { codigo: "2.06.06", descricao: "Eventos Comerciais" },
  { codigo: "2.07.01", descricao: "ISS" },
  { codigo: "2.07.02", descricao: "ICMS" },
  { codigo: "2.07.03", descricao: "IPI" },
  { codigo: "2.07.04", descricao: "PIS" },
  { codigo: "2.07.05", descricao: "COFINS" },
  { codigo: "2.07.06", descricao: "Contribuição Social" },
  { codigo: "2.07.92", descricao: "IR s/ Rendimentos Financeiros" },
  { codigo: "2.07.93", descricao: "INSS Retido" },
  { codigo: "2.07.94", descricao: "PCC Retido" },
  { codigo: "2.07.95", descricao: "ISS Retido" },
  { codigo: "2.07.96", descricao: "IRRF Retido" },
  { codigo: "2.07.97", descricao: "IOF" },
  { codigo: "2.07.98", descricao: "IPTU" },
  { codigo: "2.07.99", descricao: "IRPJ" },
  { codigo: "2.08.01", descricao: "Móveis e Utensílios" },
  { codigo: "2.08.02", descricao: "Utensílios de Copa e Cozinha" },
  { codigo: "2.08.90", descricao: "Projetos" },
  { codigo: "2.08.91", descricao: "Instalações" },
  { codigo: "2.08.92", descricao: "Obras e Construções em Geral" },
  { codigo: "2.08.93", descricao: "Máquinas e Equipamentos" },
  { codigo: "2.08.94", descricao: "Veículos" },
  { codigo: "2.08.95", descricao: "Imóveis" },
  { codigo: "2.08.96", descricao: "Tapetes, Pisos e Cortinas" },
  { codigo: "2.08.97", descricao: "Rouparias" },
  { codigo: "2.08.98", descricao: "Equipamentos de Informática" },
  { codigo: "2.08.99", descricao: "Equipamentos de Áudio e Vídeo" },
  { codigo: "2.09.01", descricao: "Adiantamento a Fornecedores" },
  { codigo: "2.09.02", descricao: "Adiantamento - Distribuição de Lucros e ou Dividendos" },
  { codigo: "2.09.04", descricao: "Mútuo a Pagar" },
  { codigo: "2.09.05", descricao: "Amortizações" },
  { codigo: "2.10.99", descricao: "Estorno (Débito)" },
];
