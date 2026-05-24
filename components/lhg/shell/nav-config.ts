/**
 * nav-config.ts — LHG-202
 * Configuração central da navegação: itens, seções e mapeamento de breadcrumbs.
 */
import {
  LayoutDashboard,
  ClipboardList,
  Scale,
  ShoppingCart,
  FileText,
  Truck,
  Package,
  Sparkles,
  BarChart2,
  Settings,
  type LucideIcon,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  href: string;
  icon: LucideIcon;
  section: NavSection;
  badge?: number | string;
  adminOnly?: boolean;
}

export type NavSection = "Operação" | "Cadastros" | "Inteligência" | "Administração";

export const NAV_SECTIONS: NavSection[] = [
  "Operação",
  "Cadastros",
  "Inteligência",
  "Administração",
];

export const NAV_ITEMS: NavItem[] = [
  { id: "dashboard",    label: "Dashboard",           href: "/dashboard",    icon: LayoutDashboard, section: "Operação" },
  { id: "requisicoes",  label: "Requisições",          href: "/requisicoes",  icon: ClipboardList,   section: "Operação" },
  { id: "cotacoes",     label: "Cotações",             href: "/cotacoes",     icon: Scale,           section: "Operação",    badge: 12 },
  { id: "pedidos",      label: "Pedidos de compra",    href: "/pedidos",      icon: ShoppingCart,    section: "Operação" },
  { id: "nf",           label: "Entrada de NF",        href: "/nf",           icon: FileText,        section: "Operação" },
  { id: "fornecedores", label: "Fornecedores",         href: "/fornecedores", icon: Truck,           section: "Cadastros" },
  { id: "produtos",     label: "Produtos & catálogo",  href: "/produtos",     icon: Package,         section: "Cadastros" },
  { id: "chat",         label: "Assistente IA",        href: "/chat",         icon: Sparkles,        section: "Inteligência", badge: "novo" },
  { id: "relatorios",   label: "Relatórios",           href: "/relatorios",   icon: BarChart2,       section: "Inteligência" },
  { id: "config",       label: "Configurações",        href: "/admin",        icon: Settings,        section: "Administração", adminOnly: true },
];

/** Mapeamento pathname → breadcrumbs para o Topbar */
export const BREADCRUMB_MAP: Record<string, string[]> = {
  "/dashboard":    ["Dashboard"],
  "/requisicoes":  ["Operação", "Requisições"],
  "/cotacoes":     ["Operação", "Cotações"],
  "/pedidos":      ["Operação", "Pedidos de compra"],
  "/nf":           ["Operação", "Entrada de NF"],
  "/fornecedores": ["Cadastros", "Fornecedores"],
  "/produtos":     ["Cadastros", "Produtos & catálogo"],
  "/chat":         ["Inteligência", "Assistente IA"],
  "/relatorios":   ["Inteligência", "Relatórios"],
  "/admin":        ["Administração", "Configurações"],
};
