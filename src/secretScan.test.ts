import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseAdminKey } from "./storage/adminKey.js";

// CLAUDE.md §2 rule 1: the raw GitHub token must never be committed. Scans every tracked file, plus
// untracked files that aren't gitignored (so a local run catches a file before it's committed).
// Matches token-shaped strings (prefix + 20 or more token characters; real tokens are longer), so rule 1's own
// mention of the bare prefixes in CLAUDE.md doesn't trip it. Patterns are built by concatenation so this
// file doesn't match itself.
const TOKEN_PATTERNS = [new RegExp("github" + "_pat_[A-Za-z0-9_]{20,}"), new RegExp("gh" + "p_[A-Za-z0-9]{20,}")];

const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();

function candidateFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter((f) => f && existsSync(`${repoRoot}/${f}`));
}

describe("secret scan", () => {
  it("no committed file contains a GitHub token prefix", () => {
    const files = candidateFiles();
    expect(files.length).toBeGreaterThan(10);
    const offenders: string[] = [];
    for (const file of files) {
      const bytes = readFileSync(`${repoRoot}/${file}`);
      if (bytes.includes(0)) continue; // binary (icons)
      const text = bytes.toString("utf8");
      for (const pattern of TOKEN_PATTERNS) {
        if (pattern.test(text)) offenders.push(`${file} (matches ${pattern.source.slice(0, 3)}…)`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it("public/admin-key.json, if present, is exactly the §7.2 encrypted blob", () => {
    const path = `${repoRoot}/public/admin-key.json`;
    if (!existsSync(path)) return;
    expect(() => parseAdminKey(JSON.parse(readFileSync(path, "utf8")))).not.toThrow();
  });
});
