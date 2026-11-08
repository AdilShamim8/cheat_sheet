# Release process

1. Content refreshes: edit sheets, set lastUpdated, update CHANGELOG.
2. Verify: npx tsc --noEmit && bun run lint && bun run build.
3. Commit per change, push one by one.
4. Vercel deploys main automatically (vercel.json present).
