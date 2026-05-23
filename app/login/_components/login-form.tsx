"use client";

import { useState, useTransition } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowRight, Loader2, ShieldAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { sendMagicLink, signInWithGoogle } from "../actions";

// ─── Ícone oficial do Google (colorido) ───────────────────────────────────────
function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

// ─── Estado pós-envio de magic link ──────────────────────────────────────────
function MagicLinkSent({
  email,
  onResend,
  resendCooldown,
}: {
  email: string;
  onResend: () => void;
  resendCooldown: number;
}) {
  return (
    <div className="text-center space-y-4 py-4">
      <div className="w-12 h-12 rounded-full bg-lhg-500/10 flex items-center justify-center mx-auto">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className="text-lhg-500"
        >
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.1a19.79 19.79 0 01-3.07-8.67A2 2 0 012 .18h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.09 7.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-zinc-100">Verifique seu email</p>
        <p className="text-xs text-zinc-500 mt-1">
          Enviamos um link para{" "}
          <span className="text-zinc-300 font-mono">{email}</span>
        </p>
      </div>
      <p className="text-xs text-zinc-600">
        Não encontrou? Cheque a pasta de spam.
      </p>
      <button
        onClick={onResend}
        disabled={resendCooldown > 0}
        className="text-xs text-zinc-400 hover:text-zinc-200 disabled:text-zinc-700 disabled:cursor-not-allowed transition-colors"
      >
        {resendCooldown > 0
          ? `Reenviar em ${resendCooldown}s`
          : "Reenviar link"}
      </button>
    </div>
  );
}

// ─── Mapa de mensagens de erro por query param ────────────────────────────────
const ERROR_MESSAGES: Record<string, string> = {
  not_invited: "Seu email não está na lista de acesso. Solicite um convite ao administrador.",
  auth_failed:  "Falha na autenticação. Tente novamente.",
  missing_code: "Link inválido ou expirado. Solicite um novo.",
};

// ─── Componente principal ──────────────────────────────────────────────────────
export function LoginForm() {
  const searchParams = useSearchParams();
  const errorKey = searchParams.get("error");
  const errorMsg = errorKey ? ERROR_MESSAGES[errorKey] ?? "Erro inesperado. Tente novamente." : null;

  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [isPendingMagic, startMagicTransition] = useTransition();
  const [isPendingGoogle, startGoogleTransition] = useTransition();

  const isValidEmail = email.includes("@") && email.includes(".");

  function startCooldown() {
    setResendCooldown(30);
    const interval = setInterval(() => {
      setResendCooldown((n) => {
        if (n <= 1) {
          clearInterval(interval);
          return 0;
        }
        return n - 1;
      });
    }, 1000);
  }

  function handleSendMagicLink() {
    startMagicTransition(async () => {
      try {
        await sendMagicLink(email);
        setSent(true);
        startCooldown();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao enviar magic link.");
      }
    });
  }

  function handleResend() {
    setSent(false);
    // Reabre o form para digitar novamente ou envia imediatamente
    if (isValidEmail) {
      handleSendMagicLink();
    }
  }

  function handleGoogleSignIn() {
    startGoogleTransition(async () => {
      try {
        await signInWithGoogle();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Erro ao autenticar com Google.");
      }
    });
  }

  return (
    <div className="w-full max-w-[400px]">
      {/* Logo — só visível em mobile (lg oculta o painel esquerdo) */}
      <div className="lg:hidden mb-8 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-md bg-lhg-500 text-zinc-950 flex items-center justify-center font-mono font-bold text-sm select-none">
          L
        </div>
        <span className="text-zinc-100 font-medium tracking-tight">
          LHG <span className="text-zinc-500">Suprimentos</span>
        </span>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight text-zinc-50">
        Entrar
      </h2>
      <p className="mt-1.5 text-sm text-zinc-500">
        Acesso restrito a colaboradores LHG.
      </p>

      {/* Banner de erro do callback (not_invited, auth_failed, etc.) */}
      {errorMsg && (
        <div className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3">
          <ShieldAlert size={15} className="text-red-400 shrink-0 mt-0.5" />
          <p className="text-xs text-red-300 leading-snug">{errorMsg}</p>
        </div>
      )}

      {sent ? (
        <div className="mt-8">
          <MagicLinkSent
            email={email}
            onResend={handleResend}
            resendCooldown={resendCooldown}
          />
        </div>
      ) : (
        <>
          {/* Botão Google */}
          <button
            onClick={handleGoogleSignIn}
            disabled={isPendingGoogle}
            className="mt-8 w-full h-11 rounded-lg bg-white hover:bg-zinc-100 disabled:bg-zinc-200 text-zinc-900 font-medium flex items-center justify-center gap-2.5 transition-colors shadow-sm text-sm cursor-pointer"
          >
            {isPendingGoogle ? (
              <Loader2 className="w-4 h-4 animate-spin text-zinc-500" />
            ) : (
              <GoogleIcon />
            )}
            Continuar com Google
          </button>

          {/* Divisor */}
          <div className="my-6 flex items-center gap-3 text-[11px] text-zinc-600 uppercase tracking-wider">
            <div className="flex-1 h-px bg-zinc-800" />
            ou
            <div className="flex-1 h-px bg-zinc-800" />
          </div>

          {/* Magic Link */}
          <label className="block text-xs text-zinc-400 mb-1.5">
            Email corporativo
          </label>
          <Input
            type="email"
            placeholder="seu.nome@lhgmoteis.com.br"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && isValidEmail) handleSendMagicLink();
            }}
            className="h-11 bg-zinc-900 border-zinc-800 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-lhg-500/50 focus-visible:border-lhg-500/50"
          />
          <button
            onClick={handleSendMagicLink}
            disabled={!isValidEmail || isPendingMagic}
            className="mt-3 w-full h-10 rounded-lg bg-lhg-500 hover:bg-lhg-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-medium text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            {isPendingMagic ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Enviando link…
              </>
            ) : (
              <>
                Enviar magic link
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </>
      )}

      {/* Footer */}
      <div className="mt-10 pt-6 border-t border-zinc-900 flex items-center justify-between">
        <a
          href="mailto:suporte@lhgmoteis.com.br"
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          Suporte
        </a>
        <div className="flex items-center gap-3">
          <Link
            href="/politica-privacidade"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Privacidade
          </Link>
          <span className="text-zinc-800">·</span>
          <Link
            href="/termos-uso"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            Termos
          </Link>
        </div>
        <span className="flex items-center gap-1.5 text-xs text-zinc-500">
          Status
          <span className="w-1.5 h-1.5 rounded-full bg-lhg-500 status-dot" />
        </span>
      </div>
    </div>
  );
}
