import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";

const ENV_KEYS = new Set(["DATABASE_URL", "EXCHANGE_KEY", "PORT"]);

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

function sqlUser(url: string | undefined) {
  if (!url) return "";
  const match = /(?:^|;)(?:user|username|uid)\s*=\s*([^;]*)/i.exec(url);
  return match?.[1]?.trim() ?? "";
}

loadEnv(join(__dirname, "..", ".env"));

const databaseUrl = process.env.DATABASE_URL;
const sqlLogin = sqlUser(databaseUrl);
if (!sqlLogin) {
  const message =
    "В DATABASE_URL нет пользователя SQL Server. Проверьте .env рядом с приложением: user=..., пароль с символом @ записывается как %40.";
  console.error(message);
  throw new Error(message);
}

export const prisma = new PrismaClient();
export type Tx = Prisma.TransactionClient;
