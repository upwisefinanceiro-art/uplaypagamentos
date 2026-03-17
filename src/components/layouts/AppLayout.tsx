import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, CreditCard, User, LogOut } from "lucide-react";

const AppLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

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
          onClick={() => navigate("/login")}
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
