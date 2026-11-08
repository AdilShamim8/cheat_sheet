// Content validation: every registered sheet must satisfy the schema contract.
// Run: node scripts/validate-content.mjs   (no TS deps — uses esbuild-free regex import via tsx)
import { execSync } from "node:child_process";
const out = execSync("bunx tsx -e 'import { ALL_SHEETS } from \"@/lib/registry\"; console.log(JSON.stringify(ALL_SHEETS.map(s => ({slug: s.slug, name: s.name, category: s.category, tier: s.tier, hasTldr: s.tldr?.length > 0, hasModel: !!s.mentalModel?.body, nConstructs: s.constructs?.length || 0, nPatterns: s.patterns?.length || 0, nPitfalls: s.pitfalls?.length || 0, nQuick: s.quickReference?.length || 0, nLinks: s.goDeeper?.length || 0, lastUpdated: s.lastUpdated || null})))'", { encoding: "utf8", cwd: process.cwd() });
const sheets = JSON.parse(out.slice(out.indexOf("[")));
let errors = 0;
for (const s of sheets) {
  for (const [k, ok] of [
    ["tldr", s.hasTldr], ["mentalModel", s.hasModel], ["constructs>=8", s.nConstructs >= 8],
    ["patterns>=3", s.nPatterns >= 3], ["pitfalls>=5", s.nPitfalls >= 5],
    ["quickRef>=10", s.nQuick >= 10], ["goDeeper>=3", s.nLinks >= 3],
  ]) if (!ok) { console.error("FAIL", s.slug, k); errors++; }
}
console.log(`\n${sheets.length} sheets checked, ${errors} problems`);
process.exit(errors ? 1 : 0);
