import { test, expect } from "bun:test";
import { version } from "../package.json";
test("current docs identify the release and do not resurrect removed editor/old budget claims", async () => {
  const readme = await Bun.file("README.md").text();
  expect(readme).toContain(version);
  for (const path of [
    "README.md",
    "docs/SCRIPTING.md",
    "docs/SHORTCUTS.md",
    "docs/CREATING-GAMES.md",
    "docs/PIF.md",
    "docs/DISK-ASSETS.md",
    "docs/GRAPHICS-SDK.md",
    "docs/GRAPHICS-AND-LARGE-MODELS-STATUS.md",
  ]) {
    const text = await Bun.file(path).text();
    for (const obsolete of [
      "click **Save script**",
      "this first editor uses a plain text",
      "PMREM environment and actual volumetric scattering remain unimplemented",
      "Maximum 2 MB per imported model",
      "Current limits remain 4 MB",
      "not a newly published release",
      "The editor's Player link opens a stock template",
    ])
      expect(text.toLowerCase()).not.toContain(obsolete.toLowerCase());
  }
});
