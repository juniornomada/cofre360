import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, KeyRound, Loader2, ShieldCheck, ShieldOff, Smartphone, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SmartLink as Link } from "@/components/SmartLink";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

type TotpFactor = {
  id: string;
  status: string;
  friendly_name?: string | null;
};

type Enrollment = {
  factorId: string;
  qrCode: string;
  secret: string;
};

function qrSource(value: string) {
  if (!value) return "";
  if (value.startsWith("data:")) return value;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(value)}`;
}

function SecurityPage() {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<TotpFactor[]>([]);
  const [currentLevel, setCurrentLevel] = useState<string | null>(null);
  const [nextLevel, setNextLevel] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const verifiedFactors = useMemo(
    () => factors.filter((factor) => factor.status === "verified"),
    [factors],
  );

  const refreshSecurityState = useCallback(async () => {
    setLoading(true);
    try {
      const [factorResult, aalResult] = await Promise.all([
        supabase.auth.mfa.listFactors(),
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);

      if (factorResult.error) throw factorResult.error;
      if (aalResult.error) throw aalResult.error;

      setFactors((factorResult.data?.totp || []) as TotpFactor[]);
      setCurrentLevel(aalResult.data?.currentLevel || null);
      setNextLevel(aalResult.data?.nextLevel || null);
    } catch (error) {
      console.error("security settings load failed", error);
      toast.error("Não foi possível carregar as configurações de segurança.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshSecurityState();
  }, [refreshSecurityState]);

  const startEnrollment = async () => {
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Cofre360",
      });
      if (error) throw error;
      if (!data?.id || !data.totp?.qr_code || !data.totp?.secret) {
        throw new Error("Resposta de MFA incompleta");
      }

      setEnrollment({
        factorId: data.id,
        qrCode: data.totp.qr_code,
        secret: data.totp.secret,
      });
      setCode("");
    } catch (error) {
      console.error("MFA enrollment failed", error);
      toast.error("Não foi possível iniciar a autenticação em duas etapas.");
    } finally {
      setBusy(false);
    }
  };

  const verifyFactor = async (factorId: string) => {
    const normalizedCode = code.replace(/\s+/g, "");
    if (!/^\d{6}$/.test(normalizedCode)) {
      toast.error("Digite o código de 6 dígitos do seu autenticador.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({
        factorId,
        code: normalizedCode,
      });
      if (error) throw error;

      toast.success(enrollment ? "Autenticação em duas etapas ativada." : "Código confirmado.");
      setEnrollment(null);
      setCode("");
      await refreshSecurityState();

      if (!enrollment) {
        window.location.href = "/home";
      }
    } catch (error) {
      console.error("MFA verification failed", error);
      toast.error("Código inválido ou expirado.");
    } finally {
      setBusy(false);
    }
  };

  const cancelEnrollment = async () => {
    if (!enrollment) return;
    setBusy(true);
    try {
      await supabase.auth.mfa.unenroll({ factorId: enrollment.factorId });
    } catch {
      // Unverified factors may already have expired; either way, clear local setup state.
    } finally {
      setEnrollment(null);
      setCode("");
      setBusy(false);
      void refreshSecurityState();
    }
  };

  const removeFactor = async (factorId: string) => {
    if (currentLevel !== "aal2") {
      toast.error("Confirme o segundo fator antes de desativar o MFA.");
      return;
    }
    if (!window.confirm("Desativar a autenticação em duas etapas desta conta?")) return;

    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      await supabase.auth.refreshSession();
      toast.success("Autenticação em duas etapas desativada.");
      await refreshSecurityState();
    } catch (error) {
      console.error("MFA unenroll failed", error);
      toast.error("Não foi possível desativar o MFA.");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-primary" />
      </div>
    );
  }

  const needsChallenge =
    verifiedFactors.length > 0 &&
    currentLevel === "aal1" &&
    nextLevel === "aal2";

  if (needsChallenge) {
    const factor = verifiedFactors[0];
    return (
      <main className="mx-auto flex min-h-[80vh] max-w-md flex-col justify-center px-4 py-8">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
            <ShieldCheck className="h-5 w-5 text-primary" />
          </div>
          <h1 className="text-xl font-bold text-foreground">Confirmação em duas etapas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta possui MFA. Digite o código do aplicativo autenticador para liberar os dados financeiros.
          </p>
          <Input
            className="mt-5 text-center text-lg tracking-[0.35em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
            autoFocus
          />
          <Button
            className="mt-3 w-full"
            disabled={busy}
            onClick={() => void verifyFactor(factor.id)}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar e continuar
          </Button>
          <button
            type="button"
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground"
            onClick={async () => {
              await supabase.auth.signOut();
              window.location.href = "/auth";
            }}
          >
            Sair da conta
          </button>
        </section>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 px-3 py-4 pb-24">
      <div className="flex items-center gap-3">
        <Link
          to="/home"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-card"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h1 className="text-lg font-bold text-foreground">Segurança da conta</h1>
          <p className="text-xs text-muted-foreground">Senha, sessão e autenticação em duas etapas</p>
        </div>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
            <KeyRound className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Proteção dos dados</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Ao ativar MFA, sessões futuras precisam chegar ao nível AAL2 antes de acessar tabelas financeiras protegidas por RLS.
            </p>
          </div>
        </div>
      </section>

      {verifiedFactors.length > 0 ? (
        <section className="rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm font-semibold text-foreground">MFA ativo</p>
              <p className="text-xs text-muted-foreground">
                Esta sessão está em {currentLevel === "aal2" ? "AAL2" : "AAL1"}.
              </p>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {verifiedFactors.map((factor) => (
              <div key={factor.id} className="flex items-center justify-between rounded-xl border border-border bg-background/60 px-3 py-2">
                <div className="flex items-center gap-2">
                  <Smartphone className="h-4 w-4 text-muted-foreground" />
                  <span className="text-xs font-medium text-foreground">
                    {factor.friendly_name || "Aplicativo autenticador"}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void removeFactor(factor.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  aria-label="Desativar MFA"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : enrollment ? (
        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="text-sm font-semibold text-foreground">Configure seu autenticador</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Escaneie o QR Code no Google Authenticator, Microsoft Authenticator, 1Password ou outro app TOTP.
          </p>

          <div className="mt-4 flex justify-center rounded-xl bg-white p-3">
            <img src={qrSource(enrollment.qrCode)} alt="QR Code para configurar MFA" className="h-48 w-48" />
          </div>

          <details className="mt-3 rounded-xl border border-border bg-muted/30 p-3">
            <summary className="cursor-pointer text-xs font-medium text-foreground">Não consigo escanear o QR Code</summary>
            <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{enrollment.secret}</p>
          </details>

          <Input
            className="mt-4 text-center text-lg tracking-[0.35em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="000000"
          />

          <div className="mt-3 flex gap-2">
            <Button variant="outline" className="flex-1" disabled={busy} onClick={() => void cancelEnrollment()}>
              Cancelar
            </Button>
            <Button className="flex-1" disabled={busy} onClick={() => void verifyFactor(enrollment.factorId)}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Ativar
            </Button>
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="flex items-center gap-2">
            <ShieldOff className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-semibold text-foreground">MFA desativado</p>
              <p className="text-xs text-muted-foreground">Sua conta usa apenas o primeiro fator de autenticação.</p>
            </div>
          </div>
          <Button className="mt-4 w-full" disabled={busy} onClick={() => void startEnrollment()}>
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Ativar autenticação em duas etapas
          </Button>
        </section>
      )}

      <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">
        Guarde acesso ao seu aplicativo autenticador. O Supabase não fornece códigos de recuperação TOTP tradicionais por padrão.
      </p>
    </main>
  );
}

export const Route = createFileRoute("/security")({
  component: SecurityPage,
});
