import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { lazy, Suspense, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useNavigationTracking } from "@/lib/metrics";
 
import { TooltipProvider } from "@/components/ui/tooltip";
import { Loader2 } from "lucide-react";
import appCss from "../styles.css?url";

 const BottomNav = lazy(() => import("@/components/BottomNav").then(m => ({ default: m.BottomNav })));
 const MetricsDashboard = lazy(() => import("@/components/MetricsDashboard").then(m => ({ default: m.MetricsDashboard })));
 
function ErrorComponent({ error }: { error: any }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold text-foreground">Ocorreu um erro</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error?.message || "Algo deu errado."}</p>
        <div className="mt-6">
          <Button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    </div>
  );
}

import { Button } from "@/components/ui/button";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Página não encontrada</p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground"
          >
            Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  validateSearch: (search: Record<string, unknown>) => {
    return {
      compare: z.string().optional().catch(undefined).parse(search.compare),
    };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Cofre 360" },
      { name: "description", content: "Gerencie suas finanças com inteligência artificial" },
      { property: "og:title", content: "Cofre 360" },
      { property: "og:description", content: "Gerencie suas finanças com inteligência artificial" },
      { property: "og:type", content: "website" },
      { name: "theme-color", content: "#1a1a2e" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const search = router.state.location.search as any;
  const isComparisonMode = search.compare === 'theme';

  if (isComparisonMode) {
    return (
      <html lang="pt-BR" suppressHydrationWarning>
        <head>
          <HeadContent />
        </head>
        <body suppressHydrationWarning className="bg-background">
          <div className="flex h-screen w-screen overflow-hidden">
            <div className="light relative h-full w-1/2 overflow-y-auto border-r border-border bg-background pb-10">
              <div className="sticky top-0 z-50 flex items-center justify-between bg-card/80 p-4 backdrop-blur-md border-b">
                <span className="text-sm font-bold text-foreground">Tema Claro</span>
                <Link to="/" search={{ compare: undefined } as any} className="text-xs text-primary font-medium px-2 py-1 rounded-md bg-primary/10">Sair</Link>
              </div>
              <div className="mx-auto max-w-md">
                {children}
              </div>
            </div>
            <div className="dark relative h-full w-1/2 overflow-y-auto bg-background pb-10">
              <div className="sticky top-0 z-50 flex items-center justify-between bg-card/80 p-4 backdrop-blur-md border-b">
                <span className="text-sm font-bold text-foreground">Tema Escuro</span>
              </div>
              <div className="mx-auto max-w-md">
                {children}
              </div>
            </div>
          </div>
          <Scripts />
        </body>
      </html>
    );
  }

  return (
    <html lang="pt-BR" className="light" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var c=document.documentElement.classList;c.remove('light','dark');c.add(t==='dark'?'dark':'light');}catch(e){}})();`,
          }}
        />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

 function RootComponent() {
   useNavigationTracking();
   const router = useRouter();
   const search = router.state.location.search as any;
   const isComparisonMode = search.compare === 'theme';

  return (
    <TooltipProvider>
      <div className={cn(
        "mx-auto min-h-screen bg-background pb-20",
        !isComparisonMode && "max-w-md"
      )}>
        <Outlet />
        {!isComparisonMode && (
          <Suspense fallback={
            <div className="fixed bottom-0 left-0 right-0 h-16 bg-card/80 flex items-center justify-center border-t border-border">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          }>
           <BottomNav />
           <MetricsDashboard />
         </Suspense>
        )}
      </div>
    </TooltipProvider>
  );
}
