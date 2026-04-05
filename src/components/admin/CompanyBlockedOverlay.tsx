import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";

const CompanyBlockedOverlay = () => {
  const { profile, hasRole } = useAuth();
  const [companyStatus, setCompanyStatus] = useState<string | null>(null);
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(null);
  const [blockDeadline, setBlockDeadline] = useState<string | null>(null);
  const [invoiceUrl, setInvoiceUrl] = useState<string | null>(null);

  useEffect(() => {
    const fetchStatus = async () => {
      if (!profile?.unit_id) return;
      if (hasRole("SUPER_ADMIN")) return;

      // Also check unit-level status (BLOQUEADO/INATIVO)
      const { data: unit } = await supabase
        .from("units")
        .select("company_id, status")
        .eq("id", profile.unit_id)
        .maybeSingle();

      // If unit itself is blocked/inactive, show blocked
      if (unit?.status === "BLOQUEADO" || unit?.status === "INATIVO") {
        setCompanyStatus("BLOQUEADO");
        return;
      }

      if (!unit?.company_id) return;

      const [companyRes, subRes] = await Promise.all([
        supabase.from("companies").select("status").eq("id", unit.company_id).maybeSingle(),
        supabase.from("saas_subscriptions").select("status, block_deadline").eq("company_id", unit.company_id).maybeSingle(),
      ]);

      if (companyRes.data) setCompanyStatus(companyRes.data.status);
      if (subRes.data) {
        setSubscriptionStatus((subRes.data as any).status);
        setBlockDeadline((subRes.data as any).block_deadline);
      }

      // Get latest unpaid invoice
      const { data: invoice } = await supabase
        .from("saas_invoices")
        .select("invoice_url")
        .eq("company_id", unit.company_id)
        .in("status", ["PENDING", "OVERDUE"])
        .order("due_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (invoice?.invoice_url) setInvoiceUrl(invoice.invoice_url);
    };

    fetchStatus();
  }, [profile?.unit_id]);

  if (!companyStatus || companyStatus === "ATIVO") return null;

  const isBlocked = companyStatus === "BLOQUEADO";

  if (!isBlocked) {
    // Show warning banner for ATRASADO
    if (companyStatus === "ATRASADO") {
      return (
        <div className="mb-4 px-4 py-3 rounded-lg flex items-center gap-3 text-sm bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border border-yellow-500/30">
          <AlertTriangle size={18} className="flex-shrink-0" />
          <span className="flex-1">
            Sua assinatura da plataforma está pendente.
            {blockDeadline && (
              <> Prazo limite: <strong>{new Date(blockDeadline + "T00:00:00").toLocaleDateString("pt-BR")}</strong></>
            )}
          </span>
          {invoiceUrl && (
            <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="outline" className="gap-1.5 text-xs">
                <ExternalLink size={12} /> Ver fatura
              </Button>
            </a>
          )}
        </div>
      );
    }
    return null;
  }

  // Full blocking overlay
  return (
    <div className="fixed inset-0 z-40 bg-background/95 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/20 flex items-center justify-center">
          <AlertTriangle size={32} className="text-destructive" />
        </div>
        <h1 className="text-xl font-bold text-foreground">Acesso Bloqueado</h1>
        <p className="text-sm text-muted-foreground">
          Sua assinatura da plataforma está em atraso. Regularize o pagamento para continuar utilizando o sistema.
        </p>
        {invoiceUrl && (
          <a href={invoiceUrl} target="_blank" rel="noopener noreferrer">
            <Button className="gap-2">
              <ExternalLink size={16} /> Acessar fatura para pagamento
            </Button>
          </a>
        )}
        <p className="text-xs text-muted-foreground">
          Após a confirmação do pagamento, o acesso será restaurado automaticamente.
        </p>
      </div>
    </div>
  );
};

export default CompanyBlockedOverlay;
