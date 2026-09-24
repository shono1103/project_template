import { createReadStream, existsSync, statSync } from "node:fs";
import { dirname, extname, join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import Koa from "koa";

const distDir = resolve(dirname(fileURLToPath(import.meta.url)), "dist");
const mimeTypes = { ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

export async function startServer({ projectDir, port }) {
  const dbPath = resolve(projectDir, "project.sqlite");
  if (!existsSync(dbPath)) throw new Error(`${dbPath} がありません。先に raprid init を実行してください。`);
  if (!existsSync(join(distDir, "index.html"))) throw new Error("Webアプリのビルドが配布パッケージにありません。再インストールしてください。");

  const db = new DatabaseSync(dbPath, { readOnly: true });
  try {
    const version = db.prepare("PRAGMA user_version").get().user_version;
    if (version !== 1) throw new Error(`未対応のSQLiteスキーマです: ${version}`);
    for (const name of ["cases", "tasks", "qas"]) db.prepare(`SELECT count(*) FROM ${name}`).get();
  } catch (error) {
    db.close();
    throw error;
  }

  const app = new Koa();
  app.use(async (ctx) => {
    if (ctx.method !== "GET" && ctx.method !== "HEAD") { ctx.status = 405; return; }
    if (ctx.path === "/api/status") {
      ctx.body = {
        database: "project.sqlite",
        schemaVersion: db.prepare("PRAGMA user_version").get().user_version,
        counts: Object.fromEntries(["cases", "tasks", "qas"].map((name) => [name, db.prepare(`SELECT count(*) AS count FROM ${name}`).get().count])),
      };
      return;
    }
    if (ctx.path.startsWith("/api/")) { ctx.status = 404; return; }
    if (ctx.path.startsWith("/assets/")) {
      const assetPath = resolve(distDir, `.${ctx.path}`);
      if (!assetPath.startsWith(distDir + sep) || !existsSync(assetPath) || !statSync(assetPath).isFile()) { ctx.status = 404; return; }
      ctx.type = mimeTypes[extname(assetPath)] ?? "application/octet-stream";
      ctx.body = createReadStream(assetPath);
      return;
    }
    ctx.type = "html";
    ctx.body = createReadStream(join(distDir, "index.html"));
  });

  return await new Promise((resolveServer, reject) => {
    const server = app.listen(port, "127.0.0.1");
    server.once("error", (error) => { db.close(); reject(error); });
    server.once("listening", () => {
      server.once("close", () => db.close());
      console.log(`raprid: http://127.0.0.1:${port}`);
      resolveServer(server);
    });
  });
}
