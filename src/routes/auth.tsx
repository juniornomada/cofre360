import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { getFriendlyErrorMessage } from "@/lib/utils";

const PASSWORD_MIN_LENGTH = 12;

function getPasswordPolicyError(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) return `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres na senha.`;
  if (!/[a-z]/.test(password)) return "Inclua pelo menos uma letra minúscula na senha.";
  if (!/[A-Z]/.test(password)) return "Inclua pelo menos uma letra maiúscula na senha.";
  if (!/[0-9]/.test(password)) return "Inclua pelo menos um número na senha.";
  if (!/[^A-Za-z0-9]/.test(password)) return "Inclua pelo menos um símbolo na senha.";
  return null;
}

function AuthPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedEmail = email.trim().toLowerCase();
    if (isSignUp) {
      const passwordPolicyError = getPasswordPolicyError(password);
      if (passwordPolicyError) {
        toast.error(passwordPolicyError);
        return;
      }
    }

    setLoading(true);

    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth`,
          }
        });
        if (error) throw error;

        if (data.user && data.session) {
          toast.success("Cadastro realizado com sucesso!");
        } else {
          toast.success("Cadastro criado. Confirme seu e-mail para entrar.", {
            description: "Enviamos um link de confirmação para o endereço informado.",
            duration: 8000,
          });
          setPassword("");
          setIsSignUp(false);
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: normalizedEmail,
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
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 pb-20">
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
                autoComplete="email"
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
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength={isSignUp ? PASSWORD_MIN_LENGTH : undefined}
                aria-describedby={isSignUp ? "password-requirements" : undefined}
                required
                className="rounded-xl"
              />
              {isSignUp && (
                <p id="password-requirements" className="text-[11px] leading-relaxed text-muted-foreground">
                  Use pelo menos 12 caracteres, com letra maiúscula, minúscula, número e símbolo.
                </p>
              )}
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

          </div>
        </form>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});
