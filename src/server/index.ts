import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { Lab, LabError, LiveProvider, DemoProvider, safeError } from "./lab.js";
import type { Mode } from "../shared/lesson.js";
try {
  process.loadEnvFile();
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
}
const liveReady = Boolean(
  process.env.ANTHROPIC_API_KEY && process.env.MANAGED_SESSION_ID,
);
const lab = new Lab(
  {
    demo: new DemoProvider(),
    ...(liveReady
      ? {
          live: new LiveProvider(
            new Anthropic({ maxRetries: 0, timeout: 45000 }),
          ),
        }
      : {}),
  },
  process.env.MANAGED_SESSION_ID,
);
const vite = process.argv.includes("--production")
  ? undefined
  : await (
      await import("vite")
    ).createServer({ server: { middlewareMode: true }, appType: "spa" });
function json(res: ServerResponse, status: number, data: unknown) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}
function mode(value: unknown): Mode {
  if (value !== "demo" && value !== "live")
    throw new LabError("Choose demo or live mode.");
  return value;
}
async function body(req: IncomingMessage) {
  let text = "";
  for await (const chunk of req) {
    text += chunk;
    if (Buffer.byteLength(text) > 16_000)
      throw new LabError("Request too large.", 413);
  }
  const value = JSON.parse(text || "{}");
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new LabError("Expected a JSON object.");
  return value as Record<string, unknown>;
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname.startsWith("/api/")) {
    try {
      if (
        req.method === "POST" &&
        req.headers.origin &&
        req.headers.origin !== `http://${req.headers.host}`
      )
        return json(res, 403, {
          error: "Cross-origin requests are not allowed.",
        });
      if (req.method === "GET" && url.pathname === "/api/lesson")
        return json(res, 200, { liveReady });
      if (req.method === "GET" && url.pathname === "/api/state")
        return json(res, 200, lab.states[mode(url.searchParams.get("mode"))]);
      if (req.method !== "POST")
        return json(res, 404, { error: "Endpoint not found." });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return json(res, 415, { error: "Use application/json." });
      const data = await body(req),
        m = mode(data.mode),
        sessionId = String(data.sessionId ?? ""),
        threadId = String(data.threadId ?? "");
      if (url.pathname === "/api/reset-demo") {
        if (m !== "demo")
          throw new LabError("Demo reset does not apply to live data.");
        return json(res, 200, lab.resetDemo());
      }
      if (url.pathname === "/api/stop") {
        lab.stop(m, sessionId, threadId);
        return json(res, 200, { closed: true });
      }
      if (url.pathname === "/api/watch") {
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-store",
          Connection: "keep-alive",
        });
        const disconnect = () => lab.stop(m, sessionId, threadId);
        res.on("close", disconnect);
        const heartbeat = setInterval(() => {
          if (!res.destroyed) res.write(": heartbeat\n\n");
        }, 15000);
        try {
          await lab.watch(m, sessionId, threadId, (packet) => {
            if (!res.destroyed)
              res.write(`data: ${JSON.stringify(packet)}\n\n`);
          });
        } finally {
          clearInterval(heartbeat);
          res.off("close", disconnect);
        }
        res.end();
        return;
      }
      if (url.pathname !== "/api/action")
        return json(res, 404, { error: "Endpoint not found." });
      if (data.action === "list")
        return json(res, 200, await lab.list(m, sessionId, data));
      if (data.action === "retrieve")
        return json(res, 200, await lab.details(m, sessionId, threadId));
      if (data.action === "history")
        return json(res, 200, await lab.history(m, sessionId, threadId));
      if (data.action === "archive")
        return json(
          res,
          200,
          await lab.archive(m, sessionId, threadId, data.confirm),
        );
      throw new LabError("Choose a supported thread operation.");
    } catch (e) {
      if (res.headersSent)
        res.end(
          `data: ${JSON.stringify({ kind: "done", outcome: "error", text: safeError(e) })}\n\n`,
        );
      else json(res, 400, { error: safeError(e) });
    }
    return;
  }
  if (vite) return vite.middlewares(req, res);
  const root = resolve("dist/client");
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return json(res, 400, { error: "Invalid URL encoding." });
  }
  let file = resolve(root, `.${path}`);
  if (file !== root && !file.startsWith(root + sep))
    return json(res, 403, { error: "Invalid path." });
  if (!extname(file)) file = resolve(root, "index.html");
  try {
    const content = await readFile(file);
    res.writeHead(200, {
      "Content-Type":
        (
          {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".png": "image/png",
          } as Record<string, string>
        )[extname(file)] ?? "application/octet-stream",
    });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
server.listen(Number(process.env.PORT ?? 4326), "127.0.0.1", () =>
  console.log(
    `Project Review Explorer: http://127.0.0.1:${process.env.PORT ?? 4326}`,
  ),
);
