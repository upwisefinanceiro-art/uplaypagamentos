import { Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  Users,
  UserCheck,
  FileText,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  ShieldCheck,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/contexts/AuthContext";

const menuItems = [
  { path: "/admin", icon: LayoutDashboard, label: "Dashboard", roles: ["ADMIN_MASTER", "ADMIN_UNIDADE"] },
  { path: "/admin/unidades", icon: Building2, label: "Unidades", roles: ["ADMIN_MASTER"] },
  { path: "/admin/usuarios", icon: Users, label: "Colaboradores", roles: ["ADMIN_MASTER", "ADMIN_UNIDADE"] },
  { path: "/admin/clientes", icon: UserCheck, label: "Clientes", roles: ["ADMIN_MASTER", "ADMIN_UNIDADE"] },
  { path: "/admin/contratos", icon: FileText, label: "Contratos", roles: ["ADMIN_MASTER", "ADMIN_UNIDADE"] },
  { path: "/admin/cobrancas", icon: CreditCard, label: "Cobranças", roles: ["ADMIN_MASTER", "ADMIN_UNIDADE"] },
];

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { hasRole, signOut } = useAuth();

  const userRole = hasRole("ADMIN_MASTER") ? "ADMIN_MASTER" : "ADMIN_UNIDADE";

  const filteredMenu = menuItems.filter((item) => item.roles.includes(userRole));

  const isActive = (path: string) => {
    if (path === "/admin") return location.pathname === "/admin";
    return location.pathname.startsWith(path);
  };

  const Sidebar = () => (
    <div className="flex flex-col h-full bg-sidebar">
      <div className="p-4 border-b border-sidebar-border flex items-center gap-3">
        <img src="/logo.png" alt="EnsinUP" className="h-9 w-auto" />
        <div>
          <p className="text-sm font-bold text-sidebar-accent-foreground">EnsinUP</p>
          <p className="text-[10px] text-muted-foreground">Painel Administrativo</p>
        </div>
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        {filteredMenu.map(({ path, icon: Icon, label }) => (
          <button
            key={path}
            onClick={() => {
              navigate(path);
              setSidebarOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
              isActive(path)
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            }`}
          >
            <Icon size={18} />
            {label}
          </button>
        ))}
      </nav>

      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={async () => {
            await signOut();
            navigate("/login");
          }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden lg:block w-60 border-r border-border flex-shrink-0 sticky top-0 h-screen">
        <Sidebar />
      </aside>

      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-background/80 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <div className="relative w-64 h-full animate-slide-in-right">
            <Sidebar />
          </div>
          <button
            onClick={() => setSidebarOpen(false)}
            className="absolute top-4 right-4 text-foreground"
          >
            <X size={24} />
          </button>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-card/95 backdrop-blur-sm border-b border-border px-4 lg:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden text-muted-foreground hover:text-foreground"
            >
              <Menu size={22} />
            </button>
            <h2 className="text-sm font-semibold text-foreground truncate">
              {filteredMenu.find((item) => isActive(item.path))?.label || "Dashboard"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
              {userRole === "ADMIN_MASTER" ? "Master" : "Admin"}
            </span>
          </div>
        </header>

        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default AdminLayout;
