# Custom color editor — 0.4.1

The Material color and Light color controls now open Pinefall's custom picker. It is rendered outside the inspector's clipping/scroll container and positioned against the actual window bounds. It flips above the control when necessary, clamps to the edges, and scrolls internally in short windows. Resize and scroll events reposition it.

- Drag in the color field to change saturation and brightness.
- Drag the hue slider, enter three/six-digit HEX, or edit RGB channels (whole numbers 0–255).
- Choose a Pinefall palette swatch. Click the original color thumbnail to restore the starting color.
- The thumbnails preview the original and proposed color; **the 3D scene changes only on Apply**. This avoids reloading the scene for every pointer movement and creates one Undo entry.
- **Cancel, Escape, closing the picker, or clicking outside** discards the draft.
- Tab stays inside the open picker. Arrow keys adjust the saturation/brightness field; hold Shift for larger steps. The hue slider uses normal keyboard slider controls. Enter in the HEX field applies a valid color.
- Invalid input disables Apply and shows an explanation. There is no alpha slider because the current scene schema and materials use opaque RGB colors.

Tests cover conversion/validation, near-edge and short-window positioning, resize, material and light editing, keyboard control, palette selection, cancel and one-step Undo. Browser graphics checks use SwiftShader, not physical GPU hardware.

This is a local patch; published 0.4.0 binaries retain the previous picker.

Validation: 31 tests / 106 assertions, TypeScript and Oxlint pass. The browser color-picker suite and packaged Linux picker test pass, including bounds and Apply. Windows packaging completed; Windows execution and physical-GPU behavior remain unverified. Phosphor imports now target only used icons to reduce build memory, and generated build folders are excluded from development file watching.
