import type { Plugin } from "vite";

export function investLastUpdateHotfix(): Plugin {
  return {
    name: "cofre360-invest-last-update-hotfix",
    enforce: "pre",
    transform(code, id) {
      const normalizedId = id.replace(/\\/g, "/").split("?")[0];
      if (!normalizedId.endsWith("/src/routes/invest.tsx")) return null;

      let transformed = code;

      if (!transformed.includes("const lastManualUpdateLabel = useMemo")) {
        const pnlMarker = `  const pnlPct = totalInvested > 0 ? (totalPnL / totalInvested) * 100 : 0;\n`;
        if (!transformed.includes(pnlMarker)) {
          throw new Error("Investment PnL marker not found");
        }
        transformed = transformed.replace(
          pnlMarker,
          `${pnlMarker}\n  const lastManualUpdateLabel = useMemo(() => {\n    const timestamps = portfolio\n      .map((inv) => inv.last_manual_update ? new Date(inv.last_manual_update).getTime() : Number.NaN)\n      .filter((value) => Number.isFinite(value));\n    if (timestamps.length === 0) return \"Ainda não informado\";\n    return new Date(Math.max(...timestamps)).toLocaleDateString(\"pt-BR\");\n  }, [portfolio]);\n`,
        );
      }

      // Preserve the existing projection state for the investment detail modal,
      // but replace the projection card on the main portfolio screen.
      const projectionSection = /      \{\/\* Data alvo para projeção \*\/\}[\s\S]*?(?=      \{\/\* Gráfico de alocação \*\/\})/;
      if (!projectionSection.test(transformed)) {
        throw new Error("Investment projection section not found");
      }
      transformed = transformed.replace(
        projectionSection,
        `      {/* Última atualização manual dos valores da carteira */}\n      <div className=\"rounded-2xl bg-card p-4\">\n        <p className=\"text-xs text-muted-foreground\">Valor atualizado em</p>\n        <p className=\"mt-1 text-sm font-semibold text-foreground tabular-nums\">{lastManualUpdateLabel}</p>\n        <p className=\"mt-1 text-[10px] text-muted-foreground\">\n          Data da última atualização manual dos valores informados na carteira.\n        </p>\n      </div>\n\n`,
      );

      // Only advance the manual-update timestamp when the stored manual values
      // really changed. Editing unrelated metadata must not fake a new update date.
      const timestampLine = `        last_manual_update: (manualGross != null || manualNet != null) ? new Date().toISOString() : null,`;
      if (transformed.includes(timestampLine)) {
        transformed = transformed.replace(
          timestampLine,
          `        last_manual_update: (() => {\n          if (manualGross == null && manualNet == null) return null;\n          if (!editing) return new Date().toISOString();\n          const grossChanged = Number(editing.current_gross_value ?? 0) !== Number(manualGross ?? 0);\n          const netChanged = Number(editing.current_net_value ?? 0) !== Number(manualNet ?? 0);\n          return grossChanged || netChanged\n            ? new Date().toISOString()\n            : (editing.last_manual_update || new Date().toISOString());\n        })(),`,
        );
      }

      return transformed === code ? null : { code: transformed, map: null };
    },
  };
}
