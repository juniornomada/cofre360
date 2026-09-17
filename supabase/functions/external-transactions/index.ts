import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

type TransactionType = "expense" | "income";

interface TransactionRequest {
  name: string;
  amount: number;
  type?: TransactionType;
  category?: string;
  subcategory?: string;
  date?: string;
  bank_account_id?: string;
  card?: string;
  icon?: string;
}

class InvalidDateError extends Error {
  constructor() {
    super("date deve ser uma data válida em YYYY-MM-DD ou DD/MM/YYYY");
    this.name = "InvalidDateError";
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });

const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder();
  const aa = encoder.encode(a);
  const bb = encoder.encode(b);
  if (aa.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < aa.length; i++) diff |= aa[i] ^ bb[i];
  return diff === 0;
}

function canonicalDate(year: number, month: number, day: number): string {
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new InvalidDateError();
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseDate(value?: string): string {
  if (!value) return new Date().toISOString().slice(0, 10);
  const raw = value.trim();

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return canonicalDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (br) return canonicalDate(Number(br[3]), Number(br[2]), Number(br[1]));

  throw new InvalidDateError();
}

function chooseBest<T extends { label: string }>(items: T[], wanted?: string): T | null {
  if (!wanted || items.length === 0) return null;
  const target = normalize(wanted);
  const exact = items.find((item) => normalize(item.label) === target);
  if (exact) return exact;
  return items.find((item) => {
    const candidate = normalize(item.label);
    return candidate.includes(target) || target.includes(candidate);
  }) ?? null;
}

serve(async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const expectedToken = Deno.env.get("COFRE360_EXTERNAL_API_TOKEN") ?? "";
    const userId = Deno.env.get("COFRE360_EXTERNAL_USER_ID") ?? "";
    const suppliedToken = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");

    if (!expectedToken || !userId) {
      return json({ error: "External transaction API is not configured" }, 503);
    }
    if (!suppliedToken || !timingSafeEqual(suppliedToken, expectedToken)) {
      return json({ error: "Unauthorized" }, 401);
    }

    const payload = (await req.json()) as TransactionRequest;
    const name = String(payload.name ?? "").trim();
    const amount = Number(payload.amount);
    const type: TransactionType = payload.type === "income" ? "income" : "expense";

    if (!name) return json({ error: "name is required" }, 400);
    if (name.length > 240) return json({ error: "name is too long" }, 400);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999_999_999) {
      return json({ error: "amount must be a positive number within the supported range" }, 400);
    }

    const transactionDate = parseDate(payload.date);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: categories, error: categoriesError } = await supabase
      .from("categories")
      .select("id,label,icon")
      .order("sort_order");
    if (categoriesError) throw categoriesError;

    const category = chooseBest(categories ?? [], payload.category);
    let subcategory: { id: string; category_id: string; label: string; icon: string } | null = null;

    if (category && payload.subcategory) {
      const { data: subcategories, error: subcategoriesError } = await supabase
        .from("subcategories")
        .select("id,category_id,label,icon")
        .eq("category_id", category.id)
        .order("sort_order");
      if (subcategoriesError) throw subcategoriesError;
      subcategory = chooseBest(subcategories ?? [], payload.subcategory);
    }

    const categoryLabel = category
      ? subcategory
        ? `${category.label} > ${subcategory.label}`
        : category.label
      : payload.category?.trim() || (type === "income" ? "Receita" : "Outros");

    if (categoryLabel.length > 240) return json({ error: "category is too long" }, 400);

    const bankAccountId = payload.bank_account_id?.trim() || null;
    if (bankAccountId) {
      const { data: account, error: accountError } = await supabase
        .from("bank_accounts")
        .select("id")
        .eq("id", bankAccountId)
        .eq("user_id", userId)
        .maybeSingle();
      if (accountError) throw accountError;
      if (!account) return json({ error: "bank_account_id not found for configured user" }, 400);
    }

    const requestedCard = payload.card?.trim() || null;
    let cardName: string | null = null;
    if (requestedCard) {
      if (requestedCard.length > 160) return json({ error: "card is too long" }, 400);
      const { data: card, error: cardError } = await supabase
        .from("cards")
        .select("name")
        .eq("user_id", userId)
        .ilike("name", requestedCard)
        .limit(1)
        .maybeSingle();
      if (cardError) throw cardError;
      if (!card) return json({ error: "card not found for configured user" }, 400);
      cardName = card.name;
    }

    const row = {
      user_id: userId,
      name,
      amount: Math.round(amount * 100) / 100,
      type,
      category: categoryLabel,
      date: transactionDate,
      transaction_date: transactionDate,
      icon: payload.icon?.trim().slice(0, 32) || subcategory?.icon || category?.icon || (type === "income" ? "💰" : "📄"),
      bank_account_id: bankAccountId,
      card: cardName,
      is_visible: true,
    };

    const { data, error } = await supabase
      .from("transactions")
      .insert(row)
      .select("id,name,amount,type,category,date,transaction_date,icon,bank_account_id,card,created_at")
      .single();
    if (error) throw error;

    return json({ ok: true, transaction: data }, 201);
  } catch (error) {
    console.error("external-transactions error", error);
    if (error instanceof InvalidDateError) {
      return json({ error: error.message }, 400);
    }
    return json({ error: "Unexpected server error" }, 500);
  }
});
