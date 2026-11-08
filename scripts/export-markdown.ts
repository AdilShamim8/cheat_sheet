// Export every registered cheat sheet to Markdown.
// Run: bun scripts/export-markdown.ts [outputDir]
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ALL_SHEETS } from "@/lib/registry";
import { CATEGORIES, TIER_LABEL, type CheatSheet, type ConstructRow, type CodeBlock } from "@/lib/types";

const outDir = process.argv[2] ?? "cheat-sheets";
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const BT = String.fromCharCode(96);            // backtick, avoids source-quoting issues
const FENCE = BT.repeat(3);
const NL = String.fromCharCode(10);
const esc = (s: string) => s.replace(/\|/g, "\\|").replace(/\n/g, " ");

function h(level: number, text: string): string {
  return "#".repeat(level) + " " + text + NL + NL;
}

function constructTable(rows: ConstructRow[] | undefined, title: string, level: number): string {
  if (!rows || !rows.length) return "";
  let out = h(level, title);
  out += "| Syntax | Behavior | When to use |" + NL + "| --- | --- | --- |" + NL;
  for (const r of rows) out += "| " + esc(r.syntax) + " | " + esc(r.behavior) + " | " + esc(r.when) + " |" + NL;
  return out + NL;
}

function codeBlocks(blocks: CodeBlock[] | undefined, title: string, level: number): string {
  if (!blocks || !blocks.length) return "";
  let out = h(level, title);
  for (const b of blocks) {
    if (b.caption) out += "**" + b.caption + "**" + NL + NL;
    out += FENCE + (b.lang ?? "") + NL + b.code + NL + FENCE + NL + NL;
  }
  return out;
}

function renderSheet(s: CheatSheet): string {
  let md = h(1, s.name);
  const meta: string[] = [
    "**Category:** " + (CATEGORIES.find(c => c.slug === s.category)?.name ?? s.category),
    "**Tier:** " + TIER_LABEL[s.tier],
    "**Tags:** " + s.tags.join(", "),
  ];
  if (s.year) meta.push("**First released:** " + String(s.year));
  if (s.author) meta.push("**Author:** " + s.author);
  if (s.lastUpdated) meta.push("**Last updated:** " + s.lastUpdated);
  md += meta.join(" · ") + NL + NL;
  md += "> " + s.tagline + NL + NL + "---" + NL + NL;

  if (s.tldr && s.tldr.length) {
    md += h(2, "TL;DR");
    for (const t of s.tldr) md += "- " + t + NL;
    md += NL;
  }
  if (s.mentalModel) {
    md += h(2, "Core Mental Model") + "**" + s.mentalModel.title + ".** " + s.mentalModel.body + NL + NL;
  }
  md += constructTable(s.constructs, "Must-Know Constructs", 2);
  md += codeBlocks(s.patterns, "Idiomatic Patterns", 2);
  if (s.pitfalls && s.pitfalls.length) {
    md += h(2, "Common Pitfalls");
    for (let i = 0; i < s.pitfalls.length; i++) {
      const p = s.pitfalls[i];
      md += String(i + 1) + ". **" + p.title + "** — *Symptom:* " + p.symptom + " *Fix:* " + p.fix + NL;
    }
    md += NL;
  }
  if (s.quickReference && s.quickReference.length) {
    md += h(2, "Production / Interview Quick Reference");
    for (const q of s.quickReference) md += "- " + q.fact + (q.tag ? " " + BT + q.tag + BT : "") + NL;
    md += NL;
  }
  if (s.goDeeper && s.goDeeper.length) {
    md += h(2, "Go Deeper");
    for (const l of s.goDeeper) md += "- [" + l.title + "](" + l.url + ") — " + l.note + NL;
    md += NL;
  }
  if (s.dataTypes) {
    md += h(2, "Data Types Deep Dive");
    md += constructTable(s.dataTypes.primitives, "Primitives", 3);
    md += constructTable(s.dataTypes.collections, "Collections", 3);
    md += constructTable(s.dataTypes.custom, "Custom types", 3);
  }
  md += constructTable(s.operators, "Operators & Expressions", 2);
  md += codeBlocks(s.inputOutput, "Input / Output", 2);
  md += codeBlocks(s.loops, "Loops & Iteration", 2);
  md += codeBlocks(s.functions, "Functions & Callables", 2);
  md += codeBlocks(s.errorHandling, "Error Handling", 2);
  md += codeBlocks(s.concurrency, "Concurrency Model", 2);
  md += codeBlocks(s.testing, "Testing Patterns", 2);
  if (s.performance && s.performance.length) {
    md += h(2, "Performance Tuning");
    for (const p of s.performance) md += "- " + p.fact + NL;
    md += NL;
  }
  if (s.ecosystem && s.ecosystem.length) {
    md += h(2, "Ecosystem & Tooling");
    md += "| Tool | Purpose | Category |" + NL + "| --- | --- | --- |" + NL;
    for (const t of s.ecosystem)
      md += "| " + (t.url ? "[" + t.tool + "](" + t.url + ")" : t.tool) + " | " + esc(t.purpose) + " | " + (t.category ?? "") + " |" + NL;
    md += NL;
  }
  if (s.versionHistory && s.versionHistory.length) {
    md += h(2, "Version History");
    md += "| Version | Year | Highlight |" + NL + "| --- | --- | --- |" + NL;
    for (const v of s.versionHistory) md += "| " + v.version + " | " + v.year + " | " + esc(v.highlight) + " |" + NL;
    md += NL;
  }
  if (s.interview && s.interview.length) {
    md += h(2, "Interview Hot Questions");
    for (let i = 0; i < s.interview.length; i++) {
      const q = s.interview[i];
      md += String(i + 1) + ". **" + q.q + "**" + (q.difficulty ? " *(" + q.difficulty + ")*" : "") + NL + NL + "   " + q.a + NL + NL;
    }
  }
  if (s.comparisons && s.comparisons.length) {
    md += h(2, "When to Choose This");
    for (const c of s.comparisons) md += "- **vs " + c.vs + ":** use this — " + c.whenThis + "; use that — " + c.whenThat + NL;
    md += NL;
  }
  return md;
}

let total = 0;
for (const s of ALL_SHEETS) {
  mkdirSync(join(outDir, s.category), { recursive: true });
  writeFileSync(join(outDir, s.category, s.slug + ".md"), renderSheet(s));
  total++;
}

let idx = "# Cheat Sheet — Complete Reference Collection" + NL + NL;
idx += "**46 expert-level cheat sheets** exported from [cheat_sheet](https://github.com/AdilShamim8/cheat_sheet) · live site: <https://cheat-sheet-drab-rho.vercel.app> · exported " + new Date().toISOString().slice(0, 10) + NL + NL;
for (const cat of CATEGORIES) {
  const sheets = ALL_SHEETS.filter(s => s.category === cat.slug);
  if (!sheets.length) continue;
  idx += h(2, cat.icon + " " + cat.name);
  idx += cat.description + NL + NL;
  idx += "| # | Sheet | Tier | One-liner |" + NL + "| --- | --- | --- | --- |" + NL;
  for (let i = 0; i < sheets.length; i++) {
    const s = sheets[i];
    idx += "| " + (i + 1) + " | [" + s.name + "](" + cat.slug + "/" + s.slug + ".md) | " + TIER_LABEL[s.tier] + " | " + esc(s.tagline) + " |" + NL;
  }
  idx += NL;
}
writeFileSync(join(outDir, "README.md"), idx);
console.log("Exported " + total + " sheets + index to " + outDir + "/");
