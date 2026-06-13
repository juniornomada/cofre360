import { createFileRoute } from "@tanstack/react-router";
import { CRYPTO_COINGECKO_IDS } from "@/lib/investments-calc";

// Cron público (chamado por pg_cron) que atualiza cotações globais de
// criptomoedas (CoinGecko) e Tesouro Direto para TODOS os investimentos.
// Usa o supabaseAdmin para fazer updates em massa.

interface TesouroBond {
  TrsrBd?: { nm?: string; untrInvstmtVal?: number };
}

async function fetchAllCryptoBRL(): Promise<Record<string, number>> {
  const ids = Object.values(CRYPTO_COINGECKO_IDS).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=brl`;
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return {};
  const data = (await res.json()) as Record<string, { brl?: number }>;
  const out: Record<string, number> = {};
  for (const [code, id] of Object.entries(CRYPTO_COINGECKO_IDS)) {
    const p = data[id]?.brl;
    if (typeof p === "number") out[code] = p;
  }
  return out;
}

async function fetchAllTesouro(): Promise<Record<string, number>> {
  const url =
    "https://www.tesourodireto.com.br/json/br/com/b3/tesourodireto/service/api/treasurybondsinfo.json";
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) return {};
  const data = (await res.json()) as { response?: { TrsrBdTradgList?: TesouroBond[] } };
  const map: Record<string, number> = {};
  for (const item of data.response?.TrsrBdTradgList ?? []) {
    const n = item.TrsrBd?.nm?.trim();
    const p = item.TrsrBd?.untrInvstmtVal;
    if (n && typeof p === "number") map[n.toLowerCase()] = p;
  }
  return map;
}

export const Route = createFileRoute("/api/public/hooks/refresh-investments")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: rows, error } = await supabaseAdmin
            .from("investments")
            .select("id, asset_class, asset_code")
            .in("asset_class", ["cripto", "tesouro"])
            .not("asset_code", "is", null);
          if (error) throw error;

          const [cryptoPrices, tesouroPrices] = await Promise.all([
            fetchAllCryptoBRL(),
            fetchAllTesouro(),
          ]);

          const now = new Date().toISOString();
          let updated = 0;
          for (const r of rows ?? []) {
            const cls = (r.asset_class || "").toLowerCase();
            const code = r.asset_code as string | null;
            if (!code) continue;
            let price: number | undefined;
            if (cls === "cripto") {
              price = cryptoPrices[code.toUpperCase()];
            } else if (cls === "tesouro") {
              const k = code.trim().toLowerCase();
              price = tesouroPrices[k];
              if (price == null) {
                const hit = Object.entries(tesouroPrices).find(
                  ([n]) => n.startsWith(k) || k.startsWith(n)
                );
                if (hit) price = hit[1];
              }
            }
            if (price == null) continue;
            const { error: upErr } = await supabaseAdmin
              .from("investments")
              .update({ current_price: price, last_quote_at: now })
              .eq("id", r.id);
            if (!upErr) updated++;
          }

          return new Response(
            JSON.stringify({ ok: true, updated, total: rows?.length ?? 0 }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        } catch (err: any) {
          console.error("[refresh-investments] error", err);
          return new Response(
            JSON.stringify({ ok: false, error: err?.message || "unknown" }),
            { status: 500, headers: { "Content-Type": "application/json" } }
          );
        }
      },
    },
  },
});
