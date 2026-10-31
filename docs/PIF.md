# PIF project container — v2 metadata and integrity (0.5.2-dev)

**The published 0.5.1 release writes PIF v1. Current development writes PIF v2 and still reads v1. PIF v2 is not yet published; 0.5.1 cannot open v2 projects. The broader graphics/import overhaul remains pending.**

A `.pif` is a real **XZ-compressed USTAR archive**, using LZMA2 preset 6 and CRC64. Higher presets are not automatically better for already compressed textures and require substantially more memory. Compression ratio depends on project content.

```
My Game.pif
  project.json          format version, reader version, project/editor metadata
  integrity.json        SHA-256 inventory and canonical root hash
  scene.json            definition and resource references
  assets/0.glb          actual binary model, with its existing embedded textures
  scripts/0.ts          actual TypeScript source
```

Manifest v2 has `format: "pinefall-project"`, `version: 2`, `minimumReader: 2`, `scene: "scene.json"` and a validated `project` metadata object. The metadata is inside the archive, not inode extended attributes, so it survives copies, downloads and different filesystems.

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

## Portable project and editor metadata

`project.json.project` stores:

- `schemaVersion: 1` (metadata schema, separate from the PIF container version).
- `id`: stable UUID, retained through editor saves and open/save round trips.
- `title`, optional-content `description` and `author`, and `projectVersion` (a version belonging to the game, not to Pinefall).
- `createdAt` and `modifiedAt`: validated UTC ISO timestamps. Saving updates modification time, without changing creation time or identity.
- `editor`: Pinefall name/build version, scene schema version, last saved transform tool and shelf docking side. CLI defaults to `unspecified` layout.

Metadata has explicit length/type/version/date limits and rejects unknown fields. It never records a script-trust flag, machine ID, account name automatically, absolute local paths or credentials. Editor metadata records a small portable subset; it is not a complete workspace snapshot and does not automatically override personal editor preferences on import. A programmatic save of a scene without metadata generates an ID; retain the loaded metadata for subsequent saves. The editor initializes metadata once for newly created/opened legacy scenes.

```sh
bun run game metadata my-game.pif
bun run game metadata my-game.pif '{"author":"My Studio","description":"My game","projectVersion":"1.2.0"}'
```

The update command validates and rewrites the archive and all integrity hashes atomically. Title follows the scene name. Script source edits still require saving the script editor before saving the project.

## Embedded integrity proof

`integrity.json` contains `version: 1`, `algorithm: "SHA-256"`, a lexicographically path-sorted `entries` array, and `root`. Each entry is exactly `{path, size, sha256}`. The inventory covers every other archive file, including **project/editor metadata**, scene definitions, script sources and binary assets. The SHA-256 digest covers the exact file bytes. Missing, unexpected, duplicate and changed entries are rejected.

The root is SHA-256 of the UTF-8 JSON representation of the ordered entry array, with each entry's keys in `path`, `size`, `sha256` order, no whitespace. Verification reconstructs this canonical form rather than trusting arbitrary input key order. The proof excludes itself to avoid a self-referential hash. It protects the logical payload inventory, not incidental TAR header timestamps or a particular XZ encoding. XZ CRC64 and TAR checksums remain additional transport checks.

**This is integrity checking, not a digital signature or proof of authorship.** An attacker who replaces both content and hashes can create an internally valid project. It does not detect harmful-but-consistently-hashed scripts. Script trust approval is still mandatory.

## Verification and trusted hashes

```sh
# v2 integrity required; no silent legacy fallback:
bun run game verify-pif my-game.pif --require-integrity
# Also require a full-archive digest acquired through a separate trusted channel:
bun run game verify-pif my-game.pif --require-integrity --sha256 YOUR_TRUSTED_64_HEX_DIGEST
```

The verifier returns format version, integrity status, project metadata and SHA-256 of the entire compressed archive. It explicitly reports `authenticated: false` because no signature is verified. An external digest is useful only if its origin is trusted; fetching a replacement hash from the same compromised source is not protection.

API: `inspectProject(bytes, {requireIntegrity, expectedSha256})` returns `{scene, formatVersion, integrity, archiveSha256}`. `unpackProject` accepts the same options and returns the scene. `sceneFromFiles` is now asynchronous because it verifies SHA-256 before scene adoption. `projectFiles` is an unsealed payload builder; use `packProject` for a complete archive, or `sealProjectFiles` before advanced TAR packaging.

Legacy PIF v1 opens with `legacy-unverified` status via inspection. `requireIntegrity: true` rejects it, preventing a downgrade from v2 to an unhashed legacy container in strict pipelines. The default editor retains backward compatibility; it does not claim legacy imports are authenticated or hash-verified.

## Current validation

50 tests / 190 assertions pass, including modifications to scene/script/asset/metadata bytes, missing proof, changed root, unsupported metadata/reader versions, fully resealed replacement versus trusted digest, legacy strict-mode rejection and existing XZ expansion limits. Browser worker save/open/cancel/trust tests and Linux Electron production-bundle save/load pass. Windows execution and physical Radeon hardware remain untested. No new GitHub release has been made for this change.
