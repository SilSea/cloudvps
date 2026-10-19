const html = Bun.file(import.meta.dir + "/api-test.html");
const API_BASE = process.env.API_URL ?? "http://localhost:3000";

Bun.serve({
  port: 8080,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/api") || url.pathname === "/health") {
      const proxyUrl = API_BASE + url.pathname + url.search;
      const proxyReq = new Request(proxyUrl, {
        method: req.method,
        headers: req.headers,
        body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      });
      try {
        return await fetch(proxyReq);
      } catch {
        return new Response(JSON.stringify({ error: "API unreachable" }), {
          status: 502,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(await html.text(), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  },
});

console.log(`API Tester  →  http://localhost:8080`);
console.log(`Proxying to →  ${API_BASE}`);
