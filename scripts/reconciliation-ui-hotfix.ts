import type { Plugin } from "vite";

/**
 * Small presentation patch for the reconciliation route while its large legacy
 * component is being split. The reconciliation engine itself is source-native;
 * this only updates labels/status copy so old runs are not presented as verified.
 */
export function reconciliationUiHotfix(): Plugin {
  return {
    name: "cofre360-reconciliation-ui-hotfix",
    enforce: "pre",
    transform(code, id) {
      if (!id.includes("/src/routes/reconciliation.tsx")) return null;
      let next = code;

      next = next.replace(
        `const CHECK_LABEL: Record<CheckType, string> = {\n  bank_account: "Conta",\n  card: "Cartão",\n  invoice: "Fatura",\n  budget: "Orçamento",\n};`,
        `const CHECK_LABEL: Record<CheckType, string> = {\n  bank_account: "Conta",\n  card: "Cartão",\n  invoice: "Fatura",\n  budget: "Orçamento",\n  transfer: "Transferência",\n  installment: "Parcelamento",\n  data_quality: "Integridade",\n  refund: "Reembolso",\n  system: "Sistema",\n};`,
      );

      next = next.replace(
        `<Badge className="bg-green-500 text-white hover:bg-green-500">OK</Badge>`,
        `{r.payload?.verification_version === 2 ? (\n                          <Badge className="bg-green-500 text-white hover:bg-green-500">Conferido</Badge>\n                        ) : (\n                          <Badge variant="secondary">Legado · não verificado</Badge>\n                        )}`,
      );

      next = next.replace(
        `if (n === 0) toast.success("Nenhuma divergência detectada ✓");`,
        `if (n === 0) toast.success(\`Consistência interna conferida ✓ · \${(res as any).result.checks?.length ?? 0} verificações\`);`,
      );

      next = next.replace(
        `<CheckCircle2 className="h-5 w-5" /> Tudo consistente`,
        `<CheckCircle2 className="h-5 w-5" /> Consistência interna conferida`,
      );

      next = next.replace(
        `<p className="text-sm text-muted-foreground text-center py-4">Nenhuma regra. Crie a primeira acima.</p>`,
        `<p className="text-sm text-muted-foreground text-center py-4">As verificações principais são automáticas. Regras aqui são opcionais e servem apenas para validações adicionais.</p>`,
      );

      const runCardMarker = `<Card className="p-4 space-y-3">\n        <p className="text-sm font-semibold">Período</p>`;
      next = next.replace(
        runCardMarker,
        `<Card className="p-4 space-y-3">\n        <div>\n          <p className="text-sm font-semibold">Período</p>\n          <p className="mt-1 text-xs text-muted-foreground">A validação automática confere vínculos, transferências, parcelamentos, reembolsos e os totais do app contra a fonte financeira canônica. Não depende de regras manuais.</p>\n        </div>`,
      );

      const resultSuccess = `<div className="flex items-center gap-2 text-green-600">\n              <CheckCircle2 className="h-5 w-5" /> Consistência interna conferida\n            </div>`;
      next = next.replace(
        resultSuccess,
        `<div>\n              <div className="flex items-center gap-2 text-green-600">\n                <CheckCircle2 className="h-5 w-5" /> Consistência interna conferida\n              </div>\n              <p className="mt-2 text-xs text-muted-foreground">\{lastRun.result.checks?.length ?? 0\} verificações automáticas executadas. Esta confirmação valida a consistência interna do Cofre360; não substitui a comparação com extratos externos do banco.</p>\n            </div>`.replace("\\{lastRun", "{lastRun"),
      );

      if (next === code) return null;
      return { code: next, map: null };
    },
  };
}
