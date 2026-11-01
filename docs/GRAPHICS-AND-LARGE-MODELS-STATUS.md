# Graphics settings and larger models — development status

## UI appearance preserved

The attempted CSS changes were completely reverted at the user's correction. `style.css` and `ui.css` are unchanged from published 0.6.2. The existing Editor Settings dialog now contains desktop graphics controls; there is no UI redesign.

### Working desktop controls

- **Browser / UI compositing:** Chromium default or request software compositing while leaving WebGL available.
- **3D renderer:** automatic Three.js/WebGL, legacy OpenGL through ANGLE, or explicit CPU 3D through SwiftShader/WebGL.
- Save settings, save your project, close and reopen the app. No automatic restart discards work.
- Active Chromium feature status is separate from saved preferences. Adapter information still appears in the viewport diagnostics. A requested GPU mode is not proof of hardware acceleration.
- CPU mode requests software UI compositing too. This is actual software 3D, not a replacement 2D canvas. SwiftShader's explicit software-WebGL opt-in is used; the product does not disable Electron/GPU sandboxing.
- Browser-hosted builds cannot override browser hardware acceleration, so these desktop controls are disabled there.
- Recovery launch flags: `--graphics-defaults`, `--software-rendering`, and the existing `--legacy-gl`.

**Not implemented:** an arbitrary-engine-scene adapter for Vercel vgpu. Its option is disabled and labeled accordingly. The original game's bespoke vgpu world is not compatible with arbitrary engine models/materials/animation. R3F is a React wrapper around Three.js, not a separate acceleration backend; the engine continues using Three.js directly. No fake backend switch was added.

Chromium and the OS still control final presentation; software compositing is not a claim that the whole desktop/window system performs zero GPU work. Physical hardware/driver acceptance remains unverified.

## Larger model capacity

Central admission limits now permit **200,000,000 bytes of source + companion files**, a **200 MB cooked GLB**, and a **480 MB combined project model/source budget**. The decoded-model limit is separate: 256 MiB, up to five million vertices, with 2048px texture limits and bounded collection counts retained. Reimport batches retain at most 200 MB total inputs. Audio limits are unchanged.

The source/worker/metadata/checkpoint/PIF/recent/native-save/player boundaries were updated together. Large IndexedDB payloads use Blob records: Chromium rejects very large inline structured-clone Uint8Arrays. Old records are still readable. Pending repair payloads also use Blob records and a combined 200 MB recovery-store bound. Import inputs are admitted/serialized before loading into RAM. Unchanged GLB normalization does not duplicate the source; identical source/artifact persistence is reused.

PIF still stores separate resources in XZ, with a 512 MiB compressed/expanded ceiling. Decoder output grows within its cap rather than allocating 512 MiB for every tiny project. Callers can request a stricter `maxExpandedBytes`. PIF pack/unpack avoids project-wide base64 materialization for disk-backed models. Plain embedded JSON/prefab UI limits have not been raised; use PIF for larger projects. The default accounted asset-work allowance is now 1.5 GiB, but this is **not an OS memory cap**.

### Measured validation

- TypeScript/Oxlint clean; 134 unit tests / 704 assertions.
- Native Electron settings saved, applied after closing/relaunching, software compositing reported, and the actual WebGL adapter identified as SwiftShader while the 3D editor rendered.
- **200 MB encoded GLB** with 900,000 actual vertices: import, disk checkpoint and verified recovery passed; retained source-byte cache remained zero. The fixture includes unused buffer capacity to test the encoded-file boundary. This is not a 200 MB fully populated mesh or maximum-size render/export benchmark.
- **24 MB populated GLB / 1,999,827 vertices:** worker import, checkpoint, PIF pack/unpack, decoded model lease and release passed. Compressed PIF was approximately 43.4 MB, with two separate model/source resources. This exercises the previous 2/4/8/16/40 MB ceilings.
- Existing disk corruption/quota/reclamation tests, pending textured FBX recovery, lazy library, Home, shortcuts and authored Player handoff regressions pass.

**Remaining validation:** 200 MB full export/render peak-memory profiling, large real-world FBX fixtures, packaged Windows execution and physical low-end GPU/CPU acceptance. Large sources can need several times their size in temporary RAM; monolithic XZ packaging is not streaming. A constrained machine can still run out of memory. Small models are recommended on old hardware even when a larger file is admitted. Private/incognito browser storage may impose a much smaller quota; errors are surfaced rather than silently using RAM.

These changes are included in published development pre-release v0.6.3-dev.2. The older stable 0.6.2 release does not contain them.

## Current graphics checkpoint

[Current status](CURRENT-STATUS.md) supersedes older milestone descriptions: v0.6.3-dev.2 is published; native folder backups use PIF8. Procedural PMREM, independent shadow update modes/fitted bounds and depth-aware height scattering are implemented and software-tested. Texture/UV/packing/per-slot authoring, external HDR input and broader graphics gates remain open.
