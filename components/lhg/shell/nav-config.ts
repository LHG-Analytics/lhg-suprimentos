/**
 * nav-config.ts — LHG-202
 * Configuração central da navegação: itens, seções e mapeamento de breadcrumbs.
 */
import {
  LayoutDashboard,
  ClipboardList,
  Scale,
  ShoppingCart,
  ClipboardCheck,
  Truck,
  Package,
  Boxes,
  Sparkles,
  BarChart2,
  Settings,
  History,
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
  { id: "cotacoes",     label: "Cotações",             href: "/cotacoes",     icon: Scale,           section: "Operação" },
  { id: "pedidos",      label: "Pedidos de compra",    href: "/pedidos",      icon: ShoppingCart,    section: "Operação" },
  { id: "contagem",     label: "Contagem",             href: "/estoque/contagem", icon: ClipboardCheck, section: "Operação" },
  { id: "fornecedores", label: "Fornecedores",         href: "/fornecedores", icon: Truck,           section: "Cadastros" },
  { id: "produtos",     label: "Produtos",              href: "/produtos",     icon: Package,         section: "Cadastros" },
  { id: "estoque",      label: "Estoque",              href: "/estoque",      icon: Boxes,           section: "Cadastros" },
  { id: "chat",         label: "Assistente IA",        href: "/chat",         icon: Sparkles,        section: "Inteligência", badge: "novo" },
  { id: "relatorios",   label: "Relatórios",           href: "/relatorios",   icon: BarChart2,       section: "Inteligência" },
  { id: "estoque-historico", label: "Histórico de estoque", href: "/estoque/historico", icon: History, section: "Inteligência" },
  { id: "config",       label: "Configurações",        href: "/admin",        icon: Settings,        section: "Administração", adminOnly: true },
];

/** Mapeamento pathname → breadcrumbs para o Topbar */
export const BREADCRUMB_MAP: Record<string, string[]> = {
  "/dashboard":    ["Dashboard"],
  "/requisicoes":  ["Operação", "Requisições"],
  "/cotacoes":     ["Operação", "Cotações"],
  "/pedidos":      ["Operação", "Pedidos de compra"],
  "/estoque/contagem": ["Operação", "Contagem"],
  "/fornecedores": ["Cadastros", "Fornecedores"],
  "/produtos":     ["Cadastros", "Produtos"],
  "/estoque":      ["Cadastros", "Estoque"],
  "/chat":         ["Inteligência", "Assistente IA"],
  "/relatorios":   ["Inteligência", "Relatórios"],
  "/estoque/historico": ["Inteligência", "Histórico de estoque"],
  "/admin":        ["Administração", "Configurações"],
  "/perfil":       ["Conta", "Meu Perfil"],
  "/auditoria":    ["Administração", "Auditoria"],
};
