import { useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { CalendarDays, Wallet, LogOut, Menu, GraduationCap, KeyRound } from "lucide-react";

const menu = [
  { path: "/professor", end: true, icon: CalendarDays, label: "Minhas Aulas" },
  { path: "/professor/folha", icon: Wallet, label: "Folha de Pagamento" },
  { path: "/professor/alterar-senha", icon: KeyRound, label: "Alterar Senha" },
];

export default function TeacherLayout() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (
      profile?.must_change_password &&
      !location.pathname.endsWith("/alterar-senha")
    ) {
      navigate("/professor/alterar-senha", { replace: true });
    }
  }, [profile?.must_change_password, location.pathname, navigate]);

  const handleLogout = async () => {
    await signOut();
    navigate("/login", { replace: true });
  };


  const Nav = ({ onNav }: { onNav?: () => void }) => (
    <nav className="flex flex-col gap-1 p-3">
      {menu.map((m) => (
        <NavLink
          key={m.path}
          to={m.path}
          end={m.end}
          onClick={onNav}
          className={({ isActive }) =>
            `flex items-center gap-3 px-3 py-2.5 rounded-md text-sm transition-colors ${
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50"
            }`
          }
        >
          <m.icon className="h-4 w-4" />
          {m.label}
        </NavLink>
      ))}
      <button
        onClick={handleLogout}
        className="flex items-center gap-3 px-3 py-2.5 rounded-md text-sm text-sidebar-foreground/80 hover:bg-destructive/10 hover:text-destructive mt-4"
      >
        <LogOut className="h-4 w-4" />
        Sair
      </button>
    </nav>
  );

  const Header = () => (
    <div className="p-4 border-b border-sidebar-border flex items-center gap-3 bg-sidebar">
      <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center">
        <GraduationCap className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="text-sm font-bold text-sidebar-accent-foreground">Área do Professor</p>
        <p className="text-[11px] text-muted-foreground truncate max-w-[160px]">
          {profile?.full_name ?? "—"}
        </p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-background">
      <aside className="hidden md:flex w-64 flex-col bg-sidebar border-r border-sidebar-border">
        <Header />
        <Nav />
      </aside>

      <div className="flex-1 flex flex-col">
        <header className="md:hidden flex items-center justify-between p-3 border-b bg-sidebar">
          <Link to="/professor" className="flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-primary" />
            <span className="font-bold text-sm">Área do Professor</span>
          </Link>
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72">
              <Header />
              <Nav onNav={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </header>

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
