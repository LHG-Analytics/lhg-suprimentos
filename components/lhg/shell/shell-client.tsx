"use client";

/**
 * shell-client.tsx — LHG-203
 * Wrapper client que gerencia estado collapsed / mobileOpen e compõe o shell.
 * Recebe dados do usuário e badge de cotações do Server Component pai.
 * Envolve toda a app com UnidadeProvider para seletor de unidade global.
 */

import { useState } from "react";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";
import { AiChip } from "./ai-chip";
import { UnidadeProvider } from "@/lib/unidade-context";
import { useRealtimeNotifications } from "@/hooks/use-realtime-notifications";
import { TourProvider } from "@/components/lhg/tour/tour-context";
import { TourOverlay } from "@/components/lhg/tour/tour-overlay";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface ShellClientProps {
  children:       React.ReactNode;
  cotacoesBadge?: number;
  user: {
    nome:       string;
    email:      string;
    role:       string;
    avatarUrl?: string | null;
  };
}

// ── Shell ──────────────────────────────────────────────────────────────────────
export function ShellClient({ children, user, cotacoesBadge }: ShellClientProps) {
  const [collapsed,   setCollapsed]   = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);

  // Notificações real-time via Supabase Realtime (LHG-221)
  const { notifications, unreadCount, markAllRead } = useRealtimeNotifications();

  return (
    <UnidadeProvider>
      <TourProvider>
        <div className="flex min-h-screen bg-background">
          {/* Sidebar */}
          <Sidebar
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            mobileOpen={mobileOpen}
            setMobileOpen={setMobileOpen}
            user={user}
            cotacoesBadge={cotacoesBadge}
          />

          {/* Área principal */}
          <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
            <Topbar
              onToggleMobile={() => setMobileOpen(true)}
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkAllRead={markAllRead}
            />
            <main className="flex-1 p-4 sm:p-6 overflow-auto">
              {children}
            </main>
          </div>

          {/* Chip flutuante da IA */}
          <AiChip />

          {/* Tour interativo (portal de alto z-index) */}
          <TourOverlay />
        </div>
      </TourProvider>
    </UnidadeProvider>
  );
}
