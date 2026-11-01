# Materials, textures, lighting, shaders and post-processing

> Historical release, design or acceptance record: retain the results and limits of its stated checkpoint. For current implementation and downloads, see [current status](../CURRENT-STATUS.md).

**Pinefall implementation plan • research date: 2026-10-31 • baseline: 0.5.2 / b8b38af**

> Planning only. This document does not claim these features are implemented. Budgets and API sketches are proposed acceptance criteria, not measured performance or final public contracts.

## Revision record

- **R0 — code audit and initial engine survey:** identified the current baseline and questions below.
- **R1 — detailed design pass:** added researched architecture, proposed contracts, workflows, work packages and acceptance tests.
- **R2 — failure-mode and source-verification pass:** Verified packed-map channel semantics; added conversion policy, render-target accounting, transparent/displacement cases and context-loss recovery.
- **R3 — cross-plan consistency review:** reconciled subsystem ownership, shared identifiers, lifecycle boundaries and the first implementable vertical slice.

Read R1 as the main design, R2 as its research-driven refinements, and R3 as the final integration check. All revisions are planning work performed on 2026-10-31; no engine feature implementation is implied.

## Existing implementation and constraints

Primitive material authoring is minimal. Imported GLB materials can render, but there is no comprehensive material asset editor. Existing glow and mesh cone beams are approximations, not HDR bloom or volumetric scattering.

Inspected integration points: `packages/runtime/src/schema.ts; packages/runtime/src/engine.ts; packages/runtime/src/effects.ts`. Preserve TypeScript, Bun, Oxlint, Linux/Windows Electron, the WebGL 2 runtime, DOM-free headless simulation and optional UI. Do not disable Electron sandboxing to obtain graphics compatibility. Physical CEDAR and Windows execution require dedicated validation; Xvfb/SwiftShader are not substitutes.

## Scope to design

PBR/unlit materials, maps, UV transforms, tangent normals, reflections, direct/fake lighting, independent shadows, custom shader safety, tone mapping, bloom and staged depth-aware volumetrics.

## How to use this plan

R1 explains the concepts and selected architecture; R2 records substantive follow-up research, corrections and additional failure cases. Proposed interfaces are design sketches, not existing APIs. Source links support the adjacent technical claims; numerical budgets are Pinefall hypotheses to validate, not upstream engine benchmarks. Resolve the remaining implementation questions through the listed spikes and fixtures before freezing public contracts.

## Shared release rule

No feature is complete because its checkbox exists. Require real behavior, project round trips, script/headless compatibility where applicable, a standalone export check, resource cleanup tests, documentation and an explicit unsupported-feature report. Release numbers are provisional; ship by acceptance gates, not dates.

## R1 — Research-led implementation design

### 1. Target and terminology

Deliver a predictable art pipeline with a conservative WebGL 2 baseline. A coherent material viewed in the editor should look equivalent in the exported player under the same lighting/settings. Do not promise Unity HDRP/Unreal feature parity or require WebGPU on the user's older Radeon hardware.

**PBR** means a physically motivated surface response; it does not automatically provide indirect lighting or global illumination. **Unlit** ignores scene lighting. **Emissive** contributes visible surface radiance, but does not automatically cast light on nearby objects. **Bloom** spreads bright image values; it is not light transport. **Environment reflections** sample an environment approximation; they cannot see every local moving object. These distinctions must appear in tooltips and documentation, not only in this plan.

Three documents normal maps as lighting-normal perturbations rather than geometric deformation, and bump mapping as another lighting-only approximation. Its standard material uses PMREM-processed environment lighting. These are suitable building blocks, not a reason to claim ray tracing. [2](https://threejs.org/docs/pages/MeshStandardMaterial.html)

### 2. Separate authored settings, device settings and runtime state

- **Authored:** material assets, texture roles, light definitions, environment, desired artistic post settings.
- **Device profile:** resolution cap, shadow allocation limits, antialiasing method, volumetric quality ceiling, supported formats and fallback preferences.
- **Runtime:** GPU objects, program variants, current uniforms, transient render targets and history buffers.

An authored scene may request a feature that a low profile declines. The settings panel must show requested, effective and unsupported values with reasons. It must not silently rewrite the artist's scene because a weaker machine opened it.

Proposed `MaterialAsset` includes version, stable ID, shader family, scalar parameters, texture bindings, sidedness and alpha mode. A texture binding stores asset ID, colour/data role, UV channel, scale, offset, rotation, wrap and sampler settings. Runtime-only handles never enter JSON. Use copy-on-write material overrides so changing one instance does not unexpectedly recolour all objects sharing a material.

### 3. Texture meaning and colour management

Lighting calculations use linear colour. Albedo and emissive PNG/JPEG colour maps require sRGB interpretation; normal/roughness/metalness/AO/height data must not be passed through an sRGB transfer function. HDR environments/light data need an explicit linear interpretation appropriate to their file encoding. Three warns that missing or duplicate output conversion changes the whole scene; increasing a light intensity is not a correct repair. [1](https://threejs.org/manual/en/color-management.html)

| Slot | Meaning | Controls and validation |
|---|---|---|
| Base colour | Surface reflectance/tint | sRGB input for ordinary colour images; alpha mode explicit |
| Normal | Tangent/object-space direction | Strength, green-channel convention, declared coordinate basis |
| Roughness/metalness/AO | Scalar data | Channel selection, linear sampling, finite multiplier |
| Emissive | Visible emitted colour | Colour-space tag and HDR intensity, no automatic light creation |
| Height/displacement | Scalar displacement field | Units, zero point, amplitude, sufficient tessellation |
| Depth | Distance from a camera/projection | Encoding/near/far/convention metadata; never guessed as height |
| Lightmap | Authored lighting data | UV channel and encoding; no assertion that Pinefall baked it |

Expose packed-map channels explicitly; do not assume every image named ORM follows the same packing. A preview must let users inspect R/G/B/A separately and compare imported material interpretation against the raw texture.

### 4. Normals, tangents and UV authoring

Preserve vertex normals/tangents during import when valid. If missing, generate according to an explicit import recipe and report the resulting smoothing/tangent policy. Compute tangent basis consistently with UV seams and mirrored islands. Normal-map Y inversion is a per-binding convention setting; Three documents negating normalScale.y for the opposite handedness convention. [2](https://threejs.org/docs/pages/MeshStandardMaterial.html)

UV tools in the initial release are **inspection and transforms**, not mesh unwrapping: choose a channel, show checker density/stretch, rotate/offset/tile, display seams, and warn when a selected channel is absent. Do not manufacture meaningful lightmap UVs by copying overlapping UV0 and calling it an unwrap. An advanced unwrap/bake pipeline requires a later dependency and quality review.

Vertex displacement changes rendered vertices but not the Rapier collider automatically. Warn about visible/physical mismatch and offer an explicit offline collider-rebuild recipe for suitable static geometry. Parallax/relief mapping, if later added, also does not change true silhouette or collision. Keep those modes distinct in the inspector.

### 5. Lighting and shadow system

Support directional, point and spot definitions independently from graphics presets. Author world-space orientation through entity transforms; keep the current physics-root restriction unrelated to light hierarchy. Define intensity units consistently with the selected Three version and label them, rather than copying numeric values from another engine without conversion. Scene units are metres after import normalization.

Spot controls: outer cone, inner/penumbra behavior, range, decay, colour and shadow enablement. Convert degree UI values to radians once. A cone helper visualizes light influence; an optional translucent beam is an explicitly fake visual effect, not the light itself.

Shadow configuration includes enablement per light/object, map size, shadow distance/frustum, near/far, bias, normal bias, filtering and update mode (continuous/on-change/manual). Point shadows can require several directional views; account for actual render passes rather than charging one map per light. Cap total shadow allocations by profile and display which lights were downgraded. For static/on-change maps, moving a caster or changing alpha/displacement must invalidate the relevant shadow cache.

Provisional low profile: shadows off by default, opt-in one modest directional map; medium: one directional plus one selected spot; high: a configurable allocation budget, not unlimited shadow-casting lights. Initial experiments use 512/1024/2048 map sizes with camera-fitted frusta. Prevent huge far planes and bias changes from hiding defects. Include acne, peter-panning, thin geometry and moving-camera regression scenes.

### 6. Environment and reflection roadmap

First implement a single environment map with PMREM and independent background visibility/intensity. Cache processed output by environment hash and processing recipe. Dispose old PMREM targets only after no material/environment lease uses them. Add local reflection probes later with explicit influence volumes and update frequency. Dynamic probes render multiple views and must be charged to the GPU budget.

Planar mirrors and screen-space reflections are separate future effects with different costs and failure modes; neither is included implicitly by a “reflections” checkbox. SSR cannot represent missing off-screen information and needs a documented fallback. Real-time ray tracing is out of scope for this WebGL 2 target.

### 7. Custom shader contract and failure recovery

Initial custom shaders use versioned GLSL source assets, typed uniform declarations, approved texture bindings and a small documented engine interface. Shader contracts specify object/world/view spaces, normal matrix, tangents, time, camera, lighting inputs and environment bindings. Offer unlit custom shading first; a lit extension path must explicitly preserve compatible shadow/depth variants.

Proposed workflow: edit draft → static/type/size checks → compile a staging material → warm representative variants → show errors mapped to authored lines → apply only on success. A source change invalidates the program key; uniform-only changes do not rebuild the scene or program. Cache keys include shader revision, material defines, skinning/morph flags, lighting/shadow mode and renderer revision.

`compileAsync` uses `KHR_parallel_shader_compile` where available; it is useful for warm-up, not a universal guarantee of zero stalls. Lighting/environment must be configured before compilation. [1](https://threejs.org/docs/pages/WebGLRenderer.html) Maintain the last valid material after compilation/link failure. Save drafts separately from the applied source so a broken draft does not destroy a working project on reopen.

Custom GPU code is not safely sandboxed by a JavaScript try/catch. Limit source length, initial feature surface and variant count; make expensive features opt-in. A shader that compiles can still be extremely slow. Offer preview isolation and recovery after context loss; do not claim to preempt an arbitrary GPU workload reliably.

### 8. Post-processing order and volumetrics

Define an explicit pass graph: scene colour/depth → optional depth-aware effects → bloom accumulation → artistic grading/exposure/tone mapping → output colour conversion → display-space game UI. UI should not be blurred or unintentionally tone mapped with the 3D scene. Exactly one output conversion occurs.

Use an HDR target only when the capability and budget checks pass; expose a labelled LDR approximation otherwise. Bloom needs a documented threshold domain and radius/resolution controls, not the existing five-tap glow renamed as a new feature. Add contrast/saturation/vignette and optional FXAA before considering temporal antialiasing. Pass toggles/resize release obsolete targets; changing one scalar uniform does not reconstruct the composer.

For actual volumetric scattering, begin with a bounded depth-aware ray-march experiment: reconstruct a view ray, terminate at opaque scene depth, integrate extinction/scattering with world-unit step lengths, and combine transmittance with scene colour. The Beer–Lambert term `T = exp(-sigmaT * distance)` makes density meaningful across sample counts. A directional phase function and light/shadow visibility are separate inputs. Start with one light and half-resolution output; evaluate sample counts 8/16/32 on real hardware before selecting defaults.

Unreal's documentation illustrates that volume resolution, view distance, shadowed lights and temporal reprojection are explicit quality/performance choices, and that temporal filtering can create trails behind rapidly changing lights. Pinefall must not copy Unreal's reported timings as its own budget. [1](https://dev.epicgames.com/documentation/unreal-engine/volumetric-fog-in-unreal-engine?lang=en-US) Add temporal accumulation only after motion/depth rejection and reset rules for camera cuts, resize, light changes and scene transitions exist. Transparent surfaces need a declared limitation or dedicated integration path. Keep fake beams available as an inexpensive, clearly labelled alternative.

### 9. Work breakdown and validation

| Gate | Implementation | Proof |
|---|---|---|
| G0 | Capability report, material/texture schemas, ownership | Headless validation and migrations |
| G1 | PBR/unlit inspector, maps, UV transforms | Reference material sphere and checker scenes |
| G2 | Environment and independent light/shadow controls | Correct effective settings and no allocation growth |
| G3 | Custom shader draft/compile/apply and uniform SDK | Broken shader preserves last valid image |
| G4 | Ordered post stack and HDR/LDR fallback | Colour regression, disabled-pass cleanup |
| G5 | Experimental depth-aware scattering | Occlusion, sample stability and hardware timing evidence |

Propose a low-profile goal of maintaining the existing 30 FPS target on an agreed small reference scene, not arbitrary projects. Record CPU and GPU separately through Plan 05. Test known colour patches, normal-map polarity, UV channels, mirrored geometry, skinned shadows, alpha cutout, displacement bounds, missing extensions, resize, context loss and 100 quality toggles. No pass is accepted from screenshots alone: validate ownership/resource counts and actual render errors.

### Completion and dependencies

A second developer must import a material set, fix its normal convention, apply it to an instance, add a spot shadow, edit a custom shader, recover from an error and export matching visuals. Plan 01 owns files/recipes; Plan 02 supplies skinning variants; Plan 04 owns material-instance overrides; Plan 05 owns GPU timing; Plan 06 owns capability reporting in exports. Deliver G1–G4 before treating G5 as a release blocker for the basic engine.

## R2 — Channel semantics, allocation budgets and graphics failure modes

### Research correction: channel selection requires an adapter

Three's standard material reads AO from red, roughness from green and metalness from blue; its scalar metalness/roughness values multiply the maps. Its alphaMap samples green rather than the image's alpha channel. The material UI must not imply arbitrary channel routing is already supported by assigning a texture. [1](https://threejs.org/docs/pages/MeshStandardMaterial.html)

**Changed design:** convert selected source channels into a canonical packed artifact during import, or use a deliberately maintained shader adapter. Prefer offline/worker repacking for standard materials to reduce shader variants. Keep source channel choices in the recipe and use nearest/numeric-preserving processing for data where required. Do not use display-space colour compositing to repack linear scalar data. A metalness map multiplied by the default zero scalar produces no metalness; set and explain the intended factor when enabling a map.

The live documentation's AO UV wording can differ from versioned `Texture.channel` behavior. Verify the pinned r185 shader/attribute path with UV0/UV1 fixtures before locking the inspector policy. Absence of a required UV set is a validation error/warning, not a silent arbitrary alias. This is an explicit remaining implementation investigation.

### Transparent, cutout and displaced objects

Add alpha modes opaque, mask and blend. Mask uses a defined cutoff and compatible shadow/depth variants; blend has sorting/overdraw limitations and should not cast an opaque shadow unless explicitly configured. Screen-space depth effects generally see opaque depth; document glass/particles limitations rather than letting fog erase them unpredictably. Double-sided shading doubles some visible work and can complicate normals/shadows; it is an authored option, not the repair for every missing face.

Displacement requires expanded bounds for culling and shadows. Without bounds inflation, a waving/displaced mesh can disappear at screen edges. Skinned/morphed geometry needs compatible bounds as well. Negative scale and tangent handedness get their own fixtures, not a global normal-map inversion workaround.

### A concrete resource budget model

Estimate render-target memory as width × height × bytes per pixel × attachments × samples, including resolve targets and histories. A 1920×1080 RGBA16F colour attachment alone is about 15.8 MiB; depth, MSAA, ping-pong bloom and temporal histories are additional. Report those contributions in the settings panel before allocating a high profile.

Initial low profile experiments: render scale 0.75–1.0 with an explicit resolution cap, no MSAA offscreen chain, FXAA optional, one conservative shadow map, bloom half-resolution if enabled, volumetrics disabled. Medium/high presets are ceilings, not hardware promises. The total allocation budget is shared with asset textures and animation bone data, not an independent budget each feature can consume fully.

MDN recommends avoiding synchronous WebGL checks/readbacks in the frame loop and describes capability/VRAM budgeting strategies. [1](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) Cache limits at initialization; validate target combinations at creation, not every frame. GPU timer support comes from Plan 05's optional asynchronous profiler. If unavailable, report frame-time observations and CPU submission time separately.

### Context loss, shader failure and fallback ladder

1. On context loss, stop submitting work, invalidate GPU handles/query generations, preserve authored assets and display recovery state.
2. On restore, reacquire capabilities; rebuild a minimal renderer and resource leases from retained source/artifacts.
3. Restore low-cost essential scene resources first, then optional effects within the upload budget.
4. Recompile known-good materials. An invalid custom shader uses a visible error material with an actionable diagnostic, not a silent black mesh.
5. If repeated recovery fails, offer a safe profile/restart/export-diagnostics path without changing the saved project or disabling sandboxing.

Downgrade ladder: disable volumetrics → reduce shadow count/resolution → reduce post resolution → reduce render scale → report unsupported core rendering. This is not a 2D fallback. Automatic quality adjustment, if later added, needs hysteresis and a minimum dwell interval to avoid oscillating every frame; retain a manual lock.

### Integration and additional gates

Keep authored schemas in `packages/runtime/src/schema.ts`, render-resource adapters behind `engine.ts`, and a composable pass graph replacing/expanding the limited existing `effects.ts` rather than stacking unrelated full-screen filters. Editor panels edit data via Plan 05 commands; scripts receive typed material/light parameter APIs rather than private renderer mutation. The asset manifest owns shaders/textures and their dependencies.

New fixtures: an ORM map with distinct constant channels; alpha stored differently in alphaMap versus base-colour alpha; emissive without bloom; bloom without real light contribution; static shadow invalidation after a cutout edit; near/far depth reconstruction; fog behind an opaque wall; temporal reset on teleport; 100 resize/profile/context-loss cycles. Capture profile/resolution/exposure with golden images. Tolerate justified driver variation, but do not accept huge pixel thresholds that conceal colour-space defects.

Unresolved decisions requiring recorded experiments: HDR target availability on physical CEDAR, supported antialiasing sequence, low-profile texture/render-target cap, local-probe update scheme and whether the first scattering prototype is worth shipping. A failed volumetric experiment must not delay correct PBR/lights/custom shader recovery or be marketed as completed volumetrics.


## R3 — Final integration check

Material assets use the shared registry and artifact leases; effective graphics settings remain device-local and cannot rewrite authoring intent. Shader draft application and light/material edits use Plan 05 transactions, while dynamic uniform changes stay outside authored undo unless explicitly applied. Start with a colour-correct reference scene and resource accounting before adding more passes. Do not advance volumetric quality based on CPU submission time mislabeled as GPU time.

### Companion plans

- [Asset pipeline, asynchronous import and reimport](01-ASSET-PIPELINE.md)
- [Animation, character presentation and audio](02-ANIMATION-AUDIO.md)
- [Reusable gameplay, prefabs, components and scene lifecycle](04-GAMEPLAY-AUTHORING.md)
- [Debugging, profiling, recovery and editor quality of life](05-DEBUGGING-RELIABILITY.md)
- [Game export, input, save games, security and production readiness](06-SHIPPING-DEVELOPER-READINESS.md)
