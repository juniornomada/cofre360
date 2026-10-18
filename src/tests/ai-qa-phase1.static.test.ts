import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const qa = source("supabase/functions/run-ai-tests/index.ts");
const client = source("src/components/AITestHistory.tsx");
const config = source("supabase/config.toml");
const vault = source("supabase/migrations/20261018120000_ai_qa_cron_secret.sql");
const cron = source("supabase/migrations/20261018120100_ai_qa_daily_smoke.sql");

describe("Fase 1: segurança e diagnóstico do consultor IA", () => {
  it("usa JWT da sessão ativa e jamais a chave pública como Bearer manual", () => {
    expect(client).toContain("session.access_token");
    expect(client).toContain("Authorization: `Bearer ${session.access_token}`");
    expect(client).not.toContain("Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`");
    expect(client).toContain('resp.status === 401 || resp.status === 403');
  });

  it("protege histórico e execução manual com autorização administrativa", () => {
    expect(qa).toContain('req.method === "GET"');
    expect(qa).toContain("await userClient.auth.getUser()");
    expect(qa).toContain('appMetadata.run_ai_tests === true || appMetadata.role === "admin"');
    expect(qa).toContain("if (!authorizedAdmin && !internalCron)");
    expect(qa).toContain("if (!authorizedAdmin) return json({ error: \"Forbidden\" }, 403)");
  });

  it("separa auditoria financeira real de smoke sem dados pessoais e sem IA paga", () => {
    expect(qa).toContain('trigger = "scheduled-smoke"');
    expect(qa).toContain("results = await scheduledHealthChecks(chatUrl)");
    expect(qa).toContain("expectations[test.id] || []");
    expect(qa).toContain("manualMoneyExpectations(userClient)");
    expect(qa).toContain("numericOk");
    expect(qa).toContain("Resposta maior que o limite");
  });

  it("agenda com segredo Vault, nunca no SQL publicado nem na chave pública", () => {
    expect(config).toContain("[functions.run-ai-tests]\nverify_jwt = false");
    expect(vault).toContain("verify_ai_tests_cron_secret");
    expect(vault).toContain("grant execute on function public.verify_ai_tests_cron_secret(text) to service_role");
    expect(vault).toContain("revoke all on function public.verify_ai_tests_cron_secret(text) from public, anon, authenticated");
    expect(cron).toContain("'0 9 * * *'");
    expect(cron).toContain("from vault.decrypted_secrets");
    expect(cron).not.toContain("sb_secret_");
    expect(cron).not.toContain("service_role");
    expect(qa).toContain('service.rpc("verify_ai_tests_cron_secret", { p_token: suppliedToken })');
  });
});
