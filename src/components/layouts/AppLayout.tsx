import { useState, useEffect } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, CreditCard, User, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useCompanyBranding } from "@/contexts/CompanyBrandingContext";
import InstallPrompt from "@/components/InstallPrompt";
import WhatsAppFinanceiroFab from "@/components/app/WhatsAppFinanceiroFab";

const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, user, profile } = useAuth();
  const [unitName, setUnitName] = useState("");
  const [studentName, setStudentName] = useState("");

  useEffect(() => {
    if (!user) return;
    const fetchContext = async () => {
      if (profile?.unit_id) {
        const { data } = await supabase.from("units").select("name").eq("id", profile.unit_id).single();
        if (data) setUnitName(data.name);
      }
      const { data: students } = await supabase.from("students").select("full_name").eq("responsible_id", user.id).eq("active", true).limit(1);
      if (students?.[0]) setStudentName(students[0].full_name);
    };
    fetchContext();
  }, [user, profile]);

  const tabs = [
    { path: "/app", icon: Home, label: "Início" },
    { path: "/app/pagamentos", icon: CreditCard, label: "Pagamentos" },
    { path: "/app/perfil", icon: User, label: "Perfil" },
  ];

  const isActive = (path: string) => {
    if (path === "/app") return location.pathname === "/app";
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between" style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}>
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="EnsinUP" className="h-8 w-auto" />
          <span className="text-sm font-semibold text-foreground">EnsinUP</span>
        </div>
        <button
          onClick={async () => {
            await signOut();
            navigate("/login", { replace: true });
          }}
          className="text-muted-foreground hover:text-foreground transition-colors p-2 -mr-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Sair"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 pb-24 overflow-y-auto">
        <Outlet />
      </main>

      {/* WhatsApp FAB */}
      <WhatsAppFinanceiroFab studentName={studentName} unitName={unitName} />

      {/* Install Prompt */}
      <InstallPrompt />

      {/* Bottom Nav */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border"
        style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-around pt-2">
          {tabs.map(({ path, icon: Icon, label }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-1 px-6 py-2 rounded-lg transition-colors min-h-[48px] min-w-[64px] ${
                isActive(path)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={22} />
              <span className="text-[11px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;
