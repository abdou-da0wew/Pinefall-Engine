export const COAUTHOR = "DiveeAgent <270451464+DiveeAgent@users.noreply.github.com>";
/** Use Git's trailer parser to preserve other authors, comments and existing trailers. */
export async function addCoauthorTrailer(path: string) {
  if (!path || !(await Bun.file(path).exists())) throw Error("Commit message file missing");
  const result = Bun.spawnSync(
    [
      "git",
      "interpret-trailers",
      "--in-place",
      "--if-exists",
      "addIfDifferent",
      "--if-missing",
      "add",
      "--trailer",
      "Co-authored-by: " + COAUTHOR,
      "--",
      path,
    ],
    { stdout: "pipe", stderr: "pipe" },
  );
  if (result.exitCode !== 0) throw Error(result.stderr.toString());
}
