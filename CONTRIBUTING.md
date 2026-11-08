# Contributing to cheat_sheet

Thank you for improving the references!

## The 5-minute version

1. Fork & branch: `content/<slug>-update`.
2. Pick the file you want to change under `src/content/`.
3. Follow the **20-section template** in `src/lib/types.ts` — all sections §8-20 are optional.
4. Verify every fact against a **primary source** (official docs, release notes) opened **today**. Add the source URL in a `goDeeper` entry if it is not there yet.
5. Run `npx tsc --noEmit` and `bun run lint`.
6. One logical change per PR. Conventional commits (`content(python): ...`).

## Authoring rules that bite

- All code samples use template literals: escape backticks (\\`) or avoid them.
- `lang` slugs must exist in `src/lib/highlight.tsx` (LANG_RULES).
- Real-world shape code only — production-shaped, not toy examples.
- Version histories must end at the current stable release, not "expected" future ones.

## Adding a new page

1. Create `src/content/<category>/<slug>.ts` exporting a `CheatSheet`.
2. Register it in `src/lib/registry.ts` (import + array entry).
3. If the language is new to the highlighter, add a rule in `src/lib/highlight.tsx`.
