import { createServer } from "vite";
const server = await createServer({
  server: { host: "0.0.0.0", port: 5175, strictPort: true, allowedHosts: true },
  plugins: [
    {
      name: "plan02-lab-entry",
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (request.url === "/") {
            response.statusCode = 302;
            response.setHeader("Location", "/tests/animation-audio.html?character=1");
            response.end();
            return;
          }
          next();
        });
      },
    },
  ],
});
await server.listen();
server.printUrls();
