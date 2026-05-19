const CUSTOM_MESSAGE_UNIT_IDS = new Set<string>([
  "9cf070e2-6604-4a3e-8962-440b5d233013",
  "e339ec3d-c27f-4676-9078-cd52dab7eede",
]);

const DEFAULT_PASSWORD = "12345678";
const APP_URL = "https://uplaypagamento.com.br";
const INSTALL_URL = "https://uplaypagamento.com.br/instalar";

interface AppAccessMessageParams {
  fullName: string;
  email?: string | null;
  unitId?: string | null;
  login?: string | null;
}

const getFirstName = (fullName: string) => fullName.trim().split(" ")[0] || fullName.trim();

export const buildAppAccessMessage = ({ fullName, email, unitId, login }: AppAccessMessageParams) => {
  const firstName = getFirstName(fullName);
  const resolvedLogin = login || email || "";
  const isCustomUnit = unitId ? CUSTOM_MESSAGE_UNIT_IDS.has(unitId) : false;
  const unitName = isCustomUnit ? "Escola Up wise / Ensinup" : "Upplay";

  return (
    `Olá, Professor(a) *${firstName}*.

` +
    `Seja bem-vindo(a) ao aplicativo escolar da *${unitName}*.

` +
    `Agora você poderá acompanhar sua rotina acadêmica com mais praticidade, organização e acesso às suas aulas diretamente pelo aplicativo.

` +
    `📲 *Baixe o aplicativo:*
${APP_URL}

` +
    `🔐 *Seus dados de acesso:*

` +
    `*Login:*
${resolvedLogin}

` +
    `*Senha inicial:*
${DEFAULT_PASSWORD}

` +
    `No aplicativo você poderá visualizar:
` +
    `• Calendário
` +
    `• Horários
` +
    `• Aulas
` +
    `• Agenda
` +
    `• Pagamentos

` +
    `Após o primeiro acesso, recomendamos alterar sua senha.

` +
    `Desejamos uma excelente experiência na plataforma! 🎓`
  );
};

export const buildAppAccessCopyText = ({ fullName, email, unitId, login }: AppAccessMessageParams) => {
  const firstName = getFirstName(fullName);
  const resolvedLogin = login || email || "";
  const isCustomUnit = unitId ? CUSTOM_MESSAGE_UNIT_IDS.has(unitId) : false;
  const unitName = isCustomUnit ? "Escola Up wise / Ensinup" : "Upplay";

  return (
    `Olá, Professor(a) *${firstName}*.

` +
    `Seja bem-vindo(a) ao aplicativo escolar da *${unitName}*.

` +
    `Agora você poderá acompanhar sua rotina acadêmica com mais praticidade, organização e acesso às suas aulas diretamente pelo aplicativo.

` +
    `📲 *Baixe o aplicativo:*
${APP_URL}

` +
    `🔐 *Seus dados de acesso:*

` +
    `*Login:*
${resolvedLogin}

` +
    `*Senha inicial:*
${DEFAULT_PASSWORD}

` +
    `No aplicativo você poderá visualizar:
` +
    `• Calendário
` +
    `• Horários
` +
    `• Aulas
` +
    `• Agenda
` +
    `• Pagamentos

` +
    `Após o primeiro acesso, recomendamos alterar sua senha.

` +
    `Desejamos uma excelente experiência na plataforma! 🎓

` +
    `📲 *Instale o app no celular:*
${INSTALL_URL}`
  );
};

export { APP_URL, CUSTOM_MESSAGE_UNIT_IDS, DEFAULT_PASSWORD, INSTALL_URL };