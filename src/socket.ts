import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { listInvoices } from "./services/orders";
import { listWorkers } from "./services/workers";

let io: Server | null = null;
const tokens = new Map<string, string>();

const workersJob = { running: false, pending: false };
const invoicesJob = { running: false, pending: false };

type Job = { running: boolean; pending: boolean };

export function attach(httpServer: HttpServer) {
  io = new Server(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth && socket.handshake.auth.token;
    if (!token || typeof token !== "string") {
      next(new Error("token required"));
      return;
    }
    socket.data.token = token;
    next();
  });

  io.on("connection", (socket) => {
    tokens.set(socket.id, socket.data.token as string);
    void sendSnapshots(socket);
    socket.on("disconnect", () => {
      tokens.delete(socket.id);
    });
  });
}

function pickToken() {
  const first = tokens.values().next();
  return first.done ? null : first.value;
}

async function publishList(
  event: "workers" | "invoices",
  read: (token: string) => Promise<{ success?: boolean }>,
  job: Job,
) {
  if (!io || tokens.size === 0) return;
  const current = io;
  if (job.running) {
    job.pending = true;
    return;
  }

  job.running = true;
  try {
    do {
      job.pending = false;
      const token = pickToken();
      if (!token) break;
      try {
        const body = await read(token);
        if (body && body.success !== false) current.emit(event, body);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error("[socket]", event, message);
      }
    } while (job.pending && tokens.size > 0);
  } finally {
    job.running = false;
  }
}

export function publishWorkers() {
  return publishList("workers", listWorkers, workersJob);
}

export function publishInvoices() {
  return publishList("invoices", listInvoices, invoicesJob);
}

async function sendSnapshots(socket: { data: { token?: string }; connected: boolean; emit: (event: string, body: unknown) => void }) {
  const token = socket.data.token;
  if (!token) return;
  try {
    const [workers, invoices] = await Promise.all([listWorkers(token), listInvoices(token)]);
    if (!socket.connected) return;
    if (workers && workers.success !== false) socket.emit("workers", workers);
    if (invoices && invoices.success !== false) socket.emit("invoices", invoices);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[socket] snapshot", message);
  }
}
