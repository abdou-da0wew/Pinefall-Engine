import { resolve } from "node:path";
import { chmod } from "node:fs/promises";
const root = resolve(import.meta.dirname, "..");
const result = Bun.spawnSync(["git", "rev-parse", "--show-toplevel"], {
  cwd: root,
  stdout: "pipe",
  stderr: "pipe",
});
if (result.exitCode !== 0 || resolve(result.stdout.toString().trim()) !== root) {
  console.log("Git hook setup skipped: this source directory is not its own Git working tree.");
} else {
  const old = Bun.spawnSync(["git", "config", "--get", "core.hooksPath"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  })
    .stdout.toString()
    .trim();
  if (old && old !== ".githooks")
    throw Error(
      "Existing hooksPath preserved (" + old + "); integrate the co-author hook manually.",
    );
  await chmod(resolve(root, ".githooks/commit-msg"), 0o755);
  const configured = Bun.spawnSync(["git", "config", "--local", "core.hooksPath", ".githooks"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (configured.exitCode) throw Error("Could not configure repository hook path");
  console.log("Enabled tracked commit-msg co-author hook for this repository.");
}
