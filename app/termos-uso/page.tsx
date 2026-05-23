/**
 * app/termos-uso/page.tsx
 * Termos de Uso — página pública (requerida pelo Google OAuth).
 */
import type { Metadata } from "next";
import Link from "next/link";
import { Logo } from "@/components/lhg/logo";

export const metadata: Metadata = {
  title: "Termos de Uso — LHG Suprimentos",
  description: "Condições de uso da plataforma interna de gestão de compras LHG Suprimentos.",
};

export default function TermosUsoPage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 sticky top-0 backdrop-blur-sm z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/login" aria-label="LHG Suprimentos">
            <Logo size="sm" />
          </Link>
          <Link
            href="/login"
            className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            ← Voltar ao login
          </Link>
        </div>
      </header>

      {/* Conteúdo */}
      <main className="max-w-3xl mx-auto px-6 py-12">
        <div className="mb-8">
          <p className="text-xs text-lhg-400 uppercase tracking-wider font-medium mb-2">
            Documento legal
          </p>
          <h1 className="text-3xl font-semibold text-zinc-50 tracking-tight">
            Termos de Uso
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Última atualização: maio de 2026
          </p>
        </div>

        <div className="prose prose-sm prose-invert max-w-none space-y-8 text-zinc-400 [&_h2]:text-zinc-100 [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mt-8 [&_h2]:mb-3 [&_strong]:text-zinc-200 [&_a]:text-lhg-400 [&_a:hover]:text-lhg-300">

          <section>
            <h2>1. Aceitação dos termos</h2>
            <p>
              Ao acessar e utilizar o <strong>LHG Suprimentos</strong>, você confirma que leu,
              compreendeu e concorda com estes Termos de Uso. O uso da plataforma está condicionado
              ao aceite integral destes termos.
            </p>
          </section>

          <section>
            <h2>2. O que é o LHG Suprimentos</h2>
            <p>
              LHG Suprimentos é uma plataforma <strong>interna e corporativa</strong> de gestão
              de compras e suprimentos do Grupo LHG, destinada exclusivamente a colaboradores
              e prestadores autorizados. A plataforma permite:
            </p>
            <ul className="list-disc ml-5 space-y-1.5 mt-3">
              <li>Criação e gestão de requisições de compra por unidade.</li>
              <li>Elaboração, comparação e aprovação de cotações com fornecedores.</li>
              <li>Emissão e acompanhamento de pedidos de compra.</li>
              <li>Conferência de notas fiscais e integração com o ERP Omie.</li>
              <li>Geração de relatórios e métricas de economia.</li>
            </ul>
          </section>

          <section>
            <h2>3. Elegibilidade e acesso</h2>
            <p>
              O acesso é <strong>restrito a usuários explicitamente convidados</strong> pelo
              administrador do sistema. Não é possível se cadastrar de forma autônoma. Cada
              usuário possui um papel (solicitante, comprador, aprovador ou admin) que define
              suas permissões dentro da plataforma.
            </p>
            <p className="mt-3">
              A autenticação pode ser realizada via e-mail corporativo (magic link) ou conta
              Google vinculada ao domínio do Grupo LHG.
            </p>
          </section>

          <section>
            <h2>4. Responsabilidades do usuário</h2>
            <p>Ao utilizar a plataforma, você se compromete a:</p>
            <ul className="list-disc ml-5 space-y-1.5 mt-3">
              <li>Usar a plataforma somente para fins operacionais corporativos autorizados.</li>
              <li>Não compartilhar suas credenciais de acesso com terceiros.</li>
              <li>Registrar informações verídicas e precisas nas requisições e cotações.</li>
              <li>Não tentar acessar dados ou funcionalidades além do seu nível de permissão.</li>
              <li>Reportar imediatamente qualquer uso não autorizado da sua conta ao administrador.</li>
              <li>Não realizar engenharia reversa, cópia ou redistribuição do sistema.</li>
            </ul>
          </section>

          <section>
            <h2>5. Responsabilidades do Grupo LHG</h2>
            <p>O Grupo LHG se compromete a:</p>
            <ul className="list-disc ml-5 space-y-1.5 mt-3">
              <li>Manter a plataforma disponível durante o horário comercial, com SLA razoável.</li>
              <li>Proteger os dados dos usuários conforme descrito na Política de Privacidade.</li>
              <li>Comunicar manutenções programadas com antecedência adequada.</li>
              <li>Fornecer suporte técnico para resolução de problemas operacionais.</li>
            </ul>
            <p className="mt-3">
              O Grupo LHG <strong>não garante</strong> disponibilidade ininterrupta e não se
              responsabiliza por perdas decorrentes de indisponibilidade temporária do sistema
              ou de falhas em serviços de terceiros (Supabase, Vercel, Google, etc.).
            </p>
          </section>

          <section>
            <h2>6. Propriedade intelectual</h2>
            <p>
              Todo o conteúdo da plataforma — incluindo código-fonte, interface, logotipos,
              dados operacionais e relatórios — é de propriedade exclusiva do Grupo LHG ou
              de seus licenciantes. É vedada qualquer reprodução, modificação ou distribuição
              sem autorização expressa e por escrito.
            </p>
          </section>

          <section>
            <h2>7. Dados e confidencialidade</h2>
            <p>
              Todas as informações acessadas na plataforma — cotações, preços, fornecedores,
              estratégias de compra e dados financeiros — são <strong>confidenciais</strong> e
              de uso exclusivamente interno. A divulgação não autorizada a terceiros pode
              configurar violação do contrato de trabalho e/ou de legislação aplicável.
            </p>
          </section>

          <section>
            <h2>8. Suspensão e encerramento de acesso</h2>
            <p>
              O Grupo LHG pode suspender ou encerrar o acesso de qualquer usuário a qualquer
              momento, sem aviso prévio, nos seguintes casos:
            </p>
            <ul className="list-disc ml-5 space-y-1.5 mt-3">
              <li>Término do vínculo empregatício ou contratual.</li>
              <li>Violação destes Termos de Uso.</li>
              <li>Suspeita de uso indevido ou comprometimento de segurança.</li>
              <li>Solicitação do próprio usuário.</li>
            </ul>
          </section>

          <section>
            <h2>9. Limitação de responsabilidade</h2>
            <p>
              Na máxima extensão permitida pela lei, o Grupo LHG não será responsável por
              danos indiretos, incidentais, especiais ou consequenciais decorrentes do uso ou
              da impossibilidade de uso da plataforma.
            </p>
          </section>

          <section>
            <h2>10. Alterações nos termos</h2>
            <p>
              Podemos atualizar estes Termos periodicamente. Quando houver alterações
              significativas, notificaremos os usuários por e-mail com antecedência de pelo
              menos 10 dias. O uso continuado da plataforma após as alterações constitui
              aceite dos novos termos.
            </p>
          </section>

          <section>
            <h2>11. Lei aplicável e foro</h2>
            <p>
              Estes Termos são regidos pelas leis da República Federativa do Brasil.
              As partes elegem o foro da comarca de domicílio do Grupo LHG para dirimir
              eventuais conflitos decorrentes deste instrumento.
            </p>
          </section>

          <section>
            <h2>12. Contato</h2>
            <div className="mt-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/40 text-sm space-y-1">
              <p><strong>Grupo LHG — Administração de Sistemas</strong></p>
              <p>E-mail: <a href="mailto:suporte@lhgmoteis.com.br">suporte@lhgmoteis.com.br</a></p>
              <p>Para questões de privacidade: <a href="mailto:privacidade@lhgmoteis.com.br">privacidade@lhgmoteis.com.br</a></p>
            </div>
          </section>

        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-900 mt-16 py-6">
        <div className="max-w-3xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-600">
          <span>© {new Date().getFullYear()} Grupo LHG. Todos os direitos reservados.</span>
          <div className="flex gap-4">
            <Link href="/politica-privacidade" className="hover:text-zinc-400 transition-colors">
              Política de Privacidade
            </Link>
            <Link href="/termos-uso" className="hover:text-zinc-400 transition-colors">
              Termos de Uso
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
