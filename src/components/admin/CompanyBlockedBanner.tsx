import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle } from "lucide-react";

interface SubscriptionInfo {
  status: string;
  next_billing_date: string | null;
  block_deadline: string | null;
}

const CompanyBlockedBanner = () => {
  const { profile, hasRole } = useAuth();
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [companyStatus, setCompanyStatus] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      if (!profile?.unit_id) return;
      if (hasRole("SUPER_ADMIN")) return;

      // Get company_id
      const { data: unit } = await supabase
        .from("units")
        .select("company_id")
        .eq("id", profile.unit_id)
        .maybeSingle();

      if (!unit?.company_id) return;

      // Get company status
      const { data: company } = await supabase
        .from("companies")
        .select("status")
        .eq("id", unit.company_id)
        .maybeSingle();

      if (company) setCompanyStatus(company.status);

      // Get subscription
      const { data: sub } = await supabase
        .from("saas_subscriptions")
        .select("status, next_billing_date, block_deadline")
        .eq("company_id", unit.company_id)
        .maybeSingle();

      if (sub) setSubscription(sub as SubscriptionInfo);
    };

    fetchStatus();
  }, [profile?.unit_id]);

  if (!companyStatus || companyStatus === "ATIVO") return null;

  const isBlocked = companyStatus === "BLOQUEADO";
  const isLate = companyStatus === "ATRASADO" || subscription?.status === "OVERDUE";

  if (!isBlocked && !isLate) return null;

  return (
    <div className={`px-4 py-3 flex items-center gap-3 text-sm ${
      isBlocked
        ? "bg-destructive/15 text-destructive border-b border-destructive/30"
        : "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-b border-yellow-500/30"
    }`}>
      <AlertTriangle size={18} className="flex-shrink-0" />
      <div className="flex-1">
        {isBlocked ? (
          <span className="font-medium">
            Sua assinatura da plataforma está em atraso. Regularize o pagamento para continuar utilizando o sistema.
          </span>
        ) : (
          <span>
            Sua assinatura da plataforma está próxima do vencimento.
            {subscription?.block_deadline && (
              <> Prazo limite: {new Date(subscription.block_deadline + "T00:00:00").toLocaleDateString("pt-BR")}</>
            )}
          </span>
        )}
      </div>
    </div>
  );
};

export default CompanyBlockedBanner;
