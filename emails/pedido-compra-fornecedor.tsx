import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

// ─── tipos ────────────────────────────────────────────────────────────────────

export interface PedidoEmailItem {
  nome: string;
  unidade: string;
  quantidade: number;
  precoUnitario: number;
}

export interface PedidoCompraFornecedorEmailProps {
  numero: string;
  fornNome: string;
  itens: PedidoEmailItem[];
  valorTotal: number;
  entregaLabel: string;
  condicaoPgto?: string | null;
  mensagem?: string | null;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

const fBRL = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

// ─── estilos (objetos — compatível com @react-email/components) ───────────────

const styles = {
  body: {
    backgroundColor: "#09090b",
    fontFamily: "Arial, sans-serif",
    margin: "0",
    padding: "0",
  },
  wrapper: {
    maxWidth: "600px",
    margin: "40px auto",
  },
  card: {
    backgroundColor: "#18181b",
    border: "1px solid #27272a",
    borderRadius: "12px",
    overflow: "hidden" as const,
  },
  // Header
  headerBg: {
    backgroundColor: "#10b981",
    padding: "24px 32px",
  },
  headerLabel: {
    margin: "0",
    fontSize: "12px",
    color: "#d1fae5",
    letterSpacing: "0.1em",
    textTransform: "uppercase" as const,
  },
  headerTitle: {
    margin: "4px 0 0",
    fontSize: "22px",
    color: "#ffffff",
    fontWeight: "700",
  },
  // Body
  bodyPadding: {
    padding: "28px 32px",
  },
  greeting: {
    margin: "0 0 16px",
    fontSize: "14px",
    color: "#a1a1aa",
  },
  greetingName: {
    color: "#e4e4e7",
    fontWeight: "bold",
  },
  msgBox: {
    backgroundColor: "#27272a",
    borderLeft: "3px solid #10b981",
    borderRadius: "4px",
    padding: "12px 16px",
    marginBottom: "20px",
  },
  msgText: {
    margin: "0",
    fontSize: "13px",
    color: "#d4d4d8",
  },
  intro: {
    margin: "0 0 20px",
    fontSize: "14px",
    color: "#a1a1aa",
  },
  // Tabela
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    backgroundColor: "#09090b",
    border: "1px solid #27272a",
    borderRadius: "8px",
    overflow: "hidden" as const,
  },
  theadRow: {
    backgroundColor: "#27272a",
  },
  th: {
    padding: "8px 12px",
    fontSize: "11px",
    color: "#71717a",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    textAlign: "left" as const,
  },
  thCenter: {
    padding: "8px 12px",
    fontSize: "11px",
    color: "#71717a",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    textAlign: "center" as const,
  },
  thRight: {
    padding: "8px 12px",
    fontSize: "11px",
    color: "#71717a",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
    textAlign: "right" as const,
  },
  tdProd: {
    padding: "6px 12px",
    borderBottom: "1px solid #27272a",
    fontSize: "13px",
    color: "#e4e4e7",
  },
  tdCenter: {
    padding: "6px 12px",
    borderBottom: "1px solid #27272a",
    fontSize: "13px",
    color: "#a1a1aa",
    textAlign: "center" as const,
  },
  tdRight: {
    padding: "6px 12px",
    borderBottom: "1px solid #27272a",
    fontSize: "13px",
    color: "#a1a1aa",
    textAlign: "right" as const,
  },
  tdTotal: {
    padding: "6px 12px",
    borderBottom: "1px solid #27272a",
    fontSize: "13px",
    color: "#e4e4e7",
    fontWeight: "600",
    textAlign: "right" as const,
  },
  tfootLabel: {
    padding: "10px 12px",
    fontSize: "13px",
    color: "#71717a",
    fontWeight: "600",
    textAlign: "right" as const,
  },
  tfootValue: {
    padding: "10px 12px",
    fontSize: "15px",
    color: "#10b981",
    fontWeight: "700",
    textAlign: "right" as const,
  },
  // Detalhes
  detailsSection: {
    marginTop: "20px",
  },
  detailLabel: {
    margin: "0",
    fontSize: "11px",
    color: "#71717a",
    textTransform: "uppercase" as const,
    letterSpacing: "0.08em",
  },
  detailValue: {
    margin: "4px 0 0",
    fontSize: "14px",
    color: "#e4e4e7",
    fontWeight: "600",
  },
  // Footer
  footer: {
    padding: "16px 32px",
    borderTop: "1px solid #27272a",
    textAlign: "center" as const,
  },
  footerText: {
    margin: "0",
    fontSize: "11px",
    color: "#52525b",
  },
};

// ─── componente ───────────────────────────────────────────────────────────────

export function PedidoCompraFornecedorEmail({
  numero,
  fornNome,
  itens,
  valorTotal,
  entregaLabel,
  condicaoPgto,
  mensagem,
}: PedidoCompraFornecedorEmailProps) {
  return (
    <Html lang="pt-BR">
      <Head />
      <Preview>Pedido de Compra {numero} — LHG Motéis</Preview>
      <Body style={styles.body}>
        <Container style={styles.wrapper}>
          <Section style={styles.card}>
            {/* ── Header ──────────────────────────────────────────────── */}
            <Section style={styles.headerBg}>
              <Text style={styles.headerLabel}>LHG Motéis · Compras</Text>
              <Heading as="h1" style={styles.headerTitle}>
                Pedido de Compra {numero}
              </Heading>
            </Section>

            {/* ── Body ────────────────────────────────────────────────── */}
            <Section style={styles.bodyPadding}>
              <Text style={styles.greeting}>
                Prezado(a){" "}
                <strong style={styles.greetingName}>{fornNome}</strong>,
              </Text>

              {mensagem ? (
                <Section style={styles.msgBox}>
                  <Text style={styles.msgText}>{mensagem}</Text>
                </Section>
              ) : null}

              <Text style={styles.intro}>
                Segue o pedido de compra para sua confirmação e atendimento.
              </Text>

              {/* Tabela de itens */}
              <table style={styles.table}>
                <thead>
                  <tr style={styles.theadRow}>
                    <th style={styles.th}>Produto</th>
                    <th style={styles.thCenter}>Qtd</th>
                    <th style={styles.thRight}>Unit.</th>
                    <th style={styles.thRight}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {itens.map((item, idx) => (
                    <tr key={idx}>
                      <td style={styles.tdProd}>
                        {item.nome} ({item.unidade})
                      </td>
                      <td style={styles.tdCenter}>{item.quantidade}</td>
                      <td style={styles.tdRight}>
                        {fBRL(item.precoUnitario)}
                      </td>
                      <td style={styles.tdTotal}>
                        {fBRL(item.quantidade * item.precoUnitario)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={3} style={styles.tfootLabel}>
                      TOTAL DO PEDIDO
                    </td>
                    <td style={styles.tfootValue}>{fBRL(valorTotal)}</td>
                  </tr>
                </tfoot>
              </table>

              {/* Detalhes de entrega + condição de pagamento */}
              <Row style={styles.detailsSection}>
                <Column style={{ paddingRight: "24px" }}>
                  <Text style={styles.detailLabel}>Previsão de Entrega</Text>
                  <Text style={styles.detailValue}>{entregaLabel}</Text>
                </Column>
                {condicaoPgto ? (
                  <Column>
                    <Text style={styles.detailLabel}>
                      Condição de Pagamento
                    </Text>
                    <Text style={styles.detailValue}>{condicaoPgto}</Text>
                  </Column>
                ) : null}
              </Row>
            </Section>

            {/* ── Footer ──────────────────────────────────────────────── */}
            <Hr style={{ borderColor: "#27272a", margin: "0" }} />
            <Section style={styles.footer}>
              <Text style={styles.footerText}>
                Para dúvidas, entre em contato com o setor de compras da LHG
                Motéis.
              </Text>
            </Section>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default PedidoCompraFornecedorEmail;
