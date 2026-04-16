import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_WHATSAPP_FINANCEIRO = "31996726918";

type StandaloneNavigator = Navigator & { standalone?: boolean };

export function normalizeWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  return digits.startsWith("55") ? digits : `55${digits}`;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalizedPhone = normalizeWhatsAppNumber(phone);
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}

export function openWhatsApp(phone: string, message: string): void {
  const url = buildWhatsAppUrl(phone, message);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as StandaloneNavigator).standalone === true;

  if (!isStandalone) {
    const popup = window.open(url, "_blank", "noopener,noreferrer");
    if (popup) {
      popup.opener = null;
      return;
    }
  }

  window.location.assign(url);
}

/**
 * Resolve the WhatsApp number for a given unit.
 * If the unit has usar_whatsapp_padrao = true or no custom number, returns the default.
 */
export async function getUnitWhatsAppNumber(unitId: string): Promise<string> {
  try {
    const { data } = await supabase
      .from("units")
      .select("whatsapp_financeiro, usar_whatsapp_padrao")
      .eq("id", unitId)
      .single();

    if (data) {
      const row = data as unknown as { whatsapp_financeiro: string | null; usar_whatsapp_padrao: boolean };
      if (!row.usar_whatsapp_padrao && row.whatsapp_financeiro) {
        return row.whatsapp_financeiro.replace(/\D/g, "");
      }
    }
  } catch {
    // fallback to default
  }
  return DEFAULT_WHATSAPP_FINANCEIRO;
}

