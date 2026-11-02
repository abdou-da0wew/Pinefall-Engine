# Export update foundation

Implemented after the immutable Nightfall Keep 0.1.0 game release: strict generic export profiles and non-executing preflight, exposed through the project package and `game export-plan`. Whole-repository formatting, TypeScript, Biome and Oxlint pass. Unit suite: 180 passed / 1,112 assertions. The actual Nightfall PIF also passes CLI preflight with explicit `preflight-only` status and no artifact.

This is **not a completed generic exporter or engine release**. Transactional output assembly, generalized executable packaging and editor export UI remain pending under the dedicated plan. The separate Nightfall game release remains downloadable and unchanged.
