import type { Plugin } from "vite";

export function investLastUpdateHotfix(): Plugin {
  return {
    name: "cofre360-invest-last-update-hotfix",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replace(/\\/g, "/").split("?")[0];
      if (!normalizedId.endsWith("/src/routes/invest.tsx")) return null;
      if (code.includes("const lastManualUpdateLabel = useMemo")) return null;

      let transformed = code;

      const pnlMarker = `  const pnlPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;\n`;
      if (transformed.includes(pnlMarker)) {
        transformed = transformed.replace(
          pnlMarker,
          `${pnlMarker}\n  const lastManualUpdateLabel = useMemo(() => {\n    const timestamps = portfolio\n      .map((inv) => inv.last_manual_update ? new Date(inv.last_manual_update).getTime() : Number.NaN)\n      .filter((value) => Number.isFinite(value));\n    if (timestamps.length === 0) return \"Ainda não informado\";\n    return new Date(Math.max(...timestamps)).toLocaleDateString(\"pt-BR\");\n  }, [portfolio]);\n`,
        );
      }

      const projectionCard = `      {/* Data alvo para projeção */}\n      <div className=\"rounded-2xl bg-card p-4\">\n        <label className=\"text-xs text-muted-foreground mb-1 block\">Projetar valor para a data</label>\n        <input\n          type=\"date\"\n          value={targetDate}\n          onChange={(e) => setTargetDate(e.target.value)}\n          className=\"w-full rounded-xl bg-accent/40 px-3 py-2 text-sm text-foreground outline-none\"\n        />\n        <p className=\"mt-1 text-[10px] text-muted-foreground\">\n          Renda fixa: aplica juros compostos, IR regressivo e taxa de administração até essa data.\n        </p>\n      </div>\n`;
      const lastUpdateCard = `      {/* Última atualização manual dos valores da carteira */}\n      <div className=\"rounded-2xl bg-card p-4\">\n        <p className=\"text-xs text-muted-foreground\">Valor atualizado em</p>\n        <p className=\"mt-1 text-sm font-semibold text-foreground tabular-nums\">{lastManualUpdateLabel}</p>\n        <p className=\"mt-1 text-[10px] text-muted-foreground\">\n          Data da última atualização manual dos valores informados na carteira.\n        </p>\n      </div>\n`;
      if (transformed.includes(projectionCard)) {
        transformed = transformed.replace(projectionCard, lastUpdateCard);
      }

      return transformed === code ? null : { code: transformed, map: null };
    },
  };
}
