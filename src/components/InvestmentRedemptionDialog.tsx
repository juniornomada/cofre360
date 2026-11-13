import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, Check, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { Investment } from "@/lib/investments-calc";
import {
  availablePrincipalCents,
  moneyInput,
  parseBRLMoney,
  todayBrazil,
  validateRedemptionDraft,
  type RedemptionDraft,
  type ValidatedRedemption,
} from "@/lib/investment-redemption";

export type RedemptionAccount = { id: string; name: string };

const money = (value: number) => value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const newDraft = (inv: Investment): RedemptionDraft => ({
  mode: "total",
  principalText: moneyInput(availablePrincipalCents(inv)),
  netYieldText: "0,00",
  taxText: "0,00",
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
  }, [investment?.id]); // each position has its own untouched draft

  if (!investment || !draft) return null;
  const setField = <K extends keyof RedemptionDraft>(key: K, value: RedemptionDraft[K]) => {
    setDraft((previous) => previous ? { ...previous, [key]: value } : previous);
    requestIdRef.current = null;
    setVerified(false);
  };
  const result = validateRedemptionDraft(investment, draft);
  const principalCents = draft.mode === "total" ? availablePrincipalCents(investment) : parseBRLMoney(draft.principalText);
  const netYieldCents = parseBRLMoney(draft.netYieldText);
  const taxCents = parseBRLMoney(draft.taxText);
  const total = principalCents !== null && netYieldCents !== null ? (principalCents + netYieldCents) / 100 : null;
  const remaining = availablePrincipalCents(investment) - (principalCents ?? 0);
  const accountName = accounts.find((account) => account.id === draft.accountId)?.name || "Conta não selecionada";

  const submit = async () => {
    if (saving || !verified || !result.value) return;
    const requestId = requestIdRef.current || crypto.randomUUID();
    requestIdRef.current = requestId;
    const succeeded = await onConfirm(result.value, requestId);
    if (succeeded) requestIdRef.current = null;
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
            <p className="mt-1 text-xs text-muted-foreground">Capital disponível</p>
            <p className="text-lg font-bold tabular-nums">{money(availablePrincipalCents(investment) / 100)}</p>
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
              Capital que está voltando (R$)
              <input inputMode="decimal" autoComplete="off" value={draft.principalText}
                onChange={(event) => setField("principalText", event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                aria-label="Valor do capital resgatado" disabled={saving}/>
            </label>
          )}
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0 space-y-1 text-xs font-semibold">
              Rendimento líquido (R$)
              <input inputMode="decimal" autoComplete="off" value={draft.netYieldText}
                onChange={(event) => setField("netYieldText", event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                aria-label="Juros líquidos recebidos" disabled={saving}/>
            </label>
            <label className="block min-w-0 space-y-1 text-xs font-semibold">
              IR/IOF retido (R$)
              <input inputMode="decimal" autoComplete="off" value={draft.taxText}
                onChange={(event) => setField("taxText", event.target.value)}
                className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"
                aria-label="Impostos retidos na fonte" disabled={saving}/>
            </label>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">
            Informe os juros já líquidos de IR/IOF. Os impostos acima ficam no histórico e não serão descontados novamente.
          </p>

          <label className="block space-y-1 text-xs font-semibold">
            Conta que recebeu o dinheiro
            <select value={draft.accountId} disabled={saving || loadingAccounts}
              onChange={(event) => setField("accountId", event.target.value)}
              className="min-h-11 w-full rounded-xl border border-border bg-card px-3 text-sm">
              <option value="">{loadingAccounts ? "Carregando contas..." : "Selecione uma conta"}</option>
              {accounts.map((account) => <option value={account.id} key={account.id}>{account.name}</option>)}
            </select>
          </label>
          <label className="block space-y-1 text-xs font-semibold">
            Data em que o dinheiro entrou na conta
            <input type="date" value={draft.date} max={todayBrazil()}
              onChange={(event) => setField("date", event.target.value)}
              disabled={saving} className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm"/>
          </label>

          <div className="space-y-2 rounded-xl border border-primary/30 bg-primary/5 p-3">
            <p className="text-xs font-bold">Conferência antes de registrar</p>
            <div className="flex justify-between gap-2 text-xs"><span>Capital devolvido</span><strong>{principalCents === null ? "—" : money(principalCents / 100)}</strong></div>
            <div className="flex justify-between gap-2 text-xs"><span>Juros líquidos (receita)</span><strong>{netYieldCents === null ? "—" : money(netYieldCents / 100)}</strong></div>
            <div className="flex justify-between gap-2 border-t border-border/50 pt-2 text-sm font-semibold">
              <span>Entrada em {accountName}</span><strong className="tabular-nums">{total === null ? "—" : money(total)}</strong>
            </div>
            <div className="flex justify-between gap-2 text-xs"><span>Capital que permanece investido</span><strong>{remaining < 0 ? "—" : money(remaining / 100)}</strong></div>
          </div>
          <p className="text-[11px] leading-4 text-muted-foreground">
            Isso cria o crédito do capital e dos juros na conta e atualiza a posição em uma operação única.
            Se você já lançou esses valores manualmente, não confirme: evitaria uma entrada duplicada.
          </p>

          {result.error && <p role="alert" className="text-xs text-destructive">{result.error}</p>}
          <label className="flex min-h-11 items-center gap-2 rounded-xl border border-border p-2 text-xs">
            <input type="checkbox" checked={verified} disabled={saving}
              onChange={(event) => setVerified(event.target.checked)} className="h-4 w-4 shrink-0"/>
            <span>Conferi o extrato e ainda não registrei este resgate em Transações.</span>
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
