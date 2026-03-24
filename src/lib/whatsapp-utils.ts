import { supabase } from "@/integrations/supabase/client";

export const DEFAULT_WHATSAPP_FINANCEIRO = "31996726918";

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
