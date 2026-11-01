# Disk-backed assets — 0.6.2

## What changed

Browser and Electron use `DiskBlobStore`, backed by IndexedDB database `pinefall-asset-bytes-v1`. Encoded source files and cooked artifacts are addressed by SHA-256. JavaScript retains a small reference/size index, **not a permanent Map of source byte arrays**. A successful write means transaction completion. Quota, blocked and unavailable-storage errors are surfaced; there is no silent RAM-only browser fallback.

- Import workers persist verified sources/artifacts before returning references. Input buffers are transferred rather than copied to parsing workers.
- PIF workers read shared disk references rather than receiving a copied full inventory from the renderer. Export/compression still requires temporary bounded buffers.
- Default checkpoint and conversion-cache records store references. Legacy checkpoint bytes are verified and migrated lazily; custom independent `AssetDatabase` instances keep their portable byte-copy behavior.
- Library-only imports do not prepare renderer models. Opening a project with unplaced library models also avoids model decoding. Placement or reimport of a live instance loads the required model.
- Encoded audio no longer has a second resident `AudioCatalog.waves` inventory in disk mode. Validation reads sources sequentially, and decoding reads them when the audio backend prepares playback. Decoded audio/stream playback resources remain bounded runtime resources; this is not a claim that all PCM decoding is per-cue lazy.
- Unleased decoded model prototypes have a small working cache: at most four, within an 8 MiB accounted idle allowance. Active leases remain protected. Returning Home/disposal releases renderer resources. This avoids constantly reparsing tiny models without retaining the full library.

## Integrity, lifetime and bounds

Reads verify bytes against the requested hash. Default disk limits are **512 MiB / 8,192 content records**. Source/artifact per-file and decoder limits remain enforced. Reclamation preserves current/previous checkpoints, retained conversion entries and live session references; newly staged data has a ten-minute grace period. Shared Web Locks protect other live windows/workers, including suspended tabs. Collection runs only with exclusive access and a separate collector lock. Without Web Locks, collection is skipped rather than risking deletion of another window's source bytes.

IndexedDB is actual browser/Electron-managed persistent storage, **not a user-selected project folder**, and may be cleared or evicted. Save portable `.pif` backups. Hashes detect corruption, not publisher authenticity. The fallback in Node/CLI is an explicit bounded in-memory store; it does not masquerade as persistent storage.

The footer distinguishes source-cache residency from accounted runtime working allocations. Neither figure is total process RAM or measured VRAM. Active geometry, textures, physics, decoded audio and parser/compressor buffers still require memory.

## API changes

Use asynchronous APIs for disk references:

- `blobs.readAsync(ref)`, `blobs.sizeOf(ref)`, `blobs.entriesAsync(refs)`
- `readAssetBytes(data)`
- `materializeSceneAsync(scene)` and `serializeSceneAsync(scene)`
- `await reimportInputs(asset, files)`

Synchronous materialization remains useful for inline documents and Node memory mode, but deliberately refuses cold disk references. Do not introduce hidden synchronous hydration or refill an all-project byte cache to preserve old call sites.

## Evidence and remaining limits

`tests/disk-assets-browser.ts` persists **48,000,000 bytes** across reload, verifies cold reads, injects corruption/quota failure, checks concurrent admission and tests cross-window reclamation. One measured Chromium run retained approximately **94 KiB additional JavaScript heap after GC**; the source byte cache stayed zero. This is a JS-heap measurement, not an OS-wide RAM or performance guarantee.

`tests/lazy-library-browser.ts` verifies zero model preparation for library-only import and cold reopening, on-demand preparation when placed, and a canceled reimport not contaminating a subsequent new import.

This changes residency, not every capacity constraint: the existing 4 MB combined import input, 2 MB cooked model, 2048px texture, 8 MB model/source project budget, separate 8 MB audio-source budget and 16 MiB compressed PIF bounds remain. Large-project streaming, larger validated importer profiles and user-managed native project folders are future work—not completed features of this release.
