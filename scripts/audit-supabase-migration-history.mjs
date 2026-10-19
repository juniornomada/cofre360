#!/usr/bin/env node
/**
 * Read-only comparison between a captured Supabase migration history and
 * locally tracked SQL files. No credentials, network, SQL execution or writes.
 *
 * Usage:
 *   node scripts/audit-supabase-migration-history.mjs
 *   node scripts/audit-supabase-migration-history.mjs --json
 *   node scripts/audit-supabase-migration-history.mjs --strict
 *   node scripts/audit-supabase-migration-history.mjs path/to/snapshot.json
 *
 * A snapshot is historical evidence, NOT live verification of production.
 */
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { basename, resolve } from "node:path";

const args = process.argv.slice(2);
const outputJson = args.includes("--json");
const strict = args.includes("--strict");
const input = args.find((argument) => !argument.startsWith("--")) ||
  "audits/supabase-migrations-2026-10-19.json";

function gitBlobSha(contents) {
  return createHash("sha1")
    .update(Buffer.from("blob " + contents.byteLength + "\0", "utf8"))
    .update(contents)
    .digest("hex");
}

function requireVersion(version) {
  if (typeof version !== "string" || !/^\d{14}$/.test(version)) {
    throw new Error("Invalid migration version in snapshot: " + String(version));
  }
}

function main() {
  const snapshot = JSON.parse(readFileSync(resolve(input), "utf8"));
  if (!Array.isArray(snapshot.entries)) throw new Error("Invalid remote snapshot");
  const seenRemote = new Set();
  for (const entry of snapshot.entries) {
    requireVersion(entry.version);
    if (seenRemote.has(entry.version)) throw new Error("Duplicate remote version: " + entry.version);
    seenRemote.add(entry.version);
    if (![entry.git_hash_exact, entry.git_hash_with_newline].every(
      (hash) => typeof hash === "string" && /^[0-9a-f]{40}$/.test(hash),
    )) throw new Error("Invalid SQL fingerprint for " + entry.version);
  }

  const files = readdirSync(resolve("supabase/migrations"))
    .filter((filename) => /^\d{14}_.+\.sql$/.test(filename))
    .sort();
  const local = files.map((filename) => {
    const body = readFileSync(resolve("supabase/migrations", filename));
    return { filename, version: basename(filename).slice(0, 14), sha: gitBlobSha(body) };
  });
  const bySha = new Map();
  for (const file of local) {
    const matches = bySha.get(file.sha) || [];
    matches.push(file);
    bySha.set(file.sha, matches);
  }
  const localVersions = new Set(local.map((file) => file.version));

  const classified = snapshot.entries.map((remote) => {
    const possible = [...new Map([
      ...(bySha.get(remote.git_hash_exact) || []),
      ...(bySha.get(remote.git_hash_with_newline) || []),
    ].map((file) => [file.filename, file])).values()];
    const exactVersion = possible.find((file) => file.version === remote.version);
    const best = exactVersion || possible[0] || null;
    const hasLocalVersion = localVersions.has(remote.version);
    return {
      version: remote.version,
      name: remote.name || "",
      localFile: best?.filename || null,
      finding: exactVersion
        ? "same_version_same_sql"
        : best
          ? "same_sql_different_version"
          : hasLocalVersion
            ? "same_version_different_sql"
            : "no_matching_sql_file",
    };
  });
  const coveredVersions = new Set(snapshot.entries.map((entry) => entry.version));
  const matchedFiles = new Set(classified.map((entry) => entry.localFile).filter(Boolean));

  const result = {
    captureDate: snapshot.capture_date,
    projectRef: snapshot.project_ref,
    note: "Read-only snapshot comparison. Does not verify the current live state.",
    counts: {
      remoteVersions: classified.length,
      localFiles: local.length,
      sameVersion: classified.filter((item) => localVersions.has(item.version)).length,
      remoteVersionWithoutLocalVersion: classified.filter((item) => !localVersions.has(item.version)).length,
      localVersionWithoutRemoteVersion: local.filter((item) => !coveredVersions.has(item.version)).length,
      sameVersionSameSql: classified.filter((item) => item.finding === "same_version_same_sql").length,
      sameSqlDifferentVersion: classified.filter((item) => item.finding === "same_sql_different_version").length,
      sameVersionDifferentSql: classified.filter((item) => item.finding === "same_version_different_sql").length,
      remoteWithoutIdenticalSql: classified.filter((item) => item.finding === "no_matching_sql_file").length,
      localWithoutIdenticalRemoteSql: local.filter((item) => !matchedFiles.has(item.filename)).length,
    },
    sameSqlDifferentVersion: classified.filter((item) => item.finding === "same_sql_different_version"),
    sameVersionDifferentSql: classified.filter((item) => item.finding === "same_version_different_sql"),
    noMatchingSqlFile: classified.filter((item) => item.finding === "no_matching_sql_file"),
    localVersionWithoutRemoteVersion: local.filter((item) => !coveredVersions.has(item.version))
      .map((item) => item.filename),
  };

  if (outputJson) {
    process.stdout.write(JSON.stringify(result, null, 2) + "\n");
  } else {
    console.log("Supabase migration history — read-only audit");
    console.log("Snapshot:", snapshot.capture_date, "|", snapshot.project_ref);
    for (const [key, count] of Object.entries(result.counts)) {
      console.log(key.padEnd(34), String(count).padStart(4));
    }
    console.log("\nMatched SQL under different version names:");
    for (const row of result.sameSqlDifferentVersion) {
      console.log("  " + row.version + " → " + row.localFile);
    }
    console.log("\nRemote migrations with no byte-identical SQL file:", result.noMatchingSqlFile.length);
    console.log("This script never repairs or applies migrations.");
  }

  if (strict && (result.counts.remoteVersionWithoutLocalVersion > 0 ||
      result.counts.localVersionWithoutRemoteVersion > 0 ||
      result.counts.sameVersionDifferentSql > 0)) {
    process.exitCode = 1;
  }
}

main();
