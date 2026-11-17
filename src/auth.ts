import { prisma } from "./db";
import { isGuid } from "./guid";

export type LoginRow = NonNullable<Awaited<ReturnType<typeof findLogin>>>;

export async function findLogin(token: unknown) {
  if (!isGuid(token)) {
    console.log("[auth] token rejected: не GUID");
    return null;
  }
  const user = await prisma.t_logins.findFirst({ where: { token: token.trim() } });
  if (!user) console.log("[auth] token rejected: не найден");
  else console.log(`[auth] token ok user=${user.name ?? ""}`);
  return user;
}
