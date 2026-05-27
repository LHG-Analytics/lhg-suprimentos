/**
 * tour-steps.ts — LHG Product Tour
 * Definição declarativa dos passos do tour interativo.
 * Cada passo especifica: alvo CSS, posição do balão, página de destino.
 *
 * Fluxo coberto: Requisição → Cotação → Pedido → Nota Fiscal → Recebimento Omie
 */

export type TourPosition = "center" | "right" | "bottom" | "top" | "left";

export interface TourStep {
  id:          string;
  title:       string;
  description: string;
  target?:     string;       // CSS selector do elemento iluminado
  position:    TourPosition;
  page?:       string;       // rota para navegar se necessário
  emoji?:      string;
}

export const TOUR_STEPS: TourStep[] = [
  {
    id:          "welcome",
    title:       "Bem-vindo ao LHG Suprimentos!",
    description: "Em menos de 2 minutos você vai conhecer o fluxo completo de compras: Requisição → Cotação → Pedido → NF. Vamos lá?",
    position:    "center",
    emoji:       "👋",
  },
  {
    id:          "nav-requisicoes",
    title:       "Passo 1 — Requisições",
    description: "Todo pedido começa aqui. A equipe solicita os itens que precisa. Você vê todas as requisições abertas, em andamento e concluídas.",
    target:      'a[href="/requisicoes"]',
    position:    "right",
    page:        "/dashboard",
    emoji:       "📋",
  },
  {
    id:          "nova-requisicao",
    title:       "Criar uma Requisição",
    description: 'Clique em "+ Nova Requisição" para abrir o assistente. Você escolhe os produtos, quantidades e a unidade solicitante.',
    target:      '[data-tour="btn-nova-requisicao"]',
    position:    "bottom",
    page:        "/requisicoes",
    emoji:       "✏️",
  },
  {
    id:          "nav-cotacoes",
    title:       "Passo 2 — Cotações",
    description: "Com a requisição criada, abra uma Cotação para consultar preços nos fornecedores. Compare propostas, edite valores e aprove a melhor combinação.",
    target:      'a[href="/cotacoes"]',
    position:    "right",
    page:        "/requisicoes",
    emoji:       "💬",
  },
  {
    id:          "nova-cotacao",
    title:       "Matriz Comparativa",
    description: 'Clique em "+ Nova Cotação", vincule a requisição e adicione fornecedores. A IA compara preços e sugere a melhor combinação. Você ainda pode editar a cotação antes de aprovar.',
    target:      '[data-tour="btn-nova-cotacao"]',
    position:    "bottom",
    page:        "/cotacoes",
    emoji:       "🤖",
  },
  {
    id:          "nav-pedidos",
    title:       "Passo 3 — Pedidos de Compra",
    description: "Ao aprovar os melhores preços, os Pedidos são gerados automaticamente. Com um clique você envia ao ERP (Omie) e dispara o e-mail de confirmação ao fornecedor.",
    target:      'a[href="/pedidos"]',
    position:    "right",
    page:        "/cotacoes",
    emoji:       "🛒",
  },
  {
    id:          "nav-nf",
    title:       "Passo 4 — Nota Fiscal",
    description: "Ao receber a mercadoria, lance a Nota Fiscal do fornecedor aqui. O sistema vincula ao pedido e conclui o recebimento no Omie automaticamente.",
    target:      'a[href="/notas-fiscais"]',
    position:    "right",
    page:        "/pedidos",
    emoji:       "🧾",
  },
  {
    id:          "done",
    title:       "Pronto! Você já domina o fluxo.",
    description: "Requisição → Cotação → Pedido → NF. Ciclo completo, do pedido ao recebimento no ERP. Qualquer dúvida, clique no ❓ da barra superior para rever este guia.",
    position:    "center",
    emoji:       "🚀",
  },
];
