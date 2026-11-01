# PIF project containers — legacy PIF1–7 and native PIF8

**Native folder backups use streamed raw PIF8. Legacy scene/browser/export writers select PIF7 for graphics, v6 for audio, v5 for animator/root-motion, v4/v3 for provenance and v2 otherwise; legacy readers support v1–v7.** PIF8 currently has its own native Open raw folder PIF action. Older applications cannot read newer formats. The following manifest/resource discussion describes the legacy format unless explicitly labeled PIF8; the native raw format is documented below.

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
- Legacy saving captures the adopted authored scene, not runtime changes. Native folder saving captures working-folder files, including unapplied drafts. Local recovery uses reference-backed checkpoints; it is not a substitute for the working directory or portable backup.

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

- Legacy: 512 MiB compressed input and expanded TAR, 64 MiB XZ decoder dictionary budget. Native PIF8 uses the same archive-size ceiling and a 256 MiB decoder memory limit. Expanded output is bounded **inside the WASM decode call**, not merely checked after unbounded decompression.
- Strict regular-file USTAR subset; no links, directories, absolute/traversal paths, duplicate paths, prefixes, PAX/GNU extensions, concatenated XZ streams, or unreferenced resources. A `.pif` created with arbitrary external TAR options may therefore be rejected despite being a valid general TAR archive.
- Validate manifest/version, resource references, headers/checksums, full XZ consumption, GLB structure and the existing scene schema before adoption.
- Existing limits on scene entities, GLBs and scripts still apply. Runtime model artifacts are GLB; supported archives also retain original model/companion sources, audio, TypeScript and shader resources. Archiving a file does not make its format executable or renderable.
- XZ checksums detect accidental corruption, not authenticity. Trusted-code approval remains essential.
- Model parsing/conversion uses workers and budgeted preparation. GPU uploads and driver compilation still have main-thread/driver costs; no universal stall-free guarantee is claimed.

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

The update command validates and rewrites the archive and all integrity hashes atomically. Title follows the scene name. Save source in the external IDE; Apply separately controls adoption into the runtime.

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

50 tests / 190 assertions pass, including modifications to scene/script/asset/metadata bytes, missing proof, changed root, unsupported metadata/reader versions, fully resealed replacement versus trusted digest, legacy strict-mode rejection and existing XZ expansion limits. Browser worker save/open/cancel/trust tests and Linux Electron production-bundle save/load pass. Windows execution and physical Radeon hardware remain untested. See the 0.5.2 release page for publication status and packages.

## Asset-provenance extension: PIF v3 (0.5.3)

Projects containing the new `Asset.import` provenance record are written with manifest
`version: 3, minimumReader: 3`. Projects without provenance continue to write v2.
Readers accept v1/v2/v3; existing v1 legacy/trust rules remain unchanged. A v0.5.2
reader cannot read v3 and must not be used to overwrite the only project copy.

A v3 asset keeps its cooked self-contained `assets/N.glb` and adds indexed
`sources/N-M.bin` entries containing the exact original model/companion bytes.
The asset's inert import metadata records format, recipe version, revision,
source filenames/hashes, cooked artifact hash, inspection report and subasset IDs.
`scene.json` contains file references, not embedded base64 for either resource kind.
Every file is covered by the existing SHA-256 integrity inventory/root; source and
artifact hashes are also verified against their metadata before adoption. Hashes
remain consistency evidence, **not publisher signatures or script trust**.

Legacy bounds are 512 MiB compressed/expanded, a 64 MiB XZ dictionary budget and 100 entries. A project exceeding entry limits is rejected before writing an
unreadable archive. The in-memory/legacy JSON scene adapter still uses data URIs;
reference-only working documents and the persistent content-addressed artifact cache are implemented. Undo/checkpoints retain references rather than repeating whole asset strings.

## v4 normalized provenance

Recipe version 2 contains validated unit multiplier/output-axis settings. Provenance version 2 includes node, mesh and skeleton identity records as well as materials/clips. These semantics require manifest `version: 4` / `minimumReader: 4`; attempting to reseal this provenance inside v3 is rejected. Original sources remain separate archive files and the cooked asset remains a self-contained GLB. The existing integrity inventory covers both. Scene reference documents are materialized only at portable export boundaries; they are not interchangeable with a PIF archive.

## PIF6 authored audio extension

Audio-bearing scene3 projects write PIF6 (minimum reader6); non-audio animator projects remain PIF5. The audio definition and marker→cue bindings are validated with the scene. Each PCM16 WAV is a separate `audio/<index>.wav` member covered by the integrity inventory, not an ad hoc unverified payload. Downgrading an audio project to an older manifest rejects. Session SHA-256 blob references are materialized for transport and re-interned on opening; audio is included in recovery/worker blob inventories. See [AUTHORED-AUDIO.md](AUTHORED-AUDIO.md) for admission limits and codec restrictions. PIF integrity does not authenticate the project author or make trusted scripts safe to execute.

## Disk-backed sessions in 0.6.2

Portable export materializes and verifies disk references in the worker; machine-local references are not written into portable archives. Writer metadata follows the application version. See [disk storage and capacity limits](DISK-ASSETS.md).

## Native raw-folder PIF8 checkpoint

Folder-backed Save project now creates a streaming PIF8 archive. Use **Project → Project files & external tools → Open raw folder PIF** to extract it into an empty directory; the existing legacy Open project path is still for PIF1–7. Native repacking supports manual, interval and settled-change modes and a customizable shortcut. Recent folders and destinations are persisted locally.

PIF8 is XZ-compressed TAR with a `folder.json` index and separate `files/N.bin` entries. The index records original relative paths, byte counts and SHA-256 digests. It preserves invalid JSON, unapplied code and unregistered files rather than serializing only the last valid runtime. Hidden files and `node_modules` are excluded; the destination archive must be outside the working directory. Limits are 512 MiB compressed/expanded, 10,000 files, a 4 MiB index and confined portable paths. The codec is worker-isolated and pull-based with 64 KiB chunks; decoder memory is limited to 256 MiB. Hashes and XZ checksums are not signatures or an authenticity guarantee.

The legacy browser/export/snapshot codec remains PIF7 with its existing memory/entry constraints. PIF8 extraction does not execute code or implicitly Apply a pending working folder.
