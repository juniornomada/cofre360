import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/utils";

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
          }
        });
        if (error) throw error;
        
        if (data.user && data.session) {
          toast.success("Cadastro realizado com sucesso! Você já está logado.");
        } else {
          const friendly = getFriendlyErrorMessage("EMAIL_NOT_CONFIRMED");
          toast.warning(
            friendly.message,
            {
              description: "Tente entrar manualmente com seu e-mail e senha. Se o problema persistir, verifique se a confirmação de e-mail foi desativada no painel do Supabase.",
              duration: 8000,
            }
          );
          setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        toast.success("Login realizado com sucesso!");
      }
    } catch (error: any) {
      toast.error(getFriendlyErrorMessage(error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 pb-20">
      <div className="w-full max-w-sm space-y-8 rounded-2xl bg-card p-8 border border-border shadow-xl">
        <div className="text-center">
          <div
            className="inline-flex flex-col leading-none select-none rounded-xl border px-3 py-1.5 mb-6"
            style={{
              borderColor: "hsl(142 95% 55%)",
              boxShadow:
                "0 0 10px hsl(142 95% 55% / 0.9), 0 0 20px hsl(142 95% 55% / 0.6), inset 0 0 6px hsl(142 95% 55% / 0.35)",
            }}
          >
            <span className="text-xl font-extrabold tracking-tight text-primary dark:text-[hsl(142_95%_62%)] dark:[text-shadow:0_0_10px_hsl(142_95%_55%/0.85),0_0_20px_hsl(142_95%_55%/0.55)]">
              cofre <span className="text-primary/80 dark:text-[hsl(142_95%_70%)]">360</span>
            </span>
          </div>
          <p className="text-sm text-muted-foreground">
            {isSignUp ? "Crie sua conta para começar" : "Entre para gerenciar suas finanças"}
          </p>
        </div>

        <form onSubmit={handleAuth} className="mt-8 space-y-6">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Sua senha"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="rounded-xl"
              />
            </div>
          </div>

          <Button type="submit" className="w-full rounded-xl py-6 font-bold" disabled={loading}>
            {loading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : isSignUp ? (
              "Cadastrar"
            ) : (
              "Entrar"
            )}
          </Button>

          <div className="space-y-4 text-center">
            <button
              type="button"
              onClick={() => setIsSignUp(!isSignUp)}
              className="text-sm font-medium text-primary hover:underline"
            >
              {isSignUp ? "Já tem uma conta? Entre aqui" : "Não tem conta? Cadastre-se agora"}
            </button>

            {isSignUp && (
              <div className="mt-8 rounded-xl border border-border bg-muted/30 p-4 text-left">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                  Checklist para Login Automático
                </h4>
                <ul className="space-y-2 text-xs text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <div className="mt-1 h-3 w-3 rounded-full border border-primary/50 flex items-center justify-center text-[10px] text-primary font-bold">1</div>
                    <span>Acesse o <strong>Dashboard do Supabase</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="mt-1 h-3 w-3 rounded-full border border-primary/50 flex items-center justify-center text-[10px] text-primary font-bold">2</div>
                    <span>Vá em <strong>Authentication &gt; Providers &gt; Email</strong></span>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="mt-1 h-3 w-3 rounded-full border border-primary/50 flex items-center justify-center text-[10px] text-primary font-bold">3</div>
                    <span>Desative a opção <strong>"Confirm email"</strong> e salve</span>
                  </li>
                </ul>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});
