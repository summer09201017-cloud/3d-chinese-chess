// 靜態伺服 dist/,給 browser-check 用(零相依,不裝 http-server)。
// 跑法:npm run build && npm run serve   然後另一個視窗 npm run check
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
const PORT = Number(process.env.PORT || 8799);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

createServer(async (req, res) => {
  const rel = decodeURIComponent(req.url.split("?")[0]);
  const file = path.join(root, rel === "/" ? "index.html" : rel);
  try {
    const body = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(body);
  } catch {
    // SPA fallback:找不到就回首頁(和 CF Pages 的行為一致)
    try {
      res.writeHead(200, { "Content-Type": TYPES[".html"] });
      res.end(await readFile(path.join(root, "index.html")));
    } catch {
      res.writeHead(404);
      res.end("404");
    }
  }
}).listen(PORT, () => console.log(`serving dist/ on http://localhost:${PORT}`));
