# Changelog

## v0.1.0 — 2026-08-20 — Demo

### Features
- **100 procedural images** with strong/mid/weak orientation tiers
- **50 campaign levels** with square/hex/tri/voronoi grids, multi-target & manual rotation from level 32, micro angles from level 45
- **Arcade mode** with combo-driven difficulty, breathing levels, preloading, and continuous flow
- **Daily challenge** with date-seeded puzzles, global same-set, timed leaderboard, and share card
- **Core engine** with seeded RNG, grid generation, salience computation, and difficulty model
- **Canvas-based renderer** with offscreen caching for performance
- **Web Audio** synthesized sound effects with combo pitch rising
- **localStorage** persistence for campaign progress, arcade records, and daily results

### Technical
- TypeScript + Vite, pure Canvas 2D, no external runtime deps except d3-delaunay (Voronoi)
- All images generated deterministically with seeded RNG
- Level data generated via salience-based target selection with S > S_min gate
- First-screen bundle < 500KB (23KB gzipped)
- 35 unit tests across core modules