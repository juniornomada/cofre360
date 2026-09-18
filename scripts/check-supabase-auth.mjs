#!/usr/bin/env node
/**
 * Production Supabase Auth security gate for Cofre360.
 *
 * Fails CI when a server-side setting can weaken account security. The
 * HaveIBeenPwned check is a warning on the Free plan because Supabase exposes
 * that control only on Pro and above.
 */
const SKIP = process.env.SKIP_SUPABASE_AUTH_CHECK === "1";
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF || "bllqvpnjfpcvujrbrbig";
const STRONGEST_PASSWORD_CLASSES = "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:!@#$%^&*()_+-=[]{};'\\\\:\"|<>?,./`~";

if (SKIP) {
  console.log("⚠️  Supabase Auth check skipped because the Management API token is unavailable.");
  process.exit(0);
}

if (!TOKEN) {
  console.error("❌ SUPABASE_ACCESS_TOKEN is required for the production Auth security gate.");
  process.exit(1);
}

const url = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
let cfg;
try {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` } });
  if (!res.ok) {
    console.error(`❌ Supabase Management API returned HTTP ${res.status}.`);
    process.exit(1);
  }
  cfg = await res.json();
} catch (err) {
  console.error("❌ Failed to reach Supabase Management API:", err?.message ?? err);
  process.exit(1);
}

const issues = [];
const warnings = [];

if (cfg.mailer_autoconfirm !== false) {
  issues.push("Email confirmation is not required (mailer_autoconfirm must be false).");
}
if (cfg.mailer_allow_unverified_email_sign_ins === true) {
  issues.push("Unverified email sign-ins are enabled.");
}
if (cfg.external_anonymous_users_enabled === true) {
  issues.push("Anonymous sign-ins are enabled.");
}

const minLen = Number(cfg.password_min_length ?? 0);
if (minLen < 12) {
  issues.push(`Minimum password length is ${minLen || "unset"}; Cofre360 requires at least 12.`);
}
if (cfg.password_required_characters !== STRONGEST_PASSWORD_CLASSES) {
  issues.push("Server-side password character requirements are weaker than the Cofre360 policy.");
}

const otpExp = Number(cfg.mailer_otp_exp ?? 0);
if (otpExp && otpExp > 3600) {
  issues.push(`Email OTP expiry is ${otpExp}s; maximum allowed is 3600s.`);
}

const jwtExp = Number(cfg.jwt_exp ?? 0);
if (jwtExp && jwtExp > 3600) {
  issues.push(`JWT expiry is ${jwtExp}s; maximum allowed is 3600s.`);
}

if (cfg.mailer_secure_email_change_enabled !== true) {
  issues.push("Secure/double email-change confirmation is disabled.");
}
if (cfg.refresh_token_rotation_enabled !== true) {
  issues.push("Refresh-token rotation is disabled.");
}
const reuse = Number(cfg.security_refresh_token_reuse_interval ?? 0);
if (reuse > 10) {
  issues.push(`Refresh-token reuse interval is ${reuse}s; maximum allowed is 10s.`);
}
if (cfg.security_manual_linking_enabled === true) {
  issues.push("Manual identity linking is enabled.");
}
if (typeof cfg.site_url !== "string" || !cfg.site_url.startsWith("https://")) {
  issues.push("Auth Site URL is not HTTPS.");
}

if (cfg.password_hibp_enabled !== true) {
  warnings.push("Leaked Password Protection is unavailable/disabled; enable it after upgrading Supabase to Pro.");
}

for (const warning of warnings) console.warn("⚠️  " + warning);

if (issues.length) {
  console.error("❌ Supabase Auth security gate failed:");
  for (const issue of issues) console.error("  • " + issue);
  process.exit(1);
}

console.log("✅ Supabase Auth security gate passed.");
