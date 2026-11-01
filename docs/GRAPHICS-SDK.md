# Graphics authoring, preview and SDK — Plan 03 development

This documents implemented development APIs, not completion of the whole Plan 03. The bounded custom-unlit GLSL pipeline is implemented. Texture-map authoring, PMREM environment and actual volumetric scattering remain unimplemented.

## Three separate kinds of settings

1. **Authored:** `scene.graphics` (version 1), reusable scalar material assets, optional artistic post settings, entity material references/instance surfaces, independent light definitions and per-mesh shadow flags. Saved in portable PIF7. Older PIF formats remain readable; published 0.6.2 cannot open PIF7.
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
// postTargetBytes, shadowTargetBytes, shadowViews, reasons, contextLost
```

Light type changes are authored scene edits, not runtime uniform updates. Material/light target IDs must exist. Invalid/NaN/out-of-range values are rejected. Script calls after the owning script is disposed are rejected. A typed interface is not a sandbox for trusted project scripts.

**Headless:** the same API validates graphics intent without creating a renderer. `snapshot.available` is false; requested values can be inspected while effective post is disabled. No pixels, GPU or shader compilation is implied.

## Materials and lights

Select an entity → Mesh renderer → **Edit material surface**. Apply an instance override or save a reusable material. Supported scalar fields: PBR/unlit family, base colour, roughness, metalness, emissive colour/intensity, alpha mode/cutoff/opacity and double-sidedness. Reusable materials are selected by stable ID. Prefab material IDs are remapped on import.

Current overrides deliberately replace **all material slots** on an entity. They do not preserve an imported material's texture maps; the dialog warns about this. Per-slot edits, texture maps/channel packing/UVs and displacement are later gates. Unlit uses base colour/alpha and ignores lighting/PBR/emissive parameters.

Emissive surfaces do not create lights. Bloom does not light neighbouring objects. Blended surfaces have sorting limitations and default to not casting opaque shadows. Forcing a blended caster does not create coloured/translucent shadow transport.

Directional, point and spot lights support authored colour/intensity, range, spot cone/penumbra/decay, shadow request/size/bias/normal bias. Point/spot intensity follows Three.js candela conventions; directionals use Three's irradiance multiplier. Scene distance is metres. Directional frusta are currently fixed local bounds, not camera-fitted cascades.

Low preview: shadows off by default; explicit opt-in permits one 512px sun map. High: at most eight shadow views and a 64 MiB accounted shadow allocation budget, maps capped to 1024px. Point lights charge six rendered views and their atlas storage. Requested 2048px maps remain authored as 2048 even when the preview caps them. Requested/effective downgrade reasons appear in Rendering. Continuous updates are implemented; independent manual/on-change shadow modes remain pending.

## Post stack and accounting

Linear scene → multi-resolution bloom → grading/vignette/grain/chromatic aberration → tone mapping and one sRGB conversion → display-space FXAA. DOM game UI remains outside the chain. Exposure/tone mapping also work without post enabled. The `none` curve uses linear exposure gain/clipping rather than an artistic tone curve. Bloom is based on Three r185 `UnrealBloomPass`, not the previous five-tap approximation.

HDR render targets are chosen when `EXT_color_buffer_float` is available; otherwise the stack uses byte targets and labels bloom as an LDR approximation. Target estimates account for composer ping-pong, depth and bloom mip targets and reserve from the shared asset-work budget, with a 96 MiB post ceiling. These are conservative accounting estimates, **not measured VRAM**, total process RAM or GPU timings. Disabling passes disposes their owned targets/materials. Scalar effect edits do not recreate the composer.

WebGL context loss stops frame submission/simulation advancement while retaining authored data; restoration recreates the post chain and reapplies settings. One restore cycle and 100 effect-toggle/resize cycles are tested. This is not the full staged upload/repeated-driver-failure recovery system promised by later gates.

## Reference and validation

`examples/projects/materials-post-reference.pif` is original procedural content with separate TypeScript script source. Generate it with `bun scripts/generate-materials-reference.ts`. The pulsing emissive example requires the existing explicit script-trust opt-in.

- `tests/plan03.test.ts`: schemas, PIF7, old-format rejection of new fields, headless intent.
- `tests/plan03-browser.ts`: exact grey-patch output within two byte values, 100 pass/resize cycles, target cleanup, instance isolation, scalar identity stability, shadow budget, context restoration.
- `tests/plan03-editor.ts`: preview/apply distinction, desktop-settings access, material authoring and cold reopening.

Physical CEDAR/Windows performance, maximum scene complexity and full Plan 03 acceptance are not claimed passed.


## Custom unlit shaders (0.6.3-dev.1)

Mesh renderer → **Custom shader…** opens a source/uniform dialog without changing the theme. GPU code is disabled by default. Explicit session consent is required; scripts cannot grant that consent through `setPreview`. Rendering also offers trust/reload and disable controls. Standalone exports have a separate shader-consent button, retain permission across quality changes, and revoke permission when a different project file is opened.

```ts
await ctx.graphics.compileShader(this.ctx.entity.id, {
  version: 1,
  fragment: "vec4 shade(vec2 uv, vec3 p) { return vec4(uTint, 1.0); }",
  uniforms: { uTint: { type: "vec3", value: [0.3, 0.7, 0.5] } },
});
ctx.graphics.setUniform(this.ctx.entity.id, "uTint", [1, 0, 0]);
```

The fragment function returns **linear RGBA**. The fixed engine vertex interface includes skinning, morphs and instancing; the supplied world position includes instance transforms. This interface is unlit, opaque and does **not cast shadows**. Custom lighting, vertex deformation, sampler uniforms, custom depth/shadow variants and arbitrary render passes are not supported. `uTime` is reserved for elapsed rendered seconds. User uniform names begin with `u` and an uppercase letter; supported types are float/vec2/vec3/vec4 with finite components bounded to ±1,000,000.

Limits: 16,384 UTF-16 code units of source, 16 typed uniforms, 16 shader assets and 16 bound entities. Applied source and unfinished source/uniform drafts are distinct PIF entries; invalid draft text is never executed. Save draft only is available after the first successful application. The draft-uniform text is capped at 4,096 code units. Archive paths, sizes, references and integrity are checked. Cold reopening resets consent.

Compile/apply serializes staged compilation of direct/offscreen variants and validates GL link status before adopting the material. Invalid source, cancellation and revoked trust retain the last valid material (revocation explicitly replaces custom materials with a magenta blocked-code surface). Driver logs map to authored lines where supported. Typed uniform updates do not rebuild the material/program. A 30-second polling deadline and AbortSignal govern asynchronous completion waits; **synchronous GPU/driver calls and hostile shader workloads cannot reliably be preempted**. These are resource limits, not a GPU security sandbox. No production sandbox is disabled.

Context loss aborts pending compile/load work and suspends frame submission. Restoration reuses approved sources and recreates post targets. Script scope disposal rejects subsequent calls. Headless mode validates source/target intent, then explicitly rejects GPU compilation.

`examples/projects/shader-reference.pif` contains procedural UV checkers, typed uniforms and a deliberately unfinished draft separate from the valid applied source. Generate using `bun run generate:shader-reference`.

Shader evidence: `tests/shader.test.ts` covers schema bounds, archive separation/roundtrip/unsafe paths and headless rejection. `tests/shader-browser.ts` covers default denial, last-valid recovery, stable material identity, cancellation/revocation, context restoration, skinned/morph/instanced pixels and repeated replacement cleanup. The editor test covers compile/apply, invalid source diagnostics, both draft fields, Home checkpoint/cold reopen and consent reset in browser and built Linux Electron. `TEST_SHADERS=1 bun tests/plan03-export.ts` exercises the built standalone shader fixture. Software/SwiftShader evidence is not physical CEDAR or Windows acceptance.
