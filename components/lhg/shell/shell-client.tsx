"use client";

/**
 * shell-client.tsx — LHG-202
 * Wrapper client que gerencia estado collapsed / mobileOpen e compõe o shell.
 * Recebe dados do usuário como props (serializáveis) do Server Component pai.
 */

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { AiChip } from "./ai-chip";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ShellClientProps {
  children: React.ReactNode;
  user: {
    nome: string;
    email: string;
    role: string;
    avatarUrl?: string | null;
  };
}

// ── Shell ──────────────────────────────────────────────────────────────────────
export function ShellClient({ children, user }: ShellClientProps) {
  const [collapsed, setCollapsed]     = useState(false);
  const [mobileOpen, setMobileOpen]   = useState(false);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <Sidebar
        collapsed={collapsed}
        setCollapsed={setCollapsed}
        mobileOpen={mobileOpen}
        setMobileOpen={setMobileOpen}
        user={user}
      />

      {/* Área principal */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Topbar */}
        <Topbar onToggleMobile={() => setMobileOpen(true)} />

        {/* Conteúdo da página */}
        <main className="flex-1 p-4 sm:p-6 overflow-auto">
          {children}
        </main>
      </div>

      {/* IA flutuante */}
      <AiChip />
    </div>
  );
}
