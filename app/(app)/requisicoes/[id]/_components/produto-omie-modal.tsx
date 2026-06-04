"use client";

/**
 * produto-omie-modal.tsx
 * Modal para cadastrar produto no Omie.
 * NCM pesquisado via BrasilAPI (gratuita, sem autenticação).
 */
import { useState, useTransition, useEffect, useRef } from "react";
import { X, Loader2, Check, Search } from "lucide-react";
import { toast } from "sonner";
import { criarProdutoOmie, vincularProdutoItem } from "../../actions";

interface Props {
  open:              boolean;
  onClose:           () => void;
  requisicaoItemId?: string;
  unidadeId:         string;
  nomeSugerido:      string;
}

interface NcmItem { codigo: string; descricao: string; }

const UNIDADES = ["UN", "KG", "LT", "CX", "PC", "MT", "GL", "SC", "FR", "PR"];
const cls = "w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring";

function Field({ label, required, children }: {
  label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label} {required && <span className="text-red-400 normal-case">*</span>}
      </label>
      {children}
    </div>
  );
}

/** Campo NCM com busca via BrasilAPI */
function NcmSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query,       setQuery]       = useState(value);
  const [sugestoes,   setSugestoes]   = useState<NcmItem[]>([]);
  const [buscando,    setBuscando]    = useState(false);
  const [aberto,      setAberto]      = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (query.length < 3) { setSugestoes([]); return; }

    timerRef.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const res = await fetch(
          `https://brasilapi.com.br/api/ncm/v1?search=${encodeURIComponent(query)}`,
        );
        if (res.ok) {
          const data: NcmItem[] = await res.json();
          setSugestoes(data.slice(0, 8));
          setAberto(true);
        }
      } catch { /* BrasilAPI fora do ar — usuário digita manualmente */ }
      finally { setBuscando(false); }
    }, 400);
  }, [query]);

  function selecionar(item: NcmItem) {
    onChange(item.codigo);
    setQuery(`${item.codigo} — ${item.descricao}`);
    setSugestoes([]);
    setAberto(false);
  }

  return (
    <div className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
        <input
          value={query}
          onChange={e => { setQuery(e.target.value); onChange(""); }}
          onFocus={() => sugestoes.length > 0 && setAberto(true)}
          placeholder="Digite o produto para buscar o NCM (ex: sabonete)"
          required
          className="w-full h-9 pl-8 pr-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
        />
        {buscando && <Loader2 size={12} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>

      {aberto && sugestoes.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg border border-border bg-card shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {sugestoes.map(s => (
            <button
              key={s.codigo}
              type="button"
              onClick={() => selecionar(s)}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0"
            >
              <span className="text-xs font-mono text-lhg-400">{s.codigo}</span>
              <span className="text-xs text-foreground/80 ml-2 line-clamp-1">{s.descricao}</span>
            </button>
          ))}
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground/50 bg-muted/20">
            Fonte: BrasilAPI (Receita Federal)
          </div>
        </div>
      )}
    </div>
  );
}

export function ProdutoOmieModal({ open, onClose, requisicaoItemId, unidadeId, nomeSugerido }: Props) {
  const [nome,    setNome]    = useState(nomeSugerido);
  const [unidade, setUnidade] = useState("UN");
  const [ncm,     setNcm]     = useState("");
  const [custo,   setCusto]   = useState("");
  const [familia, setFamilia] = useState("");
  const [pending, startTransition] = useTransition();

  if (!open) return null;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ncm) { toast.error("Selecione ou digite um NCM válido"); return; }
    startTransition(async () => {
      const valorCusto = custo ? Number(custo.replace(",", ".")) : undefined;
      const result = await criarProdutoOmie(unidadeId, {
        nome, unidade, ncm, familia: familia || undefined, valorCusto,
      });

      if ("erro" in result) { toast.error(result.erro); return; }

      const { produtoId } = result;
      if (requisicaoItemId) {
        await vincularProdutoItem(requisicaoItemId, produtoId);
        toast.success(`Produto "${nome}" criado no Omie e vinculado`);
      } else {
        toast.success(`Produto "${nome}" criado no Omie`);
      }
      onClose();
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">Cadastrar produto no Omie</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Nome do produto" required>
            <input value={nome} onChange={e => setNome(e.target.value)} required
              className={cls} placeholder="Ex: Sabonete líquido 5L" />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Unidade" required>
              <select value={unidade} onChange={e => setUnidade(e.target.value)} className={cls}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Preço de custo">
              <input value={custo} onChange={e => setCusto(e.target.value)}
                type="text" inputMode="decimal" placeholder="0,00" className={cls} />
            </Field>
          </div>

          <Field label="NCM" required>
            <NcmSearch value={ncm} onChange={setNcm} />
            <p className="text-[10px] text-muted-foreground/50 mt-1">
              Digite o nome do produto para buscar o código NCM automaticamente
            </p>
          </Field>

          <Field label="Família Omie (opcional)">
            <input value={familia} onChange={e => setFamilia(e.target.value)}
              className={cls} placeholder="Ex: AMENITIES" />
          </Field>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={pending || !nome || !unidade || !ncm}
              className="flex-1 h-9 rounded-lg bg-lhg-500 hover:bg-lhg-600 text-white font-medium text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50">
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Criar no Omie
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
