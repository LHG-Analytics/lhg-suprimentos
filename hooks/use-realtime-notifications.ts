"use client";

/**
 * use-realtime-notifications.ts — LHG-221
 * Hook que escuta mudanças nas tabelas críticas via Supabase Realtime,
 * exibe sonner toasts E armazena a lista de notificações para o painel do sino.
 */

import { useEffect, useState, useCallback } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { toast } from "sonner";
import { CheckCircle2, ShoppingCart, Truck, RefreshCw } from "lucide-react";
import { createElement } from "react";

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface NotificationItem {
  id:          string;
  type:        "success" | "error" | "warning" | "info";
  title:       string;
  description?: string;
  href?:       string;
  createdAt:   Date;
  read:        boolean;
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRealtimeNotifications(): {
  notifications: NotificationItem[];
  unreadCount:   number;
  markAllRead:   () => void;
} {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);

  // Adiciona uma notificação ao painel e dispara o toast
  const push = useCallback(
    (item: Omit<NotificationItem, "id" | "createdAt" | "read">) => {
      const n: NotificationItem = {
        ...item,
        id:        `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        createdAt: new Date(),
        read:      false,
      };
      setNotifications((prev) => [n, ...prev].slice(0, 20));
    },
    [],
  );

  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  }, []);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return;

    const supabase = createBrowserClient(
      url.replace(/^﻿/, ""),
      key.replace(/^﻿/, ""),
    );

    const channel = supabase
      .channel("lhg-shell-notifications")

      // ── Pedidos: mudança de status ─────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "pedidos" },
        (payload) => {
          const novo     = payload.new as { numero: string; status: string };
          const anterior = payload.old as { status: string };
          if (!novo.numero || novo.status === anterior.status) return;

          switch (novo.status) {
            case "enviado":
              push({ type: "success", title: `Pedido ${novo.numero} aprovado`, description: "Aguardando envio ao fornecedor", href: "/pedidos" });
              toast.success(`Pedido ${novo.numero} aprovado`, {
                description: "Aguardando envio ao fornecedor",
                icon: createElement(CheckCircle2, { size: 14, className: "text-emerald-400" }),
              });
              break;
            case "recebido":
              push({ type: "success", title: `Pedido ${novo.numero} recebido`, description: "Mercadoria entregue", href: "/pedidos" });
              toast.success(`Pedido ${novo.numero} recebido`, {
                description: "Mercadoria entregue com sucesso",
                icon: createElement(Truck, { size: 14, className: "text-emerald-400" }),
              });
              break;
            case "cancelado":
              push({ type: "error", title: `Pedido ${novo.numero} rejeitado`, description: "O pedido foi cancelado", href: "/pedidos" });
              toast.error(`Pedido ${novo.numero} rejeitado`, { description: "O pedido foi cancelado" });
              break;
            case "em_transito":
              push({ type: "info", title: `Pedido ${novo.numero} em trânsito`, href: "/pedidos" });
              toast.info(`Pedido ${novo.numero} em trânsito`, {
                icon: createElement(Truck, { size: 14 }),
              });
              break;
          }
        },
      )

      // ── Pedidos: novo pedido aguardando aprovação ──────────────────────
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "pedidos" },
        (payload) => {
          const novo = payload.new as { numero: string; status: string; valor_total: number };
          if (novo.status !== "aguardando_aprovacao") return;

          const valorFmt = novo.valor_total?.toLocaleString("pt-BR", {
            style: "currency", currency: "BRL",
          });

          push({ type: "warning", title: `Pedido ${novo.numero} aguarda aprovação`, description: valorFmt ?? undefined, href: "/pedidos" });
          toast.warning(`Novo pedido para aprovação: ${novo.numero}`, {
            description: valorFmt ? `Valor: ${valorFmt}` : undefined,
            icon: createElement(ShoppingCart, { size: 14, className: "text-amber-400" }),
            duration: 8000,
            action: {
              label: "Ver pedido",
              onClick: () => { window.location.href = "/pedidos"; },
            },
          });
        },
      )

      // ── Cotações: pedidos gerados ──────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cotacoes" },
        (payload) => {
          const novo     = payload.new as { numero: string; titulo: string; status: string };
          const anterior = payload.old as { status: string };
          if (novo.status === anterior.status) return;

          if (novo.status === "aprovado") {
            push({ type: "success", title: `Cotação ${novo.numero} — pedidos gerados`, description: novo.titulo, href: "/pedidos" });
            toast.success(`Cotação ${novo.numero} — pedidos gerados`, {
              description: novo.titulo,
              icon: createElement(CheckCircle2, { size: 14, className: "text-emerald-400" }),
              action: {
                label: "Ver pedidos",
                onClick: () => { window.location.href = "/pedidos"; },
              },
            });
          }
        },
      )

      // ── Cotações: nova cotação ─────────────────────────────────────────
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cotacoes" },
        (payload) => {
          const novo = payload.new as { numero: string; titulo: string };
          push({ type: "info", title: `Nova cotação: ${novo.titulo}`, description: novo.numero, href: "/cotacoes" });
          toast.info(`Nova cotação: ${novo.titulo}`, { description: novo.numero });
        },
      )

      // ── Sync Omie CMC: conclusão (INSERT em integracao_logs) ──────────────────
      // Disparado pelo after() do route handler quando syncCMCProdutos termina.
      // Entrega notificação no sino + toast com link para /produtos.
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "integracao_logs" },
        (payload) => {
          const log = payload.new as {
            entidade: string;
            novos:    number;
            total:    number;
            status:   string;
            detalhe:  { processados?: number } | null;
          };
          if (log.entidade !== "cmc_produtos") return;

          // processados: quantos foram consultados nesta rodada (< total quando
          // o time budget foi atingido antes de varrer todo o catálogo).
          const processados = log.detalhe?.processados ?? log.total;
          const parcial     = processados < log.total;

          // Descrição diferenciada: sync parcial vs completo
          const descricao = parcial
            ? `${log.novos} preço${log.novos !== 1 ? "s" : ""} atualizado${log.novos !== 1 ? "s" : ""} · ${processados}/${log.total} verificados neste sync`
            : log.novos > 0
              ? `${log.novos} de ${log.total} produto${log.total !== 1 ? "s" : ""} com preço de custo atualizado`
              : "Nenhum preço novo — produtos sem movimentação no Omie";

          push({
            type:        "success",
            title:       parcial ? "Sync Omie parcial" : "Sync Omie concluído",
            description: descricao,
            href:        "/produtos",
          });

          toast.success(
            parcial ? "Sync Omie parcial ✓" : "Produtos sincronizados com Omie ✓",
            {
              description: parcial
                ? `${descricao} — sincronize novamente para continuar`
                : descricao,
              duration: 14_000,
              icon:     createElement(RefreshCw, { size: 14, className: "text-emerald-400" }),
              action: {
                label:   parcial ? "Sincronizar mais" : "Ver produtos",
                onClick: () => {
                  window.location.href = parcial ? "/produtos" : "/produtos";
                },
              },
            },
          );
        },
      )

      .subscribe((status, err) => {
        if (status === "SUBSCRIBED") {
          console.info("[realtime] ✅ Canal lhg-shell-notifications conectado");
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.error("[realtime] ❌ Falha na conexão:", status, err);
        } else {
          console.info("[realtime] Status:", status);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [push]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  return { notifications, unreadCount, markAllRead };
}
