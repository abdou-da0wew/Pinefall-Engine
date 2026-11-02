import { resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const port = Number(process.env.PORT ?? 4175);
Bun.serve({
  hostname: "0.0.0.0",
  port,
  async fetch(request) {
    try {
      let path = decodeURIComponent(new URL(request.url).pathname);
      if (path.endsWith("/")) path += "index.html";
      const target = resolve(root, "." + path);
      if (!target.startsWith(root.endsWith(sep) ? root : root + sep))
        return new Response("Forbidden", { status: 403 });
      const file = Bun.file(target);
      if (!(await file.exists())) return new Response("Not found", { status: 404 });
      return new Response(file, { headers: { "X-Content-Type-Options": "nosniff" } });
    } catch {
      return new Response("Bad request", { status: 400 });
    }
  },
});
console.log(`Nightfall Keep: http://localhost:${port}`);
