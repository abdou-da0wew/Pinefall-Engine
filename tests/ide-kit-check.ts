import "../scripts/prepare-sdk";
import { mkdtemp, rm } from "node:fs/promises";
import { resolve, join } from "node:path";
import { expect } from "bun:test";
import { DiskWorkspace } from "../packages/project/src/disk-workspace";
import { installIdeKit } from "../packages/project/src/ide-kit";
const root = await mkdtemp(resolve("build/portable-ide-"));
const disk = await DiskWorkspace.open(root);
try {
  await Bun.write(
    join(root, "scene.json"),
    JSON.stringify({
      scripts: [
        { name: "Main.ts", file: "scripts/main-id.ts" },
        { name: "Helper.ts", file: "scripts/helper-id.ts" },
      ],
    }),
  );
  await Bun.write(join(root, "scripts/helper-id.ts"), "export const amount: number = 3;");
  const valid =
    "import {Script} from '@pinefall/sdk'; import {amount} from '@game/Helper'; export default class Main extends Script {start(){this.ctx.object.rotation.y = amount; this.ctx.graphics.setPost({bloom:true});}}";
  await Bun.write(join(root, "scripts/main-id.ts"), valid);
  const kit = await Bun.file("build/sdk/manifest.json").json();
  await installIdeKit(disk, kit);
  const check = async () => {
    const process = Bun.spawn(
      [
        "bun",
        resolve("node_modules/typescript-language-service/bin/tsc"),
        "-p",
        join(root, "tsconfig.json"),
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    return {
      code: await process.exited,
      output:
        (await new Response(process.stdout).text()) + (await new Response(process.stderr).text()),
    };
  };
  expect(await check()).toEqual({ code: 0, output: "" });
  await Bun.write(join(root, "scripts/main-id.ts"), valid.replace("bloom:true", "bloom:'bad'"));
  const broken = await check();
  expect(broken.code).not.toBe(0);
  expect(broken.output).toContain("TS2322");
  await installIdeKit(disk, kit);
  await Bun.write(join(root, "pinefall-sdk/README.md"), "user edit");
  await expect(installIdeKit(disk, kit)).rejects.toThrow("Modified SDK file preserved");
  expect(await Bun.file(join(root, "pinefall-sdk/README.md")).text()).toBe("user edit");
  console.log(
    "PASS portable IDE SDK: offline external compiler, actual SDK/Three types, hashed filename aliases, diagnostics and preservation of user edits",
  );
} finally {
  await disk.close();
  await rm(root, { recursive: true, force: true });
}
