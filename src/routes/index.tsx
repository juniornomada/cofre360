import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";
import { Landmark, CreditCard, ArrowUpRight, ArrowDownRight } from "lucide-react";

function ThemePreview() {
  return (
    <main className="flex flex-col gap-4 px-3 py-4">
      <header>
        <h1 className="text-lg font-bold text-foreground">Cofre 360 · prévia do tema</h1>
        <p className="mt-1 text-[12px] text-muted-foreground">
          Esta rota existe somente para comparar os tokens visuais claro/escuro. O dashboard oficial é /home.
        </p>
      </header>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Landmark className="h-4 w-4 text-primary" /> Contas
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums text-foreground">R$ 5.200,57</p>
        <p className="mt-1 text-[12px] text-muted-foreground">Exemplo de superfície, tipografia e contraste.</p>
      </section>

      <div className="grid grid-cols-2 gap-3">
        <section className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase text-primary">
            <ArrowUpRight className="h-3.5 w-3.5" /> Receitas
          </div>
          <p className="mt-2 text-lg font-bold text-primary">R$ 4.108,30</p>
        </section>
        <section className="rounded-2xl border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center gap-1 text-[11px] font-semibold uppercase text-destructive">
            <ArrowDownRight className="h-3.5 w-3.5" /> Despesas
          </div>
          <p className="mt-2 text-lg font-bold text-destructive">R$ 9.718,01</p>
        </section>
      </div>

      <section className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
          <CreditCard className="h-4 w-4 text-primary" /> Cartão
        </div>
        <div className="mt-3 h-2 rounded-full bg-muted">
          <div className="h-full w-2/3 rounded-full bg-primary" />
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">Componentes de comparação sem duplicar regras financeiras.</p>
      </section>
    </main>
  );
}

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    compare: z.string().optional().catch(undefined).parse(search.compare),
  }),
  beforeLoad: ({ search }) => {
    if (search.compare !== "theme") throw redirect({ to: "/home", replace: true });
  },
  component: ThemePreview,
});
