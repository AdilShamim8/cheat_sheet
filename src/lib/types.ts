// ─────────────────────────────────────────────────────────────────────────────
// cheat_sheet — Content Data Model (v2 — expert-level expansion)
// ─────────────────────────────────────────────────────────────────────────────
// Each page is one TypeScript file exporting a `CheatSheet` object.
// All v2 sections are OPTIONAL — existing v1 content keeps working.
// Fill in what's relevant; omit what isn't.
// ─────────────────────────────────────────────────────────────────────────────

export type Category = "languages" | "ml-ai" | "systems" | "topics";
export type Tier = 1 | 2 | 3 | "ml" | "sys" | "topic";

/** A single row in a scannable constructs table. */
export interface ConstructRow {
  syntax: string;
  behavior: string;
  when: string;
}

/** A code block with optional language hint and caption. */
export interface CodeBlock {
  lang?: string;
  caption?: string;
  code: string;
}

/** A single pitfall entry, ranked by debugging cost. */
export interface Pitfall {
  title: string;
  symptom: string;
  fix: string;
}

/** A single Quick Reference fact. */
export interface QuickFact {
  fact: string;
  tag?: string;
}

/** A "Go Deeper" link. */
export interface DeepLink {
  title: string;
  url: string;
  note: string;
}

/** Ecosystem tool entry. */
export interface EcosystemTool {
  /** Tool name, e.g. "pytest", "cargo", "webpack". */
  tool: string;
  /** One-sentence purpose. */
  purpose: string;
  /** Optional canonical URL. */
  url?: string;
  /** Category tag: "build", "test", "lint", "package", "deploy", "debug". */
  category?: string;
}

/** Version history milestone. */
export interface VersionMilestone {
  version: string;
  year: number;
  /** One-sentence headline feature or breaking change. */
  highlight: string;
}

/** Data types deep-dive — split into primitives / collections / custom. */
export interface DataTypesSection {
  /** Built-in scalar types — int, float, bool, char, etc. */
  primitives: ConstructRow[];
  /** Collection types — list, map, set, tuple, etc. */
  collections: ConstructRow[];
  /** User-defined types — struct, class, enum, type alias, trait. */
  custom: ConstructRow[];
}

// ─── The full per-topic content shape ────────────────────────────────────────

export interface CheatSheet {
  // ─── Identity ──────────────────────────────────────────────────────────────
  slug: string;
  name: string;
  category: Category;
  tier: Tier;
  tags: string[];
  tagline: string;
  year?: number;
  author?: string;
  /** Optional — last content revision date (ISO). */
  lastUpdated?: string;
  /** Optional — estimated reading time in minutes (auto-computed if absent). */
  readingTime?: number;

  // ─── §1–7 (original 80/20 template) ────────────────────────────────────────
  tldr: string[];
  mentalModel: { title: string; body: string };
  constructs: ConstructRow[];
  patterns: CodeBlock[];
  pitfalls: Pitfall[];
  quickReference: QuickFact[];
  goDeeper: DeepLink[];

  // ─── §8+ (v2 expert-level expansion — ALL OPTIONAL) ───────────────────────

  /** §8 — Data types deep dive: primitives, collections, custom. */
  dataTypes?: DataTypesSection;

  /** §9 — Operators & expressions reference (arithmetic, logical, bitwise, comparison). */
  operators?: ConstructRow[];

  /** §10 — Input / output patterns (stdin, stdout, files, serialization, network). */
  inputOutput?: CodeBlock[];

  /** §11 — Loop & iteration patterns (for, while, recursion, iterators, comprehensions). */
  loops?: CodeBlock[];

  /** §12 — Functions & callables (definition, args, closures, decorators, generics). */
  functions?: CodeBlock[];

  /** §13 — Error handling deep dive (try/catch, result types, panic vs error, recovery). */
  errorHandling?: CodeBlock[];

  /** §14 — Concurrency model (threads, async/await, channels, locks, parallelism). */
  concurrency?: CodeBlock[];

  /** §15 — Testing patterns (unit, property, integration, mocks, fixtures). */
  testing?: CodeBlock[];

  /** §16 — Performance tuning notes (profiling, hot paths, memory, caching). */
  performance?: QuickFact[];

  /** §17 — Ecosystem & tooling (build, package, lint, test, debug, deploy). */
  ecosystem?: EcosystemTool[];

  /** §18 — Version history / migration milestones. */
  versionHistory?: VersionMilestone[];

  /** §19 — Interview hot questions (5-10 with concise model answers). */
  interview?: { q: string; a: string; difficulty?: "easy" | "medium" | "hard" }[];

  /** §20 — Comparison to neighbors (when to choose this vs alternatives). */
  comparisons?: { vs: string; whenThis: string; whenThat: string }[];
}

// ─── Category metadata ───────────────────────────────────────────────────────

export interface CategoryMeta {
  slug: Category;
  name: string;
  description: string;
  icon: string;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    slug: "languages",
    name: "Languages",
    description: "Programming languages in active industry use, tiered by real-world prevalence.",
    icon: "{ }",
  },
  {
    slug: "ml-ai",
    name: "ML / AI",
    description: "Frameworks for training, serving, and reasoning about ML systems.",
    icon: "△",
  },
  {
    slug: "systems",
    name: "Systems & Architecture",
    description: "Designing distributed systems — the concepts that outlast any single tool.",
    icon: "⌬",
  },
  {
    slug: "topics",
    name: "Topics",
    description: "Everything else engineers reach for daily: Git, Docker, Linux, networking, DevOps. Grows indefinitely.",
    icon: "≡",
  },
];

export const TIER_LABEL: Record<Tier, string> = {
  1: "Tier 1 · Core",
  2: "Tier 2 · Domain",
  3: "Tier 3 · Specialized",
  ml: "ML / AI",
  sys: "Systems",
  topic: "Topic",
};

// ─── Section registry — drives the renderer and TOC ─────────────────────────

export interface SectionDef {
  id: string;
  num: string;
  /** i18n key for the title — resolved via useLanguage(). */
  titleKey: string;
  /** i18n key for the subtitle. */
  subtitleKey: string;
  /** Icon name from lucide-react. */
  icon: string;
  /** Whether this section is optional (only shown if present in the sheet). */
  optional: boolean;
}

export const SECTION_DEFS: SectionDef[] = [
  { id: "tldr",          num: "1",  titleKey: "sec.tldr.title",          subtitleKey: "sec.tldr.sub",          icon: "Zap",            optional: false },
  { id: "mentalModel",   num: "2",  titleKey: "sec.mental.title",        subtitleKey: "sec.mental.sub",        icon: "Compass",        optional: false },
  { id: "constructs",    num: "3",  titleKey: "sec.constructs.title",    subtitleKey: "sec.constructs.sub",    icon: "ListChecks",     optional: false },
  { id: "patterns",      num: "4",  titleKey: "sec.patterns.title",      subtitleKey: "sec.patterns.sub",      icon: "Code2",          optional: false },
  { id: "pitfalls",      num: "5",  titleKey: "sec.pitfalls.title",      subtitleKey: "sec.pitfalls.sub",      icon: "AlertTriangle",  optional: false },
  { id: "quickReference",num: "6",  titleKey: "sec.quick.title",         subtitleKey: "sec.quick.sub",         icon: "FileText",       optional: false },
  { id: "goDeeper",      num: "7",  titleKey: "sec.deeper.title",        subtitleKey: "sec.deeper.sub",        icon: "BookOpen",       optional: false },
  { id: "dataTypes",     num: "8",  titleKey: "sec.datatypes.title",     subtitleKey: "sec.datatypes.sub",     icon: "Boxes",          optional: true },
  { id: "operators",     num: "9",  titleKey: "sec.operators.title",     subtitleKey: "sec.operators.sub",     icon: "Plus",           optional: true },
  { id: "inputOutput",   num: "10", titleKey: "sec.io.title",            subtitleKey: "sec.io.sub",            icon: "ArrowLeftRight", optional: true },
  { id: "loops",         num: "11", titleKey: "sec.loops.title",         subtitleKey: "sec.loops.sub",         icon: "Repeat",         optional: true },
  { id: "functions",     num: "12", titleKey: "sec.functions.title",     subtitleKey: "sec.functions.sub",     icon: "FunctionSquare", optional: true },
  { id: "errorHandling", num: "13", titleKey: "sec.errors.title",        subtitleKey: "sec.errors.sub",        icon: "ShieldAlert",    optional: true },
  { id: "concurrency",   num: "14", titleKey: "sec.concurrency.title",   subtitleKey: "sec.concurrency.sub",   icon: "GitBranch",      optional: true },
  { id: "testing",       num: "15", titleKey: "sec.testing.title",       subtitleKey: "sec.testing.sub",       icon: "FlaskConical",   optional: true },
  { id: "performance",   num: "16", titleKey: "sec.perf.title",          subtitleKey: "sec.perf.sub",          icon: "Gauge",          optional: true },
  { id: "ecosystem",     num: "17", titleKey: "sec.ecosystem.title",     subtitleKey: "sec.ecosystem.sub",     icon: "Package",        optional: true },
  { id: "versionHistory",num: "18", titleKey: "sec.versions.title",      subtitleKey: "sec.versions.sub",      icon: "History",        optional: true },
  { id: "interview",     num: "19", titleKey: "sec.interview.title",     subtitleKey: "sec.interview.sub",     icon: "MessageCircleQuestion", optional: true },
  { id: "comparisons",   num: "20", titleKey: "sec.comparisons.title",   subtitleKey: "sec.comparisons.sub",   icon: "Scale",          optional: true },
];
