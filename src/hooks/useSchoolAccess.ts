import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface SchoolUnit {
  id: string;
  name: string;
  company_id: string;
}

/**
 * Returns the units (within the user's scope) that have the school module enabled.
 * - ADMIN_MASTER: all units of the company with the flag on.
 * - ADMIN_UNIDADE: only own unit if it has the flag on.
 * - SUPER_ADMIN: all units globally with the flag on.
 */
export function useSchoolAccess() {
  const { profile, roles, loading: authLoading } = useAuth();
  const [units, setUnits] = useState<SchoolUnit[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from("units")
          .select("id,name,company_id,school_module_enabled")
          .eq("school_module_enabled", true)
          .order("name");
        if (error) throw error;
        if (cancelled) return;
        setUnits((data ?? []).map((u: any) => ({ id: u.id, name: u.name, company_id: u.company_id })));
      } catch (e) {
        console.error("[useSchoolAccess]", e);
        if (!cancelled) setUnits([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authLoading, profile?.id, roles.join(",")]);

  return { units, loading, hasAccess: units.length > 0 };
}
