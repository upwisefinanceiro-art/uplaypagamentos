export const APP_URL = "https://uplaypagamentos.lovable.app/login";
export const INSTALL_URL = "https://uplaypagamentos.lovable.app/instalar";
export const DEFAULT_CLIENT_PASSWORD = "12345678";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;

export function isValidEmail(email?: string | null): boolean {
  return !!email && EMAIL_REGEX.test(email.trim());
}

export function isPlaceholderClientEmail(email?: string | null): boolean {
  return /@(imported\.)?uplay\.app$/i.test((email || "").trim());
}

export function normalizePhoneDigits(phone?: string | null): string {
  return (phone || "").replace(/\D/g, "");
}

export function getClientLogin(cpf?: string | null, email?: string | null): string {
  const cleanCpf = (cpf || "").replace(/\D/g, "");
  if (cleanCpf.length === 11) {
    return cleanCpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  }

  return (email || "").trim().toLowerCase();
}

export function buildClientAccessMessage(params: {
  cpf?: string | null;
  email?: string | null;
  fullName?: string | null;
}): string {
  const login = getClientLogin(params.cpf, params.email);
  const greeting = params.fullName ? `Olá, ${params.fullName}! 👋\n\n` : "Olá!\n\n";

  return `${greeting}📚 *Upwise / Ensino Up — Cursos Profissionalizantes*\n\nSeu acesso ao app de pagamentos está disponível:\n\n🔑 *Login:* ${login}\n🔒 *Senha:* ${DEFAULT_CLIENT_PASSWORD}\n\n📲 Acesse aqui: ${APP_URL}\n\n📱 *Instale o app no celular:*\n${INSTALL_URL}\n\nEm caso de dúvidas, estamos à disposição! 😊\n\nAtenciosamente,\n*Setor Financeiro*`;
}

export function needsAsaasSync(email?: string | null, phone?: string | null): boolean {
  const digits = normalizePhoneDigits(phone);
  return !isValidEmail(email) || isPlaceholderClientEmail(email) || !digits || /^0+$/.test(digits) || digits.length < 10;
}