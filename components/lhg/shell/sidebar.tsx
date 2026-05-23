"use client";

/**
 * sidebar.tsx — LHG-203
 * Sidebar 248 px (expandida) / 64 px (colapsada).
 * Desktop: sticky no fluxo. Mobile: drawer fixo com backdrop.
 *
 * Novidades vs LHG-202:
 *  - Logo maior (md=32px) com área de padding generosa
 *  - Seletor de unidade com dropdown e logos das unidades
 *  - Integração com UnidadeContext (lib/unidade-context)
 */

import Link from "next/link";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Sun, Moon, LogOut, PanelLeftClose, PanelLeftOpen, ChevronDown, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { NAV_ITEMS, NAV_SECTIONS, type NavItem } from "./nav-config";
import { useUnidade, UNIDADES, type Unidade } from "@/lib/unidade-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

// ── Seletor de unidade ─────────────────────────────────────────────────────────
function UnitSelector({ collapsed }: { collapsed: boolean }) {
  const { unidade, setUnidade } = useUnidade();

  // ── Versão colapsada: apenas ícone com tooltip ──────────────────────────────
  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          title={unidade.nome}
          className="w-10 h-10 mx-auto rounded-lg flex items-center justify-center hover:bg-zinc-800/60 transition-colors outline-none"
        >
          <div className="w-7 h-7 rounded flex items-center justify-center overflow-hidden">
            <Image
              src={unidade.logo}
              alt={unidade.shortName}
              width={28}
              height={28}
              className="object-contain w-full h-full"
            />
          </div>
        </DropdownMenuTrigger>
        <UnitDropdownContent
          unidade={unidade}
          setUnidade={setUnidade}
          side="right"
        />
      </DropdownMenu>
    );
  }

  // ── Versão expandida: botão completo ────────────────────────────────────────
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full flex items-center gap-2.5 px-2.5 h-10 rounded-lg hover:bg-zinc-800/40 transition-colors group border border-zinc-800/60 hover:border-zinc-700/80 text-left outline-none">
        {/* Logo da unidade */}
        <div className="w-6 h-6 shrink-0 rounded flex items-center justify-center overflow-hidden">
          <Image
            src={unidade.logo}
            alt={unidade.shortName}
            width={24}
            height={24}
            className="object-contain w-full h-full"
          />
        </div>
        {/* Nome */}
        <span className="flex-1 min-w-0 text-[13px] text-zinc-200 truncate font-medium">
          {unidade.id === "todas" ? "Todas as unidades" : unidade.nome}
        </span>
        {/* Chevron */}
        <ChevronDown
          size={13}
          className="text-zinc-500 shrink-0 group-hover:text-zinc-400 transition-colors"
        />
      </DropdownMenuTrigger>
      <UnitDropdownContent
        unidade={unidade}
        setUnidade={setUnidade}
        side="bottom"
      />
    </DropdownMenu>
  );
}

// ── Conteúdo do dropdown de unidades ──────────────────────────────────────────
function UnitDropdownContent({
  unidade,
  setUnidade,
  side,
}: {
  unidade: Unidade;
  setUnidade: (u: Unidade) => void;
  side: "right" | "bottom";
}) {
  const [todas, ...unidades] = UNIDADES;

  return (
    <DropdownMenuContent
      side={side}
      align="start"
      sideOffset={4}
      className="w-[220px] bg-zinc-950 border-zinc-800"
    >
      {/* Todas as unidades */}
      <DropdownMenuItem
        onClick={() => setUnidade(todas)}
        className="flex items-center gap-2.5 cursor-pointer py-2 focus:bg-zinc-800/60"
      >
        <div className="w-6 h-6 shrink-0 rounded flex items-center justify-center overflow-hidden">
          <Image
            src={todas.logo}
            alt={todas.nome}
            width={24}
            height={24}
            className="object-contain"
          />
        </div>
        <span className="text-[13px] flex-1 text-zinc-300">{todas.nome}</span>
        {unidade.id === "todas" && (
          <Check size={13} className="text-lhg-400" />
        )}
      </DropdownMenuItem>

      <DropdownMenuSeparator className="bg-zinc-800/60 my-1" />

      {/* Unidades individuais */}
      {unidades.map((u) => (
        <DropdownMenuItem
          key={u.id}
          onClick={() => setUnidade(u)}
          className="flex items-center gap-2.5 cursor-pointer py-2 focus:bg-zinc-800/60"
        >
          <div className="w-6 h-6 shrink-0 rounded flex items-center justify-center overflow-hidden">
            <Image
              src={u.logo}
              alt={u.nome}
              width={24}
              height={24}
              className="object-contain"
            />
          </div>
          <span className="text-[13px] flex-1 text-zinc-300">{u.nome}</span>
          {unidade.id === u.id && (
            <Check size={13} className="text-lhg-400" />
          )}
        </DropdownMenuItem>
      ))}
    </DropdownMenuContent>
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
        {/* ── Seletor de unidade + collapse trigger (área unificada) ─── */}
        {collapsed ? (
          /* Colapsado: ícone da unidade acima, botão de expand abaixo */
          <div className="border-b border-zinc-800/80 flex flex-col items-center gap-1 py-2.5 px-1.5">
            <UnitSelector collapsed />
            <button
              onClick={() => { setCollapsed(false); setMobileOpen(false); }}
              className="w-7 h-7 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
              aria-label="Expandir sidebar"
            >
              <PanelLeftOpen size={14} />
            </button>
          </div>
        ) : (
          /* Expandido: seletor + botão colapso na mesma linha */
          <div className="border-b border-zinc-800/80 h-[56px] flex items-center gap-2 px-2.5">
            <div className="flex-1 min-w-0">
              <UnitSelector collapsed={false} />
            </div>
            <button
              onClick={() => { setCollapsed(true); setMobileOpen(false); }}
              className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-zinc-600 hover:text-zinc-300 hover:bg-zinc-800/60 transition-colors"
              aria-label="Colapsar sidebar"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
        )}

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
            <div className="rounded-md p-1.5 flex items-center gap-2.5">
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
