import { createRouter, useRouter } from "@tanstack/react-router";
import { createIsomorphicFn, getGlobalStartContext } from "@tanstack/react-start";
import { routeTree } from "./routeTree.gen";
import { installInvoiceTransactionRowInteractions } from "@/lib/invoice-transaction-row-interactions";
import { isStaleAppChunkError } from "@/lib/route-error-recovery";

function DefaultErrorComponent({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const router = useRouter();
  const staleChunk = isStaleAppChunkError(error);

  const retry = () => {
    if (staleChunk) {
      // A versão atual do navegador pode apontar para um chunk removido.
      // Nesse cenário, resetar o boundary não baixa o shell atualizado.
      window.location.reload();
      return;
    }
    void router.invalidate();
    reset();
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-8 w-8 text-destructive"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 1.948-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {staleChunk ? "Aplicativo atualizado" : "Não foi possível abrir esta página"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {staleChunk
            ? "Uma versão nova foi publicada. Recarregue a página para carregar os arquivos atualizados."
            : "Ocorreu um erro na interface. Você pode tentar novamente ou recarregar a página."}
        </p>
        {import.meta.env.DEV && error?.message && (
          <pre className="mt-4 max-h-40 overflow-auto rounded-md bg-muted p-3 text-left font-mono text-xs text-destructive">
            {error.message}
          </pre>
        )}
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={retry}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            {staleChunk ? "Atualizar aplicativo" : "Tentar novamente"}
          </button>
          {!staleChunk && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
            >
              Recarregar página
            </button>
          )}
          <a
            href="/home"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Voltar ao início
          </a>
        </div>
      </div>
    </div>
  );
}

const getCspNonce = createIsomorphicFn()
  .server(() => {
    try {
      const context = getGlobalStartContext() as any;
      return typeof context?.cspNonce === "string" ? context.cspNonce : "";
    } catch {
      return "";
    }
  })
  .client(() => {
    const meta = document.querySelector('meta[property="csp-nonce"]');
    return meta?.getAttribute("content") || "";
  });

export const getRouter = () => {
  installInvoiceTransactionRowInteractions();

  const router = (createRouter as any)({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    defaultErrorComponent: DefaultErrorComponent,
    ssr: {
      nonce: getCspNonce() || undefined,
    },
  });

  return router;
};
