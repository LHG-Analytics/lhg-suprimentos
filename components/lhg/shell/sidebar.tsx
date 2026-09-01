"use client";

/**
 * sidebar.tsx — LHG-203
 * Sidebar 248 px (expandida) / 64 px (colapsada).
 * Desktop: sticky no fluxo. Mobile: drawer fixo com backdrop.
 * Tokens semânticos bg-sidebar / text-sidebar-foreground para suporte light/dark.
 */

import { useMemo } from "react";
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
  /** Contagem real de cotações abertas vinda do servidor */
  cotacoesBadge?: number;
}

// ── Avatar por iniciais (ou foto) ─────────────────────────────────────────────
function UserAvatar({ name, avatarUrl, size = 30 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt={name}
        className="shrink-0 rounded-full object-cover select-none"
        style={{ width: size, height: size }}
        aria-label={name}
      />
    );
  }

  return (
    <div
      className="shrink-0 rounded-full bg-lhg-700 text-white flex items-center justify-center font-mono font-semibold select-none"
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
          ? "bg-sidebar-accent text-sidebar-foreground"
          : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/60",
      )}
    >
      <Icon
        size={16}
        className={cn(
          "shrink-0",
          active
            ? "text-lhg-500"
            : "text-sidebar-foreground/40 group-hover:text-sidebar-foreground/70",
        )}
      />
      {!collapsed && (
        <>
          <span className="text-sm flex-1 text-left leading-none">{item.label}</span>
          {item.badge !== undefined &&
            (typeof item.badge === "number" ? (
              <span className="font-mono text-[10px] text-sidebar-foreground/40 tabular-nums">
                {item.badge}
              </span>
            ) : (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-lhg-500/15 text-lhg-500 font-medium">
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

  if (collapsed) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          title={unidade.codigo ? `${unidade.nome} (${unidade.codigo})` : unidade.nome}
          className="w-full h-10 rounded-md flex items-center justify-center hover:bg-sidebar-accent/60 transition-colors outline-none px-1"
        >
          <div className="w-full h-7 flex items-center justify-center overflow-hidden">
            <Image
              src={unidade.logo}
              alt={unidade.shortName}
              width={52}
              height={28}
              className="object-contain max-h-full max-w-full"
            />
          </div>
        </DropdownMenuTrigger>
        <UnitDropdownContent unidade={unidade} setUnidade={setUnidade} side="right" />
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="w-full flex items-center gap-2.5 px-2.5 h-10 rounded-lg hover:bg-sidebar-accent/60 transition-colors group border border-sidebar-border hover:border-sidebar-border text-left outline-none">
        <div className="w-9 h-5 shrink-0 flex items-center justify-center overflow-hidden">
          <Image
            src={unidade.logo}
            alt={unidade.shortName}
            width={36}
            height={20}
            className="object-contain max-h-full max-w-full"
          />
        </div>
        <span className="flex-1 min-w-0 text-[13px] text-sidebar-foreground truncate font-medium">
          {unidade.id === "todas"
            ? "Todas as unidades"
            : unidade.codigo
              ? `${unidade.nome} (${unidade.codigo})`
              : unidade.nome}
        </span>
        <ChevronDown
          size={13}
          className="text-sidebar-foreground/40 shrink-0 group-hover:text-sidebar-foreground/70 transition-colors"
        />
      </DropdownMenuTrigger>
      <UnitDropdownContent unidade={unidade} setUnidade={setUnidade} side="bottom" />
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
      className="w-[240px] bg-popover border-border p-1"
    >
      <DropdownMenuItem
        onClick={() => setUnidade(todas)}
        className="flex items-center gap-2.5 cursor-pointer px-2 py-1.5 rounded-md focus:bg-muted/60"
      >
        <div className="w-10 h-6 shrink-0 flex items-center justify-center overflow-hidden">
          <Image src={todas.logo} alt={todas.nome} width={40} height={24} className="object-contain max-h-full max-w-full" />
        </div>
        <span className="text-[13px] flex-1 text-foreground">{todas.nome}</span>
        {unidade.id === "todas" && <Check size={13} className="text-lhg-500 shrink-0" />}
      </DropdownMenuItem>

      <DropdownMenuSeparator className="bg-border/60 my-1" />

      {unidades.map((u) => (
        <DropdownMenuItem
          key={u.id}
          onClick={u.disabled ? undefined : () => setUnidade(u)}
          disabled={u.disabled}
          className={cn(
            "flex items-center gap-2.5 px-2 py-1.5 rounded-md focus:bg-muted/60",
            u.disabled ? "opacity-35 cursor-not-allowed pointer-events-none" : "cursor-pointer",
          )}
        >
          <div className="w-10 h-6 shrink-0 flex items-center justify-center overflow-hidden">
            <Image src={u.logo} alt={u.nome} width={40} height={24} className="object-contain max-h-full max-w-full" />
          </div>
          <span className="text-[13px] flex-1 text-foreground">
            {u.codigo ? `${u.nome} (${u.codigo})` : u.nome}
          </span>
          {u.disabled ? (
            <span className="text-[10px] text-muted-foreground/60 shrink-0">em breve</span>
          ) : unidade.id === u.id ? (
            <Check size={13} className="text-lhg-500 shrink-0" />
          ) : null}
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
  cotacoesBadge,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  /**
   * O item ativo é o de href MAIS LONGO que casa com a rota atual.
   *
   * `pathname.startsWith(href)` sozinho acendia dois itens ao mesmo tempo:
   * `/estoque/contagem` começa com `/estoque`, então "Estoque" e "Contagem"
   * ficavam os dois destacados. Como são irmãos no menu (e não pai/filho),
   * só o mais específico deve acender.
   *
   * Comparar pelo comprimento resolve para qualquer rota aninhada futura, sem
   * precisar de lista de exceções.
   */
  const hrefAtivo = useMemo(() => {
    const candidatos = NAV_ITEMS
      .map((i) => i.href)
      .filter((href) => pathname === href || pathname.startsWith(`${href}/`));
    return candidatos.reduce<string | null>(
      (maior, href) => (maior == null || href.length > maior.length ? href : maior),
      null,
    );
  }, [pathname]);

  const isActive = (href: string) => href === hrefAtivo;

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
          className="lg:hidden fixed inset-0 z-[35] bg-black/50 backdrop-blur-[2px]"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        style={{ width: sidebarWidth }}
        className={cn(
          "shrink-0 h-screen border-r border-sidebar-border bg-sidebar flex flex-col",
          "transition-[width,transform] duration-200",
          "lg:sticky lg:top-0 lg:translate-x-0",
          "fixed top-0 left-0 z-40 lg:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* ── Seletor de unidade + collapse trigger ─────────────────────── */}
        {collapsed ? (
          <div className="border-b border-sidebar-border flex flex-col items-center gap-1 py-2.5 px-1.5">
            <UnitSelector collapsed />
            <button
              onClick={() => { setCollapsed(false); setMobileOpen(false); }}
              className="w-7 h-7 rounded-md flex items-center justify-center text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
              aria-label="Expandir sidebar"
            >
              <PanelLeftOpen size={14} />
            </button>
          </div>
        ) : (
          <div className="border-b border-sidebar-border h-[56px] flex items-center gap-2 px-2.5">
            <div className="flex-1 min-w-0">
              <UnitSelector collapsed={false} />
            </div>
            <button
              onClick={() => { setCollapsed(true); setMobileOpen(false); }}
              className="w-7 h-7 shrink-0 rounded-md flex items-center justify-center text-sidebar-foreground/40 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
              aria-label="Colapsar sidebar"
            >
              <PanelLeftClose size={14} />
            </button>
          </div>
        )}

        {/* ── Navegação ───────────────────────────────────────────────────── */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-3">
          {NAV_SECTIONS.map((section) => {
            const items = NAV_ITEMS.filter(
              (n) => n.section === section && (!n.adminOnly || user.role === "admin"),
            );
            if (items.length === 0) return null;
            return (
              <div key={section} className={cn("space-y-0.5", collapsed && "space-y-1")}>
                {!collapsed && (
                  <div className="px-2.5 pb-1 text-[10px] uppercase tracking-[0.1em] font-medium text-sidebar-foreground/40">
                    {section}
                  </div>
                )}
                {items.map((item) => {
                  const resolvedItem =
                    item.id === "cotacoes" && cotacoesBadge !== undefined
                      ? { ...item, badge: cotacoesBadge > 0 ? cotacoesBadge : undefined }
                      : item;
                  return (
                    <NavLink
                      key={item.id}
                      item={resolvedItem}
                      active={isActive(item.href)}
                      collapsed={collapsed}
                    />
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* ── Rodapé: usuário ─────────────────────────────────────────────── */}
        <div className="p-2 border-t border-sidebar-border">
          {collapsed ? (
            <div className="flex flex-col items-center gap-2 py-1">
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="w-9 h-9 rounded-md flex items-center justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
                aria-label="Alternar tema"
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <Link href="/perfil" title="Meu perfil">
                <UserAvatar name={user.nome} avatarUrl={user.avatarUrl} size={32} />
              </Link>
            </div>
          ) : (
            <div className="rounded-md p-1.5 flex items-center gap-2.5">
              <Link href="/perfil" className="shrink-0" title="Meu perfil">
                <UserAvatar name={user.nome} avatarUrl={user.avatarUrl} size={30} />
              </Link>
              <Link href="/perfil" className="flex-1 min-w-0 hover:opacity-80 transition-opacity">
                <div className="text-sm text-sidebar-foreground font-medium truncate leading-tight">
                  {user.nome}
                </div>
                <div className="text-[11px] text-sidebar-foreground/50 capitalize leading-tight">
                  {user.role}
                </div>
              </Link>
              <button
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="w-7 h-7 rounded-md flex items-center justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
                aria-label="Alternar tema"
              >
                {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
              </button>
              <button
                onClick={handleLogout}
                className="w-7 h-7 rounded-md flex items-center justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/60 transition-colors"
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
