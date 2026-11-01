# Third-party UI assets

Phosphor Icons — https://phosphoricons.com/ and https://github.com/phosphor-icons/react

Package: `@phosphor-icons/react` 2.1.10. License: MIT.

The original Phosphor license is included below. Icons are bundled locally as SVGs; the original artwork has not been represented as our own.

MIT License

Copyright (c) 2020 Phosphor Icons

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

## XZ project codec (unreleased PIF milestone)

`node-liblzma` 5.1.3: https://github.com/oorabona/node-liblzma — LGPL-3.0, full license in `docs/licenses/node-liblzma-LGPL-3.0.txt`. The matching liblzma WASM binary is encoded in `packages/project/src/xz-binary.ts`; its loader/glue remains the pinned dependency. Source and build instructions are available from the upstream release/npm source package. The application source permits rebuilding/replacing the codec; see `docs/PIF.md`. No native addon or system xz installation is used by the project codec.

## Shared editor UI primitives (0.6.1)

Pinefall owns its editor components and CSS; this uses the shadcn-style source ownership approach, not the shadcn CLI or a Tailwind runtime. Accessible menus use `@radix-ui/react-dropdown-menu`2.2.1 (MIT). Variants use `class-variance-authority`0.7.1 (Apache-2.0), and class composition uses `clsx`2.1.1 (MIT). Their bundled dependency notices are included in `docs/licenses/ui-primitives-notices.txt`, also shipped in desktop packages. Icons/fonts remain locally bundled. No UI CDN or marketplace network service is required.
