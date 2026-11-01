import { parentPort, workerData } from "node:worker_threads";
import { DiskWorkspace } from "../packages/project/src/disk-workspace";
import { packFolder, unpackFolder } from "../packages/project/src/folder-archive";
const controller = new AbortController();
parentPort?.on("message", (message) => {
  if (message === "cancel") controller.abort(Error("Archive operation cancelled"));
});
const disk = await DiskWorkspace.open(workerData.root);
try {
  const result =
    workerData.mode === "pack"
      ? await packFolder(disk, workerData.archive, controller.signal)
      : await unpackFolder(workerData.archive, disk, controller.signal);
  parentPort?.postMessage({ result });
} catch (error) {
  parentPort?.postMessage({ error: String(error) });
} finally {
  await disk.close();
  parentPort?.close();
}
