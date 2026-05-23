import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { format, formatDistanceToNow } from "date-fns"
import { ptBR } from "date-fns/locale"

// ─── Tailwind class merge ──────────────────────────────────────────────────
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ─── Currency ─────────────────────────────────────────────────────────────
/**
 * Formata um número como moeda BRL.
 * @example formatBRL(1234.5) // "R$ 1.234,50"
 */
export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

// ─── Percentage ───────────────────────────────────────────────────────────
/**
 * Formata um número como percentual.
 * @example formatPercent(0.1234) // "12,34%"
 */
export function formatPercent(value: number, decimals = 2): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "percent",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

// ─── Date ─────────────────────────────────────────────────────────────────
/**
 * Formata uma data no padrão brasileiro.
 * @example formatDate(new Date()) // "22/05/2026"
 * @example formatDate(new Date(), "dd MMM yyyy") // "22 mai. 2026"
 */
export function formatDate(
  date: Date | string | number,
  pattern = "dd/MM/yyyy"
): string {
  return format(new Date(date), pattern, { locale: ptBR })
}

/**
 * Retorna tempo relativo em português.
 * @example formatRelativeTime(new Date()) // "há menos de um minuto"
 */
export function formatRelativeTime(date: Date | string | number): string {
  return formatDistanceToNow(new Date(date), {
    locale: ptBR,
    addSuffix: true,
  })
}

// ─── String ───────────────────────────────────────────────────────────────
/**
 * Trunca uma string e adiciona reticências se necessário.
 * @example truncate("Produto com nome muito longo", 20) // "Produto com nome mui…"
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str
  return str.slice(0, maxLength - 1) + "…"
}
