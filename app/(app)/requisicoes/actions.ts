"use server";

/**
 * actions.ts — LHG-209
 * Server Actions para o módulo de Requisições.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

// ── Schemas ───────────────────────────────────────────────────────────────────

const ItemSchema = z.object({
  produto_id:  z.string().uuid(),
  quantidade:  z.number().positive("Quantidade deve ser maior que zero"),
  observacao:  z.string().optional(),
});

const NovaRequisicaoSchema = z.object({
  titulo:       z.string().min(3, "Título obrigatório (mínimo 3 caracteres)"),
  urgencia:     z.enum(["normal", "urgente"]),
  justificativa: z.string().optional(),
  unidade_ids:  z.array(z.string().uuid()).min(1, "Selecione ao menos uma unidade"),
  itens:        z.array(ItemSchema).min(1, "Adicione ao menos um item"),
});

export type NovaRequisicaoInput = z.infer<typeof NovaRequisicaoSchema>;

// ── criarRequisicao ───────────────────────────────────────────────────────────

export async function criarRequisicao(input: NovaRequisicaoInput) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Validar
  const parsed = NovaRequisicaoSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Dados inválidos");
  }

  const { titulo, urgencia, justificativa, unidade_ids, itens } = parsed.data;

  // ── Gerar número sequencial ─────────────────────────────────────────────────
  const year = new Date().getFullYear();
  const { data: lastReq } = await supabase
    .from("requisicoes")
    .select("numero")
    .like("numero", `REQ-${year}-%`)
    .order("numero", { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastNum = lastReq
    ? parseInt(lastReq.numero.split("-")[2] ?? "0", 10)
    : 0;
  const numero = `REQ-${year}-${String(lastNum + 1).padStart(4, "0")}`;

  // ── Inserir requisição ──────────────────────────────────────────────────────
  const { data: req, error: reqErr } = await supabase
    .from("requisicoes")
    .insert({
      numero,
      titulo,
      urgencia,
      justificativa: justificativa || null,
      solicitante_id: user.id,
      status: "rascunho",
    })
    .select()
    .single();

  if (reqErr || !req) {
    throw new Error(reqErr?.message ?? "Erro ao criar requisição");
  }

  // ── Inserir unidades ────────────────────────────────────────────────────────
  const { error: unErr } = await supabase
    .from("requisicao_unidades")
    .insert(
      unidade_ids.map((uid) => ({
        requisicao_id: req.id,
        unidade_id:    uid,
      })),
    );

  if (unErr) {
    console.error("[criarRequisicao] unidades:", unErr.message);
  }

  // ── Inserir itens ───────────────────────────────────────────────────────────
  const { error: itErr } = await supabase
    .from("requisicao_itens")
    .insert(
      itens.map((item) => ({
        requisicao_id: req.id,
        produto_id:    item.produto_id,
        quantidade:    item.quantidade,
        observacao:    item.observacao || null,
      })),
    );

  if (itErr) {
    console.error("[criarRequisicao] itens:", itErr.message);
  }

  revalidatePath("/requisicoes");
  return { id: req.id, numero: req.numero };
}

// ── deletarRequisicao ─────────────────────────────────────────────────────────

export async function deletarRequisicao(id: string) {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  // Verifica se existe e se pode ser excluída
  const { data: req, error: fetchErr } = await supabase
    .from("requisicoes")
    .select("id, status, numero")
    .eq("id", id)
    .single();

  if (fetchErr || !req) throw new Error("Requisição não encontrada");

  if (req.status === "aprovado") {
    throw new Error("Não é possível excluir uma requisição já aprovada.");
  }

  // Remove filhos antes (por segurança, caso não haja CASCADE no banco)
  await supabase.from("requisicao_itens").delete().eq("requisicao_id", id);
  await supabase.from("requisicao_unidades").delete().eq("requisicao_id", id);

  const { error } = await supabase.from("requisicoes").delete().eq("id", id);
  if (error) throw new Error(error.message);

  revalidatePath("/requisicoes");
  return { numero: req.numero };
}
