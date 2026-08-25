import { supabase } from "@/integrations/supabase/client";

const TEST_PREFIX = "[TESTE PREVIEW]";
const TEST_CATEGORY = "Teste > Automação";
const TEST_AMOUNT = 1.23;

function isPreviewEnvironment() {
  if (import.meta.env.DEV) return true;

  if (typeof window === "undefined") return false;

  const host = window.location.hostname.toLowerCase();
  return host.includes("lovable.app") || host.includes("lovable.dev");
}

function randomTestName() {
  const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${TEST_PREFIX} Despesa ${suffix}`;
}

export async function seedPreviewTestExpense() {
  if (!isPreviewEnvironment()) return;

  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    if (!session?.user) return;

    const userId = session.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const { data: existing } = await supabase
      .from("transactions")
      .select("id, date")
      .eq("user_id", userId)
      .eq("category", TEST_CATEGORY)
      .like("name", `${TEST_PREFIX}%`)
      .eq("date", today)
      .limit(1);

    if (existing?.length) return;

    const { data: account } = await supabase
      .from("bank_accounts")
      .select("id, name")
      .eq("user_id", userId)
      .ilike("name", "%Mercado Pago%")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (!account?.id) {
      console.warn("Preview test expense: Mercado Pago account not found.");
      return;
    }

    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      icon: "🧪",
      name: randomTestName(),
      category: TEST_CATEGORY,
      date: today,
      amount: TEST_AMOUNT,
      type: "expense",
      card: null,
      bank_account_id: account.id,
      is_visible: true,
    });

    if (error) {
      console.warn("Preview test expense: insert failed", error);
      return;
    }

    console.info(
      `Preview test expense created in account: ${account.name}`,
    );
  } catch (error) {
    console.warn("Preview test expense: unexpected error", error);
  }
}
