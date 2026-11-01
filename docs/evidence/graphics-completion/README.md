# 0.7.0 graphics completion evidence

Recorded 2026-11-01. **Local candidate only; not a GitHub publication receipt.** Linux x64 sandbox, Chromium/Electron with SwiftShader. Production sandbox policy is unchanged; test launch flags accommodate the root-run environment.

## Executed gates

| Gate | Result |
|---|---|
| TypeScript + Oxlint | PASS: 266 files, zero errors/warnings |
| Unit suite | PASS: 168 tests, 1,024 assertions, 38 files |
| Production editor/player and desktop bundle | PASS; Vite 7.3.7 via bounded Node heap, Bun TypeScript orchestration |
| Linux AppImage and Windows ZIP packaging | PASS; unsigned; Windows execution not performed |
| Packaged Linux graphics authoring | PASS: disk PNG/HDR, UV layout, invalid UV retention, slots, HDR/scattering, raw backup, PIF9 native extraction |
| Packaged Linux models | PASS: real GLB/FBX worker import, renderer adoption, Play/Stop, portable save |
| Packaged Linux PIF | PASS: portable worker import → disk folder → raw PIF8 save and integrity-checked extraction |
| Packaged Linux missing companions | PASS: persisted repair across reload and real textured FBX conversion |
| Native unified/external/disk workflows | PASS: registration/trust, raw preservation, explicit Apply, restart recents, watchers/conflicts/root confinement |
| Production standalone reference | PASS: actual bitmap and half-float uploads, GPU draws, no page/console errors; prefab image/material/slot remapping also passes unit coverage |
| Existing asset browser suite | PASS: worker/cache/cancellation/FBX, import/reimport, admission failure and retry |
| Graphics/shader completion matrix | PASS: details below; logs retained alongside screenshots |

## Pixel and lifetime observations

- Packed RGBA `[32,127,64,0]` exactly; dimension mismatch rejected. Role color spaces, UV1, independent sampler views and HDR PMREM pixels verified.
- Alpha G: 0 versus 255. Normal Y sign: 212 versus 34. Displacement R: 784 versus 1,444 lit pixels. Roughness G: 255 versus 157. Metalness B: 186 versus 158. AO R: 153 versus 0. Native alpha-shadow occupancy 0 versus 140; displacement changes shadow centroid 30 → 24.
- Invalid UV Apply retains the world; changing one imported slot preserves the other. Changed model source rejects stale overrides.
- Opaque versus nearest-transparent termination: 208 versus 87. Directional shadow versus lit: 0 versus 208. First/second/camera-cut history weight: 0 / 0.8 / 0. Moving depth: 87 → 208. One-pixel thin geometry: half=87, full=87.
- Oversize target admission rejected, history invalidated on resize, 50 mixed scattering configurations released accounted memory. Additional baseline scattering 50 cycles; post 100 cycles; shaders 20 cycles.
- Injected texture allocation and cancellation retained the old world and released staged allocations. Two actual context loss/restoration cycles followed by 20 image-world replacements returned to baseline accounting without obsolete-context GL errors.
- Recorded scattering timing is CPU submission plus synchronous readback under SwiftShader, not hardware GPU timing. See the log for this run's distribution; do not use it to certify CEDAR performance.

## Fixes found by the gates

Repeated context recovery exposed disposal listeners holding old-context GPU handles; handles/listeners are now dropped while the context is lost without closing CPU sources. Native project-transition testing exposed hidden model imports racing a project snapshot: imports are now guarded/disabled during project operations. The native model test waits for the actual New game handoff rather than programmatically uploading into a still-open modal. The old PIF-native test was updated to exercise the current folder-first/raw-backup contract instead of assuming native saves still produce portable archives. Browser fault injection is run against a fresh Vite graph to avoid HMR-created duplicate test module instances.

## Screenshots

- [Image catalog and HDR import](native-graphics-image-resources.png)
- [UV layout inspection](native-uv-inspection.png)
- [Map/slot controls](native-texture-slot-authoring.png)
- [HDR/scattering controls](native-hdr-scattering-controls.png)
- [Production standalone reference](graphics-export.png)

Physical CEDAR/Windows, listening, hardware timings and independent acceptance are owner-deferred, **not passed**. At this evidence checkpoint publication was blocked by unavailable transient authorization. Subsequent publication status is recorded on the GitHub release page; the software evidence above is unchanged.

Native smoke tests use isolated temporary profiles, avoiding accumulated recents from unrelated runs.
