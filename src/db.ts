import { readFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaMssql } from "@prisma/adapter-mssql";
import { Prisma, PrismaClient } from "@prisma/client";

const ENV_KEYS = new Set(["DATABASE_URL", "EXCHANGE_KEY", "PORT", "DB_USER", "DB_PASSWORD"]);

function loadEnv(file: string) {
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch (err) {
    const code = err && typeof err === "object" && "code" in err ? String(err.code) : "";
    if (code === "ENOENT") return;
    throw err;
  }

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!ENV_KEYS.has(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (value.length >= 2) {
      const first = value[0];
      const last = value[value.length - 1];
      if ((first === '"' || first === "'") && first === last) value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function decodePart(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function sqlConfig(url: string | undefined) {
  const fail = (message: string): never => {
    console.error(message);
    throw new Error(message);
  };
  if (!url || !url.startsWith("sqlserver://")) {
    return fail("DATABASE_URL должен начинаться с sqlserver://");
  }

  const rest = url.slice("sqlserver://".length);
  const splitAt = rest.indexOf(";");
  const hostPart = splitAt === -1 ? rest : rest.slice(0, splitAt);
  const paramPart = splitAt === -1 ? "" : rest.slice(splitAt + 1);
  const params = new Map<string, string>();
  for (const piece of paramPart.split(";")) {
    if (!piece) continue;
    const eq = piece.indexOf("=");
    if (eq <= 0) continue;
    params.set(piece.slice(0, eq).trim().toLowerCase(), piece.slice(eq + 1).trim());
  }

  const colon = hostPart.lastIndexOf(":");
  const server = (colon === -1 ? hostPart : hostPart.slice(0, colon)).trim();
  const port = colon === -1 ? 1433 : Number(hostPart.slice(colon + 1));
  const database = params.get("database") || params.get("initial catalog") || "";
  const user = process.env.DB_USER || decodePart(params.get("user") || params.get("username") || params.get("uid") || "");
  const password = process.env.DB_PASSWORD || decodePart(params.get("password") || params.get("pwd") || "");
  const encryptRaw = (params.get("encrypt") || "").toLowerCase();
  const trustRaw = (params.get("trustservercertificate") || "").toLowerCase();
  const encrypt = encryptRaw === "true" || encryptRaw === "yes" || encryptRaw === "1";
  const trustServerCertificate = trustRaw !== "false" && trustRaw !== "no" && trustRaw !== "0";

  if (!server || !database) return fail("В DATABASE_URL нет хоста или базы SQL Server.");
  if (!Number.isInteger(port) || port <= 0) return fail("В DATABASE_URL указан неверный порт SQL Server.");
  if (!user || !password) {
    return fail("Нет пользователя или пароля SQL Server. Задайте DB_USER и DB_PASSWORD либо user и password в DATABASE_URL.");
  }

  return { server, port, database, user, password, encrypt, trustServerCertificate };
}

function errorText(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

function driverDetail(err: unknown) {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = err;
  while (current && typeof current === "object" && !seen.has(current)) {
    seen.add(current);
    const record = current as {
      number?: unknown;
      code?: unknown;
      message?: unknown;
      originalError?: unknown;
      cause?: unknown;
    };
    const bits: string[] = [];
    if (record.number != null) bits.push(`number=${String(record.number)}`);
    if (record.code != null && String(record.code) !== String(record.number)) bits.push(`code=${String(record.code)}`);
    if (typeof record.message === "string" && record.message) bits.push(record.message);
    if (bits.length) parts.push(bits.join(" "));
    current = record.originalError ?? record.cause;
  }
  return parts.join(" | ") || errorText(err);
}

loadEnv(join(__dirname, "..", ".env"));

const sql = sqlConfig(process.env.DATABASE_URL);
const poolLabel = `${sql.server}:${sql.port} ${sql.database} user ${sql.user}`;

const adapter = new PrismaMssql(
  {
    server: sql.server,
    port: sql.port,
    database: sql.database,
    user: sql.user,
    password: sql.password,
    options: {
      encrypt: sql.encrypt,
      trustServerCertificate: sql.trustServerCertificate,
    },
  },
  {
    onPoolError(err) {
      console.error(`[pool] error ${poolLabel}: ${driverDetail(err)}`);
    },
    onConnectionError(err) {
      console.error(`[pool] connection ${poolLabel}: ${driverDetail(err)}`);
    },
  },
);

export const prisma = new PrismaClient({ adapter });

console.log(
  `[pool] connecting ${poolLabel} passwordLength=${sql.password.length} passwordHasAt=${sql.password.includes("@")}`,
);
void prisma.$connect().then(
  () => console.log(`[pool] connected ${poolLabel}`),
  (err: unknown) => console.error(`[pool] connect failed ${poolLabel}: ${driverDetail(err)}`),
);
export type Tx = Prisma.TransactionClient;
