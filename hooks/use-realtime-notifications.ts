"use client";

/**
 * use-realtime-notifications.ts — LHG-221
 * Hook que escuta mudanças nas tabelas críticas via Supabase Realtime
 * e exibe sonner toasts globais no shell.
 *
 * Eventos monitorados:
 *   • pedidos  UPDATE → mudança de status (aprovado, recebido, cancelado)
 *   • pedidos  INSERT → novo pedido aguardando aprovação
 *   • cotacoes UPDATE → cotação aprovada (pedidos gerados)
 *   • cotacoes INSERT → nova cotação criada
 */

import { useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { toast } from "sonner";
import { CheckCircle2, XCircle, ShoppingCart, Truck, Loader2 } from "lucide-react";
import { createElement } from "react";

// ── Labels de status ─────────────────────────────────────────────────────────

const PEDIDO_STATUS_LABEL: Record<string, string> = {
  enviado:             "aprovado e enviado",
  em_transito:         "em trânsito",
  recebido:            "recebido",
  finalizado:          "finalizado",
  cancelado:           "rejeitado",
  aguardando_aprovacao: "aguardando aprovação",
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useRealtimeNotifications() {
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
              toast.success(`Pedido ${novo.numero} aprovado`, {
                description: "Aguardando envio ao fornecedor",
                icon: createElement(CheckCircle2, { size: 14, className: "text-emerald-400" }),
              });
              break;
            case "recebido":
              toast.success(`Pedido ${novo.numero} recebido`, {
                description: "Mercadoria entregue com sucesso",
                icon: createElement(Truck, { size: 14, className: "text-emerald-400" }),
              });
              break;
            case "cancelado":
              toast.error(`Pedido ${novo.numero} rejeitado`, {
                description: "O pedido foi cancelado",
              });
              break;
            case "em_transito":
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

      // ── Cotações: pedidos gerados (status → aprovado) ──────────────────
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "cotacoes" },
        (payload) => {
          const novo     = payload.new as { numero: string; titulo: string; status: string };
          const anterior = payload.old as { status: string };

          if (novo.status === anterior.status) return;

          if (novo.status === "aprovado") {
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

      // ── Cotações: nova cotação criada ──────────────────────────────────
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "cotacoes" },
        (payload) => {
          const novo = payload.new as { numero: string; titulo: string };
          toast.info(`Nova cotação: ${novo.titulo}`, {
            description: novo.numero,
          });
        },
      )

      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);
}
