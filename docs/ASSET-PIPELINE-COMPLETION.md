# Plan 01 continuation — execution contract

Baseline: v0.5.3 / 1d155ea. Owner selected **finish Plan 01**, not Plan 02. Standing release-after-major-update rule applies.

## Work sequence (before source changes)

1. Add verified content-addressed binary storage and reference-only scene v2 working documents. Keep scene v1 JSON interchange and existing PIF v1/v2/v3 compatibility; export must never depend on an editor's local database.
2. Add IndexedDB transactions for blob storage, bounded regenerable conversion artifacts and coherent recovery checkpoints. Hash/serialize outside transactions; acknowledge only transaction completion. Preserve the previous checkpoint on failures. Handle unavailable storage/quota explicitly.
3. Key conversions by pinned importer, normalized recipe, selected source/companion hashes and target profile. Distinguish source versus artifact dependency digests, reject cycles/missing inputs, and exercise invalidation with real cache hits/misses.
4. Make editor import, history, runtime model loading, worker PIF boundaries and standalone export work with references. Keep legacy synchronous APIs as explicit compatibility adapters, not the main editor hot path.
5. Replace blind reimport confirmation with a structured diff and explicit identity-remap choices. Do not manufacture matches for renamed/ambiguous subassets. Extend bounded allocation admission and transactional staging where practical.
6. Validate corruption/missing-blob/quota/abort/reload races; run full unit, browser, export and packaged desktop suites. Publish the validated checkpoint and pause for owner testing.

## Research affecting implementation

- IndexedDB transactions auto-commit across event-loop boundaries; request success is not commit success. Perform hashing before opening a short transaction and resolve only on `complete`. https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction
- Source dependencies must invalidate when original bytes change; artifact-only dependencies need not invalidate if cooked output is unchanged. https://docs.unity3d.com/6000.4/Documentation/Manual/UpgradeGuideUnity64.html
- Persistent browser data is best effort and may be cleared; the portable PIF remains the explicit project backup. A reference without its verified blob must fail visibly, never become an empty mesh.

## Evidence policy

Physical CEDAR/Windows runs and independent DCC/exporter fidelity cannot be claimed from this sandbox. The final report must distinguish implemented code from outstanding acceptance evidence; do not label every gate complete merely because this continuation is requested.

## Executed checkpoint: 0.5.4

Reference working documents, persistent cache/recovery and structured material/clip remapping are implemented. The real IndexedDB test and native/browser evidence are recorded in `RELEASE-0.5.4.md`. This is not all Plan 01 gates: final world transactionality, strict aggregate admission, normalized recipes and broad exporter/hardware acceptance remain open. GitHub authentication was absent during candidate preparation; no public 0.5.4 publication is claimed.
