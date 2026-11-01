import { test, expect } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { addCoauthorTrailer, COAUTHOR } from "../scripts/commit-coauthor";
test("commit-msg adds exactly one requested co-author and preserves other trailers", async () => {
  const directory = await mkdtemp(join(tmpdir(), "pinefall-trailer-"));
  try {
    for (const message of [
      "feat: example\n",
      "fix: example\n\nCo-authored-by: Other <other@example.com>\n",
      "fix: amended\n\nCo-authored-by: " + COAUTHOR + "\n",
      "fix: commented\n\n# Git template comment\n",
    ]) {
      const path = join(directory, "COMMIT_EDITMSG");
      await Bun.write(path, message);
      await addCoauthorTrailer(path);
      await addCoauthorTrailer(path);
      const output = await Bun.file(path).text();
      expect(output.split("Co-authored-by: " + COAUTHOR).length - 1).toBe(1);
      expect(output).toContain(message.split("\n")[0]);
      if (message.includes("Other"))
        expect(output).toContain("Co-authored-by: Other <other@example.com>");
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
