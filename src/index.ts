import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { describeDbError } from "./db";
import { toJsonValue } from "./json";
import { dispatch } from "./routes";
import { attach } from "./socket";

const PORT = Number(process.env.PORT || 3060);
const BODY_LIMIT = 50 * 1024 * 1024;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-exchange-key",
};

function send(res: ServerResponse, status: number, body: unknown, text?: string) {
  if (text != null) {
    res.writeHead(status, { ...CORS, "Content-Type": "text/plain; charset=utf-8" });
    res.end(text);
    return;
  }
  res.writeHead(status, { ...CORS, "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(toJsonValue(body)));
}

async function readBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > BODY_LIMIT) throw new Error("payload too large");
    chunks.push(buf);
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  return JSON.parse(raw) as unknown;
}

function queryParams(url: URL) {
  const params: Record<string, unknown> = {};
  url.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  return params;
}

function logText(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(toJsonValue(value));
  return text.length > 4000 ? `${text.slice(0, 4000)}… (${text.length})` : text;
}

async function onRequest(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url || "/", "http://localhost");
  if (url.pathname.startsWith("/socket.io")) return;

  if (req.method === "OPTIONS") {
    res.writeHead(204, CORS);
    res.end();
    return;
  }

  if (req.method !== "GET" && req.method !== "POST") {
    send(res, 404, { error: true, message: "Маршрут не найден" });
    return;
  }

  try {
    const params =
      req.method === "GET" ? queryParams(url) : ((await readBody(req)) as Record<string, unknown>);
    const record = params && typeof params === "object" && !Array.isArray(params) ? params : { data: params };
    console.log("[request]", req.method, url.pathname, logText(record));
    const header = req.headers["x-exchange-key"];
    const exchangeHeader = Array.isArray(header) ? header[0] : header;
    const reply = await dispatch(url.pathname, record, exchangeHeader);
    console.log("[response]", reply.status, url.pathname, logText(reply.text ?? reply.body));
    send(res, reply.status, reply.body, reply.text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message === "payload too large" ? 413 : err instanceof SyntaxError || message.includes("JSON") ? 400 : 500;
    const body = {
      success: false,
      message: status === 400 ? "Некорректный JSON" : status === 413 ? message : describeDbError(err),
    };
    console.error("[response]", status, url.pathname, logText(body));
    send(res, status, body);
  }
}

export function start() {
  const server = createServer((req, res) => {
    void onRequest(req, res);
  });
  attach(server);
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

start();
