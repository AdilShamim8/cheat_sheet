# Cheat Sheet

**Premium, fast-loading developer reference platform.** Maximum signal, minimum noise — the 20% of knowledge that resolves 80% of real-world usage, distilled for working engineers who need fast recall, not tutorials.

Built with Next.js 16 + TypeScript + Tailwind CSS 4. Three switchable themes. Nine UI languages. **39 references × 20 sections each** — every page is an expert-level deep dive.

---

## Quick start

```bash
bun install
bun run dev        # http://localhost:3000
```

Production build:

```bash
bun run build
bun run start
```

Lint / type-check:

```bash
bun run lint
npx tsc --noEmit
```

---

## What's inside (v2)

39 references organized into 4 categories:

| Category | Count | Examples |
|---|---|---|
| **Languages** | 29 | Python, JavaScript, TypeScript, C++, C, Java, C#, Go, Rust, Ruby, PHP, Swift, Kotlin, Dart, R, SQL, Bash, Scala, Objective-C, Perl, Lua, Julia, MATLAB, Haskell, Elixir, Clojure, Assembly, Fortran, VBA |
| **ML / AI** | 4 | PyTorch, TensorFlow, Keras, scikit-learn |
| **Systems & Architecture** | 1 | System Design |
| **Topics** | 5 | Git, Docker, Linux, Networking, DevOps / CI-CD |

Each reference follows the **20-section 80/20 expert template**:

| § | Section | Purpose |
|---|---|---|
| 1 | TL;DR | What it is, where it's used, when to reach for it |
| 2 | Core Mental Model | The 20% that drives 80% of usage |
| 3 | Must-Know Constructs | Scannable syntax/behavior/when table |
| 4 | Idiomatic Patterns | Real-world code blocks (5-15 lines) |
| 5 | Common Pitfalls | Ranked by debugging time cost |
| 6 | Production / Interview Quick Reference | Facts you need under pressure |
| 7 | Go Deeper | Primary sources for the remaining 20% |
| 8 | Data Types Deep Dive | Primitives · collections · custom types |
| 9 | Operators & Expressions | Arithmetic · logical · bitwise · comparison |
| 10 | Input / Output | stdin · stdout · files · serialization |
| 11 | Loops & Iteration | for · while · recursion · iterators |
| 12 | Functions & Callables | Definition · args · closures · decorators |
| 13 | Error Handling | try/catch · result types · panic vs error |
| 14 | Concurrency Model | threads · async · channels · locks |
| 15 | Testing Patterns | unit · property · integration · mocks |
| 16 | Performance Tuning | profiling · hot paths · memory · caching |
| 17 | Ecosystem & Tooling | build · package · lint · test · deploy |
| 18 | Version History | Milestones that shaped the language |
| 19 | Interview Hot Questions | Frequent questions with model answers |
| 20 | When to Choose This | Versus neighboring alternatives |

---

## Architecture

### Templating strategy (§9)

Each page is **one TypeScript file** under `src/content/<category>/<slug>.ts` exporting a `CheatSheet` object that matches the schema in `src/lib/types.ts`. The shared renderer (`src/components/cheat/SheetView.tsx`) consumes that shape — adding a new page means adding one file and one import line in `src/lib/registry.ts`. No HTML authoring required.

All v2 sections (§8-§20) are **optional** — fill in what's relevant, omit what isn't.

### Routing

Hash-based routing (`#/languages/python`, `#/ml-ai/pytorch`, etc.) deploys as a single static page while preserving back/forward navigation. Router: `src/hooks/use-hash-route.ts`.

### Design system — 3 themes

| Theme | Style | When |
|---|---|---|
| **Black Hole** (default) | Dark, high-contrast, gravitational particle-field hero | Daily driving |
| **Blueprint** | Schematic / technical-drawing aesthetic | Diagrams & dense reading |
| **Editorial** | High-contrast light | Accessibility / daylight |

No FOUC — an inline `<head>` script applies the persisted theme before hydration. Switcher: `src/components/cheat/ThemeSwitcher.tsx`. Press `t` to cycle themes via keyboard.

### i18n — 9 UI languages

| Code | Language | Native | Direction |
|---|---|---|---|
| `en` | English | English | ltr |
| `zh` | Chinese | 中文 | ltr |
| `es` | Spanish | Español | ltr |
| `ar` | Arabic | العربية | **rtl** |
| `fr` | French | Français | ltr |
| `de` | German | Deutsch | ltr |
| `hi` | Hindi | हिन्दी | ltr |
| `bn` | Bengali | বাংলা | ltr |
| `ja` | Japanese | 日本語 | ltr |

The UI chrome (navbar, section headers, search, filters, footer, keyboard hints) localizes. The reference content itself stays in English — it's a developer reference, and code/technical terms are universal. RTL is fully supported for Arabic. Switcher: `src/components/cheat/LanguageSwitcher.tsx`. Translations: `src/lib/i18n.ts`.

### Custom syntax highlighter

~3KB dependency-free tokenizer in `src/lib/highlight.tsx`. Supports 25+ language slugs. Token classes map to theme tokens, so highlighted code re-themes instantly without re-rendering.

### Particle hero

Canvas 2D particle field in `src/components/cheat/ParticleHero.tsx`. Lazy-mounted via `IntersectionObserver`, disabled under `prefers-reduced-motion`, falls back to a static gradient if canvas is unavailable.

### Polish features

- **Reading progress bar** at the top of the page (gradient: primary → accent)
- **Sticky scroll-spy TOC** — highlights the section currently in view
- **Keyboard shortcuts**: `/` focuses search · `g` then `h` goes home · `t` cycles theme
- **Copy code button** on every code block
- **Reading time estimate** on every page (auto-computed from content length)
- **Tier badges** with consistent color coding across themes
- **Last-updated metadata** support (optional per page)

### Accessibility

- WCAG 2.1 AA contrast across all 3 themes (Editorial theme is high-contrast by design)
- Semantic HTML throughout (`<article>`, `<section>`, `<nav>`, `<header>`, `<footer>`)
- Keyboard-navigable: Tab through cards, Enter to open, `t` cycles theme, `/` focuses search
- Visible focus rings on all interactive elements
- `prefers-reduced-motion` respected by particle hero and all transitions
- RTL support for Arabic
- Code blocks use `<pre><code>` semantics with proper `aria-label` on copy buttons

---

## Repository structure

```
cheat_sheet/
  src/
    app/
      layout.tsx           Root layout, fonts, theme + language bootstrap
      page.tsx             Hash router entry — wraps in LanguageProvider
      globals.css          Design tokens for all 3 themes
    components/
      cheat/
        Navbar.tsx           Sticky nav: theme + language switchers, progress bar
        HubView.tsx          Index: search + filter + category groups + footer
        SheetView.tsx        Shared 20-section renderer with scroll-spy TOC
        CodeBlock.tsx        Code block with copy button
        ThemeSwitcher.tsx    Theme dropdown with palette swatches + kbd hint
        LanguageSwitcher.tsx UI language dropdown (8 languages)
        LanguageProvider.tsx Shared i18n context
        ParticleHero.tsx     Canvas particle field (lazy, reduced-motion aware)
    content/
      languages/*.ts       29 language cheat sheets (v2 — all 20 sections)
      ml-ai/*.ts           4 framework cheat sheets (v2)
      systems/*.ts         1 systems cheat sheet (v2)
      topics/*.ts          5 topic cheat sheets (v2)
    hooks/
      use-hash-route.ts    Hash-based router
      use-theme.ts         Theme provider with localStorage persistence
    lib/
      types.ts             CheatSheet v2 schema + section registry + category metadata
      registry.ts          Auto-aggregates all content files
      highlight.tsx        Multi-language syntax highlighter (25+ slugs)
      i18n.ts              8-language UI translation dictionaries
      utils.ts             shadcn/ui utilities
    components/ui/         shadcn/ui component library
  public/                  Static assets
  README.md                This file
  LICENSE                  MIT
  .gitignore
  package.json
```

---

## How to add a new page

This is the whole point of the templating strategy (§9). It takes 3 steps:

### 1. Create the content file

Pick the right folder under `src/content/`. For a new language: `src/content/languages/<slug>.ts`.

```typescript
import type { CheatSheet } from "@/lib/types";

const sheet: CheatSheet = {
  slug: "zig",
  name: "Zig",
  category: "languages",
  tier: 3,
  tags: ["systems", "compiled", "no-hidden-control-flow", "c-replacement"],
  tagline: "A general-purpose systems language and C replacement...",
  year: 2016,
  author: "Andrew Kelley",

  // §1-7 required
  tldr: [/* 3-5 sentences */],
  mentalModel: { title: "...", body: "..." },
  constructs: [/* 8-12 rows */],
  patterns: [/* 3-5 code blocks */],
  pitfalls: [/* 5-7 entries */],
  quickReference: [/* 10-15 facts */],
  goDeeper: [/* 3-5 links */],

  // §8-20 optional — fill what's relevant
  dataTypes: { primitives: [...], collections: [...], custom: [...] },
  operators: [...],
  inputOutput: [...],
  loops: [...],
  functions: [...],
  errorHandling: [...],
  concurrency: [...],
  testing: [...],
  performance: [...],
  ecosystem: [...],
  versionHistory: [...],
  interview: [...],
  comparisons: [...],
};

export default sheet;
```

### 2. Register the file

Open `src/lib/registry.ts` and add two lines:

```typescript
import zig from "@/content/languages/zig";

export const ALL_SHEETS: CheatSheet[] = [
  // ...
  zig,
];
```

### 3. (Optional) Extend the syntax highlighter

If your language isn't already a key in `LANG_RULES` inside `src/lib/highlight.tsx`, add an entry following the existing pattern. If you skip this step, code blocks render as plain text — still readable, just not colored.

That's it. The hub index, search filter, and page renderer pick up the new entry automatically.

### Critical authoring rules

1. **Backtick escape**: All `code:` fields use template literals (backticks). If your code contains a backtick character (common in bash command substitution, Lisp comments, Perl `q{}`), you MUST either escape it (`\\\``), replace with single quote (`'`), or use `$(...)` syntax in bash. Unescaped backticks break TypeScript compilation.
2. **Lang slugs**: Must match a key in `src/lib/highlight.tsx`. Verify first.
3. **Real content only**: Code blocks must be production-shape code a senior engineer would actually write. No toy examples.

---

## Deployment

### Vercel (recommended)

```bash
vercel
```

### Netlify

Build command: `bun run build`
Publish directory: `.next/`

### GitHub Pages

Static export requires `output: 'export'` in `next.config.ts`. The hash-based router is already GitHub-Pages-friendly.

---

## Performance budget

Target: Lighthouse ≥ 95 across Performance / Accessibility / Best Practices / SEO; LCP < 2.0s on a throttled connection.

Notable optimizations:
- No external syntax-highlighting library (~3KB custom tokenizer vs ~30KB for Prism)
- Particle hero lazy-mounted via IntersectionObserver, disabled under `prefers-reduced-motion`
- Theme + language applied via inline `<head>` script — no FOUC, no extra round-trip
- Code-split per route (only the active sheet's content renders)
- All fonts loaded via `next/font` with `subsets: ['latin']`

---

## Developer

Built by **Adil Shamim** — engineer, developer, and author.

- Website: [adilshamim.me](https://www.adilshamim.me/)
- LinkedIn: [in/adilshamim8](https://www.linkedin.com/in/adilshamim8)
- GitHub: [AdilShamim8/cheat_sheet](https://github.com/AdilShamim8/cheat_sheet)
- Kaggle: [adilshamim8](https://www.kaggle.com/adilshamim8)
- Twitter / X: [@adil_shamim8](https://x.com/adil_shamim8)
- Medium: [adilshamim8.medium.com](https://adilshamim8.medium.com/)

---

## License
MIT
