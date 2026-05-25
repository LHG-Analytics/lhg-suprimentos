"use client";

/**
 * admin-client.tsx — LHG-230
 * Interface de administração: usuários + convites.
 */
import { useState, useTransition } from "react";
import {
  Users, Mail, Plus, Trash2, Shield, Copy, Check,
  ChevronDown, AlertCircle, CheckCircle2, Clock, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  criarConvite, revogarConvite, alterarRoleUsuario, removerUsuario,
} from "../actions";

// ── Tipos ─────────────────────────────────────────────────────────────────────

type Role = "solicitante" | "comprador" | "aprovador" | "admin";

interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: string;
  created_at: string;
  avatar_url: string | null;
}

interface Convite {
  id: string;
  email: string;
  role: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
}

interface AdminClientProps {
  usuarios: Usuario[];
  convites: Convite[];
  myUserId: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ROLES: { value: Role; label: string; color: string }[] = [
  { value: "solicitante", label: "Solicitante",  color: "text-muted-foreground" },
  { value: "comprador",   label: "Comprador",    color: "text-sky-400" },
  { value: "aprovador",   label: "Aprovador",    color: "text-violet-400" },
  { value: "admin",       label: "Admin",        color: "text-amber-400" },
];

function roleCor(role: string) {
  return ROLES.find(r => r.value === role)?.color ?? "text-muted-foreground";
}

function roleLabel(role: string) {
  return ROLES.find(r => r.value === role)?.label ?? role;
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const d    = Math.floor(diff / 86_400_000);
  const h    = Math.floor(diff / 3_600_000);
  if (d > 0) return `${d}d atrás`;
  if (h > 0) return `${h}h atrás`;
  return "agora";
}

function isExpired(isoExpires: string) {
  return new Date(isoExpires) < new Date();
}

// ── Linha de usuário ──────────────────────────────────────────────────────────

function UsuarioRow({
  usuario,
  isMe,
  onRoleChange,
  onRemove,
}: {
  usuario: Usuario;
  isMe: boolean;
  onRoleChange: (userId: string, role: Role) => void;
  onRemove: (userId: string) => void;
}) {
  const initials = usuario.nome
    .split(" ").slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <li className="grid grid-cols-[2fr_1fr_1fr_80px] gap-4 px-5 py-4 items-center hover:bg-muted/30 transition-colors">
      {/* Usuário */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="w-8 h-8 rounded-full bg-lhg-700 text-white flex items-center justify-center font-mono text-xs font-semibold shrink-0 select-none">
          {usuario.avatar_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={usuario.avatar_url} alt={usuario.nome} className="w-full h-full rounded-full object-cover" />
          ) : initials}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-medium text-foreground truncate leading-tight">
            {usuario.nome}
            {isMe && <span className="ml-2 text-[10px] text-muted-foreground/60">(você)</span>}
          </div>
          <div className="text-[11px] text-muted-foreground truncate">{usuario.email}</div>
        </div>
      </div>

      {/* Role */}
      <div>
        {isMe ? (
          <span className={cn("text-sm font-medium capitalize", roleCor(usuario.role))}>
            {roleLabel(usuario.role)}
          </span>
        ) : (
          <RoleSelect value={usuario.role as Role} onChange={r => onRoleChange(usuario.id, r)} />
        )}
      </div>

      {/* Membro desde */}
      <div className="text-[12px] text-muted-foreground font-mono">
        {relativeTime(usuario.created_at)}
      </div>

      {/* Ações */}
      <div className="flex justify-end">
        {!isMe && (
          <button
            onClick={() => onRemove(usuario.id)}
            className="p-1.5 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Remover usuário"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </li>
  );
}

// ── Select de role ────────────────────────────────────────────────────────────

function RoleSelect({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="relative inline-block">
      <select
        value={value}
        onChange={e => onChange(e.target.value as Role)}
        className={cn(
          "text-sm bg-transparent border-0 pr-5 appearance-none cursor-pointer focus:outline-none",
          roleCor(value),
        )}
      >
        {ROLES.map(r => (
          <option key={r.value} value={r.value}>{r.label}</option>
        ))}
      </select>
      <ChevronDown size={11} className="absolute right-0 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
    </div>
  );
}

// ── Linha de convite ──────────────────────────────────────────────────────────

function ConviteRow({
  convite,
  onRevogar,
}: {
  convite: Convite;
  onRevogar: (id: string) => void;
}) {
  const usado     = !!convite.used_at;
  const expirado  = !usado && isExpired(convite.expires_at);

  return (
    <li className="grid grid-cols-[2fr_1fr_1fr_80px] gap-4 px-5 py-4 items-center hover:bg-muted/30 transition-colors">
      {/* Email */}
      <div className="flex items-center gap-2 min-w-0">
        <Mail size={13} className="text-muted-foreground/60 shrink-0" />
        <span className="text-sm text-foreground truncate">{convite.email}</span>
      </div>

      {/* Role */}
      <div>
        <span className={cn("text-sm font-medium capitalize", roleCor(convite.role))}>
          {roleLabel(convite.role)}
        </span>
      </div>

      {/* Status */}
      <div className="flex items-center gap-1.5">
        {usado ? (
          <>
            <CheckCircle2 size={11} className="text-emerald-400 shrink-0" />
            <span className="text-[11px] text-emerald-400">Aceito</span>
          </>
        ) : expirado ? (
          <>
            <AlertCircle size={11} className="text-red-400 shrink-0" />
            <span className="text-[11px] text-red-400">Expirado</span>
          </>
        ) : (
          <>
            <Clock size={11} className="text-amber-400 shrink-0" />
            <span className="text-[11px] text-amber-400">Pendente</span>
          </>
        )}
      </div>

      {/* Ações */}
      <div className="flex justify-end">
        {!usado && (
          <button
            onClick={() => onRevogar(convite.id)}
            className="p-1.5 rounded text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-colors"
            title="Revogar convite"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </li>
  );
}

// ── Modal de convite ──────────────────────────────────────────────────────────

function ConviteModal({ onClose }: { onClose: () => void }) {
  const [email, setEmail]   = useState("");
  const [role, setRole]     = useState<Role>("comprador");
  const [result, setResult] = useState<{ link: string; emailEnviado: boolean } | null>(null);
  const [erro, setErro]     = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setErro(null);

    startTransition(async () => {
      const res = await criarConvite(email.trim(), role);
      if ("erro" in res) {
        setErro(res.erro);
      } else {
        setResult({ link: res.link, emailEnviado: res.emailEnviado });
      }
    });
  }

  function handleCopy() {
    if (result) {
      navigator.clipboard.writeText(result.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md bg-background border border-border rounded-2xl shadow-2xl">
        <div className="px-6 py-5 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">Convidar usuário</h2>
          <p className="text-[12px] text-muted-foreground mt-0.5">
            O convite é vinculado ao e-mail da conta Google.
          </p>
        </div>

        {!result ? (
          <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
            {erro && (
              <div className="flex items-start gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2.5">
                <AlertCircle size={13} className="text-red-400 shrink-0 mt-0.5" />
                <p className="text-[12px] text-red-400">{erro}</p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                E-mail
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="usuario@lushmotel.com.br"
                className={cn(
                  "w-full rounded-lg border border-border bg-muted/60 px-3 py-2.5",
                  "text-sm text-foreground placeholder:text-muted-foreground/50",
                  "focus:outline-none focus:ring-1 focus:ring-border transition-colors",
                )}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                Perfil de acesso
              </label>
              <select
                value={role}
                onChange={e => setRole(e.target.value as Role)}
                className={cn(
                  "w-full rounded-lg border border-border bg-muted/60 px-3 py-2.5",
                  "text-sm text-foreground focus:outline-none transition-colors",
                )}
              >
                {ROLES.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
              <p className="text-[11px] text-muted-foreground/60">
                {role === "solicitante" && "Pode criar requisições e registrar NFs da própria unidade."}
                {role === "comprador"   && "Acesso completo a cotações, pedidos e sincronização com Omie."}
                {role === "aprovador"   && "Acesso completo a cotações, pedidos e sincronização com Omie."}
                {role === "admin"       && "Acesso total, incluindo configurações e gestão de usuários."}
              </p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted/60 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending || !email.trim()}
                className={cn(
                  "flex-1 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors",
                  "bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30",
                  "disabled:opacity-50 disabled:cursor-not-allowed",
                )}
              >
                {pending ? "Enviando…" : "Enviar convite"}
              </button>
            </div>
          </form>
        ) : (
          <div className="px-6 py-5 space-y-4">
            <div className="flex items-start gap-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-4 py-3">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-emerald-400">Convite criado!</p>
                {result.emailEnviado ? (
                  <p className="text-[12px] text-emerald-400/70 mt-0.5">
                    E-mail enviado para <strong>{email}</strong>.
                  </p>
                ) : (
                  <p className="text-[12px] text-emerald-400/70 mt-0.5">
                    Resend não configurado — compartilhe o link abaixo manualmente.
                  </p>
                )}
              </div>
            </div>

            {!result.emailEnviado && (
              <div className="space-y-1.5">
                <label className="text-[11px] uppercase tracking-widest text-muted-foreground font-medium">
                  Link de acesso
                </label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 rounded-lg border border-border bg-muted/40 px-3 py-2 text-[12px] text-muted-foreground font-mono truncate">
                    {result.link}
                  </div>
                  <button
                    onClick={handleCopy}
                    className="p-2 rounded-lg border border-border bg-muted/40 hover:bg-muted/60 transition-colors"
                  >
                    {copied
                      ? <Check size={14} className="text-emerald-400" />
                      : <Copy size={14} className="text-muted-foreground" />
                    }
                  </button>
                </div>
                <p className="text-[11px] text-muted-foreground/60">
                  Instrua o usuário a acessar com a conta Google do e-mail <strong className="text-muted-foreground">{email}</strong>.
                </p>
              </div>
            )}

            <button
              onClick={onClose}
              className="w-full rounded-lg bg-muted/60 hover:bg-muted px-4 py-2.5 text-sm text-muted-foreground transition-colors"
            >
              Fechar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────

export function AdminClient({ usuarios, convites, myUserId }: AdminClientProps) {
  const [tab, setTab]               = useState<"usuarios" | "convites">("usuarios");
  const [showModal, setShowModal]   = useState(false);
  const [feedback, setFeedback]     = useState<string | null>(null);
  const [, startTransition]         = useTransition();

  const pendentes = convites.filter(c => !c.used_at && !isExpired(c.expires_at));
  const historico = convites.filter(c => c.used_at || isExpired(c.expires_at));

  async function handleRoleChange(userId: string, role: Role) {
    startTransition(async () => {
      const res = await alterarRoleUsuario(userId, role);
      if ("erro" in res) setFeedback(res.erro);
    });
  }

  async function handleRemoverUsuario(userId: string) {
    if (!confirm("Remover este usuário? Esta ação não pode ser desfeita.")) return;
    startTransition(async () => {
      const res = await removerUsuario(userId);
      if ("erro" in res) setFeedback(res.erro);
    });
  }

  async function handleRevogar(inviteId: string) {
    startTransition(async () => {
      const res = await revogarConvite(inviteId);
      if ("erro" in res) setFeedback(res.erro);
    });
  }

  return (
    <div className="max-w-[1200px] mx-auto space-y-4 pb-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-foreground leading-tight">
            Configurações
          </h1>
          <p className="text-[13px] text-muted-foreground mt-0.5">
            Gerencie usuários e convites do sistema
          </p>
        </div>

        {tab === "convites" && (
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 text-sm font-medium transition-colors shrink-0"
          >
            <Plus size={14} />
            Convidar usuário
          </button>
        )}
      </div>

      {/* Feedback */}
      {feedback && (
        <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-2.5">
          <AlertCircle size={13} className="text-red-400 shrink-0" />
          <p className="text-[12px] text-red-400 flex-1">{feedback}</p>
          <button onClick={() => setFeedback(null)} className="text-red-400/60 hover:text-red-400 text-xs">✕</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "USUÁRIOS",         value: usuarios.length,  color: "text-foreground" },
          { label: "CONVITES ATIVOS",  value: pendentes.length, color: "text-amber-400" },
          { label: "CONVITES USADOS",  value: historico.filter(c => c.used_at).length, color: "text-emerald-400" },
        ].map(({ label, value, color }) => (
          <div key={label} className="rounded-xl border border-border/80 bg-muted/40 px-5 py-4">
            <div className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">
              {label}
            </div>
            <div className={cn("text-2xl font-mono font-semibold mt-1.5", color)}>
              {value}
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl border border-border/80 bg-muted/40 p-1 w-fit">
        {[
          { id: "usuarios",  label: "Usuários",  icon: Users },
          { id: "convites",  label: "Convites",  icon: Mail  },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id as "usuarios" | "convites")}
            className={cn(
              "flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
              tab === id
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Tabela */}
      <div className="rounded-xl border border-border/80 bg-muted/40 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_80px] gap-4 px-5 py-3 border-b border-border/80">
          {tab === "usuarios" ? (
            <>
              {["USUÁRIO", "PERFIL", "MEMBRO DESDE", ""].map(h => (
                <div key={h} className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">{h}</div>
              ))}
            </>
          ) : (
            <>
              {["E-MAIL CONVIDADO", "PERFIL", "STATUS", ""].map(h => (
                <div key={h} className="text-[10px] uppercase tracking-[0.12em] font-medium text-muted-foreground">{h}</div>
              ))}
            </>
          )}
        </div>

        {/* Linhas */}
        {tab === "usuarios" ? (
          usuarios.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Users size={28} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum usuário cadastrado</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {usuarios.map(u => (
                <UsuarioRow
                  key={u.id}
                  usuario={u}
                  isMe={u.id === myUserId}
                  onRoleChange={handleRoleChange}
                  onRemove={handleRemoverUsuario}
                />
              ))}
            </ul>
          )
        ) : (
          convites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-2">
              <Mail size={28} className="text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">Nenhum convite enviado</p>
              <button
                onClick={() => setShowModal(true)}
                className="text-xs text-emerald-400 hover:underline"
              >
                Convidar primeiro usuário
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-border/60">
              {convites.map(c => (
                <ConviteRow key={c.id} convite={c} onRevogar={handleRevogar} />
              ))}
            </ul>
          )
        )}
      </div>

      {/* Modal de convite */}
      {showModal && <ConviteModal onClose={() => setShowModal(false)} />}
    </div>
  );
}
