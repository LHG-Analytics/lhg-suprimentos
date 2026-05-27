"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface EventoAuditoria {
  id:         string;
  entidade:   "pedido";
  numero:     string;
  tipo:       string;
  texto:      string;
  autor_nome: string | null;
  created_at: string;
  href:       string;
}

export async function buscarEventosAuditoria(limite = 100): Promise<EventoAuditoria[]> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data, error } = await supabase
    .from("pedido_eventos")
    .select(`
      id, tipo, texto, created_at, autor_nome,
      pedidos ( id, numero )
    `)
    .order("created_at", { ascending: false })
    .limit(limite);

  if (error) {
    console.error("[buscarEventosAuditoria]", error.message);
    return [];
  }

  return (data ?? []).map((e) => {
    const pedido = e.pedidos as { id: string; numero: string } | null;
    return {
      id:         e.id,
      entidade:   "pedido" as const,
      numero:     pedido?.numero ?? "—",
      tipo:       e.tipo,
      texto:      e.texto,
      autor_nome: e.autor_nome,
      created_at: e.created_at,
      href:       "/pedidos",
    };
  });
}
