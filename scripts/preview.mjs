import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../examples/counter-themed");
const port = Number(process.env.PORT || 44731);
const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

function resolveFile(urlPath) {
  const clean = path.normalize(urlPath).replace(/^[/\\]+/, "");
  if (!clean || clean === "." || clean.startsWith("..") || path.isAbsolute(clean)) return null;
  const candidates = [path.join(root, "public", clean), path.join(root, clean)];
  return candidates.find((file) => {
    const relative = path.relative(root, file);
    return relative && !relative.startsWith("..") && fs.existsSync(file) && fs.statSync(file).isFile();
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const pathname = url.pathname === "/" ? "/preview/index.html" : url.pathname;
  const file = resolveFile(pathname);
  if (!file) {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
    return;
  }
  res.writeHead(200, { "Content-Type": types[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Shift counter preview http://127.0.0.1:${port}`);
});
