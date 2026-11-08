// Extract factual claims from all sheets for double-checking:
// latest versionHistory milestones + 2026-dated claims in tldr/quickReference.
import { ALL_SHEETS } from "@/lib/registry";

interface Claim { sheet: string; claim: string; }

const claims: Claim[] = [];

for (const s of ALL_SHEETS) {
  const vh = s.versionHistory ?? [];
  // last two milestones (the "current" facts)
  for (const m of vh.slice(-2)) {
    claims.push({ sheet: s.slug, claim: `${s.name} ${m.version} (${m.year}): ${m.highlight}` });
  }
  // tldr / quickReference lines that mention 2026 or a version-like token
  const scan = [...(s.tldr ?? []), ...(s.quickReference ?? []).map(q => q.fact)];
  for (const line of scan) {
    if (/202[5-6]|v?\d+\.\d+(\.\d+)? (is|as of|released)/i.test(line)) {
      claims.push({ sheet: s.slug, claim: line });
    }
  }
}

console.log(`TOTAL CLAIMS: ${claims.length}\n`);
for (const c of claims) console.log(`[${c.sheet}] ${c.claim}`);
