# Spec: Editar Produto e Fornecedor com Sync ao Omie

**Data:** 2026-05-25  
**Status:** Aprovado  
**Ticket:** LHG-230 (a criar)  
**Escopo:** Modal de edição para Produto e Fornecedor com escrita bidirecional para o Omie ERP via `AlterarProduto` / `AlterarCliente`.

---

## 1. Contexto

Hoje o LHG Suprimentos sincroniza produtos e fornecedores **apenas em leitura** — o Omie é a fonte de verdade e os dados são importados via cron. Não existe forma de corrigir um nome errado, um preço desatualizado ou um e-mail de fornecedor desatualizado diretamente pelo sistema; o usuário teria de acessar o Omie separadamente.

Esta feature adiciona modais de edição nas páginas de Produtos e Fornecedores que:
1. Abrem ao clicar em uma linha da tabela.
2. Exibem os campos editáveis pré-preenchidos com os dados do banco.
3. Ao salvar, chamam a API do Omie (`AlterarProduto` / `AlterarCliente`) e, em caso de sucesso, atualizam o Supabase.

---

## 2. Arquitetura

### Novos arquivos

| Arquivo | Responsabilidade |
|---|---|
| `app/(app)/produtos/actions.ts` | Server Action `editarProduto()` |
| `app/(app)/fornecedores/actions.ts` | Server Action `editarFornecedor()` |
| `app/(app)/produtos/_components/editar-produto-modal.tsx` | Modal de edição de produto |
| `app/(app)/fornecedores/_components/editar-fornecedor-modal.tsx` | Modal de edição de fornecedor |

### Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `lib/omie/client.ts` | Adiciona `alterarProduto()` e `alterarFornecedor()` |
| `app/(app)/produtos/_components/produtos-client.tsx` | Estado `produtoEditando` + abre modal ao clicar na linha |
| `app/(app)/fornecedores/_components/fornecedores-client.tsx` | Estado `fornecedorEditando` + abre modal ao clicar na linha |

### Diagrama de fluxo

```
produtos-client / fornecedores-client
  └─ click na linha
       │
  EditarProdutoModal / EditarFornecedorModal   (Client Component)
       │
  editarProduto() / editarFornecedor()          (Server Action)
       │
  alterarProduto() / alterarFornecedor()        (lib/omie/client.ts)
       │
  Omie API
  POST /geral/produtos/ (AlterarProduto)
  POST /geral/clientes/ (AlterarCliente)
       │
  UPDATE produtos / fornecedores (Supabase)
  revalidatePath()
```

---

## 3. Campos Editáveis

### 3.1 Produto

| Campo local | Campo Omie | Tipo | Observação |
|---|---|---|---|
| `nome` | `descricao` | `text` | Nome principal do produto |
| `preco_custo` | `valor_unitario` | `numeric` | Preço unitário de custo |
| `familia_omie` | `descricao_familia` | `select` | Dropdown com as chaves de `FAMILIA_TO_CATEGORIA`; ao mudar, `categoria` é recalculada automaticamente |

**Campos somente leitura no modal:** `codigo`, `omie_codigo`, `unidade_med`, `ncm`, `ean`.

**Recálculo de categoria:** quando `familia_omie` muda, o campo `categoria` é atualizado usando `FAMILIA_TO_CATEGORIA[familia.toUpperCase()] ?? "Outros"` antes do UPDATE no Supabase.

### 3.2 Fornecedor

| Campo local | Campo Omie | Tipo |
|---|---|---|
| `razao_social` | `razao_social` | `text` |
| `nome_fantasia` | `nome_fantasia` | `text` |
| `email` | `email` | `email` |
| `telefone` | `telefone` | `text` |
| `contato` | `contato` | `text` (nome da pessoa de contato) |
| `endereco` | `endereco` | `text` |
| `cep` | `cep` | `text` (8 dígitos, sem máscara) |
| `cidade` | `cidade` | `text` |
| `uf` | `estado` | `select` (26 estados + DF) |

**Campos somente leitura no modal:** `cnpj`, `omie_codigo`.

---

## 4. Server Actions

### 4.1 `editarProduto(produtoId, dados)`

**Localização:** `app/(app)/produtos/actions.ts`

```typescript
"use server";

interface EditarProdutoInput {
  nome:         string;
  preco_custo:  number;
  familia_omie: string;
}

export async function editarProduto(
  produtoId: string,
  dados: EditarProdutoInput,
): Promise<{ ok: true } | { erro: string }>
```

**Passos:**
1. Autentica usuário (redirect se não autenticado).
2. Busca produto no Supabase: `id`, `omie_codigo`, `omie_unidade_id` + `unidades(omie_app_key, omie_app_secret)`.
3. Valida: `omie_codigo` presente — caso contrário retorna `{ erro: "Produto não sincronizado com o Omie" }`.
4. Valida campos com Zod: `nome` não vazio, `preco_custo > 0`, `familia_omie` não vazio.
5. Chama `alterarProduto(creds, { omie_codigo, nome, preco_custo, familia_omie })`.
6. Se Omie retornar erro → retorna `{ erro: mensagem_omie }`.
7. Calcula `novaCategoria = FAMILIA_TO_CATEGORIA[familia_omie.toUpperCase()] ?? "Outros"`.
8. `UPDATE produtos SET nome, preco_custo, familia_omie, categoria = novaCategoria, omie_sincronizado_em = now() WHERE id = produtoId`.
9. `revalidatePath('/produtos')`.
10. Retorna `{ ok: true }`.

### 4.2 `editarFornecedor(fornecedorId, dados)`

**Localização:** `app/(app)/fornecedores/actions.ts`

```typescript
"use server";

interface EditarFornecedorInput {
  razao_social:  string;
  nome_fantasia: string;
  email:         string;
  telefone:      string;
  contato:       string;
  endereco:      string;
  cep:           string;
  cidade:        string;
  uf:            string;
}

export async function editarFornecedor(
  fornecedorId: string,
  dados: EditarFornecedorInput,
): Promise<{ ok: true } | { erro: string }>
```

**Passos:**
1. Autentica usuário.
2. Busca fornecedor: `id`, `omie_codigo`, `omie_unidade_id` + credenciais Omie da unidade.
3. Valida: `omie_codigo` presente.
4. Valida campos com Zod: `razao_social` não vazio, `cnpj` imutável (não aceito no input), `uf` válido (2 letras).
5. Chama `alterarFornecedor(creds, { omie_codigo, ...dados })`.
6. Se Omie retornar erro → `{ erro: mensagem }`.
7. `UPDATE fornecedores SET razao_social, nome_fantasia, email, telefone, contato, endereco, cep, cidade, uf, omie_sincronizado_em = now() WHERE id = fornecedorId`.
8. `revalidatePath('/fornecedores')`.
9. Retorna `{ ok: true }`.

---

## 5. Novos Métodos em `lib/omie/client.ts`

### `alterarProduto(creds, params)`

```typescript
interface AlterarProdutoParams {
  omie_codigo:   string;   // codigo_produto no Omie
  nome:          string;   // descricao
  preco_custo:   number;   // valor_unitario
  familia_omie:  string;   // descricao_familia
}

async function alterarProduto(
  creds: OmieCredentials,
  params: AlterarProdutoParams,
): Promise<void>
```

- Endpoint: `POST /geral/produtos/`
- Call: `"AlterarProduto"`
- Payload mínimo:
  ```json
  {
    "codigo_produto": "<omie_codigo>",
    "descricao": "<nome>",
    "valor_unitario": 99.99,
    "descricao_familia": "<familia_omie>"
  }
  ```
- Em caso de erro Omie (faultcode presente na resposta) → lança `Error(faultstring)`.

### `alterarFornecedor(creds, params)`

```typescript
interface AlterarFornecedorParams {
  omie_codigo:   string;
  razao_social:  string;
  nome_fantasia: string;
  email:         string;
  telefone:      string;
  contato:       string;
  endereco:      string;
  cep:           string;
  cidade:        string;
  uf:            string;   // mapeado para "estado" no payload Omie
}

async function alterarFornecedor(
  creds: OmieCredentials,
  params: AlterarFornecedorParams,
): Promise<void>
```

- Endpoint: `POST /geral/clientes/`
- Call: `"AlterarCliente"`
- Payload mínimo:
  ```json
  {
    "codigo_cliente_omie": "<omie_codigo>",
    "razao_social": "...",
    "nome_fantasia": "...",
    "email": "...",
    "telefone1_ddd": "11",
    "telefone1_numero": "999999999",
    /* O campo local `telefone` é enviado inteiro em telefone1_numero;
       DDD extraído dos 2 primeiros dígitos se o número tiver 10-11 dígitos,
       caso contrário DDD fica vazio e número é enviado completo. */
    "contato": "...",
    "endereco": "...",
    "cep": "...",
    "cidade": "...",
    "estado": "SP"
  }
  ```
- Em caso de faultcode → lança `Error(faultstring)`.

---

## 6. Componentes de Modal

### 6.1 `EditarProdutoModal`

**Props:**
```typescript
interface EditarProdutoModalProps {
  produto:  ProdutoRow | null;   // null = fechado
  onClose:  () => void;
}
```

**UI:**
- Header: "Editar produto · `{produto.codigo}`"
- Campos: `nome` (input text), `preco_custo` (input number, formatado BRL), `familia_omie` (select com opções de `Object.keys(FAMILIA_TO_CATEGORIA)`)
- Preview automático: ao mudar `familia_omie`, mostra "Categoria de orçamento: **Amenities**" em tempo real
- Rodapé: botão "Cancelar" + botão "Salvar no Omie" (verde, com spinner durante `useTransition`)
- Banner de erro (se Omie rejeitar): vermelho com mensagem exata
- Se produto sem `omie_codigo`: banner amarelo "Produto não sincronizado — execute o Sync primeiro", botão Salvar desabilitado

### 6.2 `EditarFornecedorModal`

**Props:**
```typescript
interface EditarFornecedorModalProps {
  fornecedor: FornecedorRow | null;
  onClose:    () => void;
}
```

**UI:**
- Header: "Editar fornecedor · `{fornecedor.cnpj}`"
- Seção **Cadastro:** `razao_social`, `nome_fantasia`
- Seção **Contato:** `email`, `telefone`, `contato`
- Seção **Endereço:** `cep`, `endereco`, `cidade`, `uf` (select UF)
- Rodapé: "Cancelar" + "Salvar no Omie"
- Mesmo padrão de banner de erro/sem-omie do modal de produto

---

## 7. Mudanças nos Client Components

### `produtos-client.tsx`
```typescript
const [produtoEditando, setProdutoEditando] = useState<ProdutoRow | null>(null);

// Na linha da tabela:
<li onClick={() => setProdutoEditando(produto)} className="... cursor-pointer">
  ...
</li>

// Ao final do JSX:
<EditarProdutoModal
  produto={produtoEditando}
  onClose={() => setProdutoEditando(null)}
/>
```

### `fornecedores-client.tsx`
Mesmo padrão com `fornecedorEditando`.

---

## 8. Tratamento de Erros

| Situação | Comportamento |
|---|---|
| Produto/Fornecedor sem `omie_codigo` | Modal abre, campos disabled, banner âmbar: "Não sincronizado com o Omie — execute o Sync primeiro" |
| Omie retorna faultcode (campo inválido, etc.) | Modal permanece aberto, banner vermelho com `faultstring` exato do Omie |
| Erro de rede / timeout | Toast de erro via `sonner`, modal permanece aberto |
| Sucesso | Modal fecha, toast verde, tabela revalidada via `revalidatePath` |

---

## 9. O que está fora do escopo

- Criar novo produto ou fornecedor no Omie (apenas alterar existentes).
- Editar campos locais como `rating`, `pontualidade_pct`, `competitividade_pct` (métricas internas — fora do Omie).
- Editar `cnpj`, `omie_codigo`, `ncm`, `ean` (identificadores imutáveis).
- Sincronizar a edição em todas as unidades simultaneamente (cada row edita sua própria unidade).
- Histórico de alterações / auditoria de edições (pode ser adicionado depois).

---

## 10. Sequência de Implementação

1. `lib/omie/client.ts` — adicionar `alterarProduto()` e `alterarFornecedor()`
2. `app/(app)/produtos/actions.ts` — criar `editarProduto()`
3. `app/(app)/fornecedores/actions.ts` — criar `editarFornecedor()`
4. `editar-produto-modal.tsx` — implementar modal
5. `editar-fornecedor-modal.tsx` — implementar modal
6. `produtos-client.tsx` — adicionar estado + integrar modal
7. `fornecedores-client.tsx` — adicionar estado + integrar modal
