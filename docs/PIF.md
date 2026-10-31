# PIF project container — version 1, initial milestone

**This implements the project-format phase of [the 0.6 plan](PLAN-0.6.md), not the entire graphics/import overhaul.**

A `.pif` is a real **XZ-compressed USTAR archive**, using LZMA2 preset 6 and CRC64. Higher presets are not automatically better for already compressed textures and require substantially more memory. Compression ratio depends on project content.

```
My Game.pif
  project.json          format/version/scene manifest
  scene.json            definition and resource references
  assets/0.glb          actual binary model, with its existing embedded textures
  scripts/0.ts          actual TypeScript source
```

Manifest: `{"format":"pinefall-project","version":1,"scene":"scene.json"}`.

Inside `scene.json`, each asset has `{id,name,file}` instead of `{id,name,data}`. Each script has `{id,name,file}` instead of `{id,name,source}`. Entity attachments continue referencing stable IDs. Neither GLB base64 nor script source is embedded in the archived scene definition. Filenames in the archive are generated independently of user-entered names; original display names remain in the definition.

## Use

- **Save project** / **Ctrl+S** (**Cmd+S** on macOS): save `.pif`.
- **Open project** / **Ctrl+O**: open `.pif` or legacy scene JSON.
- **Export scene** remains an explicit legacy embedded-JSON interchange operation.
- Standalone Player's file picker accepts `.pif` as well.
- Project compression/decompression runs in a dedicated worker; **Cancel project operation** terminates it. A two-minute timeout also terminates stuck worker jobs.
- Import never executes scripts, and always revokes script trust, including reopening an identical project. Play requires fresh approval.
- Failed imports leave the current document intact. Edits made while an open operation runs cause its result to be rejected instead of silently overwriting those edits.
- Saving captures the current authored scene, not runtime state or unsaved text in the script editor. Local autosave is still a legacy JSON recovery cache; it is not the `.pif` project on disk.

```sh
bun run game new build/example.pif "My Game"
bun run game pack examples/projects/ui-lab.scene.json build/ui-lab.pif
bun run game validate build/ui-lab.pif
bun run game simulate build/ui-lab.pif 60 --trust-scripts
bun run game unpack build/ui-lab.pif build/legacy.scene.json
```

`unpack` above produces a legacy embedded JSON scene for compatibility, not a directory. For independent archive inspection/extraction, standard XZ/TAR tools work:

```sh
xz -t build/ui-lab.pif
tar -tJf build/ui-lab.pif
# For your own trusted archives, extract into a new directory:
mkdir project-inspection
tar -xJf build/ui-lab.pif -C project-inspection
```

## Safety and limits

- 16 MiB compressed input, 40 MiB expanded TAR, 64 MiB XZ decoder dictionary budget. Expanded output is bounded **inside the WASM decode call**, not merely checked after unbounded decompression.
- Strict regular-file USTAR subset; no links, directories, absolute/traversal paths, duplicate paths, prefixes, PAX/GNU extensions, concatenated XZ streams, or unreferenced resources. A `.pif` created with arbitrary external TAR options may therefore be rejected despite being a valid general TAR archive.
- Validate manifest/version, resource references, headers/checksums, full XZ consumption, GLB structure and the existing scene schema before adoption.
- Existing limits on scene entities, GLBs and scripts still apply. Current PIF assets are **GLB only** because FBX/loose textures/custom shader resources belong to subsequent implementation phases. The format does not magically enable unsupported asset types.
- XZ checksums detect accidental corruption, not authenticity. Trusted-code approval remains essential.
- Project worker processing does not fix the existing main-thread GLB parser/GPU upload path. No stall-free model import claim is made for this milestone.

## Codec and portability

The browser, Bun and Electron paths share a pinned WASM codec, with no system `xz` dependency. `node-liblzma@5.1.3` has a mismatched inline WASM artifact; `xz.ts` instead initializes its exported glue with its matching binary, encoded in `xz-binary.ts`. The dependency is pinned exactly, and both Bun round trips and browser/production Electron worker execution are tested.

The byte array can be regenerated from the matching package binary at `node_modules/node-liblzma/lib/wasm/liblzma.wasm`; rebuild the app after replacing the codec. Do not substitute a binary from a different build without its matching glue. See [third-party notices](../THIRD_PARTY.md) and the included LGPL license. The upstream source/build instructions are at https://github.com/oorabona/node-liblzma/tree/v5.1.3 (or the npm package's corresponding release if the tag spelling changes).

## Validation

Six dedicated archive tests cover real XZ magic, script/model round trips, invalid manifest/resources, traversal/duplicates/checksums/truncation, corrupt/concatenated streams and expansion-budget rejection. Browser tests exercise worker open/save, Ctrl+S, cancellation, error recovery and trust revocation. Linux Electron tests exercise the production worker bundle and binary save IPC. System `xz -t` and `tar -tJf` independently recognize the output.

This project-format milestone is packaged as **0.5.1**, independently of the remaining 0.6 roadmap. The 0.5.0 desktop packages do **not** contain it. Windows execution and physical Radeon testing remain unverified.
