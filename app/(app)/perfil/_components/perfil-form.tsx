"use client";

/**
 * perfil-form.tsx — LHG-230
 * Formulário de edição de perfil: nome + avatar.
 * Upload de avatar direto para Supabase Storage (bucket: avatars/{uid}/avatar.{ext})
 * via browser client, depois atualiza user_profiles via Server Action.
 */
import { useState, useRef, useTransition } from "react";
import { Camera, CheckCircle2, AlertCircle, Loader2, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { atualizarPerfil } from "../actions";

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface PerfilFormProps {
  userId:    string;
  nome:      string;
  email:     string;
  role:      string;
  avatarUrl: string | null;
}

const ROLE_LABELS: Record<string, string> = {
  solicitante: "Solicitante",
  comprador:   "Comprador",
  aprovador:   "Aprovador",
  admin:       "Administrador",
};

// ── Componente ────────────────────────────────────────────────────────────────

export function PerfilForm({ userId, nome, email, role, avatarUrl }: PerfilFormProps) {
  const [nomeState,   setNome]      = useState(nome);
  const [avatarState, setAvatar]    = useState<string | null>(avatarUrl);
  const [uploading,   setUploading] = useState(false);
  const [sucesso,     setSucesso]   = useState(false);
  const [erro,        setErro]      = useState<string | null>(null);
  const [pending,     startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const initials = nomeState
    .split(" ").slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");

  // ── Upload de avatar ──────────────────────────────────────────────────────

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErro("A imagem deve ter no máximo 5 MB.");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "jpg";
    const path = `${userId}/avatar.${ext}`;

    setUploading(true);
    setErro(null);

    try {
      const supabase = createClient();

      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) throw new Error(uploadError.message);

      const { data: { publicUrl } } = supabase.storage
        .from("avatars")
        .getPublicUrl(path);

      // Cache-bust com timestamp
      setAvatar(`${publicUrl}?t=${Date.now()}`);
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro ao fazer upload.");
    } finally {
      setUploading(false);
      // Limpar input para permitir re-selecionar o mesmo arquivo
      e.target.value = "";
    }
  }

  // ── Salvar perfil ─────────────────────────────────────────────────────────

  function handleSalvar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setSucesso(false);

    startTransition(async () => {
      const res = await atualizarPerfil({ nome: nomeState, avatarUrl: avatarState });
      if ("erro" in res) {
        setErro(res.erro);
      } else {
        setSucesso(true);
        setTimeout(() => setSucesso(false), 3000);
      }
    });
  }

  const isBusy = uploading || pending;

  return (
    <div className="max-w-[640px] mx-auto space-y-6 pb-8">

      {/* Header */}
      <div>
        <h1 className="text-xl font-semibold text-foreground leading-tight">Meu Perfil</h1>
        <p className="text-[13px] text-muted-foreground mt-0.5">
          Atualize seu nome e foto exibidos no sistema
        </p>
      </div>

      <form onSubmit={handleSalvar} className="space-y-6">

        {/* Feedback */}
        {sucesso && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-2.5">
            <CheckCircle2 size={14} className="text-emerald-400 shrink-0" />
            <span className="text-[12px] text-emerald-400 font-medium">Perfil atualizado com sucesso!</span>
          </div>
        )}
        {erro && (
          <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5">
            <AlertCircle size={14} className="text-red-400 shrink-0 mt-0.5" />
            <span className="text-[12px] text-red-400">{erro}</span>
          </div>
        )}

        {/* Avatar */}
        <div className="rounded-xl border border-border/80 bg-muted/40 px-6 py-5">
          <div className="text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground mb-4">
            Foto de perfil
          </div>

          <div className="flex items-center gap-5">
            {/* Preview */}
            <div className="relative group">
              <div className="w-20 h-20 rounded-full overflow-hidden bg-lhg-700 flex items-center justify-center">
                {uploading ? (
                  <Loader2 size={24} className="text-white animate-spin" />
                ) : avatarState ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarState}
                    alt="Avatar"
                    className="w-full h-full object-cover"
                  />
                ) : initials ? (
                  <span className="text-white font-mono font-semibold text-2xl">{initials}</span>
                ) : (
                  <User size={28} className="text-white/60" />
                )}
              </div>

              {/* Overlay de clique */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isBusy}
                className={cn(
                  "absolute inset-0 rounded-full flex items-center justify-center",
                  "bg-black/0 group-hover:bg-black/40 transition-colors",
                  "text-transparent group-hover:text-white",
                  "disabled:cursor-not-allowed",
                )}
                title="Alterar foto"
              >
                <Camera size={18} />
              </button>

              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
                disabled={isBusy}
              />
            </div>

            <div className="space-y-1">
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={isBusy}
                className={cn(
                  "text-sm font-medium text-foreground hover:text-muted-foreground transition-colors",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {uploading ? "Fazendo upload…" : "Alterar foto"}
              </button>
              <p className="text-[11px] text-muted-foreground/60">
                JPG, PNG ou WebP · Máximo 5 MB
              </p>
              {avatarState && !uploading && (
                <button
                  type="button"
                  onClick={() => setAvatar(null)}
                  className="text-[11px] text-red-400/70 hover:text-red-400 transition-colors"
                >
                  Remover foto
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Informações */}
        <div className="rounded-xl border border-border/80 bg-muted/40 px-6 py-5 space-y-4">
          <div className="text-[11px] uppercase tracking-[0.12em] font-medium text-muted-foreground">
            Informações
          </div>

          {/* Nome */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
              Nome
            </label>
            <input
              type="text"
              required
              value={nomeState}
              onChange={e => setNome(e.target.value)}
              placeholder="Seu nome completo"
              className={cn(
                "w-full rounded-lg border border-border bg-muted/60 px-3 py-2.5",
                "text-sm text-foreground placeholder:text-muted-foreground/50",
                "focus:outline-none focus:ring-1 focus:ring-border transition-colors",
              )}
            />
            <p className="text-[11px] text-muted-foreground/60">
              Este nome será usado pela IA ao conversar com você.
            </p>
          </div>

          {/* Email — somente leitura (Google OAuth) */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
              E-mail
            </label>
            <input
              type="email"
              value={email}
              disabled
              className={cn(
                "w-full rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5",
                "text-sm text-muted-foreground cursor-not-allowed",
              )}
            />
            <p className="text-[11px] text-muted-foreground/60">
              Vinculado à sua conta Google — não pode ser alterado aqui.
            </p>
          </div>

          {/* Perfil de acesso — somente leitura */}
          <div className="space-y-1.5">
            <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
              Perfil de acesso
            </label>
            <input
              type="text"
              value={ROLE_LABELS[role] ?? role}
              disabled
              className={cn(
                "w-full rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5",
                "text-sm text-muted-foreground cursor-not-allowed capitalize",
              )}
            />
            <p className="text-[11px] text-muted-foreground/60">
              Alterado pelo administrador do sistema.
            </p>
          </div>
        </div>

        {/* Botão salvar */}
        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isBusy || !nomeState.trim()}
            className={cn(
              "px-6 py-2.5 rounded-lg text-sm font-medium transition-colors",
              "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30",
              "disabled:opacity-50 disabled:cursor-not-allowed",
            )}
          >
            {pending ? (
              <span className="flex items-center gap-2">
                <Loader2 size={14} className="animate-spin" />
                Salvando…
              </span>
            ) : "Salvar alterações"}
          </button>
        </div>
      </form>
    </div>
  );
}
