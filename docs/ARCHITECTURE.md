# Architecture

- **One page app**: `src/app/page.tsx` + hash router (`use-hash-route.ts`) — `#/languages/python`.
- **Content registry**: `src/lib/registry.ts` aggregates `src/content/*/*.ts`, each exporting a `CheatSheet` (`src/lib/types.ts`).
- **Renderer**: `SheetView.tsx` walks `SECTION_DEFS` (20 sections, §8-20 optional).
- **Theming**: CSS custom properties per `data-theme` (black-hole / blueprint / editorial), persisted pre-hydration via inline script (no FOUC).
- **i18n**: `LanguageProvider` + `src/lib/i18n.ts` (9 UI languages, content stays English).
- **Highlighting**: dependency-free tokenizer `src/lib/highlight.tsx` (30+ slugs).

## Adding content
See CONTRIBUTING.md. Validation: `node scripts/validate-content.mjs`.
