# Graphics authoring, preview and SDK — Plan 03 development

This documents the implemented 0.7.0 graphics contract. See [texture/UV/slot/HDR authoring](GRAPHICS-AUTHORING.md) for resource workflows and bounds, and [current status](CURRENT-STATUS.md) for publication and evidence.

## Three separate kinds of settings

1. **Authored:** `scene.graphics` (version 1), reusable material assets and image/UV bindings, optional artistic post settings, entity material references/instance surfaces, independent light definitions and per-mesh shadow flags. Saved in portable PIF7/PIF9 or native folder/PIF8 resources. Older PIF formats remain readable; published 0.6.2 cannot open PIF7.
2. **Device/preview:** Rendering → resolution scale, quality and shadow ceilings, local post overrides. The GPU/CPU/compositor button opens the existing restart-only desktop controls. A browser cannot change its host acceleration policy. These device settings are not serialized into the project.
3. **Runtime:** `ctx.graphics` updates transient material/light/post values. No authoring undo or saved scene mutation. Runtime material changes use an owned per-entity material; subsequent scalar changes update uniforms without replacing that material. Stop restores authored values and the pre-Play preview settings.

The Rendering panel's **Apply preview post to project** button is an explicit authoring transaction. **Use authored post settings** removes the preview override. Merely opening a project or choosing a weaker device profile does not rewrite authored light/shadow requests.

## TypeScript script SDK

```ts
import { Script } from "@pinefall/sdk";

export default class LookController extends Script {
  start() {
    this.ctx.graphics.setPost({
      enabled: true,
      bloom: true,
      threshold: 1, // linear scene-radiance threshold, not display RGB
      strength: 0.3,
      radius: 0.4,
      exposure: 1.1,
      toneMapping: "aces",
      contrast: 1.05,
      saturation: 1.1,
      vignette: 0.15,
      grain: 0.01,
      chromaticAberration: 0,
      fxaa: true,
    });
    this.ctx.graphics.setPreview({ renderScale: 0.75, shadows: true });
    this.ctx.graphics.setMaterial(this.ctx.entity.id, {
      roughness: 0.4,
      metalness: 0.15,
      emissive: "#ff6030",
      emissiveIntensity: 2,
    });
  }
  update() {
    // Scalar update: no new material/program each frame.
    this.ctx.graphics.setMaterial(this.ctx.entity.id, {
      emissiveIntensity: 2 + Math.sin(this.ctx.time.elapsed) * 0.5,
    });
  }
}
```

Other controls:

```ts
ctx.graphics.setLight("lamp-id", { intensity: 40, angle: 35, penumbra: 0.5 });
ctx.graphics.invalidateShadows();
const report = ctx.graphics.snapshot;
// available, backend, adapter, hdr, requested, effective,
// postTargetBytes, environmentTargetBytes, shadowTargetBytes, shadowViews, reasons, contextLost
```

Light type changes are authored scene edits, not runtime uniform updates. Material/light target IDs must exist. Invalid/NaN/out-of-range values are rejected. Script calls after the owning script is disposed are rejected. A typed interface is not a sandbox for trusted project scripts.

**Headless:** the same API validates graphics intent without creating a renderer. `snapshot.available` is false; requested values can be inspected while effective post is disabled. No pixels, GPU or shader compilation is implied.

## Materials and lights

Select an entity → Mesh renderer → **Edit material surface**. Apply an instance override or save a reusable material. Supported scalar fields: PBR/unlit family, base colour, roughness, metalness, emissive colour/intensity, alpha mode/cutoff/opacity and double-sidedness. Reusable materials are selected by stable ID. Prefab material IDs are remapped on import.

Overrides can target all slots or one source-guarded structural slot. Explicit surfaces replace targeted imported materials; unaffected slots remain intact. PBR supports eight canonical map roles and bounded normal/displacement controls; unlit supports color/alpha maps. UV0/UV1 inspection and transforms, worker channel packing and external HDR are implemented. See [the authoring guide](GRAPHICS-AUTHORING.md).

Emissive surfaces do not create lights. Bloom does not light neighbouring objects. Blended surfaces have sorting limitations and default to not casting opaque shadows. Forcing a blended caster does not create coloured/translucent shadow transport.

Directional, point and spot lights support authored colour/intensity, range, spot cone/penumbra/decay, shadow request/size/bias/normal bias. Point/spot intensity follows Three.js candela conventions; directionals use Three's irradiance multiplier. Scene distance is metres. Directional frusta can use fixed bounds or scene-bound fitting with padding; these are not cascaded shadow maps. Deforming meshes can require extra padding.

Low preview: shadows off by default; explicit opt-in permits one 512px sun map. High: at most eight shadow views and a 64 MiB accounted shadow allocation budget, maps capped to 1024px. Point lights charge six rendered views and their atlas storage. Requested 2048px maps remain authored as 2048 even when the preview caps them. Requested/effective downgrade reasons appear in Rendering. Each light supports `shadowUpdate: "every-frame" | "on-change" | "manual"`. Gameplay conservatively invalidates on-change maps; manual maps require explicit `invalidateShadows(entityId?)` after initial allocation. `shadowFrustum: "scene"` enables fitted directional bounds, and `shadowPadding` adds a margin.

## Post stack and accounting

Linear scene/opaque depth → optional half/full-resolution scattering → multi-resolution bloom → grading/vignette/grain/chromatic aberration → tone mapping and one sRGB conversion → display-space FXAA. DOM game UI remains outside the chain. Exposure/tone mapping also work without post enabled. The `none` curve uses linear exposure gain/clipping rather than an artistic tone curve. Bloom is based on Three r185 `UnrealBloomPass`, not the previous five-tap approximation.

HDR render targets are chosen when `EXT_color_buffer_float` is available; otherwise the stack uses byte targets and labels bloom/scattering as an LDR approximation. Target estimates account for composer ping-pong, depth, scattering/history/optional transparent-interface depth and bloom mip targets and reserve from the shared asset-work budget, with a 96 MiB post ceiling. These are conservative accounting estimates, **not measured VRAM**, total process RAM or GPU timings. Disabling passes disposes their owned targets/materials. Scalar effect edits do not recreate the composer.

WebGL context loss stops frame submission/simulation advancement while retaining authored data; restoration recreates the post chain and reapplies settings. One restore cycle and 100 effect-toggle/resize cycles are tested. This is not the full staged upload/repeated-driver-failure recovery system promised by later gates.

## Reference and validation

`examples/projects/materials-post-reference.pif` is original procedural content with separate TypeScript script source. Generate it with `bun scripts/generate-materials-reference.ts`. The pulsing emissive example requires the existing explicit script-trust opt-in.

- `tests/plan03.test.ts`: schemas, PIF7, old-format rejection of new fields, headless intent.
- `tests/plan03-browser.ts`: exact grey-patch output within two byte values, 100 pass/resize cycles, target cleanup, instance isolation, scalar identity stability, shadow budget, context restoration.
- `tests/plan03-editor.ts`: preview/apply distinction, desktop-settings access, material authoring and cold reopening.

Physical CEDAR/Windows performance, maximum scene complexity and full Plan 03 acceptance are not claimed passed.


## Custom unlit shaders (0.6.3-dev.1)

Mesh renderer → **Custom shader…** opens Project files. Source/uniform JSON is edited externally; the embedded GLSL editor was removed. Create files, edit them in your IDE, validate and explicitly Apply. GPU code is disabled by default. Explicit session consent is required; scripts cannot grant that consent through `setPreview`. Rendering also offers trust/reload and disable controls. Standalone exports have a separate shader-consent button, retain permission across quality changes, and revoke permission when a different project file is opened.

```ts
await ctx.graphics.compileShader(this.ctx.entity.id, {
  version: 1,
  fragment: "vec4 shade(vec2 uv, vec3 p) { return vec4(uTint, 1.0); }",
  uniforms: { uTint: { type: "vec3", value: [0.3, 0.7, 0.5] } },
});
ctx.graphics.setUniform(this.ctx.entity.id, "uTint", [1, 0, 0]);
```

The fragment function returns **linear RGBA**. The fixed engine vertex interface includes skinning, morphs and instancing; the supplied world position includes instance transforms. This interface is unlit, opaque and does **not cast shadows**. Custom lighting, vertex deformation, sampler uniforms, custom depth/shadow variants and arbitrary render passes are not supported. `uTime` is reserved for elapsed rendered seconds. User uniform names begin with `u` and an uppercase letter; supported types are float/vec2/vec3/vec4 with finite components bounded to ±1,000,000.

Limits: 16,384 UTF-16 code units of source, 16 typed uniforms, 16 shader assets and 16 bound entities. Applied source and unfinished source/uniform drafts are distinct PIF entries; invalid draft text is never executed. Native raw backups preserve unfinished external draft files even when Apply is blocked. The draft-uniform text is capped at 4,096 code units. Archive paths, sizes, references and integrity are checked. Cold reopening resets consent.

Compile/apply serializes staged compilation of direct/offscreen variants and validates GL link status before adopting the material. Invalid source, cancellation and revoked trust retain the last valid material (revocation explicitly replaces custom materials with a magenta blocked-code surface). Driver logs map to authored lines where supported. Typed uniform updates do not rebuild the material/program. A 30-second polling deadline and AbortSignal govern asynchronous completion waits; **synchronous GPU/driver calls and hostile shader workloads cannot reliably be preempted**. These are resource limits, not a GPU security sandbox. No production sandbox is disabled.

Context loss aborts pending compile/load work and suspends frame submission. Restoration reuses approved sources and recreates post targets. Script scope disposal rejects subsequent calls. Headless mode validates source/target intent, then explicitly rejects GPU compilation.

`examples/projects/shader-reference.pif` contains procedural UV checkers, typed uniforms and a deliberately unfinished draft separate from the valid applied source. Generate using `bun run generate:shader-reference`.

Shader evidence: `tests/shader.test.ts` covers schema bounds, archive separation/roundtrip/unsafe paths and headless rejection. `tests/shader-browser.ts` covers default denial, last-valid recovery, stable material identity, cancellation/revocation, context restoration, skinned/morph/instanced pixels and repeated replacement cleanup. `tests/shader-files-browser.ts` covers browser file import, explicit trust/Apply, rejected compilation, bounds, exports and cold reopen persistence. `tests/external-code-native.ts` covers native watched-source diagnostics, explicit Apply, failed-shader retention and restart. `TEST_SHADERS=1 bun tests/plan03-export.ts` is the standalone fixture command; it was not rerun for the browser file-exchange checkpoint. Software/SwiftShader evidence is not physical CEDAR or Windows acceptance.

### Browser GLSL file exchange

Select a mesh → **Custom shader…**. Import a `.glsl` fragment and optionally a uniform `.json` object. Export buttons provide external-editor starting files. Files must be UTF-8: fragment at most 16,384 characters / 65,536 bytes; uniform JSON at most 4,096 characters / 16,384 bytes, with at most 16 typed uniforms. The fragment defines `vec4 shade(vec2 uv, vec3 worldPosition)`, not a standalone `main()`.

Import only reads and schema-checks files. Enable **Rendering → Trust and reload authored shaders**, then explicitly **Compile and apply imported shader**. All authored shader instances are staged before the world is replaced. A compilation failure retains the previous runtime and authored source; import a corrected file to retry. Updating a shared shader updates its users. No arbitrary file watcher or external-process launcher is available in browsers. Successful imports are stored in the project; unapplied candidates are discarded when the dialog closes. Exports from this dialog contain the candidate, so reopening after a failed Apply lets you export the last adopted shader.


## PMREM environments and depth-aware scattering

`scene.graphics.environment = { sky: "#b8d7ff", ground: "#30352a", intensity: 1, resolution: 128 }` authors a filtered hemisphere environment. Resolution is 128 or 256; intensity is 0–8. Source colours are converted to linear radiance. Renderer-local leases share the texture across staged worlds; intensity-only changes do not regenerate PMREM. Context generations invalidate old targets. Floating-point-target support is required and unsupported intent is reported. Set `image` to a catalog Radiance HDR ID for an external environment. See the authoring guide for decoding, bounds and minimum PMREM size.

`PostSettings.scattering` is optional. Import `DEFAULT_SCATTERING` from `@pinefall/sdk`, then set density (0–0.5), heightFalloff (0–2), baseHeight (−100–100), maxDistance (1–200), steps (8/16/32), colour, intensity (0–8) and anisotropy (−0.8–0.8). Rendering exposes preview controls and the same explicit commit-to-project action as other post fields.

The pass integrates a height-density medium using Beer–Lambert transmittance. Optional fields are `resolution: "half" | "full"`, `lighting: "artistic" | "directional-shadow"`, `transparentDepth: "opaque" | "nearest"`, `temporal: boolean`, and `historyWeight: 0–0.95`. Depth-aware upsampling includes edge reintegration. Nearest-interface depth is not multilayer transparent transport; shadow sampling supports the brightest visible directional light (Basic/PCF, not VSM or point/spot). Temporal reprojection rejects depth mismatches and clamps history; cuts, settings, size and context changes invalidate it. These bounded approximations and their fallback reasons are documented in the [authoring guide](GRAPHICS-AUTHORING.md). Fake cone beams remain separate.

Tests include `graphics-images-browser.ts`, `material-maps-browser.ts`, `material-slots-browser.ts`, `graphics-failures-browser.ts`, `scattering-advanced-browser.ts`, existing graphics/shader suites, native authoring and production standalone export. Physical CEDAR performance is not inferred from software tests.
