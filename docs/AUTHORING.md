# Authoring a cheat sheet

1. Copy `src/content/topics/react.ts` as a template (fullest 20-section example).
2. Fill §1-7 (required). Add §8-20 where relevant — omit what isn't.
3. Facts must be verified against primary sources **today**; set `lastUpdated: "YYYY-MM"`.
4. Code samples: production-shape, 5-25 lines, template literals with escaped backticks.
5. Register in `src/lib/registry.ts`; run `npx tsc --noEmit && bun run lint`.
6. Version history must end at the CURRENT stable release — no future speculation.
