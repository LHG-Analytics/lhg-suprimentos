/**
 * components/lhg/logo.tsx
 * Componente de logo da LHG Suprimentos.
 *
 * Coloque o arquivo em:  public/logo.svg  (ou .png)
 * e ajuste a variável LOGO_SRC abaixo.
 *
 * Enquanto o arquivo não existir, exibe um fallback com a letra "L"
 * para não quebrar a interface.
 */
import Image from "next/image";

// ── Configuração — altere apenas aqui ─────────────────────────────────────────
const LOGO_SRC   = "/logo.svg";   // caminho relativo a /public
const LOGO_WIDTH = 120;           // largura natural do arquivo (px) — ajuste se necessário
const LOGO_ALT   = "LHG Suprimentos";

// ── Tamanhos pré-definidos ─────────────────────────────────────────────────────
const SIZE_MAP = {
  sm: { height: 24, width: Math.round(LOGO_WIDTH * (24 / 32)) },
  md: { height: 32, width: LOGO_WIDTH },
  lg: { height: 40, width: Math.round(LOGO_WIDTH * (40 / 32)) },
} as const;

interface LogoProps {
  /**
   * sm = 24px | md = 32px (padrão) | lg = 40px de altura.
   * A largura é calculada proporcionalmente.
   */
  size?: keyof typeof SIZE_MAP;
  className?: string;
}

export function Logo({ size = "md", className }: LogoProps) {
  const { height, width } = SIZE_MAP[size];

  return (
    <Image
      src={LOGO_SRC}
      alt={LOGO_ALT}
      width={width}
      height={height}
      priority           // carrega antes do LCP — ideal para logos no header
      className={className}
      style={{ height, width: "auto" }}   // mantém proporção se o SVG for diferente
    />
  );
}
