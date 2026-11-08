// Content validation: every registered sheet must satisfy the schema contract.
// Run: bun scripts/validate-content.ts
// (uses bun for native tsconfig path-alias resolution)
import { ALL_SHEETS } from "@/lib/registry";
import type { CheatSheet } from "@/lib/types";

interface SheetStats {
  slug: string;
  name: string;
  category: string;
  tier: number | string;
  hasTldr: boolean;
  hasModel: boolean;
  nConstructs: number;
  nPatterns: number;
  nPitfalls: number;
  nQuick: number;
  nLinks: number;
  lastUpdated: string | null;
}

const REQUIRED = ["tldr", "mentalModel", "constructs", "patterns", "pitfalls", "quickReference", "goDeeper"] as const;

function stats(s: CheatSheet): SheetStats {
  return {
    slug: s.slug,
    name: s.name,
    category: s.category,
    tier: s.tier,
    hasTldr: (s.tldr?.length ?? 0) > 0,
    hasModel: !!s.mentalModel?.body,
    nConstructs: s.constructs?.length ?? 0,
    nPatterns: s.patterns?.length ?? 0,
    nPitfalls: s.pitfalls?.length ?? 0,
    nQuick: s.quickReference?.length ?? 0,
    nLinks: s.goDeeper?.length ?? 0,
    lastUpdated: s.lastUpdated ?? null,
  };
}

const sheets = ALL_SHEETS.map(stats);
let errors = 0;

// 1) uniqueness
const slugs = new Set<string>();
for (const s of sheets) {
  if (slugs.has(s.slug)) {
    console.error(`FAIL duplicate slug: ${s.slug}`);
    errors++;
  }
  slugs.add(s.slug);
}

// 2) required-section thresholds
for (const s of sheets) {
  const checks: Array<[string, boolean]> = [
    ["tldr non-empty", s.hasTldr],
    ["mentalModel.body", s.hasModel],
    ["constructs >= 8", s.nConstructs >= 8],
    ["patterns >= 3", s.nPatterns >= 3],
    ["pitfalls >= 5", s.nPitfalls >= 5],
    ["quickReference >= 10", s.nQuick >= 10],
    ["goDeeper >= 3", s.nLinks >= 3],
    ["lastUpdated set", s.lastUpdated !== null],
  ];
  for (const [label, ok] of checks) {
    if (!ok) {
      console.error(`FAIL ${s.slug}: ${label}`);
      errors++;
    }
  }
}

// 3) stale-content warning (>12 months since lastUpdated)
const now = new Date("2026-11");
for (const s of sheets) {
  if (s.lastUpdated) {
    const [y, m] = s.lastUpdated.split("-").map(Number);
    const age = (now.getFullYear() - y) * 12 + (now.getMonth() + 1 - m);
    if (age > 12) {
      console.error(`STALE ${s.slug}: lastUpdated ${s.lastUpdated} (${age} months old)`);
      errors++;
    }
  }
}

console.log(`\n${sheets.length} sheets checked, ${errors} problems`);
process.exit(errors ? 1 : 0);
