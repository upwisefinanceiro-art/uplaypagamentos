import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

const PrivacyPolicy = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft size={18} />
          <span className="text-sm">Voltar</span>
        </button>

        <h1 className="text-2xl font-bold">Política de Privacidade</h1>
        <p className="text-sm text-muted-foreground">Última atualização: 15 de abril de 2026</p>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">1. Introdução</h2>
          <p className="text-sm leading-relaxed">
            A <strong>UPLAY Pagamentos</strong> ("nós", "nosso") valoriza a privacidade dos seus usuários. Esta Política de Privacidade descreve como coletamos, usamos, armazenamos e protegemos suas informações pessoais ao utilizar nosso aplicativo e serviços.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">2. Dados Coletados</h2>
          <p className="text-sm leading-relaxed">Coletamos os seguintes tipos de dados pessoais:</p>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li><strong>Dados de identificação:</strong> nome completo, CPF, RG, data de nascimento</li>
            <li><strong>Dados de contato:</strong> e-mail, telefone, endereço</li>
            <li><strong>Dados financeiros:</strong> informações de pagamento, histórico de cobranças, boletos e transações via PIX</li>
            <li><strong>Dados de acesso:</strong> credenciais de login (e-mail e senha criptografada)</li>
            <li><strong>Dados de uso:</strong> interações com o aplicativo, logs de acesso</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">3. Finalidade do Tratamento</h2>
          <p className="text-sm leading-relaxed">Utilizamos seus dados para:</p>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>Gerenciar matrículas, contratos e cobranças de cursos</li>
            <li>Processar pagamentos via boleto, PIX e cartão de crédito</li>
            <li>Enviar notificações de cobranças e vencimentos por WhatsApp e e-mail</li>
            <li>Fornecer suporte ao cliente</li>
            <li>Cumprir obrigações legais e regulatórias</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">4. Compartilhamento de Dados</h2>
          <p className="text-sm leading-relaxed">
            Seus dados podem ser compartilhados com os seguintes terceiros, estritamente para a prestação dos serviços:
          </p>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li><strong>Asaas:</strong> plataforma de processamento de pagamentos (boletos, PIX, cartão)</li>
            <li><strong>Provedores de infraestrutura:</strong> serviços de hospedagem e banco de dados em nuvem</li>
          </ul>
          <p className="text-sm leading-relaxed">
            Não vendemos, alugamos ou compartilhamos seus dados pessoais com terceiros para fins de marketing.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">5. Segurança dos Dados</h2>
          <p className="text-sm leading-relaxed">
            Adotamos medidas técnicas e organizacionais adequadas para proteger seus dados, incluindo:
          </p>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>Criptografia de dados em trânsito (HTTPS/TLS)</li>
            <li>Senhas armazenadas com hash criptográfico (nunca em texto plano)</li>
            <li>Controle de acesso baseado em funções (RBAC)</li>
            <li>Políticas de segurança em nível de linha (RLS) no banco de dados</li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">6. Retenção de Dados</h2>
          <p className="text-sm leading-relaxed">
            Seus dados pessoais são mantidos pelo tempo necessário para cumprir as finalidades descritas nesta política, ou conforme exigido por lei. Dados financeiros são retidos pelo prazo legal mínimo de 5 anos para fins contábeis e fiscais.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">7. Seus Direitos (LGPD)</h2>
          <p className="text-sm leading-relaxed">
            Em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), você tem direito a:
          </p>
          <ul className="list-disc pl-6 text-sm space-y-1">
            <li>Confirmar a existência de tratamento de dados</li>
            <li>Acessar seus dados pessoais</li>
            <li>Corrigir dados incompletos, inexatos ou desatualizados</li>
            <li>Solicitar a anonimização, bloqueio ou eliminação de dados desnecessários</li>
            <li>Solicitar a portabilidade dos dados</li>
            <li>Revogar o consentimento a qualquer momento</li>
          </ul>
          <p className="text-sm leading-relaxed">
            Para exercer seus direitos, entre em contato pelo e-mail: <strong>upwisefinanceiro@gmail.com</strong>
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">8. Cookies e Tecnologias Similares</h2>
          <p className="text-sm leading-relaxed">
            Utilizamos armazenamento local (localStorage) para manter sua sessão de login ativa. Não utilizamos cookies de rastreamento ou publicidade.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">9. Alterações nesta Política</h2>
          <p className="text-sm leading-relaxed">
            Reservamo-nos o direito de atualizar esta Política de Privacidade a qualquer momento. Alterações significativas serão comunicadas por meio do aplicativo.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-lg font-semibold">10. Contato</h2>
          <p className="text-sm leading-relaxed">
            Em caso de dúvidas sobre esta Política de Privacidade ou sobre o tratamento dos seus dados, entre em contato:
          </p>
          <ul className="list-none text-sm space-y-1">
            <li>📧 E-mail: <strong>upwisefinanceiro@gmail.com</strong></li>
            <li>📱 WhatsApp: <strong>(31) 99566-2419</strong></li>
          </ul>
        </section>

        <div className="border-t border-border pt-4 mt-8">
          <p className="text-xs text-muted-foreground text-center">
            © 2026 UPLAY Pagamentos. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
