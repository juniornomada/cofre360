import { createFileRoute } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { User, LogOut, Settings, Bell, Shield, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { useState, useEffect } from "react";

function ProfilePage() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      setEmail(user?.email || null);
    });
  }, []);

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      toast.error("Erro ao sair: " + error.message);
    } else {
      window.location.href = "/auth";
    }
  };

  const menuItems = [
    { icon: Settings, label: "Configurações", description: "Preferências do app" },
    { icon: Bell, label: "Notificações", description: "Alertas e lembretes" },
    { icon: Shield, label: "Segurança", description: "Senha e biometria" },
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <div className="p-6 pt-12 bg-card border-b border-border">
        <div className="flex items-center gap-4">
          <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="h-8 w-8 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Meu Perfil</h1>
            <p className="text-sm text-muted-foreground">{email || "Carregando..."}</p>
          </div>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="space-y-2">
          {menuItems.map((item, idx) => (
            <button
              key={idx}
              className="w-full flex items-center justify-between p-4 rounded-2xl bg-card border border-border hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center">
                  <item.icon className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="text-left">
                  <p className="text-sm font-semibold text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            </button>
          ))}
        </div>

        <Button
          onClick={handleLogout}
          variant="destructive"
          className="w-full rounded-2xl py-6 flex items-center gap-2 font-bold shadow-lg shadow-destructive/10"
        >
          <LogOut className="h-5 w-5" />
          Sair da conta
        </Button>

        <div className="text-center pt-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Cofre 360 • Versão 1.0.0</p>
        </div>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});
