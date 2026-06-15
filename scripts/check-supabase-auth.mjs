#!/usr/bin/env node
/**
 * Pre-deploy Supabase Auth security check.
 *
 * Calls the Supabase Management API and fails (exit 1) when known
 * security-relevant Auth settings are misconfigured. Currently checks:
 *
 *   - Leaked password protection (HaveIBeenPwned) is enabled
 *   - Minimum password length >= 8
 *   - OTP expiry <= 3600 seconds (1 hour)
 *
 * Required environment variables:
 *   SUPABASE_ACCESS_TOKEN   Personal access token (https://supabase.com/dashboard/account/tokens)
 *   SUPABASE_PROJECT_REF    Project ref (e.g. bllqvpnjfpcvujrbrbig)
 *
 * Optional:
 *   SKIP_SUPABASE_AUTH_CHECK=1   Skip the check entirely (e.g. for forks/PRs without secrets)
 */

const SKIP = process.env.SKIP_SUPABASE_AUTH_CHECK === "1";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF;

if (SKIP) {
  console.log("⚠️  SKIP_SUPABASE_AUTH_CHECK=1 — skipping Supabase Auth security check.");
  process.exit(0);
}

if (!TOKEN || !REF) {
  console.error(
    "❌ Supabase Auth security check: SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF must be set.\n" +
      "   Add them as repository secrets, or set SKIP_SUPABASE_AUTH_CHECK=1 to bypass.",
  );
  process.exit(1);
}

const url = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
let cfg;
try {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`❌ Supabase Management API ${res.status}: ${body}`);
    process.exit(1);
  }
  cfg = await res.json();
} catch (err) {
  console.error("❌ Failed to reach Supabase Management API:", err?.message ?? err);
  process.exit(1);
}

const issues = [];

// 1. Leaked password protection (HaveIBeenPwned)
if (cfg.password_hibp_enabled !== true) {
  issues.push(
    "Leaked Password Protection is DISABLED. Enable HaveIBeenPwned in Authentication → Providers → Email.",
  );
}

// 2. Minimum password length
const minLen = Number(cfg.password_min_length ?? 0);
if (!minLen || minLen < 8) {
  issues.push(`Minimum password length is ${minLen || "unset"}; should be at least 8.`);
}

// 3. OTP expiry should be <= 1 hour
const otpExp = Number(cfg.mailer_otp_exp ?? cfg.sms_otp_exp ?? 0);
if (otpExp && otpExp > 3600) {
  issues.push(`OTP expiry is ${otpExp}s; should be <= 3600s (1 hour).`);
}

if (issues.length > 0) {
  console.error("❌ Supabase Auth security check failed:\n");
  for (const i of issues) console.error("  • " + i);
  console.error(
    `\nFix at: https://supabase.com/dashboard/project/${REF}/auth/providers`,
  );
  process.exit(1);
}

console.log("✅ Supabase Auth security check passed.");
