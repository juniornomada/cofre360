import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RedemptionAccountPicker, type RedemptionAccount } from "@/components/RedemptionAccountPicker";
export type { RedemptionAccount } from "@/components/RedemptionAccountPicker";
import type { Investment } from "@/lib/investments-calc";
import {
  availablePrincipalCents,
  moneyInput,
  quoteRedemption,
  todayBrazil,
  validateRedemptionDraft,
  type RedemptionDraft,
  type ValidatedRedemption,
} from "@/lib/investment-redemption";

const LAST_ACCOUNT_KEY = "cofre360-last-redemption-account";
const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const newDraft = (inv: Investment): RedemptionDraft => ({
  mode: "total",
  principalText: moneyInput(availablePrincipalCents(inv)),
  accountId: "",
  date: todayBrazil(),
});

export function InvestmentRedemptionDialog({
  investment, accounts, loadingAccounts, saving, onClose, onConfirm,
}: {
  investment: Investment | null;
  accounts: RedemptionAccount[];
  loadingAccounts: boolean;
  saving: boolean;
  onClose: () => void;
  onConfirm: (request: ValidatedRedemption, requestId: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<RedemptionDraft | null>(null);
  const [verified, setVerified] = useState(false);
  const requestIdRef = useRef<string | null>(null);

  useEffect(() => {
    setDraft(investment ? newDraft(investment) : null);
    requestIdRef.current = null;
    setVerified(false);
  }, [investment?.id]);

  // Convenient default only when it matches a real account. User still reviews it.
  useEffect(() => {
    if (!investment || !accounts.length) return;
    let preferred = "";
    try { preferred = localStorage.getItem(LAST_ACCOUNT_KEY) || ""; } catch { /* optional */ }
    const match = accounts.find((account) => account.id === preferred);
    if (match || accounts.length === 1) {
      setDraft((previous) => previous && !previous.accountId
        ? { ...previous, accountId: match?.id || accounts[0].id }
        : previous);
    }
  }, [investment?.id, accounts]);

  if (!investment || !draft) return null;
  const setField = <K extends keyof RedemptionDraft>(key: K, value: RedemptionDraft[K]) => {
    setDraft((previous) => previous ? { ...previous, [key]: value } : previous);
    requestIdRef.current = null;
    setVerified(false);
  };

  const quote = quoteRedemption(investment, draft.mode, draft.principalText);
  const values = quote.value;
  const result = validateRedemptionDraft(investment, draft);
  const accountName = accounts.find((account) => account.id === draft.accountId)?.name || "Conta não selecionada";
  const updatedAt = investment.last_manual_update
    ? new Date(investment.last_manual_update).toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit",
      year: "numeric", hour: "2-digit", minute: "2-digit",
    })
    : null;

  const submit = async () => {
    if (saving || !verified || !result.value || !draft.accountId) return;
    const requestId = requestIdRef.current || crypto.randomUUID();
    requestIdRef.current = requestId;
    const succeeded = await onConfirm(result.value, requestId);
    if (succeeded) {
      try { localStorage.setItem(LAST_ACCOUNT_KEY, result.value.accountId); } catch { /* optional */ }
      requestIdRef.current = null;
    }
  };

  return (
    <Dialog open={!!investment} onOpenChange={(open) => { if (!open && !saving) onClose(); }}>
      <DialogContent className="w-[calc(100vw-20px)] max-w-[430px] max-h-[90dvh] overflow-y-auto rounded-2xl bg-background p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ArrowDownToLine className="h-4 w-4 text-primary" />
            Resgatar investimento
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-border bg-card p-3">
            <p className="break-words text-sm font-semibold">{investment.name}</p>
            <p className="mt-2 text-[11px] text-muted-foreground">Valor líquido salvo na carteira</p>
            <p className="text-2xl font-bold tabular-nums">
              {investment.current_net_value == null ? "Não informado" : money(Number(investment.current_net_value))}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {updatedAt ? `Atualizado em ${updatedAt}` : "Sem data de atualização manual"}
              {" · "}Valor informado, não consultado em tempo real na XP
            </p>
          </div>

          <fieldset className="space-y-2">
            <legend className="text-xs font-semibold">Tipo de resgate</legend>
            <div className="grid grid-cols-2 gap-2">
              {(["total", "partial"] as const).map((mode) => (
                <button key={mode} type="button" disabled={saving}
                  aria-pressed={draft.mode === mode}
                  className={"min-h-11 rounded-lg border px-2 text-xs font-semibold " +
                    (draft.mode === mode ? "border-primary bg-primary/15 text-foreground" : "border-border bg-card text-muted-foreground")}
                  onClick={() => setField("mode", mode)}>
                  {mode === "total" ? "Resgate total" : "Resgate parcial"}
                </button>
              ))}
            </div>
          </fieldset>

          {draft.mode === "partial" && (
            <label className="block space-y-1 text-xs font-semibold">
              Quanto do capital deseja resgatar (R$)?
              <input inputMode="decimal" autoComplete="off" value={draft.principalText}
                onChange={(event) => setField("principalText", event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                aria-label="Valor do capital resgatado" disabled={saving}/>
            </label>
          )}

          {values?.estimated && (
            <p className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-5 text-foreground">
              No resgate parcial, o líquido é uma estimativa proporcional. Confira no extrato da XP:
              o valor efetivamente creditado pode ser diferente.
            </p>
          )}

          <RedemptionAccountPicker
            accounts={accounts}
            value={draft.accountId}
            disabled={saving}
            loading={loadingAccounts}
            onChange={(accountId) => setField("accountId", accountId)}
          />
          <label className="block space-y-1 text-xs font-semibold">
            Data em que o dinheiro entrou na conta
            <input type="date" value={draft.date} max={todayBrazil()}
              onChange={(event) => setField("date", event.target.value)}
              disabled={saving} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"/>
          </label>

          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-bold">{values?.estimated ? "Estimativa do resgate" : "Conferência automática do resgate"}</p>
            <div className="flex justify-between gap-2 text-xs">
              <span>Capital devolvido</span><strong className="tabular-nums">{values ? money(values.principalCents / 100) : "—"}</strong>
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <span>Rendimento líquido (receita)</span><strong className="tabular-nums">{values ? money(values.netYieldCents / 100) : "—"}</strong>
            </div>
            <div className="flex justify-between gap-2 border-t border-border/50 pt-2 text-sm font-semibold">
              <span className="min-w-0 break-words">Entrada em {accountName}</span>
              <strong className="shrink-0 tabular-nums">{values ? money(values.totalCents / 100) : "—"}</strong>
            </div>
            <div className="flex justify-between gap-2 text-xs">
              <span>Capital que permanece investido</span><strong className="tabular-nums">{values ? money(values.capitalRemainingCents / 100) : "—"}</strong>
            </div>
            {values?.grossBeforeCents != null && (
              <div className="border-t border-border/50 pt-2 text-[11px] leading-4 text-muted-foreground">
                Bruto cadastrado: {money(values.grossBeforeCents / 100)}.
                {" "}Diferença bruto/líquido: {money((values.grossNetDifferenceCents ?? 0) / 100)}
                {" "}— pode incluir impostos e taxas; não será descontada novamente.
              </div>
            )}
          </div>

          <p className="text-[11px] leading-4 text-muted-foreground">
            O capital e o rendimento serão creditados na conta em uma operação única.
            O retorno do capital não entra como receita. Se já lançou esses valores manualmente,
            não confirme para evitar duplicação.
          </p>

          {result.error && <p role="alert" className="text-xs text-destructive">{result.error}</p>}
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border p-2 text-xs">
            <input type="checkbox" checked={verified} disabled={saving || !result.value}
              onChange={(event) => setVerified(event.target.checked)} className="h-4 w-4 shrink-0"/>
            <span>Conferi o líquido do extrato e ainda não registrei este resgate em Transações.</span>
          </label>
        </div>

        <DialogFooter className="mt-2 flex-row justify-end gap-2">
          <Button type="button" variant="outline" disabled={saving} onClick={onClose}>Cancelar</Button>
          <Button type="button" disabled={saving || !result.value || !verified} onClick={() => void submit()}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Check className="mr-1 h-4 w-4"/>}
            Confirmar resgate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
