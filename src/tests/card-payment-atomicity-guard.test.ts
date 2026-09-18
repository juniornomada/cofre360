import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("card payment atomicity guard", () => {
  const source = readFileSync(resolve(process.cwd(), "src/routes/cards.tsx"), "utf8");

  it("creates card payments through the atomic RPC", () => {
    expect(source).toContain('supabase.rpc("create_card_payment_atomic"');
    expect(source).not.toMatch(/from\(["']card_payments["']\)\.insert/);
  });

  it("deletes card payments through the atomic RPC", () => {
    expect(source).toContain('supabase.rpc("delete_card_payment_atomic"');
    expect(source).not.toMatch(/from\(["']card_payments["']\)\.delete/);
  });

  it("keeps the payment-to-transaction link in the migration", () => {
    const migration = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20260918000605_atomic_card_payments.sql"),
      "utf8",
    );

    expect(migration).toContain("transaction_id text");
    expect(migration).toContain("create_card_payment_atomic");
    expect(migration).toContain("delete_card_payment_atomic");
    expect(migration).toContain("security invoker");
    expect(migration).toContain("grant execute");
    expect(migration).toContain("to authenticated");
  });
});
