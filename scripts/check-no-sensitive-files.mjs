import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);

const filenameViolations = tracked.filter((file) => {
  const base = file.split("/").at(-1) || file;
  if (base === ".env.example") return false;
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (/^(?:.*-)?export-.*\.csv$/i.test(base)) return true;
  if (/^(transactions|bank_accounts|card_payments|cards|budget_categories|categories|subcategories|goals|reminders)-.*\.csv$/i.test(base)) return true;
  return false;
});

const secretPatterns = [
  { name: "private key", re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g },
  { name: "Supabase secret key", re: /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g },
  { name: "GitHub token", re: /\bgh(?:p|o|u|s|r)_[A-Za-z0-9]{20,}\b/g },
  { name: "GitHub fine-grained token", re: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g },
  { name: "OpenAI-style secret", re: /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}\b/g },
  { name: "Stripe live secret", re: /\bsk_live_[A-Za-z0-9]{20,}\b/g },
  { name: "AWS access key", re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g },
  { name: "Google API key", re: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
  { name: "Slack token", re: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: "npm token", re: /\bnpm_[A-Za-z0-9]{30,}\b/g },
  { name: "Vercel token", re: /\bvercel_[A-Za-z0-9_-]{20,}\b/g },
];

function decodeBase64Url(value) {
  try {
    const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    return Buffer.from(padded, "base64").toString("utf8");
  } catch {
    return "";
  }
}

function containsSupabaseServiceRoleJwt(text) {
  const jwtPattern = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g;
  for (const match of text.matchAll(jwtPattern)) {
    const [, payload = ""] = match[0].split(".");
    try {
      const decoded = JSON.parse(decodeBase64Url(payload));
      if (decoded?.role === "service_role") return true;
    } catch {
      // Ignore non-JSON JWT-like strings.
    }
  }
  return false;
}

const contentViolations = [];

for (const file of tracked) {
  let stats;
  try {
    stats = statSync(file);
  } catch {
    continue;
  }

  // Avoid reading unexpectedly huge generated artifacts if one is ever tracked.
  if (!stats.isFile() || stats.size > 2 * 1024 * 1024) continue;

  let buffer;
  try {
    buffer = readFileSync(file);
  } catch {
    continue;
  }

  // Skip binary files.
  if (buffer.includes(0)) continue;

  const text = buffer.toString("utf8");

  for (const { name, re } of secretPatterns) {
    re.lastIndex = 0;
    if (re.test(text)) {
      contentViolations.push({ file, reason: name });
    }
  }

  if (containsSupabaseServiceRoleJwt(text)) {
    contentViolations.push({ file, reason: "Supabase service_role JWT" });
  }
}

if (filenameViolations.length || contentViolations.length) {
  if (filenameViolations.length) {
    console.error("Sensitive/private files must not be tracked by Git:");
    for (const file of filenameViolations) console.error(` - ${file}`);
  }

  if (contentViolations.length) {
    console.error("High-confidence secret material must not be committed:");
    for (const { file, reason } of contentViolations) {
      console.error(` - ${file}: ${reason}`);
    }
  }

  process.exit(1);
}

console.log("Sensitive-file and secret-content guard: OK");
