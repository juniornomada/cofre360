import { execFileSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" })
  .split(/\r?\n/)
  .map((value) => value.trim())
  .filter(Boolean);

const violations = tracked.filter((file) => {
  const base = file.split("/").at(-1) || file;
  if (base === ".env.example") return false;
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (/^(?:.*-)?export-.*\.csv$/i.test(base)) return true;
  if (/^(transactions|bank_accounts|card_payments|cards|budget_categories|categories|subcategories|goals|reminders)-.*\.csv$/i.test(base)) return true;
  return false;
});

if (violations.length) {
  console.error("Sensitive/private files must not be tracked by Git:");
  for (const file of violations) console.error(` - ${file}`);
  process.exit(1);
}

console.log("Sensitive-file guard: OK");
