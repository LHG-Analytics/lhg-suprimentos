/**
 * app/politica-privacidade/page.tsx
 * Política de Privacidade — página pública (requerida pelo Google OAuth).
 */
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Política de Privacidade — LHG Suprimentos",
  description: "Como coletamos, usamos e protegemos seus dados pessoais na plataforma LHG Suprimentos.",
};

export default function PoliticaPrivacidadePage() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-300">
      {/* Header */}
      <header className="border-b border-zinc-900 bg-zinc-950/80 sticky top-0 backdrop-blur-sm z-10">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href="/login" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-md bg-lhg-500 text-zinc-950 flex items-center justify-center font-mono font-bold text-sm select-none">
              L
            </div>
            <span className="text-zinc-100 font-medium tracking-tight text-sm">
              LHG <span className="text-zinc-500">Suprimentos</span>
            </span>
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
            Política de Privacidade
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Última atualização: maio de 2026
          </p>
        </div>

        <div className="prose prose-sm prose-invert max-w-none space-y-8 text-zinc-400 [&_h2]:text-zinc-100 [&_h2]:font-semibold [&_h2]:text-lg [&_h2]:mt-8 [&_h2]:mb-3 [&_strong]:text-zinc-200 [&_a]:text-lhg-400 [&_a:hover]:text-lhg-300">

          <section>
            <h2>1. Quem somos</h2>
            <p>
              LHG Suprimentos é uma plataforma interna de gestão de compras operada pelo{" "}
              <strong>Grupo LHG</strong> (LHG Motéis e unidades afiliadas), com sede no Brasil.
              Esta Política descreve como tratamos os dados pessoais dos colaboradores que
              utilizam o sistema.
            </p>
          </section>

          <section>
            <h2>2. Dados coletados</h2>
            <p>Coletamos apenas as informações necessárias para o funcionamento da plataforma:</p>
            <ul className="list-disc ml-5 space-y-1.5 mt-3">
              <li><strong>Dados de identificação:</strong> nome completo e endereço de e-mail corporativo.</li>
              <li><strong>Dados de autenticação:</strong> tokens de sessão gerenciados pelo Supabase Auth (não armazenamos senhas).</li>
              <li><strong>Dados de uso:</strong> requisições, cotações, pedidos e ações realizadas dentro da plataforma associadas ao seu usuário.</li>
              <li><strong>Dados técnicos:</strong> endereço IP, tipo de navegador e logs de acesso para fins de segurança e auditoria.</li>
            </ul>
          </section>

          <section>
            <h2>3. Como usamos seus dados</h2>
            <p>Utilizamos suas informações exclusivamente para:</p>
            <ul className="list-disc ml-5 space-y-1.5 mt-3">
              <li>Autenticar e autorizar o acesso à plataforma conforme seu papel (solicitante, comprador, aprovador, admin).</li>
              <li>Registrar e processar requisições, cotações e pedidos de compra.</li>
              <li>Auditar operações para fins de controle interno e conformidade.</li>
              <li>Enviar notificações operacionais por e-mail (ex.: aprovação de pedidos, convite de acesso).</li>
              <li>Melhorar a experiência da plataforma com base no uso agregado.</li>
            </ul>
            <p className="mt-3">
              <strong>Não vendemos, alugamos nem compartilhamos seus dados com terceiros</strong> para fins
              comerciais ou de marketing.
            </p>
          </section>

          <section>
            <h2>4. Base legal (LGPD)</h2>
            <p>
              O tratamento de dados é realizado com base no{" "}
              <strong>legítimo interesse</strong> do Grupo LHG para gestão operacional interna
              e no <strong>cumprimento de obrigações contratuais</strong> (vínculo empregatício
              ou contratual com os colaboradores).
            </p>
          </section>

          <section>
            <h2>5. Compartilhamento de dados</h2>
            <p>Seus dados podem ser acessados pelos seguintes subprocessadores:</p>
            <ul className="list-disc ml-5 space-y-1.5 mt-3">
              <li><strong>Supabase Inc.</strong> — banco de dados e autenticação (servidores na AWS São Paulo).</li>
              <li><strong>Vercel Inc.</strong> — hospedagem e CDN da aplicação.</li>
              <li><strong>Google LLC</strong> — autenticação OAuth (somente e-mail e nome público).</li>
              <li><strong>Resend Inc.</strong> — envio de e-mails transacionais.</li>
            </ul>
            <p className="mt-3">
              Todos os subprocessadores seguem políticas de privacidade adequadas e tratam
              dados apenas conforme instruído pelo Grupo LHG.
            </p>
          </section>

          <section>
            <h2>6. Retenção de dados</h2>
            <p>
              Mantemos seus dados enquanto o vínculo com o Grupo LHG estiver ativo. Após o
              desligamento, os dados operacionais são retidos por até <strong>5 anos</strong> para
              fins de auditoria, conforme exigências fiscais e trabalhistas. Dados de autenticação
              são excluídos em até <strong>30 dias</strong> após o encerramento do acesso.
            </p>
          </section>

          <section>
            <h2>7. Seus direitos</h2>
            <p>Como titular dos dados, você tem direito a:</p>
            <ul className="list-disc ml-5 space-y-1.5 mt-3">
              <li>Confirmar a existência e acessar seus dados.</li>
              <li>Solicitar a correção de dados incorretos ou desatualizados.</li>
              <li>Solicitar a exclusão dos dados, quando legalmente possível.</li>
              <li>Obter informações sobre o compartilhamento de seus dados.</li>
            </ul>
            <p className="mt-3">
              Para exercer seus direitos, entre em contato:{" "}
              <a href="mailto:privacidade@lhgmoteis.com.br">privacidade@lhgmoteis.com.br</a>
            </p>
          </section>

          <section>
            <h2>8. Segurança</h2>
            <p>
              Adotamos medidas técnicas e organizacionais para proteger seus dados, incluindo
              criptografia em trânsito (HTTPS/TLS), autenticação JWT com expiração controlada,
              controle de acesso por papel (RBAC) e políticas de Row Level Security no banco.
              Em caso de incidente de segurança, notificaremos os afetados conforme exigido pela LGPD.
            </p>
          </section>

          <section>
            <h2>9. Cookies</h2>
            <p>
              Utilizamos apenas cookies estritamente necessários para manter a sessão autenticada.
              Não usamos cookies de rastreamento ou publicidade. Os cookies de sessão expiram
              automaticamente ao fechar o navegador ou após o período de inatividade configurado.
            </p>
          </section>

          <section>
            <h2>10. Alterações nesta política</h2>
            <p>
              Reservamo-nos o direito de atualizar esta Política periodicamente. Quando houver
              alterações significativas, notificaremos os usuários por e-mail com antecedência
              mínima de 10 dias. A versão vigente estará sempre disponível nesta página com a
              data da última atualização.
            </p>
          </section>

          <section>
            <h2>11. Contato</h2>
            <p>
              Para dúvidas, solicitações ou comunicações relacionadas a privacidade:
            </p>
            <div className="mt-3 p-4 rounded-lg border border-zinc-800 bg-zinc-900/40 text-sm space-y-1">
              <p><strong>Grupo LHG — Encarregado de Dados (DPO)</strong></p>
              <p>E-mail: <a href="mailto:privacidade@lhgmoteis.com.br">privacidade@lhgmoteis.com.br</a></p>
              <p>Suporte técnico: <a href="mailto:suporte@lhgmoteis.com.br">suporte@lhgmoteis.com.br</a></p>
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
