"use client";

/**
 * app/login/_components/login-card.tsx
 * Nova tela de login: 3D Marquee como fundo + card Google centralizado.
 *
 * Imagens do marquee → public/unidades/  (ver README abaixo)
 * Para adicionar mais fotos, expanda cada array de unidade abaixo.
 */

import { useSearchParams, unstable_rethrow } from "next/navigation";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert } from "lucide-react";
import { Logo } from "@/components/lhg/logo";
import { ThreeDMarquee } from "@/components/ui/3d-marquee";
import { signInWithGoogle } from "../actions";

// ── Logos das unidades para o marquee ──────────────────────────────────────────
// 5 logos repetidas em ordem embaralhada para preencher as 4 colunas do efeito 3D.
// Para trocar/adicionar: coloque novos arquivos em public/unidades/ e inclua aqui.
const BASE_LOGOS = [
  "/logo-supplies.webp",      // LHG Suprimentos
  "/unidades/lush.webp",      // Lush Ipiranga / Lapa
  "/unidades/adc.webp",       // Andar de Cima
  "/unidades/altana.webp",    // Altana
  "/unidades/tout.webp",      // Tout
];

// Repete e embaralha para ~40 itens (4 colunas × ~10 cards cada)
const MARQUEE_IMAGES = [
  ...BASE_LOGOS,                                    //  0–4
  ...BASE_LOGOS.slice(2),                           //  5–7
  ...BASE_LOGOS.slice(1),                           //  8–12
  ...BASE_LOGOS,                                    // 13–17
  ...BASE_LOGOS.slice(0, 3),                        // 18–20
  ...BASE_LOGOS.slice(3),                           // 21–22
  ...BASE_LOGOS,                                    // 23–27
  ...BASE_LOGOS.slice(1, 4),                        // 28–30
  ...BASE_LOGOS.slice(2),                           // 31–33
  ...BASE_LOGOS,                                    // 34–38
  ...BASE_LOGOS.slice(0, 2),                        // 39–40
];

// ── Mensagens de erro ──────────────────────────────────────────────────────────
const ERROR_MESSAGES: Record<string, string> = {
  not_invited: "Seu email não está na lista de acesso. Solicite um convite ao administrador.",
  auth_failed:  "Falha na autenticação. Tente novamente.",
  missing_code: "Link inválido ou expirado.",
};

// ── Ícone Google ───────────────────────────────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

// ── Componente principal ───────────────────────────────────────────────────────
export function LoginCard() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const errorMsg = errorKey ? (ERROR_MESSAGES[errorKey] ?? "Erro inesperado.") : null;

  const [isPending, startTransition] = useTransition();

  function handleGoogleSignIn() {
    startTransition(async () => {
      try {
        await signInWithGoogle();
      } catch (err) {
        // unstable_rethrow repassa NEXT_REDIRECT e NEXT_NOT_FOUND para o framework
        unstable_rethrow(err);
        toast.error(err instanceof Error ? err.message : "Erro ao autenticar com Google.");
      }
    });
  }

  return (
    <div className="relative h-screen w-full overflow-hidden bg-zinc-950">

      {/* ── Background: 3D Marquee — cobre 100% da viewport ─────────────── */}
      <div className="absolute inset-0">
        <ThreeDMarquee images={MARQUEE_IMAGES} speed={0.9} />
      </div>

      {/* ── Overlay: escurece as bordas, deixa o centro mais translúcido ──── */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse 55% 60% at 50% 50%, rgba(9,9,11,0.70) 0%, rgba(9,9,11,0.55) 50%, rgba(9,9,11,0.80) 100%)",
        }}
      />

      {/* ── Card centralizado ──────────────────────────────────────────────── */}
      <div className="relative z-10 flex h-full items-center justify-center p-4">
        <div className="w-full max-w-[360px] rounded-2xl border border-zinc-800/60 bg-zinc-950/80 backdrop-blur-xl shadow-2xl px-8 py-9">

          {/* Logo */}
          <div className="flex justify-center mb-7">
            <Logo size="2xl" />
          </div>

          {/* Texto */}
          <div className="text-center mb-7">
            <h1 className="text-base font-semibold text-zinc-100 leading-snug">
              Plataforma de Suprimentos
            </h1>
            <p className="text-xs text-zinc-500 mt-1.5 leading-snug">
              Acesso restrito a colaboradores do Grupo LHG.
            </p>
          </div>

          {/* Banner de erro */}
          {errorMsg && (
            <div className="flex items-start gap-2.5 rounded-lg border border-red-500/25 bg-red-500/10 px-3.5 py-3 mb-5">
              <ShieldAlert size={14} className="text-red-400 shrink-0 mt-0.5" />
              <p className="text-xs text-red-300 leading-snug">{errorMsg}</p>
            </div>
          )}

          {/* Botão Google */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isPending}
            className="w-full h-11 rounded-xl bg-white hover:bg-zinc-100 disabled:bg-zinc-200 text-zinc-900 font-medium flex items-center justify-center gap-2.5 transition-colors shadow-sm text-sm cursor-pointer"
          >
            {isPending ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
            ) : (
              <GoogleIcon />
            )}
            {isPending ? "Autenticando…" : "Entrar com Google"}
          </button>

          {/* Footer */}
          <div className="mt-7 pt-5 border-t border-zinc-800/60 flex items-center justify-between">
            <a
              href="mailto:suporte@lhgmoteis.com.br"
              className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors"
            >
              Suporte
            </a>
            <div className="flex items-center gap-3">
              <Link href="/politica-privacidade" className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">
                Privacidade
              </Link>
              <span className="text-zinc-800">·</span>
              <Link href="/termos-uso" className="text-[11px] text-zinc-600 hover:text-zinc-400 transition-colors">
                Termos
              </Link>
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
