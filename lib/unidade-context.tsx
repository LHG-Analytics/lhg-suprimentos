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

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type UnidadeId =
  | "todas"
  | "lush-ipiranga"
  | "lush-lapa"
  | "andar-de-cima"
  | "altana";

export interface Unidade {
  id: UnidadeId;
  nome: string;
  logo: string;
  shortName: string;
  cor: string;
}

// ── Lista canônica de unidades ─────────────────────────────────────────────────
export const UNIDADES: Unidade[] = [
  {
    id:        "todas",
    nome:      "Todas as unidades",
    logo:      "/logo-supplies.png",
    shortName: "Todas",
    cor:       "#71717a",
  },
  {
    id:        "lush-ipiranga",
    nome:      "Lush Ipiranga",
    logo:      "/unidades/lush.png",
    shortName: "Ipiranga",
    cor:       "#10b981",
  },
  {
    id:        "lush-lapa",
    nome:      "Lush Lapa",
    logo:      "/unidades/lush.png",
    shortName: "Lapa",
    cor:       "#38bdf8",
  },
  {
    id:        "andar-de-cima",
    nome:      "Andar de Cima",
    logo:      "/unidades/adc.png",
    shortName: "Andar de Cima",
    cor:       "#f59e0b",
  },
  {
    id:        "altana",
    nome:      "Altana",
    logo:      "/unidades/altana.png",
    shortName: "Altana",
    cor:       "#a78bfa",
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

  // Restaura do localStorage na montagem (client-only)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("lhg-unidade-ativa");
      if (saved) {
        const found = UNIDADES.find((u) => u.id === saved);
        if (found) setUnidadeState(found);
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
