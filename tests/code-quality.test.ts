import { test, expect } from "bun:test";

test("Prettier alone owns formatting; both linters and formatting gate check", async () => {
  const pkg = await Bun.file("package.json").json();
  const biome = await Bun.file("biome.json").json();
  expect(pkg.scripts.format).toBe("prettier --write .");
  expect(pkg.scripts["format:check"]).toBe("prettier --check .");
  expect(pkg.scripts.lint).toContain("lint:oxlint");
  expect(pkg.scripts.lint).toContain("lint:biome");
  expect(pkg.scripts.check).toContain("format:check");
  expect(pkg.devDependencies.oxfmt).toBeUndefined();
  expect(await Bun.file(".oxfmtrc.json").exists()).toBe(false);
  expect(biome.formatter.enabled).toBe(false);
  expect(biome.assist.enabled).toBe(false);
  expect(biome.linter.enabled).toBe(true);
  expect(biome.linter.rules.preset).toBe("recommended");
  expect((await Bun.file(".vscode/settings.json").json())["editor.defaultFormatter"]).toBe(
    "esbenp.prettier-vscode",
  );
});
