import { ChevronDown, TrendingDown, TrendingUp } from "lucide-react";
import type {
  InsightPurchasesByPeriod,
  InsightSubcategoryReport,
} from "@/lib/insights-subcategory-report";

const money = (amountCents: number) =>
  "R$ " + (amountCents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const signedMoney = (amountCents: number) =>
  (amountCents > 0 ? "+" : amountCents < 0 ? "−" : "") + money(Math.abs(amountCents));

const shortMonth = (period: string) => {
  const [month, year] = period.split("/");
  return month.slice(0, 3).toLocaleLowerCase("pt-BR") + "/" + year.slice(2);
};

const percentChange = (oldValue: number, newValue: number) =>
  oldValue === 0 ? null : ((newValue - oldValue) / oldValue * 100)
    .toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";

function PurchaseDisclosure({
  period, data,
}: { period: string; data: InsightPurchasesByPeriod }) {
  const countLabel = data.totalCount !== null && data.totalCount > data.items.length
    ? data.items.length + " de " + data.totalCount + " compras"
    : data.items.length + (data.items.length === 1 ? " compra" : " compras");
  return (
    <details className="group rounded-xl border border-border/60 bg-background/40">
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 px-3 py-2.5 marker:hidden [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-semibold text-foreground">Maiores compras · {shortMonth(period)}</span>
          <span className="block text-[11px] text-muted-foreground">{countLabel}</span>
        </span>
        <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="border-t border-border/50 px-3 pb-2">
        {data.items.length ? (
          <ul className="divide-y divide-border/40">
            {data.items.map((purchase, index) => (
              <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 py-2" key={index}>
                <div className="min-w-0 text-xs">
                  <p className="break-words font-medium leading-5 text-foreground">{purchase.name}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{purchase.subcategory}</p>
                </div>
                <span className="pt-0.5 text-xs font-semibold tabular-nums text-foreground">{money(purchase.amountCents)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-xs text-muted-foreground">Nenhuma compra identificada.</p>
        )}
        {data.totalCount !== null && data.totalCount > data.items.length && (
          <p className="border-t border-border/40 py-2 text-[11px] leading-4 text-muted-foreground">
            Lista parcial: mostra apenas as maiores compras. Os totais acima incluem todas as {data.totalCount} compras do mês.
          </p>
        )}
      </div>
    </details>
  );
}

export function SubcategoryInsightCard({ report }: { report: InsightSubcategoryReport }) {
  const rising = report.differenceCents > 0;
  const falling = report.differenceCents < 0;
  const largestIncrease = [...report.subcategories]
    .filter((subcategory) => subcategory.differenceCents > 0)
    .sort((a, b) => b.differenceCents - a.differenceCents)[0];

  return (
    <section aria-label={"Comparativo de " + report.category + " por subcategoria"} className="min-w-0 space-y-4 text-foreground">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">Detalhamento por subcategoria</p>
        <h3 className="mt-1 break-words text-lg font-bold leading-6">{report.category}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {shortMonth(report.earlierLabel)} × {shortMonth(report.laterLabel)} · mês da compra
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="min-w-0 rounded-xl border border-border/60 bg-background/60 p-2.5">
          <p className="text-[11px] text-muted-foreground">{report.earlierLabel}</p>
          <p className="mt-1 break-words text-[15px] font-bold tabular-nums leading-5">{money(report.earlierCents)}</p>
        </div>
        <div className="min-w-0 rounded-xl border border-primary/35 bg-primary/5 p-2.5">
          <p className="text-[11px] text-muted-foreground">{report.laterLabel}</p>
          <p className="mt-1 break-words text-[15px] font-bold tabular-nums leading-5">{money(report.laterCents)}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {rising ? <TrendingUp className="h-4 w-4" aria-hidden="true" /> : falling ? <TrendingDown className="h-4 w-4" aria-hidden="true" /> : null}
          Variação no período
        </span>
        <span className={"text-sm font-bold tabular-nums " + (rising ? "text-rose-500 dark:text-rose-300" : falling ? "text-emerald-600 dark:text-emerald-300" : "text-foreground")}>
          {signedMoney(report.differenceCents)}
          {percentChange(report.earlierCents, report.laterCents) !== null && (
            <span className="ml-1 text-xs font-medium">({report.differenceCents > 0 ? "+" : ""}{percentChange(report.earlierCents, report.laterCents)})</span>
          )}
        </span>
      </div>

      {largestIncrease && (
        <p className="text-xs leading-5 text-muted-foreground">
          <span className="font-semibold text-foreground">Maior aumento:</span> {largestIncrease.name} ({signedMoney(largestIncrease.differenceCents)}).
        </p>
      )}

      <div>
        <h4 className="mb-1 text-sm font-semibold text-foreground">Onde o valor foi gasto</h4>
        <p className="mb-2 text-[11px] text-muted-foreground">Valores de cada subcategoria e diferença entre os meses</p>
        <div className="divide-y divide-border/50">
          {report.subcategories.map((item) => {
            const maximum = Math.max(item.beforeCents, item.afterCents, 1);
            const beforeWidth = item.beforeCents / maximum * 100;
            const afterWidth = item.afterCents / maximum * 100;
            return (
              <div className="space-y-2 py-3" key={item.name}>
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 flex-1 break-words text-[13px] font-semibold leading-5">{item.name}</p>
                  <span className={"shrink-0 text-xs font-semibold tabular-nums " +
                    (item.differenceCents > 0 ? "text-rose-500 dark:text-rose-300" :
                      item.differenceCents < 0 ? "text-emerald-600 dark:text-emerald-300" : "text-muted-foreground")}>
                    {signedMoney(item.differenceCents)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="grid grid-cols-[38px_minmax(0,1fr)_86px] items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">{shortMonth(report.earlierLabel)}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-border/60">
                      <span className="block h-full rounded-full bg-muted-foreground/65" style={{ width: beforeWidth + "%" }} />
                    </span>
                    <span className="text-right tabular-nums text-muted-foreground">{money(item.beforeCents)}</span>
                  </div>
                  <div className="grid grid-cols-[38px_minmax(0,1fr)_86px] items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">{shortMonth(report.laterLabel)}</span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-border/60">
                      <span className="block h-full rounded-full bg-primary" style={{ width: afterWidth + "%" }} />
                    </span>
                    <span className="text-right font-semibold tabular-nums">{money(item.afterCents)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Conferir maiores compras</h4>
        <p className="text-[11px] leading-4 text-muted-foreground">Abra um mês para ver as compras e seus valores completos.</p>
        <PurchaseDisclosure period={report.earlierLabel} data={report.earlierPurchases} />
        <PurchaseDisclosure period={report.laterLabel} data={report.laterPurchases} />
      </div>

      {!report.reconciled && (
        <p className="rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-xs leading-5">
          Atenção: os valores das subcategorias não conferem com o total informado. Verifique os lançamentos antes de tomar decisões.
        </p>
      )}

      <p className="border-t border-border/50 pt-3 text-[11px] leading-4 text-muted-foreground">
        Compras parceladas entram integralmente no mês original. Parcelas futuras não são novos gastos da categoria.
      </p>
    </section>
  );
}
