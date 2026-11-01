# Standing release and user-testing workflow

Project-owner instruction, recorded 2026-10-31:

1. After each completed update or major edit, run appropriate checks and prepare a new versioned release. Do not silently accumulate multiple major updates without providing a downloadable checkpoint.
2. Update version strings, changelog, compatibility notes, known limitations and test evidence. A partial roadmap milestone must be labelled partial; experimental features must remain labelled experimental.
3. Build Linux x86-64 and Windows x64 desktop artifacts; test what can actually be run. Report untested platforms/hardware honestly. Do not disable the production Electron sandbox to satisfy a GPU test.
4. Commit the intended source/docs, tag the exact commit, and push without force. Package exact source, platform artifacts, release notes (and a useful sample when applicable), and SHA-256 checksums.
5. Upload as a draft, verify asset sizes/digests, then publish and verify the public release. Do not claim publication while authentication, build, upload or verification is blocked.
6. Give the owner download links and concise test instructions. Pause for their download/test feedback before starting the next feature or task.

## Credentials

The owner authorizes use of their GitHub authentication for this workflow. Tokens are supplied only to the current process environment; never store them in repository files, Git config/remotes, shell startup files, release assets or this policy. Do not print them. Respect the owner’s instruction not to request a replacement token or advise revocation. If authentication is unavailable, report the publication state accurately rather than claiming success. No permanent token retention is promised.

This policy covers Pinefall Engine updates, not unrelated repositories or deletion/rewriting of existing releases. Existing published releases are left intact.

## Owner override for Plan 01 finalization

The owner explicitly superseded release-and-pause for this task: continue through remaining Plan 01 implementation instead of stopping at another partial release. Keep validation/version/publication requirements, but do not treat publishing a checkpoint as completion or a reason to halt. Physical Windows/CEDAR and independent-developer acceptance still require genuine external evidence. Do not fabricate that evidence or remove gates to obtain a 100% label.

## Current release and attribution

The latest published development pre-release is v0.6.3-dev.2; see [current status](CURRENT-STATUS.md). Use `bun run hooks:install` so ordinary local commits include the configured DiveeAgent co-author. Do not rewrite published history to add trailers. The owner has requested continuing the completion work: a checkpoint release is not a reason to stop or claim all gates complete.

## 0.7.0 source update

Texture/UV/packing/per-slot authoring, external HDR and advanced scattering are now implemented. Native opening additionally supports portable PIF9; raw-folder backups remain PIF8. See [current status](CURRENT-STATUS.md) and [graphics authoring](GRAPHICS-AUTHORING.md) for the current contract and release state; older checkpoint descriptions above are historical.
