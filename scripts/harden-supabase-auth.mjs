#!/usr/bin/env node

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.SUPABASE_PROJECT_REF || "bllqvpnjfpcvujrbrbig";
const API = `https://api.supabase.com/v1/projects/${REF}/config/auth`;
const PASSWORD_CLASSES = "abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789:!@#$%^&*()_+-=[]{};'\\\\:\\"|<>?,./\`~";

if (!TOKEN) {
  console.error("SUPABASE_ACCESS_TOKEN is required.");
  process.exit(1);
}

const desired = {
  site_url: "https://cofre360.vercel.app",
  uri_allow_list: "https://cofre360.vercel.app/auth",
  mailer_autoconfirm: false,
  mailer_allow_unverified_email_sign_ins: false,
  external_anonymous_users_enabled: false,
  password_min_length: 12,
  password_required_characters: PASSWORD_CLASSES,
  jwt_exp: 3600,
  mailer_otp_exp: 3600,
  mailer_otp_length: 6,
  mailer_secure_email_change_enabled: true,
  refresh_token_rotation_enabled: true,
  security_refresh_token_reuse_interval: 10,
  security_manual_linking_enabled: false,
  security_update_password_require_reauthentication: true,
  security_update_password_require_current_password: true,
  mfa_totp_enroll_enabled: true,
  mfa_totp_verify_enabled: true,
  mfa_max_enrolled_factors: 3,
  sessions_inactivity_timeout: 604800,
  sessions_timebox: 2592000,
};

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
};

async function request(method, body) {
  const response = await fetch(API, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    // Keep error output generic so configuration responses never leak secrets.
  }

  if (!response.ok) {
    console.error(`Supabase Management API ${method} failed with HTTP ${response.status}.`);
    if (json?.message) console.error(String(json.message));
    process.exit(1);
  }

  return json;
}

function verify(config) {
  const failures = [];

  for (const [key, expected] of Object.entries(desired)) {
    const actual = config[key];
    if (actual !== expected) {
      failures.push(`${key}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
    }
  }

  if (config.password_hibp_enabled !== true) {
    console.warn("Leaked Password Protection remains disabled (expected on Supabase Free).");
  }

  if (failures.length) {
    console.error("Supabase Auth hardening verification failed:");
    for (const failure of failures) console.error(" - " + failure);
    process.exit(1);
  }
}

const before = await request("GET");
console.log("Current Auth configuration loaded.");

await request("PATCH", desired);
console.log("Security configuration applied.");

const after = await request("GET");
verify(after);

console.log("Supabase Auth hardening verified:");
console.log(" - email confirmation required");
console.log(" - unverified email sign-in disabled");
console.log(" - 12-character server-side password policy with all character classes");
console.log(" - 1-hour JWT and email OTP lifetime");
console.log(" - secure email changes and refresh-token rotation enabled");
console.log(" - password changes require current/recent authentication");
console.log(" - TOTP MFA enabled");
console.log(" - sessions expire after 7 days inactivity / 30 days maximum");
