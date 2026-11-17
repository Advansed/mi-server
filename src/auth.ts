import { prisma } from "./db";
import { isGuid } from "./guid";

export type LoginRow = NonNullable<Awaited<ReturnType<typeof findLogin>>>;

export async function findLogin(token: unknown) {
  if (!isGuid(token)) return null;
  return prisma.t_logins.findFirst({ where: { token: token.trim() } });
}
