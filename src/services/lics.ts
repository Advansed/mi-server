import { findLogin } from "../auth";
import { prisma } from "../db";
import { asBuffer } from "../guid";
import { accountByCode, accountsByIds, licIdByCode } from "../sql/vesta";

export async function getLic(params: Record<string, unknown>) {
  if (params.token == null) return { success: false, message: "Неверный токен" };
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Неверный токен" };

  const code = params.code ?? params.lc;
  if (code == null || String(code) === "") {
    return { success: false, message: "Не указан код лицевого счета" };
  }

  try {
    const data = await accountByCode(String(code), "uniq");
    if (!data) return { success: false, message: "Лицевой счет с указанным кодом не найден" };
    return { success: true, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, message };
  }
}

export async function getLics(params: Record<string, unknown>) {
  if (params.token == null) return { success: false, message: "Токен не передан или некорректен" };
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Неверный токен" };

  const rows = await prisma.t_lics.findMany({ where: { ownerId: user.id } });
  if (rows.length === 0) return { success: true, data: [] };

  try {
    const data = await accountsByIds(rows.map((row) => asBuffer(row.id)));
    return { error: false, data };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: true, message: `SQL: ${message}` };
  }
}

export async function addLic(params: Record<string, unknown>) {
  if (params.token == null || params.lc == null) {
    return { success: false, message: "Не передан токен или лицевой счет" };
  }
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Неверный токен" };

  const lc = String(params.lc);
  const id = await licIdByCode(lc);
  if (!id) return { success: false, message: "Лицевой счет не найден" };

  const exists = await prisma.t_lics.findFirst({ where: { id, ownerId: user.id } });
  if (exists) return { success: false, message: "Лицевой счет уже привязан к этому аккаунту" };

  try {
    await prisma.t_lics.create({ data: { id, ownerId: user.id, code: lc } });
    return { success: true, message: "Лицевой счет успешно добавлен" };
  } catch {
    return { success: false, message: "Ошибка добавления: лицевой счет уже существует или заблокирован" };
  }
}

export async function delLic(params: Record<string, unknown>) {
  const user = await findLogin(params.token);
  if (!user) return { success: false, message: "Не верный токен" };

  const lc = params.lc == null ? "" : String(params.lc);
  const found = await prisma.t_lics.findFirst({ where: { code: lc, ownerId: user.id } });
  if (!found) {
    return { success: false, message: "Лицевой счет не найден или у вас нет прав на его удаление" };
  }

  const removed = await prisma.t_lics.deleteMany({ where: { code: lc, ownerId: user.id } });
  if (removed.count > 0) return { success: true, message: "Лицевой счет удален" };
  return { success: false, message: "Ошибка при удалении лицевого счета" };
}
