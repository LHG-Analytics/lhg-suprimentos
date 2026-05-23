/**
 * app/login/page.tsx — LHG-201
 * Server Component: verifica sessão e redireciona se já autenticado.
 * Layout split 60/40: painel esquerdo estático + formulário client-side.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/lhg/logo";
import { LoginForm } from "./_components/login-form";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage() {
  // Redireciona para dashboard se já autenticado
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  return (
    <div className="h-screen w-full flex overflow-hidden bg-zinc-950">
      {/* ── Painel esquerdo 60% (oculto abaixo de lg) ─────────────────── */}
      <div className="hidden lg:flex flex-col w-[60%] relative overflow-hidden border-r border-zinc-900">
        {/* Grid de fundo */}
        <div className="absolute inset-0 grid-bg opacity-60" />
        {/* Gradiente sobre o grid */}
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-950 via-zinc-950 to-zinc-900/40" />
        {/* Glows decorativos */}
        <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full bg-lhg-500/10 blur-[120px]" />
        <div className="absolute -bottom-40 -right-32 w-[520px] h-[520px] rounded-full bg-emerald-700/10 blur-[140px]" />

        {/* Logo */}
        <div className="relative z-10 p-10">
          <Logo size="md" />
        </div>

        {/* Conteúdo central */}
        <div className="relative z-10 flex-1 flex flex-col justify-center px-16 max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.15em] text-lhg-400 font-medium mb-5 flex items-center gap-2">
            <span className="w-6 h-px bg-lhg-500" />
            Plataforma de compras inteligentes
          </div>

          <h1 className="text-5xl font-semibold text-zinc-50 leading-[1.05] tracking-tight">
            Cotações que se pagam.
            <br />
            <span className="text-zinc-500">
              Da requisição à NF, em um só lugar.
            </span>
          </h1>

          <p className="mt-6 text-base text-zinc-400 max-w-xl leading-relaxed">
            Centralize pedidos das unidades Lush, compare fornecedores lado a
            lado, deixe a IA sugerir o mix ótimo e lance no Omie sem retrabalho.
          </p>

          {/* Stats strip */}
          <div className="mt-10 grid grid-cols-3 gap-px bg-zinc-800 max-w-xl rounded-lg overflow-hidden border border-zinc-800">
            {[
              { v: "12,8%", l: "economia média / mês" },
              { v: "6",     l: "unidades operando" },
              { v: "< 4h",  l: "do pedido à cotação" },
            ].map((stat) => (
              <div key={stat.l} className="bg-zinc-950 p-4">
                <div className="text-2xl font-mono font-semibold text-zinc-50">
                  {stat.v}
                </div>
                <div className="text-[11px] text-zinc-500 mt-1">{stat.l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Rodapé: versão + ilustração SVG do fluxo */}
        <div className="relative z-10 p-10 flex items-end justify-between">
          <div className="text-[11px] text-zinc-600 font-mono">
            v 0.1 · build 2026.05
          </div>
          <svg
            width="220"
            height="80"
            viewBox="0 0 220 80"
            aria-hidden="true"
            className="text-zinc-700"
          >
            <g stroke="currentColor" strokeWidth="1" fill="none">
              <line
                x1="0" y1="40" x2="220" y2="40"
                strokeDasharray="2 4"
                opacity="0.5"
              />
              <circle cx="20"  cy="40" r="3" fill="currentColor" />
              <circle cx="80"  cy="40" r="3" fill="currentColor" />
              <circle cx="140" cy="40" r="3" fill="#10b981" />
              <circle cx="200" cy="40" r="3" fill="currentColor" />
              <path d="M20 40 Q50 10 80 40" />
              <path d="M80 40 Q110 70 140 40" stroke="#10b981" />
              <path d="M140 40 Q170 10 200 40" />
              <text x="20"  y="62" fontSize="9" fontFamily="Geist Mono, monospace" textAnchor="middle" fill="#52525b">REQ</text>
              <text x="80"  y="62" fontSize="9" fontFamily="Geist Mono, monospace" textAnchor="middle" fill="#52525b">COT</text>
              <text x="140" y="62" fontSize="9" fontFamily="Geist Mono, monospace" textAnchor="middle" fill="#10b981">IA</text>
              <text x="200" y="62" fontSize="9" fontFamily="Geist Mono, monospace" textAnchor="middle" fill="#52525b">PED</text>
            </g>
          </svg>
        </div>
      </div>

      {/* ── Painel direito 40% ─────────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center p-8 lg:p-0">
        <LoginForm />
      </div>
    </div>
  );
}
