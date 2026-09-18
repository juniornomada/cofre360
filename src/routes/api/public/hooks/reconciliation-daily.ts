import { createFileRoute } from "@tanstack/react-router";

/**
 * Legacy route kept temporarily so old callers fail closed.
 * Scheduled reconciliation now runs in the internal Supabase Edge Function
 * protected by a bearer secret stored in Supabase Vault.
 */
export const Route = (createFileRoute as any)("/api/public/hooks/reconciliation-daily")({
  server: {
    handlers: {
      POST: async () =>
        new Response("This endpoint has moved", {
          status: 410,
          headers: { "Cache-Control": "no-store" },
        }),
    },
  },
});
