# Plan 01 acceptance status — 0.6.0 candidate

The owner's instruction is to continue, not stop at another partial release. **This file does not certify 100% completion.** It records actual code/tests and identifies evidence that cannot be produced by a software-rendered Linux sandbox.

| Area | Implemented behavior / executed evidence | Acceptance still required |
|---|---|---|
| A0 | Stage/correlation logging, accounted-memory metrics, physical-test collector for frame/input feedback distributions and sampled process working sets | Physical low/high target baselines; measured decoder/GPU peaks and agreed latency limits |
| A1 | Reference working documents, immutable blobs, persistent artifacts/recovery, versioned normalized recipes, source/artifact graph and transactional topological scheduler | Future asset kinds use the scheduler API; material/audio/prefab authoring belongs to companion plans |
| A2 | Cancellable workers, bounded queues/reservations, complete replacement-world staging; physics/clone/pressure/late-generation fault injection; PIF worker admission and binary transfer | Reservations are conservative estimates, not an OS-enforced process memory cap |
| A3 | One parse for 100 instances, independent skeleton clones, geometry/texture/entity staging slices, lease/reservation plateau over 100 load cycles | Physical context-loss/shader/driver stress and worst-case frame behavior; individual driver calls and ObjectLoader reconstruction remain non-preemptible |
| A4 | Explicit unit/output-axis controls; real Blender and Maya rigs compared to five independent OBJ poses; embedded-texture and morph-character conversions; bounded importer warnings | Independent human review of edited textured characters and broad exporter/material/constraint fidelity, not universal losslessness |
| A5 | Node/mesh/skeleton/material/clip identities, source-ID preference, explicit ambiguous mapping, bounded review UI, stored-source/companion reimport, transform preservation, recipe undo/redo/PIF roundtrip | Artist verifies intended identity mapping when source IDs disappear or semantic ownership changes |
| A6 | Working CLI FBX through the editor's exact worker; normalized GLB/FBX cooked hashes match editor; PIF v4 downgrade rejection; standalone export | Windows native CI and physical owner report are recorded separately below |

## External evidence needed to finish acceptance

Run the actual packaged app on Windows and the physical CEDAR machine. Do not use software-test flags for hardware evidence:

```sh
bun scripts/hardware-acceptance.ts --executable /path/to/pinefall-engine --model /path/to/character.fbx --output build/cedar-acceptance.json
```

On Windows, use the extracted `Pinefall Engine.exe` path and `--output build/windows-acceptance.json`. Supply an embedded-texture FBX or self-contained GLB within documented budgets. The tool collects actual platform/version, GPU feature/device information, errors, input-to-next-frame/frame samples, long tasks and per-process memory samples. It deliberately leaves `hardwareAcceptance: false` until a person reviews the actual renderer, visual correctness and responsiveness. It never converts SwiftShader or CI success into physical GPU approval.

The separate `--software-test` mode is only for correctness harness validation. It explicitly uses software rendering and is not hardware evidence. No production sandbox relaxation was introduced.

Independent DCC evidence is in `docs/evidence/dcc-0.6.0.json`; input hashes and reference URLs are in the fixture manifest. One earlier CLI transport experiment expanded every byte into protocol JSON numbers and the process was killed; that path was replaced with binary loopback transfer before the successful independent-fixture runs. Large out-of-budget files are explicit rejections, not hidden passes.

## CI / release status

The desktop CI workflow builds and runs packaged Linux/Windows worker/PIF checks and writes explicitly software-labelled evidence. It no longer races the verified publisher to overwrite release checksums. No Windows success is claimed until the remote job has actually completed. Publication and exact commit/test evidence are updated after validation; the prior published release remains usable meanwhile.
