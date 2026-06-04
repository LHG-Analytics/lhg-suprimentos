"use client";

/**
 * produto-omie-modal.tsx
 * Modal para cadastrar produto no Omie.
 * NCM pesquisado via BrasilAPI (gratuita, sem autenticação).
 */
import { useState, useTransition, useEffect, useRef } from "react";
import { X, Loader2, Check, Search } from "lucide-react";
// Loader2 e useEffect mantidos para uso futuro
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

// NCMs mais usados em hotelaria — filtro local (sem depender de API externa)
const NCM_HOTEL: NcmItem[] = [
  // Alimentos
  { codigo: "2106.90.90", descricao: "Preparações alimentícias diversas" },
  { codigo: "1905.90.90", descricao: "Produtos de padaria / bolos / biscoitos" },
  { codigo: "0901.21.00", descricao: "Café torrado" },
  { codigo: "1101.00.10", descricao: "Farinha de trigo" },
  { codigo: "1806.90.00", descricao: "Chocolate e produtos de cacau" },
  { codigo: "2201.10.00", descricao: "Água mineral natural" },
  { codigo: "2202.10.00", descricao: "Água mineral gaseificada / refrigerantes" },
  { codigo: "2009.11.00", descricao: "Suco de laranja" },
  { codigo: "0401.10.10", descricao: "Leite integral" },
  { codigo: "1704.90.00", descricao: "Confeitos / balas / doces" },
  { codigo: "2103.20.10", descricao: "Ketchup e outros molhos de tomate" },
  { codigo: "1507.90.11", descricao: "Óleo de soja refinado" },
  { codigo: "2209.00.00", descricao: "Vinagre" },
  { codigo: "1702.30.00", descricao: "Açúcar" },
  { codigo: "2103.90.21", descricao: "Sal de cozinha / temperos" },
  // Higiene e amenidades
  { codigo: "3401.11.90", descricao: "Sabonete em barra" },
  { codigo: "3401.20.10", descricao: "Sabonete líquido" },
  { codigo: "3305.10.00", descricao: "Xampu para cabelos" },
  { codigo: "3305.30.00", descricao: "Laquê / fixador para cabelo" },
  { codigo: "3304.99.00", descricao: "Preparações para higiene corporal / amenities" },
  { codigo: "3304.30.00", descricao: "Preparações para manicure / pedicure" },
  { codigo: "3307.20.90", descricao: "Desodorante / antitranspirante" },
  { codigo: "3307.10.00", descricao: "Preparações para barbear" },
  { codigo: "3306.10.00", descricao: "Pasta de dentes / creme dental" },
  { codigo: "9619.00.00", descricao: "Absorventes higiênicos / fraldas" },
  { codigo: "4818.10.00", descricao: "Papel higiênico" },
  { codigo: "4818.20.00", descricao: "Lenços de papel / guardanapos" },
  { codigo: "4818.30.00", descricao: "Toalhas de papel" },
  // Limpeza
  { codigo: "3402.20.00", descricao: "Detergente / limpador multiuso" },
  { codigo: "3402.90.39", descricao: "Preparações para lavagem / limpeza" },
  { codigo: "3808.94.19", descricao: "Desinfetante / alvejante" },
  { codigo: "3402.19.00", descricao: "Sabão em pó / amaciante de roupa" },
  { codigo: "3824.99.49", descricao: "Aromatizador de ambiente" },
  { codigo: "2807.00.19", descricao: "Ácido muriático / desincrustante" },
  // Têxteis e enxoval
  { codigo: "6302.60.00", descricao: "Toalhas de banho / rosto" },
  { codigo: "6302.21.00", descricao: "Roupas de cama (lençóis / fronhas)" },
  { codigo: "6304.91.00", descricao: "Travesseiros / almofadas" },
  { codigo: "6301.40.00", descricao: "Cobertores / edredons" },
  // Bar e restaurante
  { codigo: "2208.40.00", descricao: "Rum e outras aguardentes" },
  { codigo: "2204.21.00", descricao: "Vinho" },
  { codigo: "2203.00.00", descricao: "Cerveja de malte" },
  { codigo: "2208.30.20", descricao: "Uísque" },
  // Materiais de escritório / utilidades
  { codigo: "4820.10.10", descricao: "Cadernos / blocos de papel" },
  { codigo: "9608.10.00", descricao: "Canetas esferográficas" },
  { codigo: "8516.60.00", descricao: "Forno micro-ondas / eletrodomésticos" },
  { codigo: "3923.21.90", descricao: "Sacolas plásticas / embalagens" },
  { codigo: "7323.93.00", descricao: "Utensílios de cozinha (aço inox)" },
];

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

/** Campo NCM com busca local (lista curada de NCMs para hotelaria) */
function NcmSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [query,     setQuery]     = useState(value);
  const [sugestoes, setSugestoes] = useState<NcmItem[]>([]);
  const [aberto,    setAberto]    = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setAberto(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    onChange(""); // limpa seleção anterior

    if (q.length < 2) { setSugestoes([]); setAberto(false); return; }

    const ql = q.toLowerCase();
    const filtradas = NCM_HOTEL.filter(
      n => n.descricao.toLowerCase().includes(ql) || n.codigo.includes(q)
    ).slice(0, 8);

    setSugestoes(filtradas);
    setAberto(filtradas.length > 0);
  }

  function selecionar(item: NcmItem) {
    onChange(item.codigo);
    setQuery(`${item.codigo} — ${item.descricao}`);
    setSugestoes([]);
    setAberto(false);
  }

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
        <input
          value={query}
          onChange={handleChange}
          onFocus={() => sugestoes.length > 0 && setAberto(true)}
          placeholder="Digite o produto para filtrar (ex: sabonete, toalha)"
          required
          className="w-full h-9 pl-8 pr-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
        />
      </div>

      {aberto && sugestoes.length > 0 && (
        <div className="absolute z-[9999] top-full mt-1 w-full rounded-lg border border-border bg-card shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {sugestoes.map(s => (
            <button
              key={s.codigo}
              type="button"
              onClick={() => selecionar(s)}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0"
            >
              <span className="text-xs font-mono text-lhg-400">{s.codigo}</span>
              <span className="text-xs text-foreground/80 ml-2">{s.descricao}</span>
            </button>
          ))}
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
