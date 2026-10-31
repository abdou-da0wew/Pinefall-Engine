/** Explicit publication command. Credentials come only from the process environment. */
import { readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
const repository = "abdou-da0wew/Pinefall-Engine";
const versions = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
if (!versions.length) versions.push("0.5.4");
if (versions.some((v) => !/^\d+\.\d+\.\d+$/.test(v)))
  throw Error("Expected release version numbers");
const checkOnly = process.argv.includes("--check");
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
function git(...args: string[]) {
  const p = Bun.spawnSync(["git", ...args], {
    stdout: "pipe",
    stderr: "pipe",
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      ...(token
        ? {
            GIT_CONFIG_COUNT: "1",
            GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
            GIT_CONFIG_VALUE_0:
              "AUTHORIZATION: basic " + Buffer.from("x-access-token:" + token).toString("base64"),
          }
        : {}),
    },
  });
  if (p.exitCode !== 0)
    throw Error("Git operation failed: " + args[0] + " (no credentials logged)");
  return p.stdout.toString().trim();
}
const sha = (data: Uint8Array) => createHash("sha256").update(data).digest("hex");
interface Asset {
  id: number;
  name: string;
  size: number;
  digest?: string;
  url: string;
}
interface Release {
  id: number;
  draft: boolean;
  html_url: string;
  upload_url: string;
  assets: Asset[];
}
async function api<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  const response = await fetch("https://api.github.com/repos/" + repository + path, {
    method,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) throw Error(`GitHub ${method} ${path}: HTTP ${response.status}`);
  return (await response.json()) as T;
}
const ready = [];
for (const version of versions) {
  const tag = "v" + version,
    commit = git("rev-parse", tag + "^{commit}"),
    dir = "build/publish/" + tag;
  const names = (await readdir(dir)).filter(
    (name) => name !== ".DS_Store" && name !== "receipt.json",
  );
  const sums = await Bun.file(dir + "/SHA256SUMS-" + version + ".txt").text();
  for (const line of sums.trim().split("\n")) {
    const [expected, name] = line.split("  ");
    if (!name || name.includes("/") || sha(await Bun.file(dir + "/" + name).bytes()) !== expected)
      throw Error("Asset checksum mismatch: " + name);
  }
  if (names.length !== 5) throw Error("Expected five release assets");
  ready.push({ version, tag, commit, dir, names });
  console.log("Verified local release " + tag + " at " + commit);
}
if (checkOnly) {
  console.log("Check only: no network requests or publication.");
  process.exit(0);
}
if (!token)
  throw Error(
    "Set GITHUB_TOKEN or GH_TOKEN with repository Contents: read/write permission. No token is stored.",
  );
const repo = await api<{ permissions?: { push?: boolean } }>("");
if (!repo.permissions?.push) throw Error("Token lacks push permission for " + repository);
if (git("rev-parse", "HEAD") !== ready.at(-1)!.commit)
  throw Error("HEAD must match the last prepared release tag");
// No force pushes. Existing divergent remote history/tags cause git to stop.
git(
  "push",
  "https://github.com/" + repository + ".git",
  "HEAD:refs/heads/main",
  ...ready.map((r) => "refs/tags/" + r.tag),
);
for (const release of ready) {
  const existing = (await api<Release[]>("/releases?per_page=100")).find((r) =>
    r.html_url.endsWith("/" + release.tag),
  );
  let remote: Release =
    existing ||
    (await api<Release>("/releases", "POST", {
      tag_name: release.tag,
      target_commitish: release.commit,
      name: "Pinefall Engine " + release.version,
      body: await Bun.file("docs/RELEASE-" + release.version + ".md").text(),
      draft: true,
      prerelease: false,
    }));
  if (!remote.draft) {
    console.log("Already published; refusing to modify " + remote.html_url);
    continue;
  }
  for (const name of release.names) {
    const file = Bun.file(release.dir + "/" + name),
      bytes = await file.bytes(),
      digest = "sha256:" + sha(bytes);
    let asset = remote.assets.find((a) => a.name === name);
    if (!asset) {
      const response = await fetch(
        remote.upload_url.split("{")[0] + "?name=" + encodeURIComponent(name),
        {
          method: "POST",
          headers: {
            Authorization: "Bearer " + token,
            "Content-Type": name.endsWith(".zip")
              ? "application/zip"
              : name.endsWith(".txt")
                ? "text/plain"
                : "application/octet-stream",
          },
          body: bytes,
        },
      );
      if (!response.ok) throw Error("Asset upload failed: " + name + " HTTP " + response.status);
      asset = (await response.json()) as Asset;
    }
    if (asset.size !== bytes.length) throw Error("Uploaded size mismatch: " + name);
    if (asset.digest) {
      if (asset.digest !== digest) throw Error("Uploaded hash mismatch: " + name);
    } else {
      const response = await fetch(asset.url, {
        headers: { Authorization: "Bearer " + token, Accept: "application/octet-stream" },
      });
      if (!response.ok || sha(new Uint8Array(await response.arrayBuffer())) !== sha(bytes))
        throw Error("Download verification failed: " + name);
    }
    console.log("Verified upload " + name);
  }
  remote = await api<Release>("/releases/" + remote.id, "PATCH", {
    draft: false,
    make_latest: release.version === versions.at(-1) ? "true" : "false",
  });
  console.log("Published " + remote.html_url);
  await Bun.write(
    "build/publish/" + release.tag + "/receipt.json",
    JSON.stringify(
      { url: remote.html_url, tag: release.tag, commit: release.commit, published: !remote.draft },
      null,
      2,
    ),
  );
}
