# Plan 01 finalization contract

Requested after local 0.5.4 candidate; do not start Plan 02. Write this contract before implementation.

## Sequence

1. Close final-world construction failure gap: build entities, physics, hierarchies and instance leases in a separate staging world; yield while staging; preserve the active world on exceptions/cancellation. Inject failures after model preparation and verify cleanup/retry.
2. Audit admission and ownership across decoding, cache, old/new worlds and source transport. Add conservative reservation accounting where enforceable, tests for exhaustion and release. Do not describe estimates as OS-enforced heap limits.
3. Reconcile remaining A0–A6 gates against the actual repository, including normalized recipes, stable subassets, CLI equivalence, independent exporter fixtures, and resource/latency evidence. Do not silently redefine full completion as current supported features.
4. Run unit/type/lint, worker/browser/standalone and packaged Linux regressions; build Windows. Update the gate matrix with exact implemented/pending/externally blocked evidence.
5. Version and publish the tested checkpoint with source, Linux/Windows binaries, PIF sample and checksums. Credentials may be used transiently for this authorized publication, never written to repository/config or retained. Pause for testing under the standing release rule.

## Non-negotiable acceptance boundary

Full Plan 01 acceptance includes a second developer's edited textured-character reimport and physical Windows/CEDAR latency/memory/renderer checks. These cannot be honestly completed by sandbox/software rendering. If those remain, report the plan as awaiting acceptance; if implementation gates remain, name them separately. Exposed authentication must be rotated; no promise of permanent credential reuse.

## Result recorded for 0.5.5

Steps 1 and the enforceable accounting portion of step 2 are implemented and regression-tested. The audit in `RELEASE-0.5.5.md` still identifies implementation gaps as well as external acceptance gates. This contract is not a completion certificate. 66 tests / 259 assertions, browser fault injection, 100-cycle reservation plateau, real IndexedDB tests, native packaged Linux tests and fresh standalone export pass. Windows builds but has not been executed. Publication uses transient authorized credentials, never repository storage.

## Revised execution order after owner override

Do not pause after a partial feature release. Implement normalized recipes and strict version migration first, then expanded stable identities, shared editor/CLI FBX conversion, dependency scheduling, independent fixture harness and physical acceptance tooling. Every change must have behavior tests. Use a versioned provenance/PIF schema rather than silently placing new semantics in v3. Axis settings must distinguish the already-corrected FBX loader output from raw source coordinates, to prevent double correction. Original bytes always remain unchanged.

## Dependency orchestration audit work order

Connect the tested transactional DAG to actual model reimport rather than leaving it only as an SDK primitive. Add a bounded batch preparation service with explicit asset-scoped source replacements, retained companions, recipe dependency nodes, sequential shared-worker cooking, and no scene mutation until existing review/adoption succeeds. New/renamed sources must invalidate the model; unchanged inputs should avoid conversion. Failed/cancelled batches may populate immutable content caches but must not expose a partially changed authored document. Wire ordinary editor reimport through the same service. Test real conversions, batch failure/rollback, retry and recipe-only changes. This does not implement the material/prefab importers assigned to other plans or certify physical acceptance.

## Persistent missing-source repair work order

Persist bounded failed import attempts separately from accepted assets: original selected files, SHA-256 digests, normalized recipe, missing companion name, project ID and optional original reimport revision. Upgrade IndexedDB without deleting existing stores. Make pending attempts visible after reload; choosing a missing companion merges it with retained sources and retries the normal conversion/review path. Never automatically adopt into a different project or changed asset revision. Delete an attempt only after successful adoption or explicit discard. Test cold recovery, hash corruption, failed retry, cancellation, limits and unchanged last-good assets. Browser storage remains evictable and is not a PIF backup.
