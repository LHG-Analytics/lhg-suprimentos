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
const LOGO_SRC   = "/logo-supplies.png";  // caminho relativo a /public
const LOGO_WIDTH = 48;                    // largura em px para height=32 (proporção 1.5 do arquivo 1536×1024)
const LOGO_ALT   = "LHG Suprimentos";

// ── Tamanhos pré-definidos ─────────────────────────────────────────────────────
const SIZE_MAP = {
  sm:  { height: 24,  width: Math.round(LOGO_WIDTH * (24  / 32)) },
  md:  { height: 32,  width: LOGO_WIDTH },
  lg:  { height: 48,  width: Math.round(LOGO_WIDTH * (48  / 32)) },
  xl:  { height: 72,  width: Math.round(LOGO_WIDTH * (72  / 32)) },
  "2xl": { height: 96, width: Math.round(LOGO_WIDTH * (96 / 32)) },
} as const;

interface LogoProps {
  /**
   * sm=24px | md=32px | lg=48px | xl=72px | 2xl=96px de altura.
   * A largura é calculada proporcionalmente a partir de LOGO_WIDTH.
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
