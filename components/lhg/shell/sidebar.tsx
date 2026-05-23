"use client";

/**
 * sidebar.tsx — LHG-202
 * Sidebar 248 px (expandida) / 64 px (colapsada).
 * Desktop: sticky no fluxo. Mobile: drawer fixo com backdrop.
 */

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { Sun, Moon, LogOut, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { NAV_ITEMS, NAV_SECTIONS, type NavItem } from "./nav-config";

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface UserInfo {
  nome: string;
  email: string;
  role: string;
  avatarUrl?: string | null;
}

interface SidebarProps {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  user: UserInfo;
}

// ── Avatar por iniciais ────────────────────────────────────────────────────────
function UserAvatar({ name, size = 30 }: { name: string; size?: number }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
  return (
    <div
      className="shrink-0 rounded-full bg-lhg-700 text-zinc-50 flex items-center justify-center font-mono font-semibold select-none"
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      aria-label={name}
    >
      {initials}
    </div>
  );
}

// ── Item de navegação ──────────────────────────────────────────────────────────
function NavLink({
  item,
  active,
  collapsed,
}: {
  item: NavItem;
  active: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      title={collapsed ? item.label : undefined}
      className={cn(
        "w-full flex items-center gap-2.5 rounded-md transition-colors group",
        collapsed ? "h-10 justify-center" : "h-9 px-2.5",
        active
          ? "bg-zinc-800/80 text-zinc-50"
          : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/40",
      )}
    >
      <Icon
        size={16}
        className={cn(
          "shrink-0",
          active ? "text-zinc-50" : "text-zinc-500 group-hover:text-zinc-300",
        )}
      />
      {!collapsed && (
        <>
          <span className="text-sm flex-1 text-left leading-none">{item.label}</span>
          {item.badge !== undefined &&
            (typeof item.badge === "number" ? (
              <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                {item.badge}
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-lhg-500/15 text-lhg-400 font-medium">
                {item.badge}
              </span>
            ))}
        </>
      )}
    </Link>
  );
}

// ── Sidebar principal ──────────────────────────────────────────────────────────
export function Sidebar({
  collapsed,
  setCollapsed,
  mobileOpen,
  setMobileOpen,
  user,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const isActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname.startsWith(href);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const sidebarWidth = collapsed ? 64 : 248;

  return (
    <>
      {/* Backdrop mobile */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px]"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        style={{ width: sidebarWidth }}
        className={cn(
          "shrink-0 h-screen border-r border-zinc-800/80 bg-zinc-950 flex flex-col",
          "transition-[width,transform] duration-200",
          // Desktop: sticky no fluxo
          "lg:sticky lg:top-0 lg:translate-x-0",
          // Mobile: drawer fixo
          "fixed top-0 left-0 z-50 lg:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* ── Logo / collapse trigger ─────────────────────────────────── */}
        <div className="p-2.5 border-b border-zinc-800/80 flex items-center gap-2">
          {!collapsed && (
            <div className="flex items-center gap-2 flex-1 px-1">
              <div className="w-6 h-6 rounded-md bg-lhg-500 text-zinc-950 flex items-center justify-center font-mono font-bold text-xs select-none">
                L
              </div>
              <span className="text-sm font-medium tracking-tight text-zinc-100">
                LHG <span className="text-zinc-500">Sup.</span>
              </span>
            </div>
          )}
          <button
            onClick={() => {
              setCollapsed(!collapsed);
              setMobileOpen(false);
            }}
            className={cn(
              "w-8 h-8 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors",
              collapsed && "mx-auto",
            )}
            aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
          >
            {collapsed ? (
              <PanelLeftOpen size={15} />
            ) : (
              <PanelLeftClose size={15} />
            )}
          </button>
        </div>

        {/* ── Navegação ───────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-3">
          {NAV_SECTIONS.map((section) => {
            const items = NAV_ITEMS.filter(
              (n) =>
                n.section === section &&
                (!n.adminOnly || user.role === "admin"),
            );
            if (items.length === 0) return null;
            return (
              <div key={section} className={cn("space-y-0.5", collapsed && "space-y-1")}>
                {!collapsed && (
                  <div className="px-2.5 pb-1 text-[10px] uppercase tracking-[0.1em] font-medium text-zinc-600">
                    {section}
                  </div>
                )}
                {items.map((item) => (
                  <NavLink
                    key={item.id}
                    item={item}
                    active={isActive(item.href)}
                    collapsed={collapsed}
                  />
                ))}
              </div>
            );
          })}
        </nav>

        {/* ── Rodapé: usuário ─────────────────────────────────────────── */}
        <div className="p-2 border-t border-zinc-800/80">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="w-9 h-9 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                aria-label="Alternar tema"
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <UserAvatar name={user.nome} size={32} />
            </div>
          ) : (
            <div className="rounded-md p-1.5 flex items-center gap-2.5 group">
              <UserAvatar name={user.nome} size={30} />
              <div className="flex-1 min-w-0">
                <div className="text-sm text-zinc-100 font-medium truncate leading-tight">
                  {user.nome}
                </div>
                <div className="text-[11px] text-zinc-500 capitalize leading-tight">
                  {user.role}
                </div>
              </div>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                aria-label="Alternar tema"
              >
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              </button>
              <button
                onClick={handleLogout}
                className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/60 transition-colors"
                aria-label="Sair"
                title="Sair"
              >
                <LogOut size={14} />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
