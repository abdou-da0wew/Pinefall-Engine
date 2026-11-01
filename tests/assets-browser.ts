import { enterEditor } from "./editor-navigation";
import { chromium, expect } from "@playwright/test";
import {
  triangle,
  simpleFbx,
  skinnedTriangle,
  texturedTriangle,
  binaryFbx,
  texturedFbx,
} from "./asset-fixtures";
const base = process.env.TEST_BASE_URL || "http://localhost:5173";
const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") console.error("browser:", m.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(base + "/tests/runtime.html");
  const result = await page.evaluate(
    async ({ bytes, fbx, skin, binary }) => {
      const runtimePath = "/packages/runtime/src/index.ts",
        projectPath = "/packages/project/src/index.ts",
        importPath = "/packages/assets/src/import.ts",
        cachePath = "/packages/assets/src/cache.ts";
      const { Engine } = await import(runtimePath),
        { createGame, importModel, placeModel } = await import(projectPath),
        { prepareImport } = await import(importPath),
        { ModelCache } = await import(cachePath);
      const check = (ok: boolean, message: string) => {
        if (!ok) throw Error(message);
      };
      const stages: string[] = [];
      const prepared = await prepareImport(
        [new File([new Uint8Array(bytes)], "triangle.glb")],
        new AbortController().signal,
        (u: { stage: string }) => stages.push(u.stage),
      );
      check(prepared.metadata.report.vertices === 3, "worker inspection");
      let scene = importModel(createGame("Instances"), "triangle.glb", new Uint8Array(bytes)).scene;
      for (let i = 0; i < 100; i++) scene = placeModel(scene, scene.assets[0].id).scene;
      const engine = await Engine.create(document.querySelector("canvas"));
      try {
        await engine.load(scene);
        check(engine.assetCache.metrics.parses === 1, "one parse for 100 instances");
        check(engine.assetCache.metrics.leases === 100, "100 owner leases");
        await engine.load(scene);
        check(engine.assetCache.metrics.parses === 1, "reload cache reuse");
        check(engine.assetCache.metrics.leases === 100, "no growing leases");
        const savedName = engine.document.name,
          bad = structuredClone(scene);
        bad.assets[0].data = "data:model/gltf-binary;base64,AAAA";
        let rejected = false;
        try {
          await engine.load(bad);
        } catch {
          rejected = true;
        }
        check(rejected && engine.document.name === savedName, "failed model retains world");
        // Use the actual constructor: Vite HMR can assign a cache-busting URL to dependencies.
        const PhysicsSystem = engine.physics.constructor;
        const assetMemory = engine.assetCache.budget;
        const beforeMemory = assetMemory.snapshot.used;
        const beforePhysics = engine.physics,
          beforeDocument = engine.document,
          beforeObjects = [...engine.objects.values()];
        const originalAdd = PhysicsSystem.prototype.add;
        let additions = 0;
        PhysicsSystem.prototype.add = function (e: unknown) {
          if (++additions === 3) throw Error("injected staged physics failure");
          return originalAdd.call(this, e);
        };
        rejected = false;
        try {
          await engine.load(scene);
        } catch {
          rejected = true;
        } finally {
          PhysicsSystem.prototype.add = originalAdd;
        }
        check(
          rejected && engine.physics === beforePhysics && engine.document === beforeDocument,
          "late construction rollback retains world identity",
        );
        check(
          [...engine.objects.values()].every((o, i) => o === beforeObjects[i]),
          "rollback retains live object bindings",
        );
        check(
          engine.assetCache.metrics.leases === 100 && !engine.loading,
          "rollback releases staging leases",
        );
        check(assetMemory.snapshot.used === beforeMemory, "failed world releases reservations");
        const pressure = assetMemory.reserve(
          assetMemory.snapshot.limit - assetMemory.snapshot.used - 1024,
          "test-pressure",
        );
        rejected = false;
        try {
          await engine.load(scene);
        } catch {
          rejected = true;
        } finally {
          pressure.release();
        }
        check(
          rejected &&
            engine.document === beforeDocument &&
            assetMemory.snapshot.used === beforeMemory,
          "pressure rejects without destroying active world: " +
            JSON.stringify({
              rejected,
              same: engine.document === beforeDocument,
              used: assetMemory.snapshot.used,
              beforeMemory,
            }),
        );
        const originalAcquire = engine.assetCache.acquireAsync.bind(engine.assetCache);
        let acquired = 0;
        engine.assetCache.acquireAsync = async (
          data: string,
          owner: string,
          signal: AbortSignal,
        ) => {
          if (owner.startsWith("entity:") && ++acquired === 3)
            throw Error("injected clone failure");
          return originalAcquire(data, owner, signal);
        };
        rejected = false;
        try {
          await engine.load(scene);
        } catch {
          rejected = true;
        } finally {
          engine.assetCache.acquireAsync = originalAcquire;
        }
        check(
          rejected &&
            engine.document === beforeDocument &&
            engine.assetCache.metrics.leases === 100,
          "clone failure rolls back partial new instances",
        );
        await engine.load(scene);
        check(engine.assetCache.metrics.leases === 100, "retry after staging failures");
        engine.play();
        const entity = structuredClone(scene.entities[2]);
        entity.id = crypto.randomUUID();
        engine.spawn(entity);
        check(engine.assetCache.metrics.leases === 100, "queued spawn has no lease yet");
        engine.fixed.run(engine);
        check(engine.assetCache.metrics.leases === 101, "spawn lease at boundary");
        engine.destroy(entity.id);
        check(
          engine.fixed.pendingDestroy.has(entity.id) && engine.assetCache.metrics.leases === 101,
          "pending destroy retains ownership until boundary",
        );
        engine.fixed.run(engine);
        check(engine.assetCache.metrics.leases === 100, "destroy lease at boundary");
        await engine.stop();
        const later = createGame("Winning scene");
        await Promise.all([engine.load(scene), engine.load(later)]);
        check(engine.document.name === "Winning scene", "latest load wins");
        check(engine.assetCache.metrics.leases === 0, "old instances released");
        const plateau = engine.assetCache.budget.snapshot.used;
        const single = structuredClone(scene);
        single.entities = single.entities.slice(0, 3);
        for (let i = 0; i < 100; i++) {
          await engine.load(single);
          await engine.load(later);
        }
        check(
          engine.assetCache.metrics.parses === 1 && engine.assetCache.metrics.leases === 0,
          "100 scene cycles plateau",
        );
        check(
          engine.assetCache.budget.snapshot.used === plateau,
          "100 cycles release world/instance reservations",
        );
      } finally {
        engine.dispose();
      }
      const skinCache = new ModelCache();
      try {
        const prep = await prepareImport(
          [new File([new Uint8Array(skin)], "rig.glb")],
          new AbortController().signal,
        );
        await skinCache.prepare(prep.data, new AbortController().signal);
        const a = skinCache.acquire(prep.data, "a"),
          b = skinCache.acquire(prep.data, "b");
        const ab = a.root.getObjectByName("Bone"),
          bb = b.root.getObjectByName("Bone");
        check(ab !== bb, "bones independently cloned");
        ab.position.y = 5;
        check(bb.position.y !== 5, "pose isolation");
        check(
          a.root.getObjectByName("Body").geometry === b.root.getObjectByName("Body").geometry,
          "geometry shared",
        );
        check(a.root.animations.length === 1, "clip preserved");
        a.release();
        check(bb.parent !== null, "second rig remains valid");
        b.release();
      } finally {
        skinCache.dispose();
      }
      const abort = new AbortController();
      const cancelled = prepareImport(
        [new File([new Uint8Array(bytes)], "cancel.glb")],
        abort.signal,
      ).then(
        () => false,
        () => true,
      );
      abort.abort();
      check(await cancelled, "abort rejects");
      const activeAbort = new AbortController();
      const activeCancelled = await prepareImport(
        [new File([fbx], "active.fbx")],
        activeAbort.signal,
        (u: { stage: string }) => {
          if (u.stage === "convert") activeAbort.abort();
        },
      ).then(
        () => false,
        () => true,
      );
      check(activeCancelled, "active converter cancellation");
      const converted = await prepareImport(
        [new File([fbx], "triangle.fbx")],
        new AbortController().signal,
      );
      const convertedBinary = await prepareImport(
        [new File([new Uint8Array(binary)], "triangle-binary.fbx")],
        new AbortController().signal,
      );
      check(convertedBinary.metadata.report.vertices === 3, "binary FBX conversion");
      check(
        converted.metadata.format === "fbx" && converted.metadata.report.vertices === 3,
        "actual FBX conversion",
      );
      const cache = new ModelCache();
      try {
        await cache.prepare(converted.data, new AbortController().signal);
        check(cache.metrics.parses === 1, "converted FBX loads");
      } finally {
        cache.dispose();
      }
      return { stages, fbx: converted.metadata.report, parses: 1, instances: 100 };
    },
    {
      bytes: [...triangle()],
      fbx: simpleFbx,
      skin: [...skinnedTriangle()],
      binary: [...binaryFbx()],
    },
  );
  const png = await page.evaluate(async () => {
    const c = document.createElement("canvas");
    c.width = 2;
    c.height = 2;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, 2, 2);
    const blob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b!)));
    return [...new Uint8Array(await blob.arrayBuffer())];
  });
  const texture = await page.evaluate(
    async (bytes) => {
      const projectPath = "/packages/project/src/index.ts",
        cachePath = "/packages/assets/src/cache.ts";
      const { importModel, createGame } = await import(projectPath),
        { ModelCache } = await import(cachePath);
      const data = importModel(createGame("Texture"), "texture.glb", new Uint8Array(bytes)).asset
        .data;
      const cache = new ModelCache();
      try {
        await cache.prepare(data, new AbortController().signal);
        const lease = cache.acquire(data, "texture");
        let dimensions: number[] = [];
        lease.root.traverse((o: { material?: { map?: { image: ImageBitmap } } }) => {
          if (o.material?.map)
            dimensions = [o.material.map.image.width, o.material.map.image.height];
        });
        lease.release();
        return dimensions;
      } finally {
        cache.dispose();
      }
    },
    [...texturedTriangle(new Uint8Array(png))],
  );
  expect(texture).toEqual([2, 2]);
  const companion = await page.evaluate(
    async ({ png, fbx }) => {
      const path = "/packages/assets/src/import.ts";
      const { prepareImport } = await import(path);
      const model = new File([fbx], "textured.fbx"),
        image = new File([new Uint8Array(png)], "albedo.png");
      const converted = await prepareImport([model, image], new AbortController().signal);
      let missing = false,
        ambiguous = false;
      try {
        await prepareImport([model], new AbortController().signal);
      } catch {
        missing = true;
      }
      try {
        await prepareImport(
          [model, image, new File([new Uint8Array(png)], "ALBEDO.PNG")],
          new AbortController().signal,
        );
      } catch {
        ambiguous = true;
      }
      return {
        sources: converted.metadata.sources.length,
        decoded: converted.metadata.report.decodedBytes,
        missing,
        ambiguous,
      };
    },
    { png, fbx: texturedFbx },
  );
  expect(companion.sources).toBe(2);
  expect(companion.decoded).toBeGreaterThan(36);
  expect(companion.missing).toBe(true);
  expect(companion.ambiguous).toBe(true);

  expect(errors).toEqual([]);
  console.log("PASS asset worker/cache/race/cancellation/FBX:", JSON.stringify(result));
  // User-visible import and reimport, not only service API calls.
  await page.goto(base + "/");
  await enterEditor(page);
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  const chooser = page.locator('input[accept=".glb,.fbx,.png,.jpg,.jpeg"]');
  await chooser.setInputFiles({
    name: "triangle.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from(triangle()),
  });
  await expect(page.locator(".statusbar")).toContainText("Imported triangle.glb");
  await expect(page.getByRole("button", { name: "Reimport triangle.glb" })).toBeEnabled();
  page.on("dialog", (d) => void d.accept());
  await page.getByRole("button", { name: "Reimport triangle.glb" }).click();
  await chooser.setInputFiles({
    name: "triangle.glb",
    mimeType: "model/gltf-binary",
    buffer: Buffer.from(triangle(1)),
  });
  await expect(page.getByRole("dialog", { name: "Review reimport" })).toBeVisible();
  await page.getByRole("button", { name: "Apply reimport", exact: true }).click();
  await expect(page.locator(".statusbar")).toContainText("Reimported triangle.glb");
  expect(errors).toEqual([]);
  console.log("PASS editor import/reimport UI");
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  await page.evaluate(async () => {
    const path = "/packages/assets/src/budget.ts",
      { assetMemory } = await import(path);
    const reservation = assetMemory.reserve(
      assetMemory.snapshot.limit - assetMemory.snapshot.used,
      "editor-fault-injection",
    );
    Object.assign(window, { releaseTestPressure: () => reservation.release() });
  });
  await page.getByRole("button", { name: "box PRIMITIVE · ADD", exact: true }).click();
  await expect(page.getByRole("button", { name: "Retry scene load", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeDisabled();
  await expect(page.getByText("3D renderer unavailable", { exact: false })).toHaveCount(0);
  await page.evaluate(() =>
    (window as unknown as { releaseTestPressure: () => void }).releaseTestPressure(),
  );
  await page.getByRole("button", { name: "Retry scene load", exact: true }).click();
  await expect(page.getByRole("button", { name: "Play scene", exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
  console.log(
    "PASS editor memory rejection retains renderer, prevents stale Play, and retries successfully",
  );
} finally {
  await browser.close();
}
