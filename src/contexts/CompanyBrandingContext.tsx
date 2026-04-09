import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

interface CompanyBranding {
  companyId: string | null;
  name: string;
  systemName: string;
  logoUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  loading: boolean;
}

const defaultBranding: CompanyBranding = {
  companyId: null,
  name: "UPLAY",
  systemName: "UPLAY Pagamentos",
  logoUrl: "/logo.png",
  primaryColor: "#3B82F6",
  secondaryColor: "#1E40AF",
  loading: true,
};

const CompanyBrandingContext = createContext<CompanyBranding>(defaultBranding);

export const CompanyBrandingProvider = ({ children }: { children: ReactNode }) => {
  const { profile } = useAuth();
  const [branding, setBranding] = useState<CompanyBranding>(defaultBranding);

  useEffect(() => {
    const fetchBranding = async () => {
      if (!profile?.unit_id) {
        setBranding(prev => ({ ...prev, loading: false }));
        return;
      }

      // Get company via unit
      const { data: unit } = await supabase
        .from("units_public")
        .select("company_id")
        .eq("id", profile.unit_id)
        .maybeSingle();

      if (!unit?.company_id) {
        setBranding(prev => ({ ...prev, loading: false }));
        return;
      }

      const { data: company } = await supabase
        .from("companies")
        .select("id, name, system_name, logo_url, primary_color, secondary_color")
        .eq("id", unit.company_id)
        .maybeSingle();

      if (company) {
        setBranding({
          companyId: company.id,
          name: company.name,
          systemName: company.system_name,
          logoUrl: company.logo_url || "/logo.png",
          primaryColor: company.primary_color,
          secondaryColor: company.secondary_color,
          loading: false,
        });

        // Apply CSS custom properties for white-label
        const root = document.documentElement;
        root.style.setProperty("--company-primary", company.primary_color);
        root.style.setProperty("--company-secondary", company.secondary_color);
      } else {
        setBranding(prev => ({ ...prev, loading: false }));
      }
    };

    fetchBranding();
  }, [profile?.unit_id]);

  return (
    <CompanyBrandingContext.Provider value={branding}>
      {children}
    </CompanyBrandingContext.Provider>
  );
};

export const useCompanyBranding = () => useContext(CompanyBrandingContext);
