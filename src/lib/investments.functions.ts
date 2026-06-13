import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { CRYPTO_COINGECKO_IDS } from "./investments-calc";

interface QuoteUpdate {
  id: string;
  asset_class: string | null;
  asset_code: string | null;
  current_price: number | null;
}

async function fetchCryptoPrices(codes: string[]): Promise<Record<string, number>> {
  const ids = Array.from(
    new Set(codes.map((c) => CRYPTO_COINGECKO_IDS[c.toUpperCase()]).filter(Boolean))
  );
  if (ids.length === 0) return {};
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids.join(",")}&vs_currencies=brl`;
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json", "user-agent": "Cofre360/1.0" },
    });
    console.log("[crypto] fetch", url, "status=", res.status);
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[crypto] non-ok", res.status, txt.slice(0, 200));
      return {};
    }
    const data = (await res.json()) as Record<string, { brl?: number }>;
    console.log("[crypto] response data=", JSON.stringify(data));
    const map: Record<string, number> = {};
    for (const code of codes) {
      const id = CRYPTO_COINGECKO_IDS[code.toUpperCase()];
      if (id && data[id]?.brl != null) {
        map[code] = data[id]!.brl!;
      }
    }
    return map;
  } catch (err) {
    console.error("[crypto] fetch failed", err);
    return {};
  }
}

interface TesouroBond {
  TrsrBd?: { nm?: string; untrInvstmtVal?: number };
}

async function fetchTesouroPrices(codes: string[]): Promise<Record<string, number>> {
  if (codes.length === 0) return {};
  const url =
    "https://www.tesourodireto.com.br/json/br/com/b3/tesourodireto/service/api/treasurybondsinfo.json";
  try {
    const res = await fetch(url, { headers: { accept: "application/json" } });
    if (!res.ok) return {};
    const data = (await res.json()) as { response?: { TrsrBdTradgList?: TesouroBond[] } };
    const list = data.response?.TrsrBdTradgList ?? [];
    const byName: Record<string, number> = {};
    for (const item of list) {
      const name = item.TrsrBd?.nm?.trim();
      const price = item.TrsrBd?.untrInvstmtVal;
      if (name && typeof price === "number") {
        byName[name.toLowerCase()] = price;
      }
    }
    const map: Record<string, number> = {};
    for (const code of codes) {
      const key = code.trim().toLowerCase();
      // exact match first, then prefix
      if (byName[key] != null) {
        map[code] = byName[key];
        continue;
      }
      const hit = Object.entries(byName).find(([n]) => n.startsWith(key) || key.startsWith(n));
      if (hit) map[code] = hit[1];
    }
    return map;
  } catch (err) {
    console.error("[tesouro] fetch failed", err);
    return {};
  }
}

/**
 * Atualiza cotações (current_price + last_quote_at) dos investimentos do usuário
 * autenticado que tenham asset_class = 'cripto' ou 'tesouro' e asset_code definido.
 */
export const refreshInvestmentQuotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async (ctx: any) => {
    const { supabase, userId } = ctx.context;

    const { data: investments, error } = await supabase
      .from("investments")
      .select("id, asset_class, asset_code, current_price")
      .eq("user_id", userId);
    if (error) throw error;

    const items = (investments ?? []) as QuoteUpdate[];
    const cryptoCodes = items
      .filter((i) => (i.asset_class || "").toLowerCase() === "cripto" && i.asset_code)
      .map((i) => i.asset_code as string);
    const tesouroCodes = items
      .filter((i) => (i.asset_class || "").toLowerCase() === "tesouro" && i.asset_code)
      .map((i) => i.asset_code as string);

    console.log("[refreshQuotes] items=", items.length, "cripto=", cryptoCodes, "tesouro=", tesouroCodes);

    const [cryptoPrices, tesouroPrices] = await Promise.all([
      fetchCryptoPrices(cryptoCodes),
      fetchTesouroPrices(tesouroCodes),
    ]);

    console.log("[refreshQuotes] cryptoPrices=", cryptoPrices, "tesouroPrices=", tesouroPrices);

    const now = new Date().toISOString();
    let updated = 0;
    const errors: string[] = [];
    for (const inv of items) {
      const cls = (inv.asset_class || "").toLowerCase();
      const code = inv.asset_code;
      if (!code) continue;
      const price =
        cls === "cripto" ? cryptoPrices[code] : cls === "tesouro" ? tesouroPrices[code] : undefined;
      if (price == null) continue;
      const { error: upErr } = await supabase
        .from("investments")
        .update({ current_price: price, last_quote_at: now })
        .eq("id", inv.id);
      if (upErr) {
        console.error("[refreshQuotes] update failed", inv.id, upErr);
        errors.push(`${code}: ${upErr.message}`);
      } else {
        updated++;
      }
    }

    return { updated, total: items.length, cripto: cryptoCodes.length, tesouro: tesouroCodes.length, fetched: { cripto: Object.keys(cryptoPrices).length, tesouro: Object.keys(tesouroPrices).length }, errors };
  });
