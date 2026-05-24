# Onboarding — LHG Suprimentos

Guia de primeiros passos para novos usuários e desenvolvedores do sistema.

---

## Para usuários (Keila e equipe de compras)

### Acesso

1. Abra [supplies.lhgmoteis.com.br](https://supplies.lhgmoteis.com.br)
2. Clique em **"Entrar com Google"** — use seu email `@lhgmoteis.com.br`
3. Na primeira vez você será redirecionado de volta ao sistema já autenticado

### Navegação rápida

| Atalho | Ação |
|---|---|
| `⌘K` / `Ctrl+K` | Busca global (qualquer tela) |
| `⌘N` / `Ctrl+N` | Nova ação (requisição, cotação, NF) |
| `Esc` | Fechar paleta / drawer |

### Fluxo de trabalho

#### 1. Nova Requisição de compra
1. `⌘N` → **Nova Requisição** (ou menu Requisições → botão +)
2. Preencha os itens, quantidade e unidade solicitante
3. Salve — a requisição fica em status **Rascunho** até ser enviada para cotação

#### 2. Criar Cotação
1. Menu **Cotações** → **+ Nova Cotação**
2. Vincule à requisição (ou crie avulsa) → preencha título e prazo
3. Adicione os **fornecedores** que participarão
4. Clique em **"Solicitar cotação"** para enviar email automático a todos

#### 3. Preencher matriz de preços
1. Acesse a cotação → tela da **Matriz Comparativa**
2. Preencha os preços de cada fornecedor por item
3. O sistema destaca automaticamente o **melhor preço** por item
4. Clique em **"Aplicar sugestão IA"** para selecionar o mix ótimo de uma vez
5. Revise e clique em **"Gerar pedidos"**

#### 4. Aprovar Pedido de Compra
1. Menu **Pedidos** → pedidos com status *Aguardando aprovação*
2. Verifique os itens e valor total
3. Clique em **Aprovar** (ou Rejeitar com motivo)
   - Se o valor exceder sua **alçada de aprovação**, contate o administrador
4. Após aprovação clique em **"Enviar ao fornecedor"** para enviar o email de pedido

#### 5. Enviar ao Omie (opcional)
1. No painel do pedido aprovado, clique em **"Enviar ao Omie"**
2. O sistema registra o pedido no ERP automaticamente
3. Se der erro (código Omie inválido ou módulo não habilitado), o botão vira **"Retentar Omie"**

#### 6. Entrada de Nota Fiscal
1. Menu **Notas Fiscais** → **+ Nova NF**
2. Digite o **número da NF** e selecione a unidade
3. O sistema consulta automaticamente os dados no Omie
4. Revise os itens e confirme o lançamento

### Notificações em tempo real
O sistema exibe notificações automáticas no canto da tela quando:
- Um pedido é aprovado ou rejeitado
- Uma cotação gera pedidos
- Um novo pedido aguarda sua aprovação

---

## Para desenvolvedores

### Primeiro acesso (setup completo)

```bash
# 1. Clonar
git clone https://github.com/LHG-Analytics/lhg-suprimentos.git
cd lhg-suprimentos
pnpm install

# 2. Criar .env.local (ver seção abaixo)

# 3. Rodar
pnpm dev   # http://localhost:3001
```

### Variáveis de ambiente necessárias

Solicite ao líder técnico os valores de cada variável:

```env
# Supabase (Settings → API)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# URL local
NEXT_PUBLIC_SITE_URL=http://localhost:3001

# Resend (email transacional)
RESEND_API_KEY=

# OpenRouter (chat IA)
OPENROUTER_API_KEY=

# Supabase Management API (scripts locais de banco)
SUPABASE_LHG_TOKEN=
```

> ⚠️ Nunca commite `.env.local`. Ele está no `.gitignore`.

### Estrutura de pastas importantes

```
app/(app)/           → todas as telas protegidas
components/lhg/      → componentes do design system LHG
lib/supabase/        → clientes Supabase (client / server / service)
lib/omie/client.ts   → todos os chamados à API Omie
lib/sheets/          → integração Google Sheets (orçamento)
hooks/               → hooks React reutilizáveis
supabase/migrations/ → histórico de DDL (nunca editar retroativamente)
scripts/             → helpers PowerShell para banco local
```

### Convenções

| O quê | Como |
|---|---|
| Nova feature | Branch `feat/lhg-<numero>-<descricao>` |
| Mutações de banco | Server Actions (arquivo `actions.ts` por módulo) |
| Leituras | Server Components — nunca `useEffect` para fetch |
| Tipos Supabase | Sempre regenerar após migration: `Get-LhgTypes \| Out-File lib/supabase/types.ts` |
| Commit | Mensagem descritiva + `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>` |
| Linear | Atualizar issue antes de cada push |

### Aplicar migration ao banco

```powershell
. .\scripts\supabase-lhg.ps1
Apply-LhgMigration -Name "0013_nome_descritivo" -Query "ALTER TABLE ..."
$types = Get-LhgTypes; $types | Out-File lib/supabase/types.ts -Encoding utf8
```

### Adicionar credenciais Omie de uma unidade

1. Acesse o dashboard Omie da unidade
2. Crie um app (API) e copie `app_key` e `app_secret`
3. No Supabase: `UPDATE unidades SET omie_app_key='...', omie_app_secret='...' WHERE id='...'`

### Deploy

Push para `main` gera deploy automático de produção na Vercel.
Variáveis de produção estão no dashboard Vercel do projeto `lhg-suprimentos`.

---

## Contatos

| Papel | Responsável |
|---|---|
| Líder técnico / Dev | Danilo Diniz — danilo@lushmotel.com.br |
| Compras (usuário principal) | Keila |
| Infra Supabase | Projeto `pjwsmmxnwkfklycwnptf` · `sa-east-1` |
