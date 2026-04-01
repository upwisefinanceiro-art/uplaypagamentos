import { useState, useEffect } from "react";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { getUnitWhatsAppNumber, DEFAULT_WHATSAPP_FINANCEIRO } from "@/lib/whatsapp-utils";

interface Props {
  studentName?: string;
  unitName?: string;
}

const WhatsAppFinanceiroFab = ({ studentName, unitName }: Props) => {
  const { profile, user } = useAuth();
  const [whatsappNumber, setWhatsappNumber] = useState(DEFAULT_WHATSAPP_FINANCEIRO);

  useEffect(() => {
    if (!profile?.unit_id) return;
    getUnitWhatsAppNumber(profile.unit_id).then(setWhatsappNumber);
  }, [profile?.unit_id]);

  const handleOpen = () => {
    const responsibleName = profile?.full_name || "Responsável";
    let msg = `Olá, aqui é ${responsibleName}.\n\n`;
    msg += `Estou na área de pagamentos da EnsinUP e preciso de ajuda com minha cobrança.\n\n`;
    if (studentName) msg += `Aluno: ${studentName}\n`;
    if (unitName) msg += `Unidade: ${unitName}\n`;

    const url = `https://wa.me/55${whatsappNumber}?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank");
  };

  return (
    <button
      onClick={handleOpen}
      className="fixed bottom-24 right-4 z-40 w-14 h-14 rounded-full bg-success text-success-foreground shadow-lg flex items-center justify-center hover:bg-success/90 active:scale-95 transition-all"
      aria-label="Falar com financeiro via WhatsApp"
    >
      <MessageCircle size={24} />
    </button>
  );
};

export default WhatsAppFinanceiroFab;
