# Texture, UV, material-slot and HDR authoring

Implemented in 0.7.0. Publication status is tracked separately in [current status](CURRENT-STATUS.md).

## Authoring workflow

Select a mesh → **Edit material surface…**. Choose all slots or an individual structural slot. **Manage graphics images…** imports PNG/JPEG maps and Radiance `.hdr` environments; the same catalog is available from Rendering. Files become project resources, not external absolute paths. In an attached native folder their bytes are written to `images/` and remain externally editable. The watcher validates changes automatically; applying the changed folder is explicit. Failed decoding, UV validation or material staging leaves the working scene intact.

**Inspect UV triangle layout** previews UV0 or UV1, including a marked 0–1 tile and sampled coordinate bounds. Inspection is bounded to the first 4,096 triangles of the selected slot; truncation is labeled. It does not unwrap, generate or repair UVs. **Texture maps and UV transforms** controls channel, offset, repeat, rotation and clamp/repeat wrapping for each binding. Missing UV sets reject Apply.

PBR supports color, emissive, normal, roughness, metalness, AO, alpha and displacement maps. Unlit supports color and alpha only. Color/emissive are sRGB; data maps are linear. Canonical channels are **AO R, roughness G, metalness B, alpha G, displacement R**. Color-map alpha also participates in the selected alpha mode. Normal scale supports sign reversal (including DirectX/OpenGL Y conversion); this does not infer a source convention. Displacement moves existing vertices, including native depth-shadow variants; it does not tessellate or alter collision geometry. Subdivide in a DCC tool. Thin shadow casters may require double-sided materials. Blending remains subject to ordinary transparent sorting limits.

An explicit surface replaces the targeted imported material, rather than implicitly inheriting its maps. Unaffected imported slots remain intact. Prefab import remaps image/material/shader IDs and slot bindings, reusing identical image content without mutating the source prefab. Slot keys are structural mesh paths plus material indices, guarded by the model source SHA-256 (or primitive kind). Reimporting a changed source requires explicitly clearing/remapping overrides; names are not silently matched. Maximum 64 slot overrides per entity.

## Channel packing

The catalog's packing tool assigns each output RGBA channel from a source channel or constant, with optional inversion. Select exact dimensions (mismatches reject) or explicit nearest-neighbor resizing. Original source resources remain in the catalog. Packing runs in a cancellable worker with a 30-second deadline. RGB/RGBA8 noninterlaced PNG input is decoded without browser premultiplication, preserving hidden RGB and alpha exactly. Unsupported PNG layouts, tRNS and APNG are rejected for packing; runtime browser PNG decoding supports a broader set. JPEG packing uses browser decoding. This is offline canonical packing, not arbitrary shader-channel routing.

## Bounds and ownership

32 catalog images, 16 MiB per encoded source, 128 MiB encoded catalog, 2048-pixel maximum edge, and a separate 128 MiB decoded-image admission cap. Decoding is worker-isolated, cancellable and has a 20-second deadline. Dimensions are checked before upload. These accounting limits are not an OS-enforced process/VRAM cap. An unused image may pass header admission but still fail decoding when referenced. Source resources and independent role/UV texture views belong to a staged world; upload failures and cancellation release that world's reservations. Context loss drops obsolete GPU disposal listeners while retaining CPU source data for restoration.

## HDR environments

Enable **PMREM environment**, then choose an imported 2:1 Radiance RGBE `.hdr` source (not EXR). Resolution 128/256 is a filtering ceiling, not invented source detail. Worker box filtering bounds output; tiny input is upsampled to a minimum 64×32 so Three's PMREM minimum cube size is valid. Renderer-local source-aware leases avoid duplicate filtered environments. Intensity-only changes reuse the filter; source/context changes invalidate it. Unsupported float targets retain authored intent and report a fallback. Procedural sky/ground environments remain available.

## SDK and formats

`@pinefall/sdk` exports `GraphicsImage`, `TextureBinding`, `MapRole`, `MaterialSlotBinding`, `MaterialSlotInfo`, `UVInspection`, `MAP_ROLES` and `textureBinding(imageId)`, alongside the existing graphics types. `ctx.graphics.setMaterial` changes runtime scalar values without mutating authored data. Texture bindings are immutable through that synchronous API: stage authored changes using the engine load/Apply path instead. Headless mode validates the same restriction and reports no rendered pixels.

Portable maps, image resources, slot overrides, extended material parameters and advanced scattering settings require **PIF9**. Older portable formats remain readable, and scalar-only compatible graphics can still write PIF7. Native raw-folder transport remains **PIF8**, preserving invalid/unapplied/unregistered files. PIF9 is not a new raw-folder transport. See [PIF compatibility](PIF.md).

## Scattering contract

The ordered post stack supports half/full-resolution Beer–Lambert integration (8/16/32 steps), bilateral upsampling and a full-resolution integration fallback at unmatched depth edges. Optional `transparentDepth: "nearest"` terminates at the nearest nonzero-alpha interface; it is **not multilayer transparent light transport**. `lighting: "directional-shadow"` uses the brightest visible directional light and native Basic/PCF shadow depth. Unsupported VSM, absent shadows/lights and artistic mode have explicit fallback reasons. Point/spot volumetric shadow integration is not provided.

Optional temporal reprojection uses depth rejection, neighborhood clamping and history invalidation for camera cuts, projection/settings/light/size changes and context loss. `historyWeight` is bounded to 0–0.95. This reduces noise but is not a guarantee of ghost-free arbitrary motion. All extra volume/history/transparent-depth targets count toward the shared 96 MiB post ceiling. Defaults preserve the inexpensive half-resolution, artistic, opaque-depth, no-history mode. Fake cone beams remain separate.

## Reproduce verification

Run `bun run check`, `bun test tests`, and, with `bun run dev` running, `bun run test:graphics-completion`. Build desktop, then run `bun run test:graphics-authoring-native` under Linux/Xvfb (or directly run the test on Windows). `TEST_DESKTOP_EXECUTABLE` can select a packaged binary. Generate the original reference using `bun run generate:materials-reference`; export it with `bun scripts/game.ts export-web examples/projects/materials-post-reference.pif build/graphics-export`, then run `bun tests/graphics-export.ts`.

Evidence covers real GPU pixels, canonical channels, normal handedness, alpha/displacement shadows, UV/slot isolation, HDR generation, allocation failure/cancellation, repeated context loss, temporal motion/cuts, thin geometry, repeated replacement and cleanup. Software-submit/readback timings are explicitly **SwiftShader measurements**, not physical GPU timings. Physical CEDAR/Windows, listening and independent acceptance remain owner-deferred, unverified and not publication blockers.
