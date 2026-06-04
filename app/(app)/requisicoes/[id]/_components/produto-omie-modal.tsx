"use client";

/**
 * produto-omie-modal.tsx
 * Modal para cadastrar produto no Omie com:
 *  - Família como select (famílias da DB)
 *  - NCM com filtro local + digitação livre + localStorage
 *  - Preço monetário formatado
 *  - Código do produto (manual, obrigatório)
 *  - Código de integração (opcional)
 */
import { useState, useTransition, useEffect, useRef } from "react";
import { X, Loader2, Check, Search, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { criarProdutoOmie, vincularProdutoItem, listarFamiliasOmie, type FamiliaOmie } from "../../actions";

interface Props {
  open:              boolean;
  onClose:           () => void;
  requisicaoItemId?: string;
  unidadeId:         string;
  nomeSugerido:      string;
}

interface NcmItem { codigo: string; descricao: string; }

// NCMs curados para hotelaria
const NCM_HOTEL: NcmItem[] = [
  { codigo: "2106.90.90", descricao: "Preparações alimentícias diversas" },
  { codigo: "1905.90.90", descricao: "Produtos de padaria / bolos / biscoitos" },
  { codigo: "0901.21.00", descricao: "Café torrado" },
  { codigo: "1101.00.10", descricao: "Farinha de trigo" },
  { codigo: "2201.10.00", descricao: "Água mineral natural" },
  { codigo: "2202.10.00", descricao: "Água mineral gaseificada / refrigerantes" },
  { codigo: "2009.11.00", descricao: "Suco de laranja" },
  { codigo: "0401.10.10", descricao: "Leite integral" },
  { codigo: "1507.90.11", descricao: "Óleo de soja refinado" },
  { codigo: "2103.90.21", descricao: "Sal / temperos" },
  { codigo: "1702.30.00", descricao: "Açúcar" },
  { codigo: "2204.21.00", descricao: "Vinho" },
  { codigo: "2203.00.00", descricao: "Cerveja de malte" },
  { codigo: "3401.11.90", descricao: "Sabonete em barra" },
  { codigo: "3401.20.10", descricao: "Sabonete líquido" },
  { codigo: "3305.10.00", descricao: "Xampu para cabelos" },
  { codigo: "3304.99.00", descricao: "Preparações higiene corporal / amenities" },
  { codigo: "3307.20.90", descricao: "Desodorante / antitranspirante" },
  { codigo: "3306.10.00", descricao: "Pasta de dentes" },
  { codigo: "9619.00.00", descricao: "Absorventes / fraldas" },
  { codigo: "4818.10.00", descricao: "Papel higiênico" },
  { codigo: "4818.20.00", descricao: "Lenços / guardanapos de papel" },
  { codigo: "4818.30.00", descricao: "Toalhas de papel" },
  { codigo: "3402.20.00", descricao: "Detergente / limpador" },
  { codigo: "3402.90.39", descricao: "Preparações para lavagem / limpeza" },
  { codigo: "3808.94.19", descricao: "Desinfetante / alvejante" },
  { codigo: "3402.19.00", descricao: "Sabão em pó / amaciante" },
  { codigo: "3824.99.49", descricao: "Aromatizador de ambiente" },
  { codigo: "6302.60.00", descricao: "Toalhas de banho / rosto" },
  { codigo: "6302.21.00", descricao: "Roupas de cama (lençóis / fronhas)" },
  { codigo: "6301.40.00", descricao: "Cobertores / edredons" },
  { codigo: "7323.93.00", descricao: "Utensílios de cozinha (aço inox)" },
  { codigo: "3923.21.90", descricao: "Sacolas / embalagens plásticas" },
];

const CUSTOM_NCMS_KEY = "lhg-custom-ncms";

function getCustomNcms(): NcmItem[] {
  try { return JSON.parse(localStorage.getItem(CUSTOM_NCMS_KEY) ?? "[]"); }
  catch { return []; }
}

function saveCustomNcm(item: NcmItem) {
  const existing = getCustomNcms();
  if (!existing.find(n => n.codigo === item.codigo)) {
    localStorage.setItem(CUSTOM_NCMS_KEY, JSON.stringify([...existing, item]));
  }
}

const UNIDADES = ["UN", "KG", "LT", "CX", "PC", "MT", "GL", "SC", "FR", "PR"];
const cls = "w-full h-9 px-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring";

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
        {label} {required && <span className="text-red-400 normal-case">*</span>}
      </label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground/55 mt-0.5">{hint}</p>}
    </div>
  );
}

/** Input monetário: digita "1" → mostra "1,00" */
function CurrencyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "");
    if (!raw) { onChange(""); return; }
    const num = parseInt(raw, 10) / 100;
    onChange(num.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  }
  return (
    <div className="relative">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60 text-sm">R$</span>
      <input
        value={value}
        onChange={handleChange}
        type="text"
        inputMode="numeric"
        placeholder="0,00"
        className="w-full h-9 pl-8 pr-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
      />
    </div>
  );
}

/** Campo NCM com filtro local + digitação livre + localStorage */
function NcmSearch({ value, onChange }: { value: string; onChange: (codigo: string, descricao: string) => void }) {
  const [query,     setQuery]     = useState(value);
  const [sugestoes, setSugestoes] = useState<NcmItem[]>([]);
  const [aberto,    setAberto]    = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleOut(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", handleOut);
    return () => document.removeEventListener("mousedown", handleOut);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);

    // Aceita digitação livre — passa o valor bruto como código
    onChange(q, q);

    if (q.length < 2) { setSugestoes([]); setAberto(false); return; }

    const ql = q.toLowerCase();
    const custom = getCustomNcms();
    const all = [...NCM_HOTEL, ...custom.filter(c => !NCM_HOTEL.find(n => n.codigo === c.codigo))];
    const filtradas = all.filter(
      n => n.descricao.toLowerCase().includes(ql) || n.codigo.includes(q)
    ).slice(0, 8);

    setSugestoes(filtradas);
    setAberto(filtradas.length > 0);
  }

  function selecionar(item: NcmItem) {
    onChange(item.codigo, item.descricao);
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
          placeholder="Digite descrição ou código (ex: sabonete, 3401)"
          required
          className="w-full h-9 pl-8 pr-3 rounded-lg bg-background border border-border text-foreground text-sm focus:outline-none focus:border-ring"
        />
      </div>
      {aberto && sugestoes.length > 0 && (
        <div className="absolute z-[9999] top-full mt-1 w-full rounded-lg border border-border bg-card shadow-xl overflow-hidden max-h-52 overflow-y-auto">
          {sugestoes.map(s => (
            <button key={s.codigo} type="button" onClick={() => selecionar(s)}
              className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors border-b border-border/40 last:border-0">
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
  const [nome,             setNome]             = useState(nomeSugerido);
  const [unidade,          setUnidade]          = useState("UN");
  const [ncmCodigo,        setNcmCodigo]        = useState("");
  const [ncmDescricao,     setNcmDescricao]     = useState("");
  const [custo,            setCusto]            = useState("");
  const [familiaDescricao, setFamiliaDescricao] = useState("");
  const [familiaCodigo,    setFamiliaCodigo]    = useState<number | null>(null);
  const [codigoProduto,    setCodigoProduto]    = useState("");
  const [codigoIntegracao, setCodigoIntegracao] = useState("");
  const [familias,         setFamilias]         = useState<FamiliaOmie[]>([]);
  const [pending, startTransition] = useTransition();

  // Busca famílias ao abrir
  useEffect(() => {
    if (open && familias.length === 0) {
      listarFamiliasOmie().then(setFamilias).catch(() => {});
    }
  }, [open, familias.length]);

  if (!open) return null;

  function handleNcmChange(codigo: string, descricao: string) {
    setNcmCodigo(codigo);
    setNcmDescricao(descricao);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ncmCodigo) { toast.error("Informe o NCM do produto"); return; }
    startTransition(async () => {
      // Salva NCM customizado no localStorage se for novo
      const ncmCode = ncmCodigo.includes(" — ") ? ncmCodigo.split(" — ")[0] : ncmCodigo;
      const ncmDesc = ncmDescricao || ncmCode;
      if (!NCM_HOTEL.find(n => n.codigo === ncmCode)) {
        saveCustomNcm({ codigo: ncmCode, descricao: ncmDesc });
      }

      const valorCusto = custo ? Number(custo.replace(/\./g, "").replace(",", ".")) : undefined;
      const result = await criarProdutoOmie(unidadeId, {
        nome,
        unidade,
        ncm:               ncmCode,
        familiaDescricao:  familiaDescricao || undefined,
        familiaCodigo:     familiaCodigo ?? undefined,
        valorCusto,
        codigoProduto,
        codigoIntegracao:  codigoIntegracao || undefined,
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
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-foreground">Cadastrar produto no Omie</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nome */}
          <Field label="Nome do produto" required>
            <input value={nome} onChange={e => setNome(e.target.value)} required
              className={cls} placeholder="Ex: Sabonete líquido 5L" />
          </Field>

          {/* Unidade + Preço */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Unidade" required>
              <select value={unidade} onChange={e => setUnidade(e.target.value)} className={cls}>
                {UNIDADES.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </Field>
            <Field label="Preço de custo">
              <CurrencyInput value={custo} onChange={setCusto} />
            </Field>
          </div>

          {/* Código do produto + Família */}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Código do produto" required hint="Ex: INS00010, HIG001">
              <input value={codigoProduto} onChange={e => setCodigoProduto(e.target.value.toUpperCase())}
                required className={cls} placeholder="Ex: HIG001" maxLength={20} />
            </Field>
            <Field label="Família Omie">
              <div className="relative">
                <select
                  value={familiaDescricao}
                  onChange={e => {
                    const desc = e.target.value;
                    setFamiliaDescricao(desc);
                    const fam = familias.find(f => f.descricao === desc);
                    setFamiliaCodigo(fam?.codigo ?? null);
                  }}
                  className={cls}
                >
                  <option value="">Sem família</option>
                  {familias.map(f => (
                    <option key={f.descricao} value={f.descricao}>
                      {f.descricao}{f.codigo ? ` (${f.codigo})` : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground/50 pointer-events-none" />
              </div>
            </Field>
          </div>

          {/* NCM */}
          <Field label="NCM" required hint="Digite o produto ou o código para filtrar. Aceita digitação livre.">
            <NcmSearch value="" onChange={handleNcmChange} />
          </Field>

          {/* Código de integração */}
          <Field label="Código de integração (opcional)" hint="Código do mesmo produto em outro sistema integrado ao Omie">
            <input value={codigoIntegracao} onChange={e => setCodigoIntegracao(e.target.value)}
              className={cls} placeholder="Ex: ERP-00123 (deixe vazio para gerar automático)" />
          </Field>

          <div className="flex gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="flex-1 h-9 rounded-lg border border-border text-muted-foreground hover:text-foreground text-sm transition-colors">
              Cancelar
            </button>
            <button type="submit" disabled={pending || !nome || !unidade || !ncmCodigo || !codigoProduto}
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
