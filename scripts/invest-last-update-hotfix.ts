import type { Plugin } from "vite";

export function investLastUpdateHotfix(): Plugin {
  return {
    name: "cofre360-invest-last-update-hotfix",
    enforce: "pre",
    transform(code, id) {
      if (!id.replace(/\\/g, "/").endsWith("/src/routes/invest.tsx")) return null;
      if (code.includes("const lastManualUpdateLabel = useMemo")) return null;

      let transformed = code;

      const targetState = `  const [targetDate, setTargetDate] = useState<string>(\n    new Date().toISOString().slice(0, 10)\n  );\n`;
      if (!transformed.includes(targetState)) {
        throw new Error("Investment target-date state marker not found");
      }
      transformed = transformed.replace(targetState, "");

      const targetValuation = `  // Valuations\n  const target = useMemo(() => new Date(targetDate + \"T12:00:00\"), [targetDate]);\n  const valuations = useMemo(\n    () => portfolio.map((inv) => ({ inv, val: valuate(inv, target) })),\n    [portfolio, target]\n  );\n`;
      const currentValuation = `  // Valuations: the portfolio shows the current stored/manual values, not a user-selected projection date.\n  const target = useMemo(() => new Date(), [portfolio]);\n  const valuations = useMemo(\n    () => portfolio.map((inv) => ({ inv, val: valuate(inv, target) })),\n    [portfolio, target]\n  );\n\n  const lastManualUpdateLabel = useMemo(() => {\n    const timestamps = portfolio\n      .map((inv) => inv.last_manual_update ? new Date(inv.last_manual_update).getTime() : Number.NaN)\n      .filter((value) => Number.isFinite(value));\n    if (timestamps.length === 0) return \"Ainda não informado\";\n    return new Date(Math.max(...timestamps)).toLocaleDateString(\"pt-BR\");\n  }, [portfolio]);\n`;
      if (!transformed.includes(targetValuation)) {
        throw new Error("Investment valuation marker not found");
      }
      transformed = transformed.replace(targetValuation, currentValuation);

      const updateTimestamp = `        last_manual_update: (manualGross != null || manualNet != null) ? new Date().toISOString() : null,`;
      const accurateUpdateTimestamp = `        last_manual_update: (() => {\n          if (manualGross == null && manualNet == null) return null;\n          if (!editing) return new Date().toISOString();\n          const grossChanged = Number(editing.current_gross_value ?? 0) !== Number(manualGross ?? 0);\n          const netChanged = Number(editing.current_net_value ?? 0) !== Number(manualNet ?? 0);\n          return grossChanged || netChanged\n            ? new Date().toISOString()\n            : (editing.last_manual_update || new Date().toISOString());\n        })(),`;
      if (!transformed.includes(updateTimestamp)) {
        throw new Error("Investment manual-update timestamp marker not found");
      }
      transformed = transformed.replace(updateTimestamp, accurateUpdateTimestamp);

      const projectionCard = `      {/* Data alvo para projeção */}\n      <div className=\"rounded-2xl bg-card p-4\">\n        <label className=\"text-xs text-muted-foreground mb-1 block\">Projetar valor para a data</label>\n        <input\n          type=\"date\"\n          value={targetDate}\n          onChange={(e) => setTargetDate(e.target.value)}\n          className=\"w-full rounded-xl bg-accent/40 px-3 py-2 text-sm text-foreground outline-none\"\n        />\n        <p className=\"mt-1 text-[10px] text-muted-foreground\">\n          Renda fixa: aplica juros compostos, IR regressivo e taxa de administração até essa data.\n        </p>\n      </div>\n`;
      const lastUpdateCard = `      {/* Última atualização manual dos valores da carteira */}\n      <div className=\"rounded-2xl bg-card p-4\">\n        <p className=\"text-xs text-muted-foreground\">Valor atualizado em</p>\n        <p className=\"mt-1 text-sm font-semibold text-foreground tabular-nums\">{lastManualUpdateLabel}</p>\n        <p className=\"mt-1 text-[10px] text-muted-foreground\">\n          Data da última atualização manual dos valores informados na carteira.\n        </p>\n      </div>\n`;
      if (!transformed.includes(projectionCard)) {
        throw new Error("Investment projection card marker not found");
      }
      transformed = transformed.replace(projectionCard, lastUpdateCard);

      return { code: transformed, map: null };
    },
  };
}
