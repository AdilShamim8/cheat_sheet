# Performance notes

- No syntax-highlighting library: ~3KB custom tokenizer.
- Content is static-imported and tree-shaken per route.
- Fonts via next/font, `subsets: ['latin']`.
- Particle hero lazy-mounted (IntersectionObserver) + `prefers-reduced-motion` aware.
- Target: Lighthouse ≥95, LCP < 2.0s throttled.
- Verify locally: `bun run build && bun run start`, then Lighthouse against :3000.
