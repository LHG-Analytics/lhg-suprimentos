/**
 * app/login/page.tsx
 * Server Component: verifica sessão e redireciona se já autenticado.
 * Renderiza o LoginCard com 3D Marquee de fundo.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginCard } from "./_components/login-card";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  // Redireciona para dashboard se já autenticado
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return <LoginCard />;
}
