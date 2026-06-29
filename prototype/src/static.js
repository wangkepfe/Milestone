// Tiny dependency-free static file server for the public/ design prototypes.
// Defaults "/" to index.html (the Milestone menu).
//   node prototype/src/static.js [port]
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = fileURLToPath(new URL("../public", import.meta.url));
const SRC = fileURLToPath(new URL("../src", import.meta.url));
const ENGINE_FILES = new Set(["engine.js", "cards.js", "bot.js"]); // shared rules engine, served to the client
const TYPES = { ".html":"text/html; charset=utf-8", ".js":"text/javascript", ".css":"text/css",
  ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png", ".jpg":"image/jpeg" };

const server = http.createServer((req, res) => {
  let rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (rel === "/" || rel === "") rel = "/index.html";
  let base = ROOT;
  if (rel.startsWith("/engine/")) {              // /engine/<file> -> ../src/<file> (whitelisted)
    const name = rel.slice("/engine/".length);
    if (!ENGINE_FILES.has(name)) { res.writeHead(404); return res.end("not found"); }
    base = SRC; rel = "/" + name;
  }
  const file = path.join(base, path.normalize(rel));
  if (!file.startsWith(base)) { res.writeHead(403); return res.end("forbidden"); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404, { "content-type": "text/plain" }); return res.end("404 " + rel); }
    res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(buf);
  });
});

const port = parseInt(process.argv[2] || "8088", 10);
server.listen(port, () => console.log(`static design server on http://127.0.0.1:${port}/ (broadcast.html)`));
