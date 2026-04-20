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

  if (isCustomUnit) {
    return (
      `Olá, *${firstName}*! 👋\n\n` +
      `📚 App da *Escola Up wise / Ensinup* 📚\n\n` +
      `Aqui é da *UPLAY Pagamentos*. Seu acesso ao aplicativo já está disponível ✅\n\n` +
      `📲 *Acesse pelo link:*\n${APP_URL}\n\n` +
      `📧 *E-mail:* ${resolvedLogin}\n` +
      `🔒 *Senha:* ${DEFAULT_PASSWORD}\n\n` +
      `Por favor, acesse o app e acompanhe seus pagamentos.\n\n` +
      `Qualquer dúvida estamos à disposição! 😊`
    );
  }

  return (
    `Olá, *${firstName}*! 👋\n\n` +
    `Aqui é da *UPLAY Pagamentos*.\n\n` +
    `Seu acesso ao aplicativo já está disponível ✅\n\n` +
    `📲 *Acesse pelo link:*\n${APP_URL}\n\n` +
    `📧 *E-mail:* ${resolvedLogin}\n` +
    `🔒 *Senha:* ${DEFAULT_PASSWORD}\n\n` +
    `Por favor, acesse o app e acompanhe seus pagamentos.\n\n` +
    `Qualquer dúvida estamos à disposição! 😊`
  );
};

export const buildAppAccessCopyText = ({ fullName, email, unitId, login }: AppAccessMessageParams) => {
  const message = buildAppAccessMessage({ fullName, email, unitId, login });
  return `${message}\n\n📲 *Instale o app no celular:*\n${INSTALL_URL}`;
};

export { APP_URL, CUSTOM_MESSAGE_UNIT_IDS, DEFAULT_PASSWORD, INSTALL_URL };