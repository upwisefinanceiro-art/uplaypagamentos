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
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card/95 backdrop-blur-sm border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img src="/logo.png" alt="EnsinUP" className="h-8 w-auto" />
          <span className="text-sm font-semibold text-foreground">EnsinUP</span>
        </div>
        <button
          onClick={() => navigate("/login")}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          <LogOut size={20} />
        </button>
      </header>

      {/* Content */}
      <main className="flex-1 pb-20 overflow-y-auto">
        <Outlet />
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 bg-card/95 backdrop-blur-sm border-t border-border">
        <div className="flex items-center justify-around py-2">
          {tabs.map(({ path, icon: Icon, label }) => (
            <button
              key={path}
              onClick={() => navigate(path)}
              className={`flex flex-col items-center gap-0.5 px-4 py-1.5 rounded-lg transition-colors ${
                isActive(path)
                  ? "text-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={20} />
              <span className="text-[10px] font-medium">{label}</span>
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
};

export default AppLayout;
