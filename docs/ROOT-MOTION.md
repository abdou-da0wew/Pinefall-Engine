# Root motion: supported profile and verification

Implemented 2026-10-31 as a Plan02 continuation. **Production audio and the combined AA6 tutorial are still unfinished.**

## Try the owned fixture

Open `examples/projects/root-motion-lab.pif` in the editor. It contains an original, minimal skinned-triangle GLB with two metres of forward travel per second, a ground collider and a wall. It is a mathematical rig fixture, not a finished character-art demo.

1. Select `walk.glb` in the hierarchy.
2. Use **Inspect root path** to open the on-demand modal. It has clip selection, a scaled X/Z trajectory, start/end indicators, Escape dismissal and focus restoration. It does not seek the live character or emit markers.
3. Close the modal and Play. The capsule moves toward the wall; its animation clock continues while collision correction limits physical travel. Stop restores the authored scene.

The root-path inspector shows desired animation travel, not achieved physics distance. No new controls were added to the asset-library strip. The requested shared-control/layout refactor remains after Plan02.

## Authoring contract

An animator can opt in with:

```json
"rootMotion": { "node": "Bone" }
```

`node` must identify exactly one node in the imported rig. Missing/ambiguous nodes fail binding; a renamed node requires explicit repair. Clip recipes continue to use retained imported subasset IDs. No automatic retargeting or guessed root selection is performed.

The entity must be a root-level, upright, nonsensor **kinematic capsule** with positive uniform scale. Use the existing `character` behavior, or a custom controller, to supply gravity/jumping. Animation does not integrate vertical body movement. Vertical bone bob and non-yaw rotation remain in the displayed pose.

The root's ancestors inside the imported model must be static and positively, uniformly scaled. Animated ancestors and nonuniform ancestor scales reject explicitly rather than extracting incorrect motion. The same checks run in graphical and headless model binding. Dynamic-body, ragdoll, arbitrary-parent/shear and retargeted root motion are not part of this profile.

## Mathematical and ownership semantics

- Original track interpolation is retained, including glTF cubic tangents. Trims are sampling intervals, not rewritten tracks.
- Planar rigid transforms contain X/Z translation and yaw. Composition/inversion handles loop displacement and turning; integer loop powers are bounded and calculated logarithmically, not by an unbounded loop.
- Root deltas use previous/current clock cursors after transition selection. Seeking/resetting changes the baseline without teleporting the body by the entire clip displacement. Nonloop completion stops adding displacement. Reverse motion is supported without inventing reverse gameplay markers.
- A 1D blend weights the current clips' relative deltas. Crossfades use the average target fade weight over the tick. The frozen outgoing pose contributes no continuing velocity; interrupted fades do not accumulate source layers or a large positional catch-up correction.
- Extracted horizontal/yaw motion is removed from the displayed rig. Otherwise the bone and capsule would both move, producing double travel.
- Movement is a proposal, not an entity-transform write. Fixed scripts submit controller movement; root motion replaces horizontal movement/yaw and preserves controller-owned vertical movement. Physics resolves proposals in stable order before one Rapier step, synchronizes authoritative transforms, then dispatches contacts and animation markers.
- Root-motion pause/overflow/failure proposes zero horizontal motion, so ordinary movement input cannot accidentally take over its horizontal authority.
- Requests are bounded: 256 root cycles per advance; 50 model metres per root delta and 50 world metres per controller root proposal. Exceeding a root limit disables that animator with a diagnostic rather than applying an unbounded displacement.

### Newly admitted collider correction

Installed Rapier 0.19 declarations expose no independent broad-phase refresh operation. A regression test showed that the very first controller request could miss a nearby freshly created wall, before `world.step()` updated the broad phase.

The physics adapter now conservatively sweeps directly against newly admitted nonsensor colliders for that tick, respecting bilateral collision groups and coarse bounding-sphere rejection. It clamps the proposal before normal controller resolution, **without a second physics step**. New colliders leave this special set after the step. Full sliding/autostep behavior resumes with the refreshed broad phase on the next tick; the admission tick deliberately favors stopping over sliding around a newly created obstacle.

This also protects against walls spawned during Play. There is no hidden zero-time warm-up step or extra gravity integration.

## Evidence

- Full unit suite: **114 tests / 567 assertions / 21 files**, passing.
- TypeScript and Oxlint: passing, 147 files.
- Root tests cover planar inverse/turn loops, normalized blending, interrupted fades, trim/cubic fidelity, seek/reverse/reset, vertical bob, visual compensation, unsupported bindings/profile rejection, PIF persistence, wall blocking, newly loaded walls and walls spawned during Play.
- Browser graphical/headless fixture: both stop at **Z = 2.3750224113464355**, in front of a wall whose front face is Z = 2.75. Capsule radius is 0.35, with controller skin clearance.
- Browser tests: bad root binding retains the prior live world and releases staging reservations; **100 root-motion Play/Stop cycles** retain the same admitted-memory accounting.
- Browser editor: PIF loading, native-dialog focus/Escape behavior, root-path inspection and Play/Stop pass.
- Linux Electron smoke test: current desktop build loads the PIF, opens the modal and runs Play/Stop under Xvfb/SwiftShader without page errors.
- Standalone web export smoke: exported scene/worker assets load and the renderer runs without page errors.
- Existing asset-worker/editor-recovery and runtime browser suites pass. The fault-injection test targets the actual live physics constructor so Vite HMR cache-busting cannot bypass the injected failure.

The Electron test is not physical Linux GPU/audio QA, native Windows execution or a packaged release certification. The export smoke is not the unfinished combined animation/audio tutorial acceptance. Memory checks concern admission accounting, not a hard RSS/GPU cap. Existing large-bundle warnings remain.

Reproduce with `bun test tests`, `bun run check`, `bun tests/root-motion-browser.ts`, and, after `bun run desktop:build`, `TEST_NATIVE=1 xvfb-run -a bun tests/root-motion-browser.ts`.
