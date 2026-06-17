"use client";

/**
 * lib/unidade-context.tsx
 * Context global para unidade ativa — persiste em localStorage.
 * Unidades usadas por compras: Lush Ipiranga, Lush Lapa, Andar de Cima, Altana.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type UnidadeId =
  | "todas"
  | "lush-ipiranga"
  | "lush-ipiranga-concavo"
  | "lush-lapa"
  | "andar-de-cima"
  | "altana"
  | "lhg-holding";

export interface Unidade {
  id:        UnidadeId;
  nome:      string;
  logo:      string;
  shortName: string;
  cor:       string;
  /** Código/sigla curto exibido entre parênteses no seletor. Ex: "RCC" */
  codigo?:   string;
  /** true = unidade em implantação; aparece opaca e não é clicável */
  disabled?: boolean;
}

// ── Lista canônica de unidades ─────────────────────────────────────────────────
export const UNIDADES: Unidade[] = [
  {
    id:        "todas",
    nome:      "Todas as unidades",
    logo:      "/logo-supplies.webp",
    shortName: "Todas",
    cor:       "#71717a",
  },
  {
    id:        "lush-ipiranga",
    nome:      "Lush Ipiranga",
    logo:      "/unidades/lush.webp",
    shortName: "Ipiranga",
    cor:       "#10b981",
    codigo:    "RCC",
  },
  {
    id:        "lush-ipiranga-concavo",
    nome:      "Lush Ipiranga",
    logo:      "/unidades/lush.webp",
    shortName: "Ipiranga",
    cor:       "#8b5cf6",
    codigo:    "CONCAVO",
  },
  {
    id:        "lush-lapa",
    nome:      "Lush Lapa",
    logo:      "/unidades/lush.webp",
    shortName: "Lapa",
    cor:       "#38bdf8",
  },
  {
    id:        "andar-de-cima",
    nome:      "Andar de Cima",
    logo:      "/unidades/adc.webp",
    shortName: "Andar de Cima",
    cor:       "#f59e0b",
  },
  {
    id:        "altana",
    nome:      "Altana",
    logo:      "/unidades/altana.webp",
    shortName: "Altana",
    cor:       "#a78bfa",
    // Liberada para uso interno (sem vínculo Omie). O envio ao Omie fica
    // indisponível até credenciais serem cadastradas; o resto funciona.
  },
  {
    id:        "lhg-holding",
    nome:      "LHG Holding",
    // Coloque o arquivo em: public/unidades/lhg-holding.webp
    logo:      "/unidades/lhg-holding.webp",
    shortName: "Holding",
    cor:       "#6366f1",
  },
];

// ── Context ───────────────────────────────────────────────────────────────────
interface UnidadeContextType {
  unidade: Unidade;
  setUnidade: (u: Unidade) => void;
}

const UnidadeContext = createContext<UnidadeContextType>({
  unidade:    UNIDADES[0],
  setUnidade: () => {},
});

// ── Provider ──────────────────────────────────────────────────────────────────
export function UnidadeProvider({ children }: { children: ReactNode }) {
  const [unidade, setUnidadeState] = useState<Unidade>(UNIDADES[0]);
  const router = useRouter();

  // Restaura do localStorage na montagem (client-only) e sincroniza o cookie.
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lhg-unidade-ativa");
      if (saved) {
        const found = UNIDADES.find((u) => u.id === saved);
        if (found) {
          setUnidadeState(found);
          // Garante que o cookie server-side está sincronizado após reload.
          const maxAge = 60 * 60 * 24 * 30;
          document.cookie = `lhg-unidade-slug=${found.id};path=/;max-age=${maxAge};SameSite=Lax`;
        }
      }
    } catch {
      // SSR/incógnito: ignora
    }
  }, []);

  function setUnidade(u: Unidade) {
    setUnidadeState(u);
    try {
      localStorage.setItem("lhg-unidade-ativa", u.id);
    } catch {
      // ok
    }
    // Cookie lido server-side (dashboard, fornecedores, pedidos, etc.).
    // SameSite=Lax; sem HttpOnly para o JS poder ler também.
    try {
      const maxAge = 60 * 60 * 24 * 30; // 30 dias
      document.cookie = `lhg-unidade-slug=${u.id};path=/;max-age=${maxAge};SameSite=Lax`;
    } catch {
      // ok
    }
    // Re-executa o Server Component atual com o novo cookie,
    // fazendo as queries de dados (fornecedores, orçamento, etc.) atualizarem.
    router.refresh();
  }

  return (
    <UnidadeContext.Provider value={{ unidade, setUnidade }}>
      {children}
    </UnidadeContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────────
export function useUnidade() {
  return useContext(UnidadeContext);
}
