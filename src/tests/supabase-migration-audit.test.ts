import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Auditoria histórica do Supabase (somente leitura)", () => {
  it("usa captura com hashes de SQL sem armazenar o corpo das migrações", () => {
    const snapshot = JSON.parse(readFileSync(
      resolve(process.cwd(), "audits/supabase-migrations-2026-10-19.json"), "utf8",
    )) as { entries: Array<Record<string, unknown>> };
    const versions = snapshot.entries.map((item) => item.version);
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions).size).toBe(versions.length);
    for (const row of snapshot.entries) {
      expect(row.version).toMatch(/^\d{14}$/);
      expect(row.git_hash_exact).toMatch(/^[a-f0-9]{40}$/);
      expect(row.git_hash_with_newline).toMatch(/^[a-f0-9]{40}$/);
      expect(row).not.toHaveProperty("statements");
      expect(row).not.toHaveProperty("original_sql");
      expect(row).not.toHaveProperty("sql");
    }
  });

  it("calcula divergências sem conexão de rede e sem modificar banco ou arquivos", () => {
    const raw = execFileSync(process.execPath, [
      resolve(process.cwd(), "scripts/audit-supabase-migration-history.mjs"),
      "--json",
    ], { cwd: process.cwd(), encoding: "utf8" });
    const report = JSON.parse(raw);
    expect(report.counts.remoteVersions).toBeGreaterThan(0);
    expect(report.counts.localFiles).toBeGreaterThan(0);
    expect(
      report.counts.sameVersionSameSql +
      report.counts.sameSqlDifferentVersion +
      report.counts.sameVersionDifferentSql +
      report.counts.remoteWithoutIdenticalSql,
    ).toBe(report.counts.remoteVersions);
    expect(report.counts.sameVersion + report.counts.remoteVersionWithoutLocalVersion)
      .toBe(report.counts.remoteVersions);
    expect(report.sameSqlDifferentVersion).toHaveLength(report.counts.sameSqlDifferentVersion);
    // SQL contents verified against the 19/10 snapshot must now carry
    // their exact remote migration versions. No DB write is involved.
    expect(report.counts.sameSqlDifferentVersion).toBe(0);
    expect(report.counts.sameVersionSameSql).toBeGreaterThanOrEqual(56);
    expect(report.noMatchingSqlFile).toHaveLength(report.counts.remoteWithoutIdenticalSql);
  });
});
